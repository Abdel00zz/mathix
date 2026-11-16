// types.ts

/**
 * Global type definitions for MathPlus application
 */

export type AppView = 'login' | 'dashboard' | 'session' | 'quiz' | 'revision' | 'concours-quiz' | 'examen-session' | 'ds-session' | 'probleme-view' | 'cadre-referentiel' | 'studio' | 'admin';
export type ProfessorClassScope = 'all' | 'selected' | 'none';

export interface UserProfile {
  /** Identité canonique du compte côté serveur (ne change jamais). */
  accountId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  classId: string;
  className: string;
  /** Identifiant unique généré pour l'isolation des données utilisateur */
  uniqueId?: string;
  /** Mode de l'utilisateur: scolaire (default) ou concours */
  mode?: 'scolaire' | 'concours';
  birthdate?: string;   // ISO date "2005-09-15"
  schoolName?: string;  // Nom de l'établissement
  concoursEnrolled?: boolean;
  /** Thème de couleurs du dashboard choisi côté PC et synchronisé avec le compte. */
  dashboardTheme?: string;
  /** Page personnalisée du professeur (bannière + chapitres mis en avant). */
  profPage?: {
    bannerMessage?: string;
    highlightedChapterIds?: string[];
    /** Modèles de notification personnalisés par le prof (envoyés aux élèves). */
    notifyTemplates?: Array<{ key: string; title: string; body: string }>;
  };
  /** Préférences de session synchronisées avec le compte (révision/quiz/exercice). */
  profPrefs?: {
    /** Taille de texte du dashboard tablette (mode prof). */
    textScale?: number;
    revision?: { textScale?: number; showSolutions?: boolean; paperTheme?: string; progressiveReveal?: boolean; showBlockTitles?: boolean };
    quiz?: { showCorrections?: boolean; shuffleQuestions?: boolean };
    /** `showCanvas` n'est plus écrit (migré vers `canvas.enabled`) mais reste lu pour la migration. */
    exercise?: { answerSpaceStyle?: string; answerSpaceColor?: string; showCanvas?: boolean; oneQuestionPerPage?: boolean };
    /** Fonctionnalités du canvas manuscrit en mode professeur tablette. */
    canvas?: { enabled?: boolean; showTriggers?: boolean; showBlanks?: boolean; showToolbar?: boolean };
  };
  /** Autorisation fonctionnelle attribuée uniquement depuis l'administration. */
  role?: 'student' | 'prof';
  /** Le compte possède-t-il déjà un mot de passe (false → migration à définir). */
  passwordSet?: boolean;
  /** Rôle demandé à l'inscription (enseignant en attente de validation admin). */
  requestedRole?: 'student' | 'prof';
  /** Portée canonique ; absente uniquement sur les anciens comptes (vide legacy = tous). */
  profClassScope?: ProfessorClassScope;
  /** Classes utilisées uniquement lorsque `profClassScope` vaut `selected`. */
  profClasses?: string[] | null;
  /** @deprecated La session professeur est désormais conservée en cookie HttpOnly. */
}

export type MasteryLevel = 'high' | 'medium' | 'low' | 'skipped' | null;

export type MediaPosition =
  | 'left' | 'right' | 'top' | 'bottom' | 'inline'
  | 'inline-right'
  | 'float-left' | 'float-right';

export type MediaAnchor = 'lead' | 'content' | 'item';

