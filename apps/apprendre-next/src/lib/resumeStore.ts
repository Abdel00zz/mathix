/**
 * Persistance fine de reprise d'etude ("continuer ou l'eleve s'est arrete").
 * Complete `ap` (`StudentState`) avec validation de schema, scoping par filiere,
 * eviction LRU sous contrainte de quota `localStorage` et helpers CRDT cloud.
 */

import type { QuizAnswer, QuizDraft } from './quiz/quizEngine';
import { registerQuotaEvictor } from './storage';
import type {
  CloudResumeActiveQuizEntry,
  CloudResumeActiveSheetEntry,
  CloudResumeData,
  CloudResumeExerciseEntry,
  CloudResumeLessonEntry,
  CloudResumeQuizAnswer,
  CloudResumeQuizEntry,
} from './types';

export const RESUME_STORAGE_KEY = 'ap-resume';
export const RESUME_SCHEMA_VERSION = 2;
const MAX_LESSONS = 120;
const MAX_QUIZZES = 120;
const MAX_EXERCISES = 120;
const MAX_ACTIVE_REFS = 120;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface LessonResumeSnapshot {
  pct: number;
  maxPct: number;
  secId?: string;
  secTitle?: string;
  revealedBlanks?: number[];
  revealedBlankIds?: string[];
  bookmarks?: string[];
  updatedAt: number;
}

export interface LessonActiveSheetRef {
  sheetId: string;
  href: string;
  scrollKey: string;
  updatedAt: number;
}

export interface QuizResumeSnapshot {
  selectedQuizId: string;
  phase: 'run' | 'end';
  idx: number;
  answers: Record<number, QuizAnswer>;
  drafts: Record<number, QuizDraft>;
  skipped: number[];
  remainingByIdx: Record<number, number>;
  elapsedSec: number;
  reviewQueue: number[] | null;
  totalQuestions?: number;
  answeredCount?: number;
  updatedAt: number;
}

export interface ExerciseResumeSnapshot {
  index: number;
  mode: 'pas' | 'examen';
  openHints: string[];
  openSolutions: string[];
  revealed: number[];
  elapsedSec: number;
  spent: Record<number, number>;
  totalExercises?: number;
  doneCount?: number;
  updatedAt: number;
}

export interface ResumeStoreData {
  schemaVersion?: number;
  lessons: Record<string, LessonResumeSnapshot>;
  lessonActiveSheet: Record<string, LessonActiveSheetRef>;
  quizzes: Record<string, QuizResumeSnapshot>;
  chapterActiveQuiz: Record<string, string>;
  chapterActiveQuizUpdatedAt?: Record<string, number>;
  exercises: Record<string, ExerciseResumeSnapshot>;
}

const createEmptyStore = (): ResumeStoreData => ({
  schemaVersion: RESUME_SCHEMA_VERSION,
  lessons: {},
  lessonActiveSheet: {},
  quizzes: {},
  chapterActiveQuiz: {},
  chapterActiveQuizUpdatedAt: {},
  exercises: {},
});

function isSafeKey(key: string): boolean {
  return Boolean(key) && !FORBIDDEN_KEYS.has(key) && key.length <= 180;
}

function clampInt(val: unknown, min: number, max: number, fallback = min): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampTs(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function normalizeExerciseMode(raw: unknown, fallback: 'pas' | 'examen' = 'pas'): 'pas' | 'examen' {
  if (raw === 'examen') return 'examen';
  if (raw === 'pas' || raw === 'pas-a-pas') return 'pas';
  return fallback;
}

export function buildLessonScrollKey(
  classId: string,
  chapterId: string,
  sheetId?: string,
  totalSheets = 1
): string {
  const cls = String(classId || '').trim();
  const ch = String(chapterId || '').trim();
  const prefix = cls ? `${cls}:${ch}` : ch;
  return totalSheets > 1 && sheetId ? `${prefix}:${sheetId}` : prefix;
}

export function buildProblemScrollKey(classId: string, probId: string): string {
  const cls = String(classId || '').trim();
  const pid = String(probId || '').trim();
  return cls ? `prob:${cls}:${pid}` : `prob:${pid}`;
}

export function buildLessonActiveSheetKey(classId: string, chapterId: string): string {
  const cls = String(classId || '').trim();
  const ch = String(chapterId || '').trim();
  return cls ? `${cls}:${ch}` : ch;
}

export function buildConcoursSessionKey(schoolId: string, serieId: string): string {
  return `concours:${String(schoolId || '').trim()}:${String(serieId || '').trim()}`;
}

function splitBlanks(raw: unknown, extraIds?: unknown): { indices?: number[]; ids?: string[] } {
  const numSet = new Set<number>();
  const strSet = new Set<string>();
  const pushVal = (v: unknown) => {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 5000) numSet.add(v);
    else if (typeof v === 'string' && v.trim() && v.length <= 120) strSet.add(v.trim());
  };
  if (Array.isArray(raw)) raw.forEach(pushVal);
  if (Array.isArray(extraIds)) extraIds.forEach(pushVal);
  const indices = Array.from(numSet).slice(0, 500);
  const ids = Array.from(strSet).slice(0, 500);
  return {
    ...(indices.length ? { indices } : {}),
    ...(ids.length ? { ids } : {}),
  };
}

