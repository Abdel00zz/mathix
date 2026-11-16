import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idleBackoffFactor } from './syncPrefs';

const MINUTE = 60_000;

beforeEach(() => {
  // Évite le localStorage expérimental de Node : la préférence est « absente ».
  vi.stubGlobal('localStorage', { getItem: () => null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('idleBackoffFactor', () => {
  it('garde la cadence normale tant que la tablette est active', () => {
    expect(idleBackoffFactor(0, false)).toBe(1);
    expect(idleBackoffFactor(119_000, false)).toBe(1);
  });

  it('ralentit ×2 après 2 min sans changement, ×4 après 10 min', () => {
    expect(idleBackoffFactor(2 * MINUTE, false)).toBe(2);
    expect(idleBackoffFactor(9 * MINUTE, false)).toBe(2);
    expect(idleBackoffFactor(10 * MINUTE, false)).toBe(4);
    expect(idleBackoffFactor(3 * 60 * MINUTE, false)).toBe(4);
  });

  it('ne ralentit jamais pendant une séance en cours', () => {
    expect(idleBackoffFactor(30 * MINUTE, true)).toBe(1);
  });

  it('respecte la synchronisation rapide choisie par le professeur', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => (key === 'mathplus:prof-fast-sync' ? '1' : null) });
    expect(idleBackoffFactor(30 * MINUTE, false)).toBe(1);
  });
});
