import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CourseBlock from './CourseBlock';

const locale = vi.hoisted(() => ({ arabic: false }));
vi.mock('../../i18n/I18nContext', () => ({
    useI18n: () => ({
        dir: locale.arabic ? 'rtl' : 'ltr',
        t: (key: string) => key === 'common.show' ? (locale.arabic ? 'إظهار' : 'Afficher') : 'Masquer',
    }),
}));
vi.mock('./FocusModeContext', () => ({ useFocusMode: () => ({ focusBlock: vi.fn() }) }));
vi.mock('../MathRenderer', () => ({ default: ({ content }: { content: string }) => React.createElement('span', null, content) }));
vi.mock('../MediaRenderer', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

describe('CourseBlock shared reveal control', () => {
    beforeEach(() => { locale.arabic = false; });

    it('keeps a titled text question visible and its answer initially hidden', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'text', title: 'Quand une fonction est-elle continue ?', content: 'Résultat à découvrir' },
        }));
        expect(html).toContain('revision-text-question-row');
        expect(html).toContain('Quand une fonction est-elle continue ?');
        expect(html).toContain('Afficher');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain('aria-hidden="true" inert=""');
        expect(html).not.toContain('Résultat à découvrir');
        const target = html.match(/aria-controls="([^"]+)"/)?.[1];
        expect(target).toBeTruthy();
        expect(html).toContain(`id="${target}"`);
    });

    it.each([undefined, '', '   '])('keeps untitled text visible (%s)', (title) => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'text', title, content: 'Transition toujours visible' },
        }));
        expect(html).toContain('Transition toujours visible');
        expect(html).not.toContain('aria-expanded');
    });

    it('retains the same reveal button for existing property boxes', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'property', title: 'Quelle propriété utiliser ?', content: 'Propriété masquée' },
        }));
        expect(html).toContain('revision-reveal-toggle');
        expect(html).toContain('revision-reveal-chevron');
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain('Propriété masquée');
    });

    it('translates only the control while keeping pedagogical text LTR', () => {
        locale.arabic = true;
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'text', title: 'Quelle est la limite ?', content: 'Contenu français' },
        }));
        expect(html).toContain('dir="ltr" lang="fr"');
        expect(html).toContain('<button type="button" dir="rtl"');
        expect(html).toContain('إظهار');
        expect(html).toContain('Quelle est la limite ?');
    });

    it('renders warning block with compact titled header without badge pill or left bar', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'warning', title: 'Erreur fréquente', content: 'Ne pas confondre avec...' },
        }));
        expect(html).toContain('revision-warning-header');
        expect(html).toContain('revision-warning-label');
        expect(html).toContain('Attention');
        expect(html).toContain('—');
        expect(html).toContain('Erreur fréquente');
        expect(html).not.toContain('revision-warning-dash');
        expect(html).not.toContain('revision-badge');
        expect(html).not.toContain('revision-warning-trait');
        expect(html).toContain('revision-course-block-warning');
    });

    it('renders warning block without title using compact label and no badge', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: { type: 'warning', content: 'Attention immédiate' },
        }));
        expect(html).toContain('revision-warning-header');
        expect(html).toContain('revision-warning-label');
        expect(html).toContain('Attention');
        expect(html).not.toContain('revision-warning-dash');
        expect(html).not.toContain('revision-badge');
        expect(html).not.toContain('—');
        expect(html).not.toContain('revision-warning-trait');
    });

    it('renders application example with compact correction button and chevron', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: {
                type: 'application',
                title: 'Exercice 1',
                content: '\\question{Énoncé du problème ?}\n\n\\textbf{Correction.}\nSolution détaillée du problème.',
            },
        }));
        expect(html).toContain('revision-correction-toggle');
        expect(html).toContain('revision-correction-chevron');
    });

    it('renders method block without method badge and with left-aligned clickable question trigger', () => {
        const html = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: {
                type: 'method',
                title: 'Comment déterminer la continuité en un point ?',
                content: 'Étape 1 : calculer la limite.',
            },
            number: 1,
        }));
        expect(html).not.toContain('revision-badge-method');
        expect(html).not.toContain('revision-reveal-badge-row');
        expect(html).toContain('revision-method-header');
        expect(html).toContain('revision-method-cue');
        expect(html).toContain('role="button"');
        expect(html).toContain('Comment déterminer la continuité en un point');
        expect(html).toContain('revision-question-mark');
        expect(html).toContain('typo-display');
        expect(html).not.toContain('revision-method-content-centered');
        expect(html).not.toContain('text-center');
        expect(html).not.toContain('mx-auto');
    });

    it('uses unified display typography for definition, method, and application titles', () => {
        const defHtml = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: {
                type: 'definition',
                title: 'Qu est-ce qu une fonction continue ?',
                content: 'Définition formelle.',
            },
        }));
        expect(defHtml).toContain('<h3 class="typo-display');

        const appHtml = renderToStaticMarkup(React.createElement(CourseBlock, {
            block: {
                type: 'application',
                title: 'Exercice 1',
                content: '\\question{Calculer la limite en 0.}',
            },
        }));
        expect(appHtml).toContain('<h4 class="typo-display');
        expect(appHtml).toContain('revision-application-content');
    });
});
