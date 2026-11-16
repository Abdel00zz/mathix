import type { ProgressSummary, StudentChapterProgress } from '../../../services/adminService';

/**
 * Calculs du bilan de progression affiché à l'admin.
 *
 * Ils vivent hors du composant pour rester testables et pour ne pas mélanger
 * export de composant et export de fonction (rechargement à chaud de Vite).
 */

/** Métriques comparées à la classe, dans l'ordre d'affichage. */
export const METRIC_KEYS = ['totalTimeSpent', 'avgRevision', 'quizDone', 'exercisesDone', 'chaptersSubmitted', 'chaptersStarted'] as const;

export interface Comparison {
  /** Nombre d'élèves de la classe ayant réellement un relevé cloud. */
  count: number;
  average: Record<string, number | null>;
  maximum: Record<string, number | null>;
  /** Rang de l'élève (1 = premier de la classe), `null` s'il n'a pas de relevé. */
  rank: Record<string, number | null>;
}

/**
 * Situe un élève dans sa classe. Les comptes sans relevé sont ignorés : une
 * classe de 40 élèves dont 3 travaillent ne doit pas écraser la moyenne.
 */
export function buildComparison(summaries: ProgressSummary[], mine: ProgressSummary | null): Comparison {
  const withData = summaries.filter(summary => summary?.found);
  const valueOf = (summary: ProgressSummary, key: string) =>
    Number((summary as unknown as Record<string, unknown>)[key] || 0);
  const average: Record<string, number | null> = {};
  const maximum: Record<string, number | null> = {};
  const rank: Record<string, number | null> = {};

  for (const key of METRIC_KEYS) {
    const values = withData.map(summary => valueOf(summary, key));
    average[key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    maximum[key] = values.length ? Math.max(...values) : null;
    const mineValue = mine?.found ? valueOf(mine, key) : null;
    rank[key] = mineValue === null || !values.length
      ? null
      : values.filter(value => value > mineValue).length + 1;
  }

  return { count: withData.length, average, maximum, rank };
}

export interface ChapterCompletion {
  /** Révision, quiz et exercices, chacun ramené à 100. */
  revision: number;
  quiz: number;
  exercises: number;
  /** Moyenne des trois : ce qu'on lit comme « avancement du chapitre ». */
  completion: number;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value) || 0));

/** Avancement synthétique d'un chapitre : les trois volets pèsent pareil. */
export function chapterCompletion(entry: StudentChapterProgress | undefined, exerciseTotal: number): ChapterCompletion {
  if (!entry) return { revision: 0, quiz: 0, exercises: 0, completion: 0 };
  const revision = clamp(entry.revisionProgress || 0);
  const quiz = entry.quizSubmitted ? 100 : clamp(entry.quizProgressPct || 0);
  const done = entry.feedbackSummary?.done || 0;
  const exercises = clamp(exerciseTotal > 0 ? (done / exerciseTotal) * 100 : (done > 0 ? 100 : 0));
  return { revision, quiz, exercises, completion: Math.round((revision + quiz + exercises) / 3) };
}

/**
 * Un chapitre « passé » (tous les exercices marqués comme sautés) ne compte pas
 * comme entamé : sinon la liste annoncerait du travail là où il n'y en a pas.
 */
export function chapterState(entry: StudentChapterProgress | undefined): 'done' | 'active' | 'todo' {
  if (!entry) return 'todo';
  if (entry.submitted) return 'done';
  const touched = (entry.revisionProgress || 0) > 0
    || (entry.quizAnswered || 0) > 0
    || (entry.blanksRevealed || 0) > 0
    || (entry.masteredSkills || 0) > 0
    || (entry.feedbackSummary?.done || 0) > 0;
  return touched ? 'active' : 'todo';
}

/** Dernier recours quand le titre de l'étape n'est pas retrouvable. */
export function humanizeSectionId(sectionId: string | null | undefined): string | null {
  if (!sectionId) return null;
  const words = sectionId.replace(/^section-/, '').replace(/[_-]+/g, ' ').trim();
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
