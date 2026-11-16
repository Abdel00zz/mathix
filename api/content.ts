import { createHash } from 'node:crypto';
import { redis, isAdmin, readActiveAccountSession, readActiveProfessorSession, type ApiRequest } from '../src/server/professor/shared.js';
import { inspectImageDataUri, MAX_IMAGE_EDGE } from '../src/server/professor/imageValidation.js';
import {
  professorCanAccessClass,
  professorCanAccessDataPath,
  resolveProfessorClassAccess,
  type ProfessorClassAccess,
} from '../src/server/professor/access.js';
import {
  MAX_FILE_CHARS,
  OFFICIAL_FILES_KEY,
  OFFICIAL_VERSION_KEY,
  SAVE_CONTENT_SCRIPT,
  appendMessage,
  applyEntries,
  buildCandidateTree,
  defaultPushMessage,
  deleteProposal,
  frozenOfficialFiles,
  isValidDataPath,
  listProposals,
  markThreadRead,
  officialFileKey,
  parseStored,
  profKeys,
  profOwner,
  readOfficialAtBaseline,
  readProposal,
  readSummaries,
  readThread,
  resolveBaseline,
  sanitizeText,
  writeProposal,
  writeSummary,
  type ContentBaseline,
  type Proposal,
  type ProposalEntry,
} from '../src/server/content/sync.js';

// ============================================================================
// CONTENT OVERRIDES — édition du contenu de la plateforme depuis l'admin.
//
// Les fichiers statiques de /public/data sont figés au déploiement (Vercel).
// Pour éditer le contenu en temps réel sans redéployer, l'admin publie des
// « overrides » stockés dans Redis :
//   content:files            → hash  { "data/…/x.json": updatedAt }  (manifest)
//   content:file:{path}      → JSON du fichier remplacé
//   content:media            → hash  { id: {name,type,size,uploadedAt} }
//   content:media:{id}       → data-URI de l'image
//
// Côté app, contentOverrides.ts charge le manifest une fois au boot et
// redirige les fetchs des chemins remplacés vers ?action=file.
// Lecture publique (le contenu est déjà public en statique) ; écriture admin.
//
// ISOLATION — un professeur écrit dans son propre namespace
// (content:files:{owner}) et, depuis l'activation de son badge, ne reçoit plus
// l'officiel publié après cette date. Le gel et la livraison explicite des
// mises à jour vivent dans src/server/content/sync.ts.
// ============================================================================

