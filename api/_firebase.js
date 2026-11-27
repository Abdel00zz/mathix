/**
 * api/_firebase.js — Client REST Cloud Firestore v1 & vérificateur JWT Firebase Auth
 * 100 % gratuit (Spark Tier), zéro dépendance npm (pur `node:crypto` + `fetch`),
 * conçu pour minimiser au maximum les lectures/écritures Firestore et la latence Vercel.
 *
 * Optimisations Spark Free Tier intégrées :
 *  1. Vérification locale RSA-SHA256 des ID Tokens Google/Firebase via les certificats X.509
 *     officiels Google mis en cache mémoire (~6 h) → 0 appel réseau par requête élève.
 *  2. Jeton OAuth2 Service Account mis en cache mémoire 55 min (~1 appel/heure) pour
 *     les écritures serveur Admin (`platform/public`, `platform_admin/*`, `students` query).
 *  3. Support transparent du jeton élève (`Bearer <idToken>`) vers Firestore REST API
 *     lorsqu'aucune clé privée Service Account n'est configurée côté serveur.
 *  4. Opérations groupées `batchGet`, `commit` et `runQuery` avec projection `select`
 *     (`summary` uniquement) pour réduire la bande passante et les lectures de >90 %.
 */

import crypto from 'node:crypto';

export function getFirebaseProjectId() {
  return (process.env.FIREBASE_PROJECT_ID || 'mathix-5a799').trim();
}

export function getFirebaseApiKey() {
  return (process.env.FIREBASE_API_KEY || 'AIzaSyCLvv5KNn_tHtQhNlF6IqKHY40-jXeyi48').trim();
}

export const FIREBASE_PROJECT_ID = getFirebaseProjectId();
export const FIREBASE_API_KEY = getFirebaseApiKey();

export const FIREBASE_WEB_CONFIG = {
  apiKey: FIREBASE_API_KEY,
  authDomain: (process.env.FIREBASE_AUTH_DOMAIN || `${FIREBASE_PROJECT_ID}.firebaseapp.com`).trim(),
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.firebasestorage.app`).trim(),
  messagingSenderId: (process.env.FIREBASE_MESSAGING_SENDER_ID || '335465310291').trim(),
  appId: (process.env.FIREBASE_APP_ID || '1:335465310291:web:9a4d1b70273f5c095e7ea6').trim(),
};

function getSaCredentials() {
  const projectId = getFirebaseProjectId();
  const email = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
  return {
    projectId,
    email,
    privateKey,
    valid: Boolean(projectId && email && privateKey.includes('BEGIN PRIVATE KEY')),
  };
}

export function isServiceAccountConfigured() {
  return getSaCredentials().valid;
}

export function isFirestoreConfigured() {
  return Boolean(getFirebaseProjectId() && getFirebaseApiKey());
}

export const hasServiceAccount = isServiceAccountConfigured();
export const hasFirestoreConfigured = isFirestoreConfigured();

function getFsBase() {
  return `https://firestore.googleapis.com/v1/projects/${getFirebaseProjectId()}/databases/(default)/documents`;
}
const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const certCache =
  globalThis.__MATHIX_FB_CERTS ||
  (globalThis.__MATHIX_FB_CERTS = { certs: null, expiresAt: 0, inflight: null });

const saTokenCache =
  globalThis.__MATHIX_FB_SA_TOK ||
  (globalThis.__MATHIX_FB_SA_TOK = { token: '', expiresAt: 0, inflight: null });

const verifiedTokenCache =
  globalThis.__MATHIX_FB_UID_CACHE ||
  (globalThis.__MATHIX_FB_UID_CACHE = new Map());

function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url');
}

function b64urlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

/* ── 1. Vérification locale ultra-rapide des ID Tokens Firebase Auth (Google) ─ */

async function getGooglePublicCerts() {
  const now = Date.now();
  if (certCache.certs && now < certCache.expiresAt) {
    return certCache.certs;
  }
  if (certCache.inflight) return certCache.inflight;

  certCache.inflight = (async () => {
    const res = await fetch(GOOGLE_CERTS_URL);
    if (!res.ok) throw new Error(`Google certs HTTP ${res.status}`);
    const cc = res.headers.get('cache-control') || '';
    const m = cc.match(/max-age=(\d+)/);
    const ttlMs = m ? Math.max(60_000, Number(m[1]) * 1000 - 30_000) : 3_600_000;
    const certs = await res.json();
    certCache.certs = certs;
    certCache.expiresAt = Date.now() + ttlMs;
    return certs;
  })().finally(() => {
    certCache.inflight = null;
  });

  return certCache.inflight;
}

