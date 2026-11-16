// ============================================================================
// DS SERVICE — Devoirs Surveillés (organized by semestre, with versions)
// ============================================================================

import { Exercise, SubQuestion } from '../types';

// ── Types ───────────────────────────────────────────────────────────────────

interface DsSubQuestion {
  id: string;
  content: string;
  hint?: string;
  correction?: string;
  subQuestions?: DsSubQuestion[];
}

interface DsQuestion {
  id: string;
  content: string;
  subQuestions?: DsSubQuestion[];
}

interface DsExercise {
  id: string;
  number: number;
  theme: string;
  points: number;
  topic: string;
  context?: string;
  questions: DsQuestion[];
}

export interface DsDevoirData {
  id: string;
  title: string;
  number: number;
  version: string;
  semestre: number;
  classId: string;
  duration: number;
  totalPoints: number;
  exercises: DsExercise[];
}

// ── Cache ───────────────────────────────────────────────────────────────────

// ── DsExercise → Exercise converter ─────────────────────────────────────────

function convertSubQuestions(sqs?: DsSubQuestion[]): SubQuestion[] | undefined {
  if (!sqs || sqs.length === 0) return undefined;
  return sqs.map(sq => ({
    id: sq.id,
    content: sq.content,
    hint: sq.hint,
    correction: sq.correction,
    subQuestions: convertSubQuestions(sq.subQuestions),
  }));
}

/** Convert DsDevoirData exercises to the Exercise[] type used by ExerciseSessionView */
export function toExercises(devoir: DsDevoirData): Exercise[] {
  return devoir.exercises.map(ex => ({
    id: ex.id,
    chapterId: devoir.id,
    topic: ex.topic,
    context: ex.context,
    questions: ex.questions.map(q => ({
      id: q.id,
      content: q.content,
      subQuestions: convertSubQuestions(q.subQuestions),
    })),
  }));
}

// ── Service ─────────────────────────────────────────────────────────────────
