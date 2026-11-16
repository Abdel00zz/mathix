/**
 * Client Firestore REST v1 authentifie via Service Account JWT RS256,
 * client REST Upstash Redis sans dependance externe et coeur hybride L1+L2+DLQ.
 * Zero dependance npm externe ; compatible Edge/Node Serverless et Next.js.
 */
import { createSign, randomUUID } from 'node:crypto';
import {
  mergeAppEnvelopes,
  serializeBoundedEnvelope,
  type CloudAppEnvelope,
} from './appStateMerge';
import {
  cleanControlText,
  isValidAppClassId,
  normalizeAccountPhone,
  timeoutSignal,
  verifyAccountSessionToken,
  type AccountTokenClaims,
  type VerifiedGoogleIdentity,
} from './googleAuth';

export interface FirestoreConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface FirestoreClientOptions {
  config?: FirestoreConfig | null;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
}

export interface HybridRedisClient {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<unknown>;
  sadd: (key: string, ...members: string[]) => Promise<unknown>;
  srem?: (key: string, ...members: string[]) => Promise<unknown>;
  lpush: (key: string, ...values: string[]) => Promise<unknown>;
  ltrim: (key: string, start: number, stop: number) => Promise<unknown>;
  rpop: (key: string) => Promise<unknown>;
  rpush: (key: string, ...values: string[]) => Promise<unknown>;
  llen?: (key: string) => Promise<number>;
  eval?: <T = unknown>(script: string, keys: string[], args: Array<string | number>) => Promise<T>;
}

export const SYNC_DLQ_KEY = 'cloud:sync:dlq';
export const SYNC_DLQ_DEAD_KEY = 'cloud:sync:dlq:dead';
const DLQ_MAX_LEN = 500;
const DLQ_DEAD_MAX_LEN = 200;
const DLQ_MAX_ATTEMPTS = 5;
const L1_HYDRATE_TTL_SEC = 7 * 24 * 60 * 60;
const MAX_FIRESTORE_DEPTH = 16;

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const tokenCache = new Map<string, { accessToken: string; expiresAtMs: number }>();

export function clearFirestoreTokenCache(): void {
  tokenCache.clear();
}

export function resolveFirestoreConfig(): FirestoreConfig | null {
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

export function isFirestoreConfigured(): boolean {
  return resolveFirestoreConfig() !== null;
}

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export function toFirestoreValue(val: unknown, depth = 0): FirestoreValue {
  if (depth > MAX_FIRESTORE_DEPTH) return { nullValue: null };
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map((item) => toFirestoreValue(item, depth + 1)) } };
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v, depth + 1);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(v: FirestoreValue | undefined): unknown {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('timestampValue' in v) return String(v.timestampValue);
  if ('arrayValue' in v) {
    const arr = Array.isArray(v.arrayValue?.values) ? v.arrayValue.values : [];
    return arr.map(fromFirestoreValue);
  }
  if ('mapValue' in v) {
    return fromFirestoreFields(v.mapValue?.fields || {});
  }
  return null;
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) fields[k] = toFirestoreValue(v, 0);
  }
  return fields;
}

export function fromFirestoreFields(fields: Record<string, FirestoreValue> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFirestoreValue(v);
  return out;
}

