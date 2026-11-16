import { createHash } from 'node:crypto';
import {
  readActiveProfessorSession,
  redis,
  type ApiRequest,
  type ApiResponse,
} from '../src/server/professor/shared.js';
import {
  isLinkedStudentInClass,
  normalizeProfessorClassId,
  professorCanAccessAnyClass,
  professorCanAccessClass,
  resolveProfessorClassAccess,
  type ProfessorClassAccess,
} from '../src/server/professor/access.js';
import {
  handleProfessorClassroomAction,
  isProfessorClassroomAction,
} from '../src/server/professor/classroomActions.js';
import {
  handleProfessorSessionAction,
  isProfessorSessionAction,
} from '../src/server/professor/sessionActions.js';
import {
  handleProfessorSharedAction,
  handleSharedListStudent,
} from '../src/server/professor/sharing.js';
import { readLinkedAccounts, readRecordsByKeys } from '../src/server/professor/linkedStudents.js';
import { inspectImageDataUri } from '../src/server/professor/imageValidation.js';

const MAX_CANVAS_CHARS = 750_000;
const MAX_IMAGE_CHARS = 850_000;
const TTL_SECONDS = 365 * 24 * 60 * 60;

const CANVAS_SAVE_SCRIPT = `
local currentRaw = redis.call('GET', KEYS[1])
if currentRaw then
  local ok, current = pcall(cjson.decode, currentRaw)
  if ok and type(current) == 'table' and (tonumber(current.updatedAt) or 0) > tonumber(ARGV[2]) then
    return cjson.encode({ saved = false, drawing = current })
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return cjson.encode({ saved = true })
`;

function canvasKey(phone: string, docKey: string): string {
  const owner = createHash('sha256').update(phone).digest('hex').slice(0, 20);
  const document = createHash('sha256').update(docKey).digest('hex');
  return `prof:canvas:${owner}:${document}`;
}

function parseObject(raw: unknown, fallback: Record<string, unknown>): Record<string, any> {
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : fallback;
  } catch { return fallback; }
}

async function readProfessorAccess(accountId: string): Promise<ProfessorClassAccess | null> {
  const raw = await redis.get(`user:id:${accountId}`) as unknown;
  if (!raw) return null;
  const user = parseObject(raw, {});
  return Object.keys(user).length ? resolveProfessorClassAccess(user) : null;
}