function sanitizeStringArray(raw: unknown, maxLen = 200): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().slice(0, 120);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= maxLen) break;
    }
  }
  return out;
}

function sanitizeIntArray(raw: unknown, maxLen = 300): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 0 && n < 2000 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
      if (out.length >= maxLen) break;
    }
  }
  return out;
}

function sanitizeQuizAnswer(raw: unknown): QuizAnswer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.status !== undefined && r.status !== 'answered') return null;
  const out: QuizAnswer = {
    status: 'answered',
    isCorrect: Boolean(r.isCorrect),
  };
  if (typeof r.selectedIndex === 'number' && Number.isInteger(r.selectedIndex) && r.selectedIndex >= 0 && r.selectedIndex < 50) {
    out.selectedIndex = r.selectedIndex;
  }
  if (Array.isArray(r.orderItems)) {
    out.orderItems = r.orderItems.filter((x): x is string => typeof x === 'string').slice(0, 50);
  }
  if (typeof r.text === 'string') {
    out.text = r.text.slice(0, 500);
  }
  if (r.timedOut) out.timedOut = true;
  return out;
}

function sanitizeLessonEntry(raw: unknown): LessonResumeSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const pct = clampInt(r.pct, 0, 100, 0);
  const maxPct = Math.max(pct, clampInt(r.maxPct, 0, 100, pct));
  const blanks = splitBlanks(r.revealedBlanks, r.revealedBlankIds);
  const bookmarks = sanitizeStringArray(r.bookmarks, 100);
  return {
    pct,
    maxPct,
    ...(typeof r.secId === 'string' && r.secId ? { secId: r.secId.slice(0, 120) } : {}),
    ...(typeof r.secTitle === 'string' && r.secTitle ? { secTitle: r.secTitle.slice(0, 180) } : {}),
    ...(blanks.indices ? { revealedBlanks: blanks.indices } : {}),
    ...(blanks.ids ? { revealedBlankIds: blanks.ids } : {}),
    ...(bookmarks.length ? { bookmarks } : {}),
    updatedAt: clampTs(r.updatedAt),
  };
}

function sanitizeActiveSheetEntry(raw: unknown): LessonActiveSheetRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const sheetId = typeof r.sheetId === 'string' ? r.sheetId.trim().slice(0, 100) : '';
  const href = typeof r.href === 'string' ? r.href.trim().slice(0, 260) : '';
  const scrollKey = typeof r.scrollKey === 'string' ? r.scrollKey.trim().slice(0, 180) : '';
  if (!sheetId || !href || !scrollKey) return null;
  if (/^[\s\x00-\x1f]*(javascript|vbscript|data):/i.test(href)) return null;
  return { sheetId, href, scrollKey, updatedAt: clampTs(r.updatedAt) };
}

function sanitizeQuizEntry(raw: unknown, keepDrafts = true): QuizResumeSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const selectedQuizId = typeof r.selectedQuizId === 'string' ? r.selectedQuizId.slice(0, 120) : '';
  if (!selectedQuizId) return null;

  const answers: Record<number, QuizAnswer> = {};
  if (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) {
    for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
      const qi = Number(k);
      if (!Number.isInteger(qi) || qi < 0 || qi >= 500) continue;
      const ans = sanitizeQuizAnswer(v);
      if (ans) answers[qi] = ans;
    }
  }

  const drafts: Record<number, QuizDraft> = {};
  if (keepDrafts && r.drafts && typeof r.drafts === 'object' && !Array.isArray(r.drafts)) {
    for (const [k, v] of Object.entries(r.drafts as Record<string, unknown>)) {
      const qi = Number(k);
      if (!Number.isInteger(qi) || qi < 0 || qi >= 500 || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const d = v as Record<string, unknown>;
      const clean: QuizDraft = {};
      if (typeof d.selectedIndex === 'number' && Number.isInteger(d.selectedIndex) && d.selectedIndex >= 0) {
        clean.selectedIndex = d.selectedIndex;
      }
      if (Array.isArray(d.orderItems)) {
        clean.orderItems = d.orderItems.filter((x): x is string => typeof x === 'string').slice(0, 50);
      }
      if (typeof d.text === 'string') clean.text = d.text.slice(0, 500);
      if (Object.keys(clean).length) drafts[qi] = clean;
    }
  }

  const remainingByIdx: Record<number, number> = {};
  if (keepDrafts && r.remainingByIdx && typeof r.remainingByIdx === 'object' && !Array.isArray(r.remainingByIdx)) {
    for (const [k, v] of Object.entries(r.remainingByIdx as Record<string, unknown>)) {
      const qi = Number(k);
      const sec = Number(v);
      if (Number.isInteger(qi) && qi >= 0 && qi < 500 && Number.isFinite(sec) && sec >= 0) {
        remainingByIdx[qi] = Math.round(sec);
      }
    }
  }

  const reviewQueue = Array.isArray(r.reviewQueue) ? sanitizeIntArray(r.reviewQueue, 500) : null;
  const totalQuestions =
    typeof r.totalQuestions === 'number' && Number.isFinite(r.totalQuestions) && r.totalQuestions >= 0
      ? Math.round(r.totalQuestions)
      : undefined;
  const answeredCount =
    typeof r.answeredCount === 'number' && Number.isFinite(r.answeredCount) && r.answeredCount >= 0
      ? Math.round(r.answeredCount)
      : Object.keys(answers).length;

  return {
    selectedQuizId,
    phase: r.phase === 'end' ? 'end' : 'run',
    idx: clampInt(r.idx, 0, 500, 0),
    answers,
    drafts,
    skipped: sanitizeIntArray(r.skipped, 500),
    remainingByIdx,
    elapsedSec: clampInt(r.elapsedSec, 0, 86400, 0),
    reviewQueue: reviewQueue && reviewQueue.length > 0 ? reviewQueue : null,
    ...(totalQuestions !== undefined ? { totalQuestions } : {}),
    answeredCount,
    updatedAt: clampTs(r.updatedAt),
  };
}