function buildServiceAssertion(cfg: FirestoreConfig, nowSec: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: cfg.clientEmail,
    scope: DATASTORE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: nowSec,
    exp: nowSec + 3600,
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(cfg.privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

async function getAccessToken(cfg: FirestoreConfig, fetchFn: typeof fetch, nowMs: number): Promise<string> {
  const cacheKey = `${cfg.projectId}:${cfg.clientEmail}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs + 120_000) return cached.accessToken;

  const assertion = buildServiceAssertion(cfg, Math.floor(nowMs / 1000));
  const res = await fetchFn(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: timeoutSignal(),
  });
  if (!res.ok) throw new Error(`firestore_oauth_failed:${res.status}`);
  const payload = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!payload?.access_token) throw new Error('firestore_oauth_empty');
  const ttlMs = Math.max(300, Number(payload.expires_in) || 3600) * 1000;
  tokenCache.set(cacheKey, { accessToken: payload.access_token, expiresAtMs: nowMs + ttlMs });
  return payload.access_token;
}

function docUrl(projectId: string, docPath: string): string {
  const cleanSegments = docPath
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${cleanSegments}`;
}

export async function getFirestoreDoc<T = Record<string, unknown>>(
  docPath: string,
  options: FirestoreClientOptions = {},
): Promise<{ ok: boolean; skipped?: boolean; exists?: boolean; data?: T | null; updateTime?: string }> {
  const cfg = options.config === undefined ? resolveFirestoreConfig() : options.config;
  if (!cfg) return { ok: false, skipped: true, data: null };
  const fetchFn = options.fetchFn || globalThis.fetch;
  const nowMs = (options.nowMs || (() => Date.now()))();
  const token = await getAccessToken(cfg, fetchFn, nowMs);

  const res = await fetchFn(docUrl(cfg.projectId, docPath), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: timeoutSignal(),
  });
  if (res.status === 404) return { ok: true, exists: false, data: null };
  if (!res.ok) throw new Error(`firestore_get_failed:${res.status}`);
  const doc = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime?: string };
  return { ok: true, exists: true, data: fromFirestoreFields(doc.fields || {}) as T, updateTime: doc.updateTime };
}

export async function setFirestoreDoc(
  docPath: string,
  data: Record<string, unknown>,
  options: FirestoreClientOptions & { mergeFields?: string[]; currentDocument?: { updateTime?: string; exists?: boolean } } = {},
): Promise<{ ok: boolean; skipped?: boolean; updateTime?: string }> {
  const cfg = options.config === undefined ? resolveFirestoreConfig() : options.config;
  if (!cfg) return { ok: false, skipped: true };
  const fetchFn = options.fetchFn || globalThis.fetch;
  const nowMs = (options.nowMs || (() => Date.now()))();
  const token = await getAccessToken(cfg, fetchFn, nowMs);

  const query = new URLSearchParams();
  if (Array.isArray(options.mergeFields) && options.mergeFields.length > 0) {
    for (const field of options.mergeFields) query.append('updateMask.fieldPaths', field);
  }
  if (options.currentDocument?.updateTime) query.set('currentDocument.updateTime', options.currentDocument.updateTime);
  else if (options.currentDocument?.exists !== undefined) query.set('currentDocument.exists', String(options.currentDocument.exists));
  const url = docUrl(cfg.projectId, docPath) + (query.size ? `?${query}` : '');

  const res = await fetchFn(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
    signal: timeoutSignal(),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null) as { error?: { status?: string } } | null;
    if (['FAILED_PRECONDITION', 'ABORTED', 'ALREADY_EXISTS'].includes(errorBody?.error?.status || '')) {
      throw new Error('firestore_precondition_failed');
    }
    throw new Error(`firestore_patch_failed:${res.status}`);
  }
  const doc = (await res.json()) as { updateTime?: string };
  return { ok: true, updateTime: doc.updateTime };
}

// ── Client Upstash Redis REST & Coeur Hybride L1+L2+DLQ partage ──────────────