// Réponse enrichie : les fonctions Vercel exposent setHeader/send pour servir
// les médias binaires (le type partagé de _shared ne déclare que json).
type ContentApiResponse = {
  status: (code: number) => ContentApiResponse;
  json: (payload: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  send?: (body: unknown) => void;
};

const MEDIA_KEY = 'content:media';

const DELETE_CONTENT_SCRIPT = `
redis.call('DEL', KEYS[2])
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`;

const SAVE_MEDIA_SCRIPT = `
redis.call('SET', KEYS[2], ARGV[2])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1
`;

const DELETE_MEDIA_SCRIPT = `
redis.call('DEL', KEYS[2])
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`;

// Upstash limite la taille des requêtes (~1 Mo) : plafond de sécurité médias.
const MAX_MEDIA_CHARS = 950_000;

const TITLE_MAX_CHARS = 120;
const MESSAGE_MAX_CHARS = 2_000;

// Journal d'audit des publications (consultable par l'admin).
const AUDIT_KEY = 'content:audit';
const AUDIT_MAX = 200;

type ContentActor =
  | { kind: 'admin'; owner: 'admin' }
  | { kind: 'prof'; owner: string; accountId: string; access: ProfessorClassAccess; user: Record<string, any> };

/** Trace non bloquante d'une publication/suppression (acteur + chemin + date). */
async function logAudit(actor: ContentActor, path: string, action: 'save' | 'delete'): Promise<void> {
  try {
    await redis.lpush(AUDIT_KEY, JSON.stringify({
      at: Date.now(),
      actor: actor.kind === 'admin' ? 'admin' : actor.owner,
      path,
      action,
    }));
    await redis.ltrim(AUDIT_KEY, 0, AUDIT_MAX - 1);
  } catch { /* l'audit ne doit jamais bloquer la publication */ }
}

async function resolveContentActor(req: ApiRequest): Promise<ContentActor | null> {
  const actorHint = req.headers?.['x-content-actor'];
  // Le mode admin doit être demandé explicitement. Un ancien secret encore
  // présent dans l'onglet ne peut donc plus changer silencieusement la cible.
  if (actorHint === 'admin') {
    return isAdmin(req) ? { kind: 'admin', owner: 'admin' } : null;
  }
  const session = await readActiveProfessorSession(req);
  if (session) {
    const owner = profOwner(session.phone);
    const userRaw = await redis.get(`user:id:${session.accountId}`) as unknown;
    const user = parseStored(userRaw) as Record<string, any> | null;
    if (!user || typeof user !== 'object') return null;
    return {
      kind: 'prof',
      owner,
      accountId: String(session.accountId || ''),
      access: resolveProfessorClassAccess(user),
      user,
    };
  }
  // Compatibilité pour les appels de l'ancienne console admin : ils restent
  // acceptés uniquement s'il n'existe aucune session professeur active.
  if (actorHint !== 'professor' && isAdmin(req)) return { kind: 'admin', owner: 'admin' };
  return null;
}

/**
 * La séance n'est jamais une source d'autorisation. Seule la portée canonique
 * du compte (`all` / `selected` / `none`) décide des chemins éditables.
 */
function actorCanEditPath(actor: ContentActor, path: string): boolean {
  if (actor.kind === 'admin') return true;
  return professorCanAccessDataPath(actor.access, path);
}

/** Clés de stockage : officiel (admin) ou isolé par identité du prof. */
function actorKeys(actor: ContentActor) {
  if (actor.kind === 'admin') {
    return { files: OFFICIAL_FILES_KEY, file: officialFileKey, version: OFFICIAL_VERSION_KEY };
  }
  return profKeys(actor.owner);
}

interface OverrideReader {
  owner: string;
  access: ProfessorClassAccess;
  /** Gel du professeur (null = compte promu avant `roleUpdatedAt`). */
  baseline: ContentBaseline | null;
}

/** Namespace privé et chemins lisibles du compte connecté. */
async function resolveOverrideReader(req: ApiRequest): Promise<OverrideReader | null> {
  if (req.headers?.['x-content-actor'] === 'admin' && isAdmin(req)) return null;
  const session = await readActiveAccountSession(req);
  const user = session?.user;
  if (!user) return null;
  if (user.role === 'prof' && user.phone) {
    const owner = profOwner(String(user.phone));
    return {
      owner,
      access: resolveProfessorClassAccess(user),
      baseline: await resolveBaseline(owner, user),
    };
  }
  if (user.profId) {
    const prof = parseStored(await redis.get(`user:id:${user.profId}`) as unknown) as Record<string, any> | null;
    const studentClassId = String(user.classId || '').trim();
    const professorAccess = resolveProfessorClassAccess(prof);
    if (prof?.role === 'prof' && prof.phone && studentClassId && professorCanAccessClass(professorAccess, studentClassId)) {
      // Le namespace reste celui du professeur, mais un élève ne reçoit que
      // les fichiers de son niveau actuel — jamais tout le catalogue privé.
      // Le gel est celui du professeur : l'élève voit exactement ce que son
      // enseignant a validé, jamais une publication officielle plus récente.
      const owner = profOwner(String(prof.phone));
      return {
        owner,
        access: resolveProfessorClassAccess({
          profClassScope: 'selected',
          profClasses: [studentClassId],
        }),
        baseline: await resolveBaseline(owner, prof),
      };
    }
  }
  return null;
}

// ── Manifest des overrides (public : l'app le charge au boot) ───────────────
async function handleManifest(req: ApiRequest, res: ContentApiResponse) {
  const reader = await resolveOverrideReader(req);
  // Lecteur gelé : la part officielle n'est plus le manifeste vivant mais la
  // photo prise à l'activation du badge prof. Rien de plus récent n'entre.
  const official = reader?.baseline
    ? await frozenOfficialFiles(reader.owner, reader.baseline)
    : (await redis.hgetall(OFFICIAL_FILES_KEY)) || {};
  const rawOwnerFiles = reader ? (await redis.hgetall(profKeys(reader.owner).files)) || {} : {};
  const ownerFiles = reader
    ? Object.fromEntries(Object.entries(rawOwnerFiles).filter(([path]) => professorCanAccessDataPath(reader.access, path)))
    : {};
  // Les overrides du prof (ou du prof de l'élève) priment sur l'officiel.
  const files = { ...official, ...ownerFiles };
  res.setHeader?.('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader?.('Vary', 'Cookie');
  return res.status(200).json({ files });
}

// ── Lecture d'un fichier remplacé (public) ──────────────────────────────────
async function handleFile(req: ApiRequest, res: ContentApiResponse) {
  const path = req.query?.path;
  if (!isValidDataPath(path)) return res.status(400).json({ error: 'Invalid path' });

  // L'override du prof (ou du prof de l'élève) prime sur l'officiel.
  const reader = await resolveOverrideReader(req);
  let raw: unknown = null;
  if (reader && professorCanAccessDataPath(reader.access, path)) {
    raw = await redis.get(profKeys(reader.owner).file(path));
  }
  if (raw !== null && raw !== undefined) {
    res.setHeader?.('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader?.('Vary', 'Cookie');
    return res.status(200).json(parseStored(raw));
  }

  if (reader?.baseline) {
    // Gelé : on sert la révision officielle telle qu'elle était à la date
    // d'activation du badge, jamais celle publiée depuis.
    const frozen = await readOfficialAtBaseline(reader.owner, path, reader.baseline);
    if (!frozen.found) return res.status(404).json({ error: 'No override for this path' });
    res.setHeader?.('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader?.('Vary', 'Cookie');
    return res.status(200).json(frozen.content);
  }

  raw = await redis.get(officialFileKey(path));
  if (raw === null || raw === undefined) return res.status(404).json({ error: 'No override for this path' });

  // Le stockage conserve actuellement uniquement la dernière révision. Tant
  // que chaque version n'a pas sa propre clé, cette URL ne peut être immuable.
  res.setHeader?.('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader?.('Vary', 'Cookie');
  return res.status(200).json(parseStored(raw));
}

// ── Publication d'un override (admin) ───────────────────────────────────────
async function handleSave(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path, content } = req.body || {};
  if (!isValidDataPath(path)) return res.status(400).json({ error: 'Invalid path (attendu: data/**/*.json)' });
  if (!actorCanEditPath(actor, path)) return res.status(403).json({ error: 'Contenu hors de votre classe' });
  if (content === undefined || content === null) return res.status(400).json({ error: 'Missing content' });

  // Le contenu doit être un JSON valide (objet déjà parsé ou chaîne parsable).
  let parsed: unknown = content;
  if (typeof content === 'string') {
    try { parsed = JSON.parse(content); } catch {
      return res.status(400).json({ error: 'Le contenu n\'est pas un JSON valide' });
    }
  }
  const serialized = JSON.stringify(parsed);
  if (serialized.length > MAX_FILE_CHARS) {
    return res.status(413).json({ error: `Fichier trop volumineux (${serialized.length} > ${MAX_FILE_CHARS} caractères)` });
  }

  const keys = actorKeys(actor);

  // Historique des versions : conserve la révision précédente (best-effort,
  // hors du script atomique — une perte d'historique n'invalide pas la publication).
  const historyKey = `${keys.file(path)}:history`;
  const previous = await redis.get(keys.file(path));
  if (previous !== null && previous !== undefined) {
    try {
      await redis.lpush(historyKey, JSON.stringify({ at: Date.now(), content: parseStored(previous) }));
      await redis.ltrim(historyKey, 0, 19);
    } catch { /* non bloquant */ }
  }

  const updatedAt = Number(await redis.eval(SAVE_CONTENT_SCRIPT, [
    keys.files,
    keys.file(path),
    keys.version,
  ], [path, serialized, String(Date.now())]));

  await logAudit(actor, path, 'save');
  return res.status(200).json({ success: true, path, updatedAt });
}

// ── Suppression d'un override → retour au fichier statique (admin) ──────────
async function handleDelete(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path } = req.body || {};
  if (!isValidDataPath(path)) return res.status(400).json({ error: 'Invalid path' });
  if (!actorCanEditPath(actor, path)) return res.status(403).json({ error: 'Contenu hors de votre classe' });

  const keys = actorKeys(actor);
  await redis.eval(DELETE_CONTENT_SCRIPT, [keys.files, keys.file(path)], [path]);

  await logAudit(actor, path, 'delete');
  return res.status(200).json({ success: true, path });
}

// ── Médias : upload base64 (admin) ──────────────────────────────────────────
async function handleMediaUpload(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, dataUri, folder } = req.body || {};
  if (typeof dataUri === 'string' && dataUri.length > MAX_MEDIA_CHARS) {
    return res.status(413).json({ error: `Image trop lourde (max ~700 Ko). Compressez-la avant l'upload.` });
  }
  // Le préfixe est déclaré par le client : on vérifie la signature binaire et on
  // lit les dimensions pour les restituer (plus de saut de mise en page au chargement).
  const inspected = inspectImageDataUri(dataUri);
  if (inspected.ok === false) {
    const messages: Record<string, string> = {
      invalid_data_uri: 'dataUri invalide (image attendue)',
      unsupported_type: 'Format non pris en charge (PNG, JPEG, WebP ou GIF).',
      type_mismatch: 'Le contenu du fichier ne correspond pas au type annoncé.',
      unreadable: 'Image illisible ou corrompue.',
      dimensions_too_large: `Image trop grande (maximum ${MAX_IMAGE_EDGE} px de côté).`,
    };
    return res.status(400).json({ error: messages[inspected.error] || 'Image invalide' });
  }

  const safeName = String(name || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const safeFolder = String(folder || '')
    .replace(/[^a-z0-9_\-/]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .slice(0, 160);
  // handleMedia ne sert que image/jpeg : on normalise l'alias historique image/jpg.
  const storedUri = (dataUri as string).replace(/^data:image\/jpg;/i, 'data:image/jpeg;');
  const digest = createHash('sha256').update(`${actor.owner}:${storedUri}`).digest('hex').slice(0, 18);
  const id = `${digest}-${safeName}`;
  const type = inspected.mime;
  const meta = {
    name: safeName,
    type,
    size: storedUri.length,
    width: inspected.width,
    height: inspected.height,
    uploadedAt: Date.now(),
    owner: actor.owner,
    folder: safeFolder,
  };

  await redis.eval(SAVE_MEDIA_SCRIPT, [MEDIA_KEY, `content:media:${id}`], [id, storedUri, JSON.stringify(meta)]);

  return res.status(200).json({ success: true, id, url: `/api/content?action=media&id=${encodeURIComponent(id)}`, ...meta });
}

// ── Médias : lecture binaire (public — référencé par les src des JSON) ──────
async function handleMedia(req: ApiRequest, res: ContentApiResponse) {
  const id = req.query?.id;
  if (!id || !/^[a-z0-9_.-]+$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const dataUri = (await redis.get(`content:media:${id}`)) as string | null;
  if (!dataUri || typeof dataUri !== 'string') return res.status(404).json({ error: 'Media not found' });

  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,/i.exec(dataUri);
  if (!match) {
    return res.status(415).json({ error: 'Unsupported legacy media type' });
  }
  const mime = match[1].toLowerCase();
  const comma = match[0].length - 1;
  const buffer = Buffer.from(dataUri.slice(comma + 1), 'base64');

  if (res.setHeader && res.send) {
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200);
    res.send(buffer);
    return;
  }
  // Repli improbable si send indisponible
  return res.status(200).json({ dataUri });
}

// ── Médias : liste (admin) ───────────────────────────────────────────────────
async function handleMediaList(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  const raw = (await redis.hgetall(MEDIA_KEY)) || {};
  const media = Object.entries(raw).map(([id, meta]) => {
    const parsed = parseStored(meta) as Record<string, unknown> | null;
    return {
      id,
      url: `/api/content?action=media&id=${encodeURIComponent(id)}`,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  }).filter((item: any) => actor.kind === 'admin' || item.owner === actor.owner);
  media.sort((a: any, b: any) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
  return res.status(200).json({ media });
}

// ── Médias : suppression (admin) ─────────────────────────────────────────────
async function handleMediaDelete(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id || !/^[a-z0-9_.-]+$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });

  if (actor.kind === 'prof') {
    const rawMeta = await redis.hget(MEDIA_KEY, id);
    const meta = parseStored(rawMeta) as Record<string, unknown> | null;
    if (!meta || meta.owner !== actor.owner) return res.status(403).json({ error: 'Média hors de votre espace' });
  }

  await redis.eval(DELETE_MEDIA_SCRIPT, [MEDIA_KEY, `content:media:${id}`], [id]);

  return res.status(200).json({ success: true });
}

// ── Journal d'audit des publications (admin) ────────────────────────────────
async function handleAudit(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const raw = (await redis.lrange(AUDIT_KEY, 0, AUDIT_MAX - 1)) as unknown[];
  const audit = raw.map(entry => parseStored(entry)).filter(Boolean);
  return res.status(200).json({ audit });
}

// ── Historique des versions d'un fichier ────────────────────────────────────
async function handleHistory(req: ApiRequest, res: ContentApiResponse) {
  const path = req.query?.path;
  if (!isValidDataPath(path)) return res.status(400).json({ error: 'Invalid path' });
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (!actorCanEditPath(actor, path)) return res.status(403).json({ error: 'Contenu hors de votre classe' });
  const keys = actorKeys(actor);
  const raw = (await redis.lrange(`${keys.file(path)}:history`, 0, 19)) as unknown[];
  const history = raw.map(entry => parseStored(entry)).filter(Boolean);
  return res.status(200).json({ history });
}

// ── Export / import / reset du contenu propre à l'acteur ────────────────────

/** Tous les fichiers d'un namespace, filtrés sur une portée de classes. */
async function exportOwnerFiles(
  keys: { files: string; file: (path: string) => string },
  canRead: (path: string) => boolean,
): Promise<Record<string, unknown>> {
  const manifest = (await redis.hgetall(keys.files)) || {};
  const paths = Object.keys(manifest).filter(canRead);
  const files: Record<string, unknown> = {};
  if (!paths.length) return files;
  if (typeof (redis as any).mget === 'function') {
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const slice = paths.slice(i, i + CHUNK);
      const raws = await (redis as any).mget(...slice.map(p => keys.file(p))) as unknown[];
      slice.forEach((p, idx) => {
        const raw = raws?.[idx];
        if (raw !== null && raw !== undefined) files[p] = parseStored(raw);
      });
    }
    return files;
  }
  for (const path of paths) {
    const raw = await redis.get(keys.file(path));
    if (raw !== null && raw !== undefined) files[path] = parseStored(raw);
  }
  return files;
}

async function handleExport(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  const files = await exportOwnerFiles(actorKeys(actor), path => actorCanEditPath(actor, path));
  return res.status(200).json({ files, exportedAt: Date.now() });
}

async function handleImport(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { files } = req.body || {};
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    return res.status(400).json({ error: 'Fichiers invalides (objet { path: contenu } attendu)' });
  }
  const keys = actorKeys(actor);
  for (const [path, content] of Object.entries(files as Record<string, unknown>)) {
    if (!isValidDataPath(path) || !actorCanEditPath(actor, path)) continue;
    const serialized = JSON.stringify(content);
    if (serialized.length > MAX_FILE_CHARS) continue;
    await redis.eval(SAVE_CONTENT_SCRIPT, [keys.files, keys.file(path), keys.version], [path, serialized, String(Date.now())]);
    await logAudit(actor, path, 'save');
  }
  return res.status(200).json({ success: true });
}

async function handleReset(req: ApiRequest, res: ContentApiResponse) {
  const actor = await resolveContentActor(req);
  if (!actor) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keys = actorKeys(actor);
  const manifest = (await redis.hgetall(keys.files)) || {};
  for (const path of Object.keys(manifest)) {
    if (!actorCanEditPath(actor, path)) continue;
    await redis.eval(DELETE_CONTENT_SCRIPT, [keys.files, keys.file(path)], [path]);
  }
  return res.status(200).json({ success: true });
}

// ════════════════════════════════════════════════════════════════════════════
// LIVRAISON DES MISES À JOUR — admin → professeur
//
// Le gel (plus haut) coupe la contamination ; ces actions rouvrent un canal
// explicite. L'admin *propose*, le professeur *applique*. Rien n'est écrit dans
// l'espace du professeur sans une action de sa part, et la portée canonique de
// son compte est revérifiée à l'application (une case cochée par l'admin ne
// crée aucun droit).
// ════════════════════════════════════════════════════════════════════════════

interface AdminTarget {
  accountId: string;
  owner: string;
  user: Record<string, any>;
  access: ProfessorClassAccess;
  baseline: ContentBaseline | null;
}

/** Professeur visé par une action admin, désigné par son `accountId`. */
async function resolveAdminTarget(req: ApiRequest): Promise<AdminTarget | null> {
  const accountId = String(req.query?.accountId || req.body?.accountId || '').trim();
  if (!accountId || !/^[A-Za-z0-9_-]{1,80}$/.test(accountId)) return null;
  const user = parseStored(await redis.get(`user:id:${accountId}`) as unknown) as Record<string, any> | null;
  // Seul un compte portant réellement le badge prof a un espace à alimenter.
  if (!user || typeof user !== 'object' || user.role !== 'prof' || !user.phone) return null;
  const owner = profOwner(String(user.phone));
  return {
    accountId,
    owner,
    user,
    access: resolveProfessorClassAccess(user),
    baseline: await resolveBaseline(owner, user),
  };
}

/** Identité affichable du professeur, sans divulguer plus que la table admin. */
function targetIdentity(target: AdminTarget) {
  return {
    accountId: target.accountId,
    name: String(target.user.name || ''),
    classId: String(target.user.classId || ''),
    profClassScope: target.user.profClassScope || 'none',
    profClasses: Array.isArray(target.user.profClasses) ? target.user.profClasses : [],
    frozenAt: target.baseline?.at || 0,
  };
}

/** Chemins demandés → entrées de proposition, validées côté serveur. */
const PUSH_ENTRIES_MAX = 200;

function readPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => String(item || '')).filter(isValidDataPath))).slice(0, PUSH_ENTRIES_MAX);
}