function sanitizeExerciseEntry(raw: unknown): ExerciseResumeSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const spent: Record<number, number> = {};
  if (r.spent && typeof r.spent === 'object' && !Array.isArray(r.spent)) {
    for (const [k, v] of Object.entries(r.spent as Record<string, unknown>)) {
      const idx = Number(k);
      const sec = Number(v);
      if (Number.isInteger(idx) && idx >= 0 && idx < 200 && Number.isFinite(sec) && sec > 0) {
        spent[idx] = Math.min(86400, Math.round(sec));
      }
    }
  }
  const totalExercises =
    typeof r.totalExercises === 'number' && Number.isFinite(r.totalExercises) && r.totalExercises >= 0
      ? Math.round(r.totalExercises)
      : undefined;
  const doneCount =
    typeof r.doneCount === 'number' && Number.isFinite(r.doneCount) && r.doneCount >= 0
      ? Math.round(r.doneCount)
      : undefined;

  return {
    index: clampInt(r.index, 0, 200, 0),
    mode: normalizeExerciseMode(r.mode, 'pas'),
    openHints: sanitizeStringArray(r.openHints, 300),
    openSolutions: sanitizeStringArray(r.openSolutions, 300),
    revealed: sanitizeIntArray(r.revealed, 200),
    elapsedSec: clampInt(r.elapsedSec, 0, 86400, 0),
    spent,
    ...(totalExercises !== undefined ? { totalExercises } : {}),
    ...(doneCount !== undefined ? { doneCount } : {}),
    updatedAt: clampTs(r.updatedAt),
  };
}

function sanitizeActiveQuizEntry(raw: unknown): CloudResumeActiveQuizEntry | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { quizId: raw.trim().slice(0, 120), updatedAt: 0 };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const quizId = typeof r.quizId === 'string' ? r.quizId.trim().slice(0, 120) : '';
    if (quizId) return { quizId, updatedAt: clampTs(r.updatedAt) };
  }
  return null;
}

function entryUpdatedAt(val: unknown): number {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return clampTs((val as { updatedAt?: unknown }).updatedAt);
  }
  return 0;
}

function pruneOldest<T>(map: Record<string, T>, maxEntries: number): Record<string, T> {
  const entries = Object.entries(map);
  if (entries.length <= maxEntries) return map;
  entries.sort((a, b) => entryUpdatedAt(b[1]) - entryUpdatedAt(a[1]));
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function sanitizeMap<T>(
  raw: unknown,
  sanitizeItem: (val: unknown) => T | null
): Record<string, T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeKey(k)) continue;
    const clean = sanitizeItem(v);
    if (clean !== null) out[k] = clean;
  }
  return out;
}

function parseActiveQuizBuckets(rawMap: unknown, rawTsMap?: unknown): {
  chapterActiveQuiz: Record<string, string>;
  chapterActiveQuizUpdatedAt: Record<string, number>;
} {
  const chapterActiveQuiz: Record<string, string> = {};
  const chapterActiveQuizUpdatedAt: Record<string, number> = {};
  const tsMap = rawTsMap && typeof rawTsMap === 'object' && !Array.isArray(rawTsMap) ? (rawTsMap as Record<string, unknown>) : {};
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return { chapterActiveQuiz, chapterActiveQuizUpdatedAt };
  for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
    if (!isSafeKey(k)) continue;
    const entry = sanitizeActiveQuizEntry(v);
    if (!entry) continue;
    chapterActiveQuiz[k] = entry.quizId;
    chapterActiveQuizUpdatedAt[k] = entry.updatedAt || clampTs(tsMap[k]);
  }
  return { chapterActiveQuiz, chapterActiveQuizUpdatedAt };
}

