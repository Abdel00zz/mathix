import { GlobalState, ChapterProgress } from "../types";
import { STORAGE_KEYS, TIMING, APP_CONFIG, DEFAULT_CHAPTER_PROGRESS } from "../utils/constants";

/**
 * Optimisations Majeures (v6.0) :
 * - Non-blocking I/O : Utilisation de requestIdleCallback pour éviter les micro-freezes
 * - Sérialisation différée : JSON.stringify exécuté hors du thread critique
 */

const STORAGE_KEY_LEGACY = STORAGE_KEYS.APP_STATE;
const STORAGE_KEY_CORE = STORAGE_KEYS.APP_STATE_CORE;
const STORAGE_KEY_QUIZ = STORAGE_KEYS.PROGRESS_QUIZ;
const STORAGE_KEY_EXERCISES = STORAGE_KEYS.PROGRESS_EXERCISES;
const STORAGE_KEY_REVISION = STORAGE_KEYS.PROGRESS_REVISION;
const DEBOUNCE_DELAY = TIMING.DEBOUNCE_PROGRESS;

const requestIdle: (cb: () => void, opts?: { timeout: number }) => number =
  typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? (cb, opts) => window.requestIdleCallback(cb, opts)
    : (cb) => window.setTimeout(cb, 1);

