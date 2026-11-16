import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const outbox = vi.hoisted(() => ({
  replace: vi.fn(),
  clear: vi.fn(async () => true),
}));

vi.mock('../../apps/apprendre-next/src/lib/offlineDb', () => ({
  clearAllOutbox: outbox.clear,
  clearOutboxIds: vi.fn(),
  peekOutbox: vi.fn(async () => []),
  replaceOutboxWith: outbox.replace,
}));

import {
  applyCloudEnvelopeToLocalStores,
  logoutCloudSession,
  pushCloudEnvelope,
  purgeLocalSessionOnLogout,
  type CloudEnvelope,
} from '../../apps/apprendre-next/src/lib/cloudSync';
import {
  drainFirestoreRetryQueueWithRedis,
  readHybridDocumentWithRedis,
  upsertGoogleAccountWithRedis,
  SYNC_DLQ_KEY,
  type HybridRedisClient,
} from '../../src/server/cloud/firestoreRest';
import type { VerifiedGoogleIdentity } from '../../src/server/cloud/googleAuth';

function redisMemory(): HybridRedisClient & { values: Map<string, string>; jobs: string[] } {
  const values = new Map<string, string>();
  const jobs: string[] = [];
  return {
    values, jobs,
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => { values.set(key, value); return 'OK'; }),
    sadd: vi.fn(async () => 1),
    lpush: vi.fn(async (_key, value) => jobs.unshift(value)),
    ltrim: vi.fn(async () => 'OK'),
    rpop: vi.fn(async () => jobs.pop() ?? null),
    rpush: vi.fn(async (_key, value) => jobs.push(value)),
  };
}

function envelope(key: string): CloudEnvelope {
  return { profile: {}, state: { q: {}, e: {}, l: { [key]: 50 }, lastVisited: null }, updatedAt: 100 };
}

