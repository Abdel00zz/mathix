import {
  redis,
  isAdmin,
  isValidPhone,
  normalizePhone,
  readActiveAccountSession,
  type ApiRequest,
  type ApiResponse,
} from '../src/server/professor/shared.js';

import { mergeByKey, mergeProgress } from '../src/server/progressMerge.js';

/** Un relevé concours porte au plus quelques dizaines d'essais : bien en deçà. */
const MAX_CONCOURS_CHARS = 200_000;

/**
 * La progression est une donnée personnelle : son identité ne doit jamais
 * provenir du corps de requête, qui peut être forgé par n'importe quel client.
 * On conserve les champs `phone` et `classId` dans le payload uniquement pour
 * détecter un client périmé ou une tentative de lecture/écriture croisée.
 */
async function requireProgressIdentity(
  req: ApiRequest,
  res: ApiResponse,
): Promise<{ phone: string; classId: string } | null> {
  const active = await readActiveAccountSession(req);
  if (!active) {
    res.status(401).json({ error: 'account_session_required' });
    return null;
  }

  const phone = normalizePhone(active.user.phone);
  const classId = String(active.user.classId || '').trim();
  if (!isValidPhone(phone) || !classId) {
    res.status(403).json({ error: 'invalid_account_identity' });
    return null;
  }

  const requestedPhone = req.body?.phone;
  const requestedClassId = req.body?.classId;
  if (
    (requestedPhone !== undefined && normalizePhone(requestedPhone) !== phone)
    || (requestedClassId !== undefined && String(requestedClassId).trim() !== classId)
  ) {
    res.status(403).json({ error: 'session_account_mismatch' });
    return null;
  }

  return { phone, classId };
}

// ── Lecture des relevés ────────────────────────────────────────────────────
/**
 * Le chemin d'écriture enregistre sous le téléphone normalisé (`+` + chiffres).
 * Un relevé écrit avant cette normalisation, ou lu depuis une fiche élève
 * encore au format brut, porte le numéro tel quel. On lit donc les deux formes
 * plutôt que d'annoncer « aucune progression » à tort.
 */
function recordKeyVariants(root: 'progress' | 'concours', classId: string, phone: unknown): string[] {
  const raw = String(phone ?? '').replace(/\s/g, '');
  const canonical = normalizePhone(phone);
  const variants = raw.startsWith('+') ? [raw, canonical] : [canonical, raw];
  return [...new Set(variants.filter(Boolean))].map(value => `${root}:${classId}:${value}`);
}

const progressKeys = (classId: string, phone: unknown) => recordKeyVariants('progress', classId, phone);

/** Identifiant de relevé renvoyé au client : identique à celui qu'il calcule. */
function progressUid(classId: string, phone: unknown): string {
  return `${classId}:${String(phone ?? '').replace(/\s/g, '')}`;
}

