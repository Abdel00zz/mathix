import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FocusOverlay } from './FocusOverlay';

const focusState = vi.hoisted(() => ({
  focusedBlock: null as null | { block: { type: string; content: string; title?: string }; number?: number },
  clearFocus: vi.fn(),
}));

vi.mock('./FocusModeContext', () => ({
  useFocusMode: () => focusState,
}));

vi.mock('../MathRenderer', () => ({
  default: ({ content }: { content: string }) => React.createElement('span', null, content),
}));

vi.mock('../../i18n/I18nContext', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

vi.mock('../../hooks/useProfPersonalization', () => ({
  useProfPersonalization: () => ({
    revision: { progressiveReveal: false },
    canvas: { showBlanks: true },
  }),
}));

describe('FocusOverlay', () => {
  it('renders empty when no block is focused', () => {
    focusState.focusedBlock = null;
    const html = renderToStaticMarkup(React.createElement(FocusOverlay));
    expect(html).toBe('');
  });

  it('renders accessible dialog with rounded calm styling and no runtime style tag when focused', () => {
    focusState.focusedBlock = {
      block: { type: 'theorem', content: 'Contenu théorème' },
      number: 2,
    };
    const html = renderToStaticMarkup(React.createElement(FocusOverlay));
    expect(html).toContain('id="focused-card"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Contenu théorème');
    expect(html).toContain('rounded-full');
    expect(html).not.toContain('<style');
  });
});
