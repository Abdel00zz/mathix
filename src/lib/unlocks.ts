import { safeSetStorageItem } from './storage';
import type { ChapterLocks, StickyUnlockEntry } from './types';

export type { StickyUnlockEntry } from './types';

export const QUIZ_UNLOCK_THRESHOLD = 10;
export const EXERCISE_UNLOCK_THRESHOLD = 15;

export function computeRevisionProgress(revealed: number, total: number): number {
  if (total <= 0) return 0;
  if (revealed >= total) return 100;
  return Math.min(99, Math.round((revealed / total) * 100));
}
export const UNLOCK_STORAGE_KEY = 'ap-u';

const MAX_STICKY_ENTRIES = 100;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isPinnedChapter(chapterOrId: string | { id?: string; chapterId?: string }): boolean {
  const id = typeof chapterOrId === 'string'
    ? chapterOrId
    : (chapterOrId && (chapterOrId.id || chapterOrId.chapterId)) || '';
  return id === 'mise-a-niveau' || /mise[-\s]?a[-\s]?niveau/i.test(id);
}

export function countDone(entry: unknown): number {
  if (Array.isArray(entry)) return entry.filter((x) => x != null).length;
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    if (Array.isArray(obj.answers)) return obj.answers.filter((x) => x != null).length;
    if (typeof obj.done === 'number') return obj.done;
    return Object.values(obj).filter((x) => x != null).length;
  }
  return typeof entry === 'number' ? entry : 0;
}

export function isEntrySubmitted(entry: unknown, expectedCount = 0): boolean {
  if (Array.isArray(entry) && entry.length > 0 && entry.every((x) => x != null)) return true;
  if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).isSubmitted === 'boolean') {
    return Boolean((entry as Record<string, unknown>).isSubmitted);
  }
  return expectedCount > 0 && countDone(entry) >= expectedCount;
}

function readLessonEntryPct(entry: unknown): number | null {
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return Math.max(0, Math.min(100, Math.round(entry)));
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    if (typeof obj.pct === 'number' && Number.isFinite(obj.pct)) {
      return Math.max(0, Math.min(100, Math.round(obj.pct)));
    }
    const nums = Object.values(obj).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (nums.length) {
      return Math.max(0, Math.min(100, Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)));
    }
  }
  return null;
}

function readPrefixedLessonPct(
  lMap: Record<string, unknown>,
  prefix: string,
  revs?: Array<unknown>
): number | null {
  const prefixed = Object.entries(lMap)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, val]) => readLessonEntryPct(val))
    .filter((v): v is number => v !== null);
  if (!prefixed.length) return null;
  const denom = Math.max(prefixed.length, Array.isArray(revs) ? revs.length : 0);
  return Math.max(0, Math.min(100, Math.round(prefixed.reduce((a, b) => a + b, 0) / denom)));
}

export function getLessonPct(
  lMap: Record<string, unknown> | undefined,
  chId: string,
  revs?: Array<unknown>,
  classId?: string
): number {
  if (!lMap || !chId) return 0;

  if (classId) {
    const scopedId = chId.startsWith('prob:') ? `prob:${classId}:${chId.slice(5)}` : `${classId}:${chId}`;
    const scopedDirect = readLessonEntryPct(lMap[scopedId]);
    if (scopedDirect !== null) return scopedDirect;
    const scopedMulti = readPrefixedLessonPct(lMap, `${scopedId}:`, revs);
    if (scopedMulti !== null) return scopedMulti;
  }

  const direct = readLessonEntryPct(lMap[chId]);
  if (direct !== null) return direct;
  const legacyMulti = readPrefixedLessonPct(lMap, `${chId}:`, revs);
  return legacyMulti !== null ? legacyMulti : 0;
}

