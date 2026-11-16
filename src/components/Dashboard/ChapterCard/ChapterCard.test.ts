import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ChapterCard from './index';
import ChapterCardHeader from './ChapterCardHeader';
import ChapterListRow from './ChapterListRow';
import ChapterStep from './ChapterStep';
import type { ChapterCardModel } from './useChapterCard';

vi.mock('../../../i18n/I18nContext', () => ({
  useI18n: () => ({ lang: 'fr', dir: 'ltr', t: (k: string) => k }),
}));

vi.mock('../../../i18n/classLabels', () => ({
  translateChapterLabel: (_id: string, title: string) => title,
}));

vi.mock('../../MathRenderer', () => ({
  default: ({ content }: { content: string }) => React.createElement('span', null, content),
}));

const makeModel = (overrides: Partial<ChapterCardModel> = {}): ChapterCardModel => ({
  cardTheme: { accent: '#b5369b', accentSoft: 'rgba(181, 54, 155, 0.1)' },
  indexFormatted: 'Chapitre 02',
  revisions: [],
  revisionSteps: [],
  revisionCount: 1,
  quizCount: 10,
  exerciseCount: 8,
  hasRevision: true,
  hasQuiz: true,
  hasExercises: true,
  revisionPercent: 0,
  quizPercent: 0,
  exercisesPercent: 0,
  isRevisionLocked: false,
  isQuizLocked: true,
  isExercisesLocked: true,
  isRevisionDone: false,
  isQuizDone: false,
  isExercisesDone: false,
  isChapterMastered: false,
  overallPercent: 0,
  isQuizPassed: false,
  quizScore: 0,
  quizTotal: 10,
  activeMetricsList: [],
  learningStatus: { label: 'Nouveau', tone: 'idle' },
  primaryActionLabel: 'Leçon',
  revisionHint: '',
  quizHint: '',
  exerciseHint: '',
  ...overrides,
});

describe('ChapterCard — approche minimaliste, ciblée et pragmatique', () => {
  it('n’affiche la barre de progression qu’une fois le chapitre démarré (> 0 %)', () => {
    const idleHtml = renderToStaticMarkup(
      React.createElement(ChapterCardHeader, {
        chapter: { id: 'suites', title: 'Suites numériques' } as never,
        model: makeModel({ overallPercent: 0 }),
      })
    );

    expect(idleHtml).toContain('Chapitre 02');
    expect(idleHtml).toContain('tabular-nums');
    expect(idleHtml).not.toContain('role="progressbar"');
    expect(idleHtml).not.toContain('À démarrer');

    const startedHtml = renderToStaticMarkup(
      React.createElement(ChapterCardHeader, {
        chapter: { id: 'suites', title: 'Suites numériques' } as never,
        model: makeModel({ overallPercent: 40 }),
      })
    );

    expect(startedHtml).toContain('Progression');
    expect(startedHtml).toContain('role="progressbar"');
    expect(startedHtml).toContain('width:40%');
  });

  it('conserve des boutons texte de largeur d’origine sans flèche ni sous-barre de progression', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChapterStep, {
        label: 'Leçon',
        pct: 45,
        locked: false,
        completed: false,
        isPrimary: true,
        hint: '',
        onClick: vi.fn(),
      })
    );

    expect(html).not.toContain('w-px');
    expect(html).not.toContain('width:45%');
    expect(html).toContain('45% réalisé');
    expect(html).toContain('min-h-9 rounded-xl border px-3.5');
    expect(html).toContain('sm:px-4 sm:text-[10px]');
    expect(html).toContain('>Continuer</button>');
    expect(html).not.toContain('lucide-chevron-right');
    expect(html).not.toContain('lucide-rotate-ccw');
  });

  it('masque le bouton sur une étape verrouillée', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChapterStep, {
        label: 'Exercices',
        pct: 0,
        locked: true,
        completed: false,
        hint: 'Compléter 15% du quiz requis',
        onClick: vi.fn(),
      })
    );

    expect(html).not.toContain('<button');
    expect(html).toContain('Verrouillé');
  });

  it('applique un effet inactif explicite (opacité réduite, désaturation et transition filter) sur ChapterCard', () => {
    const sampleChapter = {
      id: 'suites',
      title: 'Suites numériques',
      revisions: [{ id: 'rev-1', title: 'Cours', path: '/rev.json' }],
    } as never;
    const sampleStats = { quizCount: 10, exerciseCount: 8, hasRevision: true };

    const activeHtml = renderToStaticMarkup(
      React.createElement(ChapterCard, {
        chapter: sampleChapter,
        index: 0,
        chapterNumber: 1,
        stats: sampleStats,
      })
    );

    expect(activeHtml).toContain('transition-[transform,box-shadow,border-color,opacity,filter]');
    expect(activeHtml).not.toContain('opacity-60');
    expect(activeHtml).not.toContain('grayscale-[0.2]');

    const inactiveHtml = renderToStaticMarkup(
      React.createElement(ChapterCard, {
        chapter: sampleChapter,
        index: 1,
        chapterNumber: 2,
        stats: sampleStats,
        isInactive: true,
      })
    );

    expect(inactiveHtml).toContain('transition-[transform,box-shadow,border-color,opacity,filter]');
    expect(inactiveHtml).toContain('opacity-60');
    expect(inactiveHtml).toContain('grayscale-[0.2]');
    expect(inactiveHtml).toContain('hover:opacity-100');
    expect(inactiveHtml).toContain('hover:grayscale-0');
    expect(inactiveHtml).toContain('focus-within:opacity-100');
    expect(inactiveHtml).toContain('focus-within:grayscale-0');

    const upcomingHtml = renderToStaticMarkup(
      React.createElement(ChapterCard, {
        chapter: sampleChapter,
        index: 2,
        chapterNumber: 3,
        stats: sampleStats,
        isUpcoming: true,
      })
    );

    expect(upcomingHtml).toContain('opacity-50');
    expect(upcomingHtml).toContain('grayscale-[0.35]');
  });

  it('applique les styles inactifs sur ChapterListRow mobile et restaure l’opacité si déplié', () => {
    const sampleChapter = {
      id: 'limites',
      title: 'Limites et continuité',
      revisions: [{ id: 'rev-1', title: 'Cours', path: '/rev.json' }],
    } as never;
    const sampleStats = { quizCount: 6, exerciseCount: 5, hasRevision: true };

    const inactiveRowHtml = renderToStaticMarkup(
      React.createElement(ChapterListRow, {
        chapter: sampleChapter,
        index: 1,
        chapterNumber: 2,
        stats: sampleStats,
        isInactive: true,
      })
    );

    expect(inactiveRowHtml).toContain('opacity-60');
    expect(inactiveRowHtml).toContain('grayscale-[0.2]');
    expect(inactiveRowHtml).toContain('hover:opacity-100');
    expect(inactiveRowHtml).toContain('focus-within:opacity-100');

    const expandedInactiveRowHtml = renderToStaticMarkup(
      React.createElement(ChapterListRow, {
        chapter: sampleChapter,
        index: 1,
        chapterNumber: 2,
        stats: sampleStats,
        isInactive: true,
        defaultExpanded: true,
      })
    );

    expect(expandedInactiveRowHtml).toContain('opacity-100');
    expect(expandedInactiveRowHtml).toContain('grayscale-0');
    expect(expandedInactiveRowHtml).not.toContain('opacity-60');
  });
});
