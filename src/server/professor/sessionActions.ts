import { normalizeUrl, redis, type ApiRequest, type ApiResponse } from './shared.js';
import {
  normalizeProfessorClassId,
  professorCanAccessClass,
  type ProfessorClassAccess,
} from './access.js';
import {
  classroomSessionKey,
  classroomFocusKey,
  classroomArchiveIndexKey,
  classroomArchiveRecordKey,
  notifySessionStudents,
  prepareClassroomKeys,
} from './classroom.js';
import { readAccountsByIds } from './linkedStudents.js';

const TTL_SECONDS = 365 * 24 * 60 * 60;

// Compare et écrit dans une seule opération Redis, y compris quand deux
// mutations arrivent dans la même milliseconde. Compatible avec les anciens records.
const SESSION_CAS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local current = raw and cjson.decode(raw) or {}
if (tonumber(current.revision) or 0) ~= tonumber(ARGV[1]) or
   (tonumber(current.updatedAt) or 0) ~= tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[3], 'EX', tonumber(ARGV[4]))
return 1
`;

export async function commitSession(key: string, current: Record<string, any>, next: Record<string, any>): Promise<boolean> {
  next.revision = (Number(current.revision) || 0) + 1;
  return Number(await redis.eval(SESSION_CAS_SCRIPT, [key], [
    Number(current.revision) || 0, Number(current.updatedAt) || 0,
    JSON.stringify(next), TTL_SECONDS,
  ])) === 1;
}

export type ProfessorSessionAction =
  | 'session-set' | 'session-get' | 'session-focus' | 'session-schedule'
  | 'session-notify' | 'session-activity' | 'session-archive-list' | 'session-archive-get';

const ACTIONS = new Set<unknown>([
  'session-set', 'session-get', 'session-focus', 'session-schedule', 'session-notify', 'session-activity',
  'session-archive-list', 'session-archive-get',
]);

export function isProfessorSessionAction(action: unknown): action is ProfessorSessionAction {
  return ACTIONS.has(action);
}

function parseObject(raw: unknown, fallback: Record<string, unknown>): Record<string, any> {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : fallback;
  } catch { return fallback; }
}

export function readHistory(current: Record<string, unknown>): Array<{ at: number; type: string; label: string }> {
  return Array.isArray(current.history)
    ? (current.history as Array<{ at: number; type: string; label: string }>).slice(-99)
    : [];
}

/**
 * Écrit la classe pilotée par le professeur. Appelée par `session-focus` et par
 * tout chemin qui accepte déjà un choix explicite de classe (démarrage,
 * programmation) : la tablette n'a ainsi qu'une seule règle de suivi à lire.
 */
async function publishFocusClass(phone: string, classId: string): Promise<{ classId: string; updatedAt: number }> {
  const focus = { classId, updatedAt: Date.now() };
  await redis.set(classroomFocusKey(phone), JSON.stringify(focus), { ex: TTL_SECONDS });
  return focus;
}

async function resolvePresentNames(professorAccountId: string, presentIds: string[]): Promise<string[]> {
  const wanted = new Set(presentIds.map(String));
  if (!wanted.size) return [];
  const members = await redis.smembers(`users:prof:${professorAccountId}`) as string[];
  // Seuls les élèves réellement rattachés à ce professeur sont résolus, en une
  // commande `MGET` au lieu d'un `GET` par présent.
  const linkedPresent = members.map(String).filter(accountId => wanted.has(accountId));
  const accounts = await readAccountsByIds(linkedPresent);
  const names = new Map<string, string>();
  linkedPresent.forEach((accountId, index) => {
    names.set(accountId, String(accounts[index]?.name || accountId));
  });
  return presentIds.map(id => names.get(String(id)) || String(id));
}

async function archiveStoppedSession(professor: { accountId: string; phone: string }, current: Record<string, any>, endedAt: number) {
  const id = String(current.startedAt || endedAt);
  const classId = normalizeProfessorClassId(current.classId);
  if (!classId) return;
  const keys = await prepareClassroomKeys(professor.phone, classId);
  const presentIds = (await redis.smembers(keys.present) as string[]).map(String);
  const presentNames = await resolvePresentNames(professor.accountId, presentIds).catch(() => presentIds);
  const activity = current.activity || { exerciseIds: [], strokes: {} };
  const summary = {
    id, classId, chapterTitle: String(current.chapterTitle || ''),
    startedAt: Number(current.startedAt || endedAt), endedAt,
    exercisesCount: Array.isArray(activity.exerciseIds) ? activity.exerciseIds.length : 0,
    annotatedZones: activity.strokes && typeof activity.strokes === 'object' ? Object.values(activity.strokes).filter(value => Array.isArray(value) && value.length > 0).length : 0,
    quizAnswered: Array.isArray(activity.quiz?.history) ? activity.quiz.history.length : 0,
    presentCount: presentNames.length,
  };
  const record = { ...summary, chapterId: String(current.chapterId || ''), status: 'stopped', activity, presentNames, history: readHistory(current), updatedAt: endedAt };
  const serialized = JSON.stringify(record);
  if (serialized.length <= 900_000) await redis.set(classroomArchiveRecordKey(professor.phone, id), serialized, { ex: 180 * 24 * 60 * 60 });
  else await redis.set(classroomArchiveRecordKey(professor.phone, id), JSON.stringify({ ...record, activity: { exerciseIds: activity.exerciseIds || [], strokes: {} } }), { ex: 180 * 24 * 60 * 60 });
  const indexKey = classroomArchiveIndexKey(professor.phone);
  const existingRaw = await redis.get(indexKey);
  let existing: any[] = [];
  try { const parsed = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw; if (Array.isArray(parsed)) existing = parsed; } catch { /* empty index */ }
  const nextIndex = [summary, ...existing.filter(entry => String(entry?.id) !== id)].slice(0, 40);
  await redis.set(indexKey, JSON.stringify(nextIndex), { ex: 365 * 24 * 60 * 60 });
}

export async function handleProfessorSessionAction(
  action: ProfessorSessionAction,
  req: ApiRequest,
  res: ApiResponse,
  professor: { accountId: string; phone: string; classId: string },
  access: ProfessorClassAccess,
  requestedClassId: string,
  attempt = 0,
) {
  const sessionKey = classroomSessionKey(professor.phone);
  const retry = () => attempt < 3
    ? handleProfessorSessionAction(action, req, res, professor, access, requestedClassId, attempt + 1)
    : res.status(409).json({ error: 'session_concurrent_update' });

  if (action === 'session-archive-list') {
    const raw = await redis.get(classroomArchiveIndexKey(professor.phone));
    let archives: any[] = [];
    try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(parsed)) archives = parsed; } catch { /* empty index */ }
    return res.status(200).json({ archives: archives.filter(entry => professorCanAccessClass(access, normalizeProfessorClassId(entry?.classId))) });
  }

  if (action === 'session-archive-get') {
    const id = String(req.body?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
    if (!id) return res.status(400).json({ error: 'archive_id_required' });
    const raw = await redis.get(classroomArchiveRecordKey(professor.phone, id));
    if (!raw) return res.status(404).json({ error: 'session_archive_not_found' });
    const archive = parseObject(raw, {});
    if (!professorCanAccessClass(access, normalizeProfessorClassId(archive.classId))) return res.status(403).json({ error: 'professor_class_access_denied' });
    return res.status(200).json({ archive });
  }

  if (action === 'session-focus') {
    if (!requestedClassId) return res.status(400).json({ error: 'class_id_required' });
    if (!professorCanAccessClass(access, requestedClassId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    // La salle du niveau visé doit exister avant que la tablette n'y arrive :
    // même préparation (et même migration legacy) que les autres bascules.
    await prepareClassroomKeys(professor.phone, requestedClassId);
    const focus = await publishFocusClass(professor.phone, requestedClassId);
    return res.status(200).json({ success: true, focus });
  }

  if (action === 'session-set') {
    const status = req.body?.status;
    if (status !== undefined && !['idle', 'running', 'paused', 'stopped'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const current = parseObject(await redis.get(sessionKey), {});
    const classId = req.body?.classId !== undefined
      ? requestedClassId
      : normalizeProfessorClassId(current.classId || professor.classId);
    if (!professorCanAccessClass(access, classId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    const classChanged = req.body?.classId !== undefined && classId !== (current.classId ?? '');
    if (classChanged && (current.status === 'running' || current.status === 'paused')) {
      return res.status(409).json({ error: 'active_session_class_conflict' });
    }
    // La migration lit encore l'ancienne classe avant la bascule du pointeur.
    const classroomKeys = await prepareClassroomKeys(professor.phone, classId);
    const hasChapter = req.body?.chapterId !== undefined || req.body?.chapterTitle !== undefined;
    const chapterId = hasChapter
      ? String(req.body?.chapterId || '').trim().slice(0, 100)
      : (classChanged ? '' : (current.chapterId ?? ''));
    const chapterTitle = hasChapter
      ? String(req.body?.chapterTitle || '').trim().slice(0, 160)
      : (classChanged ? '' : (current.chapterTitle ?? ''));
    const startsNewSession = status === 'running'
      && current.status !== 'running'
      && current.status !== 'paused';
    const scheduledAt = req.body?.scheduledAt !== undefined ? Number(req.body.scheduledAt) : (current.scheduledAt ?? null);
    const meetLink = req.body?.meetLink !== undefined ? String(req.body.meetLink).trim().slice(0, 300) : (current.meetLink ?? '');
    const previousStatus = current.status || 'idle';
    const nextStatus = status || previousStatus;
    const events: Array<{ type: string; label: string }> = [];
    if (nextStatus !== previousStatus) {
      if (nextStatus === 'running') events.push({ type: 'session', label: previousStatus === 'paused' ? 'Séance reprise' : 'Séance démarrée' });
      else if (nextStatus === 'paused') events.push({ type: 'session', label: 'Séance en pause' });
      else if (nextStatus === 'stopped') events.push({ type: 'session', label: 'Séance terminée' });
    }
    if (chapterTitle && chapterTitle !== (current.chapterTitle || '')) {
      events.push({ type: 'chapter', label: `Chapitre « ${chapterTitle} » lancé` });
    }
    if (classChanged) events.push({ type: 'class', label: 'Changement de niveau actif' });
    const history = readHistory(current);
    for (const event of events) history.push({ at: Date.now(), ...event });
    const next = {
      status: nextStatus,
      chapterId,
      chapterTitle,
      classId,
      scheduledAt: classChanged ? null : (Number.isFinite(scheduledAt) && scheduledAt > 0 ? scheduledAt : null),
      meetLink: classChanged ? '' : (meetLink ? normalizeUrl(meetLink) : ''),
      startedAt: classChanged && !startsNewSession
        ? null
        : startsNewSession
        ? Date.now()
        : (nextStatus === 'running' ? (current.startedAt || Date.now()) : (current.startedAt || null)),
      activity: startsNewSession || classChanged
        ? { exerciseIds: [], strokes: {} }
        : (current.activity || { exerciseIds: [], strokes: {} }),
      history,
      updatedAt: Date.now(),
    };
    if (!await commitSession(sessionKey, current, next)) return retry();
    if (nextStatus === 'stopped' && (previousStatus === 'running' || previousStatus === 'paused')) {
      try { await archiveStoppedSession(professor, { ...current, history }, next.updatedAt); } catch { /* l'arrêt ne dépend jamais de l'archive */ }
    }
    // Un choix explicite de classe accepté ici devient aussi la classe pilotée :
    // démarrer une séance sur un niveau y emmène la tablette.
    if (classChanged) await publishFocusClass(professor.phone, classId);
    if (startsNewSession) {
      await notifySessionStudents(professor, access, classId, classroomKeys.present, {
        absentOnly: true,
        title: '🔴 Séance en cours',
        body: `La séance « ${chapterTitle || 'Mathématiques'} » vient de commencer. Rejoignez votre professeur.`,
        url: next.meetLink || '/',
        tag: `session-started-${Date.now()}`,
        type: 'session',
        priority: 'high',
      });
    }
    return res.status(200).json({ success: true, session: next });
  }

  if (action === 'session-schedule') {
    if (!requestedClassId) return res.status(400).json({ error: 'class_id_required' });
    const scheduledAt = Number(req.body?.scheduledAt);
    if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
      return res.status(400).json({ error: 'Invalid scheduledAt' });
    }
    const chapterTitle = String(req.body?.chapterTitle || '').replace(/\$[^$]*\$/g, '').trim().slice(0, 160);
    const meetLink = req.body?.meetLink ? normalizeUrl(String(req.body.meetLink)) : '';
    const current = parseObject(await redis.get(sessionKey), {});
    if (!professorCanAccessClass(access, requestedClassId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    const currentClassId = normalizeProfessorClassId(current.classId);
    if (currentClassId && currentClassId !== requestedClassId && (current.status === 'running' || current.status === 'paused')) {
      return res.status(409).json({ error: 'active_session_class_conflict' });
    }
    // Comme session-set, réclamer/ignorer l'état legacy avant de repointer la
    // séance évite de copier ultérieurement les données de A dans B.
    await prepareClassroomKeys(professor.phone, requestedClassId);
    const history = readHistory(current);
    history.push({ at: Date.now(), type: 'schedule', label: 'Séance programmée' });
    const classChanged = currentClassId !== requestedClassId;
    const next = {
      ...current,
      ...(classChanged ? {
        chapterId: '',
        activity: { exerciseIds: [], strokes: {} },
        startedAt: null,
      } : {}),
      classId: requestedClassId,
      chapterTitle: chapterTitle || (classChanged ? '' : (current.chapterTitle || '')),
      status: current.status || 'idle',
      scheduledAt,
      meetLink,
      history,
      updatedAt: Date.now(),
    };
    if (!await commitSession(sessionKey, current, next)) return retry();
    if (classChanged) await publishFocusClass(professor.phone, requestedClassId);
    return res.status(200).json({ success: true, scheduledAt, session: next });
  }

  if (action === 'session-notify') {
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 500);
    if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });
    const current = parseObject(await redis.get(sessionKey), {});
    const classId = normalizeProfessorClassId(requestedClassId || current.classId || professor.classId);
    if (!professorCanAccessClass(access, classId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    const currentClassId = normalizeProfessorClassId(current.classId);
    if (requestedClassId && currentClassId && requestedClassId !== currentClassId && (current.status === 'running' || current.status === 'paused')) {
      return res.status(409).json({ error: 'active_session_class_conflict' });
    }
    const keys = await prepareClassroomKeys(professor.phone, classId);
    const result = await notifySessionStudents(professor, access, classId, keys.present, {
      absentOnly: req.body?.absentOnly === true,
      title,
      body,
      url: req.body?.url ? normalizeUrl(String(req.body.url)) : '/',
      tag: `prof-notify-${Date.now()}`,
      type: 'session',
      priority: req.body?.priority === 'low' ? 'low' : 'high',
    });
    return res.status(200).json({ success: true, ...result });
  }

  if (action === 'session-activity') {
    const current = parseObject(await redis.get(sessionKey), {});
    const storedClassId = normalizeProfessorClassId(current.classId);
    if (storedClassId && !professorCanAccessClass(access, storedClassId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    if (requestedClassId && storedClassId && requestedClassId !== storedClassId) {
      return res.status(409).json({ error: 'active_session_class_conflict' });
    }
    // Les envois différés d'une page fermée ne modifient pas une séance terminée.
    if (current.status !== 'running' && current.status !== 'paused') {
      return res.status(409).json({ error: 'session_not_active' });
    }
    if (req.body?.startedAt !== undefined && req.body.startedAt !== current.startedAt) {
      return res.status(409).json({ error: 'session_replaced' });
    }
    const activity = { ...(current.activity || { exerciseIds: [], strokes: {} }) };
    if (req.body?.exerciseIds !== undefined) {
      activity.exerciseIds = (Array.isArray(req.body.exerciseIds) ? req.body.exerciseIds : [])
        .map((id: unknown) => String(id).slice(0, 120)).filter(Boolean).slice(0, 200);
    }
    if (req.body?.strokes && typeof req.body.strokes === 'object') activity.strokes = req.body.strokes;
    if (req.body?.position !== undefined && req.body.position !== null) activity.position = req.body.position;
    if (req.body?.revision && typeof req.body.revision === 'object') activity.revision = req.body.revision;
    if (req.body?.quiz && typeof req.body.quiz === 'object') activity.quiz = req.body.quiz;
    const next = { ...current, activity, updatedAt: Date.now() };
    const serialized = JSON.stringify(next);
    if (serialized.length > 900_000) return res.status(413).json({ error: 'Session activity too large' });
    if (!await commitSession(sessionKey, current, next)) return retry();
    return res.status(200).json({ success: true, session: { ...next, activity: undefined } });
  }

  if (action !== 'session-get') return res.status(400).json({ error: 'Invalid session action' });
  // Séance et classe pilotée en une seule commande : la tablette appelle cette
  // action toutes les 1,5 s, chaque commande économisée se multiplie.
  const [sessionRaw, focusRaw] = await redis.mget<unknown[]>(sessionKey, classroomFocusKey(professor.phone));
  const current = parseObject(sessionRaw, { status: 'idle' });
  const storedClassId = normalizeProfessorClassId(current.classId);
  if (storedClassId && !professorCanAccessClass(access, storedClassId)) {
    return res.status(403).json({ error: 'professor_class_access_denied' });
  }
  // La classe pilotée voyage avec la séance : la tablette n'a qu'une lecture à
  // faire pour suivre le PC. Un droit retiré entre-temps cesse de piloter.
  const storedFocus = parseObject(focusRaw, {});
  const focusClassId = normalizeProfessorClassId(storedFocus.classId);
  const focus = focusClassId && professorCanAccessClass(access, focusClassId)
    ? { classId: focusClassId, updatedAt: Number(storedFocus.updatedAt) || 0 }
    : null;
  const session = req.body?.summary === true ? { ...current, activity: undefined, history: undefined } : current;
  return res.status(200).json({ session, focus });
}