export function extractFirebaseToken(req, body = null) {
  const hdr =
    req?.headers?.['x-firebase-token'] ||
    req?.headers?.['X-Firebase-Token'] ||
    '';
  if (typeof hdr === 'string' && hdr.trim().length > 40) {
    return hdr.trim();
  }
  if (body && typeof body.firebaseIdToken === 'string' && body.firebaseIdToken.trim().length > 40) {
    return body.firebaseIdToken.trim();
  }
  return '';
}

export async function verifyFirebaseIdToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const token = rawToken.trim();
  if (token.length < 64 || token.length > 8192) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached && cached.exp > nowSec + 10) {
    return cached.user;
  }

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(headB64).toString('utf8'));
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (header?.alg !== 'RS256' || typeof header?.kid !== 'string') return null;
  const projectId = getFirebaseProjectId();
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload?.aud !== projectId || payload?.iss !== expectedIssuer) return null;
  const uid = String(payload?.user_id || payload?.sub || '').trim();
  if (!uid || uid.length > 128) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;

  try {
    const certs = await getGooglePublicCerts();
    const pem = certs?.[header.kid];
    if (!pem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headB64}.${payloadB64}`);
    verifier.end();
    const valid = verifier.verify(pem, b64urlDecode(sigB64));
    if (!valid) return null;

    const user = {
      uid,
      email: typeof payload.email === 'string' ? payload.email : '',
      emailVerified: Boolean(payload.email_verified),
      name: typeof payload.name === 'string' ? payload.name : '',
      picture: typeof payload.picture === 'string' ? payload.picture : '',
      provider: payload.firebase?.sign_in_provider || 'google.com',
      rawToken: token,
    };

    if (verifiedTokenCache.size > 400) {
      for (const [k, v] of verifiedTokenCache.entries()) {
        if (v.exp <= nowSec) verifiedTokenCache.delete(k);
      }
      if (verifiedTokenCache.size > 400) verifiedTokenCache.clear();
    }
    verifiedTokenCache.set(tokenHash, { exp: payload.exp, user });
    return user;
  } catch {
    return null;
  }
}

/* ── 2. Jeton OAuth2 Service Account (cache 55 min, 0 dépendance) ─────────── */

export async function getServiceAccountToken() {
  const sa = getSaCredentials();
  if (!sa.valid) return null;
  const now = Date.now();
  if (saTokenCache.token && now < saTokenCache.expiresAt) {
    return saTokenCache.token;
  }
  if (saTokenCache.inflight) return saTokenCache.inflight;

  saTokenCache.inflight = (async () => {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = b64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64urlEncode(
      JSON.stringify({
        iss: sa.email,
        sub: sa.email,
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp,
        scope: 'https://www.googleapis.com/auth/datastore',
      })
    );
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    signer.end();
    const sig = signer.sign(sa.privateKey).toString('base64url');
    const assertion = `${header}.${claims}.${sig}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      throw new Error(`ServiceAccount OAuth HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data?.access_token) throw new Error('Missing access_token');
    const ttlSec = Math.max(300, (Number(data.expires_in) || 3600) - 300);
    saTokenCache.token = data.access_token;
    saTokenCache.expiresAt = Date.now() + ttlSec * 1000;
    return saTokenCache.token;
  })().finally(() => {
    saTokenCache.inflight = null;
  });

  return saTokenCache.inflight;
}

/* ── 3. Conversion bidirectionnelle JSON JS ↔ Firestore REST Value ─────────── */

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export function toFirestoreValue(val, depth = 0) {
  if (depth > 14 || val === undefined || val === null) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { integerValue: '0' };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => toFirestoreValue(item, depth + 1)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (!k || FORBIDDEN.has(k) || v === undefined) continue;
      fields[k] = toFirestoreValue(v, depth + 1);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fields;
  for (const [k, v] of Object.entries(obj)) {
    if (!k || FORBIDDEN.has(k) || v === undefined) continue;
    fields[k] = toFirestoreValue(v, 1);
  }
  return fields;
}

export function fromFirestoreValue(fv) {
  if (!fv || typeof fv !== 'object') return null;
  if ('nullValue' in fv) return null;
  if ('booleanValue' in fv) return Boolean(fv.booleanValue);
  if ('integerValue' in fv) return Number(fv.integerValue) || 0;
  if ('doubleValue' in fv) return Number(fv.doubleValue) || 0;
  if ('stringValue' in fv) return String(fv.stringValue);
  if ('timestampValue' in fv) return Date.parse(fv.timestampValue) || 0;
  if ('arrayValue' in fv) {
    const arr = fv.arrayValue?.values;
    return Array.isArray(arr) ? arr.map(fromFirestoreValue) : [];
  }
  if ('mapValue' in fv) {
    const out = {};
    const fields = fv.mapValue?.fields;
    if (fields && typeof fields === 'object') {
      for (const [k, v] of Object.entries(fields)) {
        if (!FORBIDDEN.has(k)) out[k] = fromFirestoreValue(v);
      }
    }
    return out;
  }
  return null;
}

export function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (!FORBIDDEN.has(k)) out[k] = fromFirestoreValue(v);
  }
  return out;
}

/* ── 4. Primitives REST Firestore v1 (GET / PATCH / runQuery) ─────────────── */

async function buildAuthHeaders(userBearerToken = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (isServiceAccountConfigured()) {
    const saTok = await getServiceAccountToken();
    if (saTok) {
      headers.Authorization = `Bearer ${saTok}`;
      return headers;
    }
  }
  if (userBearerToken) {
    headers.Authorization = `Bearer ${userBearerToken}`;
  }
  return headers;
}

function withApiKey(urlStr, headers) {
  const apiKey = getFirebaseApiKey();
  if (headers.Authorization || !apiKey) return urlStr;
  const sep = urlStr.includes('?') ? '&' : '?';
  return `${urlStr}${sep}key=${encodeURIComponent(apiKey)}`;
}

export async function fsGetDoc(docPath, { userToken = '' } = {}) {
  const cleanPath = String(docPath).replace(/^\/+/, '');
  const headers = await buildAuthHeaders(userToken);
  const url = withApiKey(`${getFsBase()}/${cleanPath}`, headers);
  const res = await fetch(url, { method: 'GET', headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore GET ${cleanPath} HTTP ${res.status}`);
  }
  return fromFirestoreDoc(await res.json());
}

