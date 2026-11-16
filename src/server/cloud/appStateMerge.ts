/**
 * Fusion monotone (CRDT-like) de l'etat autonome `Apprendre.html` (`ap` + `ap-p`)
 * et de `apps/apprendre-next` entre plusieurs appareils et entre L1 Redis / L2 Firestore.
 * Aucune dependance reseau ; utilisable sur serveur, Next.js et tests unitaires.
 */

export interface ApprendreProfilePayload {
  th?: string;
  cls?: string;
  fn?: string;
  ln?: string;
  sc?: string;
  docFont?: string;
  docScale?: number;
  tiersTemps?: boolean;
  soundEnabled?: boolean;
  lexiconAutoHighlight?: boolean;
  reduceMotion?: boolean;
  quizTimePerQuestion?: number;
  profileUpdatedAt?: number;
}

export interface ApprendreLastVisited {
  hash?: string | null;
  href?: string | null;
  url?: string | null;
  title?: string;
  chapterTitle?: string;
  kind?: string;
  type?: string;
  chapterId?: string | null;
  classId?: string | null;
  at?: number;
}

export type CloudQuizValue =
  | Array<number | null>
  | { answers?: Array<number | null>; done?: number; isSubmitted?: boolean };

export type CloudExerciseValue = Array<number | null> | Record<string, number>;

export type CloudLessonValue = number | { pct?: number };

export interface ApprendreStateData {
  q: Record<string, CloudQuizValue>;
  e: Record<string, CloudExerciseValue>;
  l: Record<string, number>;
  lastVisited: ApprendreLastVisited | null;
}

export interface StickyUnlockEntry {
  quiz?: boolean;
  exercises?: boolean;
}

export interface CloudLessonResumeEntry {
  pct: number;
  maxPct: number;
  secId?: string;
  secTitle?: string;
  revealedBlanks?: Array<number | string>;
  bookmarks?: string[];
  updatedAt: number;
}

export interface CloudLessonActiveSheetEntry {
  sheetId: string;
  href: string;
  scrollKey: string;
  updatedAt: number;
}

export interface CloudQuizResumeEntry {
  selectedQuizId: string;
  phase: 'run' | 'end';
  idx: number;
  answers: Record<string, unknown>;
  skipped: number[];
  elapsedSec: number;
  reviewQueue: number[] | null;
  totalQuestions?: number;
  answeredCount?: number;
  updatedAt: number;
}

export interface CloudExerciseResumeEntry {
  index: number;
  mode: 'pas' | 'examen';
  openHints: string[];
  openSolutions: string[];
  revealed: number[];
  elapsedSec: number;
  spent: Record<string, number>;
  totalExercises?: number;
  doneCount?: number;
  updatedAt: number;
}

export interface CloudChapterActiveQuizEntry {
  quizId: string;
  updatedAt: number;
}

export interface CloudResumeEnvelope {
  lessons?: Record<string, CloudLessonResumeEntry>;
  lessonActiveSheet?: Record<string, CloudLessonActiveSheetEntry>;
  quizzes?: Record<string, CloudQuizResumeEntry>;
  chapterActiveQuiz?: Record<string, string | CloudChapterActiveQuizEntry>;
  exercises?: Record<string, CloudExerciseResumeEntry>;
}

export interface CloudAppEnvelope {
  profile: ApprendreProfilePayload;
  state: ApprendreStateData;
  updatedAt: number;
  revision: number;
  resetAt?: number;
  unlocks?: Record<string, StickyUnlockEntry>;
  resume?: CloudResumeEnvelope;
}

export const MAX_CLOUD_ENVELOPE_BYTES = 850_000;
const MAX_STATE_KEYS = 300;
const MAX_ARRAY_LEN = 200;
const MAX_SUB_KEYS = 200;
const MAX_UNLOCK_KEYS = 100;
const MAX_RESUME_ENTRIES = 40;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const QUIZ_RANK: Record<string, number> = { null: 0, '-1': 1, '0': 2, '1': 3 };