async function handleClassStudents(
  req: ApiRequest,
  res: ApiResponse,
  professorAccountId: string,
  access: ProfessorClassAccess,
  classId: string,
) {
  if (!classId) return res.status(400).json({ error: 'class_id_required' });
  if (!professorCanAccessClass(access, classId)) {
    return res.status(403).json({ error: 'professor_class_access_denied' });
  }

  // Deux commandes `MGET` (comptes, puis relevés) au lieu de deux `GET` par
  // élève : ce tableau est relu toutes les 20 s pendant une séance.
  const eligible = (await readLinkedAccounts(professorAccountId)).filter(user => (
    user.accountId
    && isLinkedStudentInClass(user, professorAccountId, classId)
    && professorCanAccessClass(access, normalizeProfessorClassId(user.classId))
  ));
  const progressRecords = await readRecordsByKeys(eligible.map(user => (
    `progress:${normalizeProfessorClassId(user.classId)}:${String(user.phone || '').replace(/\s/g, '')}`
  )));
  const students: any[] = [];
  for (const [index, user] of eligible.entries()) {
    const progressData = progressRecords[index];
    const progress = progressData.progress || {};
    let chaptersStarted = 0;
    let quizDone = 0;
    let totalRevision = 0;
    let exercisesDone = 0;
    let quizScoreSum = 0;
    let quizScoreCount = 0;
    const chapters: any[] = [];

    for (const storedChapterId of Object.keys(progress)) {
      const chapter = progress[storedChapterId];
      if (!chapter) continue;
      chaptersStarted++;
      totalRevision += Number(chapter.revisionProgress || 0);
      const feedback = chapter.exerciseFeedback || {};
      const done = Object.values(feedback).filter((value: any) => value !== 'skipped').length;
      exercisesDone += done;
      const quizSubmitted = !!chapter.quiz?.isSubmitted;
      const quizScore = Number(chapter.quiz?.score || 0);
      if (quizSubmitted) {
        quizDone++;
        quizScoreSum += quizScore;
        quizScoreCount++;
      }
      const chapterId = storedChapterId.includes('_')
        ? storedChapterId.split('_').slice(1).join('_')
        : storedChapterId;
      chapters.push({
        chapterId,
        revisionProgress: Math.round(Number(chapter.revisionProgress || 0)),
        quizSubmitted,
        quizScore,
        exercisesDone: done,
      });
    }

    students.push({
      accountId: user.accountId,
      name: user.name || '',
      phone: user.phone || '',
      progress: {
        chaptersStarted,
        quizDone,
        revisionAvg: chaptersStarted ? Math.round(totalRevision / chaptersStarted) : 0,
        exercisesDone,
        quizScoreAvg: quizScoreCount ? Math.round(quizScoreSum / quizScoreCount) : 0,
        lastActive: Number(progressData.lastActive || progressData.updatedAt || 0),
        chapters,
      },
    });
  }
  students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return res.status(200).json({ students });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const action = req.query?.action || req.body?.action;

  if (action === 'shared-list-student') {
    try {
      return await handleSharedListStudent(req, res);
    } catch (error: any) {
      console.error('Professor API error (shared-list-student)', error);
      return res.status(500).json({ error: 'Service professeur temporairement indisponible' });
    }
  }

  const session = await readActiveProfessorSession(req);
  if (!session) return res.status(401).json({ error: 'Professor session required' });

  try {
    // La portée est relue à chaque action : le cookie ou une séance mémorisée
    // ne peuvent pas conserver un droit retiré par l'administration.
    // Le compte vient d'être lu pour valider la session : on en tire la portée
    // sans relire Redis. Les anciens cookies (sans `user`) gardent la lecture.
    const access = session.user
      ? resolveProfessorClassAccess(session.user)
      : await readProfessorAccess(session.accountId);
    if (!access || !professorCanAccessAnyClass(access)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }

    const rawClassId = typeof req.body?.classId === 'string' ? req.body.classId.trim() : '';
    const requestedClassId = normalizeProfessorClassId(rawClassId);
    if (rawClassId && !requestedClassId) return res.status(400).json({ error: 'invalid_class_id' });
    if (requestedClassId && !professorCanAccessClass(access, requestedClassId)) {
      return res.status(403).json({ error: 'professor_class_access_denied' });
    }

    if (isProfessorClassroomAction(action)) {
      return await handleProfessorClassroomAction(action, req, res, session, access, requestedClassId);
    }
    if (isProfessorSessionAction(action)) {
      return await handleProfessorSessionAction(action, req, res, session, access, requestedClassId);
    }
    if (action === 'class-students') {
      return await handleClassStudents(req, res, session.accountId, access, requestedClassId);
    }

    if (action === 'image-save' || action === 'image-load') {
      const imageId = String(req.body?.imageId || '').trim();
      if (!/^img_[a-z0-9-]{8,}$/i.test(imageId)) return res.status(400).json({ error: 'Invalid imageId' });
      const owner = createHash('sha256').update(session.phone).digest('hex').slice(0, 20);
      const imageKey = `prof:image:${owner}:${imageId}`;
      if (action === 'image-load') {
        const raw = await redis.get(imageKey) as string | null;
        if (!raw) return res.status(200).json({ found: false });
        return res.status(200).json({ found: true, image: typeof raw === 'string' ? JSON.parse(raw) : raw });
      }
      const image = req.body?.image;
      if (!image || typeof image.dataUri !== 'string') return res.status(400).json({ error: 'Invalid image' });
      if (image.dataUri.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: 'Image too large for cloud sync' });
      // Le préfixe du data URI est déclaré par le client : on vérifie la
      // signature binaire et on relit les dimensions réelles.
      const inspected = inspectImageDataUri(image.dataUri);
      if (inspected.ok === false) {
        return res.status(inspected.error === 'dimensions_too_large' ? 413 : 400).json({ error: 'Invalid image' });
      }
      // Seuls les champs attendus sont conservés (plus de JSON arbitraire dans
      // Redis) ; dimensions et poids viennent du binaire, pas du client.
      const width = inspected.width ?? (Number(image.width) || null);
      const height = inspected.height ?? (Number(image.height) || null);
      const storedImage = {
        dataUri: image.dataUri,
        width,
        height,
        ratio: width && height ? width / height : (Number(image.ratio) || 1),
        bytes: inspected.bytes,
        createdAt: Number(image.createdAt) || Date.now(),
      };
      const serialized = JSON.stringify(storedImage);
      if (serialized.length > MAX_IMAGE_CHARS + 512) return res.status(413).json({ error: 'Image too large for cloud sync' });
      await redis.set(imageKey, serialized, { ex: TTL_SECONDS });
      return res.status(200).json({ success: true });
    }

    if (action === 'shared-save' || action === 'shared-list' || action === 'shared-delete') {
      return await handleProfessorSharedAction(action, req, res, session, access, requestedClassId);
    }

    const docKey = String(req.body?.docKey || req.query?.docKey || '').trim();
    if (!docKey || docKey.length > 400) return res.status(400).json({ error: 'Invalid docKey' });
    const key = canvasKey(session.phone, docKey);
    if (action === 'canvas-load') {
      const raw = await redis.get(key) as string | null;
      if (!raw) return res.status(200).json({ found: false });
      return res.status(200).json({ found: true, drawing: typeof raw === 'string' ? JSON.parse(raw) : raw });
    }
    if (action === 'canvas-save') {
      const drawing = req.body?.drawing;
      if (!drawing || !Array.isArray(drawing.marks)) return res.status(400).json({ error: 'Invalid drawing' });
      const now = Date.now();
      const requestedAt = Number(drawing.updatedAt);
      const updatedAt = Number.isFinite(requestedAt) ? Math.min(requestedAt, now + 1_000) : now;
      const serialized = JSON.stringify({ marks: drawing.marks, updatedAt, v: 2 });
      if (serialized.length > MAX_CANVAS_CHARS) return res.status(413).json({ error: 'Canvas too large' });
      const atomic = parseObject(await redis.eval(CANVAS_SAVE_SCRIPT, [key], [
        serialized, String(updatedAt), String(TTL_SECONDS),
      ]), { saved: false });
      if (!atomic.saved) {
        return res.status(200).json({ success: true, ignored: true, drawing: atomic.drawing });
      }
      return res.status(200).json({ success: true, updatedAt });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error: any) {
    console.error('Professor API error', error);
    return res.status(500).json({ error: 'Service professeur temporairement indisponible' });
  }
}
