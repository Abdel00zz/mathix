import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  readActiveAccountSession: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: mocks.get,
    set: mocks.set,
    pipeline: vi.fn(),
  },
  isAdmin: vi.fn(() => false),
  isValidPhone: vi.fn((phone: string) => /^\+\d{8,15}$/.test(phone)),
  normalizePhone: vi.fn((phone: unknown) => String(phone || '').replace(/\s/g, '')),
  readActiveAccountSession: mocks.readActiveAccountSession,
}));

import handler from '../../api/progress';

const response = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

const ownIdentity = {
  user: { phone: '+212612345678', classId: 'tc-sc' },
};

describe('/api/progress account isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unauthenticated progress load before querying Redis', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(null);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'load' },
      body: { phone: '+212612345678', classId: 'tc-sc' },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'account_session_required' });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('rejects a request targeting another student or class before querying Redis', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(ownIdentity);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'load' },
      body: { phone: '+212699999999', classId: '2bac-sm' },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_account_mismatch' });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated concours write before touching Redis', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(null);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'concours' },
      body: { phone: '+212612345678', classId: 'tc-sc', concoursProgress: { totalExams: 99 } },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects a concours write aimed at another student', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(ownIdentity);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'concours' },
      body: { phone: '+212699999999', classId: 'tc-sc', concoursProgress: { totalExams: 99 } },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_account_mismatch' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('writes concours progress under the session identity, not the body', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(ownIdentity);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'concours' },
      // Le client envoie son numéro avec des espaces : la clé reste canonique.
      body: { phone: '+212 612 345 678', classId: 'tc-sc', concoursProgress: { totalExams: 3 } },
    } as any, res as any);

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set.mock.calls[0][0]).toBe('concours:tc-sc:+212612345678');
    expect(JSON.parse(mocks.set.mock.calls[0][1])).toMatchObject({ totalExams: 3 });
  });

  it('refuses an oversized concours payload', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(ownIdentity);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'concours' },
      body: { concoursProgress: { attempts: 'x'.repeat(250_000) } },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('loads progress only from the authenticated account key', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(ownIdentity);
    mocks.get.mockResolvedValue(null);
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'load' },
      body: { phone: '+212612345678', classId: 'tc-sc' },
    } as any, res as any);

    expect(mocks.get).toHaveBeenCalledWith('progress:tc-sc:+212612345678');
    expect(res.json).toHaveBeenCalledWith({ found: false });
  });
});
