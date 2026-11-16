import type { Exercise, QuizQuestion, QuizResult } from '../types';
import type { Stroke } from '../components/Exercise/canvas/types';
import type { PrintLayout } from './printLayout';
import { STORAGE_KEYS } from '../utils/constants';
import { scopeKey } from '../utils/progressScope';

/**
 * Session Archive — MathPlus (écosystème d'archivage de séance).
 *
 * Agrège, côté professeur, tout ce qui a été « produit » pendant la séance afin
 * de le restituer dans un rendu PDF : exercices ouverts et annotés (zones
 * manuscrites), questions de quiz dont la zone réponse contient du texte, et
 * élèves présents. Les sources sont locales (IndexedDB/localStorage) et cloud
 * (Redis), lues au moment de l'impression.
 */

const EXERCISE_STROKES_KEY = 'mathplus:exercise-strokes:v1';

export interface AnnotatedNote {
  noteKey: string;
  strokeCount: number;
}

export interface SessionPrintPayload {
  classId: string;
  chapterId?: string;
  chapterTitle: string;
  sessionStartedAt?: number | null;
  presentStudents: string[];
  exercises: Exercise[];
  annotated: Record<string, AnnotatedNote[]>;
  /** Traits manuscrits transmis par la tablette (noteKey → strokes), pour le rendu SVG. */
  strokes: Record<string, unknown[]>;
  quizQuestions: QuizQuestion[];
  quizAnswered: Array<{ question: QuizQuestion; answer: string; isCorrect: boolean | null }>;
  /**
   * Mise en page d'impression (page, typographie, style des zones de réponse).
   * Sans elle, la séance retombait sur le `@page` portrait global et sur toutes
   * les valeurs de repli des `--print-*` : l'orientation et la typographie du
   * professeur étaient ignorées.
   */
  layout?: PrintLayout;
  options: {
    includeStudents: boolean;
    includeAnnotations: boolean;
    includeCorrections: boolean;
  };
}

function readMap(key: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function compactStroke(stroke: Stroke): Stroke {
  if (!Array.isArray(stroke.points)) return stroke;
  const points = stroke.points.map(p => ({
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    pressure: Math.round((p.pressure ?? 0.5) * 100) / 100,
  }));
  return { ...stroke, points };
}

/** Traits manuscrits des zones d'exercices, clés par noteKey (`exercise-sq:<uniqueId>`). */
export function readExerciseStrokes(exercises?: Exercise[]): Record<string, Stroke[]> {
  const raw = readMap(EXERCISE_STROKES_KEY);
  const out: Record<string, Stroke[]> = {};
  const allowed = exercises ? new Set(exercises.flatMap(exerciseNoteKeys)) : null;
  for (const [key, value] of Object.entries(raw)) {
    if (allowed && !allowed.has(key)) continue;
    if (Array.isArray(value) && value.length > 0) {
      out[key] = (value as Stroke[]).map(compactStroke);
    }
  }
  return out;
}

/** Construit les noteKeys possibles d'un exercice (sous-questions + « main »). */
function exerciseNoteKeys(exercise: Exercise): string[] {
  const keys: string[] = [];
  for (const q of exercise.questions || []) {
    for (const sq of q.subQuestions || []) {
      keys.push(`exercise-sq:${exercise.id}-${q.id}-${sq.id}`);
    }
    keys.push(`exercise-sq:${exercise.id}-${q.id}-main`);
  }
  return keys;
}

/** Zones annotées d'un exercice (noteKey + nombre de traits). */
export function annotatedNotesFor(exercise: Exercise, strokes: Record<string, unknown[]>): AnnotatedNote[] {
  const prefix = `exercise-sq:${exercise.id}-`;
  const knownKeys = new Set(exerciseNoteKeys(exercise));
  for (const k of Object.keys(strokes)) {
    if (k.startsWith(prefix)) knownKeys.add(k);
  }
  return Array.from(knownKeys)
    .filter(key => Array.isArray(strokes[key]) && strokes[key].length > 0)
    .map(key => ({ noteKey: key, strokeCount: strokes[key].length }));
}

/** Vrai si la réponse d'un quiz contient effectivement du texte (zone remplie). */
export function isAnswerFilled(userAnswer: unknown): boolean {
  if (userAnswer === null || userAnswer === undefined) return false;
  if (typeof userAnswer === 'string') return userAnswer.trim().length > 0;
  if (Array.isArray(userAnswer)) return userAnswer.length > 0;
  if (typeof userAnswer === 'number') return true;
  if (typeof userAnswer === 'boolean') return true;
  return false;
}

/** Rend une réponse utilisateur lisible pour l'impression. */
export function formatQuizAnswer(question: QuizQuestion, userAnswer: unknown): string {
  if (userAnswer === null || userAnswer === undefined) return '';
  if (typeof userAnswer === 'boolean') return userAnswer ? 'Vrai' : 'Faux';

  if (question.type === 'mcq') {
    const option = (question.options || []).find(o => o.id === userAnswer);
    return option ? option.text : String(userAnswer);
  }
  if (question.type === 'order') {
    const byId = new Map((question.items || []).map(i => [i.id, i.content]));
    return (Array.isArray(userAnswer) ? userAnswer : [])
      .map(id => byId.get(String(id)) ?? String(id))
      .join(' → ');
  }
  if (question.type === 'error') {
    const byId = new Map((question.steps || []).map(s => [s.id, s.text]));
    return (Array.isArray(userAnswer) ? userAnswer : [])
      .map(id => byId.get(String(id)) ?? String(id))
      .join(' · ');
  }
  if (Array.isArray(userAnswer)) return userAnswer.map(String).join(' · ');
  return String(userAnswer);
}

/** Lit les réponses de quiz enregistrées pour un chapitre (tranche quiz locale). */
export function readQuizAnswers(chapterId?: string, classId?: string): { history: QuizResult[]; answersSnapshot: Record<string, unknown> } {
  if (!chapterId) return { history: [], answersSnapshot: {} };
  const slice = readMap(STORAGE_KEYS.PROGRESS_QUIZ);
  // Les tranches récentes utilisent `classId_chapterId`; la clé brute reste
  // acceptée uniquement pour les données locales antérieures à ce scopage.
  // On ne parcourt jamais les clés d'une autre classe.
  const data = (classId ? slice[scopeKey(classId, chapterId)] : undefined)
    ?? slice[chapterId];
  if (!data || typeof data !== 'object') return { history: [], answersSnapshot: {} };
  const quiz = data as { history?: QuizResult[]; answersSnapshot?: Record<string, unknown> };
  return {
    history: Array.isArray(quiz.history) ? quiz.history : [],
    answersSnapshot: quiz.answersSnapshot && typeof quiz.answersSnapshot === 'object' ? quiz.answersSnapshot : {},
  };
}