// ── Admin : arbre des mises à jour livrables ─────────────────────────────────
async function handlePushPreview(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });

  const tree = await buildCandidateTree({
    owner: target.owner,
    access: target.access,
    baselineAt: target.baseline?.at || 0,
  });
  return res.status(200).json({ tree, prof: targetIdentity(target) });
}

// ── Admin : envoi d'une proposition ─────────────────────────────────────────
async function handlePushSend(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });

  const paths = readPaths(req.body?.paths);
  if (!paths.length) return res.status(400).json({ error: 'Sélectionnez au moins une ressource' });

  // Les métadonnées de la proposition viennent de l'arbre serveur, jamais du
  // client : un chemin hors portée ou déjà connu du professeur n'y est pas.
  const tree = await buildCandidateTree({
    owner: target.owner,
    access: target.access,
    baselineAt: target.baseline?.at || 0,
  });
  const candidates = new Map(tree.classes.flatMap(entry => entry.chapters.flatMap(chapter => (
    chapter.entries.map(item => [item.path, item] as const)
  ))));
  const entries: ProposalEntry[] = paths
    .map(path => candidates.get(path))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(item => ({
      path: item.path,
      kind: item.kind,
      classId: item.classId,
      chapterId: item.chapterId,
      label: item.label,
      conflict: item.conflict,
    }));
  if (!entries.length) return res.status(400).json({ error: 'Aucune de ces ressources n\'est livrable à ce professeur' });

  const classTitles = Object.fromEntries(tree.classes.map(entry => [entry.classId, entry.classTitle]));
  const fallback = defaultPushMessage(entries, classTitles);
  const proposal: Proposal = {
    id: `${Date.now().toString(36)}-${createHash('sha1').update(paths.join('|')).digest('hex').slice(0, 6)}`,
    at: Date.now(),
    title: sanitizeText(req.body?.title, TITLE_MAX_CHARS) || fallback.title,
    message: sanitizeText(req.body?.message, MESSAGE_MAX_CHARS) || fallback.message,
    entries,
    status: 'pending',
  };
  await writeProposal(target.owner, proposal);
  return res.status(200).json({ success: true, proposal });
}

