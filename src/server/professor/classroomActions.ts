import { redis, type ApiRequest, type ApiResponse } from './shared.js';
import {
  normalizeProfessorClassId,
  professorCanAccessClass,
  type ProfessorClassAccess,
} from './access.js';
import { classroomSessionKey, prepareClassroomKeys } from './classroom.js';
import { commitSession, readHistory } from './sessionActions.js';

const TTL_SECONDS = 365 * 24 * 60 * 60;

const ROSTER_SAVE_SCRIPT = `
local currentRaw = redis.call('GET', KEYS[1])
local current = {}
if currentRaw then
  local ok, decoded = pcall(cjson.decode, currentRaw)
  if ok and type(decoded) == 'table' then current = decoded end
end
local currentVersion = tonumber(current.version) or 0
local expectedVersion = tonumber(ARGV[1]) or 0
if currentVersion ~= expectedVersion then
  return cjson.encode({ ok = false, roster = current })
end
local next = cjson.decode(ARGV[2])
local version = math.max(tonumber(ARGV[3]) or 0, currentVersion + 1)
next.version = version
next.updatedAt = version
redis.call('SET', KEYS[1], cjson.encode(next), 'EX', tonumber(ARGV[4]))
return cjson.encode({ ok = true, roster = next })
`;

const LIVE_MERGE_SCRIPT = `
local currentRaw = redis.call('GET', KEYS[1])
local current = {}
if currentRaw then
  local ok, decoded = pcall(cjson.decode, currentRaw)
  if ok and type(decoded) == 'table' then current = decoded end
end
local currentRound = math.max(1, math.floor(tonumber(current.roundId) or 1))
local reset = ARGV[1] == '1'
local requestedRound = math.max(0, math.floor(tonumber(ARGV[2]) or 0))
if not reset and requestedRound > 0 and requestedRound ~= currentRound then
  current.roundId = currentRound
  current.answeredIds = redis.call('SMEMBERS', KEYS[2])
  return cjson.encode({ stale = true, live = current })
end
if reset then
  redis.call('DEL', KEYS[2])
  currentRound = currentRound + 1
else
  local ids = cjson.decode(ARGV[7])
  for _, id in ipairs(ids) do redis.call('SADD', KEYS[2], id) end
  if #ids > 0 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[8])) end
end
local maxStudentIndex = math.max(0, math.floor(tonumber(ARGV[5]) or 0))
local studentCount = maxStudentIndex + 1
if not reset and studentCount > 0 and redis.call('SCARD', KEYS[2]) >= studentCount then
  redis.call('DEL', KEYS[2])
  currentRound = currentRound + 1
end
local studentIndex = tonumber(current.currentStudentIndex) or 0
if ARGV[3] ~= '' then studentIndex = tonumber(ARGV[3]) or studentIndex end
studentIndex = math.min(maxStudentIndex, math.max(0, math.floor(studentIndex)))
local questionIndex = tonumber(current.questionIndex) or 0
if ARGV[4] ~= '' then questionIndex = tonumber(ARGV[4]) or questionIndex end
questionIndex = math.min(100000, math.max(0, math.floor(questionIndex)))
local version = math.max(tonumber(ARGV[6]) or 0, (tonumber(current.version) or 0) + 1)
local live = {
  currentStudentIndex = studentIndex,
  questionIndex = questionIndex,
  roundId = currentRound,
  answeredIds = redis.call('SMEMBERS', KEYS[2]),
  version = version,
  updatedAt = version
}
redis.call('SET', KEYS[1], cjson.encode(live), 'EX', tonumber(ARGV[8]))
return cjson.encode({ stale = false, live = live })
`;

const PRESENT_SET_SCRIPT = `
redis.call('DEL', KEYS[1])
local count = 0
for i = 2, #ARGV do
  redis.call('SADD', KEYS[1], ARGV[i])
  count = count + 1
end
if count > 0 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return count
`;

const ANSWER_STATUS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local current = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then current = decoded end
end
if ARGV[2] == 'correct' or ARGV[2] == 'incorrect' then
  current[ARGV[1]] = ARGV[2]
else
  current[ARGV[1]] = nil