function isSafeKey(key: string): boolean {
  if (!key || key.length > 160 || FORBIDDEN_KEYS.has(key)) return false;
  for (const char of key) {
    const code = char.codePointAt(0)!;
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanStr(val: unknown, maxLen: number): string {
  let out = '';
  for (const ch of String(val ?? '')) {
    const code = ch.codePointAt(0) || 0;
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) continue;
    out += ch;
  }
  return out.trim().slice(0, maxLen);
}

function cleanSafeHref(val: unknown, maxLen = 240): string | null {
  if (typeof val !== 'string') return null;
  const s = cleanStr(val, maxLen);
  if (!s) return null;
  if (s.startsWith('#')) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return null;
}

function normalizeQuizScore(val: unknown): number | null {
  return val === 1 || val === 0 || val === -1 ? val : null;
}

export function mergeQuizScores(
  localArr: Array<number | null> = [],
  cloudArr: Array<number | null> = [],
): Array<number | null> {
  const len = Math.min(MAX_ARRAY_LEN, Math.max(localArr.length, cloudArr.length));
  const merged: Array<number | null> = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    const a = normalizeQuizScore(localArr[i]);
    const b = normalizeQuizScore(cloudArr[i]);
    const rA = QUIZ_RANK[String(a)] ?? 0;
    const rB = QUIZ_RANK[String(b)] ?? 0;
    merged[i] = rA >= rB ? a : b;
  }
  return merged;
}

function mergeQuizEntry(
  incomingEntry: CloudQuizValue | undefined,
  currentEntry: CloudQuizValue | undefined,
): CloudQuizValue {
  const incIsObj = isPlainRecord(incomingEntry);
  const curIsObj = isPlainRecord(currentEntry);

  const incArr = Array.isArray(incomingEntry)
    ? incomingEntry
    : incIsObj && Array.isArray(incomingEntry.answers)
      ? incomingEntry.answers
      : [];
  const curArr = Array.isArray(currentEntry)
    ? currentEntry
    : curIsObj && Array.isArray(currentEntry.answers)
      ? currentEntry.answers
      : [];

  const mergedArr = mergeQuizScores(incArr, curArr);

  if (!incIsObj && !curIsObj) {
    return mergedArr;
  }

  const incDone = incIsObj && typeof incomingEntry.done === 'number' && Number.isFinite(incomingEntry.done)
    ? Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(incomingEntry.done)))
    : undefined;
  const curDone = curIsObj && typeof currentEntry.done === 'number' && Number.isFinite(currentEntry.done)
    ? Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(currentEntry.done)))
    : undefined;
  const done = incDone !== undefined || curDone !== undefined ? Math.max(incDone ?? 0, curDone ?? 0) : undefined;
  const isSubmitted = Boolean((incIsObj && incomingEntry.isSubmitted) || (curIsObj && currentEntry.isSubmitted));

  return {
    answers: mergedArr,
    ...(done !== undefined ? { done } : {}),
    ...(isSubmitted ? { isSubmitted: true } : {}),
  };
}

function normalizeRating(val: unknown): number | null {
  return val === 0 || val === 1 || val === 2 ? val : null;
}

export function mergeExerciseRatings(
  localArr: Array<number | null> = [],
  cloudArr: Array<number | null> = [],
): Array<number | null> {
  const len = Math.min(MAX_ARRAY_LEN, Math.max(localArr.length, cloudArr.length));
  const merged: Array<number | null> = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    const a = normalizeRating(localArr[i]);
    const b = normalizeRating(cloudArr[i]);
    if (a === null) merged[i] = b;
    else if (b === null) merged[i] = a;
    else merged[i] = Math.max(a, b);
  }
  return merged;
}

function mergeExerciseEntry(
  incomingEntry: CloudExerciseValue | undefined,
  currentEntry: CloudExerciseValue | undefined,
): CloudExerciseValue {
  const incIsArr = Array.isArray(incomingEntry);
  const curIsArr = Array.isArray(currentEntry);

  if ((incIsArr || incomingEntry === undefined) && (curIsArr || currentEntry === undefined)) {
    return mergeExerciseRatings(
      incIsArr ? incomingEntry : [],
      curIsArr ? currentEntry : [],
    );
  }

  const out: Record<string, number> = Object.create(null);
  const apply = (entry: CloudExerciseValue | undefined) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.slice(0, MAX_ARRAY_LEN).forEach((val, idx) => {
        const rating = normalizeRating(val);
        if (rating !== null) {
          const key = String(idx);
          out[key] = out[key] !== undefined ? Math.max(out[key], rating) : rating;
        }
      });
      return;
    }
    if (isPlainRecord(entry)) {
      let count = 0;
      for (const [k, raw] of Object.entries(entry)) {
        if (!isSafeKey(k)) continue;
        if (++count > MAX_SUB_KEYS) break;
        const rating = normalizeRating(raw);
        if (rating !== null) {
          out[k] = out[k] !== undefined ? Math.max(out[k], rating) : rating;
        }
      }
    }
  };

  apply(currentEntry);
  apply(incomingEntry);
  return { ...out };
}

