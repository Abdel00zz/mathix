import { createHash } from 'node:crypto';
import {
  buildNotifyPayload,
  cleanupExpired,
  readActiveAccountSession,
  redis,
  resolveClassSubscribers,
  sendToSubscribers,
  type ApiRequest,
  type ApiResponse,
} from './shared.js';
import { inspectImageDataUri } from './imageValidation.js';
import {
  isLinkedStudentInClass,
  normalizeProfessorClassId,
  professorCanAccessClass,
  resolveProfessorClassAccess,
  type ProfessorClassAccess,
} from './access.js';

const TTL_SECONDS = 365 * 24 * 60 * 60;
const MAX_SHARED_IMAGES = 60;
const MAX_SHARED_IMAGE_CHARS = 850_000;

function parseObject(raw: unknown, fallback: Record<string, unknown> = {}): Record<string, any> {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : fallback;
  } catch {
    return fallback;
  }
}

function ownerKey(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 20);
}

/** Ancien format : une seule valeur contenant jusqu'à 60 images complètes. */
function legacySharedKey(phone: string): string {
  return `prof:shared:${ownerKey(phone)}`;
}

/** Index léger : métadonnées seulement, sans les data URI. */
function sharedIndexKey(phone: string): string {
  return `prof:shared:${ownerKey(phone)}:index`;
}

/** Une clé par image : chaque lecture ou écriture reste sous la limite de requête. */
function sharedImageKey(phone: string, imageId: string): string {
  return `prof:shared:${ownerKey(phone)}:img:${imageId}`;
}

interface SharedMeta {
  id: string;
  studentAccountId: string;
  studentName: string;
  classId: string;
  caption: string;
  createdAt: number;
}

const META_FIELDS = ['id', 'studentAccountId', 'studentName', 'classId', 'caption', 'createdAt'] as const;

function toMeta(image: Record<string, any>): SharedMeta {
  const meta: Record<string, unknown> = {};
  for (const field of META_FIELDS) meta[field] = image?.[field];
  return meta as unknown as SharedMeta;
}

/**
 * Liste des métadonnées. Si l'index n'existe pas encore, l'ancien format est
 * migré à la volée : chaque image passe sous sa propre clé, l'index est écrit,
 * puis l'ancienne valeur est supprimée.
 */
async function loadSharedIndex(phone: string): Promise<SharedMeta[]> {
  const rawIndex = await redis.get(sharedIndexKey(phone)) as unknown;
  if (rawIndex) {
    const parsed = parseObject(rawIndex, { images: [] });
    return Array.isArray(parsed.images) ? parsed.images as SharedMeta[] : [];
  }

  const legacy = parseObject(await redis.get(legacySharedKey(phone)) as unknown, { images: [] });
  const legacyImages: Record<string, any>[] = Array.isArray(legacy.images) ? legacy.images : [];
  if (legacyImages.length === 0) return [];

  for (const image of legacyImages) {
    if (!image?.id || typeof image.dataUri !== 'string') continue;
    await redis.set(sharedImageKey(phone, String(image.id)), JSON.stringify(image), { ex: TTL_SECONDS });
  }
  const metas = legacyImages.filter(image => image?.id && typeof image.dataUri === 'string').map(toMeta);
  await redis.set(sharedIndexKey(phone), JSON.stringify({ images: metas }), { ex: TTL_SECONDS });
  await redis.del(legacySharedKey(phone));
  return metas;
}

/** Recharge les images complètes d'une liste de métadonnées, en une seule requête. */
async function hydrateSharedImages(phone: string, metas: SharedMeta[]): Promise<Record<string, any>[]> {
  if (metas.length === 0) return [];
  const raws = await redis.mget(...metas.map(meta => sharedImageKey(phone, meta.id))) as unknown[];
  const images: Record<string, any>[] = [];
  metas.forEach((meta, index) => {
    const record = parseObject(raws?.[index]);
    if (typeof record.dataUri === 'string') images.push({ ...meta, ...record });
  });
  return images;
}

async function notifySharedImage(
  target: { accountId: string; name: string; classId: string },
  imageId: string,
): Promise<{ sent: number; failed: number }> {
  const { subs, orphans } = await resolveClassSubscribers(target.classId);
  // L'identifiant de compte est obligatoire : un ancien abonnement identifié
  // uniquement par un nom peut appartenir à un homonyme ou à un ancien élève.
  const targeted = subs.filter(sub => String(sub.data?.accountId || '') === target.accountId);
  if (targeted.length === 0) {
    await cleanupExpired(orphans.map(key => ({ key })));
    return { sent: 0, failed: 0 };
  }

  const payload = buildNotifyPayload({
    title: '🖼️ Image partagée',
    body: `Votre professeur vous a envoyé une image${target.name ? ` (${target.name})` : ''}. Touchez pour l'ouvrir.`,
    url: `/?shared=${imageId}`,
    tag: `shared-image-${imageId}`,
    type: 'shared-image',
    priority: 'high',
  });
  const { sent, failed, expired } = await sendToSubscribers(targeted, payload);
  await cleanupExpired([...expired, ...orphans.map(key => ({ key }))]);
  return { sent, failed };
}