export interface MediaImage {
  src: string;
  alt?: string;
  caption?: string;
  width?: string | number;
  height?: string | number;
  position?: MediaPosition;
  /**
   * Zone du bloc à laquelle la figure appartient :
   *  - `lead`    : l'énoncé / le titre, toujours visible ;
   *  - `content` : le contenu — donc la correction d'un exercice d'application,
   *                ou le contenu à découvrir d'une propriété / d'un théorème ;
   *  - `item`    : une **question précise d'une liste** (`targetItem`), pour
   *                poser la figure au milieu de la liste plutôt qu'à côté.
   * Absent, la zone est déduite pour conserver le comportement des fiches
   * déjà publiées (`effectiveAnchor`).
   */
  anchor?: MediaAnchor;
  /**
   * Question visée (1-based) quand `anchor: 'item'`. Avec `position: 'top'`, la
   * figure se pose **au-dessus** de cette question ; avec `'bottom'`, en dessous.
   */
  targetItem?: number;
  lazy?: boolean;
  zoomable?: boolean;
  className?: string;
  /**
   * Dimensions du binaire publié, renseignées à l'import par le studio. Elles
   * permettent de réserver la place de la figure avant son chargement (plus de
   * saut de mise en page). Absentes des figures plus anciennes : le rapport est
   * alors appris au chargement, comme avant.
   */
  naturalWidth?: number;
  naturalHeight?: number;
  style?: {
    border?: boolean;
    shadow?: boolean;
    rounded?: boolean;
  };
  captionStyle?: {
    align?: 'left' | 'center' | 'right';
    size?: 'xs' | 'sm' | 'md';
    italic?: boolean;
  };
}

/** Le premier média reste compatible avec les documents existants. */
export interface MediaConfig extends MediaImage {
  additionalImages?: MediaImage[];
}

export interface SubQuestion {
  id: string;
  content: string;
  hint?: string;
  correction?: string;
  bareme?: number;
  subQuestions?: SubQuestion[];
  media?: MediaConfig;
  // FIX: Add properties to support progress tracking. This fixes errors in:
  // - components/Views/ExerciseSessionView.tsx line 101
  // - hooks/useExerciseData.ts line 189
  // - hooks/useExerciseData.ts line 235
  isCompleted?: boolean;
  mastery?: MasteryLevel | null;
  lastHintIndex?: number;
}

export interface Question {
  id: string;
  type?: string;
  content: string;
  media?: MediaConfig;
  subQuestions?: SubQuestion[];
}

export interface Exercise {
  id: string;
  chapterId: string;
  classId?: string;
  topic?: string;
  context?: string;
  questions: Question[];
  media?: MediaConfig;
  sessionDate?: string;
  requiresRedaction?: boolean;
  /** Source examen year (set when exercise comes from an examen) */
  examenYear?: number;
  /** Source examen session: 'Normale' | 'Rattrapage' (set when exercise comes from an examen) */
  examenSession?: string;
}

interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export type QuizQuestionType = 'mcq' | 'boolean' | 'order' | 'error' | 'input';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  explanation?: string;
  section?: string;
  category?: string;
  timeLimit?: number;
  difficulty?: string;
  /** Image affichée sous (au centre de) l'énoncé de la question. */
  image?: string;
  media?: MediaConfig;
  options?: QuizOption[];
  isTrue?: boolean;
  items?: Array<{ id: string; content: string }>;
  correctOrder?: string[];
  steps?: Array<{ id: string; text: string; isError: boolean; correction?: string }>;
  correctAnswers?: string[];
  placeholder?: string;
  /* Fixed: Add context property to interface */
  context?: string;
  /** Grouped questions: shared group identifier */
  groupId?: string;
  /** Grouped questions: shared prompt displayed above the per-question prompt */
  groupPrompt?: string;
}

export interface QuizResult {
  questionId: string;
  isCorrect: boolean;
  userAnswer: any;
  timeSpent?: number;
}

export interface ChapterProgress {
  revisionProgress: number;
  /**
   * Progression de la leçon, fiche par fiche, quand un chapitre en déclare
   * plusieurs. La clé est la clé de fiche (`revisionSheetKey`). La première
   * fiche continue d'alimenter `revisionProgress` pour rester compatible avec
   * les données déjà enregistrées.
   */
  revisionProgressBySheet?: Record<string, number>;
  /** Dernière activité réelle sur ce chapitre, utilisée pour choisir la carte active. */
  lastActiveAt?: number;
  lastActiveSection?: string;
  revealedBlanks?: string[];
  /** Compétences cochées dans le cadre référentiel. */
  masteredSkills?: string[];
  /** Séances d'apprentissage autonome explicitement validées par l'élève. */
  completedSeances?: number[];
  quiz: {
    isSubmitted: boolean;
    score: number;
    highScore: number;
    attempts: number;
    history?: QuizResult[];
    currentQuestionIndex?: number;
    totalQuestions?: number;
    answersSnapshot?: Record<string, any>;
    durationSeconds?: number;
  };
  exercises: Record<string, {
    isCompleted: boolean;
    mastery: MasteryLevel;
    lastHintIndex?: number;
  }>;
  exerciseFeedback?: Record<string, MasteryLevel>;
  /** Durée consacrée par exercice (en minutes, null = indéterminé) */
  exerciseDurations?: Record<string, number | null>;
  isChapterSubmitted?: boolean;
  submittedAt?: number;
}

