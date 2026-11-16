
// ============================================================================
// CONSTANTES PARTAGÉES - MathFlow v6.0
// ============================================================================

import type { AppSettings, ReadingTheme, RevisionNumberingKey } from '../types';

// --- STORAGE KEYS (Centralized) ---
export const STORAGE_KEYS = {
  // Application State
  APP_STATE: 'planet-math:app:v6.0',
  APP_STATE_CORE: 'planet-math:app-core:v6.0',
  PROGRESS_QUIZ: 'planet-math:progress-quiz:v6.0',
  PROGRESS_EXERCISES: 'planet-math:progress-exercises:v6.0',
  PROGRESS_REVISION: 'planet-math:progress-revision:v6.0',
  CONTENT_VERSION: 'planet-math:content-version',
  NAV_STATE: 'planet-math:nav-state',
  
  // Notifications & Updates
  UPDATE_HISTORY: 'mathflow-update-history',
  NOTIFICATIONS: 'mathplus:notifications',
  
  // Progression
  EXERCISE_PROGRESS: 'mathflow-progress-v2',
  DASHBOARD_CACHE: 'mathflow-dashboard-cache',
  
  // Sessions
  EXERCISE_SESSION: 'mathplus:exercise-session',
  QUIZ_SESSION: 'mathplus:quiz-session',
} as const;

// --- TIMING CONSTANTS ---
export const TIMING = {
  // Save/Persist
  DEBOUNCE_SAVE: 500,              // ms before saving to localStorage
  DEBOUNCE_PROGRESS: 800,          // ms before persisting progress
  AUTO_SAVE_INTERVAL: 5_000,       // 5 seconds
  
  // Animations
  ANIMATION_SHORT: 300,            // ms for quick transitions
  ANIMATION_MEDIUM: 500,           // ms for standard transitions
  ANIMATION_LONG: 700,             // ms for elaborate animations
  TRANSITION_DELAY: 500,           // 500ms
  
  // Updates & Checks
  UPDATE_CHECK_INTERVAL: 30_000,   // 30 seconds
  VISIBILITY_CHECK_DELAY: 2_000,   // 2 seconds
  TOAST_DURATION: 3_000,           // 3 seconds
  
  // Quiz
  QUIZ_DEFAULT_TIME: 45,           // seconds per quiz question
  
  // --- ADVANCED OVERRIDES (Radical Fix) ---
  FORCE_GLOBAL_QUIZ_TIME: true,    // Si true, ignore les temps définis dans les JSON
  CONFIG_VERSION: 'v1.0.1',        // Changez ceci pour forcer l'effacement du cache LocalStorage
} as const;

// --- UI DEFAULTS ---
export const UI_DEFAULTS = {
  EXERCISE_MASTERY_THRESHOLDS: {
    LOW: 0.3,     // Below 30% = low mastery
    MEDIUM: 0.7,  // 30-70% = medium mastery
    HIGH: 1.0,    // Above 70% = high mastery
  },
  EXERCISE_UNLOCK_THRESHOLD: 15, // % quiz progress required to unlock exercises early
  MAX_VISIBLE_CHAPTERS: 10,
  SCROLL_OFFSET: 150,
} as const;

export const DEFAULT_REVISION_BLOCK_VISIBILITY = {
  method: true,
  example: true,
  exploration: true,
  proof: true,
  remark: true,
  note: true,
  intuition: true,
  summary: true,
} as const;

export const DEFAULT_REVISION_BLOCK_NUMBERING: Record<RevisionNumberingKey, boolean> = {
  definition: true,
  property: true,
  theorem: true,
  proposition: true,
  method: true,
  application: true,
  example: true,
  remark: true,
  warning: true,
  hint: true,
  technique: true,
  exploration: true,
};

// --- NOTIFICATIONS & PLANNING ---

export const DEFAULT_NOTIFICATION_PREFS = {
  enabled: true,
  native: false,
  digestHours: 24,
  categories: {
    digest: true,
    revision: true,
    content: true,
    messages: true,
  },
  // Par défaut on ne réveille personne la nuit : les notifications émises
  // pendant la plage silencieuse restent dans la boîte de réception.
  quietHours: { enabled: true, from: '21:30', to: '07:00' },
} as const;

