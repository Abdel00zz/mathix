import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../../types';
import { numberExercise, partLabel, rendersAsQuestion } from './exerciseNumbering';
import { parseExercise } from './ExerciseEngine';

const base = { chapterId: 'continuite' } as const;

describe('numérotation d’un exercice', () => {
  it('numérote les questions et ouvre les parties sans leur donner de numéro', () => {
    const numbering = numberExercise([
      { id: 'q1', content: 'Question une' },
      { id: 'p1', type: 'partie', content: 'Partie' },
      { id: 'q2', content: '', subQuestions: [{ id: 'a', content: 'a' }] },
      { id: 't1', type: 'text', content: 'Chapeau' },
      { id: 'q3', content: 'Question trois' },
    ]);

    expect(numbering.map(entry => entry.kind)).toEqual(['question', 'part', 'question', 'text', 'question']);
    expect(numbering.map(entry => entry.question)).toEqual([1, 0, 2, 0, 3]);
    expect(numbering.map(entry => entry.part)).toEqual([0, 1, 1, 1, 1]);
  });

  it('ne consomme aucun numéro pour un nœud que personne ne verra', () => {
    // Une question vide, sans sous-question, n'est pas rendue : lui donner un
    // numéro décalerait toutes les questions suivantes.
    expect(rendersAsQuestion({ content: '   ' })).toBe(false);
    const numbering = numberExercise([
      { id: 'q1', content: 'Visible' },
      { id: 'q2', content: '' },
      { id: 'q3', content: 'Visible aussi' },
    ]);
    expect(numbering.map(entry => entry.kind)).toEqual(['question', 'empty', 'question']);
    expect(numbering.map(entry => entry.question)).toEqual([1, 0, 2]);
  });

  it('compte une question qui ne porte que des sous-questions', () => {
    const numbering = numberExercise([{ id: 'q1', content: '', subQuestions: [{ id: 'a' }, { id: 'b' }] }]);
    expect(numbering[0]).toMatchObject({ kind: 'question', question: 1 });
  });

  it('accepte le type historique « header » comme une partie', () => {
    const numbering = numberExercise([{ id: 'h', type: 'header', content: 'Partie II' }, { id: 'q', content: 'x' }]);
    expect(numbering.map(entry => entry.part)).toEqual([1, 1]);
    expect(numbering.map(entry => entry.question)).toEqual([0, 1]);
  });
});

describe('cohérence studio / page élève', () => {
  /**
   * Le studio numérote la donnée BRUTE, la page de l'élève numérote la donnée
   * ANALYSÉE (le moteur transforme une question « plate » en une question à une
   * sous-question). Les deux doivent annoncer les mêmes numéros — c'est tout
   * l'intérêt de cette règle unique.
   */
  const cases: Array<{ label: string; exercise: Exercise }> = [
    {
      label: 'questions plates et questions à sous-questions mêlées',
      exercise: {
        ...base,
        id: 'ex-1',
        questions: [
          { id: 'q1', content: 'Première' },
          { id: 'q2', content: 'Deuxième', subQuestions: [{ id: 'a', content: 'a' }, { id: 'b', content: 'b' }] },
          { id: 'q3', content: '' },
          { id: 'q4', content: 'Quatrième' },
        ],
      } as Exercise,
    },
    {
      label: 'partie au milieu du parcours',
      exercise: {
        ...base,
        id: 'ex-2',
        questions: [
          { id: 'q1', content: 'Avant la partie' },
          { id: 'p1', type: 'partie', content: 'Partie B' },
          { id: 'q2', content: 'Après la partie' },
        ],
      } as Exercise,
    },
    {
      label: 'blocs de texte et question muette à plusieurs sous-questions',
      exercise: {
        ...base,
        id: 'ex-3',
        questions: [
          { id: 't', type: 'text', content: 'Chapeau' },
          { id: 'q1', content: '', subQuestions: [{ id: 'a', content: 'a' }, { id: 'b', content: 'b' }] },
          { id: 'q2', content: 'Suite' },
        ],
      } as Exercise,
    },
  ];

  it.each(cases)('$label', ({ exercise }) => {
    const fromRaw = numberExercise(exercise.questions);
    const fromParsed = numberExercise(parseExercise(exercise).questions);

    expect(fromParsed.map(entry => ({ part: entry.part, question: entry.question })))
      .toEqual(fromRaw.map(entry => ({ part: entry.part, question: entry.question })));
  });

  it('laisse un nœud vide sans numéro dans les deux lectures', () => {
    const exercise = {
      ...base,
      id: 'ex-4',
      questions: [{ id: 'vide', content: '' }, { id: 'q', content: 'Visible' }],
    } as Exercise;

    expect(numberExercise(exercise.questions).map(entry => entry.question)).toEqual([0, 1]);
    expect(numberExercise(parseExercise(exercise).questions).map(entry => entry.question)).toEqual([0, 1]);
  });
});

describe('étiquette de partie', () => {
  it('suit l’alphabet du rendu (A, B, … Z, AA)', () => {
    expect(partLabel(0)).toBe('');
    expect(partLabel(1)).toBe('A');
    expect(partLabel(2)).toBe('B');
    expect(partLabel(26)).toBe('Z');
    expect(partLabel(27)).toBe('AA');
  });
});