end
local encoded = cjson.encode(current)
if encoded == '[]' then encoded = '{}' end
redis.call('SET', KEYS[1], encoded, 'EX', tonumber(ARGV[3]))
return encoded
`;

/**
 * Ajoute une ligne à l'historique de séance par le même compare-and-swap que
 * les autres écritures de séance. L'ancienne écriture `SET` partait d'une copie
 * lue plusieurs secondes plus tôt : elle pouvait effacer l'activité que la
 * tablette venait d'envoyer entre-temps (positions, traits, quiz).
 */
async function appendSessionHistory(
  sessionKey: string,
  classId: string,
  entry: { type: string; label: string },
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = parseObject(await redis.get(sessionKey), {});
    if (normalizeProfessorClassId(current.classId) !== classId) return;
    const history = readHistory(current);
    history.push({ at: Date.now(), ...entry });
    if (await commitSession(sessionKey, current, { ...current, history, updatedAt: Date.now() })) return;
  }
}

export type ProfessorClassroomAction =
  | 'classroom-load' | 'live-load' | 'roster-save' | 'live-update'
  | 'answer-status' | 'present-set' | 'present-get';

const ACTIONS = new Set<unknown>([
  'classroom-load', 'live-load', 'roster-save', 'live-update',
  'answer-status', 'present-set', 'present-get',
]);

export function isProfessorClassroomAction(action: unknown): action is ProfessorClassroomAction {
  return ACTIONS.has(action);
}

function parseObject(raw: unknown, fallback: Record<string, unknown>): Record<string, any> {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : fallback;
  } catch { return fallback; }
}

export async function handleProfessorClassroomAction(
  action: ProfessorClassroomAction,
  req: ApiRequest,
  res: ApiResponse,
  professor: { phone: string },
  access: ProfessorClassAccess,
  classId: string,
) {
  if (!classId) return res.status(400).json({ error: 'class_id_required' });
  if (!professorCanAccessClass(access, classId)) {
    return res.status(403).json({ error: 'professor_class_access_denied' });
  }
  let presentSession: Record<string, any> | null = null;
  if (action === 'present-set') {
    presentSession = parseObject(await redis.get(classroomSessionKey(professor.phone)), {});
    const sessionClassId = normalizeProfessorClassId(presentSession.classId);
    if (sessionClassId && sessionClassId !== classId && (presentSession.status === 'running' || presentSession.status === 'paused')) {
      return res.status(409).json({ error: 'active_session_class_conflict' });
    }
  }
  const keys = await prepareClassroomKeys(professor.phone, classId);

  if (action === 'classroom-load') {
    const sinceRoster = Math.max(0, Math.trunc(Number(req.body?.sinceRoster) || 0));
    const sinceLive = Math.max(0, Math.trunc(Number(req.body?.sinceLive) || 0));
    const [rosterRaw, liveRaw] = await Promise.all([redis.get(keys.roster), redis.get(keys.live)]);
    const roster = parseObject(rosterRaw, { title: '', students: [], version: 0 });
    const live = parseObject(liveRaw, { currentStudentIndex: 0, questionIndex: 0, roundId: 1, version: 0 });
    const rosterVersion = Math.max(0, Math.trunc(Number(roster.version) || 0));
    const liveVersion = Math.max(0, Math.trunc(Number(live.version) || 0));
    if (sinceRoster > 0 && sinceLive > 0 && rosterVersion <= sinceRoster && liveVersion <= sinceLive) {
      return res.status(200).json({ unchanged: true });
    }
    const answeredRaw = await redis.smembers(keys.answered) as string[];
    const validIds = new Set(Array.isArray(roster.students) ? roster.students.map((s: any) => String(s.id)) : []);
    const answeredIds = Array.from(new Set([
      ...answeredRaw, ...(Array.isArray(live.answeredIds) ? live.answeredIds : []),
    ].map(String))).filter(id => validIds.has(id)).slice(0, 120);
    const answerStatus = parseObject(await redis.get(keys.answerStatus), {});
    return res.status(200).json({
      unchanged: false,
      roster,
      live: { ...live, roundId: Math.max(1, Math.trunc(Number(live.roundId) || 1)), answeredIds, answerStatus },
    });
  }

  if (action === 'live-load') {
    const since = Math.max(0, Math.trunc(Number(req.body?.since) || 0));
    const live = parseObject(await redis.get(keys.live), { currentStudentIndex: 0, questionIndex: 0, roundId: 1, version: 0 });
    if (since > 0 && Math.max(0, Math.trunc(Number(live.version) || 0)) <= since) {
      return res.status(200).json({ unchanged: true });
    }
    const answeredIds = Array.from(new Set((await redis.smembers(keys.answered) as string[]).map(String))).slice(0, 120);
    const answerStatus = parseObject(await redis.get(keys.answerStatus), {});
    return res.status(200).json({
      unchanged: false,
      live: { ...live, roundId: Math.max(1, Math.trunc(Number(live.roundId) || 1)), answeredIds, answerStatus },
    });
  }

  if (action === 'answer-status') {
    const studentId = String(req.body?.studentId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    if (!studentId) return res.status(400).json({ error: 'Invalid studentId' });
    const nextStatus = req.body?.status === 'correct' || req.body?.status === 'incorrect' ? req.body.status : '';
    const updatedRaw = await redis.eval(ANSWER_STATUS_SCRIPT, [keys.answerStatus], [
      studentId, nextStatus, String(TTL_SECONDS),
    ]);
    const current = parseObject(updatedRaw, {});
    return res.status(200).json({ success: true, answerStatus: current });
  }

  if (action === 'present-set') {
    const studentIds = Array.isArray(req.body?.studentIds)
      ? req.body.studentIds.map((id: unknown) => String(id).replace(/[^a-z0-9_-]/gi, '').slice(0, 80)).filter(Boolean).slice(0, 120)
      : [];
    const sessionClassId = normalizeProfessorClassId((presentSession || {}).classId);
    // Remplacement en un seul script : plus de fenêtre où l'appel est vide ou
    // partiel pour la notification « absents » ou l'archive, et une commande
    // au lieu d'une par élève (jusqu'à 120).
    await redis.eval(PRESENT_SET_SCRIPT, [keys.present], [String(TTL_SECONDS), ...studentIds]);
    if (sessionClassId === classId) {
      await appendSessionHistory(keys.session, classId, {
        type: 'present',
        label: studentIds.length
          ? `${studentIds.length} élève${studentIds.length > 1 ? 's' : ''} déclaré${studentIds.length > 1 ? 's' : ''} présent${studentIds.length > 1 ? 's' : ''}`
          : 'Aucun élève déclaré présent',
      });
    }
    return res.status(200).json({ success: true, presentIds: studentIds });
  }

  if (action === 'present-get') {
    const presentIds = await redis.smembers(keys.present) as string[];
    return res.status(200).json({ presentIds: presentIds.map(String) });
  }

  if (action === 'roster-save') {
    const input = req.body?.roster;
    if (!input || !Array.isArray(input.students) || input.students.length > 120) {
      return res.status(400).json({ error: 'Invalid roster' });
    }
    const expectedVersion = Math.max(0, Math.trunc(Number(input.version) || 0));
    const seen = new Set<string>();
    const students = input.students.map((student: any, index: number) => {
      const name = String(student?.name || '').trim().slice(0, 80);
      let id = String(student?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
      if (!id || seen.has(id)) id = `student_${Date.now().toString(36)}_${index}`;
      seen.add(id);
      return { id, name };
    }).filter((student: any) => student.name);
    const draft = { title: String(input.title || '').trim().slice(0, 100), students };
    const raw = await redis.eval(ROSTER_SAVE_SCRIPT, [keys.roster], [
      String(expectedVersion), JSON.stringify(draft), String(Date.now()), String(TTL_SECONDS),
    ]);
    const atomic = parseObject(raw, { ok: false, roster: {} });
    if (!atomic.ok) return res.status(409).json({ error: 'Roster changed on another device', roster: atomic.roster });
    const answered = await redis.smembers(keys.answered) as string[];
    const activeIds = new Set(students.map((student: any) => student.id));
    const stale = answered.filter(id => !activeIds.has(id));
    if (stale.length) await redis.srem(keys.answered, ...stale);
    return res.status(200).json({ success: true, roster: atomic.roster });
  }

  if (action !== 'live-update') return res.status(400).json({ error: 'Invalid classroom action' });
  const input = req.body?.live || {};
  const roster = parseObject(await redis.get(keys.roster), { students: [] });
  const studentCount = Array.isArray(roster.students) ? roster.students.length : 0;
  const activeIds = new Set(Array.isArray(roster.students) ? roster.students.map((student: any) => String(student.id)) : []);
  const answered = Array.isArray(input.answeredIds)
    ? input.answeredIds.map((id: unknown) => String(id).replace(/[^a-z0-9_-]/gi, '').slice(0, 80)).filter(Boolean).slice(0, 120)
      .filter((id: string) => activeIds.has(id))
    : [];
  const raw = await redis.eval(LIVE_MERGE_SCRIPT, [keys.live, keys.answered], [
    input.reset === true ? '1' : '0', String(Math.max(0, Math.trunc(Number(input.roundId) || 0))),
    input.currentStudentIndex === undefined ? '' : String(input.currentStudentIndex),
    input.questionIndex === undefined ? '' : String(input.questionIndex),
    String(Math.max(0, studentCount - 1)), String(Date.now()), JSON.stringify(answered), String(TTL_SECONDS),
  ]);
  const atomic = parseObject(raw, { stale: false, live: {} });
  const live = parseObject(atomic.live, {});
  live.answeredIds = Array.isArray(live.answeredIds)
    ? live.answeredIds.map(String).filter(id => activeIds.has(id)).slice(0, 120)
    : [];
  return res.status(200).json({ success: true, stale: atomic.stale === true, live });
}