export interface GlobalState {
  version: string;
  user: UserProfile | null;
  isSessionActive: boolean;
  progress: Record<string, ChapterProgress>;
  lastActive: number;
}

type DisciplineSection = 'analyse' | 'algebre-geometrie';

export interface ChapterInfo {
  id: string;
  title: string;
  /** Classe (niveau) à laquelle ce chapitre appartient — annotée au chargement
      pour que les vues de session chargent les exercices/quiz de la BONNE classe
      (celle de la séance, pas celle du compte). */
  classId?: string;
  section?: DisciplineSection;
  quizCount?: number;
  /**
   * Fiches de cours du chapitre. Un chapitre peut en déclarer plusieurs :
   * la carte chapitre expose alors une étape « Leçon » par fiche, dans
   * l'ordre du tableau. Le `title` alimente le libellé de l'étape.
   */
  revisions?: Array<{ path: string; title?: string }>;
  exercises?: Array<{ path: string }>;
  quizzes?: Array<{ id: string; path: string }>;
  nextSessionDate?: string;
  manifestPath?: string;
  start_date?: string;
  end_date?: string;
  originalIndex?: number;
  /** Épingle le chapitre en tête (ex. « Mise à niveau ») : toujours premier,
      insensible au réordonnancement des autres chapitres. */
  pinned?: boolean;
}

export interface ClassData {
  id: string;
  title: string;
  chapters: ChapterInfo[];
}

export interface RootManifest {
  classes: Array<{
    id: string;
    title: string;
    path: string;
  }>;
  meta?: {
    version: string;
  };
}

type RevisionCategory = 'course' | 'method' | 'domain' | 'subdomain';

/**
 * Types de blocs reconnus par une fiche de révision.
 *
 * Liste **exécutable** (et donc testable) : `RevisionBlockType` en est dérivé.
 * Elle remplace l'ancienne union écrite à la main, qui avait divergé du moteur
 * de rendu — on y trouvait `method_principle`, `method_steps` et
 * `method_example`, jamais utilisés dans les données et sans style associé, donc
 * rendus comme du texte libre.
 *
 * Ajouter un type ici ne suffit pas : il faut aussi son rendu dans `CourseBlock`
 * et son entrée dans `ENV_LABELS` / `ENV_STYLES`, sinon le bloc perd badge et
 * mise en page. Le test `revisionBlockTypes.test.ts` verrouille cet invariant.
 */
export const REVISION_BLOCK_TYPES = [
  'text',
  'intro',
  'definition', 'theorem', 'proposition', 'property', 'lemma', 'corollary', 'consequence',
  'technique', 'rappel', 'method', 'strategy',
  'application', 'example', 'exploration',
  'remark', 'note', 'warning', 'intuition', 'summary',
  'proof',
  'problem', 'hint', 'solution', // Énoncé encadré, indice et solution repliables
  'cela_permet_de',              // Compétences d'usage : « Cela permet de : »
] as const;

export type RevisionBlockType = (typeof REVISION_BLOCK_TYPES)[number];

export interface RevisionBlock {
  uid?: string; // Identifiant unique pour le cross-referencing
  type: RevisionBlockType;
  title?: string;
  content: string | string[];
  /** Niveau de difficulte sur 5, utilise par les exercices d'application. */
  difficulty?: number;
  media?: MediaConfig;
  dependsOn?: string[]; // Liste d'UIDs dont ce bloc dépend
}

export interface RevisionSection {
  id: string;
  uid?: string;
  title: string;
  category?: RevisionCategory;
  content?: string;
  blocks?: RevisionBlock[];
  tags?: string[];
  /** Numéro de séance d'apprentissage autonome (1, 2, 3…) — découpe visuelle du contenu pour le planifier. */
  seance?: number;
}