function parseRecord(raw: unknown): any | null {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Lecture d'un relevé unique, variantes de clé comprises. */
async function readProgressRecord(classId: string, phone: unknown): Promise<any | null> {
  for (const key of progressKeys(classId, phone)) {
    const record = parseRecord(await redis.get(key));
    if (record) return record;
  }
  return null;
}

/**
 * Lecture par lot : un `get` par variante de clé, dans un seul pipeline.
 * Le tableau `indexes` évite de refaire le calcul du décalage à la lecture.
 */
async function readProgressBatch(
  students: Array<{ phone: string; classId: string }>,
): Promise<Array<{ uid: string; data: any | null }>> {
  const pipeline = redis.pipeline();
  const reads: Array<{ uid: string; indexes: number[] }> = [];
  let cursor = 0;

  for (const student of students) {
    const indexes: number[] = [];
    for (const key of progressKeys(student.classId, student.phone)) {
      pipeline.get(key);
      indexes.push(cursor++);
    }
    reads.push({ uid: progressUid(student.classId, student.phone), indexes });
  }

  const results = await pipeline.exec();
  return reads.map(({ uid, indexes }) => {
    for (const index of indexes) {
      const record = parseRecord(results[index]);
      if (record) return { uid, data: record };
    }
    return { uid, data: null };
  });
}

/**
 * Résumé du planning pour le tableau de bord enseignant.
 *
 * L'élève ne voit plus ses statistiques dans l'application : c'est ici qu'elles
 * ont une utilité, en regard de la classe. On expose ce qui se décide — le
 * volume planifié, le volume réellement tenu, et surtout l'écart entre les deux.
 */
function buildPlanningSummary(data: any) {
  const plan = data?.studyPlan ?? null;
  const log: any[] = Array.isArray(data?.studyLog) ? data.studyLog : [];
  const sessions: any[] = Array.isArray(data?.studySessions) ? data.studySessions : [];

  const slots: any[] = Array.isArray(plan?.slots) ? plan.slots.filter((s: any) => s?.enabled) : [];
  const plannedWeekly = slots.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);

  // Semaine glissante : 7 derniers jours, bornes incluses.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

  const recent = log.filter(e => typeof e?.date === 'string' && e.date >= cutoffIso);
  const doneWeekly = recent.reduce((sum, e) => sum + (Number(e.minutes) || 0), 0);

  const pointed = sessions.filter(s => (Number(s?.minutes) || 0) > 0).length;
  const missed = sessions.filter(s => (Number(s?.minutes) || 0) === 0).length;

  return {
    enabled: !!plan?.enabled,
    activeDays: new Set(slots.map((s: any) => s.day)).size,
    sessionsPerWeek: slots.length,
    plannedWeeklyMin: plannedWeekly,
    doneWeeklyMin: doneWeekly,
    // Le ratio est le chiffre qui parle : 40 % dit tout de suite ce que
    // « 120 min sur 300 » oblige à calculer.
    adherencePct: plannedWeekly > 0 ? Math.round((doneWeekly / plannedWeekly) * 100) : null,
    sessionsPointed: pointed,
    sessionsMissed: missed,
    daysLogged: recent.length,
    slots: slots.map((s: any) => ({
      day: s.day,
      start: s.start,
      durationMin: s.durationMin,
      focus: s.focus || null,
    })),
  };
}

// ── Save progress ──────────────────────────────────────────────────────────
async function handleSave(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const identity = await requireProgressIdentity(req, res);
  if (!identity) return;

  const {
    progress, totalTimeSpent, lastActive,
    studyPlan, studyLog, studySessions,
  } = req.body;

  const key = `progress:${identity.classId}:${identity.phone}`;

  // Read existing data and merge (prevents data loss from partial saves)
  let mergedProgress = progress || {};
  let mergedTimeSpent = totalTimeSpent || 0;
  let mergedPlan = studyPlan ?? null;
  let mergedLog = Array.isArray(studyLog) ? studyLog : [];
  let mergedSessions = Array.isArray(studySessions) ? studySessions : [];

  const raw = await redis.get(key) as string | null;
  if (raw) {
    const existing = typeof raw === 'string' ? JSON.parse(raw) : raw;
    mergedProgress = mergeProgress(progress || {}, existing.progress || {});
    mergedTimeSpent = Math.max(totalTimeSpent || 0, existing.totalTimeSpent || 0);

    // Le planning est une configuration : le dernier appareil qui l'a modifié
    // fait foi. Un client qui n'en envoie pas ne doit surtout pas l'effacer.
    mergedPlan = studyPlan ?? existing.studyPlan ?? null;

    // Le journal et les séances sont des relevés : on les fusionne par clé en
    // gardant la valeur la plus élevée, pour qu'aucun temps déjà pointé sur un
    // appareil ne disparaisse à cause d'une sauvegarde partie d'un autre.
    mergedLog = mergeByKey(existing.studyLog, studyLog, 'date', 'minutes');
    mergedSessions = mergeByKey(existing.studySessions, studySessions, 'id', 'minutes');
  }

  const data = {
    progress: mergedProgress,
    totalTimeSpent: mergedTimeSpent,
    studyPlan: mergedPlan,
    studyLog: mergedLog,
    studySessions: mergedSessions,
    lastActive: lastActive || Date.now(),
    updatedAt: Date.now(),
  };
  await redis.set(key, JSON.stringify(data), { ex: 180 * 24 * 60 * 60 });

  return res.status(200).json({ success: true, updatedAt: data.updatedAt });
}

