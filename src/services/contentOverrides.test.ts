import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('published content during outages', () => {
  it('keeps the last manifest on network/server failures but accepts an intentional empty manifest', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ files: { 'data/test.json': 12 } }) })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    const service = await import('./contentOverrides');
    await service.initContentOverrides();
    await service.refreshContentOverrides();
    expect(await service.resolveDataUrl('data/test.json')).toContain('v=12');
    await service.refreshContentOverrides();
    expect(await service.resolveDataUrl('data/test.json')).toContain('v=12');
    await service.refreshContentOverrides();
    expect(await service.resolveDataUrl('data/test.json')).toBe('data/test.json');
  });
});
