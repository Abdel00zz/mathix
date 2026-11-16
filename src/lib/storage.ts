import type { ClassId, LastVisited, StudentProfile, StudentState } from './types';

export const KEY_PROFILE = 'ap-p';
export const KEY_STATE = 'ap';
export const KEY_RESET_AT = 'ap-reset-at';
export const KEY_ACCOUNT_OWNER = 'ap-owner';
export const KEY_OLD_PROFILE = 'mathflow_student_settings_v2';
export const KEY_OLD_STATE = 'mathflow_student_state_v2';
export const CLASS_COOKIE = 'mf-cls';
export const STORAGE_SCHEMA_VERSION = 2;

const RESUME_KEY = 'ap-resume';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const CLASS_META_LIST: Array<{ id: ClassId; title: string; shortName: string }> = [
  { id: 'tronc-commun-sc', title: 'Tronc Commun Scientifique', shortName: 'Tronc Commun' },
  { id: '1ere-bac-sc-ex', title: '1ère Bac Sciences Expérimentales', shortName: '1Bac Sc. Ex' },
  { id: '1ere-bac-sc-math', title: '1ère Bac Sciences Mathématiques', shortName: '1Bac Sc. Math' },
  { id: '2eme-bac-sc-ex', title: '2ème Bac Sciences Expérimentales', shortName: '2Bac Sc. Ex' },
  { id: '2eme-bac-sc-math', title: '2ème Bac Sciences Mathématiques', shortName: '2Bac Sc. Math' },
];

export const CLASS_LABELS: Record<ClassId, string> = {
  'tronc-commun-sc': 'Tronc Commun Scientifique',
  '1ere-bac-sc-ex': '1ère Bac Sciences Expérimentales',
  '1ere-bac-sc-math': '1ère Bac Sciences Mathématiques',
  '2eme-bac-sc-ex': '2ème Bac Sciences Expérimentales',
  '2eme-bac-sc-math': '2ème Bac Sciences Mathématiques',
};

const VALID_CLS = new Set<string>(Object.keys(CLASS_LABELS));

export const DEFAULT_PROFILE: StudentProfile = {
  th: 'auto',
  cls: '2eme-bac-sc-ex',
  fn: '',
  ln: '',
  sc: '',
  docFont: 'literata',
  docScale: 1,
  tiersTemps: false,
  soundEnabled: false,
  lexiconAutoHighlight: true,
  reduceMotion: false,
  quizTimePerQuestion: 120,
};

export const DEFAULT_STATE: StudentState = {
  q: {},
  e: {},
  l: {},
  lastVisited: null,
};

let quotaEvictor: (() => boolean) | null = null;

/** Enregistre un callback d'éviction LRU (ex. `ap-resume`) invoqué automatiquement sur `QuotaExceededError`. */
export function registerQuotaEvictor(fn: (() => boolean) | null): void {
  quotaEvictor = fn;
}

function defaultEvictResumeStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, Record<string, { updatedAt?: number }>> | null;
    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(RESUME_KEY);
      return true;
    }
    let trimmed = false;
    for (const bucket of ['quizzes', 'exercises', 'lessons', 'lessonActiveSheet', 'chapterActiveQuiz']) {
      const rec = parsed[bucket];
      if (!rec || typeof rec !== 'object') continue;
      const entries = Object.entries(rec);
      if (entries.length > 10) {
        entries.sort((a, b) => (Number(b[1]?.updatedAt) || 0) - (Number(a[1]?.updatedAt) || 0));
        parsed[bucket] = Object.fromEntries(entries.slice(0, 10));
        trimmed = true;
      }
    }
    if (trimmed) {
      window.localStorage.setItem(RESUME_KEY, JSON.stringify(parsed));
      return true;
    }
    window.localStorage.removeItem(RESUME_KEY);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(RESUME_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

/** Écriture sécurisée `localStorage` avec éviction LRU d'urgence si quota dépassé. */
export function safeSetStorageItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    const evicted = key !== RESUME_KEY && ((quotaEvictor && quotaEvictor()) || defaultEvictResumeStorage());
    if (evicted) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function sanitizeSafeRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || FORBIDDEN_KEYS.has(k)) continue;
    out[k] = v as T;
  }
  return out;
}

