import { generateKeyPairSync, createSign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisStore = new Map<string, string>();
const redisSets = new Map<string, Set<string>>();
const redisLists = new Map<string, string[]>();

const mocks = vi.hoisted(() => ({
  readActiveAccountSession: vi.fn(),
  issueAccountSession: vi.fn(),
  isAuthorized: vi.fn(() => false),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  ACCOUNT_SESSION_COOKIE: 'mathplus_account_session',
  PROFESSOR_SESSION_COOKIE: 'mathplus_prof_session',
  isAuthorized: mocks.isAuthorized,
  issueAccountSession: mocks.issueAccountSession,
  readActiveAccountSession: mocks.readActiveAccountSession,
  redis: {
    get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      redisStore.set(k, String(v));
      return 'OK';
    }),
    sadd: vi.fn(async (k: string, v: string) => {
      if (!redisSets.has(k)) redisSets.set(k, new Set());
      redisSets.get(k)!.add(String(v));
      return 1;
    }),
    lpush: vi.fn(async (k: string, v: string) => {
      if (!redisLists.has(k)) redisLists.set(k, []);
      redisLists.get(k)!.unshift(String(v));
      return redisLists.get(k)!.length;
    }),
    ltrim: vi.fn(async (k: string, start: number, stop: number) => {
      const list = redisLists.get(k) || [];
      redisLists.set(k, list.slice(start, stop + 1));
      return 'OK';
    }),
    rpop: vi.fn(async (k: string) => {
      const list = redisLists.get(k) || [];
      return list.length ? list.pop()! : null;
    }),
    rpush: vi.fn(async (k: string, v: string) => {
      if (!redisLists.has(k)) redisLists.set(k, []);
      redisLists.get(k)!.push(String(v));
      return redisLists.get(k)!.length;
    }),
    llen: vi.fn(async (k: string) => (redisLists.get(k) || []).length),
  },
}));

import { clearJwksCache, getPublicCloudConfig, verifyGoogleOrFirebaseToken } from '../../src/server/cloud/googleAuth.js';
import {
  SYNC_DLQ_DEAD_KEY,
  clearFirestoreTokenCache,
  fromFirestoreValue,
  getFirestoreDoc,
  setFirestoreDoc,
  toFirestoreValue,
} from '../../src/server/cloud/firestoreRest.js';
import {
  MAX_CLOUD_ENVELOPE_BYTES,
  mergeAppEnvelopes,
  mergeExerciseRatings,
  mergeQuizScores,
  serializeBoundedEnvelope,
} from '../../src/server/cloud/appStateMerge.js';
import {
  SYNC_DLQ_KEY,
  drainFirestoreRetryQueue,
  readHybridDocument,
  upsertGoogleAccount,
  writeHybridDocument,
} from '../../src/server/cloud/hybridStore.js';
import { createNextRouteHandler } from '../../src/server/cloud/nextAdapter.js';
import authHandler from '../../api/auth.js';
import syncHandler from '../../api/sync.js';
import { GET as nextHealthGet } from '../../apps/apprendre-next/src/app/api/health/route.js';
import { POST as nextSyncPost } from '../../apps/apprendre-next/src/app/api/sync/route.js';
import { POST as nextAuthPost } from '../../apps/apprendre-next/src/app/api/auth/route.js';
import { parseSafeSlug, readDataJson } from '../../apps/apprendre-next/src/lib/content/serverContent.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'test-kid-1', use: 'sig', alg: 'RS256' };
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;

function signTestJwt(claims: Record<string, unknown>, headerOverride: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid-1', ...headerOverride })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const sig = signer.sign(privatePem, 'base64url');
  return `${header}.${payload}.${sig}`;
}

function makeMockRes() {
  const headers: Record<string, string | string[]> = {};
  let code = 200;
  let body: any = null;
  const res: any = {
    status: vi.fn((c: number) => { code = c; return res; }),
    json: vi.fn((d: any) => { body = d; return res; }),
    setHeader: vi.fn((k: string, v: string | string[]) => { headers[k.toLowerCase()] = v; }),
    getCode: () => code,
    getBody: () => body,
    getHeaders: () => headers,
  };
  return res;
}

