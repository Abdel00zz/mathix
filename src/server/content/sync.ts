/**
 * Isolation et livraison du contenu professeur (module interne serveur).
 *
 * ── Le problème ────────────────────────────────────────────────────────────
 * Les overrides de contenu vivent dans deux espaces : l'officiel (admin) et
 * celui de chaque professeur. La lecture fusionnait les deux, si bien que
 * toute publication de l'admin apparaissait instantanément chez tous les
 * professeurs, écrasant de fait leur progression.
 *
 * ── Le gel ─────────────────────────────────────────────────────────────────
 * À partir de l'activation du badge prof (`roleUpdatedAt`), le professeur ne
 * reçoit plus que l'officiel publié *avant* cette date. On photographie le
 * manifeste officiel à cet instant :
 *
 *   content:baseline:{owner}         → { at, capturedAt }
 *   content:baseline:{owner}:files   → hash { path: version }
 *
 * Sa session ne dépend plus que de lui. Un compte promu avant l'existence de
 * `roleUpdatedAt` n'a pas de date de gel : son comportement reste l'ancien.
 *
 * ── La livraison ───────────────────────────────────────────────────────────
 * L'admin ne pousse plus, il propose. Chaque proposition est stockée puis
 * appliquée par le professeur, chemin par chemin, en connaissance de ce qui
 * sera remplacé :
 *
 *   content:push:{owner}             → hash { id: proposition }
 *   content:thread:{owner}           → liste des messages (les deux sens)
 *   content:sync:{owner}             → résumé dénormalisé (pastilles admin)
 */

import { createHash } from 'node:crypto';
import { redis } from '../professor/shared.js';
import { professorCanAccessDataPath, type ProfessorClassAccess } from '../professor/access.js';

// ── Clés de stockage ────────────────────────────────────────────────────────

export const OFFICIAL_FILES_KEY = 'content:files';
export const OFFICIAL_VERSION_KEY = 'content:version';

/** Identité de stockage d'un professeur, dérivée de son téléphone. */
export function profOwner(phone: string): string {
  const hash = createHash('sha256').update(phone).digest('hex').slice(0, 20);
  return `prof:${hash}`;
}

export function officialFileKey(path: string): string {
  return `content:file:${path}`;
}

/** Clés du namespace privé d'un professeur (`owner` = `profOwner(phone)`). */
export function profKeys(owner: string) {
  return {
    files: `content:files:${owner}`,
    file: (path: string) => `content:file:${owner}:${path}`,
    version: `content:version:${owner}`,
  };
}

export const baselineKey = (owner: string) => `content:baseline:${owner}`;
export const baselineFilesKey = (owner: string) => `content:baseline:${owner}:files`;
export const pushKey = (owner: string) => `content:push:${owner}`;
export const threadKey = (owner: string) => `content:thread:${owner}`;
export const summaryKey = (owner: string) => `content:sync:${owner}`;

/** Publication atomique : version monotone + contenu + entrée de manifeste. */
export const SAVE_CONTENT_SCRIPT = `
local currentVersion = tonumber(redis.call('GET', KEYS[3])) or 0
local version = math.max(tonumber(ARGV[3]) or 0, currentVersion + 1)
redis.call('SET', KEYS[3], tostring(version))
redis.call('SET', KEYS[2], ARGV[2])
redis.call('HSET', KEYS[1], ARGV[1], tostring(version))
return version
`;

// Upstash limite la taille des requêtes (~1 Mo) : plafond de sécurité.
export const MAX_FILE_CHARS = 900_000;

const HISTORY_MAX = 20;
const PUSH_MAX = 20;
const THREAD_MAX = 100;
const MESSAGE_MAX_CHARS = 2_000;
/** Au-delà, on n'enrichit plus les libellés : la réponse deviendrait énorme. */
const LABEL_LOOKUP_MAX = 40;

// ── Utilitaires partagés ────────────────────────────────────────────────────