export function getRedisRestCreds(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

async function execRedisRestCmd<T = unknown>(creds: { url: string; token: string }, ...args: Array<string | number>): Promise<T | null> {
  const res = await fetch(creds.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: timeoutSignal(),
  });
  if (!res.ok) throw new Error(`redis_http_${res.status}`);
  const payload = (await res.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result ?? null;
}

export function createUpstashRestRedisClient(): HybridRedisClient | null {
  const creds = getRedisRestCreds();
  if (!creds) return null;
  return {
    get: (key) => execRedisRestCmd(creds, 'GET', key),
    set: (key, value, opts) => (
      opts?.ex
        ? execRedisRestCmd(creds, 'SET', key, value, 'EX', Math.max(1, Math.trunc(opts.ex)))
        : execRedisRestCmd(creds, 'SET', key, value)
    ),
    sadd: (key, ...members) => execRedisRestCmd(creds, 'SADD', key, ...members),
    srem: (key, ...members) => execRedisRestCmd(creds, 'SREM', key, ...members),
    lpush: (key, ...values) => execRedisRestCmd(creds, 'LPUSH', key, ...values),
    ltrim: (key, start, stop) => execRedisRestCmd(creds, 'LTRIM', key, start, stop),
    rpop: (key) => execRedisRestCmd(creds, 'RPOP', key),
    rpush: (key, ...values) => execRedisRestCmd(creds, 'RPUSH', key, ...values),
    llen: async (key) => Number(await execRedisRestCmd<number>(creds, 'LLEN', key)) || 0,
    eval: async <T = unknown>(script: string, keys: string[], args: Array<string | number>) => (
      (await execRedisRestCmd<T>(creds, 'EVAL', script, keys.length, ...keys, ...args)) as T
    ),
  };
}

export function parseStoredJson<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export interface HybridStorageDeps {
  redisClient: HybridRedisClient;
  getDoc?: typeof getFirestoreDoc;
  setDoc?: typeof setFirestoreDoc;
  firestoreEnabled?: () => boolean;
}

/** Conditional L2 merge: an older replication must never overwrite a newer one. */
export async function replicateFirestoreEnvelope(
  firestorePath: string,
  envelope: Partial<CloudAppEnvelope>,
  deps: Pick<HybridStorageDeps, 'getDoc' | 'setDoc'>,
): ReturnType<typeof setFirestoreDoc> {
  const getDoc = deps.getDoc || getFirestoreDoc;
  const setDoc = deps.setDoc || setFirestoreDoc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getDoc<CloudAppEnvelope>(firestorePath);
    if (current.skipped) return { ok: false, skipped: true };
    if (!current.ok || (current.exists && !current.updateTime)) throw new Error('firestore_read_not_confirmed');
    const merged = mergeAppEnvelopes(envelope, current.data);
    // Replication itself does not create a new application revision.
    merged.revision = Math.max(1, Number(envelope.revision) || 0, Number(current.data?.revision) || 0);
    const bounded = serializeBoundedEnvelope(merged);
    if (!bounded.ok) throw new Error('firestore_payload_too_large');
    try {
      const result = await setDoc(firestorePath, JSON.parse(bounded.json), {
        currentDocument: current.exists ? { updateTime: current.updateTime } : { exists: false },
      });
      if (!result.ok && !result.skipped) throw new Error('firestore_write_not_confirmed');
      return result;
    } catch (error) {
      if (!/^(?:firestore_patch_failed:(?:409|412)|firestore_precondition_failed)$/.test(error instanceof Error ? error.message : '')) throw error;
    }
  }
  throw new Error('firestore_concurrent_conflict');
}

export async function readHybridDocumentWithRedis<T extends Record<string, unknown>>(
  redisKey: string,
  firestorePath: string,
  deps: HybridStorageDeps,
): Promise<{ data: T | null; source: 'redis' | 'firestore' | 'none' }> {
  const r = deps.redisClient;
  const getDoc = deps.getDoc || getFirestoreDoc;
  let l1: T | null = null;
  try {
    l1 = parseStoredJson<T>(await r.get(redisKey));
  } catch {
    // A Redis outage must not prevent reading the durable Firestore copy.
  }
  if (l1) return { data: l1, source: 'redis' };

  const fsEnabled = deps.firestoreEnabled ? deps.firestoreEnabled() : isFirestoreConfigured();
  if (!fsEnabled) return { data: null, source: 'none' };

  try {
    const res = await getDoc<T>(firestorePath);
    if (res.ok && res.exists && res.data) {
      try {
        await r.set(redisKey, JSON.stringify(res.data), { ex: L1_HYDRATE_TTL_SEC });
      } catch {
        // Return the durable copy even when L1 cannot be rehydrated.
      }
      return { data: res.data, source: 'firestore' };
    }
  } catch (err) {
    console.warn('[hybridStore] Firestore L2 read skipped:', err);
  }
  return { data: null, source: 'none' };
}