export interface RevisionLexiconEntry {
  term: string;
  arabic: string;
  definition: string;
  category?: 'concept' | 'consigne' | 'connecteur' | string;
  symbol?: string;
  variants?: string[];
}

export interface RevisionSheet {
  header: {
    title: string;
    subtitle: string;
    context: string;
  };
  lexique?: RevisionLexiconEntry[];
  sections: RevisionSection[];
  knowledgeGraph?: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ from: string; to: string; label?: string }>;
  };
}

type RevisionVisibilityKey =
  | 'method'
  | 'example'
  | 'exploration'
  | 'proof'
  | 'remark'
  | 'note'
  | 'intuition'
  | 'summary';

export type RevisionBlockVisibilitySettings = Partial<Record<RevisionVisibilityKey, boolean>>;

export type RevisionNumberingKey =
  | 'definition'
  | 'property'
  | 'theorem'
  | 'proposition'
  | 'method'
  | 'application'
  | 'example'
  | 'remark'
  | 'warning'
  | 'hint'
  | 'technique'
  | 'exploration';

export type RevisionNumberingSettings = Partial<Record<RevisionNumberingKey, boolean>>;

type _SessionStatus = 'LIVE' | 'UPCOMING' | 'ENDED' | null;

/** Cadence du bilan de progression, en heures. */
export type DigestFrequency = 12 | 24 | 72;

export type NotificationCategory =
  | 'digest'     // Bilan de progression multi-axes
  | 'revision'   // Rappels de révision (courbe de l'oubli)
  | 'content'    // Nouveaux exercices, quiz, chapitres
  | 'messages';  // Messages directs du professeur et de l'administration

export interface NotificationPrefs {
  /** Coupe tout : boîte de réception et notifications système. */
  enabled: boolean;
  /** Notifications dans la barre du téléphone (nécessite l'autorisation). */
  native: boolean;
  digestHours: DigestFrequency;
  categories: Record<NotificationCategory, boolean>;
  /** Aucune notification système entre `from` et `to` (format "HH:MM"). */
  quietHours: { enabled: boolean; from: string; to: string };
}

/** Thème de lecture des documents (révision, quiz, exercices). */
export type ReadingPaper = 'ivoire' | 'blanc' | 'creme' | 'ardoise';
export type ReadingFont = 'serif' | 'sans' | 'ronde';
export interface ReadingTheme { paper: ReadingPaper; docFont: ReadingFont; docScale: number; }

/** Créneau de travail hebdomadaire. `day` : 0 = dimanche … 6 = samedi. */
export interface StudySlot {
  /**
   * Identifiant stable du créneau. Un même jour peut en porter plusieurs
   * (matin et soir), le jour ne suffit donc plus à désigner une séance.
   * Absent des sauvegardes antérieures : `normalizePlan` le renseigne.
   */
  id?: string;
  day: number;
  enabled: boolean;
  /** Heure de début, format "HH:MM". */
  start: string;
  durationMin: number;
  /** Intitulé libre du créneau (« Analyse », « Annales »…). */
  focus?: string;
}

export interface StudyPlan {
  enabled: boolean;
  /** Un ou plusieurs créneaux par jour, triés par jour puis par heure. */
  slots: StudySlot[];
  /** Objectif hebdomadaire de travail, en minutes (0 = pas d'objectif). */
  weeklyGoalMin: number;
}

export interface AppSettings {
  language?: string;
  notifications?: boolean;
  autoSave?: boolean;
  fontSize?: 'sm' | 'base' | 'lg';
  soundEnabled?: boolean;
  reduceMotion?: boolean;
  quizTimePerQuestion?: number;
  tiersTemps?: boolean;
  revisionBlockVisibility?: RevisionBlockVisibilitySettings;
  revisionBlockNumbering?: RevisionNumberingSettings;
  notificationPrefs?: NotificationPrefs;
  readingTheme?: ReadingTheme;
  studyPlan?: StudyPlan;
  [key: string]: any;
}

declare global {
  interface Window {
    MathJax: any;
  }
}