export function parseStored(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

/** Chemin autorisé : uniquement l'arborescence data/, JSON, sans traversée. */
export function isValidDataPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (path.includes('..') || path.includes('//')) return false;
  return /^data\/[a-zA-Z0-9_\-./]+\.json$/.test(path);
}

function toVersionMap(raw: Record<string, unknown> | null): Record<string, number> {
  const files: Record<string, number> = {};
  for (const [path, version] of Object.entries(raw || {})) {
    files[path] = Number(version) || 0;
  }
  return files;
}

// ── Le gel ──────────────────────────────────────────────────────────────────

export interface ContentBaseline {
  /** Date d'activation du badge prof : rien de plus récent n'est servi. */
  at: number;
  capturedAt: number;
  /** Photo présente uniquement au tour où elle vient d'être prise. */
  files?: Record<string, number>;
}

/**
 * Photographie le manifeste officiel à une date de gel donnée.
 *
 * Filtrée sur `version <= at` : la photo est donc exacte même prise après coup.
 * Appelée à la promotion (photo parfaite) et, à défaut, à la première lecture du
 * professeur — ce qui répare les comptes promus avant l'existence du gel.
 *
 * Angle mort assumé de la capture tardive : un chemin publié avant le gel *puis*
 * réédité par l'admin avant la capture porte une version postérieure et sort de
 * la photo. Le professeur ne le perd pas pour autant — il apparaît aussitôt dans
 * ses « mises à jour disponibles » et dans l'arbre de l'admin.
 */
export async function captureBaseline(owner: string, at: number): Promise<ContentBaseline> {
  const official = toVersionMap(await redis.hgetall(OFFICIAL_FILES_KEY));
  const files: Record<string, number> = {};
  const encoded: Record<string, string> = {};
  for (const [path, version] of Object.entries(official)) {
    if (version <= at) {
      files[path] = version;
      encoded[path] = String(version);
    }
  }
  const capturedAt = Date.now();
  try {
    await redis.del(baselineFilesKey(owner));
    if (Object.keys(encoded).length) await redis.hset(baselineFilesKey(owner), encoded);
    // Marqueur écrit en dernier : une capture interrompue est simplement refaite.
    await redis.set(baselineKey(owner), JSON.stringify({ at, capturedAt }));
  } catch { /* la lecture ne doit jamais échouer parce que la photo n'a pas pu s'écrire */ }
  return { at, capturedAt, files };
}

/**
 * Date de gel d'un professeur, avec capture paresseuse de la photo.
 *
 * Si l'écriture de la photo échoue, on renvoie quand même celle qu'on a en
 * mémoire (le tour courant reste juste) et la capture sera retentée au tour
 * suivant : une panne d'écriture ne vide jamais le catalogue d'un professeur.
 */
export async function resolveBaseline(
  owner: string,
  profUser: Record<string, any> | null | undefined,
): Promise<ContentBaseline | null> {
  const at = Number(profUser?.roleUpdatedAt || 0);
  if (!Number.isFinite(at) || at <= 0) return null;

  const stored = parseStored(await redis.get(baselineKey(owner))) as ContentBaseline | null;
  if (stored && Number(stored.at) === at) {
    return { at, capturedAt: Number(stored.capturedAt) || at };
  }
  return captureBaseline(owner, at);
}

/** Manifeste officiel tel qu'il était au gel. */
export async function frozenOfficialFiles(
  owner: string,
  baseline: ContentBaseline,
): Promise<Record<string, number>> {
  if (baseline.files) return baseline.files;
  return toVersionMap(await redis.hgetall(baselineFilesKey(owner)));
}

/**
 * Contenu officiel d'un chemin tel qu'il était à la date de gel.
 *
 * `handleSave` empile dans `:history` `{ at: <moment du remplacement>,
 * content: <ce qui était vivant jusque-là> }`. Le contenu vivant à l'instant T
 * est donc l'entrée de plus petit `at` parmi celles dont `at > T` ; s'il n'en
 * existe aucune, c'est le contenu courant qui était déjà là.
 *
 * Coût : un HGET puis un GET dans le cas courant (fichier inchangé depuis le
 * gel). L'historique n'est lu que si la version officielle a bougé.
 */
