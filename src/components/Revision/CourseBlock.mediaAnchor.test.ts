import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CourseBlock from './CourseBlock';

/**
 * L'association d'une figure décide de sa visibilité.
 *
 * Une figure d'énoncé (à lire pour pouvoir répondre) ne doit pas disparaître
 * avec la réponse ; une figure de contenu se découvre avec elle. Le média est
 * simulé : ce qui compte est l'endroit de l'arbre où il atterrit.
 */
const prefs = vi.hoisted(() => ({ showBlockTitles: true }));

vi.mock('../../i18n/I18nContext', () => ({
  useI18n: () => ({ dir: 'ltr', t: (key: string) => (key === 'common.correction' ? 'Correction' : 'Afficher') }),
}));
vi.mock('./FocusModeContext', () => ({ useFocusMode: () => ({ focusBlock: vi.fn() }) }));
vi.mock('../../hooks/useProfPersonalization', () => ({
  useProfPersonalization: () => ({ revision: { showBlockTitles: prefs.showBlockTitles, paperTheme: 'light' }, canvas: { enabled: false } }),
}));
vi.mock('../MathRenderer', () => ({ default: ({ content }: { content: string }) => React.createElement('span', null, content) }));
vi.mock('../MediaRenderer', () => ({
  default: ({ media, children }: { media?: { src: string; additionalImages?: Array<{ src: string }> }; children?: React.ReactNode }) => {
    const sources = media ? [media.src, ...(media.additionalImages || []).map(image => image.src)] : [];
    return React.createElement('div', null,
      ...sources.map(src => React.createElement('span', { key: src, 'data-media': src })),
      sources.length ? null : React.createElement('span', { 'data-media': 'aucun' }),
      children,
    );
  },
}));

const at = (html: string, needle: string) => html.indexOf(needle);

describe('CourseBlock — figure associée à l’énoncé ou au contenu', () => {
  beforeEach(() => { prefs.showBlockTitles = true; });

  it('garde la figure d’énoncé d’une propriété hors du repli', () => {
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'property',
        title: 'Que peut-on lire sur cette figure ?',
        content: 'Réponse cachée',
        media: { src: '/enonce.png', position: 'right', anchor: 'lead' },
      },
    } as never));

    // Rendue AVANT le panneau replié : visible sans rien ouvrir.
    expect(at(html, 'data-media="/enonce.png"')).toBeGreaterThan(-1);
    expect(at(html, 'data-media="/enonce.png"')).toBeLessThan(at(html, 'revision-reveal-grid'));
    // Le « ? » des blocs-question est rendu à part : on teste le libellé nu.
    expect(html).toContain('Que peut-on lire sur cette figure');
  });

  it('cache la figure de contenu tant que le bloc n’est pas révélé', () => {
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'property',
        title: 'Quelle est la limite ?',
        content: 'La limite vaut 2',
        media: { src: '/reponse.png', position: 'inline-right', anchor: 'content' },
      },
    } as never));

    expect(html).not.toContain('/reponse.png');
    expect(html).not.toContain('La limite vaut 2');
  });

  it('place une figure historique de propriété dans le contenu, comme avant', () => {
    // Aucune association écrite : les fiches publiées ne changent pas de rendu.
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'property',
        title: 'Propriété illustrée',
        content: 'Contenu à découvrir',
        media: { src: '/ancienne.png', position: 'inline-right' },
      },
    } as never));

    expect(html).not.toContain('/ancienne.png');
    expect(html).not.toContain('Contenu à découvrir');
  });

  it('ne perd aucune figure quand les titres de blocs sont masqués', () => {
    // Réglage tablette « Afficher les titres des blocs » décoché : plus de titre
    // ni de repli. La figure d'énoncé ne doit pas disparaître pour autant.
    prefs.showBlockTitles = false;
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'property',
        title: 'Titre masqué',
        content: 'Contenu visible',
        media: {
          src: '/enonce.png',
          position: 'right',
          anchor: 'lead',
          additionalImages: [{ src: '/reponse.png', position: 'inline-right', anchor: 'content' }],
        },
      },
    } as never));

    expect(html).toContain('data-media="/enonce.png"');
    expect(html).toContain('data-media="/reponse.png"');
    expect(html).toContain('Contenu visible');
  });

  it('répartit les deux zones d’un exercice d’application de part et d’autre', () => {
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'application',
        content: '\\qst{Calculer la limite.}\\par\\smallskip On factorise puis on simplifie.',
        media: {
          src: '/enonce-app.png',
          position: 'right',
          anchor: 'lead',
          additionalImages: [{ src: '/correction-app.png', position: 'bottom', anchor: 'content' }],
        },
      },
    } as never));

    // Énoncé : avant le filet de correction. Correction : après lui.
    expect(at(html, 'data-media="/enonce-app.png"')).toBeGreaterThan(-1);
    expect(at(html, 'data-media="/correction-app.png"')).toBeGreaterThan(at(html, 'revision-application-correction-divider'));
    expect(at(html, 'data-media="/enonce-app.png"')).toBeLessThan(at(html, 'revision-application-correction-divider'));
  });

  it('garde la figure d’une activité visible, sans zone à choisir', () => {
    const html = renderToStaticMarkup(React.createElement(CourseBlock, {
      block: {
        type: 'exploration',
        title: 'Activité',
        content: 'Chercher…',
        media: { src: '/activite.png', position: 'float-right' },
      },
    } as never));

    expect(html).toContain('data-media="/activite.png"');
    expect(html).not.toContain('revision-reveal-grid');
  });
});