function isSafeRelativeOrHash(url: unknown): string {
  const v = String(url ?? '').trim();
  if (!v || /^[\s\x00-\x1f]*(javascript|vbscript|data):/i.test(v)) return '';
  if (v.startsWith('#') || v.startsWith('/')) return v;
  return '';
}

function hashToNextHref(hashOrUrl: string): string {
  const s = hashOrUrl.trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  if (!s.startsWith('#')) return '';
  const body = s.slice(1);
  if (body.startsWith('lecon-')) {
    const [head, qs] = body.split(/[&?]/);
    const ch = head.slice(6);
    const sp = qs ? new URLSearchParams(qs) : null;
    const sheet = sp?.get('sheet');
    return `/lecon/${ch}${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`;
  }
  if (body.startsWith('quiz-')) {
    const [head, qs] = body.split(/[&?]/);
    const ch = head.slice(5);
    const sp = qs ? new URLSearchParams(qs) : null;
    const quiz = sp?.get('quiz');
    return `/quiz/${ch}${quiz ? `?quiz=${encodeURIComponent(quiz)}` : ''}`;
  }
  if (body.startsWith('exo-')) {
    const [head] = body.split(/[&?]/);
    return `/exercices/${head.slice(4)}`;
  }
  if (body.startsWith('examen-')) {
    const [head] = body.split(/[&?]/);
    return `/examen/${head.slice(7)}`;
  }
  if (body.startsWith('probleme-')) {
    const [head] = body.split(/[&?]/);
    return `/probleme/${head.slice(9)}`;
  }
  if (body.startsWith('concours-')) {
    const [head, qs] = body.split(/[&?]/);
    const sc = head.slice(9);
    const sp = qs ? new URLSearchParams(qs) : null;
    const q = sp?.get('quiz');
    const a = sp?.get('annale');
    return `/concours/${sc}${q ? `?quiz=${encodeURIComponent(q)}` : a ? `?annale=${encodeURIComponent(a)}` : ''}`;
  }
  return '';
}

export function normalizeLastVisited(raw: unknown): LastVisited | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const lv = raw as Record<string, unknown>;
  const safeHref = isSafeRelativeOrHash(lv.href) || isSafeRelativeOrHash(lv.url);
  const safeHash = isSafeRelativeOrHash(lv.hash);
  const resolvedHref =
    (safeHref.startsWith('/') ? safeHref : hashToNextHref(safeHref || safeHash)) || safeHref || safeHash;
  if (!resolvedHref && !lv.chapterId) return null;

  const rawKind = String(lv.kind || lv.type || 'lesson').toLowerCase();
  const kind: LastVisited['kind'] =
    rawKind === 'quiz'
      ? 'quiz'
      : rawKind === 'exo' || rawKind === 'exercise' || rawKind === 'exercices'
        ? 'exo'
        : rawKind === 'probleme' || rawKind === 'problem'
          ? 'probleme'
          : rawKind === 'national' || rawKind === 'examen'
            ? 'national'
            : rawKind === 'concours'
              ? 'concours'
              : 'lesson';

  const clsRaw = typeof lv.classId === 'string' && VALID_CLS.has(lv.classId) ? (lv.classId as ClassId) : null;
  const chapterId = typeof lv.chapterId === 'string' && lv.chapterId.trim() ? lv.chapterId.trim().slice(0, 100) : null;
  const title = String(lv.title || lv.chapterTitle || '').trim().slice(0, 180);
  const at = typeof lv.at === 'number' && Number.isFinite(lv.at) && lv.at > 0 ? Math.round(lv.at) : undefined;

  return {
    href: resolvedHref || (chapterId ? `/lecon/${encodeURIComponent(chapterId)}` : '/'),
    ...(safeHash ? { hash: safeHash } : {}),
    title,
    kind,
    ...(clsRaw ? { classId: clsRaw } : {}),
    chapterId,
    ...(at !== undefined ? { at } : {}),
  };
}