export async function writeHybridDocumentWithRedis<T extends Record<string, unknown>>(
  redisKey: string,
  firestorePath: string,
  payload: T,
  deps: HybridStorageDeps,
): Promise<{ redis: 'ok'; firestore: 'ok' | 'queued' | 'skipped' }> {
  const r = deps.redisClient;
  const setDoc = deps.setDoc || setFirestoreDoc;
  await r.set(redisKey, JSON.stringify(payload));

  const fsEnabled = deps.firestoreEnabled ? deps.firestoreEnabled() : isFirestoreConfigured();
  if (!fsEnabled) return { redis: 'ok', firestore: 'skipped' };

  try {
    const res = await setDoc(firestorePath, payload);
    if (!res.ok && !res.skipped) throw new Error('firestore_write_not_confirmed');
    return { redis: 'ok', firestore: res.skipped ? 'skipped' : 'ok' };
  } catch (err) {
    console.warn('[hybridStore] Firestore L2 queued after failure:', err);
    await r.lpush(SYNC_DLQ_KEY, JSON.stringify({ redisKey, firestorePath, queuedAt: Date.now(), attempts: 0 }));
    await r.ltrim(SYNC_DLQ_KEY, 0, DLQ_MAX_LEN - 1);
    return { redis: 'ok', firestore: 'queued' };
  }
}

const APPSTATE_CAS_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local currentRev = 0
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then currentRev = tonumber(decoded.revision) or 0 end
end
if currentRev ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

export type SyncCasWriteResult =
  | {
      ok: true;
      source: 'redis' | 'firestore' | 'none';
      storage: { redis: 'ok'; firestore: 'ok' | 'queued' | 'skipped' };
      envelope: CloudAppEnvelope;
    }
  | { ok: false; status: 413 | 409; error: string };

export async function mergeAndWriteHybridEnvelope(
  redisKey: string,
  firestorePath: string,
  rawEnvelope: Partial<CloudAppEnvelope>,
  deps: HybridStorageDeps,
): Promise<SyncCasWriteResult> {
  const r = deps.redisClient;
  const fsEnabled = deps.firestoreEnabled ? deps.firestoreEnabled() : isFirestoreConfigured();

  for (let attempt = 0; attempt < 3; attempt++) {
    const currentDoc = await readHybridDocumentWithRedis<CloudAppEnvelope & Record<string, unknown>>(
      redisKey,
      firestorePath,
      deps,
    );
    const merged = mergeAppEnvelopes(rawEnvelope, currentDoc.data);
    const serialized = serializeBoundedEnvelope(merged);
    if (serialized.ok === false) {
      return { ok: false, status: 413, error: 'sync_payload_too_large' };
    }

    if (typeof r.eval === 'function') {
      const expectedRev = Number(currentDoc.data?.revision) || 0;
      const updated = Number(await r.eval<number>(APPSTATE_CAS_SCRIPT, [redisKey], [expectedRev, serialized.json]));
      if (updated !== 1) continue;
    } else {
      await r.set(redisKey, serialized.json);
    }

    let firestoreStatus: 'ok' | 'queued' | 'skipped' = 'skipped';
    if (fsEnabled) {
      try {
        const res = await replicateFirestoreEnvelope(firestorePath, merged, deps);
        if (!res.ok && !res.skipped) throw new Error('firestore_write_not_confirmed');
        firestoreStatus = res.skipped ? 'skipped' : 'ok';
      } catch (err) {
        console.warn('[hybridStore] Firestore L2 queued after failure:', err);
        await r.lpush(SYNC_DLQ_KEY, JSON.stringify({ redisKey, firestorePath, queuedAt: Date.now(), attempts: 0 }));
        await r.ltrim(SYNC_DLQ_KEY, 0, DLQ_MAX_LEN - 1);
        firestoreStatus = 'queued';
      }
    }

    return {
      ok: true,
      source: currentDoc.source,
      storage: { redis: 'ok', firestore: firestoreStatus },
      envelope: merged,
    };
  }

  return { ok: false, status: 409, error: 'sync_concurrent_conflict' };
}