describe('Infrastructure Cloud : Google/Firebase Auth, Firestore, Redis L1+L2, Sync & Next Adapter', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    redisSets.clear();
    redisLists.clear();
    clearJwksCache();
    clearFirestoreTokenCache();
    process.env = { ...savedEnv };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...savedEnv };
  });

  it('verifie un JWT RS256 Google valide et rejette expiration, audience ou signature falsifiee', async () => {
    const now = 1_750_000_000;
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'max-age=600' },
    })) as unknown as typeof fetch;

    const validToken = signTestJwt({
      iss: 'https://accounts.google.com',
      aud: 'client-123.apps.googleusercontent.com',
      sub: 'google-sub-42',
      email: 'Salma.Bennani@example.com',
      email_verified: true,
      name: 'Salma Bennani',
      given_name: 'Salma',
      family_name: 'Bennani',
      picture: 'https://lh3.googleusercontent.com/avatar.png',
      iat: now - 10,
      exp: now + 3600,
    });

    const verified = await verifyGoogleOrFirebaseToken(validToken, {
      googleClientId: 'client-123.apps.googleusercontent.com',
      nowSec: () => now,
      fetchFn: mockFetch,
    });

    expect(verified.provider).toBe('google');
    expect(verified.sub).toBe('google-sub-42');
    expect(verified.email).toBe('salma.bennani@example.com');
    expect(verified.firstName).toBe('Salma');
    expect(verified.lastName).toBe('Bennani');

    const fbToken = signTestJwt({
      iss: 'https://securetoken.google.com/mathplus-prod',
      aud: 'mathplus-prod',
      sub: 'fb-uid-99',
      email: 'youssef@example.com',
      email_verified: true,
      name: 'Youssef Amrani',
      iat: now - 5,
      auth_time: now - 5,
      exp: now + 1800,
    });
    const fbVerified = await verifyGoogleOrFirebaseToken(fbToken, {
      firebaseProjectId: 'mathplus-prod',
      nowSec: () => now,
      fetchFn: mockFetch,
    });
    expect(fbVerified.provider).toBe('firebase');
    expect(fbVerified.sub).toBe('fb-uid-99');

    const expired = signTestJwt({
      iss: 'https://accounts.google.com',
      aud: 'client-123.apps.googleusercontent.com',
      sub: 's',
      iat: now - 7200,
      exp: now - 120,
    });
    await expect(verifyGoogleOrFirebaseToken(expired, {
      googleClientId: 'client-123.apps.googleusercontent.com',
      nowSec: () => now,
      fetchFn: mockFetch,
    })).rejects.toThrow('token_expired');

    const tampered = `${validToken.slice(0, -4)}AAAA`;
    await expect(verifyGoogleOrFirebaseToken(tampered, {
      googleClientId: 'client-123.apps.googleusercontent.com',
      nowSec: () => now,
      fetchFn: mockFetch,
    })).rejects.toThrow('token_signature_invalid');

    const algNone = signTestJwt({ iss: 'https://accounts.google.com', aud: 'client-123', sub: 's', iat: now, exp: now + 60 }, { alg: 'HS256' });
    await expect(verifyGoogleOrFirebaseToken(algNone, {
      googleClientId: 'client-123',
      nowSec: () => now,
      fetchFn: mockFetch,
    })).rejects.toThrow('unsupported_token_alg');
  });

  it('encode/decode Firestore REST v1 et echange assertion JWT Service Account', async () => {
    const sample = {
      name: 'MathFlow',
      score: 18,
      ratio: 0.75,
      active: true,
      nested: { tags: ['bac', null] },
    };
    const roundtrip = fromFirestoreValue(toFirestoreValue(sample));
    expect(roundtrip).toEqual(sample);

    const noCfg = await getFirestoreDoc('users/u1', { config: null });
    expect(noCfg).toEqual({ ok: false, skipped: true, data: null });

    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        expect(String(init?.body || '')).toContain('grant_type=');
        return new Response(JSON.stringify({ access_token: 'fs-token-abc', expires_in: 3600 }), { status: 200 });
      }
      if (url.includes('/documents/apprendre_states/u1') && init?.method === 'PATCH') {
        expect(new URL(url).searchParams.get('currentDocument.updateTime')).toBe('2026-11-15T12:00:00Z');
        return new Response(JSON.stringify({ updateTime: '2026-11-15T12:00:00Z' }), { status: 200 });
      }
      if (url.includes('/documents/apprendre_states/u1') && init?.method === 'GET') {
        return new Response(JSON.stringify({
          fields: { updatedAt: { integerValue: '12345' }, tag: { stringValue: 'ok' } },
          updateTime: '2026-11-15T12:00:00Z',
        }), { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const cfg = { projectId: 'proj-1', clientEmail: 'sa@proj-1.iam.gserviceaccount.com', privateKey: privatePem };
    const written = await setFirestoreDoc('apprendre_states/u1', { updatedAt: 12345, tag: 'ok' }, {
      config: cfg,
      fetchFn: mockFetch,
      mergeFields: ['updatedAt', 'tag'],
      currentDocument: { updateTime: '2026-11-15T12:00:00Z' },
    });
    expect(written.ok).toBe(true);

    const loaded = await getFirestoreDoc('apprendre_states/u1', { config: cfg, fetchFn: mockFetch });
    expect(loaded.exists).toBe(true);
    expect(loaded.data).toEqual({ updatedAt: 12345, tag: 'ok' });
  });

  it('applique la fusion CRDT monotone et le cache L1 Redis + L2 Firestore + DLQ retry', async () => {
    expect(mergeQuizScores([0, -1, 1, null], [1, 0, -1, -1])).toEqual([1, 0, 1, -1]);
    expect(mergeExerciseRatings([2, 0, null], [1, 2, 1])).toEqual([2, 2, 1]);

    const merged = mergeAppEnvelopes(
      { profile: { cls: '2eme-bac-sc-math', fn: 'Ali', profileUpdatedAt: 200 }, state: { q: { ch1: [0, 1] }, e: { ch1: [1] }, l: { ch1: 45 }, lastVisited: { chapterId: 'ch1', at: 500 } }, updatedAt: 500, revision: 2 },
      { profile: { cls: '2eme-bac-sc-ex', fn: 'Old', profileUpdatedAt: 100 }, state: { q: { ch1: [1, -1] }, e: { ch1: [2, 1] }, l: { ch1: 75 }, lastVisited: { chapterId: 'ch0', at: 300 } }, updatedAt: 400, revision: 3 },
      600,
    );
    expect(merged.profile.fn).toBe('Ali');
    expect(merged.state.q.ch1).toEqual([1, 1]);
    expect(merged.state.e.ch1).toEqual([2, 1]);
    expect(merged.state.l.ch1).toBe(75);
    expect(merged.state.lastVisited?.chapterId).toBe('ch1');
    expect(merged.revision).toBe(4);

    // Echec Firestore L2 -> enregistre quand meme en L1 et pousse en DLQ
    const failWrite = await writeHybridDocument('appstate:u1', 'apprendre_states/u1', merged, {
      firestoreEnabled: () => true,
      setDoc: async () => { throw new Error('firestore_timeout'); },
    });
    expect(failWrite).toEqual({ redis: 'ok', firestore: 'queued' });
    expect((redisLists.get(SYNC_DLQ_KEY) || []).length).toBe(1);

    // Reprise DLQ
    const replaySetDoc = vi.fn(async () => ({ ok: true }));
    const drained = await drainFirestoreRetryQueue(10, { firestoreEnabled: () => true, setDoc: replaySetDoc, getDoc: async () => ({ ok: true, exists: false }) });
    expect(drained).toBe(1);
    expect(replaySetDoc).toHaveBeenCalledTimes(1);

    // Lecture L2 si L1 absent + rehydratation L1
    redisStore.clear();
    const hydrated = await readHybridDocument<{ updatedAt: number }>('appstate:u2', 'apprendre_states/u2', {
      firestoreEnabled: () => true,
      getDoc: async () => ({ ok: true, exists: true, data: { updatedAt: 999 } as any }),
    });
    expect(hydrated.source).toBe('firestore');
    expect(hydrated.data).toEqual({ updatedAt: 999 });
    expect(redisStore.get('appstate:u2')).toContain('999');

    // Creation compte Google + preservation role prof existant
    const created = await upsertGoogleAccount({
      provider: 'google',
      sub: 'sub-999',
      email: 'prof@example.com',
      emailVerified: true,
      name: 'Prof Test',
      firstName: 'Prof',
      lastName: 'Test',
      picture: '',
      issuer: 'https://accounts.google.com',
      audience: 'cid',
      expiresAt: 9999999999,
    }, {}, { firestoreEnabled: () => false });
    expect(created.isNew).toBe(true);
    expect(created.user.accountId.startsWith('g_')).toBe(true);
    expect(redisStore.get('idx:google:sub-999')).toBe(created.user.accountId);
  });

  it('expose /api/auth, /api/sync et adaptateur Next.js sans exposer de secrets', async () => {
    process.env.GOOGLE_CLIENT_ID = 'pub-client.apps.googleusercontent.com';
    process.env.ACCOUNT_SESSION_SECRET = 'test-account-session-secret';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----SECRET';
    expect(getPublicCloudConfig().googleEnabled).toBe(true);

    const resProv = makeMockRes();
    await authHandler({ method: 'GET', query: { action: 'providers' } }, resProv);
    expect(resProv.getCode()).toBe(200);
    expect(JSON.stringify(resProv.getBody())).not.toContain('SECRET');
    expect(resProv.getBody().googleClientId).toBe('pub-client.apps.googleusercontent.com');

    // Login Google via /api/auth?action=google
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));
    mocks.issueAccountSession.mockReturnValue('signed-session-cookie-val');
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signTestJwt({
      iss: 'https://accounts.google.com',
      aud: 'pub-client.apps.googleusercontent.com',
      sub: 'g-student-7',
      email: 'khadija@example.com',
      email_verified: true,
      name: 'Khadija El',
      iat: nowSec - 5,
      exp: nowSec + 300,
    });
    const resLogin = makeMockRes();
    await authHandler({ method: 'POST', query: { action: 'google' }, body: { idToken, classId: '2eme-bac-sc-math' } }, resLogin);
    expect(resLogin.getCode()).toBe(200);
    expect(resLogin.getBody().authenticated).toBe(true);
    expect(resLogin.getBody().user.email).toBe('khadija@example.com');
    expect(String(resLogin.getHeaders()['set-cookie'])).toContain('HttpOnly; SameSite=Lax');

    // /api/sync refuse requetes anonymes
    mocks.readActiveAccountSession.mockResolvedValue(null);
    const resSyncUnauth = makeMockRes();
    await syncHandler({ method: 'GET', query: {} }, resSyncUnauth);
    expect(resSyncUnauth.getCode()).toBe(401);

    // /api/sync POST authentifie fusionne et sauve
    mocks.readActiveAccountSession.mockResolvedValue({ user: { accountId: 'g_acc_1' } });
    const resSyncPost = makeMockRes();
    await syncHandler({
      method: 'POST',
      query: {},
      body: { envelope: { profile: { cls: '2eme-bac-sc-ex' }, state: { q: { deriv: [1] }, e: {}, l: { deriv: 60 }, lastVisited: null } } },
    }, resSyncPost);
    expect(resSyncPost.getCode()).toBe(200);
    expect(resSyncPost.getBody().envelope.state.l.deriv).toBe(60);

    // Next.js Adapter
    const nextRoute = createNextRouteHandler(syncHandler);
    const webRes = await nextRoute(new Request('http://localhost:3000/api/sync?action=health', { method: 'GET' }));
    expect(webRes.status).toBe(200);
    const webJson = await webRes.json();
    expect(webJson.mode).toBe('hybrid-redis-firestore');
  });

  it('refuse le login avant toute mutation Redis quand le secret de session manque', async () => {
    process.env.GOOGLE_CLIENT_ID = 'pub-client.apps.googleusercontent.com';
    process.env.ACCOUNT_SESSION_SECRET = '';
    process.env.PROF_SESSION_SECRET = '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 })));
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = signTestJwt({
      iss: 'https://accounts.google.com', aud: 'pub-client.apps.googleusercontent.com',
      sub: 'student-missing-secret', email: 'student@example.com', email_verified: true,
      iat: nowSec - 5, exp: nowSec + 300,
    });
    const res = makeMockRes();
    await authHandler({ method: 'POST', query: { action: 'google' }, body: { idToken } }, res);
    expect(res.getCode()).toBe(503);
    expect(res.getBody()).toEqual({ error: 'session_secret_unconfigured' });
    expect(redisStore.size).toBe(0);
    expect(redisSets.size).toBe(0);
    expect(mocks.issueAccountSession).not.toHaveBeenCalled();
  });

  it('charge offline-db.js et cloud-sync.js sans erreur en environnement file:// isole', async () => {
    const offlineCode = fs.readFileSync(path.resolve('maquette/js/core/offline-db.js'), 'utf8');
    const cloudCode = fs.readFileSync(path.resolve('maquette/js/core/cloud-sync.js'), 'utf8');
    const ctx: any = {
      location: { protocol: 'file:', hash: '#learn' },
      navigator: { onLine: false },
      setTimeout, clearTimeout, URLSearchParams, Set, Map,
    };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(offlineCode, ctx);
    vm.runInContext(cloudCode, ctx);

    await ctx.MathFlowOfflineDB.enqueueOutbox({ updatedAt: 10 });
    const items = await ctx.MathFlowOfflineDB.peekOutbox();
    expect(items.length).toBe(1);
    await ctx.MathFlowOfflineDB.clearOutboxIds([items[0].id]);
    expect((await ctx.MathFlowOfflineDB.peekOutbox()).length).toBe(0);
    expect(ctx.MathFlowCloud.getStatus().isHttp).toBe(false);
  });

  it('supporte les formats CRDT objets Next.js, resetAt anti-resurrection, resume/unlocks optionnels et garde prototype', () => {
    const mergedNext = mergeAppEnvelopes(
      {
        profile: { cls: '2eme-bac-sc-math', profileUpdatedAt: 200 },
        state: {
          q: { '2eme-bac-sc-math:continuite': { answers: [1, 0], isSubmitted: true } },
          e: { '2eme-bac-sc-math:continuite': { 'ex-1': 2, 'ex-2': 1 } },
          l: { '2eme-bac-sc-math:continuite': { pct: 72 } as any },
          lastVisited: { href: 'javascript:alert(1)', title: 'Cours', at: 500 },
          __proto__: { polluted: true },
        } as any,
        unlocks: { '2eme-bac-sc-math:continuite': { quiz: true, exercises: false } },
        resume: {
          lessons: { '2eme-bac-sc-math:continuite': { pct: 35, maxPct: 72, bookmarks: ['sec-2'], updatedAt: 500 } },
          chapterActiveQuiz: { '2eme-bac-sc-math:continuite': { quizId: 'q1', updatedAt: 500 } },
          exercises: {
            '2eme-bac-sc-math:continuite': {
              index: 1, mode: 'pas-a-pas' as any, openHints: ['h1'], openSolutions: [], revealed: [0],
              elapsedSec: 40, spent: { '0': 25 }, updatedAt: 500,
            },
          },
          quizzes: {
            'chapter:2eme-bac-sc-math:continuite:q1': {
              selectedQuizId: 'q1', phase: 'run', idx: 2, answers: { '0': { status: 'answered', isCorrect: true } },
              drafts: { '2': { text: 'secret-draft' } }, remainingByIdx: { '2': 50 },
              skipped: [], elapsedSec: 12, reviewQueue: null, updatedAt: 500,
            } as any,
          },
        },
        updatedAt: 500,
      },
      {
        profile: { cls: '2eme-bac-sc-ex', profileUpdatedAt: 100 },
        state: {
          q: { '2eme-bac-sc-math:continuite': [0, 1] },
          e: { '2eme-bac-sc-math:continuite': { 'ex-1': 1 } },
          l: { '2eme-bac-sc-math:continuite': 40 },
          lastVisited: { href: '/lecon/continuite', title: 'OK', at: 300 },
        },
        unlocks: { '2eme-bac-sc-math:continuite': { quiz: false, exercises: true } },
        resume: {
          lessons: { '2eme-bac-sc-math:continuite': { pct: 20, maxPct: 40, bookmarks: ['sec-1'], updatedAt: 400 } },
          chapterActiveQuiz: { '2eme-bac-sc-math:continuite': { quizId: 'q0', updatedAt: 350 } },
        },
        updatedAt: 400,
      },
      600,
    );

    expect(mergedNext.state.q['2eme-bac-sc-math:continuite']).toEqual({ answers: [1, 1], isSubmitted: true });
    expect(mergedNext.state.e['2eme-bac-sc-math:continuite']).toEqual({ 'ex-1': 2, 'ex-2': 1 });
    expect(mergedNext.state.l['2eme-bac-sc-math:continuite']).toBe(72);
    expect(mergedNext.state.lastVisited?.href).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
    expect(mergedNext.unlocks?.['2eme-bac-sc-math:continuite']).toEqual({ quiz: true, exercises: true });
    expect(mergedNext.resume?.lessons?.['2eme-bac-sc-math:continuite'].bookmarks).toEqual(['sec-1', 'sec-2']);
    expect(mergedNext.resume?.chapterActiveQuiz?.['2eme-bac-sc-math:continuite']).toEqual({ quizId: 'q1', updatedAt: 500 });
    expect(mergedNext.resume?.exercises?.['2eme-bac-sc-math:continuite'].mode).toBe('pas');
    expect((mergedNext.resume?.quizzes?.['chapter:2eme-bac-sc-math:continuite:q1'] as any)?.drafts).toBeUndefined();

    // Anti-resurrection resetAt
    const afterReset = mergeAppEnvelopes(
      { resetAt: 1000, state: { q: {}, e: {}, l: {}, lastVisited: null }, updatedAt: 1000 },
      mergedNext,
      1001,
    );
    expect(afterReset.resetAt).toBe(1000);
    expect(afterReset.state.l).toEqual({});
    expect(afterReset.unlocks).toBeUndefined();

    // Offline stale push older than resetAt does not resurrect deleted data
    const staleAfterReset = mergeAppEnvelopes(
      { state: { q: { c1: [1] }, e: {}, l: { c1: 80 }, lastVisited: null }, updatedAt: 900 },
      afterReset,
      1100,
    );
    expect(staleAfterReset.state.l).toEqual({});

    const tooBig = serializeBoundedEnvelope({
      profile: {},
      state: { q: {}, e: {}, l: {}, lastVisited: null },
      updatedAt: 1,
      revision: 1,
      resume: { lessons: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, { pct: 50, maxPct: 50, secTitle: 'x'.repeat(25_000), updatedAt: i }])) },
    }, MAX_CLOUD_ENVELOPE_BYTES);
    expect(tooBig.ok).toBe(false);
  });

  it('valide les payloads, CSRF origin, DLQ poison-pill, health et routes App Router Next', async () => {
    // Malformed JSON / CSRF rejected on legacy syncHandler
    mocks.readActiveAccountSession.mockResolvedValue({ user: { accountId: 'g_acc_1' } });
    const badJsonRes = makeMockRes();
    await syncHandler({ method: 'POST', query: {}, body: '{broken' }, badJsonRes);
    expect(badJsonRes.getCode()).toBe(400);

    const csrfRes = makeMockRes();
    await syncHandler({
      method: 'POST',
      query: {},
      headers: { host: 'mathflow.app', origin: 'https://evil.example' },
      body: { envelope: {} },
    }, csrfRes);
    expect(csrfRes.getCode()).toBe(403);

    // DLQ quarantines permanent failing entry after 5 attempts
    redisStore.set('appstate:bad', JSON.stringify({ updatedAt: 1 }));
    redisLists.set(SYNC_DLQ_KEY, [JSON.stringify({ redisKey: 'appstate:bad', firestorePath: 'apprendre_states/bad', attempts: 4 })]);
    const drainedDead = await drainFirestoreRetryQueue(5, {
      firestoreEnabled: () => true,
      setDoc: async () => { throw new Error('permanent_400'); },
    });
    expect(drainedDead).toBe(0);
    expect((redisLists.get(SYNC_DLQ_KEY) || []).length).toBe(0);
    expect((redisLists.get(SYNC_DLQ_DEAD_KEY) || []).length).toBe(1);

    // Next.js /api/health has no-store header
    const healthRes = await nextHealthGet();
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('cache-control')).toContain('no-store');

    // Next.js /api/sync & /api/auth reject malformed JSON (400), oversized body (413) & cross-site CSRF (403)
    const nextBadJson = await nextSyncPost(new Request('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid',
    }));
    expect(nextBadJson.status).toBe(400);

    const nextTooLarge = await nextAuthPost(new Request('http://localhost:3000/api/auth?action=google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 'x'.repeat(40_000) }),
    }));
    expect(nextTooLarge.status).toBe(413);

    const nextCsrf = await nextSyncPost(new Request('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: '{}',
    }));
    expect(nextCsrf.status).toBe(403);
  });

  it('bloque path traversal et URI malformees dans serverContent', async () => {
    expect(parseSafeSlug('continuite')).toBe('continuite');
    expect(parseSafeSlug('%E0%A4%A')).toBeNull();
    expect(parseSafeSlug('../secrets')).toBeNull();
    expect(parseSafeSlug('a\\b')).toBeNull();

    expect(await readDataJson('../package.json')).toBeNull();
    expect(await readDataJson('classes\\2eme-bac-sc-ex.json')).toBeNull();
    expect(await readDataJson('classes/2eme-bac-sc-ex.ts')).toBeNull();
    expect(await readDataJson('classes/2eme-bac-sc-ex.json\0')).toBeNull();
  });
});
