import { describe, expect, it } from 'vitest';
import { mergeByKey, mergeChapter, mergeProgress } from './progressMerge';

const baseChapter = (overrides: Record<string, unknown> = {}) => ({
  revisionProgress: 0,
  quiz: { isSubmitted: false, score: 0, highScore: 0, attempts: 0 },
  exercises: {},
  ...overrides,
});

describe('mergeChapter — champs conservés à la deuxième sauvegarde', () => {
  it('garde lastActiveAt, le plus récent des deux', () => {
    const merged = mergeChapter(
      baseChapter({ lastActiveAt: 2_000 }),
      baseChapter({ lastActiveAt: 1_000 }),
    );
    expect(merged.lastActiveAt).toBe(2_000);
  });

  it("n'invente pas lastActiveAt quand aucun côté n'en a", () => {
    const merged = mergeChapter(baseChapter(), baseChapter());
    expect('lastActiveAt' in merged).toBe(false);
  });

  it('fusionne la progression par fiche en gardant le maximum de chaque fiche', () => {
    const merged = mergeChapter(
      baseChapter({ revisionProgressBySheet: { a: 40, b: 10 } }),
      baseChapter({ revisionProgressBySheet: { a: 25, c: 70 } }),
    );
    expect(merged.revisionProgressBySheet).toEqual({ a: 40, b: 10, c: 70 });
  });

  it('ne crée pas revisionProgressBySheet pour un chapitre à fiche unique', () => {
    const merged = mergeChapter(baseChapter(), baseChapter());
    expect('revisionProgressBySheet' in merged).toBe(false);
  });

  it('réunit les séances validées sur les deux appareils', () => {
    const merged = mergeChapter(
      baseChapter({ completedSeances: [1, 2] }),
      baseChapter({ completedSeances: [2, 3] }),
    );
    expect([...merged.completedSeances].sort()).toEqual([1, 2, 3]);
  });
});

describe('mergeChapter — règles existantes inchangées', () => {
  it('garde le meilleur score et le plus de tentatives', () => {
    const merged = mergeChapter(
      baseChapter({ quiz: { isSubmitted: true, score: 60, highScore: 60, attempts: 1 } }),
      baseChapter({ quiz: { isSubmitted: false, score: 80, highScore: 90, attempts: 3 } }),
    );
    expect(merged.quiz).toMatchObject({ isSubmitted: true, score: 80, highScore: 90, attempts: 3 });
  });

  it('garde la meilleure maîtrise par exercice', () => {
    const merged = mergeChapter(
      baseChapter({ exerciseFeedback: { e1: 'low', e2: 'high' } }),
      baseChapter({ exerciseFeedback: { e1: 'medium', e2: 'skipped' } }),
    );
    expect(merged.exerciseFeedback).toEqual({ e1: 'medium', e2: 'high' });
  });

  it('renvoie le côté présent quand un seul existe', () => {
    const only = baseChapter({ revisionProgress: 55 });
    expect(mergeChapter(only, undefined)).toBe(only);
    expect(mergeChapter(undefined, only)).toBe(only);
  });
});

describe('mergeProgress', () => {
  it('fusionne les chapitres communs et conserve les autres', () => {
    const merged = mergeProgress(
      { c1: baseChapter({ revisionProgress: 30 }), c2: baseChapter({ revisionProgress: 10 }) },
      { c1: baseChapter({ revisionProgress: 50 }), c3: baseChapter({ revisionProgress: 90 }) },
    );
    expect(Object.keys(merged).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(merged.c1.revisionProgress).toBe(50);
    expect(merged.c3.revisionProgress).toBe(90);
  });
});

describe('mergeByKey', () => {
  it('garde la plus grande valeur par clé et ignore les entrées sans clé', () => {
    const merged = mergeByKey(
      [{ date: '2026-01-01', minutes: 10 }, { minutes: 5 }],
      [{ date: '2026-01-01', minutes: 25 }, { date: '2026-01-02', minutes: 3 }],
      'date',
      'minutes',
    );
    expect(merged).toHaveLength(2);
    expect(merged.find(entry => entry.date === '2026-01-01')?.minutes).toBe(25);
  });
});