export async function readOfficialAtBaseline(
  owner: string,
  path: string,
  baseline: ContentBaseline,
): Promise<{ found: boolean; content: unknown }> {
  const liveVersion = Number(await redis.hget(OFFICIAL_FILES_KEY, path)) || 0;
  if (liveVersion && liveVersion <= baseline.at) {
    const raw = await redis.get(officialFileKey(path));
    return { found: raw !== null && raw !== undefined, content: parseStored(raw) };
  }

  // Publié après le gel : servi seulement si le chemin figure dans la photo.
  const frozenVersion = Number(await redis.hget(baselineFilesKey(owner), path)) || 0;
  if (!frozenVersion) return { found: false, content: null };

  const rawHistory = (await redis.lrange(`${officialFileKey(path)}:history`, 0, HISTORY_MAX - 1)) as unknown[];
  let best: { at: number; content: unknown } | null = null;
  for (const entry of rawHistory) {
    const parsed = parseStored(entry) as { at?: number; content?: unknown } | null;
    const at = Number(parsed?.at || 0);
    if (!at || at <= baseline.at) continue;
    if (!best || at < best.at) best = { at, content: parsed?.content ?? null };
  }
  if (best) return { found: true, content: best.content };

  // Historique élagué (plus de 20 révisions depuis le gel) : à défaut de mieux,
  // le contenu courant reste plus proche de la vérité que le fichier statique.
  const raw = await redis.get(officialFileKey(path));
  return { found: raw !== null && raw !== undefined, content: parseStored(raw) };
}

// ── Classement des chemins de contenu ───────────────────────────────────────

export type ContentKind = 'quiz' | 'revision' | 'exercise' | 'class-manifest' | 'chapter-manifest' | 'other';

export const KIND_LABELS: Record<ContentKind, string> = {
  quiz: 'Quiz',
  revision: 'Révisions',
  exercise: 'Exercices',
  'class-manifest': 'Sommaire de la classe',
  'chapter-manifest': 'Sommaire du chapitre',
  other: 'Autres',
};

export interface PathInfo {
  kind: ContentKind;
  classId: string;
  chapterId: string;
}

/**
 * Classement par la convention d'arborescence, seule source fiable côté
 * serveur : `data/{classe}/{chapitre}/{exercises|quiz|revisions}/x.json`.
 */
export function classifyDataPath(path: string): PathInfo {
  const classMatch = /^data\/classes\/([^/]+)\.json$/.exec(path);
  if (classMatch) return { kind: 'class-manifest', classId: classMatch[1], chapterId: '' };

  const parts = path.split('/');
  // data / classId / chapterId / …
  if (parts.length >= 4) {
    const [, classId, chapterId, ...rest] = parts;
    if (rest.length === 1 && rest[0] === 'manifest.json') {
      return { kind: 'chapter-manifest', classId, chapterId };
    }
    if (rest.length === 2) {
      const folder = rest[0];
      if (folder === 'quiz' || folder === 'quizzes') return { kind: 'quiz', classId, chapterId };
      if (folder === 'revisions' || folder === 'revision') return { kind: 'revision', classId, chapterId };
      if (folder === 'exercises' || folder === 'exercise') return { kind: 'exercise', classId, chapterId };
    }
    return { kind: 'other', classId, chapterId };
  }
  return { kind: 'other', classId: '', chapterId: '' };
}

function isManifestKind(kind: ContentKind): boolean {
  return kind === 'class-manifest' || kind === 'chapter-manifest';
}

/** Libellé de repli : le nom de fichier rendu lisible. */
function labelFromPath(path: string): string {
  const stem = (path.split('/').pop() || path).replace(/\.json$/, '');
  const words = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : path;
}