function sanitizeLastVisited(raw: unknown): ApprendreLastVisited | null {
  if (!isPlainRecord(raw)) return null;
  const out: ApprendreLastVisited = {};
  if (raw.hash === null) out.hash = null;
  else if (typeof raw.hash === 'string') {
    const h = cleanStr(raw.hash, 160);
    if (h) out.hash = h;
  }
  if (raw.href === null) out.href = null;
  else {
    const href = cleanSafeHref(raw.href);
    if (href) out.href = href;
  }
  if (raw.url === null) out.url = null;
  else {
    const url = cleanSafeHref(raw.url);
    if (url) out.url = url;
  }
  if (typeof raw.title === 'string') {
    const t = cleanStr(raw.title, 160);
    if (t) out.title = t;
  }
  if (typeof raw.chapterTitle === 'string') {
    const ct = cleanStr(raw.chapterTitle, 160);
    if (ct) out.chapterTitle = ct;
  }
  if (typeof raw.kind === 'string') {
    const k = cleanStr(raw.kind, 32);
    if (k) out.kind = k;
  }
  if (typeof raw.type === 'string') {
    const tp = cleanStr(raw.type, 32);
    if (tp) out.type = tp;
  }
  if (raw.chapterId === null) out.chapterId = null;
  else if (typeof raw.chapterId === 'string') {
    const ch = cleanStr(raw.chapterId, 100);
    if (ch) out.chapterId = ch;
  }
  if (raw.classId === null) out.classId = null;
  else if (typeof raw.classId === 'string') {
    const cls = cleanStr(raw.classId, 64);
    if (cls) out.classId = cls;
  }
  if (raw.at !== undefined) {
    const at = Number(raw.at);
    if (Number.isFinite(at) && at >= 0) out.at = Math.trunc(at);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function mergeLastVisited(
  localLv: ApprendreLastVisited | null | undefined,
  cloudLv: ApprendreLastVisited | null | undefined,
): ApprendreLastVisited | null {
  const cleanL = sanitizeLastVisited(localLv);
  const cleanC = sanitizeLastVisited(cloudLv);
  if (!cleanL && !cleanC) return null;
  if (!cleanC) return cleanL;
  if (!cleanL) return cleanC;
  const atL = Number(cleanL.at) || 0;
  const atC = Number(cleanC.at) || 0;
  return atL >= atC ? { ...cleanL } : { ...cleanC };
}

function sanitizeProfilePayload(raw: unknown): ApprendreProfilePayload {
  if (!isPlainRecord(raw)) return {};
  const out: ApprendreProfilePayload = {};
  if (raw.th === 'auto' || raw.th === 'light' || raw.th === 'dark') out.th = raw.th;
  if (typeof raw.cls === 'string') {
    const cls = cleanStr(raw.cls, 48);
    if (/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(cls)) out.cls = cls;
  }
  if (typeof raw.fn === 'string') out.fn = cleanStr(raw.fn, 60);
  if (typeof raw.ln === 'string') out.ln = cleanStr(raw.ln, 60);
  if (typeof raw.sc === 'string') out.sc = cleanStr(raw.sc, 100);
  if (raw.docFont === 'literata' || raw.docFont === 'serif' || raw.docFont === 'sans') out.docFont = raw.docFont;
  if (raw.docScale !== undefined) {
    const ds = Number(raw.docScale);
    if (Number.isFinite(ds)) out.docScale = Math.min(1.4, Math.max(0.85, ds));
  }
  if (typeof raw.tiersTemps === 'boolean') out.tiersTemps = raw.tiersTemps;
  if (typeof raw.soundEnabled === 'boolean') out.soundEnabled = raw.soundEnabled;
  if (typeof raw.lexiconAutoHighlight === 'boolean') out.lexiconAutoHighlight = raw.lexiconAutoHighlight;
  if (typeof raw.reduceMotion === 'boolean') out.reduceMotion = raw.reduceMotion;
  if (raw.quizTimePerQuestion !== undefined) {
    const qt = Number(raw.quizTimePerQuestion);
    if (Number.isFinite(qt)) out.quizTimePerQuestion = Math.min(600, Math.max(15, Math.trunc(qt)));
  }
  if (raw.profileUpdatedAt !== undefined) {
    const ts = Number(raw.profileUpdatedAt);
    if (Number.isFinite(ts) && ts >= 0) out.profileUpdatedAt = Math.trunc(ts);
  }
  return out;
}

export function mergeProfile(
  localP: ApprendreProfilePayload | undefined,
  cloudP: ApprendreProfilePayload | undefined,
): ApprendreProfilePayload {
  const l = sanitizeProfilePayload(localP);
  const c = sanitizeProfilePayload(cloudP);
  const tL = Number(l.profileUpdatedAt) || 0;
  const tC = Number(c.profileUpdatedAt) || 0;
  const newer = tL >= tC ? l : c;
  const older = tL >= tC ? c : l;
  return {
    ...older,
    ...newer,
    fn: newer.fn || older.fn || '',
    ln: newer.ln || older.ln || '',
    sc: newer.sc || older.sc || '',
    cls: newer.cls || older.cls || '2eme-bac-sc-ex',
    profileUpdatedAt: Math.max(tL, tC),
  };
}

function readLessonPct(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.min(100, Math.max(0, Math.round(val))) : 0;
  }
  if (isPlainRecord(val) && typeof val.pct === 'number' && Number.isFinite(val.pct)) {
    return Math.min(100, Math.max(0, Math.round(val.pct)));
  }
  return 0;
}

export function sanitizeAppState(raw: unknown): ApprendreStateData {
  const s = isPlainRecord(raw) ? raw : {};
  const q: Record<string, CloudQuizValue> = Object.create(null);
  let qCount = 0;
  for (const [k, val] of Object.entries(isPlainRecord(s.q) ? s.q : {})) {
    if (!isSafeKey(k)) continue;
    if (++qCount > MAX_STATE_KEYS) break;
    if (Array.isArray(val)) {
      q[k] = val.slice(0, MAX_ARRAY_LEN).map(normalizeQuizScore);
    } else if (isPlainRecord(val)) {
      const answers = Array.isArray(val.answers)
        ? val.answers.slice(0, MAX_ARRAY_LEN).map(normalizeQuizScore)
        : [];
      const done = typeof val.done === 'number' && Number.isFinite(val.done)
        ? Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(val.done)))
        : undefined;
      q[k] = {
        answers,
        ...(done !== undefined ? { done } : {}),
        ...(val.isSubmitted ? { isSubmitted: true } : {}),
      };
    }
  }

  const e: Record<string, CloudExerciseValue> = Object.create(null);
  let eCount = 0;
  for (const [k, val] of Object.entries(isPlainRecord(s.e) ? s.e : {})) {
    if (!isSafeKey(k)) continue;
    if (++eCount > MAX_STATE_KEYS) break;
    if (Array.isArray(val)) {
      e[k] = val.slice(0, MAX_ARRAY_LEN).map(normalizeRating);
    } else if (isPlainRecord(val)) {
      const cleanMap: Record<string, number> = Object.create(null);
      let subCount = 0;
      for (const [sk, sv] of Object.entries(val)) {
        if (!isSafeKey(sk)) continue;
        if (++subCount > MAX_SUB_KEYS) break;
        const rating = normalizeRating(sv);
        if (rating !== null) cleanMap[sk] = rating;
      }
      e[k] = { ...cleanMap };
    }
  }

  const l: Record<string, number> = Object.create(null);
  let lCount = 0;
  for (const [k, pct] of Object.entries(isPlainRecord(s.l) ? s.l : {})) {
    if (!isSafeKey(k)) continue;
    if (++lCount > MAX_STATE_KEYS) break;
    const n = readLessonPct(pct);
    if (n > 0) l[k] = n;
  }

  return {
    q: { ...q },
    e: { ...e },
    l: { ...l },
    lastVisited: sanitizeLastVisited(s.lastVisited),
  };
}

