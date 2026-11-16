import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../i18n/translations';
import LoadingSpinner from './LoadingSpinner';
import { LOADING_DURATION_MS, inferLoadingContext } from './loadingConfig';

const locale = vi.hoisted(() => ({ lang: 'fr' as 'fr' | 'ar' }));
vi.mock('../../i18n/I18nContext', () => ({
  useI18n: () => ({
    lang: locale.lang,
    dir: locale.lang === 'ar' ? 'rtl' : 'ltr',
    setLang: vi.fn(),
    t: (key: keyof typeof translations.fr) => translations[locale.lang][key],
  }),
}));

afterEach(() => {
  locale.lang = 'fr';
});

describe('LoadingSpinner (page de chargement unique)', () => {
  it('utilise une durée anti-clignotement courte sans gel de 1500 ms', () => {
    expect(LOADING_DURATION_MS).toBeGreaterThanOrEqual(200);
    expect(LOADING_DURATION_MS).toBeLessThanOrEqual(500);
  });

  it('infère correctement les contextes à partir des libellés hérités', () => {
    expect(inferLoadingContext('Chargement du dashboard')).toBe('dashboard');
    expect(inferLoadingContext('Préparation de la leçon')).toBe('lesson');
    expect(inferLoadingContext('Préparation des exercices')).toBe('exercise');
    expect(inferLoadingContext('Chargement du cadre référentiel')).toBe('framework');
    expect(inferLoadingContext('Chargement du studio')).toBe('studio');
  });

  it('rend la page unifiée plein écran avec la barre fluide unique', () => {
    const html = renderToStaticMarkup(h(LoadingSpinner, { context: 'lesson', audience: 'student' }));
    expect(html).toContain('mp-loading-page');
    expect(html).toContain('mp-loading-brand');
    expect(html).toContain('mp-loading-track');
    expect(html).toContain('mp-loading-bar');
    expect(html).toContain('Préparation de la leçon');
    expect(html).not.toContain('learning-loading-lines');
  });

  it('rend la version arabe en RTL avec le logo arabe dédié', () => {
    locale.lang = 'ar';
    const html = renderToStaticMarkup(h(LoadingSpinner, { context: 'concours', audience: 'professor' }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('mp-loading-brand--ar');
    expect(html).toContain('/logo-ar.png');
    expect(html).toContain('جارٍ إعداد مباراة الولوج');
  });

  it('rend le mode section compact pour les panneaux internes et Suspense imbriqués', () => {
    const html = renderToStaticMarkup(
      h(LoadingSpinner, { variant: 'section', context: 'studio', audience: 'professor' }),
    );
    expect(html).toContain('mp-loading-track--compact');
    expect(html).toContain('Chargement du studio');
    expect(html).not.toContain('min-h-dvh');
  });
});