export function getQuizStats(
  qMap: Record<string, unknown> | undefined,
  classId: string,
  chId: string,
  quizzes?: Array<{ id?: string; questionsCount?: number }>,
  quizCount = 0
): { done: number; pct: number; submitted: boolean } {
  if (!qMap) return { done: 0, pct: 0, submitted: false };

  let done = 0;
  let submitted = false;
  const seen = new Set<string>();
  const countByKey = (k: string, expected = 0) => {
    if (seen.has(k) || !(k in qMap)) return;
    const val = qMap[k];
    if (val == null) return;
    seen.add(k);
    done += countDone(val);
    if (isEntrySubmitted(val, expected)) submitted = true;
  };

  const scopedPrefix = `${classId}:${chId}:`;
  const expectedById = new Map<string, number>();
  if (Array.isArray(quizzes)) {
    for (const qz of quizzes) {
      if (qz?.id) expectedById.set(qz.id, Number(qz.questionsCount) || 0);
    }
  }

  for (const k of Object.keys(qMap)) {
    if (k.startsWith(scopedPrefix)) {
      const qId = k.slice(scopedPrefix.length);
      countByKey(k, expectedById.get(qId) ?? 0);
    }
  }

  if (seen.size === 0) {
    countByKey(`${classId}:${chId}`, quizCount);
  }

  if (seen.size === 0) {
    for (const k of Object.keys(qMap)) {
      if (k.startsWith(`${chId}:`)) {
        const qId = k.slice(chId.length + 1);
        countByKey(k, expectedById.get(qId) ?? 0);
      }
    }
    if (seen.size === 0) {
      countByKey(chId, quizCount);
    }
  }

  if (seen.size === 0 && Array.isArray(quizzes)) {
    for (const qz of quizzes) {
      if (qz?.id) countByKey(qz.id, qz.questionsCount || 0);
    }
  }

  const quizzesSum =
    Array.isArray(quizzes) && quizzes.length > 1
      ? quizzes.reduce((acc, qz) => acc + (Number(qz.questionsCount) || 0), 0)
      : 0;
  const effectiveTotal = Math.max(quizCount, quizzesSum);
  const pct = effectiveTotal > 0 ? Math.min(100, Math.round((done * 100) / effectiveTotal)) : done > 0 ? 100 : 0;
  return { done, pct, submitted };
}

export function getExerciseStats(
  eMap: Record<string, unknown> | undefined,
  classId: string,
  chId: string,
  exercisesOrCount: number | Array<string | { id?: string; questionsCount?: number; count?: number }> = 0,
  totalQuestions = 0
): { done: number; pct: number; total: number; completed: boolean } {
  const exercises = Array.isArray(exercisesOrCount) ? exercisesOrCount : [];
  const expectedCount = typeof exercisesOrCount === 'number' ? exercisesOrCount : totalQuestions || exercises.reduce(
    (sum, exercise) => sum + (typeof exercise === 'string' ? 0 : Number(exercise.questionsCount || exercise.count) || 0), 0,
  );
  if (!eMap) return { done: 0, pct: 0, total: expectedCount, completed: false };
  const scopedKey = `${classId}:${chId}`;
  const entry = scopedKey in eMap ? eMap[scopedKey] : eMap[chId];
  let done = entry ? countDone(entry) : 0;
  if (!entry) {
    // Imported maquette progress may be stored per exercise rather than in the
    // chapter aggregate used by the native Next.js runner. Prefer scoped data.
    const scopedPrefix = `${scopedKey}:`;
    const legacyPrefix = `${chId}:`;
    const ids = new Set(exercises.map((exercise) => typeof exercise === 'string' ? exercise : exercise.id || '').filter(Boolean));
    for (const key of Object.keys(eMap)) {
      if (key.startsWith(scopedPrefix)) ids.add(key.slice(scopedPrefix.length));
      else if (key.startsWith(legacyPrefix)) ids.add(key.slice(legacyPrefix.length));
    }
    for (const id of ids) {
      const item = eMap[`${scopedPrefix}${id}`] ?? eMap[`${legacyPrefix}${id}`] ?? eMap[id];
      if (item) done += countDone(item);
    }
  }
  const pct = expectedCount > 0 ? Math.min(100, Math.round((done * 100) / expectedCount)) : done > 0 ? 100 : 0;
  return { done, pct, total: expectedCount, completed: expectedCount > 0 ? done >= expectedCount : done > 0 };
}

