/**
 * Verification RS256 des jetons Google Identity Services (GIS) & Firebase Auth,
 * sessions compte HMAC-SHA256 et helpers securite HTTP partages.
 * Pur Node (`node:crypto` + `fetch`), zero dependance binaire externe,
 * pret pour Vercel Serverless et Next.js App Router.
 */
import { createHash, createHmac, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

export type AuthProviderKind = 'google' | 'firebase';

export const ACCOUNT_SESSION_COOKIE = 'mathplus_account_session';
export const PROFESSOR_SESSION_COOKIE = 'mathplus_prof_session';
export const ACCOUNT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export const VALID_APP_CLASS_IDS = new Set<string>([
  'tronc-commun-sc',
  '1ere-bac-sc-ex',
  '1ere-bac-sc-math',
  '2eme-bac-sc-ex',
  '2eme-bac-sc-math',
]);

const CLASS_ID_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
const ACCOUNT_ID_RE = /^[A-Za-z0-9:_-]{2,128}$/;

export interface AccountTokenClaims {
  v: 1;
  sub: string;
  av: number;
  trust: 'self' | 'admin';
  iat: number;
  exp: number;
}

export interface VerifiedGoogleIdentity {
  provider: AuthProviderKind;
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  firstName: string;
  lastName: string;
  picture: string;
  issuer: string;
  audience: string;
  expiresAt: number;
}

export interface VerifyTokenOptions {
  googleClientId?: string;
  firebaseProjectId?: string;
  nowSec?: () => number;
  fetchFn?: typeof fetch;
  requireVerifiedEmail?: boolean;
}

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SEC = 60;
const FETCH_TIMEOUT_MS = 8_000;

type JwkKey = Record<string, unknown> & { kid?: string; kty?: string; n?: string; e?: string };
const jwksCache = new Map<string, { expiresAtMs: number; keys: JwkKey[]; lastKeyRefreshMs?: number }>();
const jwksInFlight = new Map<string, Promise<JwkKey[]>>();

export function timeoutSignal(ms = FETCH_TIMEOUT_MS): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

export function clearJwksCache(): void {
  jwksCache.clear();
  jwksInFlight.clear();
}

function decodeBase64UrlJson<T = Record<string, unknown>>(part: string): T | null {
  try {
    const raw = Buffer.from(part, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function parseMaxAgeMs(cacheControl: string | null): number {
  const m = /max-age=(\d+)/i.exec(cacheControl || '');
  const sec = m ? Number(m[1]) : 3600;
  return Math.max(60, Math.min(86400, Number.isFinite(sec) ? sec : 3600)) * 1000;
}

async function fetchJwksKeys(url: string, fetchFn: typeof fetch, nowMs: number, refresh = false): Promise<JwkKey[]> {
  const cached = jwksCache.get(url);
  if (!refresh && cached && cached.expiresAtMs > nowMs) return cached.keys;
  const pending = jwksInFlight.get(url);
  if (pending) return pending;

  const loading = (async () => {
    const res = await fetchFn(url, {
      headers: { Accept: 'application/json' },
      signal: timeoutSignal(),
    });
    if (!res.ok) throw new Error(`jwks_fetch_failed:${res.status}`);
    const body = (await res.json()) as { keys?: JwkKey[] };
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    if (!keys.length) throw new Error('jwks_empty');

    const ttlMs = parseMaxAgeMs(res.headers.get('cache-control'));
    jwksCache.set(url, { keys, expiresAtMs: nowMs + ttlMs, lastKeyRefreshMs: refresh ? nowMs : cached?.lastKeyRefreshMs });
    return keys;
  })();
  jwksInFlight.set(url, loading);
  try {
    return await loading;
  } finally {
    jwksInFlight.delete(url);
  }
}

function splitNameParts(fullName: string, given: unknown, family: unknown): [string, string, string] {
  const fn = typeof given === 'string' ? given.trim() : '';
  const ln = typeof family === 'string' ? family.trim() : '';
  const cleanFull = fullName.trim() || [fn, ln].filter(Boolean).join(' ').trim();
  if (fn || ln) return [cleanFull || 'Élève', fn, ln];
  const parts = cleanFull.split(/\s+/).filter(Boolean);
  return [cleanFull || 'Élève', parts[0] || cleanFull || 'Élève', parts.slice(1).join(' ')];
}

export async function verifyGoogleOrFirebaseToken(
  idToken: string,
  options: VerifyTokenOptions = {},
): Promise<VerifiedGoogleIdentity> {
  const token = String(idToken || '').trim();
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('invalid_token_format');

  const [headerB64, payloadB64, sigB64] = segments;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(headerB64);
  const claims = decodeBase64UrlJson<Record<string, any>>(payloadB64);
  if (!header || !claims) throw new Error('invalid_token_json');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unsupported_token_alg');

  const nowSec = (options.nowSec || (() => Math.floor(Date.now() / 1000)))();
  const exp = claims.exp;
  const iat = claims.iat;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= nowSec - CLOCK_SKEW_SEC) throw new Error('token_expired');
  if (typeof iat !== 'number' || !Number.isFinite(iat) || iat <= 0 || iat > nowSec + CLOCK_SKEW_SEC || iat >= exp) throw new Error('token_iat_invalid');

  const googleClientId = (options.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
  const firebaseProjectId = (options.firebaseProjectId ?? process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '').trim();

  const iss = String(claims.iss || '');
  const aud = String(claims.aud || '');
  const isFirebase = Boolean(firebaseProjectId && iss === `https://securetoken.google.com/${firebaseProjectId}`);
  const isGoogle = Boolean(googleClientId && (iss === 'https://accounts.google.com' || iss === 'accounts.google.com'));

  if (!isFirebase && !isGoogle) throw new Error('token_issuer_mismatch');
  if (isFirebase && aud !== firebaseProjectId) throw new Error('token_audience_mismatch');
  if (isGoogle && aud !== googleClientId) throw new Error('token_audience_mismatch');

  const authTime = claims.auth_time;
  if ((isFirebase || authTime !== undefined) && (
    typeof authTime !== 'number' || !Number.isFinite(authTime)
    || authTime <= 0 || authTime > nowSec + CLOCK_SKEW_SEC
  )) throw new Error('token_auth_time_invalid');

  const sub = typeof claims.sub === 'string' ? claims.sub.trim() : '';
  if (!sub || sub.length > 128) throw new Error('token_subject_invalid');

  const fetchFn = options.fetchFn || globalThis.fetch;
  const certsUrl = isFirebase ? FIREBASE_CERTS_URL : GOOGLE_CERTS_URL;
  let keys = await fetchJwksKeys(certsUrl, fetchFn, nowSec * 1000);
  let matchingKey = keys.find((k) => k.kid === header.kid);
  const cached = jwksCache.get(certsUrl);
  // Refresh once on rotation, with a cooldown so arbitrary kid values cannot flood Google.
  if (!matchingKey && cached && (!cached.lastKeyRefreshMs || nowSec * 1000 - cached.lastKeyRefreshMs >= 60_000)) {
    cached.lastKeyRefreshMs = nowSec * 1000;
    keys = await fetchJwksKeys(certsUrl, fetchFn, nowSec * 1000, true);
    matchingKey = keys.find((k) => k.kid === header.kid);
  }
  if (!matchingKey) throw new Error('token_kid_not_found');

  const publicKey = createPublicKey({ key: matchingKey as any, format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const sigBuf = Buffer.from(sigB64, 'base64url');
  if (!verifier.verify(publicKey, sigBuf)) throw new Error('token_signature_invalid');

  const email = String(claims.email || '').trim().toLowerCase();
  const emailVerified = claims.email_verified === true;
  if (options.requireVerifiedEmail !== false && email && !emailVerified) {
    throw new Error('email_not_verified');
  }

  const [fullName, firstName, lastName] = splitNameParts(
    String(claims.name || ''),
    claims.given_name,
    claims.family_name,
  );

  return {
    provider: isFirebase ? 'firebase' : 'google',
    sub,
    email,
    emailVerified,
    name: fullName,
    firstName,
    lastName,
    picture: typeof claims.picture === 'string' && /^https:\/\//i.test(claims.picture) ? claims.picture : '',
    issuer: iss,
    audience: aud,
    expiresAt: exp,
  };
}

export interface PublicCloudConfig {
  googleEnabled: boolean;
  googleClientId: string;
  firebaseEnabled: boolean;
  firestoreEnabled: boolean;
  redisEnabled: boolean;
  firebaseWebConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
  } | null;
}

export function getPublicCloudConfig(): PublicCloudConfig {
  const googleClientId = (process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim();
  const apiKey = (process.env.FIREBASE_WEB_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').trim();
  const authDomain = (process.env.FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '')).trim();
  const hasServiceAccount = Boolean(
    projectId
    && (process.env.FIREBASE_CLIENT_EMAIL || '').trim()
    && (process.env.FIREBASE_PRIVATE_KEY || '').trim(),
  );
  const redisEnabled = Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim()
    && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
  );

  return {
    googleEnabled: Boolean(googleClientId),
    googleClientId,
    firebaseEnabled: Boolean(projectId && apiKey),
    firestoreEnabled: hasServiceAccount,
    redisEnabled,
    firebaseWebConfig: projectId && apiKey ? { apiKey, authDomain, projectId } : null,
  };
}

// ── Helpers partages Auth, Session & Validation HTTP ──────────────────────────

export function secretsMatchConstantTime(received: string | null | undefined, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function cleanControlText(value: unknown, maxLen: number): string {
  let clean = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0) || 0;
    if (code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) continue;
    clean += ch;
  }
  return clean.trim().slice(0, maxLen);
}

export function isValidAppClassId(value: unknown, allowAnySlug = false): value is string {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean) return false;
  return VALID_APP_CLASS_IDS.has(clean) || (allowAnySlug && CLASS_ID_SLUG_RE.test(clean));
}

export function normalizeAccountPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || !/^(?:\+|00)?[0-9\s().-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  return digits ? `+${digits}` : '';
}

export function getAccountSessionSecret(): string {
  return process.env.ACCOUNT_SESSION_SECRET || process.env.PROF_SESSION_SECRET || '';
}

export function issueAccountSessionToken(
  accountId: string,
  authVersion: number,
  trust: 'self' | 'admin' = 'self',
): string | null {
  const secret = getAccountSessionSecret();
  if (!secret || !ACCOUNT_ID_RE.test(accountId)) return null;
  const now = Math.floor(Date.now() / 1000);
  const claims: AccountTokenClaims = {
    v: 1,
    sub: accountId,
    av: Math.max(1, Math.trunc(Number(authVersion) || 1)),
    trust,
    iat: now,
    exp: now + ACCOUNT_COOKIE_MAX_AGE,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAccountSessionToken(token: string): AccountTokenClaims | null {
  const secret = getAccountSessionSecret();
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccountTokenClaims>;
    if (
      parsed.v !== 1
      || typeof parsed.sub !== 'string'
      || !ACCOUNT_ID_RE.test(parsed.sub)
      || !Number.isInteger(parsed.av)
      || (parsed.av ?? 0) < 1
      || !Number.isInteger(parsed.iat)
      || !Number.isInteger(parsed.exp)
      || (parsed.exp ?? 0) <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { ...parsed, trust: parsed.trust === 'admin' ? 'admin' : 'self' } as AccountTokenClaims;
  } catch {
    return null;
  }
}

export function readCookieFromHeader(cookieHeader: string, name: string): string {
  if (!cookieHeader) return '';
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const sep = trimmed.indexOf('=');
    if (sep < 0 || trimmed.slice(0, sep) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(sep + 1));
    } catch {
      return '';
    }
  }
  return '';
}

export function buildSessionCookieHeader(name: string, token: string | null, maxAge = ACCOUNT_COOKIE_MAX_AGE): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = token ? encodeURIComponent(token) : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? maxAge : 0}${secure}`;
}

export function sanitizePublicUser(user: Record<string, unknown>) {
  return {
    accountId: String(user.accountId || ''),
    name: String(user.name || 'Élève'),
    firstName: String(user.firstName || ''),
    lastName: String(user.lastName || ''),
    email: String(user.email || ''),
    emailVerified: Boolean(user.emailVerified),
    picture: String(user.picture || ''),
    authProvider: String(user.authProvider || 'phone'),
    phone: String(user.phone || ''),
    classId: String(user.classId || ''),
    className: String(user.className || ''),
    schoolName: String(user.schoolName || ''),
    dashboardTheme: user.dashboardTheme ? String(user.dashboardTheme) : undefined,
    role: user.role === 'prof' ? 'prof' : 'student',
    requestedRole: user.requestedRole === 'prof' ? 'prof' : 'student',
    passwordSet: Boolean(user.passwordSet || user.passwordHash),
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export function mapAuthErrorStatus(code: string): number {
  if (
    code.startsWith('invalid_token')
    || code.startsWith('token_')
    || code === 'unsupported_token_alg'
    || code === 'email_not_verified'
  ) {
    return 401;
  }
  return 500;
}

export function isSameOriginMutation(request: Request): boolean {
  const secFetchSite = (request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') return false;

  const origin = (request.headers.get('origin') || '').trim();
  if (!origin) return true;
  if (origin === 'null') return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const forwardedHost = (request.headers.get('x-forwarded-host') || '').split(',')[0].trim();
  const host = forwardedHost || (request.headers.get('host') || '').trim();
  if (host) {
    const protoHeader = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
    const reqUrl = new URL(request.url);
    const expectedProto = protoHeader ? `${protoHeader}:` : reqUrl.protocol;
    return originUrl.host === host && originUrl.protocol === expectedProto;
  }

  try {
    return originUrl.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isSameOriginHeaders(
  headers: Record<string, string | undefined> | undefined,
): boolean {
  if (!headers) return true;
  const secFetchSite = String(headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') return false;
  const origin = String(headers.origin || '').trim();
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    const originUrl = new URL(origin);
    const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
    if (!host) return true;
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export type BoundedJsonResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: 400 | 413; error: 'payload_too_large' | 'invalid_json' | 'invalid_json_object' };

export async function readBoundedJsonRequest(
  request: Request,
  maxBytes: number,
  options: { allowEmpty?: boolean } = {},
): Promise<BoundedJsonResult> {
  const contentLengthRaw = request.headers.get('content-length');
  if (contentLengthRaw !== null) {
    const len = Number(contentLengthRaw);
    if (Number.isFinite(len) && len > maxBytes) {
      return { ok: false, status: 413, error: 'payload_too_large' };
    }
  }

  let rawText = '';
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, error: 'payload_too_large' };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, status: 400, error: 'invalid_json' };
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder('utf-8', { fatal: false }).decode(merged);
  } else {
    rawText = await request.text().catch(() => '');
    if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
      return { ok: false, status: 413, error: 'payload_too_large' };
    }
  }

  if (!rawText.trim()) {
    return options.allowEmpty
      ? { ok: true, data: {} }
      : { ok: false, status: 400, error: 'invalid_json_object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: 'invalid_json_object' };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

export function parseLegacyJsonObject(
  rawBody: unknown,
  options: { allowEmpty?: boolean; maxBytes?: number } = {},
): BoundedJsonResult {
  if (rawBody === undefined || rawBody === '') {
    return options.allowEmpty
      ? { ok: true, data: {} }
      : { ok: false, status: 400, error: 'invalid_json_object' };
  }
  if (typeof rawBody === 'string') {
    if (options.maxBytes && Buffer.byteLength(rawBody, 'utf8') > options.maxBytes) {
      return { ok: false, status: 413, error: 'payload_too_large' };
    }
    if (!rawBody.trim()) {
      return options.allowEmpty
        ? { ok: true, data: {} }
        : { ok: false, status: 400, error: 'invalid_json_object' };
    }
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, status: 400, error: 'invalid_json_object' };
      }
      return { ok: true, data: parsed as Record<string, unknown> };
    } catch {
      return { ok: false, status: 400, error: 'invalid_json' };
    }
  }
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return { ok: false, status: 400, error: 'invalid_json_object' };
  }
  if (options.maxBytes && Buffer.byteLength(JSON.stringify(rawBody), 'utf8') > options.maxBytes) {
    return { ok: false, status: 413, error: 'payload_too_large' };
  }
  return { ok: true, data: rawBody as Record<string, unknown> };
}