function sanitizeUnlocks(raw: unknown): Record<string, StickyUnlockEntry> | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const out: Record<string, StickyUnlockEntry> = Object.create(null);
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!isSafeKey(k) || !isPlainRecord(v)) continue;
    if (++count > MAX_UNLOCK_KEYS) break;
    const quiz = Boolean(v.quiz);
    const exercises = Boolean(v.exercises);
    if (quiz || exercises) out[k] = { quiz, exercises };
  }
  return { ...out };
}

function mergeUnlocks(
  incRaw: unknown,
  curRaw: unknown,
): Record<string, StickyUnlockEntry> | undefined {
  const inc = sanitizeUnlocks(incRaw);
  const cur = sanitizeUnlocks(curRaw);
  if (!inc && !cur) return undefined;
  const merged: Record<string, StickyUnlockEntry> = Object.create(null);
  const keys = new Set([...Object.keys(cur || {}), ...Object.keys(inc || {})]);
  let count = 0;
  for (const k of keys) {
    if (!isSafeKey(k)) continue;
    if (++count > MAX_UNLOCK_KEYS) break;
    merged[k] = {
      quiz: Boolean(inc?.[k]?.quiz || cur?.[k]?.quiz),
      exercises: Boolean(inc?.[k]?.exercises || cur?.[k]?.exercises),
    };
  }
  return { ...merged };
}

