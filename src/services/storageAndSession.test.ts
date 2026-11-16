import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storageService } from './storageService';
import { accountSessionService } from './accountSessionService';
import { isSameUserIdentity } from '../hooks/useGlobalProgress';

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
  };
}

describe('storageService & accountSessionService isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const ls = makeMemoryStorage();
    const ss = makeMemoryStorage();
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('sessionStorage', ss);
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('annule les écritures différées et purge les caches utilisateur lors d’un clear()', () => {
    const initial = storageService.loadState();
    const state = {
      ...initial,
      user: { name: 'Amine', phone: '+212612345678', classId: '2bac-sm', className: '2ème Bac SM' },
      isSessionActive: true,
    };

    localStorage.setItem('mathplus:prof-session', 'pc');
    localStorage.setItem('mathplus:study-sessions:v1', 'rev-1');
    localStorage.setItem('mathplus:quiz-pending:ch1', '{"score":5}');
    sessionStorage.setItem('chapter_cache_2bac-sm_ch1', '{"id":"ch1"}');

    storageService.saveState(state as any);
    storageService.clear();
    vi.advanceTimersByTime(1000);

    expect(storageService.loadState().user).toBeNull();
    expect(storageService.loadState().progress).toEqual({});
    expect(localStorage.getItem('mathplus:prof-session')).toBeNull();
    expect(localStorage.getItem('mathplus:study-sessions:v1')).toBeNull();
    expect(localStorage.getItem('mathplus:quiz-pending:ch1')).toBeNull();
    expect(sessionStorage.getItem('chapter_cache_2bac-sm_ch1')).toBeNull();
  });

  it('distingue 401 (unauthenticated) d’une panne réseau (offline) dans getCurrentUserStatus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ status: 401, ok: false }));
    expect(await accountSessionService.getCurrentUserStatus()).toEqual({ status: 'unauthenticated' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network_down')));
    expect(await accountSessionService.getCurrentUserStatus()).toEqual({ status: 'offline' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ found: true, user: { name: 'Salma', classId: 'tc-sc', role: 'student', accountId: 'acc-1' } }),
    }));
    expect(await accountSessionService.getCurrentUserStatus()).toEqual({
      status: 'authenticated',
      user: expect.objectContaining({ name: 'Salma', classId: 'tc-sc', role: 'student', accountId: 'acc-1' }),
    });
  });

  it('reconnaît une identité commune avec indicatifs + et 00 ainsi que par accountId', () => {
    expect(isSameUserIdentity(
      { name: 'A', phone: '+212612345678', classId: 'c1', className: 'Classe 1' },
      { name: 'A', phone: '00212 612-345-678', classId: 'c1', className: 'Classe 1' },
    )).toBe(true);

    expect(isSameUserIdentity(
      { name: 'A', phone: '+212612345678', classId: 'c1', className: 'Classe 1', accountId: 'acc-1' },
      { name: 'A', phone: '+212612345678', classId: 'c1', className: 'Classe 1', accountId: 'acc-2' },
    )).toBe(false);
  });
});