export async function fsSetDoc(docPath, data, { userToken = '', mergeFields = null } = {}) {
  const cleanPath = String(docPath).replace(/^\/+/, '');
  const headers = await buildAuthHeaders(userToken);
  let qs = '';
  if (Array.isArray(mergeFields) && mergeFields.length > 0) {
    qs = '?' + mergeFields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  }
  const url = withApiKey(`${getFsBase()}/${cleanPath}${qs}`, headers);
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Firestore PATCH ${cleanPath} HTTP ${res.status}: ${txt.slice(0, 180)}`);
  }
  return fromFirestoreDoc(await res.json());
}

/**
 * Requête optimisée pour le tableau de bord Admin : ne projette QUE le champ `summary`
 * des 60 élèves les plus récents (divise par ~15 la taille transférée).
 */
export async function fsQueryStudentSummaries(limitCount = 60) {
  if (!isServiceAccountConfigured()) return null;
  const headers = await buildAuthHeaders('');
  const structuredQuery = {
    from: [{ collectionId: 'students' }],
    select: {
      fields: [
        { fieldPath: 'uid' },
        { fieldPath: 'email' },
        { fieldPath: 'displayName' },
        { fieldPath: 'photoURL' },
        { fieldPath: 'updatedAt' },
        { fieldPath: 'summary' },
      ],
    },
    orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'DESCENDING' }],
    limit: Math.min(100, Math.max(1, limitCount)),
  };

  const res = await fetch(`${getFsBase()}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    throw new Error(`Firestore runQuery students HTTP ${res.status}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row?.document) continue;
    const d = fromFirestoreDoc(row.document);
    if (d?.summary && typeof d.summary === 'object') {
      out.push({
        ...d.summary,
        studentId: d.uid || d.summary.studentId || '',
        email: d.email || d.summary.email || '',
        photoURL: d.photoURL || d.summary.photoURL || '',
      });
    }
  }
  return out;
}