export async function drainFirestoreRetryQueueWithRedis(
  maxBatch: number,
  deps: HybridStorageDeps,
): Promise<number> {
  const r = deps.redisClient;
  const setDoc = deps.setDoc || setFirestoreDoc;
  const fsEnabled = deps.firestoreEnabled ? deps.firestoreEnabled() : isFirestoreConfigured();
  if (!fsEnabled) return 0;

  let synced = 0;
  for (let i = 0; i < maxBatch; i++) {
    const raw = await r.rpop(SYNC_DLQ_KEY);
    if (!raw) break;
    const job = parseStoredJson<{ redisKey?: string; firestorePath?: string; queuedAt?: number; attempts?: number }>(raw);
    if (!job?.redisKey || !job?.firestorePath) continue;
    try {
      const latest = parseStoredJson<Record<string, unknown>>(await r.get(job.redisKey));
      if (!latest) continue;
      const result = job.firestorePath.startsWith('apprendre_states/')
        ? await replicateFirestoreEnvelope(job.firestorePath, latest as Partial<CloudAppEnvelope>, deps)
        : await setDoc(job.firestorePath, latest);
      if (!result.ok || result.skipped) throw new Error('firestore_write_not_confirmed');
      synced++;
    } catch {
      const nextAttempts = (Number(job.attempts) || 0) + 1;
      if (nextAttempts >= DLQ_MAX_ATTEMPTS) {
        await r.lpush(SYNC_DLQ_DEAD_KEY, JSON.stringify({ ...job, attempts: nextAttempts, deadAt: Date.now() }));
        await r.ltrim(SYNC_DLQ_DEAD_KEY, 0, DLQ_DEAD_MAX_LEN - 1);
        continue;
      }
      await r.rpush(SYNC_DLQ_KEY, JSON.stringify({ ...job, attempts: nextAttempts }));
      break;
    }
  }
  return synced;
}

export async function readActiveAccountSessionWithRedis(
  token: string,
  r: HybridRedisClient,
): Promise<{ claims: AccountTokenClaims; user: Record<string, unknown> } | null> {
  const claims = verifyAccountSessionToken(token);
  if (!claims) return null;

  const tombstone = await r.get(`user:tombstone:${claims.sub}`);
  if (tombstone) return null;

  const user = parseStoredJson<Record<string, unknown>>(await r.get(`user:id:${claims.sub}`));
  if (!user || user.accountId !== claims.sub || Number(user.authVersion || 1) !== claims.av) {
    return null;
  }

  const phone = normalizeAccountPhone(user.phone);
  if (/^\+\d{8,15}$/.test(phone)) {
    const digits = phone.slice(1);
    for (const variant of [phone, digits, `00${digits}`]) {
      const aliasRaw = await r.get(`user:phone:${variant}`);
      if (!aliasRaw) continue;
      if (typeof aliasRaw === 'string' && !aliasRaw.trim().startsWith('{')) {
        return aliasRaw === claims.sub ? { claims, user } : null;
      }
      const legacy = parseStoredJson<Record<string, unknown>>(aliasRaw);
      return legacy?.accountId === claims.sub ? { claims, user } : null;
    }
    return null;
  }

  const googleSub = typeof user.googleSub === 'string' ? user.googleSub.trim() : '';
  const identityKey = typeof user.authIdentityKey === 'string' && user.authIdentityKey.startsWith('idx:')
    ? user.authIdentityKey
    : googleSub ? `idx:google:${googleSub}` : '';
  if (identityKey) {
    const linkedId = String((await r.get(identityKey)) || '').trim();
    return linkedId === claims.sub ? { claims, user } : null;
  }

  return null;
}