/** Titre porté par le document lui-même (mêmes règles que le renommage studio). */
function labelFromDocument(kind: ContentKind, document: unknown): string {
  if (!document || typeof document !== 'object') return '';
  const record = document as Record<string, any>;
  if (kind === 'revision') return String(record.header?.title || record.title || '').trim();
  if (kind === 'exercise') return String(record.topic || record.id || '').trim();
  return String(record.title || '').trim();
}

// ── Arbre des mises à jour disponibles ──────────────────────────────────────

export interface CandidateEntry {
  path: string;
  kind: ContentKind;
  classId: string;
  chapterId: string;
  label: string;
  version: number;
  /** Le professeur a déjà un fichier à ce chemin : il sera remplacé. */
  conflict: boolean;
}

export interface CandidateChapter {
  chapterId: string;
  chapterTitle: string;
  entries: CandidateEntry[];
}

export interface CandidateClass {
  classId: string;
  classTitle: string;
  chapters: CandidateChapter[];
}

export interface CandidateTree {
  classes: CandidateClass[];
  total: number;
  conflicts: number;
}

/**
 * Ce que l'officiel a publié depuis le gel et que le professeur ne reçoit pas.
 *
 * Source unique : le manifeste des overrides officiels diffé contre la date de
 * gel. Le contenu statique du déploiement n'y figure pas — il reste visible de
 * tous et n'a donc rien à livrer.
 */
export async function buildCandidateTree(options: {
  owner: string;
  access: ProfessorClassAccess;
  baselineAt: number;
}): Promise<CandidateTree> {
  const { owner, access, baselineAt } = options;
  const official = toVersionMap(await redis.hgetall(OFFICIAL_FILES_KEY));
  const ownerFiles = toVersionMap(await redis.hgetall(profKeys(owner).files));

  const candidates = Object.entries(official)
    .filter(([path, version]) => version > baselineAt && isValidDataPath(path) && professorCanAccessDataPath(access, path))
    .map(([path, version]) => ({ path, version, info: classifyDataPath(path) }));

  // Titres réels pour les ressources que l'admin choisit à la main (quiz et
  // fiches). Un seul aller-retour, et jamais sur les exercices : leur nombre
  // ferait exploser la réponse pour un gain de lisibilité nul.
  const lookup = candidates
    .filter(item => item.info.kind === 'quiz' || item.info.kind === 'revision')
    .slice(0, LABEL_LOOKUP_MAX)
    .map(item => item.path);
  const documents = new Map<string, unknown>();
  if (lookup.length) {
    try {
      const raws = await redis.mget<unknown[]>(...lookup.map(officialFileKey));
      lookup.forEach((path, index) => documents.set(path, parseStored(raws?.[index])));
    } catch { /* libellés de repli */ }
  }

  const titles = await resolveTreeTitles(candidates.map(item => item.info));
  const byClass = new Map<string, Map<string, CandidateEntry[]>>();
  let conflicts = 0;

  for (const { path, version, info } of candidates) {
    const entry: CandidateEntry = {
      path,
      kind: info.kind,
      classId: info.classId,
      chapterId: info.chapterId,
      label: labelFromDocument(info.kind, documents.get(path)) || labelFromPath(path),
      version,
      conflict: ownerFiles[path] !== undefined,
    };
    if (entry.conflict) conflicts += 1;
    const chapters = byClass.get(info.classId) || new Map<string, CandidateEntry[]>();
    const entries = chapters.get(info.chapterId) || [];
    entries.push(entry);
    chapters.set(info.chapterId, entries);
    byClass.set(info.classId, chapters);
  }

  const classes: CandidateClass[] = Array.from(byClass.entries())
    .map(([classId, chapters]) => ({
      classId,
      classTitle: titles.classes[classId] || classId || 'Général',
      chapters: Array.from(chapters.entries())
        .map(([chapterId, entries]) => ({
          chapterId,
          chapterTitle: titles.chapters[`${classId}/${chapterId}`] || chapterId || 'Sommaire de la classe',
          entries: entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)),
        }))
        .sort((a, b) => (a.chapterId ? 1 : 0) - (b.chapterId ? 1 : 0) || a.chapterTitle.localeCompare(b.chapterTitle)),
    }))
    .sort((a, b) => a.classTitle.localeCompare(b.classTitle));

  return { classes, total: candidates.length, conflicts };
}

