import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  hgetall: vi.fn(),
  eval: vi.fn(),
  isAdmin: vi.fn(),
  readActiveAccountSession: vi.fn(),
  readActiveProfessorSession: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: mocks.get,
    hgetall: mocks.hgetall,
    eval: mocks.eval,
    lpush: vi.fn(),
    ltrim: vi.fn(),
  },
  isAdmin: mocks.isAdmin,
  readActiveAccountSession: mocks.readActiveAccountSession,
  readActiveProfessorSession: mocks.readActiveProfessorSession,
}));

import handler from '../../api/content';

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('/api/content class isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(false);
    mocks.readActiveAccountSession.mockResolvedValue(null);
  });

  it('does not let the active session class extend professor write access', async () => {
    mocks.readActiveProfessorSession.mockResolvedValue({
      accountId: 'prof-1', phone: '+212600000000', classId: 'class-b', role: 'prof',
    });
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') {
        return { profClassScope: 'selected', profClasses: ['class-a'] };
      }
      // Une ancienne implémentation lisait ici la séance active `class-b`.
      if (key.includes(':session')) return { classId: 'class-b' };
      return null;
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'save' },
      headers: { 'x-content-actor': 'professor' },
      body: { path: 'data/class-b/chapter/manifest.json', content: {} },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.eval).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalledWith(expect.stringContaining(':session'));
  });

  it('keeps a professor publication private when an admin secret is residual', async () => {
    mocks.isAdmin.mockReturnValue(true);
    mocks.readActiveProfessorSession.mockResolvedValue({
      accountId: 'prof-1', phone: '+212600000000', classId: 'class-a', role: 'prof',
    });
    mocks.get.mockImplementation(async (key: string) => (
      key === 'user:id:prof-1'
        ? { profClassScope: 'selected', profClasses: ['class-a'] }
        : null
    ));
    mocks.eval.mockResolvedValue(123);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'save' },
      headers: { 'x-admin-secret': 'still-in-tab' },
      body: { path: 'data/class-a/chapter/manifest.json', content: {} },
    }, res as any);

    const saveKeys = mocks.eval.mock.calls[0][1] as string[];
    expect(saveKeys[0]).toMatch(/^content:files:prof:/);
    expect(saveKeys[0]).not.toBe('content:files');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('exposes only the student level from the linked professor manifest', async () => {
    mocks.readActiveProfessorSession.mockResolvedValue(null);
    mocks.readActiveAccountSession.mockResolvedValue({
      user: { role: 'student', classId: 'class-a', profId: 'prof-1' },
    });
    mocks.get.mockResolvedValue({ role: 'prof', phone: '+212600000000' });
    mocks.hgetall.mockImplementation(async (key: string) => {
      if (key === 'content:files') return { 'data/global.json': 1 };
      return {
        'data/classes/class-a.json': 2,
        'data/class-a/chapter/manifest.json': 3,
        'data/classes/class-b.json': 4,
        'data/class-b/chapter/manifest.json': 5,
      };
    });
    const res = response();

    await handler({ method: 'GET', query: { action: 'manifest' }, headers: {} }, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      files: {
        'data/global.json': 1,
        'data/classes/class-a.json': 2,
        'data/class-a/chapter/manifest.json': 3,
      },
    });
  });

  it('falls back to official content instead of reading another student level override', async () => {
    mocks.readActiveProfessorSession.mockResolvedValue(null);
    mocks.readActiveAccountSession.mockResolvedValue({
      user: { role: 'student', classId: 'class-a', profId: 'prof-1' },
    });
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { role: 'prof', phone: '+212600000000' };
      if (key === 'content:file:data/class-b/chapter/manifest.json') return { source: 'official' };
      if (key.includes(':data/class-b/')) return { source: 'private-class-b' };
      return null;
    });
    const res = response();

    await handler({
      method: 'GET',
      query: { action: 'file', path: 'data/class-b/chapter/manifest.json' },
      headers: {},
    }, res as any);

    expect(res.json).toHaveBeenCalledWith({ source: 'official' });
    expect(mocks.get.mock.calls.some(([key]) => /^content:file:prof:.*:data\/class-b\//.test(String(key)))).toBe(false);
  });
});