// ── Admin : suivi des propositions ──────────────────────────────────────────
async function handlePushList(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });
  const proposals = await listProposals(target.owner);
  return res.status(200).json({ proposals, prof: targetIdentity(target) });
}

async function handlePushCancel(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });
  const id = String(req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Proposition introuvable' });

  const proposal = await readProposal(target.owner, id);
  if (!proposal) return res.status(404).json({ error: 'Proposition introuvable' });
  // Une proposition déjà décidée fait partie de l'historique du professeur.
  if (proposal.status !== 'pending') return res.status(409).json({ error: 'Cette proposition a déjà été traitée' });
  await deleteProposal(target.owner, id);
  return res.status(200).json({ success: true });
}

// ── Admin : pastilles de toute la table en une lecture ──────────────────────
async function handleSyncOverview(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const accountIds = Array.from(new Set(
    (Array.isArray(req.body?.accountIds) ? req.body.accountIds : [])
      .map((item: unknown) => String(item || '').trim())
      .filter((item: string) => /^[A-Za-z0-9_-]{1,80}$/.test(item)),
  )).slice(0, 300) as string[];
  if (!accountIds.length) return res.status(200).json({ summaries: {} });

  const users = await redis.mget<unknown[]>(...accountIds.map(id => `user:id:${id}`));
  const owners: Record<string, string> = {};
  accountIds.forEach((accountId, index) => {
    const user = parseStored(users?.[index]) as Record<string, any> | null;
    if (user?.role === 'prof' && user.phone) owners[accountId] = profOwner(String(user.phone));
  });
  const byOwner = await readSummaries(Object.values(owners));
  const summaries = Object.fromEntries(
    Object.entries(owners).map(([accountId, owner]) => [accountId, byOwner[owner]]),
  );
  return res.status(200).json({ summaries });
}

