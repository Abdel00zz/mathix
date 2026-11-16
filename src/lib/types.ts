export type ClassId =
  | 'tronc-commun-sc'
  | '1ere-bac-sc-ex'
  | '1ere-bac-sc-math'
  | '2eme-bac-sc-ex'
  | '2eme-bac-sc-math';

export type ThemePref = 'auto' | 'light' | 'dark';
export type DocFontPref = 'literata' | 'serif' | 'sans';

export interface StudentProfile {
  th: ThemePref;
  cls: ClassId;
  fn: string;
  ln: string;
  sc: string;
  docFont: DocFontPref;
  docScale: number;
  tiersTemps: boolean;
  soundEnabled: boolean;
  lexiconAutoHighlight: boolean;
  reduceMotion: boolean;
  quizTimePerQuestion: number;
  profileUpdatedAt?: number;
}

export interface LastVisited {
  href: string;
  hash?: string | null;
  url?: string | null;
  title: string;
  chapterTitle?: string;
  kind: 'lesson' | 'quiz' | 'exo' | 'probleme' | 'national' | 'concours';
  type?: string;
  classId?: ClassId | string | null;
  chapterId?: string | null;
  at?: number;
}

export interface StickyUnlockEntry {
  quiz?: boolean;
  exercises?: boolean;
}

export interface CloudResumeLessonEntry {
  pct: number;
  maxPct: number;
  secId?: string;
  secTitle?: string;
  revealedBlanks?: Array<number | string>;
  bookmarks?: string[];
  updatedAt: number;
}

export interface CloudResumeActiveSheetEntry {
  sheetId: string;
  href: string;
  scrollKey: string;
  updatedAt: number;
}

export interface CloudResumeQuizAnswer {
  status: 'answered';
  isCorrect: boolean;
  selectedIndex?: number;
  orderItems?: string[];
  text?: string;
  timedOut?: boolean;
}

export interface CloudResumeQuizEntry {
  selectedQuizId: string;
  phase: 'run' | 'end';
  idx: number;
  answers: Record<number, CloudResumeQuizAnswer>;
  skipped: number[];
  elapsedSec: number;
  reviewQueue: number[] | null;
  totalQuestions?: number;
  answeredCount?: number;
  updatedAt: number;
}

export interface CloudResumeActiveQuizEntry {
  quizId: string;
  updatedAt: number;
}

export interface CloudResumeExerciseEntry {
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

export interface CloudResumeData {
  lessons: Record<string, CloudResumeLessonEntry>;
  lessonActiveSheet: Record<string, CloudResumeActiveSheetEntry>;
  quizzes: Record<string, CloudResumeQuizEntry>;
  chapterActiveQuiz: Record<string, CloudResumeActiveQuizEntry | string>;
  exercises: Record<string, CloudResumeExerciseEntry>;
}

export interface StudentState {
  q: Record<string, number[] | { answers?: unknown[]; done?: number; isSubmitted?: boolean }>;
  e: Record<string, Record<string, number> | number[]>;
  l: Record<string, number | { pct?: number }>;
  lastVisited: LastVisited | null;
}

export interface ClassMeta {
  id: ClassId;
  title: string;
  shortName: string;
}

export interface ResourceRef {
  id?: string;
  title?: string;
  label?: string;
  path?: string;
  questionsCount?: number;
  year?: number;
}

export interface ChapterManifest {
  id: string;
  title: string;
  order?: number;
  pinned?: boolean;
  section?: string;
  manifestPath?: string;
  quizCount?: number;
  revisions?: ResourceRef[];
  quizzes?: ResourceRef[];
  exercises?: ResourceRef[];
}

export interface ClassManifest {
  id: string;
  title?: string;
  className?: string;
  chapters: ChapterManifest[];
}

export interface ChapterLocks {
  quizLocked: boolean;
  exercisesLocked: boolean;
  quizHint: string;
  exercisesHint: string;
}

export interface ExamenMeta {
  id: string;
  title?: string;
  year?: number;
  session?: string;
  exerciseCount?: number;
  duration?: number;
  coefficient?: number;
  totalPoints?: number;
  path?: string;
}

export interface ProblemeMeta {
  id: string;
  title?: string;
  theme?: string;
  difficulty?: string;
  subtitle?: string;
  source?: string;
  path?: string;
}

export interface ConcoursSchool {
  id: string;
  name?: string;
  title?: string;
  timePerQuestion?: number;
  questionsPerExam?: number;
  quizzes?: ResourceRef[];
  annales?: ResourceRef[];
}

export type OrientationDomainId = 'algebre' | 'analyse' | 'geometrie' | 'probabilites' | 'statistiques';

export interface OrientationChapter {
  chId: string;
  domain: OrientationDomainId;
  title: string;
  contents: string[];
  capacities: string[];
}

export interface OrientationProgram {
  id: ClassId;
  shortLabel: string;
  title: string;
  domains: Array<{ id: OrientationDomainId; label: string }>;
  chapters: OrientationChapter[];
}