export function sanitizeStickyUnlocks(raw: unknown): Record<string, StickyUnlockEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, StickyUnlockEntry> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || FORBIDDEN_KEYS.has(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const rec = v as Record<string, unknown>;
    const quiz = Boolean(rec.quiz);
    const exercises = Boolean(rec.exercises);
    if (!quiz && !exercises) continue;
    out[k.slice(0, 120)] = { ...(quiz ? { quiz: true } : {}), ...(exercises ? { exercises: true } : {}) };
    count++;
    if (count >= MAX_STICKY_ENTRIES) break;
  }
  return out;
}

export function mergeStickyUnlocks(
  incoming: Record<string, StickyUnlockEntry> | null | undefined,
  current: Record<string, StickyUnlockEntry> | null | undefined
): Record<string, StickyUnlockEntry> {
  const inc = sanitizeStickyUnlocks(incoming);
  const cur = sanitizeStickyUnlocks(current);
  const out: Record<string, StickyUnlockEntry> = {};
  for (const k of new Set([...Object.keys(cur), ...Object.keys(inc)])) {
    const a = inc[k];
    const b = cur[k];
    const quiz = Boolean(a?.quiz || b?.quiz);
    const exercises = Boolean(a?.exercises || b?.exercises);
    if (quiz || exercises) {
      out[k] = { ...(quiz ? { quiz: true } : {}), ...(exercises ? { exercises: true } : {}) };
    }
    if (Object.keys(out).length >= MAX_STICKY_ENTRIES) break;
  }
  return out;
}

export function readStickyUnlocks(): Record<string, StickyUnlockEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UNLOCK_STORAGE_KEY);
    return sanitizeStickyUnlocks(raw ? JSON.parse(raw) : {});
  } catch {
    return {};
  }
}

export function writeStickyUnlocks(map: Record<string, StickyUnlockEntry>): void {
  if (typeof window === 'undefined') return;
  safeSetStorageItem(UNLOCK_STORAGE_KEY, JSON.stringify(sanitizeStickyUnlocks(map)));
}

export function clearStickyUnlocks(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(UNLOCK_STORAGE_KEY);
  } catch {}
}

export function computeLocks(opts: {
  classId?: string;
  chapterId: string;
  hasLesson: boolean;
  hasQuiz: boolean;
  hasExercises: boolean;
  lessonPct: number;
  quizPct: number;
  quizSubmitted: boolean;
  stickyMap?: Record<string, StickyUnlockEntry>;
  persistSticky?: boolean;
}): ChapterLocks {
  const classId = opts.classId || 'default';
  const key = `${classId}:${opts.chapterId}`;
  const map = opts.stickyMap ?? readStickyUnlocks();
  const prev = map[key] || {};
  const pinned = isPinnedChapter(opts.chapterId);

  const quizUnlocked = Boolean(
    pinned || prev.quiz || !opts.hasLesson || opts.lessonPct >= QUIZ_UNLOCK_THRESHOLD
  );
  const exGateMet = !opts.hasQuiz
    ? true
    : opts.quizSubmitted || opts.quizPct >= EXERCISE_UNLOCK_THRESHOLD;
  const exercisesUnlocked = Boolean(pinned || prev.exercises || exGateMet);

  if (opts.persistSticky !== false && !opts.stickyMap && (quizUnlocked || exercisesUnlocked)) {
    const nextQuiz = Boolean(prev.quiz || quizUnlocked);
    const nextExo = Boolean(prev.exercises || exercisesUnlocked);
    if (nextQuiz !== Boolean(prev.quiz) || nextExo !== Boolean(prev.exercises)) {
      map[key] = { quiz: nextQuiz, exercises: nextExo };
      writeStickyUnlocks(map);
    }
  }

  return {
    quizLocked: opts.hasQuiz && !quizUnlocked,
    exercisesLocked: opts.hasExercises && !exercisesUnlocked,
    quizHint: `Débloqué dès ${QUIZ_UNLOCK_THRESHOLD}\u00a0% de la leçon`,
    exercisesHint: opts.hasQuiz
      ? `Débloqué dès ${EXERCISE_UNLOCK_THRESHOLD}\u00a0% du quiz`
      : 'Exercices accessibles directement',
  };
}