export function normalizeProfile(raw?: Partial<StudentProfile> | null): StudentProfile {
  const p = { ...DEFAULT_PROFILE, ...(raw || {}) };
  p.th = p.th === 'light' || p.th === 'dark' ? p.th : 'auto';
  p.cls = (VALID_CLS.has(String(p.cls)) ? p.cls : DEFAULT_PROFILE.cls) as ClassId;
  p.fn = String(p.fn ?? '').slice(0, 60);
  p.ln = String(p.ln ?? '').slice(0, 60);
  p.sc = String(p.sc ?? '').slice(0, 100);
  p.docScale = Math.min(1.4, Math.max(0.85, Number(p.docScale) || 1));
  p.docFont = p.docFont === 'serif' || p.docFont === 'sans' ? p.docFont : 'literata';
  p.tiersTemps = Boolean(p.tiersTemps);
  p.soundEnabled = Boolean(p.soundEnabled);
  p.lexiconAutoHighlight = p.lexiconAutoHighlight !== false;
  p.reduceMotion = Boolean(p.reduceMotion);
  p.quizTimePerQuestion = Math.max(15, Math.min(600, Number(p.quizTimePerQuestion) || 120));
  if (typeof p.profileUpdatedAt === 'number' && Number.isFinite(p.profileUpdatedAt) && p.profileUpdatedAt > 0) {
    p.profileUpdatedAt = Math.round(p.profileUpdatedAt);
  } else {
    delete p.profileUpdatedAt;
  }
  return p;
}

export function normalizeState(raw?: Partial<StudentState> | null): StudentState {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    q: sanitizeSafeRecord<StudentState['q'][string]>(src.q),
    e: sanitizeSafeRecord<StudentState['e'][string]>(src.e),
    l: sanitizeSafeRecord<StudentState['l'][string]>(src.l),
    lastVisited: normalizeLastVisited(src.lastVisited),
  };
}

function tryReadJson(key: string): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function readProfileFromStorage(): StudentProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  const direct = tryReadJson(KEY_PROFILE);
  if (direct) return normalizeProfile(direct as Partial<StudentProfile>);

  const oldSet = tryReadJson(KEY_OLD_PROFILE);
  const oldSt = tryReadJson(KEY_OLD_STATE);
  if (oldSet || oldSt) {
    const rt = (oldSet?.readingTheme as Record<string, unknown> | undefined) || {};
    const sp = (oldSt?.studentProfile as Record<string, unknown> | undefined) || {};
    const parts = String(sp.name || '').trim().split(/\s+/).filter(Boolean);
    const migrated = normalizeProfile({
      cls: ((oldSt?.selectedClassId as ClassId | undefined) ||
        (/math/i.test(String(sp.level || '')) ? '2eme-bac-sc-math' : '2eme-bac-sc-ex')) as ClassId,
      fn: parts[0] || '',
      ln: parts.slice(1).join(' '),
      sc: String(sp.school || ''),
      docFont: rt.docFont === 'sans' ? 'sans' : 'literata',
      docScale: Number(rt.docScale) || 1,
      tiersTemps: Boolean(oldSet?.tiersTemps),
      soundEnabled: Boolean(oldSet?.soundEnabled),
      lexiconAutoHighlight: !oldSet || oldSet.lexiconAutoHighlight !== false,
      reduceMotion: Boolean(oldSet?.reduceMotion),
      quizTimePerQuestion: Number(oldSet?.quizTimePerQuestion) || 120,
    });
    safeSetStorageItem(KEY_PROFILE, JSON.stringify(migrated));
    return migrated;
  }
  return DEFAULT_PROFILE;
}