/** Titres de classes et de chapitres, lus une seule fois par classe. */
async function resolveTreeTitles(infos: PathInfo[]): Promise<{
  classes: Record<string, string>;
  chapters: Record<string, string>;
}> {
  const classes: Record<string, string> = {};
  const chapters: Record<string, string> = {};
  const classIds = Array.from(new Set(infos.map(info => info.classId).filter(Boolean)));
  if (!classIds.length) return { classes, chapters };
  try {
    const raws = await redis.mget<unknown[]>(...classIds.map(id => officialFileKey(`data/classes/${id}.json`)));
    classIds.forEach((classId, index) => {
      const parsed = parseStored(raws?.[index]) as Record<string, any> | null;
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.title) classes[classId] = String(parsed.title);
      for (const chapter of Array.isArray(parsed.chapters) ? parsed.chapters : []) {
        if (chapter?.id && chapter?.title) chapters[`${classId}/${chapter.id}`] = String(chapter.title);
      }
    });
  } catch { /* libellés de repli : les identifiants */ }
  return { classes, chapters };
}

// ── Fusion des sommaires ────────────────────────────────────────────────────

const RESOURCE_KEYS = ['quizzes', 'revisions', 'exercises'] as const;

function mergeResourceList(profList: unknown, officialList: unknown): unknown[] {
  const prof = Array.isArray(profList) ? profList : [];
  const official = Array.isArray(officialList) ? officialList : [];
  const seen = new Set(prof.map(item => String((item as any)?.path || (item as any)?.id || '')));
  const added = official.filter(item => {
    const key = String((item as any)?.path || (item as any)?.id || '');
    return key && !seen.has(key);
  });
  return [...prof, ...added];
}

/**
 * Fusion d'un sommaire : le professeur garde la main.
 *
 * Les champs scalaires du professeur (titre renommé, ordre, épinglage) ne sont
 * jamais écrasés ; seules les ressources absentes de son sommaire sont
 * ajoutées. Un chapitre qu'il a créé survit donc à toute mise à jour, et un
 * chapitre nouveau de l'admin s'ajoute en fin de liste.
 */
export function mergeManifest(profDocument: unknown, officialDocument: unknown): unknown {
  if (!profDocument || typeof profDocument !== 'object' || Array.isArray(profDocument)) return officialDocument;
  if (!officialDocument || typeof officialDocument !== 'object' || Array.isArray(officialDocument)) return profDocument;

  const prof = { ...(profDocument as Record<string, any>) };
  const official = officialDocument as Record<string, any>;

  for (const key of RESOURCE_KEYS) {
    if (official[key] !== undefined || prof[key] !== undefined) {
      prof[key] = mergeResourceList(prof[key], official[key]);
    }
  }

  if (Array.isArray(official.chapters) || Array.isArray(prof.chapters)) {
    const profChapters = Array.isArray(prof.chapters) ? prof.chapters : [];
    const officialChapters = Array.isArray(official.chapters) ? official.chapters : [];
    const officialById = new Map(officialChapters.map((chapter: any) => [String(chapter?.id || ''), chapter]));
    const merged = profChapters.map((chapter: any) => {
      const counterpart = officialById.get(String(chapter?.id || ''));
      if (!counterpart) return chapter;
      const next = { ...chapter };
      for (const key of RESOURCE_KEYS) {
        if (counterpart[key] !== undefined || next[key] !== undefined) {
          next[key] = mergeResourceList(next[key], counterpart[key]);
        }
      }
      // Un chapitre officiel peut apporter un sommaire qui n'existait pas.
      if (!next.manifestPath && counterpart.manifestPath) next.manifestPath = counterpart.manifestPath;
      return next;
    });
    const known = new Set(profChapters.map((chapter: any) => String(chapter?.id || '')));
    for (const chapter of officialChapters) {
      if (!known.has(String(chapter?.id || ''))) merged.push(chapter);
    }
    prof.chapters = merged;
  }

  return prof;
}

