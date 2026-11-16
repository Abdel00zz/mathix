import { createHash } from 'node:crypto';
import {
  buildNotifyPayload,
  cleanupExpired,
  redis,
  resolveClassSubscribers,
  sendToSubscribers,
  subscriberAllows,
} from './shared.js';
import {
  isLinkedStudentInClass,
  normalizeProfessorClassId,
  professorCanAccessClass,
  type ProfessorClassAccess,
} from './access.js';
import { readLinkedAccounts } from './linkedStudents.js';

const CLASSROOM_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface ProfessorClassroomKeys {
  roster: string;
  live: string;
  answered: string;
  answerStatus: string;
  present: string;
  /** La séance pilotée reste unique par professeur ; son `classId` est gardé. */
  session: string;
}

function ownerKey(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 20);
}

export function classroomSessionKey(phone: string): string {
  return `prof:classroom:${ownerKey(phone)}:session`;
}

/**
 * Classe pilotée depuis la console PC.
 *
 * Volontairement hors du record de séance : publier une classe est un acte de
 * navigation, pas un acte de séance. Un pointeur séparé ne déclenche donc ni le
 * conflit `active_session_class_conflict`, ni la remise à zéro du chapitre, de
 * la programmation et de l'activité qu'impose un changement de `session.classId`.
 */
export function classroomFocusKey(phone: string): string {
  return `prof:classroom:${ownerKey(phone)}:focus`;
}

export function classroomArchiveIndexKey(phone: string): string {
  return `prof:classroom:${ownerKey(phone)}:archive:index`;
}

export function classroomArchiveRecordKey(phone: string, id: string): string {
  return `prof:classroom:${ownerKey(phone)}:archive:${id.replace(/[^a-z0-9_-]/gi, '').slice(0, 80)}`;
}

/**
 * Clés de salle cloisonnées par classe. La séance elle-même reste le pointeur
 * global vers la classe actuellement pilotée par le professeur.
 */
export function classroomKeys(phone: string, classId: string): ProfessorClassroomKeys {
  const normalizedClassId = normalizeProfessorClassId(classId);
  if (!normalizedClassId) throw new Error('Invalid classroom classId');
  const owner = ownerKey(phone);
  const prefix = `prof:classroom:${owner}:class:${normalizedClassId}`;
  return {
    roster: `${prefix}:roster`,
    live: `${prefix}:live`,
    answered: `${prefix}:answered`,
    answerStatus: `${prefix}:answerStatus`,
    present: `${prefix}:present`,
    session: classroomSessionKey(phone),
  };
}

/**
 * Migration atomique des anciennes clés globales.
 *
 * Elles ne sont copiées que si la séance legacy contient explicitement la
 * même classe. Une seule classe peut réclamer cet état ; sans cette preuve,
 * on initialise la nouvelle portée vide plutôt que de risquer une fuite entre
 * niveaux. Les anciennes clés ne sont pas supprimées (retour arrière sûr).
 */
const MIGRATE_LEGACY_CLASSROOM_SCRIPT = `
if redis.call('EXISTS', KEYS[12]) == 1 then return 0 end
local sessionRaw = redis.call('GET', KEYS[11])
local sessionClass = ''
if sessionRaw then
  local ok, session = pcall(cjson.decode, sessionRaw)
  if ok and type(session) == 'table' then sessionClass = tostring(session.classId or '') end
end
if sessionClass ~= ARGV[1] then
  redis.call('SET', KEYS[12], 'skipped', 'EX', tonumber(ARGV[2]))
  return 0
end
local claimedClass = redis.call('GET', KEYS[13])
if claimedClass and claimedClass ~= ARGV[1] then
  redis.call('SET', KEYS[12], 'skipped', 'EX', tonumber(ARGV[2]))
  return 0
end
if not claimedClass then
  redis.call('SET', KEYS[13], ARGV[1], 'EX', tonumber(ARGV[2]))
end
for i = 1, 3 do
  if redis.call('EXISTS', KEYS[i]) == 0 and redis.call('EXISTS', KEYS[i + 5]) == 1 then
    redis.call('SET', KEYS[i], redis.call('GET', KEYS[i + 5]), 'EX', tonumber(ARGV[2]))
  end
end
for i = 4, 5 do
  if redis.call('EXISTS', KEYS[i]) == 0 and redis.call('EXISTS', KEYS[i + 5]) == 1 then
    local members = redis.call('SMEMBERS', KEYS[i + 5])
    for _, member in ipairs(members) do redis.call('SADD', KEYS[i], member) end
    if #members > 0 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[2])) end
  end
end
redis.call('SET', KEYS[12], 'migrated', 'EX', tonumber(ARGV[2]))
return 1
`;