function pruneRecent<T extends { updatedAt?: number }>(
  map: Record<string, T>,
  maxEntries = MAX_RESUME_ENTRIES,
): Record<string, T> {
  const entries = Object.entries(map);
  if (entries.length <= maxEntries) return map;
  entries.sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0));
  return Object.fromEntries(entries.slice(0, maxEntries));
}

function sanitizeResumeLesson(raw: unknown): CloudLessonResumeEntry | null {
  if (!isPlainRecord(raw)) return null;
  const pct = Math.min(100, Math.max(0, Math.round(Number(raw.pct) || 0)));
  const maxPct = Math.min(100, Math.max(pct, Math.round(Number(raw.maxPct) || 0)));
  const updatedAt = Math.max(0, Math.trunc(Number(raw.updatedAt) || 0));
  const secId = typeof raw.secId === 'string' ? cleanStr(raw.secId, 80) : '';
  const secTitle = typeof raw.secTitle === 'string' ? cleanStr(raw.secTitle, 120) : '';
  const revealedBlanks = Array.isArray(raw.revealedBlanks)
    ? raw.revealedBlanks
        .slice(0, MAX_ARRAY_LEN)
        .filter((x): x is number | string =>
          (typeof x === 'number' && Number.isInteger(x) && x >= 0) || (typeof x === 'string' && x.length <= 80),
        )
    : undefined;
  const bookmarks = Array.isArray(raw.bookmarks)
    ? Array.from(new Set(raw.bookmarks.map((b) => cleanStr(b, 120)).filter(Boolean))).slice(0, 100)
    : undefined;
  return {
    pct,
    maxPct,
    ...(secId ? { secId } : {}),
    ...(secTitle ? { secTitle } : {}),
    ...(revealedBlanks ? { revealedBlanks } : {}),
    ...(bookmarks && bookmarks.length > 0 ? { bookmarks } : {}),
    updatedAt,
  };
}

function sanitizeResumeActiveSheet(raw: unknown): CloudLessonActiveSheetEntry | null {
  if (!isPlainRecord(raw)) return null;
  const sheetId = cleanStr(raw.sheetId, 80);
  const href = cleanSafeHref(raw.href);
  const scrollKey = cleanStr(raw.scrollKey, 160);
  if (!sheetId || !href || !scrollKey) return null;
  return {
    sheetId,
    href,
    scrollKey,
    updatedAt: Math.max(0, Math.trunc(Number(raw.updatedAt) || 0)),
  };
}