// ── Application chez le professeur (copy-on-deliver) ────────────────────────

export interface ApplyOutcome {
  applied: string[];
  overwritten: string[];
  skipped: string[];
  version: number;
}

/**
 * Copie l'officiel dans l'espace du professeur, chemin par chemin.
 *
 * Le passage par `SAVE_CONTENT_SCRIPT` offre gratuitement la version monotone
 * et l'entrée de manifeste ; le snapshot de la révision précédente rend le
 * remplacement réversible depuis le panneau d'historique du studio.
 */
export async function applyEntries(options: {
  owner: string;
  access: ProfessorClassAccess;
  paths: string[];
  baseline: ContentBaseline | null;
}): Promise<ApplyOutcome> {
  const { owner, access, paths, baseline } = options;
  const keys = profKeys(owner);
  const outcome: ApplyOutcome = { applied: [], overwritten: [], skipped: [], version: 0 };

  for (const path of Array.from(new Set(paths))) {
    // La portée du compte décide, jamais la sélection reçue.
    if (!isValidDataPath(path) || !professorCanAccessDataPath(access, path)) {
      outcome.skipped.push(path);
      continue;
    }
    const officialRaw = await redis.get(officialFileKey(path));
    const official = parseStored(officialRaw);
    if (official === null) { outcome.skipped.push(path); continue; }

    const previousRaw = await redis.get(keys.file(path));
    const previous = parseStored(previousRaw);
    const info = classifyDataPath(path);
    const next = previous !== null && isManifestKind(info.kind)
      ? mergeManifest(previous, official)
      : official;

    const serialized = JSON.stringify(next);
    if (serialized.length > MAX_FILE_CHARS) { outcome.skipped.push(path); continue; }

    if (previous !== null) {
      outcome.overwritten.push(path);
      try {
        await redis.lpush(`${keys.file(path)}:history`, JSON.stringify({ at: Date.now(), content: previous }));
        await redis.ltrim(`${keys.file(path)}:history`, 0, HISTORY_MAX - 1);
      } catch { /* une perte d'historique n'invalide pas la livraison */ }
    }

    const version = Number(await redis.eval(SAVE_CONTENT_SCRIPT, [
      keys.files,
      keys.file(path),
      keys.version,
    ], [path, serialized, String(Date.now())]));
    outcome.applied.push(path);
    outcome.version = Math.max(outcome.version, version);
  }

  // Le contenu appliqué appartient désormais au professeur : la photo du gel
  // n'a plus à le servir, sans quoi une révision officielle ultérieure
  // ressortirait par la porte de l'officiel.
  if (baseline && outcome.applied.length) {
    try { await redis.hdel(baselineFilesKey(owner), ...outcome.applied); }
    catch { /* l'override du professeur prime de toute façon à la lecture */ }
  }

  return outcome;
}

// ── Propositions de mise à jour ─────────────────────────────────────────────

export type ProposalStatus = 'pending' | 'applied' | 'partial' | 'declined';

export interface ProposalEntry {
  path: string;
  kind: ContentKind;
  classId: string;
  chapterId: string;
  label: string;
  conflict: boolean;
}

export interface Proposal {
  id: string;
  at: number;
  title: string;
  message: string;
  entries: ProposalEntry[];
  status: ProposalStatus;
  decidedAt?: number;
  applied?: string[];
  declined?: string[];
}

/** Texte libre reçu du client : longueur plafonnée, contrôles retirés. */
export function sanitizeText(value: unknown, max: number): string {
  let clean = '';
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0) || 0;
    // Caractères de contrôle retirés, sauf tabulation et retours à la ligne.
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) continue;
    clean += char;
  }
  return clean.trim().slice(0, max);
}