/**
 * Couples (professeur, classe) dont la migration a déjà été jouée par cette
 * instance. Le marqueur écrit par le script est définitif : une fois posé, tout
 * nouvel appel est un no-op. Sans cette mémoire, chaque sondage de la salle
 * (toutes les 4 s) payait une commande `EVAL` pour rien, soit un cinquième de
 * ses lectures Redis. Seul un succès est mémorisé : une erreur réessaie.
 */
const preparedClassrooms = new Set<string>();

/** Vide la mémoire d'instance (tests). */
export function resetPreparedClassrooms(): void {
  preparedClassrooms.clear();
}

export async function prepareClassroomKeys(phone: string, classId: string): Promise<ProfessorClassroomKeys> {
  const normalizedClassId = normalizeProfessorClassId(classId);
  const keys = classroomKeys(phone, normalizedClassId);
  const preparedKey = `${ownerKey(phone)}:${normalizedClassId}`;
  if (preparedClassrooms.has(preparedKey)) return keys;
  const owner = ownerKey(phone);
  const legacyPrefix = `prof:classroom:${owner}`;
  await redis.eval(MIGRATE_LEGACY_CLASSROOM_SCRIPT, [
    keys.roster,
    keys.live,
    keys.answerStatus,
    keys.answered,
    keys.present,
    `${legacyPrefix}:roster`,
    `${legacyPrefix}:live`,
    `${legacyPrefix}:answerStatus`,
    `${legacyPrefix}:answered`,
    `${legacyPrefix}:present`,
    keys.session,
    `${legacyPrefix}:class:${normalizedClassId}:migration-v1`,
    `${legacyPrefix}:legacy-owner-v1`,
  ], [normalizedClassId, String(CLASSROOM_TTL_SECONDS)]);
  preparedClassrooms.add(preparedKey);
  return keys;
}

/** Notification immédiate limitée aux comptes canoniques liés à la classe. */
export async function notifySessionStudents(
  professor: { accountId: string },
  access: ProfessorClassAccess,
  classId: string,
  presentKey: string,
  opts: {
    absentOnly: boolean;
    title: string;
    body: string;
    url?: string;
    tag: string;
    type?: string;
    priority?: string;
  },
): Promise<{ sent: number; failed: number }> {
  const activeClassId = normalizeProfessorClassId(classId);
  if (!professorCanAccessClass(access, activeClassId)) return { sent: 0, failed: 0 };

  const linkedIds = new Set<string>();
  for (const user of await readLinkedAccounts(professor.accountId)) {
    if (!isLinkedStudentInClass(user, professor.accountId, activeClassId)) continue;
    linkedIds.add(String(user.accountId));
  }
  if (linkedIds.size === 0) return { sent: 0, failed: 0 };

  if (opts.absentOnly) {
    const presentIds = new Set((await redis.smembers(presentKey) as string[]).map(String));
    for (const presentId of presentIds) linkedIds.delete(presentId);
    if (linkedIds.size === 0) return { sent: 0, failed: 0 };
  }

  const { subs, orphans } = await resolveClassSubscribers(activeClassId);
  // Aucun repli par nom : un abonnement legacy non canonique ne prouve pas
  // que son propriétaire est encore lié à ce professeur.
  const priority = opts.priority || 'high';
  const targeted = subs
    .filter(sub => linkedIds.has(String(sub.data?.accountId || '')))
    .filter(sub => subscriberAllows(sub.data.prefs, 'messages', new Date(), { bypassQuiet: priority === 'high' }));
  if (targeted.length === 0) {
    await cleanupExpired(orphans.map(key => ({ key })));
    return { sent: 0, failed: 0 };
  }

  const payload = buildNotifyPayload({
    title: opts.title,
    body: opts.body,
    url: opts.url,
    tag: opts.tag,
    type: opts.type || 'session',
    priority,
  });
  const { sent, failed, expired } = await sendToSubscribers(targeted, payload);
  await cleanupExpired([...expired, ...orphans.map(key => ({ key }))]);
  return { sent, failed };
}
