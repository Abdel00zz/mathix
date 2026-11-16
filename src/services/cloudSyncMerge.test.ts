import { describe, expect, it } from 'vitest';
import type { ChapterProgress } from '../types';
import { mergeChapterProgress, mergeProgress } from './cloudSyncService';

const chapter = (overrides: Partial<ChapterProgress> = {}): ChapterProgress => ({
  revisionProgress: 0,
  quiz: { isSubmitted: false, score: 0, highScore: 0, attempts: 0 },
  exercises: {},
  ...overrides,
});

describe('fusion de progression local/cloud (caractérisation)', () => {
  it('garde le meilleur pourcentage de révision et le meilleur score', () => {
    const merged = mergeChapterProgress(
      chapter({ revisionProgress: 40, quiz: { isSubmitted: false, score: 5, highScore: 7, attempts: 1 } }),
      chapter({ revisionProgress: 75, quiz: { isSubmitted: true, score: 3, highScore: 9, attempts: 4 } }),
    );
    expect(merged.revisionProgress).toBe(75);
    expect(merged.quiz.score).toBe(5);
    expect(merged.quiz.highScore).toBe(9);
    expect(merged.quiz.attempts).toBe(4);
    expect(merged.quiz.isSubmitted).toBe(true);
  });

  it('fait l\'union des éléments révélés et compétences', () => {
    const merged = mergeChapterProgress(
      chapter({ revealedBlanks: ['a', 'b'], masteredSkills: ['s1'], completedSeances: [1] }),
      chapter({ revealedBlanks: ['b', 'c'], masteredSkills: ['s2'], completedSeances: [2] }),
    );
    expect(merged.revealedBlanks?.sort()).toEqual(['a', 'b', 'c']);
    expect(merged.masteredSkills?.sort()).toEqual(['s1', 's2']);
    expect(merged.completedSeances?.sort()).toEqual([1, 2]);
  });

  it('retient la meilleure maîtrise et l\'exercice complété', () => {
    const merged = mergeChapterProgress(
      chapter({ exercises: { e1: { isCompleted: false, mastery: 'low', lastHintIndex: 2 } } }),
      chapter({ exercises: { e1: { isCompleted: true, mastery: 'high', lastHintIndex: 1 }, e2: { isCompleted: true, mastery: 'medium' } } }),
    );
    expect(merged.exercises.e1).toEqual({ isCompleted: true, mastery: 'high', lastHintIndex: 2 });
    expect(merged.exercises.e2.mastery).toBe('medium');
  });

  it('conserve la progression par fiche au login (une clé par fiche, la plus avancée gagne)', () => {
    const merged = mergeChapterProgress(
      chapter({ revisionProgressBySheet: { a: 60, b: 10 } }),
      chapter({ revisionProgressBySheet: { a: 30, c: 80 } }),
    );
    expect(merged.revisionProgressBySheet).toEqual({ a: 60, b: 10, c: 80 });
  });

  it('ne crée pas de progression par fiche pour un chapitre qui n\'en a pas', () => {
    const merged = mergeChapterProgress(chapter(), chapter());
    expect(merged.revisionProgressBySheet).toBeUndefined();
  });

  it('garde l\'historique de quiz le plus long', () => {
    const short = [{ questionId: 'q1', isCorrect: true, userAnswer: 'a' }];
    const long = [...short, { questionId: 'q2', isCorrect: false, userAnswer: 'b' }];
    const merged = mergeChapterProgress(
      chapter({ quiz: { isSubmitted: false, score: 0, highScore: 0, attempts: 0, history: short } }),
      chapter({ quiz: { isSubmitted: false, score: 0, highScore: 0, attempts: 0, history: long } }),
    );
    expect(merged.quiz.history).toHaveLength(2);
  });

  it('conserve les chapitres présents d\'un seul côté', () => {
    const merged = mergeProgress(
      { a: chapter({ revisionProgress: 10 }) },
      { b: chapter({ revisionProgress: 20 }) },
    );
    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
    expect(merged.a.revisionProgress).toBe(10);
    expect(merged.b.revisionProgress).toBe(20);
  });

  it('ne peut que monter : une valeur plus basse ne remplace jamais une plus haute', () => {
    const merged = mergeChapterProgress(chapter({ revisionProgress: 0 }), chapter({ revisionProgress: 90 }));
    expect(merged.revisionProgress).toBe(90);
  });
});