// ── Admin : sauvegarde du contenu d'un professeur ───────────────────────────
async function handleProfExport(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });
  // Uniquement le namespace du professeur : l'officiel n'y entre jamais.
  const files = await exportOwnerFiles(profKeys(target.owner), () => true);
  return res.status(200).json({ files, exportedAt: Date.now(), prof: targetIdentity(target) });
}

// ── Messagerie admin ↔ professeur ───────────────────────────────────────────
async function handleAdminMessage(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });
  const message = await appendMessage(target.owner, 'admin', String(req.body?.body || ''));
  if (!message) return res.status(400).json({ error: 'Message vide' });
  return res.status(200).json({ success: true, message });
}

async function handleAdminThread(req: ApiRequest, res: ContentApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const target = await resolveAdminTarget(req);
  if (!target) return res.status(404).json({ error: 'Professeur introuvable' });
  const messages = await readThread(target.owner);
  // Ouvrir le fil vaut lecture : la pastille de la table s'éteint.
  await markThreadRead(target.owner, 'admin');
  return res.status(200).json({ messages, prof: targetIdentity(target) });
}

// ── Professeur : réception ──────────────────────────────────────────────────
interface ProfContext {
  owner: string;
  accountId: string;
  access: ProfessorClassAccess;
  user: Record<string, any>;
  baseline: ContentBaseline | null;
}