export async function upsertGoogleAccountWithRedis(
  identity: VerifiedGoogleIdentity,
  overrides: { classId?: string; className?: string; firstName?: string; lastName?: string; schoolName?: string } = {},
  deps: HybridStorageDeps,
): Promise<{ user: Record<string, unknown>; isNew: boolean; storage: { redis: 'ok'; firestore: 'ok' | 'queued' | 'skipped' } }> {
  const r = deps.redisClient;
  // Firebase UIDs are project-scoped and may equal an unrelated Google subject.
  const subKey = identity.provider === 'firebase'
    ? `idx:firebase:${identity.issuer}:${identity.sub}`
    : `idx:google:${identity.sub}`;
  const emailKey = identity.email && identity.emailVerified ? `idx:email:${identity.email}` : '';

  let accountId = String((await r.get(subKey)) || '').trim();
  if (!accountId && emailKey) accountId = String((await r.get(emailKey)) || '').trim();

  let existing: Record<string, unknown> | null = null;
  if (accountId) {
    const loaded = await readHybridDocumentWithRedis<Record<string, unknown>>(`user:id:${accountId}`, `users/${accountId}`, deps);
    existing = loaded.data;
  }

  const isNew = !existing;
  if (!accountId) accountId = `g_${randomUUID()}`;
  const nowIso = new Date().toISOString();

  const ovFirst = overrides.firstName ? cleanControlText(overrides.firstName, 60) : '';
  const ovLast = overrides.lastName ? cleanControlText(overrides.lastName, 60) : '';
  const ovClassId = isValidAppClassId(overrides.classId, true) ? overrides.classId.trim() : '';
  const ovClassName = overrides.className ? cleanControlText(overrides.className, 80) : '';
  const ovSchoolName = overrides.schoolName ? cleanControlText(overrides.schoolName, 100) : '';

  const previousClassId = typeof existing?.classId === 'string' ? existing.classId.trim() : '';
  const nextClassId = existing?.role === 'prof'
    ? String(existing?.classId || '')
    : (ovClassId || previousClassId || '2eme-bac-sc-ex');

  const mergedUser: Record<string, unknown> = {
    ...(existing || {}),
    accountId,
    authVersion: Math.max(1, Number(existing?.authVersion) || 1),
    role: existing?.role === 'prof' ? 'prof' : 'student',
    requestedRole: existing?.requestedRole === 'prof' ? 'prof' : 'student',
    ...(identity.provider === 'google' ? { googleSub: identity.sub } : {}),
    authSubject: identity.sub,
    authIdentityKey: subKey,
    authProvider: identity.provider,
    email: identity.email || existing?.email || '',
    emailVerified: identity.emailVerified || existing?.emailVerified || false,
    picture: identity.picture || existing?.picture || '',
    firstName: ovFirst || existing?.firstName || identity.firstName || 'Élève',
    lastName: ovLast || existing?.lastName || identity.lastName || '',
    classId: nextClassId,
    className: ovClassName || existing?.className || '',
    schoolName: ovSchoolName || existing?.schoolName || '',
    phone: existing?.phone || '',
    passwordSet: Boolean(existing?.passwordHash),
    createdAt: existing?.createdAt || nowIso,
    lastLoginAt: nowIso,
  };
  mergedUser.name = `${mergedUser.firstName} ${mergedUser.lastName}`.trim() || identity.name || 'Élève';

  await r.set(subKey, accountId);
  if (emailKey) await r.set(emailKey, accountId);
  await r.sadd('users:all', accountId);
  if (previousClassId && previousClassId !== nextClassId && typeof r.srem === 'function') {
    await r.srem(`users:class:${previousClassId}`, accountId);
  }
  if (mergedUser.classId) await r.sadd(`users:class:${mergedUser.classId}`, accountId);

  const storage = await writeHybridDocumentWithRedis(`user:id:${accountId}`, `users/${accountId}`, mergedUser, deps);
  return { user: mergedUser, isNew, storage };
}
