import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateAdminContentSession, profContentService } from './profContentService';

describe('profContentService actor selection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignores a residual admin secret unless admin mode was explicitly activated', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => 'residual-secret'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ updatedAt: 123 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await profContentService.save('data/class-a/chapter/manifest.json', {});

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-content-actor': 'professor',
    });
  });

  it('sends admin credentials only inside an explicit admin content session', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ updatedAt: 123 }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const release = activateAdminContentSession('admin-secret');
    try {
      await profContentService.save('data/class-a/chapter/manifest.json', {});
    } finally {
      release();
    }

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-content-actor': 'admin',
      'x-admin-secret': 'admin-secret',
    });
  });
});