/** Contexte du professeur connecté, gel compris. */
async function resolveProfContext(req: ApiRequest): Promise<ProfContext | null> {
  const actor = await resolveContentActor(req);
  if (!actor || actor.kind !== 'prof') return null;
  return {
    owner: actor.owner,
    accountId: actor.accountId,
    access: actor.access,
    user: actor.user,
    baseline: await resolveBaseline(actor.owner, actor.user),
  };
}

/**
 * État léger, appelé en boucle par le poste du professeur.
 *
 * Volontairement pauvre : le résumé dénormalisé est une seule lecture. L'arbre
 * des mises à jour disponibles, lui, ne se calcule qu'à l'ouverture du panneau.
 */
async function handleSyncStatus(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  const proposals = await listProposals(prof.owner);
  const pending = proposals.filter(entry => entry.status === 'pending');
  const messages = await readThread(prof.owner);
  return res.status(200).json({
    pending: pending.length,
    lastProposal: pending[0] || null,
    unread: messages.filter(message => message.from === 'admin' && !message.readAt).length,
    lastMessageAt: messages.length ? messages[messages.length - 1].at : 0,
    frozenAt: prof.baseline?.at || 0,
  });
}

/** Tout ce qu'il faut pour ouvrir le centre de mise à jour du professeur. */
async function handleSyncInbox(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  const [proposals, messages, tree] = await Promise.all([
    listProposals(prof.owner),
    readThread(prof.owner),
    buildCandidateTree({ owner: prof.owner, access: prof.access, baselineAt: prof.baseline?.at || 0 }),
  ]);
  return res.status(200).json({
    proposals,
    messages,
    tree,
    frozenAt: prof.baseline?.at || 0,
  });
}

