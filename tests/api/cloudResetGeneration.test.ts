import { describe, expect, it } from 'vitest';
import { mergeAppEnvelopes } from '../../src/server/cloud/appStateMerge';
import { mergeCloudEnvelopes } from '../../apps/apprendre-next/src/lib/cloudSync';

function snapshot(chapter: string, resetAt: number, updatedAt: number) {
  return {
    profile: {}, revision: 1, resetAt, updatedAt,
    state: { q: { [chapter]: [1] }, e: { [chapter]: [2] }, l: { [chapter]: 75 }, lastVisited: null },
    unlocks: { [chapter]: { quiz: true, exercises: true } },
    resume: {
      lessons: { [chapter]: { pct: 50, maxPct: 75, updatedAt } },
      lessonActiveSheet: {}, quizzes: {}, chapterActiveQuiz: {}, exercises: {},
    },
  };
}

describe.each([
  ['server', mergeAppEnvelopes],
  ['client', mergeCloudEnvelopes],
] as const)('%s reset generation', (_name, merge) => {
  it('ignores a pre-reset device snapshot even when it is re-sent with a fresh timestamp', () => {
    const obsolete = snapshot('old-lesson', 0, 10_000);
    const afterReset = snapshot('new-lesson', 200, 300);
    const result = merge(obsolete, afterReset, 11_000);
    expect(result.resetAt).toBe(200);
    expect(result.state.q).toEqual({ 'new-lesson': [1] });
    expect(result.state.e).toEqual({ 'new-lesson': [2] });
    expect(result.state.l).toEqual({ 'new-lesson': 75 });
    expect(result.unlocks).toEqual({ 'new-lesson': { quiz: true, exercises: true } });
    expect(Object.keys(result.resume?.lessons ?? {})).toEqual(['new-lesson']);
    const reverse = merge(afterReset, obsolete, 11_000);
    expect(reverse.state).toEqual(result.state);
    expect(reverse.unlocks).toEqual(result.unlocks);
  });

  it('continues merging progress between devices that have acknowledged the same reset', () => {
    const result = merge(snapshot('lesson-a', 200, 300), snapshot('lesson-b', 200, 400), 500);
    expect(result.state.l).toEqual({ 'lesson-a': 75, 'lesson-b': 75 });
    expect(Object.keys(result.unlocks ?? {}).sort()).toEqual(['lesson-a', 'lesson-b']);
  });
});
