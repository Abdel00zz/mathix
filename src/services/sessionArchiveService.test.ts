import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../utils/constants';
import { scopeKey } from '../utils/progressScope';
import { readQuizAnswers } from './sessionArchiveService';

describe('readQuizAnswers', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('selects the exact class-scoped quiz slice for a shared chapter id', () => {
    values.set(STORAGE_KEYS.PROGRESS_QUIZ, JSON.stringify({
      [scopeKey('1bac-sm', 'suites')]: {
        history: [{ questionId: 'sm-1', isCorrect: true, userAnswer: 'A' }],
        answersSnapshot: { 'sm-1': 'A' },
      },
      [scopeKey('1bac-se', 'suites')]: {
        history: [{ questionId: 'se-1', isCorrect: false, userAnswer: 'B' }],
        answersSnapshot: { 'se-1': 'B' },
      },
    }));

    expect(readQuizAnswers('suites', '1bac-sm')).toEqual({
      history: [{ questionId: 'sm-1', isCorrect: true, userAnswer: 'A' }],
      answersSnapshot: { 'sm-1': 'A' },
    });
  });

  it('still reads an unscoped legacy slice when no scoped entry exists', () => {
    values.set(STORAGE_KEYS.PROGRESS_QUIZ, JSON.stringify({
      suites: {
        history: [{ questionId: 'legacy-1', isCorrect: true, userAnswer: 'C' }],
        answersSnapshot: { 'legacy-1': 'C' },
      },
    }));

    expect(readQuizAnswers('suites', '1bac-sm').answersSnapshot).toEqual({ 'legacy-1': 'C' });
  });
});
