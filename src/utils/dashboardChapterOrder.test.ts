import { describe, expect, it } from 'vitest';
import { computeActiveChapterIndex, orderChaptersForDashboard } from './dashboardChapterOrder';
import type { ChapterInfo, ChapterProgress } from '../types';

const makeChapter = (id: string, title = id): ChapterInfo => ({
  id,
  title,
});

const blankProgress = (): ChapterProgress => ({
  quiz: { isSubmitted: false, score: 0, highScore: 0, attempts: 0, history: [] },
  exercises: {},
  revisionProgress: 0,
  revealedBlanks: [],
  masteredSkills: [],
  completedSeances: [],
});

describe('dashboardChapterOrder', () => {
  it('priorise le dernier chapitre ouvert si son horodatage dépasse le dernier travail', () => {
    const chapters = [makeChapter('ch1'), makeChapter('ch2'), makeChapter('ch3')];
    const progress = { ch1: { ...blankProgress(), lastActiveAt: 1000 } };
    const idx = computeActiveChapterIndex(chapters, progress, {}, { id: 'ch3', at: 2000 });
    expect(idx).toBe(2);
  });

  it('place les chapitres épinglés (Mise à niveau) avant les chapitres mis en avant et le chapitre actif', () => {
    const chapters = [
      makeChapter('ch1', 'Suites'),
      makeChapter('mise-a-niveau', 'Mise à niveau'),
      makeChapter('ch2', 'Limites'),
      makeChapter('ch3', 'Intégrales'),
    ];
    const ordered = orderChaptersForDashboard(chapters, 2, new Set(['ch3']), true);
    expect(ordered.map(entry => entry.chapter.id)).toEqual(['mise-a-niveau', 'ch3', 'ch2', 'ch1']);
  });
});
