import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_DENSITY_CAP, isFullscreenActive, renderDensity } from './renderDensity';

/** Remplace les globals du navigateur par le strict nécessaire. */
function stubBrowser(options: { fullscreen?: 'standard' | 'webkit' | 'ms' | null; dpr?: number } = {}) {
  const { fullscreen = null, dpr = 1 } = options;
  const element = fullscreen === 'standard'
    ? { fullscreenElement: {} }
    : fullscreen === 'webkit'
      ? { webkitFullscreenElement: {} }
      : fullscreen === 'ms'
        ? { msFullscreenElement: {} }
        : { fullscreenElement: null };
  vi.stubGlobal('document', element);
  vi.stubGlobal('window', { devicePixelRatio: dpr });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('détection du plein écran', () => {
  it('n’est pas actif en fenêtre', () => {
    stubBrowser();
    expect(isFullscreenActive()).toBe(false);
  });

  it('reconnaît les préfixes vendeur', () => {
    stubBrowser({ fullscreen: 'webkit' });
    expect(isFullscreenActive()).toBe(true);
    stubBrowser({ fullscreen: 'ms' });
    expect(isFullscreenActive()).toBe(true);
  });

  it('reste inactif sans document (rendu hors navigateur)', () => {
    stubBrowser({ fullscreen: 'standard' });
    vi.stubGlobal('document', undefined);
    expect(isFullscreenActive()).toBe(false);
  });
});

describe('densité de rendu des canvas', () => {
  it('conserve le plafond du composant hors plein écran', () => {
    // Dalle 3× : le plafond de 2 protège la mémoire (une dizaine de canvas/fiche).
    stubBrowser({ dpr: 3 });
    expect(renderDensity(2)).toBe(2);
    expect(renderDensity(2.5)).toBe(2.5);
  });

  it('relève le plafond en plein écran, jusqu’à la densité réelle', () => {
    stubBrowser({ fullscreen: 'standard', dpr: 3 });
    expect(renderDensity(2)).toBe(FULLSCREEN_DENSITY_CAP);
    expect(renderDensity(2.5)).toBe(FULLSCREEN_DENSITY_CAP);
  });

  it('ne sur-échantillonne jamais au-delà de la dalle', () => {
    stubBrowser({ fullscreen: 'standard', dpr: 2 });
    expect(renderDensity(2)).toBe(2);
    stubBrowser({ fullscreen: 'standard', dpr: 1 });
    expect(renderDensity(2)).toBe(1);
  });

  it('garde un minimum de 1 pixel CSS par pixel logique', () => {
    stubBrowser({ dpr: 0.75 });
    expect(renderDensity(2)).toBe(1);
    stubBrowser({ dpr: 0 });
    expect(renderDensity(2)).toBe(1);
  });

  it('se contente de 1 sans navigateur', () => {
    stubBrowser();
    vi.stubGlobal('window', undefined);
    expect(renderDensity(2)).toBe(1);
  });
});