// ── Load progress ──────────────────────────────────────────────────────────
async function handleLoad(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const identity = await requireProgressIdentity(req, res);
  if (!identity) return;

  const key = `progress:${identity.classId}:${identity.phone}`;
  const raw = await redis.get(key) as string | null;

  if (!raw) return res.status(200).json({ found: false });

  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return res.status(200).json({
    found: true,
    progress: data.progress || {},
    totalTimeSpent: data.totalTimeSpent || 0,
    studyPlan: data.studyPlan ?? null,
    studyLog: data.studyLog || [],
    studySessions: data.studySessions || [],
    lastActive: data.lastActive || data.updatedAt || 0,
    updatedAt: data.updatedAt || 0,
  });
}

// ── View progress (admin) ──────────────────────────────────────────────────
// Vue détaillée d'un élève : c'est la seule lecture qui expose le détail par
// chapitre (révision, quiz, exercices) et le planning. Elle est réservée à
// l'admin : l'élève, lui, ne voit jamais ses statistiques dans l'application.
async function handleView(req: ApiRequest, res: ApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const phone = req.query?.phone;
  const classId = req.query?.classId;
  if (!phone || !classId) return res.status(400).json({ error: 'Missing phone or classId' });

  const data = await readProgressRecord(classId, phone);
  if (!data) return res.status(200).json({ found: false, classId, phone: String(phone).replace(/\s/g, '') });

  const progress = data.progress || {};
  const chapters: any[] = [];

  for (const [chapterId, chapter] of Object.entries(progress) as any[]) {
    const quiz = chapter.quiz || {};
    const exercises = chapter.exercises || {};
    const exerciseFeedback = chapter.exerciseFeedback || {};
    const exerciseDurations = chapter.exerciseDurations || {};
    const subQuestionsTotal = Object.keys(exercises).length;
    const subQuestionsCompleted = Object.values(exercises).filter((e: any) => e.isCompleted).length;

    const quizHistory = (quiz.history || []).map((h: any) => ({
      qId: h.questionId,
      correct: !!h.isCorrect,
      userAnswer: h.userAnswer ?? null,
      timeSpent: h.timeSpent ?? null,
    }));

    // Quiz in-progress metrics
    const quizTotalQ = quiz.totalQuestions || quizHistory.length || 0;
    const quizAnswered = quizHistory.length;
    const quizCorrect = quizHistory.filter((h: any) => h.correct).length;
    const quizProgressPct = quizTotalQ > 0 ? Math.round((quizAnswered / quizTotalQ) * 100) : 0;

    const feedbackDetails: Record<string, string> = {};
    for (const [exId, fb] of Object.entries(exerciseFeedback)) {
      feedbackDetails[exId] = typeof fb === 'string' ? fb : (fb as any)?.value || 'skipped';
    }
    for (const [exId, ex] of Object.entries(exercises) as any[]) {
      if (!feedbackDetails[exId] && ex.mastery) {
        feedbackDetails[exId] = ex.mastery;
      }
    }

    // Exercise feedback counts (done = any non-skipped value)
    const fbValues = Object.values(feedbackDetails);
    const exercisesDone = fbValues.filter(v => v !== 'skipped').length;
    const exercisesSkipped = fbValues.filter(v => v === 'skipped').length;

    // La clé de stockage est préfixée par la classe (`classe_chapitre`).
    // On retire le préfixe réel plutôt que de découper sur le premier `_` :
    // un identifiant de classe peut lui-même en contenir.
    const prefix = `${classId}_`;
    const unscopedId = chapterId.startsWith(prefix) ? chapterId.slice(prefix.length) : chapterId;

    // Dernière trace d'activité sur ce chapitre : le geste le plus récent, à
    // défaut de quoi on retombe sur la dernière écriture du chapitre.
    const chapterLastActive = chapter.lastActiveAt
      || chapter.submittedAt
      || (quiz.isSubmitted ? quiz.submittedAt : null)
      || null;

    chapters.push({
      chapter: unscopedId,
      scopedKey: chapterId,
      revisionProgress: chapter.revisionProgress || 0,
      revisionBySheet: chapter.revisionProgressBySheet || {},
      blanksRevealed: (chapter.revealedBlanks || []).length,
      masteredSkills: (chapter.masteredSkills || []).length,
      completedSeances: Array.isArray(chapter.completedSeances) ? chapter.completedSeances : [],
      lastActiveAt: chapterLastActive,
      lastActiveSection: chapter.lastActiveSection || null,
      quizSubmitted: !!quiz.isSubmitted,
      quizScore: quiz.score || 0,
      quizHighScore: quiz.highScore || 0,
      quizAttempts: quiz.attempts || 0,
      quizTotal: quizTotalQ,
      quizAnswered,
      quizCorrect,
      quizProgressPct,
      quizCurrentIndex: quiz.currentQuestionIndex || 0,
      quizDuration: quiz.durationSeconds || null,
      quizHistory,
      answersSnapshot: quiz.answersSnapshot || {},
      subQuestionsTotal,
      subQuestionsCompleted,
      exercisesFeedbackCount: Object.keys(feedbackDetails).length,
      feedbackDetails,
      feedbackSummary: {
        done: exercisesDone,
        skipped: exercisesSkipped,
      },
      exerciseDurations,
      submitted: !!chapter.isChapterSubmitted,
      submittedAt: chapter.submittedAt || null,
    });
  }

  // Le chapitre le plus récent en tête : c'est celui qu'on veut lire d'abord.
  chapters.sort((a, b) => (b.lastActiveAt || b.submittedAt || 0) - (a.lastActiveAt || a.submittedAt || 0));
  const lastChapter = chapters.find(entry => (entry.lastActiveAt || entry.submittedAt)) || null;

  return res.status(200).json({
    found: true,
    classId,
    totalTimeSpent: data.totalTimeSpent || 0,
    lastActive: data.lastActive || data.updatedAt || 0,
    updatedAt: data.updatedAt || 0,
    chaptersCount: chapters.length,
    chapters,
    lastChapter: lastChapter
      ? { chapter: lastChapter.chapter, at: lastChapter.lastActiveAt || lastChapter.submittedAt, section: lastChapter.lastActiveSection }
      : null,
    planning: buildPlanningSummary(data),
  });
}