export function readResumeStore(): ResumeStoreData {
  if (typeof window === 'undefined') return createEmptyStore();
  try {
    const raw = window.localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return createEmptyStore();
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return createEmptyStore();
    const active = parseActiveQuizBuckets(parsed.chapterActiveQuiz, parsed.chapterActiveQuizUpdatedAt);
    return {
      schemaVersion: RESUME_SCHEMA_VERSION,
      lessons: sanitizeMap(parsed.lessons, sanitizeLessonEntry),
      lessonActiveSheet: sanitizeMap(parsed.lessonActiveSheet, sanitizeActiveSheetEntry),
      quizzes: sanitizeMap(parsed.quizzes, (v) => sanitizeQuizEntry(v, true)),
      chapterActiveQuiz: active.chapterActiveQuiz,
      chapterActiveQuizUpdatedAt: active.chapterActiveQuizUpdatedAt,
      exercises: sanitizeMap(parsed.exercises, sanitizeExerciseEntry),
    };
  } catch {
    return createEmptyStore();
  }
}

function serializeActiveQuizBuckets(
  next: ResumeStoreData,
  maxEntries: number
): Record<string, CloudResumeActiveQuizEntry> {
  const tsMap = next.chapterActiveQuizUpdatedAt || {};
  const entries = Object.entries(next.chapterActiveQuiz)
    .filter(([k, v]) => isSafeKey(k) && typeof v === 'string' && v.trim())
    .map(([k, quizId]) => [k, { quizId: quizId.trim().slice(0, 120), updatedAt: clampTs(tsMap[k]) }] as const);
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function buildTrimmedStore(
  next: ResumeStoreData,
  limits: { lessons: number; quizzes: number; exercises: number; active: number; keepDraftsCount: number }
): Record<string, unknown> {
  const prunedQuizzes = pruneOldest(next.quizzes, limits.quizzes);
  const compactQuizzes: Record<string, QuizResumeSnapshot> = {};
  const quizEntries = Object.entries(prunedQuizzes).sort((a, b) => entryUpdatedAt(b[1]) - entryUpdatedAt(a[1]));
  quizEntries.forEach(([k, q], i) => {
    compactQuizzes[k] = i < limits.keepDraftsCount ? q : { ...q, drafts: {}, remainingByIdx: {} };
  });

  return {
    schemaVersion: RESUME_SCHEMA_VERSION,
    lessons: pruneOldest(next.lessons, limits.lessons),
    lessonActiveSheet: pruneOldest(next.lessonActiveSheet, limits.active),
    quizzes: compactQuizzes,
    chapterActiveQuiz: serializeActiveQuizBuckets(next, limits.active),
    exercises: pruneOldest(next.exercises, limits.exercises),
  };
}

function writeResumeStore(next: ResumeStoreData): void {
  if (typeof window === 'undefined') return;
  const tiers = [
    { lessons: MAX_LESSONS, quizzes: MAX_QUIZZES, exercises: MAX_EXERCISES, active: MAX_ACTIVE_REFS, keepDraftsCount: 20 },
    { lessons: 40, quizzes: 40, exercises: 40, active: 40, keepDraftsCount: 3 },
    { lessons: 15, quizzes: 15, exercises: 15, active: 20, keepDraftsCount: 0 },
    { lessons: 3, quizzes: 3, exercises: 3, active: 5, keepDraftsCount: 0 },
  ];
  for (const tier of tiers) {
    try {
      const payload = buildTrimmedStore(next, tier);
      window.localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(payload));
      return;
    } catch {
      // retry with stricter eviction tier
    }
  }
}