function sanitizeResumeQuiz(raw: unknown): CloudQuizResumeEntry | null {
  if (!isPlainRecord(raw)) return null;
  const selectedQuizId = cleanStr(raw.selectedQuizId, 100);
  if (!selectedQuizId) return null;
  const phase = raw.phase === 'end' ? 'end' : 'run';
  const idx = Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(Number(raw.idx) || 0)));
  const elapsedSec = Math.max(0, Math.min(86_400, Math.trunc(Number(raw.elapsedSec) || 0)));
  const updatedAt = Math.max(0, Math.trunc(Number(raw.updatedAt) || 0));

  const answers: Record<string, unknown> = {};
  if (isPlainRecord(raw.answers)) {
    let count = 0;
    for (const [k, v] of Object.entries(raw.answers)) {
      if (!/^\d{1,3}$/.test(k) || !isPlainRecord(v)) continue;
      if (++count > MAX_ARRAY_LEN) break;
      answers[k] = {
        ...(v.status === 'answered' ? { status: 'answered' } : {}),
        ...(typeof v.isCorrect === 'boolean' ? { isCorrect: v.isCorrect } : {}),
        ...(typeof v.selectedIndex === 'number' && Number.isInteger(v.selectedIndex)
          ? { selectedIndex: v.selectedIndex }
          : {}),
        ...(typeof v.text === 'string' ? { text: cleanStr(v.text, 200) } : {}),
        ...(Array.isArray(v.orderItems)
          ? { orderItems: v.orderItems.slice(0, 30).map((it) => cleanStr(it, 60)) }
          : {}),
        ...(typeof v.timedOut === 'boolean' ? { timedOut: v.timedOut } : {}),
      };
    }
  }

  const skipped = Array.isArray(raw.skipped)
    ? Array.from(new Set(raw.skipped.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < MAX_ARRAY_LEN)))
    : [];
  const reviewQueue = Array.isArray(raw.reviewQueue)
    ? raw.reviewQueue.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < MAX_ARRAY_LEN).slice(0, MAX_ARRAY_LEN)
    : null;

  return {
    selectedQuizId,
    phase,
    idx,
    answers,
    skipped,
    elapsedSec,
    reviewQueue: reviewQueue && reviewQueue.length > 0 ? reviewQueue : null,
    ...(typeof raw.totalQuestions === 'number' && Number.isFinite(raw.totalQuestions)
      ? { totalQuestions: Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(raw.totalQuestions))) }
      : {}),
    ...(typeof raw.answeredCount === 'number' && Number.isFinite(raw.answeredCount)
      ? { answeredCount: Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(raw.answeredCount))) }
      : {}),
    updatedAt,
  };
}

function sanitizeResumeExercise(raw: unknown): CloudExerciseResumeEntry | null {
  if (!isPlainRecord(raw)) return null;
  const index = Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(Number(raw.index) || 0)));
  const mode = raw.mode === 'examen' ? 'examen' : 'pas';
  const elapsedSec = Math.max(0, Math.min(86_400, Math.trunc(Number(raw.elapsedSec) || 0)));
  const updatedAt = Math.max(0, Math.trunc(Number(raw.updatedAt) || 0));
  const openHints = Array.isArray(raw.openHints)
    ? Array.from(new Set(raw.openHints.map((h) => cleanStr(h, 80)).filter(Boolean))).slice(0, 100)
    : [];
  const openSolutions = Array.isArray(raw.openSolutions)
    ? Array.from(new Set(raw.openSolutions.map((s) => cleanStr(s, 80)).filter(Boolean))).slice(0, 100)
    : [];
  const revealed = Array.isArray(raw.revealed)
    ? Array.from(new Set(raw.revealed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < MAX_ARRAY_LEN)))
    : [];
  const spent: Record<string, number> = {};
  if (isPlainRecord(raw.spent)) {
    let count = 0;
    for (const [k, v] of Object.entries(raw.spent)) {
      if (!isSafeKey(k)) continue;
      if (++count > MAX_ARRAY_LEN) break;
      const n = Math.max(0, Math.min(86_400, Math.trunc(Number(v) || 0)));
      if (n > 0) spent[k] = n;
    }
  }
  return {
    index,
    mode,
    openHints,
    openSolutions,
    revealed,
    elapsedSec,
    spent,
    ...(typeof raw.totalExercises === 'number' && Number.isFinite(raw.totalExercises)
      ? { totalExercises: Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(raw.totalExercises))) }
      : {}),
    ...(typeof raw.doneCount === 'number' && Number.isFinite(raw.doneCount)
      ? { doneCount: Math.max(0, Math.min(MAX_ARRAY_LEN, Math.trunc(raw.doneCount))) }
      : {}),
    updatedAt,
  };
}

function mergeResumeSection<T extends { updatedAt?: number }>(
  incMapRaw: unknown,
  curMapRaw: unknown,
  sanitizer: (val: unknown) => T | null,
  customMerge?: (a: T, b: T) => T,
): Record<string, T> | undefined {
  const incMap = isPlainRecord(incMapRaw) ? incMapRaw : null;
  const curMap = isPlainRecord(curMapRaw) ? curMapRaw : null;
  if (!incMap && !curMap) return undefined;

  const out: Record<string, T> = Object.create(null);
  const allKeys = new Set([...Object.keys(curMap || {}), ...Object.keys(incMap || {})]);
  for (const k of allKeys) {
    if (!isSafeKey(k)) continue;
    const a = incMap ? sanitizer(incMap[k]) : null;
    const b = curMap ? sanitizer(curMap[k]) : null;
    if (!a && !b) continue;
    if (!a) { out[k] = b!; continue; }
    if (!b) { out[k] = a; continue; }
    out[k] = customMerge
      ? customMerge(a, b)
      : ((Number(a.updatedAt) || 0) >= (Number(b.updatedAt) || 0) ? a : b);
  }
  return pruneRecent({ ...out }, MAX_RESUME_ENTRIES);
}