const cancelIdle = (id: number | null) => {
  if (id === null || typeof window === 'undefined') return;
  if (typeof window.cancelIdleCallback === 'function') {
    try { window.cancelIdleCallback(id); } catch { /* ignore */ }
  } else {
    window.clearTimeout(id);
  }
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let idleSaveId: number | null = null;
let storageGeneration = 0;
let pendingState: GlobalState | null = null;
let pendingFlags: SliceFlags = {};

const defaultState: GlobalState = {
  version: APP_CONFIG.VERSION,
  user: null,
  isSessionActive: true,
  progress: {},
  lastActive: Date.now()
};

type QuizSlice = Record<string, ChapterProgress['quiz']>;
type ExerciseSlice = Record<string, { exercises: ChapterProgress['exercises']; exerciseFeedback?: ChapterProgress['exerciseFeedback']; exerciseDurations?: ChapterProgress['exerciseDurations'] }>;
type RevisionSlice = Record<string, Pick<ChapterProgress, 'revisionProgress' | 'revisionProgressBySheet' | 'lastActiveAt' | 'lastActiveSection' | 'revealedBlanks' | 'masteredSkills' | 'completedSeances' | 'isChapterSubmitted' | 'submittedAt'>>;

type SliceFlags = {
  core?: boolean;
  quiz?: boolean;
  exercises?: boolean;
  revision?: boolean;
};

const cloneDefaultChapterProgress = (): ChapterProgress => {
  return {
    ...DEFAULT_CHAPTER_PROGRESS,
    quiz: { 
      ...DEFAULT_CHAPTER_PROGRESS.quiz,
      history: []
    },
    exercises: {},
    exerciseFeedback: {},
    exerciseDurations: {},
    revealedBlanks: [],
    masteredSkills: [],
    completedSeances: []
  };
};

const buildProgressSlices = (progress: Record<string, ChapterProgress>) => {
  const quiz: QuizSlice = {};
  const exercises: ExerciseSlice = {};
  const revision: RevisionSlice = {};

  Object.entries(progress || {}).forEach(([chapterId, chapter]) => {
    quiz[chapterId] = chapter.quiz;
    exercises[chapterId] = {
      exercises: chapter.exercises || {},
      exerciseFeedback: chapter.exerciseFeedback || {},
      exerciseDurations: chapter.exerciseDurations || {}
    };
    revision[chapterId] = {
      revisionProgress: chapter.revisionProgress || 0,
      revisionProgressBySheet: chapter.revisionProgressBySheet,
      lastActiveAt: chapter.lastActiveAt,
      lastActiveSection: chapter.lastActiveSection,
      revealedBlanks: chapter.revealedBlanks || [],
      masteredSkills: chapter.masteredSkills || [],
      completedSeances: chapter.completedSeances || [],
      isChapterSubmitted: chapter.isChapterSubmitted,
      submittedAt: chapter.submittedAt
    };
  });

  return { quiz, exercises, revision };
};

const mergeProgressSlices = (quiz: QuizSlice, exercises: ExerciseSlice, revision: RevisionSlice) => {
  const allIds = new Set<string>([
    ...Object.keys(quiz || {}),
    ...Object.keys(exercises || {}),
    ...Object.keys(revision || {})
  ]);

  const progress: Record<string, ChapterProgress> = {};
  allIds.forEach((chapterId) => {
    const base = cloneDefaultChapterProgress();
    if (quiz?.[chapterId]) base.quiz = quiz[chapterId];
    if (exercises?.[chapterId]) {
      base.exercises = exercises[chapterId].exercises || {};
      base.exerciseFeedback = exercises[chapterId].exerciseFeedback || {};
      base.exerciseDurations = exercises[chapterId].exerciseDurations || {};
    }
    if (revision?.[chapterId]) {
      base.revisionProgress = revision[chapterId].revisionProgress ?? 0;
      base.revisionProgressBySheet = revision[chapterId].revisionProgressBySheet;
      base.lastActiveAt = revision[chapterId].lastActiveAt;
      base.lastActiveSection = revision[chapterId].lastActiveSection;
      base.revealedBlanks = revision[chapterId].revealedBlanks || [];
      base.masteredSkills = revision[chapterId].masteredSkills || [];
      base.completedSeances = revision[chapterId].completedSeances || [];
      base.isChapterSubmitted = revision[chapterId].isChapterSubmitted;
      base.submittedAt = revision[chapterId].submittedAt;
    }
    progress[chapterId] = base;
  });

  return progress;
};

const writeCore = (state: GlobalState): void => {
  const core = {
    version: state.version,
    user: state.user,
    isSessionActive: state.isSessionActive,
    lastActive: state.lastActive
  };
  localStorage.setItem(STORAGE_KEY_CORE, JSON.stringify(core));
};

const writeSlices = (state: GlobalState, flags: SliceFlags): void => {
  const shouldWriteSlices = flags.quiz || flags.exercises || flags.revision;
  if (!shouldWriteSlices) return;

  const slices = buildProgressSlices(state.progress);
  if (flags.quiz) localStorage.setItem(STORAGE_KEY_QUIZ, JSON.stringify(slices.quiz));
  if (flags.exercises) localStorage.setItem(STORAGE_KEY_EXERCISES, JSON.stringify(slices.exercises));
  if (flags.revision) localStorage.setItem(STORAGE_KEY_REVISION, JSON.stringify(slices.revision));
};

const cancelPendingWrites = (): void => {
  storageGeneration += 1;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  cancelIdle(idleSaveId);
  idleSaveId = null;
  pendingState = null;
  pendingFlags = {};
};

const flushSave = (): void => {
  if (!pendingState) return;

  // Capture de l'état actuel et de la génération pour empêcher toute écriture
  // différée après un forceSave() ou un clear() (déconnexion / changement de compte).
  const capturedGen = storageGeneration;
  const stateToSave = { ...pendingState, lastActive: Date.now() };
  const flagsToSave = { ...pendingFlags };

  pendingFlags = {};
  pendingState = null;

  idleSaveId = requestIdle(() => {
    idleSaveId = null;
    if (capturedGen !== storageGeneration) return;
    try {
      if (flagsToSave.core) writeCore(stateToSave);
      writeSlices(stateToSave, flagsToSave);
    } catch (e) {
      console.error("[Storage] Failed to save state slices", e);
    }
  }, { timeout: 2000 });
};

const USER_SESSION_EXACT_KEYS = [
  'mathplus:student-name',
  'mathplus:phone',
  'mathplus:class-id',
  'mathplus:user-role',
  'mathplus:prof-profile',
  'mathplus:prof-session',
  'mathplus:cloud-last-sync',
  'mathplus:study-log:v1',
  'mathplus:study-log:last-total',
  'mathplus:study-sessions:v1',
  'mathplus_concours_progress',
  'mathplus:notifications',
  'mathplus:notif-onboarded',
  'mathplus:content-snapshot',
  'mathplus:progress-digest-snapshot',
];

const USER_SESSION_PREFIXES = [
  'mathplus:quiz-pending:',
  'mathplus:concours-pending:',
  'mathplus:exercise-session',
  'mathplus:quiz-session',
  'mathflow-dashboard-cache-',
  'mathplus_total_time_spent_',
  'mathplus_last_session_timestamp_',
];

const clearUserSessionCaches = (): void => {
  if (typeof localStorage !== 'undefined') {
    try {
      for (const key of USER_SESSION_EXACT_KEYS) localStorage.removeItem(key);
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && USER_SESSION_PREFIXES.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    } catch { /* stockage restreint */ }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem('mathplus:prof-sync-snoozed');
      sessionStorage.removeItem('mathplus:notif-generated-session');
      for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('chapter_cache_')) sessionStorage.removeItem(key);
      }
    } catch { /* stockage restreint */ }
  }
};