describe('Cloud sync reliability', () => {
  let local: Map<string, string>;

  beforeEach(() => {
    local = new Map();
    vi.stubGlobal('window', {
      location: { protocol: 'https:' },
      localStorage: {
        getItem: (key: string) => local.get(key) ?? null,
        setItem: (key: string, value: string) => local.set(key, value),
        removeItem: (key: string) => local.delete(key),
      },
    });
    vi.stubGlobal('navigator', { onLine: false });
    outbox.replace.mockReset();
    outbox.clear.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('clears obsolete resume/unlocks when a newer remote reset is applied', () => {
    local.set('ap-reset-at', '100');
    local.set('ap-u', JSON.stringify({ old: { quiz: true, exercises: true } }));
    local.set('ap-resume', JSON.stringify({ lessons: { old: { pct: 75 } } }));
    applyCloudEnvelopeToLocalStores({ resetAt: 200 });
    expect(local.has('ap-u')).toBe(false);
    expect(local.has('ap-resume')).toBe(false);
    expect(local.get('ap-reset-at')).toBe('200');
  });

  it('compacts concurrent offline mutations using the transactional merge callback', async () => {
    let stored: CloudEnvelope | undefined;
    outbox.replace.mockImplementation(async (incoming, _owner, merge) => {
      await Promise.resolve();
      stored = stored ? merge(incoming, stored) : incoming;
      return 1;
    });
    const results = await Promise.all([
      pushCloudEnvelope(envelope('lesson-a'), 'student-a'),
      pushCloudEnvelope(envelope('lesson-b'), 'student-a'),
    ]);
    expect(results.every((result) => result.queued)).toBe(true);
    expect(stored?.state.l).toEqual({ 'lesson-a': 50, 'lesson-b': 50 });
  });

  it('reports a failed offline queue write instead of claiming data was queued', async () => {
    outbox.replace.mockResolvedValue(null);
    expect(await pushCloudEnvelope(envelope('lesson-a'), 'student-a')).toMatchObject({
      ok: false, queued: false, syncState: 'error', error: 'offline_storage_unavailable',
    });
  });

  it('clears local identity during logout without losing display preferences', async () => {
    local.set('ap-p', JSON.stringify({ fn: 'Alice', ln: 'Example', sc: 'School', th: 'dark' }));
    await purgeLocalSessionOnLogout();
    const profile = JSON.parse(local.get('ap-p')!);
    expect(profile).toMatchObject({ fn: '', ln: '', sc: '', th: 'dark' });
    expect(Number(profile.profileUpdatedAt) || 0).toBe(0);
    expect(outbox.clear).toHaveBeenCalledOnce();
  });

  it('retains the local session when server logout fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network_down'); }));
    local.set('ap-owner', 'student-a');
    expect(await logoutCloudSession()).toEqual({ ok: false });
    expect(local.get('ap-owner')).toBe('student-a');
    expect(outbox.clear).not.toHaveBeenCalled();
  });

  it('discards a sync response that completes after logout or a change of account', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const pending = pushCloudEnvelope(envelope('previous-account'), 'student-a');
    await purgeLocalSessionOnLogout();
    resolveResponse(new Response(JSON.stringify({ envelope: envelope('previous-account') }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    expect(await pending).toMatchObject({ ok: false, queued: false, envelope: null, error: 'session_changed' });
  });

  it('returns Firestore data when Redis read and cache hydration both fail', async () => {
    const redis = redisMemory();
    vi.mocked(redis.get).mockRejectedValue(new Error('redis_down'));
    vi.mocked(redis.set).mockRejectedValue(new Error('redis_down'));
    const result = await readHybridDocumentWithRedis('appstate:u1', 'apprendre_states/u1', {
      redisClient: redis,
      firestoreEnabled: () => true,
      getDoc: async () => ({ ok: true, exists: true, data: { updatedAt: 100 } as any }),
    });
    expect(result).toEqual({ source: 'firestore', data: { updatedAt: 100 } });
  });

  it('requeues a popped DLQ job when reading its Redis payload fails', async () => {
    const redis = redisMemory();
    redis.jobs.push(JSON.stringify({ redisKey: 'appstate:u1', firestorePath: 'apprendre_states/u1' }));
    vi.mocked(redis.get).mockRejectedValue(new Error('redis_down'));
    const setDoc = vi.fn(async () => ({ ok: true }));
    expect(await drainFirestoreRetryQueueWithRedis(1, {
      redisClient: redis, firestoreEnabled: () => true, setDoc,
    })).toBe(0);
    expect(redis.rpush).toHaveBeenCalledWith(SYNC_DLQ_KEY, expect.stringContaining('"attempts":1'));
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('keeps Firebase subjects isolated by project and from Google subjects', async () => {
    const redis = redisMemory();
    const identity: VerifiedGoogleIdentity = {
      provider: 'google', sub: 'same-subject', email: '', emailVerified: false,
      name: 'Student', firstName: 'Student', lastName: '', picture: '',
      issuer: 'https://accounts.google.com', audience: 'google-client', expiresAt: 9999999999,
    };
    const deps = { redisClient: redis, firestoreEnabled: () => false };
    const google = await upsertGoogleAccountWithRedis(identity, {}, deps);
    const firebaseA = await upsertGoogleAccountWithRedis({
      ...identity, provider: 'firebase', issuer: 'https://securetoken.google.com/project-a', audience: 'project-a',
    }, {}, deps);
    const firebaseB = await upsertGoogleAccountWithRedis({
      ...identity, provider: 'firebase', issuer: 'https://securetoken.google.com/project-b', audience: 'project-b',
    }, {}, deps);
    expect(new Set([google.user.accountId, firebaseA.user.accountId, firebaseB.user.accountId]).size).toBe(3);
    expect(firebaseA.user.authIdentityKey).toBe('idx:firebase:https://securetoken.google.com/project-a:same-subject');
    expect(firebaseA.user.googleSub).toBeUndefined();
  });
});