/** Mises à jour que le professeur va chercher de sa propre initiative. */
async function handleSyncAvailable(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  const tree = await buildCandidateTree({
    owner: prof.owner,
    access: prof.access,
    baselineAt: prof.baseline?.at || 0,
  });
  return res.status(200).json({ tree, frozenAt: prof.baseline?.at || 0 });
}

// ── Professeur : application ────────────────────────────────────────────────
async function handleSyncApply(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const proposalId = String(req.body?.proposalId || '').trim();
  // Une proposition est lue dans le hash du professeur : celle d'un autre est
  // structurellement hors d'atteinte.
  const proposal = proposalId ? await readProposal(prof.owner, proposalId) : null;
  if (proposalId && !proposal) return res.status(404).json({ error: 'Proposition introuvable' });

  const requested = readPaths(req.body?.paths);
  const paths = proposal
    ? (requested.length
      ? proposal.entries.filter(entry => requested.includes(entry.path)).map(entry => entry.path)
      : proposal.entries.map(entry => entry.path))
    : requested;
  if (!paths.length) return res.status(400).json({ error: 'Sélectionnez au moins une ressource' });

  const outcome = await applyEntries({
    owner: prof.owner,
    access: prof.access,
    paths,
    baseline: prof.baseline,
  });

  if (proposal) {
    const applied = new Set([...(proposal.applied || []), ...outcome.applied]);
    const total = proposal.entries.length;
    const next: Proposal = {
      ...proposal,
      applied: Array.from(applied),
      status: applied.size >= total ? 'applied' : 'partial',
      decidedAt: Date.now(),
    };
    await writeProposal(prof.owner, next);
    return res.status(200).json({ success: true, ...outcome, proposal: next });
  }

  // Service libre : pas de proposition à décider, mais la pastille admin doit
  // refléter l'état du professeur.
  await writeSummary(prof.owner);
  return res.status(200).json({ success: true, ...outcome });
}

