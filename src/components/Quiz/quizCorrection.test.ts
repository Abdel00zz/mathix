import { describe, expect, it } from 'vitest';
import { buildQuizCorrection, hasQuizCorrection } from './quizCorrection';
import type { QuizQuestion } from '../../types';

const mcq: QuizQuestion = {
  id: 'q-mcq',
  type: 'mcq',
  prompt: 'Combien vaut $2+2$ ?',
  explanation: 'On additionne terme à terme.',
  options: [
    { id: 'a', text: '3', isCorrect: false },
    { id: 'b', text: '4', isCorrect: true },
    { id: 'c', text: '5', isCorrect: false },
  ],
};

describe('buildQuizCorrection', () => {
  it('désigne la bonne proposition par sa lettre, comme les pastilles', () => {
    const digest = buildQuizCorrection(mcq, { questionId: 'q-mcq', isCorrect: true, userAnswer: 'b' });
    expect(digest.expected).toBe('B. 4');
    expect(digest.explanation).toBe('On additionne terme à terme.');
  });

  it('ne cite le choix de la classe que lorsqu’il est faux', () => {
    const right = buildQuizCorrection(mcq, { questionId: 'q-mcq', isCorrect: true, userAnswer: 'b' });
    const wrong = buildQuizCorrection(mcq, { questionId: 'q-mcq', isCorrect: false, userAnswer: 'c' });
    expect(right.given).toBe('');
    expect(wrong.given).toBe('C. 5');
  });

  it('ne cite rien quand le minuteur a expiré sans réponse', () => {
    const digest = buildQuizCorrection(mcq, { questionId: 'q-mcq', isCorrect: false, userAnswer: null });
    expect(digest.given).toBe('');
    expect(digest.expected).toBe('B. 4');
  });

  it('traduit le vrai/faux, y compris la réponse « Faux »', () => {
    const question: QuizQuestion = { id: 'q-bool', type: 'boolean', prompt: '…', isTrue: true };
    const digest = buildQuizCorrection(question, { questionId: 'q-bool', isCorrect: false, userAnswer: false });
    expect(digest.expected).toBe('Vrai');
    expect(digest.given).toBe('Faux');
  });

  it('reconstitue la suite attendue d’une question de remise en ordre', () => {
    const question: QuizQuestion = {
      id: 'q-order',
      type: 'order',
      prompt: '…',
      items: [
        { id: '1', content: 'Isoler $x$' },
        { id: '2', content: 'Diviser' },
      ],
      correctOrder: ['1', '2'],
    };
    const digest = buildQuizCorrection(question, { questionId: 'q-order', isCorrect: false, userAnswer: ['2', '1'] });
    expect(digest.expected).toBe('Isoler $x$  →  Diviser');
    expect(digest.given).toBe('Diviser  →  Isoler $x$');
  });

  it('associe l’étape fautive à sa correction', () => {
    const question: QuizQuestion = {
      id: 'q-err',
      type: 'error',
      prompt: '…',
      steps: [
        { id: 's1', text: 'On développe', isError: false },
        { id: 's2', text: 'On simplifie par $0$', isError: true, correction: 'Division interdite' },
      ],
    };
    const digest = buildQuizCorrection(question, { questionId: 'q-err', isCorrect: false, userAnswer: 's1' });
    expect(digest.expected).toBe('On simplifie par $0$  →  Division interdite');
    expect(digest.given).toBe('On développe');
  });

  it('reste vide — donc sans onglet Aide — sans réponse ni explication exploitable', () => {
    const question: QuizQuestion = { id: 'q-vide', type: 'mcq', prompt: '…', options: [] };
    expect(hasQuizCorrection(buildQuizCorrection(question, undefined))).toBe(false);
    expect(hasQuizCorrection(buildQuizCorrection(mcq, undefined))).toBe(true);
  });
});