/** Lundi → vendredi 18h00 (1h), samedi 10h00 (1h30), dimanche au repos. */
export const DEFAULT_STUDY_PLAN = {
  enabled: false,
  slots: [
    { day: 0, enabled: false, start: '10:00', durationMin: 60 },
    { day: 1, enabled: true, start: '18:00', durationMin: 60 },
    { day: 2, enabled: true, start: '18:00', durationMin: 60 },
    { day: 3, enabled: true, start: '18:00', durationMin: 60 },
    { day: 4, enabled: true, start: '18:00', durationMin: 60 },
    { day: 5, enabled: true, start: '18:00', durationMin: 60 },
    { day: 6, enabled: true, start: '10:00', durationMin: 90 },
  ],
  weeklyGoalMin: 300,
} as const;

export const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'] as const;

// --- APPAREIL DE LECTURE ---

/** Papier, police et échelle de lecture des documents (révision, quiz, exercices). */
export const DEFAULT_READING_THEME: ReadingTheme = {
  paper: 'ivoire',
  docFont: 'serif',
  docScale: 1,
};

// --- RÉGLAGES PAR DÉFAUT ---

/**
 * Source unique des réglages par défaut : `useAppSettings` (état vivant) et la
 * modale de réglages (bouton « réinitialiser ») partent d'ici.
 *
 * C'est une fabrique et non une constante parce que les sous-objets sont
 * mutables côté formulaire : chaque appelant doit repartir de copies fraîches.
 *
 * `studyPlan` est volontairement absent : il est complété à la lecture par
 * `normalizePlan`, et ce fichier ne peut pas importer `studyPlanService` —
 * lequel dépend déjà de `DEFAULT_STUDY_PLAN` défini ici.
 */
export const createDefaultAppSettings = (): AppSettings => ({
  fontSize: 'base',
  soundEnabled: true,
  reduceMotion: false,
  quizTimePerQuestion: 45,
  tiersTemps: false,
  revisionBlockVisibility: { ...DEFAULT_REVISION_BLOCK_VISIBILITY },
  revisionBlockNumbering: { ...DEFAULT_REVISION_BLOCK_NUMBERING },
  notificationPrefs: {
    ...DEFAULT_NOTIFICATION_PREFS,
    categories: { ...DEFAULT_NOTIFICATION_PREFS.categories },
    quietHours: { ...DEFAULT_NOTIFICATION_PREFS.quietHours },
  },
  readingTheme: { ...DEFAULT_READING_THEME },
});

// --- APP CONFIG ---
export const APP_CONFIG = {
  VERSION: '6.1.0',
  XP_PER_CORRECT_ANSWER: 10,
  XP_PER_CHAPTER_COMPLETE: 100,
} as const;

// --- QUIZ TYPE ALIASES (for backwards compatibility with JSON) ---
export const QUIZ_TYPE_ALIASES: Record<string, string> = {
  'true-false': 'boolean',
  'ordering': 'order',
  'error-spotting': 'error',
} as const;

// --- DEFAULT VALUES ---
const DEFAULT_QUIZ_STATE = {
  isSubmitted: false,
  score: 0,
  highScore: 0,
  attempts: 0,
  history: [],
  currentQuestionIndex: 0,
  totalQuestions: 0,
  answersSnapshot: {},
  durationSeconds: 0
} as const;

// Single Source of Truth for Chapter Progress
export const DEFAULT_CHAPTER_PROGRESS = {
  revisionProgress: 0,
  lastActiveAt: undefined,
  lastActiveSection: undefined,
  revealedBlanks: [],
  masteredSkills: [],
  quiz: { ...DEFAULT_QUIZ_STATE },
  exercises: {},
  exerciseFeedback: {},
  exerciseDurations: {},
  isChapterSubmitted: false,
  submittedAt: undefined
} as const;