/**
 * Titre et message par défaut, composés depuis la sélection.
 *
 * L'admin les reçoit pré-remplis et peut les réécrire avant l'envoi : c'est le
 * texte que le professeur lira en haut de sa modale.
 */
export function defaultPushMessage(entries: ProposalEntry[], classTitles: Record<string, string>): {
  title: string;
  message: string;
} {
  const classNames = Array.from(new Set(entries.map(entry => classTitles[entry.classId] || entry.classId).filter(Boolean)));
  const counts = new Map<ContentKind, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) || 0) + 1);
  const parts = (['quiz', 'revision', 'exercise'] as ContentKind[])
    .filter(kind => counts.get(kind))
    .map(kind => `${counts.get(kind)} ${KIND_LABELS[kind].toLowerCase()}`);
  const conflicts = entries.filter(entry => entry.conflict).length;

  const scope = classNames.length === 1 ? classNames[0] : `${classNames.length} classes`;
  const detail = parts.length ? parts.join(' · ') : `${entries.length} ressources`;
  return {
    title: 'Mise à jour du contenu',
    message: [
      `${detail} ${classNames.length ? `pour ${scope}` : ''}`.trim() + '.',
      conflicts
        ? `${conflicts} ${conflicts > 1 ? 'fichiers que vous avez modifiés seront remplacés' : 'fichier que vous avez modifié sera remplacé'} — vous pouvez les restaurer depuis l'historique du studio.`
        : 'Aucun de vos fichiers ne sera remplacé.',
    ].join('\n'),
  };
}