async function handleSyncDecline(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const proposal = await readProposal(prof.owner, String(req.body?.proposalId || '').trim());
  if (!proposal) return res.status(404).json({ error: 'Proposition introuvable' });
  const declined = readPaths(req.body?.paths);
  const next: Proposal = {
    ...proposal,
    declined: declined.length ? declined : proposal.entries.map(entry => entry.path),
    status: (proposal.applied || []).length ? 'partial' : 'declined',
    decidedAt: Date.now(),
  };
  await writeProposal(prof.owner, next);
  return res.status(200).json({ success: true, proposal: next });
}

// ── Professeur : réponse et accusé de lecture ───────────────────────────────
async function handleProfMessage(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const message = await appendMessage(prof.owner, 'prof', String(req.body?.body || ''));
  if (!message) return res.status(400).json({ error: 'Message vide' });
  return res.status(200).json({ success: true, message });
}

async function handleMessageRead(req: ApiRequest, res: ContentApiResponse) {
  const prof = await resolveProfContext(req);
  if (!prof) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  await markThreadRead(prof.owner, 'prof');
  return res.status(200).json({ success: true });
}

// ── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req: ApiRequest, res: ContentApiResponse) {
  const action = req.query?.action || req.body?.action;

  try {
    switch (action) {
      case 'manifest':     return await handleManifest(req, res);
      case 'file':         return await handleFile(req, res);
      case 'save':         return await handleSave(req, res);
      case 'delete':       return await handleDelete(req, res);
      case 'media':        return await handleMedia(req, res);
      case 'media-upload': return await handleMediaUpload(req, res);
      case 'media-list':   return await handleMediaList(req, res);
      case 'media-delete': return await handleMediaDelete(req, res);
      case 'audit':        return await handleAudit(req, res);
      case 'history':      return await handleHistory(req, res);
      case 'export':       return await handleExport(req, res);
      case 'import':       return await handleImport(req, res);
      case 'reset':        return await handleReset(req, res);
      // Livraison des mises à jour — côté admin
      case 'push-preview':   return await handlePushPreview(req, res);
      case 'push-send':      return await handlePushSend(req, res);
      case 'push-list':      return await handlePushList(req, res);
      case 'push-cancel':    return await handlePushCancel(req, res);
      case 'sync-overview':  return await handleSyncOverview(req, res);
      case 'prof-export':    return await handleProfExport(req, res);
      case 'admin-message':  return await handleAdminMessage(req, res);
      case 'admin-thread':   return await handleAdminThread(req, res);
      // Livraison des mises à jour — côté professeur
      case 'sync-status':    return await handleSyncStatus(req, res);
      case 'sync-inbox':     return await handleSyncInbox(req, res);
      case 'sync-available': return await handleSyncAvailable(req, res);
      case 'sync-apply':     return await handleSyncApply(req, res);
      case 'sync-decline':   return await handleSyncDecline(req, res);
      case 'prof-message':   return await handleProfMessage(req, res);
      case 'message-read':   return await handleMessageRead(req, res);
      default:
        return res.status(400).json({ error: 'Missing or invalid action. Use ?action=manifest|file|save|delete|media|media-upload|media-list|media-delete|audit|history|export|import|reset|push-preview|push-send|push-list|push-cancel|sync-overview|prof-export|admin-message|admin-thread|sync-status|sync-inbox|sync-available|sync-apply|sync-decline|prof-message|message-read' });
    }
  } catch (error: any) {
    console.error('Content handler error:', error);
    return res.status(500).json({ error: 'Service de contenu temporairement indisponible' });
  }
}