/** Lecture élève : uniquement les images du professeur et de la classe actuels. */
export async function handleSharedListStudent(req: ApiRequest, res: ApiResponse) {
  const account = await readActiveAccountSession(req);
  if (!account) return res.status(401).json({ error: 'account_session_required' });
  const profId = String(account.user?.profId || '');
  const studentClassId = normalizeProfessorClassId(account.user?.classId);
  if (!profId || !studentClassId) return res.status(200).json({ images: [] });

  const prof = parseObject(await redis.get(`user:id:${profId}`) as unknown);
  const phone = String(prof.phone || '');
  if (
    prof.role !== 'prof'
    || !phone
    || !professorCanAccessClass(resolveProfessorClassAccess(prof), studentClassId)
  ) return res.status(200).json({ images: [] });

  const metas = (await loadSharedIndex(phone))
    .filter(meta => normalizeProfessorClassId(meta?.classId) === studentClassId);
  return res.status(200).json({ images: await hydrateSharedImages(phone, metas) });
}

export async function handleProfessorSharedAction(
  action: 'shared-save' | 'shared-list' | 'shared-delete',
  req: ApiRequest,
  res: ApiResponse,
  professor: { accountId: string; phone: string },
  access: ProfessorClassAccess,
  requestedClassId: string,
) {
  let metas = await loadSharedIndex(professor.phone);

  const visibleMetas = () => metas.filter(meta => {
    const imageClassId = normalizeProfessorClassId(meta?.classId);
    return professorCanAccessClass(access, imageClassId)
      && (!requestedClassId || imageClassId === requestedClassId);
  });
  const visibleImages = () => hydrateSharedImages(professor.phone, visibleMetas());

  if (action === 'shared-list') {
    return res.status(200).json({ images: await visibleImages() });
  }

  if (action === 'shared-delete') {
    const id = String(req.body?.id || '').trim().slice(0, 80);
    const target = metas.find(meta => meta?.id === id);
    if (target && !professorCanAccessClass(access, target.classId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }
    metas = metas.filter(meta => meta?.id !== id);
    await redis.set(sharedIndexKey(professor.phone), JSON.stringify({ images: metas }), { ex: TTL_SECONDS });
    if (target) await redis.del(sharedImageKey(professor.phone, id));
    return res.status(200).json({ success: true, images: await visibleImages() });
  }

  // La destination de partage doit être explicite. La classe mémorisée dans
  // une séance ne peut jamais étendre la portée de cette écriture.
  if (!requestedClassId) return res.status(400).json({ error: 'class_id_required' });
  const dataUri = String(req.body?.dataUri || '');
  const studentAccountId = String(req.body?.studentAccountId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
  const caption = String(req.body?.caption || '').trim().slice(0, 200);
  if (!studentAccountId) return res.status(400).json({ error: 'Élève requis' });
  if (!/^data:image\/(?:png|jpe?g);base64,/i.test(dataUri)) {
    return res.status(400).json({ error: 'Image PNG/JPEG requise' });
  }
  if (dataUri.length > MAX_SHARED_IMAGE_CHARS) {
    return res.status(413).json({ error: 'Image trop volumineuse' });
  }

  const student = parseObject(await redis.get(`user:id:${studentAccountId}`) as unknown);
  if (!student.accountId || !isLinkedStudentInClass(student, professor.accountId, requestedClassId)) {
    return res.status(403).json({ error: 'student_not_linked_to_professor' });
  }
  const imageClassId = normalizeProfessorClassId(student.classId);
  if (!professorCanAccessClass(access, imageClassId)) {
    return res.status(403).json({ error: 'professor_class_access_denied' });
  }
  const studentName = String(student.name || '').trim().slice(0, 80);
  if (!studentName) return res.status(409).json({ error: 'student_profile_incomplete' });

  // Contrôle binaire APRÈS l'autorisation : le préfixe du data URI est déclaré
  // par le client, la signature doit correspondre au type annoncé.
  const inspected = inspectImageDataUri(dataUri, { allowed: ['image/png', 'image/jpeg'] });
  if (inspected.ok === false) {
    return res.status(400).json({ error: inspected.error === 'dimensions_too_large' ? 'Image trop grande' : 'Image PNG/JPEG invalide' });
  }

  const image = {
    id: `share_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    studentAccountId,
    studentName,
    classId: imageClassId,
    caption,
    dataUri,
    createdAt: Date.now(),
  };
  // Image d'abord, index ensuite : un index ne référence jamais une image absente.
  await redis.set(sharedImageKey(professor.phone, image.id), JSON.stringify(image), { ex: TTL_SECONDS });
  const nextMetas = [toMeta(image), ...metas];
  const dropped = nextMetas.slice(MAX_SHARED_IMAGES);
  metas = nextMetas.slice(0, MAX_SHARED_IMAGES);
  await redis.set(sharedIndexKey(professor.phone), JSON.stringify({ images: metas }), { ex: TTL_SECONDS });
  for (const old of dropped) await redis.del(sharedImageKey(professor.phone, old.id));

  const notify = await notifySharedImage({
    accountId: studentAccountId,
    name: studentName,
    classId: imageClassId,
  }, image.id).catch(() => ({ sent: 0, failed: 0 }));

  return res.status(200).json({ success: true, image, notify });
}
