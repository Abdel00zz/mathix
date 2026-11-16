import { describe, expect, it } from 'vitest';
import { getScopedChapterProgress, rescopeProgress, scopeKey, unscopeProgress } from './progressScope';
import type { ChapterProgress } from '../types';

const progress = (revisionProgress: number) => ({ revisionProgress }) as ChapterProgress;

describe('progressScope', () => {
  it('keeps chapters with the same id isolated by class', () => {
    const sharedChapter = 'mise-a-niveau';
    const allProgress = {
      [scopeKey('1bac-sm', sharedChapter)]: progress(40),
      [scopeKey('1bac-se', sharedChapter)]: progress(90),
    };

    expect(unscopeProgress(allProgress, '1bac-sm')).toEqual({
      [sharedChapter]: progress(40),
    });
    expect(unscopeProgress(allProgress, '1bac-se')).toEqual({
      [sharedChapter]: progress(90),
    });
  });

  it('moves only the selected class when a profile changes class', () => {
    const original = {
      [scopeKey('1bac-sm', 'suites')]: progress(55),
      [scopeKey('1bac-se', 'suites')]: progress(80),
    };

    expect(rescopeProgress(original, '1bac-sm', '2bac-sm')).toEqual({
      [scopeKey('2bac-sm', 'suites')]: progress(55),
      [scopeKey('1bac-se', 'suites')]: progress(80),
    });
  });

  it('requires an explicit class to read a chapter', () => {
    const allProgress = {
      [scopeKey('1bac-sm', 'suites')]: progress(55),
      [scopeKey('1bac-se', 'suites')]: progress(80),
    };

    expect(getScopedChapterProgress(allProgress, '1bac-sm', 'suites')).toEqual(progress(55));
    expect(getScopedChapterProgress(allProgress, '1bac-se', 'suites')).toEqual(progress(80));
    expect(getScopedChapterProgress(allProgress, undefined, 'suites')).toBeUndefined();
  });
});
