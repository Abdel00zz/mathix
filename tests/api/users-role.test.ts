import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  sadd: vi.fn(),
  srem: vi.fn(),
  smembers: vi.fn(),
  eval: vi.fn(),
  expire: vi.fn(),
  readAccountSession: vi.fn(),
  readActiveAccountSession: vi.fn(),
  issueAccountSession: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  ACCOUNT_SESSION_COOKIE: 'account',
  PROFESSOR_SESSION_COOKIE: 'professor',
  deriveLegacyAccountId: vi.fn((phone: string) => `legacy:${phone}`),
  hashPassword: mocks.hashPassword,
  isAdmin: vi.fn(() => false),
  isValidPassword: vi.fn((pw: unknown) => typeof pw === 'string' && pw.length >= 6 && pw.length <= 128),
  isValidPhone: vi.fn((phone: unknown) => typeof phone === 'string' && /^\+\d{8,15}$/.test(phone)),
  issueAccountSession: mocks.issueAccountSession,
  normalizePhone: vi.fn((phone: unknown) => String(phone || '').replace(/\s+/g, '')),
  phoneAliasVariants: vi.fn((phone: string) => [phone]),
  readAccountSession: mocks.readAccountSession,
  readActiveAccountSession: mocks.readActiveAccountSession,
  readActiveProfessorSession: vi.fn(),
  readProfessorSession: vi.fn(),
  redis: {
    get: mocks.get,
    set: mocks.set,
    del: mocks.del,
    sadd: mocks.sadd,
    srem: mocks.srem,
    smembers: mocks.smembers,
    eval: mocks.eval,
    expire: mocks.expire,
  },
  resend: null,
  verifyPassword: mocks.verifyPassword,
}));

import handler, { resolveRegistrationTarget, SET_ROLE_SCRIPT } from '../../api/users';

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('professor role promotion policy & auth hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(null);
    mocks.eval.mockResolvedValue(1);
    mocks.issueAccountSession.mockReturnValue('signed-cookie-token');
  });

  it('initializes every student-to-professor promotion with no class access and revokes on student demotion', () => {
    expect(SET_ROLE_SCRIPT).toContain("if nextRole == 'prof' then");
    expect(SET_ROLE_SCRIPT).toContain("user.profClassScope = 'none'");
    expect(SET_ROLE_SCRIPT).toContain('user.profClasses = {}');
    expect(SET_ROLE_SCRIPT).toContain('user.requestedRole = nextRole');
    expect(SET_ROLE_SCRIPT).toContain("if nextRole == 'student' then");
    expect(SET_ROLE_SCRIPT).toContain('user.authVersion');
  });

  it('isole une inscription professeur sans lui demander de classe', () => {
    expect(resolveRegistrationTarget('prof', 'account-42', '', '')).toEqual({
      professorRequest: true,
      classId: 'prof-pending:account-42',
      className: 'Activation professeur en attente',
    });
    expect(resolveRegistrationTarget('student', 'account-42', '2bac-sm', '2e Bac SM')).toEqual({
      professorRequest: false,
      classId: '2bac-sm',
      className: '2e Bac SM',
    });
  });

  it('rejects unauthenticated profile updates (PUT register) without pre-auth lookup and clears stale cookie', async () => {
    mocks.readActiveAccountSession.mockResolvedValue(null);
    const res = makeRes();

    await handler({
      method: 'PUT',
      query: { action: 'register' },
      headers: { cookie: 'account=stale' },
      body: {
        updates: {
          name: 'Victime Modifiée',
          classId: '2eme-bac-sc-math',
          className: '2ème Bac SM',
        },
      },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'account_session_required' });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.arrayContaining([
      expect.stringContaining('Max-Age=0'),
    ]));
  });

  it('rejects set-password when authenticated account does not match phone owner', async () => {
    const victimUser = {
      accountId: 'account-victim-001',
      phone: '+212612345678',
      name: 'Victime',
      classId: '2bac-sm',
      className: '2ème Bac SM',
      authVersion: 1,
    };
    mocks.readActiveAccountSession.mockResolvedValue({
      claims: { sub: 'account-attacker-01', ver: 1, trust: 'password', iat: 1, exp: 9999999999 },
      user: { accountId: 'account-attacker-01' },
    });
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:phone:+212612345678') return 'account-victim-001';
      if (key === 'user:id:account-victim-001') return JSON.stringify(victimUser);
      return null;
    });
    const res = makeRes();

    await handler({
      method: 'POST',
      query: { action: 'set-password' },
      headers: {},
      body: { phone: '+212612345678', password: 'newpassword123' },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
  });

  it('records auth failures on invalid login attempt and switches accounts cleanly without 403 deadlock', async () => {
    const accountB = {
      accountId: 'account-b-student-01',
      phone: '+212611111111',
      name: 'Compte B',
      classId: '2bac-sm',
      className: '2ème Bac SM',
      passwordHash: 'hashed-b',
      authVersion: 2,
      role: 'student',
    };
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:phone:+212611111111') return 'account-b-student-01';
      if (key === 'user:id:account-b-student-01') return JSON.stringify(accountB);
      return null;
    });
    mocks.eval.mockImplementation(async (script: string) => {
      if (script.includes('user.lastActive')) return JSON.stringify(accountB);
      return 1;
    });
    const badAttemptRes = makeRes();

    await handler({
      method: 'POST',
      query: { action: 'login' },
      headers: {},
      body: { phone: '+212611111111', password: 'bad' },
    } as any, badAttemptRes as any);

    expect(badAttemptRes.status).toHaveBeenCalledWith(401);
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      ['auth:login-fail:+212611111111'],
      [expect.any(String)],
    );

    mocks.verifyPassword.mockResolvedValueOnce(true);
    const switchRes = makeRes();

    await handler({
      method: 'POST',
      query: { action: 'login' },
      headers: { cookie: 'account=existing-other-user-cookie' },
      body: { phone: '+212611111111', password: 'correct-password' },
    } as any, switchRes as any);

    expect(switchRes.status).toHaveBeenCalledWith(200);
    expect(mocks.issueAccountSession).toHaveBeenCalledWith({
      accountId: 'account-b-student-01',
      authVersion: 2,
      trust: 'self',
    });
  });

  it('bumps authVersion on logout when a valid account session cookie is present', async () => {
    mocks.readAccountSession.mockReturnValue({ sub: 'account-42', ver: 3 });
    const res = makeRes();

    await handler({
      method: 'POST',
      query: { action: 'logout' },
      headers: { cookie: 'account=active-cookie' },
    } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining('user.authVersion'),
      ['user:id:account-42'],
      ['account-42'],
    );
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.arrayContaining([
      expect.stringContaining('Max-Age=0'),
    ]));
  });
});
