import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  readActiveAccountSession: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: mocks.get,
    set: mocks.set,
    sadd: mocks.sadd,
    srem: mocks.srem,
    del: vi.fn(),
  },
  isAuthorized: vi.fn(),
  normalizeUrl: vi.fn((value: string) => value),
  buildNotifyPayload: vi.fn(),
  loadSubscribers: vi.fn(),
  sendToSubscribers: vi.fn(),
  cleanupExpired: vi.fn(),
  resolveClassSubscribers: vi.fn(),
  logHistory: vi.fn(),
  getHistory: vi.fn(),
  readActiveAccountSession: mocks.readActiveAccountSession,
}));

import handler from '../../api/push';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('/api/push subscribe identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(null);
  });

  it('rejects subscriptions without an authenticated account', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(null);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'subscribe' },
      body: { subscription: { endpoint: 'https://push.test/one' } },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('ignores forged identity fields and stores the active account identity', async () => {
    mocks.readActiveAccountSession.mockResolvedValue({
      user: {
        accountId: 'student-canonical',
        name: 'Nom canonique',
        classId: 'class-a',
        role: 'student',
      },
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'subscribe' },
      body: {
        subscription: { endpoint: 'https://push.test/two', keys: { auth: 'x' } },
        accountId: 'victim',
        studentName: 'Nom falsifié',
        classId: 'class-b',
      },
    }, res as any);

    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored).toMatchObject({
      accountId: 'student-canonical',
      studentName: 'Nom canonique',
      classId: 'class-a',
    });
    expect(mocks.sadd).toHaveBeenCalledWith('push:class:class-a', expect.any(String));
    expect(mocks.sadd).not.toHaveBeenCalledWith('push:class:class-b', expect.any(String));
  });

  it('does not put a professor account in the student push index', async () => {
    mocks.readActiveAccountSession.mockResolvedValue({
      user: { accountId: 'prof-1', name: 'Professeur', classId: 'class-a', role: 'prof' },
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'subscribe' },
      body: { subscription: { endpoint: 'https://push.test/professor' } },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'student_account_required' });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.sadd).not.toHaveBeenCalled();
  });

  it('rejects unsubscribe without a matching authenticated account', async () => {
    mocks.readActiveAccountSession.mockResolvedValue({
      user: { accountId: 'student-a', name: 'A', classId: 'c1', role: 'student' },
    });
    mocks.get.mockResolvedValue(JSON.stringify({
      accountId: 'student-b',
      classId: 'c1',
    }));
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'unsubscribe' },
      body: { endpoint: 'https://push.test/victim' },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });
});