// ── Concours: save + view (POST/GET) ───────────────────────────────────────
async function handleConcours(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'POST') {
    // Même garde que la progression : l'identité vient de la session, jamais du
    // corps de requête. Sans elle, n'importe qui pouvait écrire les scores d'un
    // autre élève en connaissant son numéro.
    const identity = await requireProgressIdentity(req, res);
    if (!identity) return;
    const { concoursProgress } = req.body || {};
    if (!concoursProgress || typeof concoursProgress !== 'object' || Array.isArray(concoursProgress)) {
      return res.status(400).json({ error: 'Missing concoursProgress' });
    }
    if (JSON.stringify(concoursProgress).length > MAX_CONCOURS_CHARS) {
      return res.status(413).json({ error: 'concours_progress_too_large' });
    }

    const key = `concours:${identity.classId}:${identity.phone}`;
    const data = { ...concoursProgress, updatedAt: Date.now() };
    await redis.set(key, JSON.stringify(data), { ex: 180 * 24 * 60 * 60 });

    return res.status(200).json({ success: true, updatedAt: data.updatedAt });
  }

  if (req.method === 'GET') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

    const phone = req.query?.phone;
    const classId = req.query?.classId;
    if (!phone || !classId) return res.status(400).json({ error: 'Missing phone or classId' });

    // Même variantes de clé que la progression : l'élève écrit avec le
    // téléphone qu'il a en mémoire, l'admin lit avec celui du compte.
    let data: any = null;
    for (const variant of recordKeyVariants('concours', classId, phone)) {
      data = parseRecord(await redis.get(variant));
      if (data) break;
    }

    if (!data) return res.status(200).json({ found: false });

    return res.status(200).json({
      found: true,
      totalExams: data.totalExams || 0,
      bestScores: data.bestScores || {},
      lastPlayed: data.lastPlayed || 0,
      updatedAt: data.updatedAt || 0,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Batch summary (admin) ──────────────────────────────────────────────────
// Returns lightweight progress metrics for multiple students at once.
// Avoids N+1 Redis calls when admin loads the dashboard.
async function handleSummary(req: ApiRequest, res: ApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Expect JSON body with array of { phone, classId }
  const students: Array<{ phone: string; classId: string }> = req.body?.students;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'Missing students array' });
  }

  // Cap at 200 to prevent abuse
  const batch = students.slice(0, 200);
  const reads = await readProgressBatch(batch);

  const summaries: Record<string, any> = {};

  for (const { uid, data } of reads) {
    if (!data) {
      summaries[uid] = { found: false };
      continue;
    }

    const progress = data.progress || {};
    const chapterIds = Object.keys(progress);

    let chaptersStarted = 0;
    let quizDone = 0;
    let quizInProgress = 0;
    let totalRevision = 0;
    let exercisesDone = 0;
    let chaptersSubmitted = 0;

    for (const chId of chapterIds) {
      const ch = progress[chId];
      if (!ch) continue;
      chaptersStarted++;

      const rev = ch.revisionProgress || 0;
      totalRevision += rev;

      const quiz = ch.quiz || {};
      if (quiz.isSubmitted) quizDone++;
      else if ((quiz.history || []).length > 0) quizInProgress++;

      const fb = ch.exerciseFeedback || {};
      exercisesDone += Object.values(fb).filter((v: any) => v !== 'skipped').length;

      if (ch.isChapterSubmitted) chaptersSubmitted++;
    }

    summaries[uid] = {
      found: true,
      totalTimeSpent: data.totalTimeSpent || 0,
      lastActive: data.lastActive || data.updatedAt || 0,
      updatedAt: data.updatedAt || 0,
      chaptersStarted,
      quizDone,
      quizInProgress,
      avgRevision: chaptersStarted > 0 ? Math.round(totalRevision / chaptersStarted) : 0,
      exercisesDone,
      chaptersSubmitted,
    };
  }

  return res.status(200).json({ summaries });
}