export async function listProposals(owner: string): Promise<Proposal[]> {
  const raw = (await redis.hgetall(pushKey(owner))) || {};
  return Object.values(raw)
    .map(entry => parseStored(entry) as Proposal | null)
    .filter((entry): entry is Proposal => Boolean(entry?.id))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

export async function readProposal(owner: string, id: string): Promise<Proposal | null> {
  const raw = await redis.hget(pushKey(owner), id);
  const parsed = parseStored(raw) as Proposal | null;
  return parsed?.id ? parsed : null;
}

export async function writeProposal(owner: string, proposal: Proposal): Promise<void> {
  await redis.hset(pushKey(owner), { [proposal.id]: JSON.stringify(proposal) });
  await pruneProposals(owner);
  await writeSummary(owner);
}

export async function deleteProposal(owner: string, id: string): Promise<void> {
  await redis.hdel(pushKey(owner), id);
  await writeSummary(owner);
}

/** Ne garde que les 20 dernières, en élaguant d'abord les décidées. */
async function pruneProposals(owner: string): Promise<void> {
  const all = await listProposals(owner);
  if (all.length <= PUSH_MAX) return;
  const decided = all.filter(entry => entry.status !== 'pending').slice(PUSH_MAX - 1).map(entry => entry.id);
  const excess = decided.length ? decided : all.slice(PUSH_MAX).map(entry => entry.id);
  if (excess.length) {
    try { await redis.hdel(pushKey(owner), ...excess); } catch { /* élagage best-effort */ }
  }
}

// ── Fil de messages admin ↔ professeur ──────────────────────────────────────

export interface ThreadMessage {
  id: string;
  at: number;
  from: 'admin' | 'prof';
  body: string;
  readAt?: number;
}

export async function appendMessage(owner: string, from: 'admin' | 'prof', body: string): Promise<ThreadMessage | null> {
  const clean = sanitizeText(body, MESSAGE_MAX_CHARS);
  if (!clean) return null;
  const message: ThreadMessage = { id: `${Date.now().toString(36)}-${from}`, at: Date.now(), from, body: clean };
  await redis.lpush(threadKey(owner), JSON.stringify(message));
  await redis.ltrim(threadKey(owner), 0, THREAD_MAX - 1);
  await writeSummary(owner);
  return message;
}

export async function readThread(owner: string): Promise<ThreadMessage[]> {
  const raw = (await redis.lrange(threadKey(owner), 0, THREAD_MAX - 1)) as unknown[];
  return raw
    .slice()
    .reverse()
    .map(entry => parseStored(entry) as ThreadMessage | null)
    .filter((entry): entry is ThreadMessage => Boolean(entry?.id))
    .sort((a, b) => (a.at || 0) - (b.at || 0));
}

/**
 * Pose `readAt` sur place, dans un script atomique.
 *
 * L'ancienne version supprimait la liste (`DEL`) puis la repoussait message par
 * message : une coupure entre les deux perdait tout le fil, et un message
 * ajouté pendant la réécriture disparaissait. `LSET` modifie chaque entrée là
 * où elle est, sans fenêtre où la liste est vide ni où un `LPUSH` concurrent
 * décalerait les index (le script s'exécute sans interruption).
 */
const MARK_THREAD_READ_SCRIPT = `
local items = redis.call('LRANGE', KEYS[1], 0, -1)
local changed = 0
for i, raw in ipairs(items) do
  local ok, message = pcall(cjson.decode, raw)
  if ok and type(message) == 'table' and message['from'] == ARGV[1] and not message['readAt'] then
    message['readAt'] = tonumber(ARGV[2])
    redis.call('LSET', KEYS[1], i - 1, cjson.encode(message))
    changed = changed + 1
  end
end
return changed
`;

/** Marque comme lus les messages venus de l'autre côté. */
export async function markThreadRead(owner: string, side: 'admin' | 'prof'): Promise<void> {
  const from = side === 'admin' ? 'prof' : 'admin';
  const changed = Number(await redis.eval(MARK_THREAD_READ_SCRIPT, [threadKey(owner)], [from, String(Date.now())]));
  if (changed > 0) await writeSummary(owner);
}

// ── Résumé dénormalisé (pastilles de la console admin) ──────────────────────

export interface SyncSummary {
  owner: string;
  pending: number;
  lastPushAt: number;
  /** Messages de l'admin que le professeur n'a pas encore lus. */
  profUnread: number;
  /** Réponses du professeur que l'admin n'a pas encore lues. */
  adminUnread: number;
  lastMessageAt: number;
}

const EMPTY_SUMMARY: Omit<SyncSummary, 'owner'> = {
  pending: 0, lastPushAt: 0, profUnread: 0, adminUnread: 0, lastMessageAt: 0,
};

/**
 * Recalcule le résumé. Jamais autoritatif : la vérité reste le hash des
 * propositions et la liste des messages. Il n'existe que pour afficher les
 * pastilles de toute la table admin en une seule lecture.
 */
export async function writeSummary(owner: string): Promise<SyncSummary> {
  const [proposals, messages] = await Promise.all([listProposals(owner), readThread(owner)]);
  const summary: SyncSummary = {
    owner,
    pending: proposals.filter(entry => entry.status === 'pending').length,
    lastPushAt: proposals[0]?.at || 0,
    profUnread: messages.filter(message => message.from === 'admin' && !message.readAt).length,
    adminUnread: messages.filter(message => message.from === 'prof' && !message.readAt).length,
    lastMessageAt: messages.length ? messages[messages.length - 1].at : 0,
  };
  try { await redis.set(summaryKey(owner), JSON.stringify(summary)); }
  catch { /* pastille best-effort */ }
  return summary;
}

/** Résumés de plusieurs professeurs en une seule lecture. */
export async function readSummaries(owners: string[]): Promise<Record<string, SyncSummary>> {
  const unique = Array.from(new Set(owners.filter(Boolean)));
  if (!unique.length) return {};
  const summaries: Record<string, SyncSummary> = {};
  const raws = await redis.mget<unknown[]>(...unique.map(summaryKey));
  unique.forEach((owner, index) => {
    const parsed = parseStored(raws?.[index]) as SyncSummary | null;
    summaries[owner] = parsed && typeof parsed === 'object' ? { ...EMPTY_SUMMARY, ...parsed, owner } : { owner, ...EMPTY_SUMMARY };
  });
  return summaries;
}
