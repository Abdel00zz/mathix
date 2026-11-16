import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { QUIZ_UNLOCK_THRESHOLD, EXERCISE_UNLOCK_THRESHOLD } from '../../src/utils/chapterProgress';
import { computeRevisionProgress } from '../../src/utils/progressUtils';
import { computeLocks, getQuizStats, isEntrySubmitted } from '../../apps/apprendre-next/src/lib/unlocks';
import { resolveRouteView } from '../../apps/apprendre-next/src/lib/routeView';

const base = {
  classId: '2eme-bac-sc-ex', chapterId: 'continuite', hasLesson: true, hasQuiz: true, hasExercises: true,
  lessonPct: 0, quizPct: 0, quizSubmitted: false, stickyMap: {},
};

describe('Next preserves the parent chapter-card rules', () => {
  it('renders the right page layout before hydration without confusing exam and library URLs', () => {
    expect(resolveRouteView('/lecon/continuite')).toBe('les');
    expect(resolveRouteView('/probleme/euler')).toBe('les');
    expect(resolveRouteView('/examen/2025')).toBe('exo');
    expect(resolveRouteView('/examens')).toBe('lib');
    expect(resolveRouteView('/concours/ensa')).toBe('quiz');
    expect(resolveRouteView('/')).toBe('learn');
  });
  it('keeps the parent portal and Next caches when the maquette worker activates', async () => {
    const listeners: Record<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void> = {};
    const deleted: string[] = [];
    vm.runInNewContext(fs.readFileSync('maquette/sw-apprendre.js', 'utf8'), {
      self: { addEventListener: (name: string, handler: typeof listeners[string]) => { listeners[name] = handler; }, clients: { claim: async () => {} } },
      caches: {
        keys: async () => ['mathflow-apprendre-v6', 'mathflow-apprendre-v7', 'mathflow-apprendre-next-abc-assets', 'workbox-precache'],
        delete: async (key: string) => { deleted.push(key); return true; },
      },
    });
    let pending: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: promise => { pending = promise; } });
    await pending;
    expect(deleted).toEqual(['mathflow-apprendre-v6']);
  });
  it('opens the quiz exactly at the shared lesson threshold', () => {
    expect(computeLocks({ ...base, lessonPct: QUIZ_UNLOCK_THRESHOLD - 1 }).quizLocked).toBe(true);
    expect(computeLocks({ ...base, lessonPct: QUIZ_UNLOCK_THRESHOLD }).quizLocked).toBe(false);
    expect(computeLocks({ ...base, hasLesson: false }).quizLocked).toBe(false);
  });
  it('opens exercises after 15% treated, submission, or when no quiz exists', () => {
    expect(computeLocks({ ...base, quizPct: EXERCISE_UNLOCK_THRESHOLD - 1 }).exercisesLocked).toBe(true);
    expect(computeLocks({ ...base, quizPct: EXERCISE_UNLOCK_THRESHOLD }).exercisesLocked).toBe(false);
    expect(computeLocks({ ...base, quizSubmitted: true }).exercisesLocked).toBe(false);
    expect(computeLocks({ ...base, hasQuiz: false }).exercisesLocked).toBe(false);
  });
  it('keeps pinned chapters and previously unlocked steps accessible', () => {
    expect(computeLocks({ ...base, chapterId: 'mise-a-niveau' }).quizLocked).toBe(false);
    expect(computeLocks({ ...base, stickyMap: { '2eme-bac-sc-ex:continuite': { quiz: true, exercises: true } } }).exercisesLocked).toBe(false);
  });
  it('measures lesson mastery from revealed blanks independently of scrolling', () => {
    expect(computeRevisionProgress(0, 13)).toBe(0);
    const pct = computeRevisionProgress(2, 13);
    expect(pct).toBe(15);
    expect(computeLocks({ ...base, lessonPct: pct }).quizLocked).toBe(false);
    expect(computeRevisionProgress(13, 13)).toBe(100);
  });
  it('counts treated questions without confusing them with correct answers or submission', () => {
    const answers = [0, 0, 0, 0, 0, null, null, null, null, null];
    const stats = getQuizStats({ '2eme-bac-sc-ex:continuite:q1': { answers, isSubmitted: false } }, '2eme-bac-sc-ex', 'continuite', [{ id: 'q1', questionsCount: 10 }], 10);
    expect(stats).toEqual({ done: 5, pct: 50, submitted: false });
    expect(isEntrySubmitted({ answers: Array(10).fill(1), isSubmitted: false }, 10)).toBe(false);
    expect(isEntrySubmitted({ answers, isSubmitted: true }, 10)).toBe(true);
  });
});
