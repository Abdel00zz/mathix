import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadAfterChunkFailure } from './lazyWithRetry';

/** `sessionStorage` minimal, avec un drapeau pour simuler son indisponibilité. */
const makeStorage = (available = true) => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if (!available) throw new Error('storage disabled');
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (!available) throw new Error('storage disabled');
      map.set(key, value);
    },
    _map: map,
  };
};

const reload = vi.fn();

const installWindow = (storage: ReturnType<typeof makeStorage>) => {
  (globalThis as any).window = { sessionStorage: storage, location: { reload } };
};

describe('reloadAfterChunkFailure', () => {
  beforeEach(() => {
    reload.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
  });

  it('recharge la première fois que la page tombe sur un chunk disparu', () => {
    installWindow(makeStorage());
    expect(reloadAfterChunkFailure()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne recharge pas deux fois dans la même fenêtre (pas de boucle)', () => {
    installWindow(makeStorage());
    reloadAfterChunkFailure();
    vi.setSystemTime(new Date('2026-09-12T10:00:10Z')); // 10 s plus tard
    expect(reloadAfterChunkFailure()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('autorise un nouveau rechargement après la fenêtre de garde', () => {
    installWindow(makeStorage());
    reloadAfterChunkFailure();
    vi.setSystemTime(new Date('2026-09-12T10:01:00Z')); // 60 s plus tard
    expect(reloadAfterChunkFailure()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('ne tente rien si le stockage est indisponible', () => {
    installWindow(makeStorage(false));
    expect(reloadAfterChunkFailure()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