export const storageService = {
  loadState(): GlobalState {
    try {
      // --- RADICAL STATE INVALIDATION ---
      // Si la version de la configuration a changé, on purge l'état des quiz
      // pour éviter que les anciens chronomètres ne restent bloqués en mémoire.
      const storedVersion = localStorage.getItem('mathplus:config-version');
      if (storedVersion !== TIMING.CONFIG_VERSION) {
        console.warn('[Storage] Configuration version changed. Purging stale quiz state...');
        localStorage.removeItem(STORAGE_KEY_QUIZ);
        localStorage.setItem('mathplus:config-version', TIMING.CONFIG_VERSION);
      }

      const coreRaw = localStorage.getItem(STORAGE_KEY_CORE);
      if (coreRaw) {
        const core = JSON.parse(coreRaw);

        // Validation : le core doit être un objet avec au moins la structure attendue
        if (!core || typeof core !== 'object') {
          console.warn('[Storage] Corrupt core data — resetting');
          this.clear();
          return defaultState;
        }

        const parseSlice = <T>(key: string): T => {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return {} as T;
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {} as T;
          } catch {
            console.warn(`[Storage] Corrupt slice ${key} — using empty`);
            localStorage.removeItem(key);
            return {} as T;
          }
        };

        const quiz = parseSlice<QuizSlice>(STORAGE_KEY_QUIZ);
        const exercises = parseSlice<ExerciseSlice>(STORAGE_KEY_EXERCISES);
        const revision = parseSlice<RevisionSlice>(STORAGE_KEY_REVISION);

        const progress = mergeProgressSlices(quiz, exercises, revision);
        return { ...defaultState, ...core, progress };
      }

      // Legacy migration path
      const legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (!legacyRaw) return defaultState;

      const legacy = JSON.parse(legacyRaw);
      const migrated: GlobalState = {
        ...defaultState,
        user: legacy.user || null,
        progress: legacy.progress || {},
        isSessionActive: legacy.isSessionActive ?? true,
        lastActive: legacy.lastActive || Date.now()
      };

      this.forceSave(migrated);
      localStorage.removeItem(STORAGE_KEY_LEGACY);
      return migrated;
    } catch (e) {
      console.error("[Storage] Failed to load state", e);
      return defaultState;
    }
  },

  saveState(state: GlobalState): void {
    this.saveSlices(state, { core: true, quiz: true, exercises: true, revision: true });
  },

  saveSlices(state: GlobalState, flags: SliceFlags): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    pendingState = state;
    pendingFlags = { ...pendingFlags, ...flags };

    saveTimeout = setTimeout(() => {
      flushSave();
    }, DEBOUNCE_DELAY);
  },

  forceSave(state: GlobalState): void {
    cancelPendingWrites();
    try {
      const stateToSave = { ...state, lastActive: Date.now() };
      writeCore(stateToSave);
      writeSlices(stateToSave, { quiz: true, exercises: true, revision: true });
    } catch (e) {
      console.error("[Storage] Force save failed", e);
    }
  },

  clear(): void {
    cancelPendingWrites();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_CORE);
        localStorage.removeItem(STORAGE_KEY_QUIZ);
        localStorage.removeItem(STORAGE_KEY_EXERCISES);
        localStorage.removeItem(STORAGE_KEY_REVISION);
        localStorage.removeItem(STORAGE_KEY_LEGACY);
      }
    } catch { /* stockage restreint */ }
    clearUserSessionCaches();
  },

  getDefaultChapterProgress() {
    return cloneDefaultChapterProgress();
  }
};
