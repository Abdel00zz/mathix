import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearJwksCache, verifyGoogleOrFirebaseToken } from '../../src/server/cloud/googleAuth.js';
import { POST as authPost } from '../../apps/apprendre-next/src/app/api/auth/route.js';

const now = 1_800_000_000;
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'current', use: 'sig', alg: 'RS256' };
const googleClaims = {
  iss: 'https://accounts.google.com', aud: 'mathplus-client', sub: 'student-1',
  iat: now - 10, exp: now + 3600,
};

function token(claims: Record<string, unknown> = googleClaims, kid = 'current') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256').update(signingInput);
  return `${signingInput}.${signer.sign(pair.privateKey, 'base64url')}`;
}

function keysResponse(keys: unknown[]) {
  return new Response(JSON.stringify({ keys }), { headers: { 'cache-control': 'max-age=3600' } });
}

describe('Google/Firebase identity validation regressions', () => {
  beforeEach(() => clearJwksCache());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes cached keys on rotation and limits refreshes for unknown kids', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(keysResponse([jwk]))
      .mockResolvedValueOnce(keysResponse([{ ...jwk, kid: 'rotated' }]))
      .mockResolvedValue(keysResponse([{ ...jwk, kid: 'rotated' }]));
    const options = { googleClientId: 'mathplus-client', nowSec: () => now, fetchFn };
    await expect(verifyGoogleOrFirebaseToken(token(), options)).resolves.toMatchObject({ sub: 'student-1' });
    await expect(verifyGoogleOrFirebaseToken(token(googleClaims, 'rotated'), options)).resolves.toMatchObject({ sub: 'student-1' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    await expect(verifyGoogleOrFirebaseToken(token(googleClaims, 'unknown'), options)).rejects.toThrow('token_kid_not_found');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares one certificate fetch between simultaneous verifications', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL) => keysResponse([jwk]));
    const options = { googleClientId: 'mathplus-client', nowSec: () => now, fetchFn };
    await Promise.all(Array.from({ length: 5 }, () => verifyGoogleOrFirebaseToken(token(), options)));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'yesterday', String(now - 10), null, now + 120])('rejects Firebase auth_time %s', async (authTime) => {
    const claims = { ...googleClaims, iss: 'https://securetoken.google.com/mathplus-prod', aud: 'mathplus-prod', auth_time: authTime };
    const fetchFn = vi.fn(async () => keysResponse([jwk]));
    await expect(verifyGoogleOrFirebaseToken(token(claims), {
      firebaseProjectId: 'mathplus-prod', nowSec: () => now, fetchFn,
    })).rejects.toThrow('token_auth_time_invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects coerced numeric claims and subjects before fetching certificates', async () => {
    const fetchFn = vi.fn();
    const options = { googleClientId: 'mathplus-client', nowSec: () => now, fetchFn };
    await expect(verifyGoogleOrFirebaseToken(token({ ...googleClaims, iat: String(now - 10) }), options)).rejects.toThrow('token_iat_invalid');
    await expect(verifyGoogleOrFirebaseToken(token({ ...googleClaims, sub: 123 }), options)).rejects.toThrow('token_subject_invalid');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects cross-origin login and accepts an empty same-origin logout without cloud credentials', async () => {
    const rejected = await authPost(new Request('https://mathplus.test/api/auth?action=google', {
      method: 'POST', headers: { origin: 'https://attacker.test' }, body: '{}',
    }));
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({ error: 'csrf_origin_mismatch' });
    vi.stubEnv('NODE_ENV', 'production');
    const logout = await authPost(new Request('https://mathplus.test/api/auth?action=logout', {
      method: 'POST', headers: { origin: 'https://mathplus.test' },
    }));
    expect(logout.status).toBe(200);
    expect(logout.headers.get('cache-control')).toContain('no-store');
    const cookies = logout.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Max-Age=0');
    }
  });

  it('fails before mutating Redis when the account session secret is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now * 1000));
    vi.stubEnv('GOOGLE_CLIENT_ID', 'mathplus-client');
    vi.stubEnv('ACCOUNT_SESSION_SECRET', '');
    vi.stubEnv('PROF_SESSION_SECRET', '');
    vi.stubEnv('KV_REST_API_URL', 'https://redis.test');
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token');
    const fetchFn = vi.fn(async () => keysResponse([jwk]));
    vi.stubGlobal('fetch', fetchFn);
    const response = await authPost(new Request('https://mathplus.test/api/auth?action=google', {
      method: 'POST', headers: { origin: 'https://mathplus.test' }, body: JSON.stringify({ idToken: token() }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'session_secret_unconfigured' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v3/certs', expect.any(Object));
  });
});
