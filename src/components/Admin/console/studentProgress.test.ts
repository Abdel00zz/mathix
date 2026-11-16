import { describe, expect, it } from 'vitest';
import type { ProgressSummary, StudentChapterProgress } from '../../../services/adminService';
import { buildComparison, chapterCompletion, chapterState } from './studentProgress';

const chapter = (patch: Partial<StudentChapterProgress>): StudentChapterProgress => ({
  chapter: 'continuite',
  scopedKey: '2eme-bac-sc-ex_continuite',
  revisionProgress: 0,
  revisionBySheet: {},
  blanksRevealed: 0,
  masteredSkills: 0,
  completedSeances: [],
  lastActiveAt: null,
  lastActiveSection: null,
  quizSubmitted: false,
  quizScore: 0,
  quizHighScore: 0,
  quizAttempts: 0,
  quizTotal: 20,
  quizAnswered: 0,
  quizCorrect: 0,
  quizProgressPct: 0,
  quizCurrentIndex: 0,
  quizDuration: null,
  quizHistory: [],
  subQuestionsTotal: 0,
  subQuestionsCompleted: 0,
  exercisesFeedbackCount: 0,
  feedbackDetails: {},
  feedbackSummary: { done: 0, skipped: 0 },
  exerciseDurations: {},
  submitted: false,
  submittedAt: null,
  ...patch,
});

const summary = (patch: Partial<ProgressSummary>): ProgressSummary => ({ found: true, ...patch });

describe('avancement d’un chapitre', () => {
  it('croise révision, quiz et exercices à parts égales', () => {
    const result = chapterCompletion(chapter({
      revisionProgress: 60,
      quizProgressPct: 30,
      feedbackSummary: { done: 2, skipped: 0 },
    }), 4);
    expect(result).toEqual({ revision: 60, quiz: 30, exercises: 50, completion: 47 });
  });

  it('compte le quiz validé comme complet même sans historique', () => {
    const result = chapterCompletion(chapter({ revisionProgress: 100, quizSubmitted: true }), 0);
    expect(result.quiz).toBe(100);
    expect(result.completion).toBe(67);
  });

  it('ne dépasse jamais 100 % quand le relevé contient des valeurs aberrantes', () => {
    const result = chapterCompletion(chapter({
      revisionProgress: 140,
      quizSubmitted: true,
      feedbackSummary: { done: 9, skipped: 0 },
    }), 3);
    expect(result).toEqual({ revision: 100, quiz: 100, exercises: 100, completion: 100 });
  });

  it('reste à zéro pour un chapitre jamais ouvert', () => {
    expect(chapterCompletion(undefined, 4).completion).toBe(0);
    expect(chapterState(undefined)).toBe('todo');
  });
});

describe('état d’un chapitre', () => {
  it('distingue validé, en cours et non commencé', () => {
    expect(chapterState(chapter({ submitted: true }))).toBe('done');
    expect(chapterState(chapter({ revisionProgress: 12 }))).toBe('active');
    expect(chapterState(chapter({ quizAnswered: 1 }))).toBe('active');
    expect(chapterState(chapter({ feedbackSummary: { done: 3, skipped: 1 } }))).toBe('active');
    expect(chapterState(chapter({ feedbackSummary: { done: 0, skipped: 2 } }))).toBe('todo');
  });
});

describe('comparaison avec la classe', () => {
  const classOf: ProgressSummary[] = [
    summary({ totalTimeSpent: 900, avgRevision: 80, quizDone: 5, exercisesDone: 20 }),
    summary({ totalTimeSpent: 480, avgRevision: 40, quizDone: 2, exercisesDone: 8 }),
    summary({ totalTimeSpent: 120, avgRevision: 20, quizDone: 1, exercisesDone: 3 }),
    { found: false },
  ];

  it('moyenne et maximum ignorent les comptes sans relevé', () => {
    const comparison = buildComparison(classOf, classOf[1]);
    expect(comparison.count).toBe(3);
    expect(comparison.average.totalTimeSpent).toBe(500);
    expect(comparison.maximum.totalTimeSpent).toBe(900);
  });

  it('situe l’élève dans sa classe', () => {
    const comparison = buildComparison(classOf, classOf[1]);
    expect(comparison.rank.totalTimeSpent).toBe(2);
    expect(comparison.rank.avgRevision).toBe(2);
  });

  it('donne le premier rang à la meilleure valeur', () => {
    const comparison = buildComparison(classOf, classOf[0]);
    expect(comparison.rank.totalTimeSpent).toBe(1);
    expect(comparison.rank.exercisesDone).toBe(1);
  });

  it('n’invente pas de rang quand l’élève n’a aucun relevé', () => {
    const comparison = buildComparison(classOf, { found: false });
    expect(comparison.rank.totalTimeSpent).toBeNull();
    expect(comparison.rank.avgRevision).toBeNull();
  });
});