/** Évince les anciennes entrées de `ap-resume` pour libérer du quota `localStorage` au profit de `ap` / `ap-p`. */
export function evictResumeForQuota(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return false;
    const current = readResumeStore();
    const compact = buildTrimmedStore(current, {
      lessons: 15,
      quizzes: 15,
      exercises: 15,
      active: 20,
      keepDraftsCount: 0,
    });
    const nextStr = JSON.stringify(compact);
    if (nextStr.length < raw.length) {
      window.localStorage.setItem(RESUME_STORAGE_KEY, nextStr);
      return true;
    }
    window.localStorage.removeItem(RESUME_STORAGE_KEY);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(RESUME_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

if (typeof window !== 'undefined') {
  registerQuotaEvictor(evictResumeForQuota);
}

export function clearResumeStore(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {}
}

export function getLessonResume(scrollKey: string, legacyKey?: string): LessonResumeSnapshot | null {
  if (!scrollKey && !legacyKey) return null;
  const lessons = readResumeStore().lessons;
  return (scrollKey && lessons[scrollKey]) || (legacyKey ? lessons[legacyKey] : null) || null;
}

export function saveLessonResume(scrollKey: string, patch: Partial<LessonResumeSnapshot>): void {
  if (!isSafeKey(scrollKey)) return;
  const store = readResumeStore();
  const prev = store.lessons[scrollKey];
  const pct = typeof patch.pct === 'number' ? clampInt(patch.pct, 0, 100, 0) : (prev?.pct ?? 0);
  const maxPct = Math.max(prev?.maxPct ?? 0, typeof patch.maxPct === 'number' ? clampInt(patch.maxPct, 0, 100, pct) : pct);
  const sanitized = sanitizeLessonEntry({
    ...(prev || {}),
    ...patch,
    pct,
    maxPct: Math.max(pct, maxPct),
    updatedAt: Date.now(),
  });
  if (!sanitized) return;
  store.lessons[scrollKey] = sanitized;
  writeResumeStore(store);
}

export function getLessonActiveSheet(chapterId: string, classId?: string): LessonActiveSheetRef | null {
  if (!chapterId) return null;
  const sheets = readResumeStore().lessonActiveSheet;
  if (classId && !chapterId.includes(':')) {
    const scoped = sheets[buildLessonActiveSheetKey(classId, chapterId)];
    if (scoped) return scoped;
  }
  return sheets[chapterId] ?? null;
}

export function saveLessonActiveSheet(
  chapterId: string,
  ref: { sheetId: string; href: string; scrollKey: string },
  classId?: string
): void {
  if (!chapterId || !ref.sheetId) return;
  const key = classId && !chapterId.includes(':') ? buildLessonActiveSheetKey(classId, chapterId) : chapterId;
  if (!isSafeKey(key)) return;
  const clean = sanitizeActiveSheetEntry({ ...ref, updatedAt: Date.now() });
  if (!clean) return;
  const store = readResumeStore();
  store.lessonActiveSheet[key] = clean;
  writeResumeStore(store);
}

export function getQuizResume(sessionKey: string, legacySessionKey?: string): QuizResumeSnapshot | null {
  if (!sessionKey && !legacySessionKey) return null;
  const quizzes = readResumeStore().quizzes;
  return (sessionKey && quizzes[sessionKey]) || (legacySessionKey ? quizzes[legacySessionKey] : null) || null;
}

export function saveQuizResume(sessionKey: string, snapshot: Omit<QuizResumeSnapshot, 'updatedAt'>): void {
  if (!isSafeKey(sessionKey)) return;
  const clean = sanitizeQuizEntry({ ...snapshot, updatedAt: Date.now() }, true);
  if (!clean) return;
  const store = readResumeStore();
  store.quizzes[sessionKey] = clean;
  writeResumeStore(store);
}

export function clearQuizResume(sessionKey: string): void {
  if (!sessionKey) return;
  const store = readResumeStore();
  if (store.quizzes[sessionKey]) {
    delete store.quizzes[sessionKey];
    writeResumeStore(store);
  }
}

export function getChapterActiveQuiz(chapterKey: string, legacyKey?: string): string | null {
  if (!chapterKey && !legacyKey) return null;
  const map = readResumeStore().chapterActiveQuiz;
  return (chapterKey && map[chapterKey]) || (legacyKey ? map[legacyKey] : null) || null;
}

export function saveChapterActiveQuiz(chapterKey: string, quizId: string): void {
  if (!isSafeKey(chapterKey) || !quizId) return;
  const store = readResumeStore();
  store.chapterActiveQuiz[chapterKey] = String(quizId).slice(0, 120);
  if (!store.chapterActiveQuizUpdatedAt) store.chapterActiveQuizUpdatedAt = {};
  store.chapterActiveQuizUpdatedAt[chapterKey] = Date.now();
  writeResumeStore(store);
}

export function getExerciseResume(storeKey: string, legacyKey?: string): ExerciseResumeSnapshot | null {
  if (!storeKey && !legacyKey) return null;
  const exercises = readResumeStore().exercises;
  return (storeKey && exercises[storeKey]) || (legacyKey ? exercises[legacyKey] : null) || null;
}

export function saveExerciseResume(storeKey: string, snapshot: Omit<ExerciseResumeSnapshot, 'updatedAt'>): void {
  if (!isSafeKey(storeKey)) return;
  const clean = sanitizeExerciseEntry({ ...snapshot, updatedAt: Date.now() });
  if (!clean) return;
  const store = readResumeStore();
  store.exercises[storeKey] = clean;
  writeResumeStore(store);
}

export function clearExerciseResume(storeKey: string): void {
  if (!storeKey) return;
  const store = readResumeStore();
  if (store.exercises[storeKey]) {
    delete store.exercises[storeKey];
    writeResumeStore(store);
  }
}

export function findFirstUnfinishedIndex(total: number, isDoneAt: (i: number) => boolean): number {
  if (total <= 0) return 0;
  for (let i = 0; i < total; i++) {
    if (!isDoneAt(i)) return i;
  }
  return 0;
}

export function compactSectionLabel(secTitle?: string): string {
  const clean = String(secTitle || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > 34 ? `${clean.slice(0, 33).trimEnd()}…` : clean;
}

export interface HydrateQuizCloudQuestion {
  type?: string;
  correctIndex?: number;
  correctOrder?: string[];
  correctAnswers?: string[];
}

/**
 * Hydrate proprement les réponses de reprise à partir d'un tableau `state.q`
 * sans synthétiser de `selectedIndex` sur `input`/`order` ni sur les réponses fausses (`0`).
 */
export function hydrateQuizAnswersFromCloud(
  questions: readonly HydrateQuizCloudQuestion[],
  cloudArr: ReadonlyArray<number | null | undefined>,
  initialAnswers: Record<number, QuizAnswer> = {},
  initialSkipped: Record<number, boolean> = {}
): { answers: Record<number, QuizAnswer>; skipped: Record<number, boolean> } {
  const nextAnswers: Record<number, QuizAnswer> = { ...initialAnswers };
  const nextSkipped: Record<number, boolean> = { ...initialSkipped };

  cloudArr.forEach((score, i) => {
    if (i >= questions.length) return;
    if (score === 1 || score === 0) {
      if (nextAnswers[i]?.status === 'answered') {
        delete nextSkipped[i];
        return;
      }
      const q = questions[i];
      const qType = String(q?.type || 'mcq').toLowerCase();
      const ans: QuizAnswer = {
        status: 'answered',
        isCorrect: score === 1,
      };
      if (score === 1) {
        if (
          (qType === 'mcq' || qType === 'boolean' || qType === 'error')
          && typeof q?.correctIndex === 'number'
          && Number.isInteger(q.correctIndex)
          && q.correctIndex >= 0
        ) {
          ans.selectedIndex = q.correctIndex;
        } else if (qType === 'order' && Array.isArray(q?.correctOrder)) {
          ans.orderItems = q.correctOrder.slice();
        } else if (qType === 'input' && Array.isArray(q?.correctAnswers) && q.correctAnswers[0]) {
          ans.text = q.correctAnswers[0];
        }
      }
      nextAnswers[i] = ans;
      delete nextSkipped[i];
    } else if (score === -1 && !nextAnswers[i]) {
      nextSkipped[i] = true;
    }
  });

  return { answers: nextAnswers, skipped: nextSkipped };
}

function toCloudQuizEntry(q: QuizResumeSnapshot): CloudResumeQuizEntry {
  const answers: Record<number, CloudResumeQuizAnswer> = {};
  for (const [k, ans] of Object.entries(q.answers)) {
    answers[Number(k)] = { ...ans };
  }
  return {
    selectedQuizId: q.selectedQuizId,
    phase: q.phase,
    idx: q.idx,
    answers,
    skipped: q.skipped.slice(),
    elapsedSec: q.elapsedSec,
    reviewQueue: q.reviewQueue ? q.reviewQueue.slice() : null,
    ...(q.totalQuestions !== undefined ? { totalQuestions: q.totalQuestions } : {}),
    ...(q.answeredCount !== undefined ? { answeredCount: q.answeredCount } : {}),
    updatedAt: q.updatedAt,
  };
}

function toCloudLessonEntry(l: LessonResumeSnapshot): CloudResumeLessonEntry {
  const combinedBlanks: Array<number | string> = [
    ...(l.revealedBlanks || []),
    ...(l.revealedBlankIds || []),
  ];
  return {
    pct: l.pct,
    maxPct: l.maxPct,
    ...(l.secId ? { secId: l.secId } : {}),
    ...(l.secTitle ? { secTitle: l.secTitle } : {}),
    ...(combinedBlanks.length ? { revealedBlanks: combinedBlanks } : {}),
    ...(l.bookmarks?.length ? { bookmarks: l.bookmarks } : {}),
    updatedAt: l.updatedAt,
  };
}

/** Exporte une vue compacte de `ap-resume` prête pour CRDT (sans `drafts` ni `remainingByIdx`). */
export function exportCloudResume(maxPerBucket = 40): CloudResumeData | null {
  const store = readResumeStore();
  const prunedLessons = pruneOldest(store.lessons, maxPerBucket);
  const lessons: Record<string, CloudResumeLessonEntry> = {};
  for (const [k, l] of Object.entries(prunedLessons)) {
    lessons[k] = toCloudLessonEntry(l);
  }
  const lessonActiveSheet = pruneOldest(store.lessonActiveSheet, maxPerBucket);
  const rawQuizzes = pruneOldest(store.quizzes, maxPerBucket);
  const quizzes: Record<string, CloudResumeQuizEntry> = {};
  for (const [k, q] of Object.entries(rawQuizzes)) {
    quizzes[k] = toCloudQuizEntry(q);
  }
  const chapterActiveQuiz = serializeActiveQuizBuckets(store, maxPerBucket);
  const exercises = pruneOldest(store.exercises, maxPerBucket);

  const hasAny =
    Object.keys(lessons).length > 0
    || Object.keys(lessonActiveSheet).length > 0
    || Object.keys(quizzes).length > 0
    || Object.keys(chapterActiveQuiz).length > 0
    || Object.keys(exercises).length > 0;
  if (!hasAny) return null;

  return { lessons, lessonActiveSheet, quizzes, chapterActiveQuiz, exercises };
}

export function sanitizeCloudResume(raw: unknown, maxPerBucket = 40): CloudResumeData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { lessons: {}, lessonActiveSheet: {}, quizzes: {}, chapterActiveQuiz: {}, exercises: {} };
  }
  const r = raw as Record<string, unknown>;
  const prunedLessons = pruneOldest(sanitizeMap(r.lessons, sanitizeLessonEntry), maxPerBucket);
  const lessons: Record<string, CloudResumeLessonEntry> = {};
  for (const [k, l] of Object.entries(prunedLessons)) {
    lessons[k] = toCloudLessonEntry(l);
  }
  const lessonActiveSheet = pruneOldest(sanitizeMap(r.lessonActiveSheet, sanitizeActiveSheetEntry), maxPerBucket);
  const rawQuizzes = pruneOldest(sanitizeMap(r.quizzes, (v) => sanitizeQuizEntry(v, false)), maxPerBucket);
  const quizzes: Record<string, CloudResumeQuizEntry> = {};
  for (const [k, q] of Object.entries(rawQuizzes)) {
    quizzes[k] = toCloudQuizEntry(q);
  }
  const chapterActiveQuiz = pruneOldest(sanitizeMap(r.chapterActiveQuiz, sanitizeActiveQuizEntry), maxPerBucket);
  const exercises = pruneOldest(sanitizeMap(r.exercises, sanitizeExerciseEntry), maxPerBucket);

  return { lessons, lessonActiveSheet, quizzes, chapterActiveQuiz, exercises };
}

function mergeQuizResumePair(inc: CloudResumeQuizEntry, cur: CloudResumeQuizEntry): CloudResumeQuizEntry {
  const newer = inc.updatedAt >= cur.updatedAt ? inc : cur;
  const answers: Record<number, CloudResumeQuizAnswer> = {};
  for (const kStr of new Set([...Object.keys(cur.answers), ...Object.keys(inc.answers)])) {
    const k = Number(kStr);
    const a = inc.answers[k];
    const b = cur.answers[k];
    if (!a) answers[k] = b;
    else if (!b) answers[k] = a;
    else if (a.isCorrect !== b.isCorrect) answers[k] = a.isCorrect ? a : b;
    else answers[k] = inc.updatedAt >= cur.updatedAt ? a : b;
  }
  const skipped = Array.from(new Set([...cur.skipped, ...inc.skipped])).filter((i) => !answers[i]);
  return {
    selectedQuizId: newer.selectedQuizId,
    phase: inc.phase === 'end' || cur.phase === 'end' ? (newer.phase === 'end' ? 'end' : newer.phase) : 'run',
    idx: newer.idx,
    answers,
    skipped,
    elapsedSec: Math.max(inc.elapsedSec || 0, cur.elapsedSec || 0),
    reviewQueue: newer.reviewQueue ? newer.reviewQueue.slice() : null,
    totalQuestions: newer.totalQuestions ?? cur.totalQuestions ?? inc.totalQuestions,
    answeredCount: Object.keys(answers).length,
    updatedAt: Math.max(inc.updatedAt, cur.updatedAt),
  };
}

function mergeExerciseResumePair(inc: CloudResumeExerciseEntry, cur: CloudResumeExerciseEntry): CloudResumeExerciseEntry {
  const newer = inc.updatedAt >= cur.updatedAt ? inc : cur;
  const spent: Record<number, number> = {};
  for (const kStr of new Set([...Object.keys(cur.spent), ...Object.keys(inc.spent)])) {
    const k = Number(kStr);
    const v = Math.max(cur.spent[k] || 0, inc.spent[k] || 0);
    if (v > 0) spent[k] = v;
  }
  return {
    index: newer.index,
    mode: normalizeExerciseMode(newer.mode, 'pas'),
    openHints: Array.from(new Set([...cur.openHints, ...inc.openHints])).slice(0, 300),
    openSolutions: Array.from(new Set([...cur.openSolutions, ...inc.openSolutions])).slice(0, 300),
    revealed: Array.from(new Set([...cur.revealed, ...inc.revealed])).slice(0, 200),
    elapsedSec: Math.max(inc.elapsedSec || 0, cur.elapsedSec || 0),
    spent,
    totalExercises: newer.totalExercises ?? cur.totalExercises ?? inc.totalExercises,
    doneCount: Math.max(inc.doneCount || 0, cur.doneCount || 0),
    updatedAt: Math.max(inc.updatedAt, cur.updatedAt),
  };
}

/** Fusion CRDT monotone + LWW horodaté de deux structures `CloudResumeData`. */
export function mergeCloudResumes(
  incoming: Partial<CloudResumeData> | null | undefined,
  current: Partial<CloudResumeData> | null | undefined,
  maxPerBucket = 40
): CloudResumeData {
  const inc = sanitizeCloudResume(incoming, maxPerBucket);
  const cur = sanitizeCloudResume(current, maxPerBucket);

  const lessons: Record<string, CloudResumeLessonEntry> = {};
  for (const k of new Set([...Object.keys(cur.lessons), ...Object.keys(inc.lessons)])) {
    const a = inc.lessons[k];
    const b = cur.lessons[k];
    if (!a) lessons[k] = b;
    else if (!b) lessons[k] = a;
    else {
      const newer = a.updatedAt >= b.updatedAt ? a : b;
      const bookmarks = Array.from(new Set([...(b.bookmarks || []), ...(a.bookmarks || [])])).slice(0, 100);
      lessons[k] = {
        ...newer,
        maxPct: Math.max(a.maxPct, b.maxPct),
        ...(bookmarks.length ? { bookmarks } : {}),
        updatedAt: Math.max(a.updatedAt, b.updatedAt),
      };
    }
  }

  const lessonActiveSheet: Record<string, CloudResumeActiveSheetEntry> = {};
  for (const k of new Set([...Object.keys(cur.lessonActiveSheet), ...Object.keys(inc.lessonActiveSheet)])) {
    const a = inc.lessonActiveSheet[k];
    const b = cur.lessonActiveSheet[k];
    if (!a) lessonActiveSheet[k] = b;
    else if (!b) lessonActiveSheet[k] = a;
    else lessonActiveSheet[k] = a.updatedAt >= b.updatedAt ? a : b;
  }

  const quizzes: Record<string, CloudResumeQuizEntry> = {};
  for (const k of new Set([...Object.keys(cur.quizzes), ...Object.keys(inc.quizzes)])) {
    const a = inc.quizzes[k];
    const b = cur.quizzes[k];
    quizzes[k] = !a ? b : !b ? a : mergeQuizResumePair(a, b);
  }

  const chapterActiveQuiz: Record<string, CloudResumeActiveQuizEntry | string> = {};
  for (const k of new Set([...Object.keys(cur.chapterActiveQuiz), ...Object.keys(inc.chapterActiveQuiz)])) {
    const a = sanitizeActiveQuizEntry(inc.chapterActiveQuiz[k]);
    const b = sanitizeActiveQuizEntry(cur.chapterActiveQuiz[k]);
    if (!a && b) chapterActiveQuiz[k] = b;
    else if (a && !b) chapterActiveQuiz[k] = a;
    else if (a && b) chapterActiveQuiz[k] = a.updatedAt >= b.updatedAt ? a : b;
  }

  const exercises: Record<string, CloudResumeExerciseEntry> = {};
  for (const k of new Set([...Object.keys(cur.exercises), ...Object.keys(inc.exercises)])) {
    const a = inc.exercises[k];
    const b = cur.exercises[k];
    exercises[k] = !a ? b : !b ? a : mergeExerciseResumePair(a, b);
  }

  return {
    lessons: pruneOldest(lessons, maxPerBucket),
    lessonActiveSheet: pruneOldest(lessonActiveSheet, maxPerBucket),
    quizzes: pruneOldest(quizzes, maxPerBucket),
    chapterActiveQuiz: pruneOldest(chapterActiveQuiz, maxPerBucket),
    exercises: pruneOldest(exercises, maxPerBucket),
  };
}

/** Applique le `resume` cloud fusionné dans `ap-resume` tout en préservant les `drafts`/`remainingByIdx` locaux. */
export function applyCloudResumeToLocal(cloudResume: Partial<CloudResumeData> | null | undefined): void {
  if (typeof window === 'undefined' || !cloudResume) return;
  const local = readResumeStore();
  const merged = mergeCloudResumes(cloudResume, local, MAX_QUIZZES);

  const nextQuizzes: Record<string, QuizResumeSnapshot> = {};
  for (const [k, cq] of Object.entries(merged.quizzes)) {
    const prevLocal = local.quizzes[k];
    nextQuizzes[k] = {
      ...cq,
      drafts: prevLocal?.drafts || {},
      remainingByIdx: prevLocal?.remainingByIdx || {},
    };
  }
  for (const [k, lq] of Object.entries(local.quizzes)) {
    if (!nextQuizzes[k]) nextQuizzes[k] = lq;
  }

  const localLessons: Record<string, LessonResumeSnapshot> = { ...local.lessons };
  for (const [k, cl] of Object.entries(merged.lessons)) {
    const clean = sanitizeLessonEntry(cl);
    if (clean) localLessons[k] = clean;
  }

  const nextActive: Record<string, string> = { ...local.chapterActiveQuiz };
  const nextActiveTs: Record<string, number> = { ...(local.chapterActiveQuizUpdatedAt || {}) };
  for (const [k, v] of Object.entries(merged.chapterActiveQuiz)) {
    const parsed = sanitizeActiveQuizEntry(v);
    if (parsed) {
      nextActive[k] = parsed.quizId;
      nextActiveTs[k] = Math.max(nextActiveTs[k] || 0, parsed.updatedAt);
    }
  }

  writeResumeStore({
    schemaVersion: RESUME_SCHEMA_VERSION,
    lessons: localLessons,
    lessonActiveSheet: { ...local.lessonActiveSheet, ...merged.lessonActiveSheet },
    quizzes: nextQuizzes,
    chapterActiveQuiz: nextActive,
    chapterActiveQuizUpdatedAt: nextActiveTs,
    exercises: { ...local.exercises, ...merged.exercises },
  });
}
