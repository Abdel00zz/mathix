import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CourseBlock from './CourseBlock';
import { FocusOverlay } from './FocusOverlay';

const prefs = vi.hoisted(() => ({
  showBlockTitles: true,
  showSolutions: true,
  paperTheme: 'classic',
  textScale: 1,
  progressiveReveal: false,
}));

const focusState = vi.hoisted(() => ({
  focusedBlock: null as null | { block: { type: string; content: string; title?: string }; number?: number },
  clearFocus: vi.fn(),
}));

vi.mock('./FocusModeContext', () => ({
  useFocusMode: () => ({
    focusBlock: vi.fn(),
    focusedBlock: focusState.focusedBlock,
    clearFocus: focusState.clearFocus,
  }),
}));

vi.mock('../../i18n/I18nContext', () => ({
  useI18n: () => ({
    dir: 'ltr',
    t: (key: string) => (key === 'common.correction' ? 'Correction' : key),
  }),
}));

vi.mock('../../hooks/useProfPersonalization', () => ({
  useProfPersonalization: () => ({
    revision: {
      showBlockTitles: prefs.showBlockTitles,
      showSolutions: prefs.showSolutions,
      paperTheme: prefs.paperTheme,
      textScale: prefs.textScale,
      progressiveReveal: prefs.progressiveReveal,
    },
    canvas: { enabled: false, showBlanks: true },
  }),
}));

vi.mock('../MathRenderer', () => ({
  default: ({ content }: { content: string }) => React.createElement('span', null, content),
}));

vi.mock('../MediaRenderer', () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}));

describe('Revision prof personalization wiring', () => {
  beforeEach(() => {
    prefs.showBlockTitles = true;
    prefs.showSolutions = true;
    prefs.paperTheme = 'classic';
    prefs.textScale = 1;
    prefs.progressiveReveal = false;
    focusState.focusedBlock = null;
  });

  it('hides standalone solution blocks when showSolutions is false', () => {
    const solutionBlock = {
      type: 'solution',
      content: 'Résultat final : 42',
    } as never;

    const visibleHtml = renderToStaticMarkup(React.createElement(CourseBlock, { block: solutionBlock }));
    expect(visibleHtml).toContain('revision-reveal-solution');

    prefs.showSolutions = false;
    const hiddenHtml = renderToStaticMarkup(React.createElement(CourseBlock, { block: solutionBlock }));
    expect(hiddenHtml).toBe('');
  });

  it('keeps question statement but strips correction drawer on application blocks when showSolutions is false', () => {
    const applicationBlock = {
      type: 'application',
      content: '\\question{Calculer la limite en 0.} Réponse détaillée : la limite vaut 1.',
    } as never;

    const visibleHtml = renderToStaticMarkup(React.createElement(CourseBlock, { block: applicationBlock }));
    expect(visibleHtml).toContain('Calculer la limite en 0.');
    expect(visibleHtml).toContain('Réponse détaillée : la limite vaut 1.');

    prefs.showSolutions = false;
    const questionOnlyHtml = renderToStaticMarkup(React.createElement(CourseBlock, { block: applicationBlock }));
    expect(questionOnlyHtml).toContain('Calculer la limite en 0.');
    expect(questionOnlyHtml).not.toContain('Réponse détaillée : la limite vaut 1.');
  });

  it('applies revision.textScale on FocusOverlay content font size', () => {
    focusState.focusedBlock = {
      block: { type: 'theorem', content: 'Théorème test' },
      number: 1,
    };

    const defaultHtml = renderToStaticMarkup(React.createElement(FocusOverlay));
    expect(defaultHtml).toContain('calc(1.08rem * var(--reading-doc-scale, 1))');

    prefs.textScale = 1.25;
    const scaledHtml = renderToStaticMarkup(React.createElement(FocusOverlay));
    expect(scaledHtml).toContain('calc(1.08rem * var(--reading-doc-scale, 1) * 1.25)');
  });

  it('gives flat-revealed method blocks the exact same core-reveal-content-balance class as definition', () => {
    prefs.showBlockTitles = false;

    const definitionHtml = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: { type: 'definition', title: 'Définition', content: 'Contenu définition' },
    }));
    const methodHtml = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: { type: 'method', title: 'Méthode', content: 'Étape 1 : vérifier.' },
    }));

    expect(definitionHtml).toContain('core-reveal-content-balance');
    expect(methodHtml).toContain('core-reveal-content-balance');
    expect(methodHtml).not.toContain('revision-method-content-centered');
  });
});