export function writeProfileToStorage(profile: StudentProfile): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeProfile(profile);
  safeSetStorageItem(KEY_PROFILE, JSON.stringify(normalized));
  try {
    document.cookie = `${CLASS_COOKIE}=${encodeURIComponent(normalized.cls)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

export function readStateFromStorage(): StudentState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  const direct = tryReadJson(KEY_STATE);
  if (direct) return normalizeState(direct as Partial<StudentState>);

  const oldSt = tryReadJson(KEY_OLD_STATE);
  if (oldSt) {
    const migrated = normalizeState({
      q: oldSt.q as StudentState['q'],
      e: oldSt.e as StudentState['e'],
      l: oldSt.l as StudentState['l'],
      lastVisited: oldSt.lastVisited as LastVisited | null,
    });
    safeSetStorageItem(KEY_STATE, JSON.stringify(migrated));
    return migrated;
  }
  return DEFAULT_STATE;
}

export function writeStateToStorage(state: StudentState): void {
  if (typeof window === 'undefined') return;
  safeSetStorageItem(KEY_STATE, JSON.stringify(normalizeState(state)));
}

export function readResetAtFromStorage(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number(window.localStorage.getItem(KEY_RESET_AT) || '0');
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  } catch {
    return 0;
  }
}

export function writeResetAtToStorage(ts: number): void {
  if (typeof window === 'undefined') return;
  const clean = Number.isFinite(ts) && ts > 0 ? Math.round(ts) : 0;
  if (clean > 0) {
    safeSetStorageItem(KEY_RESET_AT, String(clean));
  } else {
    try {
      window.localStorage.removeItem(KEY_RESET_AT);
    } catch {}
  }
}

export function readAccountOwnerFromStorage(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(KEY_ACCOUNT_OWNER) || '').trim();
  } catch {
    return '';
  }
}

export function writeAccountOwnerToStorage(accountId: string): void {
  if (typeof window === 'undefined') return;
  const clean = String(accountId || '').trim();
  if (clean) {
    safeSetStorageItem(KEY_ACCOUNT_OWNER, clean);
  } else {
    try {
      window.localStorage.removeItem(KEY_ACCOUNT_OWNER);
    } catch {}
  }
}

export function applyProfileToDom(p: StudentProfile): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (p.th === 'light' || p.th === 'dark') root.dataset.theme = p.th;
  else delete root.dataset.theme;
  const scaleStr = String(p.docScale || 1);
  root.style.setProperty('--doc-scale', scaleStr);
  root.style.setProperty('--mf-doc-scale', scaleStr);
  root.setAttribute('data-doc-font', p.docFont || 'literata');
  root.setAttribute('data-reduce-motion', p.reduceMotion ? 'true' : 'false');
}

export function formatTime(sec: number): string {
  const n = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

let audioCtx: AudioContext | null = null;
export function playTone(kind: 'ok' | 'bad' | 'tick', enabled: boolean): void {
  if (!enabled || typeof window === 'undefined') return;
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    const cfg: [OscillatorType, number, number, number, number] =
      kind === 'ok' ? ['sine', 523.25, 659.25, 0.08, 0.25]
        : kind === 'bad' ? ['triangle', 240, 190, 0.08, 0.26]
        : ['sine', 620, 620, 0.035, 0.055];
    osc.type = cfg[0];
    osc.frequency.setValueAtTime(cfg[1], t);
    if (cfg[2] !== cfg[1]) osc.frequency.setValueAtTime(cfg[2], t + 0.09);
    g.gain.setValueAtTime(cfg[3], t);
    g.gain.exponentialRampToValueAtTime(0.001, t + cfg[4]);
    osc.start(t);
    osc.stop(t + cfg[4] + 0.01);
  } catch {}
}