// ── Capteurs de chapitre (admin) ───────────────────────────────────────────
// Pour le pilotage : métriques de TOUS les élèves d'une classe sur UN chapitre
// précis (celui déclaré « en cours »). Un seul appel, pipeline Redis.
async function handleChapterMonitor(req: ApiRequest, res: ApiResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });

  const students: Array<{ phone: string; classId: string }> = req.body?.students;
  const chapterId: string = req.body?.chapterId;
  if (!Array.isArray(students) || students.length === 0 || !chapterId) {
    return res.status(400).json({ error: 'Missing students array or chapterId' });
  }

  const batch = students.slice(0, 200);
  const reads = await readProgressBatch(batch);

  const monitor: Record<string, any> = {};

  for (const { uid, data } of reads) {
    if (!data) { monitor[uid] = { found: false }; continue; }

    const progress = data.progress || {};

    // Le chapitre peut être stocké sous son id nu ou préfixé (`…_chapterId`).
    const chapterKey = Object.keys(progress).find(
      k => k === chapterId || k.endsWith('_' + chapterId)
    );
    const ch = chapterKey ? progress[chapterKey] : null;

    if (!ch) {
      monitor[uid] = {
        found: true, started: false,
        lastActive: data.lastActive || data.updatedAt || 0,
        updatedAt: data.updatedAt || 0,
      };
      continue;
    }

    const quiz = ch.quiz || {};
    const quizHistory = quiz.history || [];
    const feedback: Record<string, string> = {};
    for (const [exId, fb] of Object.entries(ch.exerciseFeedback || {})) {
      feedback[exId] = typeof fb === 'string' ? fb : (fb as any)?.value || 'skipped';
    }

    monitor[uid] = {
      found: true,
      started: true,
      lastActive: data.lastActive || data.updatedAt || 0,
      updatedAt: data.updatedAt || 0,
      revisionPercent: Math.round(ch.revisionProgress || 0),
      quizSubmitted: !!quiz.isSubmitted,
      quizAnswered: quizHistory.length,
      quizTotal: quiz.totalQuestions || quizHistory.length || 0,
      quizScore: quiz.score || 0,
      exerciseFeedback: feedback,
      exerciseDurations: ch.exerciseDurations || {},
      chapterSubmitted: !!ch.isChapterSubmitted,
    };
  }

  return res.status(200).json({ monitor });
}

// ── Router ─────────────────────────────────────────────────────────────────
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader?.('Vary', 'Cookie');
  const action = req.query?.action || req.body?.action;

  try {
    switch (action) {
      case 'save':            return await handleSave(req, res);
      case 'load':            return await handleLoad(req, res);
      case 'view':            return await handleView(req, res);
      case 'concours':        return await handleConcours(req, res);
      case 'summary':         return await handleSummary(req, res);
      case 'chapter-monitor': return await handleChapterMonitor(req, res);
      default:                return res.status(400).json({ error: 'Missing or invalid action. Use ?action=save|load|view|concours|summary|chapter-monitor' });
    }
  } catch (error: any) {
    console.error('Progress handler error:', error);
    return res.status(500).json({ error: 'internal_progress_error' });
  }
}