function mergeChapterActiveQuiz(
  incRaw: unknown,
  curRaw: unknown,
): Record<string, string | CloudChapterActiveQuizEntry> | undefined {
  const incMap = isPlainRecord(incRaw) ? incRaw : null;
  const curMap = isPlainRecord(curRaw) ? curRaw : null;
  if (!incMap && !curMap) return undefined;

  const parseEntry = (v: unknown): CloudChapterActiveQuizEntry | null => {
    if (typeof v === 'string') {
      const qid = cleanStr(v, 100);
      return qid ? { quizId: qid, updatedAt: 0 } : null;
    }
    if (isPlainRecord(v) && typeof v.quizId === 'string') {
      const qid = cleanStr(v.quizId, 100);
      return qid ? { quizId: qid, updatedAt: Math.max(0, Math.trunc(Number(v.updatedAt) || 0)) } : null;
    }
    return null;
  };

  const out: Record<string, CloudChapterActiveQuizEntry> = Object.create(null);
  for (const k of new Set([...Object.keys(curMap || {}), ...Object.keys(incMap || {})])) {
    if (!isSafeKey(k)) continue;
    const a = incMap ? parseEntry(incMap[k]) : null;
    const b = curMap ? parseEntry(curMap[k]) : null;
    if (!a && !b) continue;
    if (!a) out[k] = b!;
    else if (!b) out[k] = a;
    else out[k] = a.updatedAt >= b.updatedAt ? a : b;
  }
  return pruneRecent({ ...out }, MAX_RESUME_ENTRIES);
}

function mergeResumeEnvelopes(
  incRaw: unknown,
  curRaw: unknown,
): CloudResumeEnvelope | undefined {
  const inc = isPlainRecord(incRaw) ? incRaw : null;
  const cur = isPlainRecord(curRaw) ? curRaw : null;
  if (!inc && !cur) return undefined;

  const lessons = mergeResumeSection(inc?.lessons, cur?.lessons, sanitizeResumeLesson, (a, b) => {
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    const bookmarks = Array.from(new Set([...(b.bookmarks || []), ...(a.bookmarks || [])])).slice(0, 100);
    return {
      ...newer,
      maxPct: Math.max(a.maxPct, b.maxPct),
      ...(bookmarks.length > 0 ? { bookmarks } : {}),
      updatedAt: Math.max(a.updatedAt, b.updatedAt),
    };
  });
  const lessonActiveSheet = mergeResumeSection(
    inc?.lessonActiveSheet,
    cur?.lessonActiveSheet,
    sanitizeResumeActiveSheet,
  );
  const quizzes = mergeResumeSection(inc?.quizzes, cur?.quizzes, sanitizeResumeQuiz, (a, b) => {
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    const older = a.updatedAt >= b.updatedAt ? b : a;
    const mergedAnswers: Record<string, unknown> = { ...older.answers, ...newer.answers };
    return {
      ...newer,
      phase: a.phase === 'end' || b.phase === 'end' ? 'end' : newer.phase,
      answers: mergedAnswers,
      elapsedSec: Math.max(a.elapsedSec, b.elapsedSec),
      updatedAt: Math.max(a.updatedAt, b.updatedAt),
    };
  });
  const chapterActiveQuiz = mergeChapterActiveQuiz(inc?.chapterActiveQuiz, cur?.chapterActiveQuiz);
  const exercises = mergeResumeSection(inc?.exercises, cur?.exercises, sanitizeResumeExercise, (a, b) => {
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    const spentKeys = new Set([...Object.keys(a.spent), ...Object.keys(b.spent)]);
    const spent: Record<string, number> = {};
    for (const sk of spentKeys) {
      spent[sk] = Math.max(a.spent[sk] || 0, b.spent[sk] || 0);
    }
    return {
      ...newer,
      openHints: Array.from(new Set([...a.openHints, ...b.openHints])).slice(0, 100),
      openSolutions: Array.from(new Set([...a.openSolutions, ...b.openSolutions])).slice(0, 100),
      revealed: Array.from(new Set([...a.revealed, ...b.revealed])).slice(0, MAX_ARRAY_LEN),
      elapsedSec: Math.max(a.elapsedSec, b.elapsedSec),
      spent,
      updatedAt: Math.max(a.updatedAt, b.updatedAt),
    };
  });

  const out: CloudResumeEnvelope = {};
  if (lessons) out.lessons = lessons;
  if (lessonActiveSheet) out.lessonActiveSheet = lessonActiveSheet;
  if (quizzes) out.quizzes = quizzes;
  if (chapterActiveQuiz) out.chapterActiveQuiz = chapterActiveQuiz;
  if (exercises) out.exercises = exercises;
  return Object.keys(out).length > 0 ? out : {};
}

