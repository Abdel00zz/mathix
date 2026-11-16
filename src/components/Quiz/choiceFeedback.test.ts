import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getChoiceFeedbackState } from './choiceFeedback';
import QuizOptions from './QuizOptions';
import type { QuizQuestion } from '../../types';

describe('getChoiceFeedbackState', () => {
  it('does not reveal correctness before validation', () => {
    expect(getChoiceFeedbackState(false, true, false)).toBe('idle');
    expect(getChoiceFeedbackState(false, false, true)).toBe('selected');
  });

  it('shows every incorrect choice after validation', () => {
    expect(getChoiceFeedbackState(true, true, false)).toBe('correct');
    expect(getChoiceFeedbackState(true, false, false)).toBe('incorrect');
    expect(getChoiceFeedbackState(true, false, true)).toBe('selected-incorrect');
  });

  it('renders all QCM distractors in an explicit incorrect state after validation', () => {
    const question: QuizQuestion = {
      id: 'qcm-feedback',
      type: 'mcq',
      prompt: 'Question de test',
      options: [
        { id: 'a', text: 'Réponse A', isCorrect: false },
        { id: 'b', text: 'Réponse B', isCorrect: true },
        { id: 'c', text: 'Réponse C', isCorrect: false },
      ],
    };

    const markup = renderToStaticMarkup(React.createElement(QuizOptions, {
      question,
      selectedAnswer: null,
      isAnswered: true,
      isReviewMode: false,
      result: { userAnswer: 'a' },
      onSelect: () => undefined,
    }));

    expect(markup).toContain('Bonne réponse');
    expect(markup).toContain('Votre choix');
    expect(markup).toContain('Réponse C : réponse incorrecte');
  });

  it('uses the recorded true/false answer after validation', () => {
    const question: QuizQuestion = {
      id: 'boolean-feedback',
      type: 'boolean',
      prompt: 'Question de test',
      isTrue: true,
    };

    const markup = renderToStaticMarkup(React.createElement(QuizOptions, {
      question,
      selectedAnswer: null,
      isAnswered: true,
      isReviewMode: false,
      result: { userAnswer: false },
      onSelect: () => undefined,
    }));

    expect(markup).toContain('Bonne réponse');
    expect(markup).toContain('Votre choix');
  });
});