export function serializeBoundedEnvelope(
  envelope: CloudAppEnvelope,
  maxBytes = MAX_CLOUD_ENVELOPE_BYTES,
): { ok: true; json: string; bytes: number } | { ok: false; bytes: number } {
  const json = JSON.stringify(envelope);
  const bytes = Buffer.byteLength(json, 'utf8');
  return bytes <= maxBytes ? { ok: true, json, bytes } : { ok: false, bytes };
}

export function mergeAppEnvelopes(
  incoming: Partial<CloudAppEnvelope> | null | undefined,
  current: Partial<CloudAppEnvelope> | null | undefined,
  nowMs = Date.now(),
): CloudAppEnvelope {
  const incReset = Math.max(0, Math.trunc(Number(incoming?.resetAt) || 0));
  const curReset = Math.max(0, Math.trunc(Number(current?.resetAt) || 0));
  const effectiveResetAt = Math.max(incReset, curReset);

  const ignoreCurrentState = incReset > curReset;
  const incUpdatedAt = Number(incoming?.updatedAt) || 0;
  // Compare reset generations, not request timestamps: an old device can
  // legitimately send its pre-reset snapshot with a new updatedAt value.
  const ignoreIncomingState = incReset < curReset;

  const incState = ignoreIncomingState ? sanitizeAppState(null) : sanitizeAppState(incoming?.state);
  const curState = ignoreCurrentState ? sanitizeAppState(null) : sanitizeAppState(current?.state);

  const qKeys = new Set([...Object.keys(incState.q), ...Object.keys(curState.q)]);
  const q: Record<string, CloudQuizValue> = Object.create(null);
  let qCount = 0;
  for (const k of qKeys) {
    if (!isSafeKey(k)) continue;
    if (++qCount > MAX_STATE_KEYS) break;
    q[k] = mergeQuizEntry(incState.q[k], curState.q[k]);
  }

  const eKeys = new Set([...Object.keys(incState.e), ...Object.keys(curState.e)]);
  const e: Record<string, CloudExerciseValue> = Object.create(null);
  let eCount = 0;
  for (const k of eKeys) {
    if (!isSafeKey(k)) continue;
    if (++eCount > MAX_STATE_KEYS) break;
    e[k] = mergeExerciseEntry(incState.e[k], curState.e[k]);
  }

  const lKeys = new Set([...Object.keys(incState.l), ...Object.keys(curState.l)]);
  const l: Record<string, number> = Object.create(null);
  let lCount = 0;
  for (const k of lKeys) {
    if (!isSafeKey(k)) continue;
    if (++lCount > MAX_STATE_KEYS) break;
    l[k] = Math.max(incState.l[k] || 0, curState.l[k] || 0);
  }

  const unlocks = mergeUnlocks(
    ignoreIncomingState ? undefined : incoming?.unlocks,
    ignoreCurrentState ? undefined : current?.unlocks,
  );
  const resume = mergeResumeEnvelopes(
    ignoreIncomingState ? undefined : incoming?.resume,
    ignoreCurrentState ? undefined : current?.resume,
  );

  return {
    profile: mergeProfile(incoming?.profile, current?.profile),
    state: {
      q: { ...q },
      e: { ...e },
      l: { ...l },
      lastVisited: mergeLastVisited(incState.lastVisited, curState.lastVisited),
    },
    updatedAt: Math.max(nowMs, incUpdatedAt, Number(current?.updatedAt) || 0, effectiveResetAt),
    revision: Math.max(Number(incoming?.revision) || 0, Number(current?.revision) || 0) + 1,
    ...(effectiveResetAt > 0 ? { resetAt: effectiveResetAt } : {}),
    ...(unlocks !== undefined ? { unlocks } : {}),
    ...(resume !== undefined ? { resume } : {}),
  };
}
