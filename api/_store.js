/**
 * api/_store.js — Moteur de persistance multi-niveaux haute scalabilité (100 % Free Tier) :
 *   • Niveau 1 (L1 RAM)   : cache chaud par instance (TTL 15 s sur `platform/public`, 8 s Admin)
 *                           → absorbe les pics de trafic simultanés (0 lecture facturée répétée).
 *   • Niveau 2 (Redis)    : Upstash Redis / Vercel KV (compteurs atomiques O(1) `rev`/`pub_rev`,
 *                           résumés `students_meta`, anti-force-brute et révocation JTI distribués).
 *   • Niveau 3 (Firestore): Cloud Firestore Standard (`mathix-5a799`, Spark gratuit) :
 *                           - `platform/public`      (1 doc unique : overrides + config + pubRev)
 *                           - `platform_admin/state` (1 doc consolidé : adminAuth, users, history, events)
 *                           - `students/{uid}`       (1 doc CRDT par élève connecté via Google Auth)
 */

import {
  PROGRESS_NS,
  STUDENT_NS,
  VALID_NS,
  isPlainObject,
  isValidKey,
  isValidStudentId,
  mergeProgress,
  sanitizeStr,
  summarizeStudent,
} from './_crdt.js';
import {
  fsGetDoc,
  fsQueryStudentSummaries,
  fsSetDoc,
  getFirebaseProjectId,
  isFirestoreConfigured,
  isServiceAccountConfigured,
} from './_firebase.js';

export { VALID_NS, isValidKey, isValidStudentId };

function getKvConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return { url, token, enabled: Boolean(url && token) };
}

export function getPersistenceMode() {
  const kv = getKvConfig().enabled;
  const fsOk = isFirestoreConfigured();
  const saOk = isServiceAccountConfigured();
  if (kv && fsOk) return 'firestore+redis';
  if (fsOk) return saOk ? 'firestore' : 'firestore-user+memory';
  if (kv) return 'redis';
  return 'memory';
}

export const hasDurableKV = getKvConfig().enabled;
export const persistenceMode = getPersistenceMode();

const P = 'mathix:v2:';
const K_REV = `${P}rev`;
const K_PUB_REV = `${P}pub_rev`;
const K_EVENTS = `${P}events`;
const K_STUDENTS_META = `${P}students_meta`;
const K_ST_REV = `${P}st_rev`;
const K_ADMIN_AUTH = `${P}admin_auth`;
const K_TOKEN_SECRET = `${P}token_secret`;

const MAX_EVENTS = 200;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PUBLIC_CACHE_TTL_MS = 15_000;
const ADMIN_SUMMARIES_TTL_MS = 8_000;

const mem = globalThis.__MATHIX_CLOUD_DB || (globalThis.__MATHIX_CLOUD_DB = {
  rev: 1,
  pubRev: 1,
  namespaces: {
    users: [],
    overrides: {},
    config: {},
    history: {},
    'progress-core': {},
    'progress-quiz': {},
    'progress-exercises': {},
    'progress-revision': {},
    profile: {},
  },
  students: {},
  studentsMeta: {},
  stRev: {},
  events: [],
  adminAuth: null,
  tokenSecret: null,
  publicDocCache: { data: null, fetchedAt: 0 },
  adminStateCache: { data: null, fetchedAt: 0 },
  fsSummariesCache: { list: null, fetchedAt: 0 },
});

export async function kvPipeline(commands) {
  const { url, token } = getKvConfig();
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`Redis REST HTTP ${res.status}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Redis REST invalid pipeline response');
  return rows.map((r) => {
    if (r && r.error) throw new Error(`Redis error: ${r.error}`);
    return r?.result ?? null;
  });
}

export async function kvCmd(cmd) {
  const [result] = await kvPipeline([cmd]);
  return result;
}

function safeJsonParse(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* ── Helpers Firestore L1-cachés (zéro gaspillage de lectures Spark) ────── */

async function readFirestorePublicDoc({ force = false } = {}) {
  if (!isFirestoreConfigured()) return null;
  const now = Date.now();
  if (!force && mem.publicDocCache.data && now - mem.publicDocCache.fetchedAt < PUBLIC_CACHE_TTL_MS) {
    return mem.publicDocCache.data;
  }
  try {
    const doc = await fsGetDoc('platform/public');
    const exists = Boolean(doc);
    const normalized = {
      exists,
      pubRev: exists ? Math.max(1, Number(doc?.pubRev) || 1) : 0,
      updatedAt: Number(doc?.updatedAt) || 0,
      overrides: isPlainObject(doc?.overrides) ? doc.overrides : {},
      config: isPlainObject(doc?.config) ? doc.config : {},
    };
    mem.publicDocCache = { data: normalized, fetchedAt: now };
    if (normalized.pubRev > 0) {
      mem.pubRev = Math.max(mem.pubRev, normalized.pubRev);
    }
    if (exists && !getKvConfig().enabled) {
      mem.namespaces.overrides = normalized.overrides;
      mem.namespaces.config = normalized.config;
    }
    return normalized;
  } catch {
    return mem.publicDocCache.data || null;
  }
}

async function writeFirestorePublicDoc({ overrides, config, pubRev }) {
  if (!isServiceAccountConfigured()) return false;
  const payload = {
    pubRev: Math.max(1, Math.trunc(Number(pubRev) || 1)),
    updatedAt: Math.trunc(Date.now()),
    overrides: isPlainObject(overrides) ? overrides : {},
    config: isPlainObject(config) ? config : {},
  };
  await fsSetDoc('platform/public', payload);
  mem.publicDocCache = { data: { exists: true, ...payload }, fetchedAt: Date.now() };
  return true;
}

async function readFirestoreAdminState({ force = false } = {}) {
  if (!isServiceAccountConfigured()) return null;
  const now = Date.now();
  if (!force && mem.adminStateCache.data && now - mem.adminStateCache.fetchedAt < ADMIN_SUMMARIES_TTL_MS) {
    return mem.adminStateCache.data;
  }
  try {
    const doc = await fsGetDoc('platform_admin/state');
    const state = doc || {};
    mem.adminStateCache = { data: state, fetchedAt: now };
    return state;
  } catch {
    return mem.adminStateCache.data || null;
  }
}

async function patchFirestoreAdminState(fields) {
  if (!isServiceAccountConfigured()) return false;
  const keys = Object.keys(fields);
  if (!keys.length) return false;
  const saved = await fsSetDoc('platform_admin/state', fields, { mergeFields: keys });
  mem.adminStateCache = {
    data: { ...(mem.adminStateCache.data || {}), ...(saved || fields) },
    fetchedAt: Date.now(),
  };
  return true;
}

/* ── Santé globale (Firestore + Redis) ───────────────────────────────────── */

export async function pingStore() {
  const t0 = Date.now();
  const kvOn = getKvConfig().enabled;
  const fsOn = isFirestoreConfigured();
  const saOn = isServiceAccountConfigured();
  let redisOk = null;
  let firestoreOk = null;
  let rev = mem.rev;
  let pubRev = mem.pubRev;

  if (kvOn) {
    try {
      const [pong, revRaw, pubRevRaw] = await kvPipeline([
        ['PING'],
        ['GET', K_REV],
        ['GET', K_PUB_REV],
      ]);
      redisOk = pong === 'PONG' || Boolean(pong);
      rev = Math.max(rev, Number(revRaw) || 1);
      pubRev = Math.max(pubRev, Number(pubRevRaw) || 1);
    } catch {
      redisOk = false;
    }
  }

  if (fsOn) {
    const pubDoc = await readFirestorePublicDoc({ force: false });
    firestoreOk = pubDoc !== null;
    if (pubDoc?.pubRev) pubRev = Math.max(pubRev, pubDoc.pubRev);
  }

  const ok = (redisOk !== false) && (firestoreOk !== false);
  return {
    ok,
    persistence: getPersistenceMode(),
    projectId: getFirebaseProjectId(),
    firestore: fsOn ? (saOn ? 'rw-admin' : 'direct-client+user-jwt') : 'off',
    firestoreReachable: firestoreOk,
    redis: kvOn ? (redisOk ? 'connected' : 'degraded') : 'off',
    rev,
    pubRev,
    latencyMs: Date.now() - t0,
  };
}

/* ── Authentification Admin & Révocation / Rate-limit distribués (Redis) ── */

export async function getAdminAuthRecord() {
  if (getKvConfig().enabled) {
    const raw = await kvCmd(['GET', K_ADMIN_AUTH]);
    const parsed = safeJsonParse(raw, null);
    if (parsed) return parsed;
  }
  if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: true });
    if (isPlainObject(st?.adminAuth)) {
      mem.adminAuth = st.adminAuth;
      return st.adminAuth;
    }
  }
  return mem.adminAuth;
}

export async function claimAdminAuthRecord(record) {
  if (getKvConfig().enabled) {
    const res = await kvCmd(['SET', K_ADMIN_AUTH, JSON.stringify(record), 'NX']);
    if (res !== 'OK') return false;
    if (isServiceAccountConfigured()) {
      await patchFirestoreAdminState({ adminAuth: record }).catch(() => {});
    }
    mem.adminAuth = record;
    return true;
  }
  if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: true });
    if (isPlainObject(st?.adminAuth)) return false;
    await patchFirestoreAdminState({ adminAuth: record });
    mem.adminAuth = record;
    return true;
  }
  if (mem.adminAuth) return false;
  mem.adminAuth = record;
  return true;
}

export async function updateAdminAuthRecord(record) {
  mem.adminAuth = record;
  if (getKvConfig().enabled) {
    await kvCmd(['SET', K_ADMIN_AUTH, JSON.stringify(record)]);
  }
  if (isServiceAccountConfigured()) {
    await patchFirestoreAdminState({ adminAuth: record }).catch(() => {});
  }
  return true;
}

export async function getOrCreateTokenSecret(generatorFn) {
  if (getKvConfig().enabled) {
    const existing = await kvCmd(['GET', K_TOKEN_SECRET]);
    if (existing && typeof existing === 'string' && existing.length >= 32) {
      return existing;
    }
    const candidate = generatorFn();
    await kvCmd(['SET', K_TOKEN_SECRET, candidate, 'NX']);
    const finalVal = await kvCmd(['GET', K_TOKEN_SECRET]);
    return typeof finalVal === 'string' && finalVal.length >= 32 ? finalVal : candidate;
  }
  if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: false });
    if (typeof st?.tokenSecret === 'string' && st.tokenSecret.length >= 32) {
      mem.tokenSecret = st.tokenSecret;
      return st.tokenSecret;
    }
    const candidate = generatorFn();
    await patchFirestoreAdminState({ tokenSecret: candidate }).catch(() => {});
    mem.tokenSecret = candidate;
    return candidate;
  }
  if (!mem.tokenSecret) mem.tokenSecret = generatorFn();
  return mem.tokenSecret;
}

export async function revokeDistributedJti(jti, expMs) {
  if (!getKvConfig().enabled || !jti) return;
  const ttlSec = Math.max(1, Math.ceil((expMs - Date.now()) / 1000));
  if (ttlSec <= 0) return;
  await kvCmd(['SET', `${P}revoked:${jti}`, '1', 'EX', ttlSec]).catch(() => {});
}

export async function isDistributedJtiRevoked(jti) {
  if (!getKvConfig().enabled || !jti) return false;
  try {
    const v = await kvCmd(['GET', `${P}revoked:${jti}`]);
    return v === '1' || v === 1;
  } catch {
    return false;
  }
}

/* ── Événements temps réel ───────────────────────────────────────────────── */

export async function listEvents(limit = 120) {
  const n = Math.min(MAX_EVENTS, Math.max(1, Number(limit) || 120));
  if (getKvConfig().enabled) {
    const items = await kvCmd(['LRANGE', K_EVENTS, 0, n - 1]);
    if (Array.isArray(items)) {
      return items.map((s) => safeJsonParse(s, null)).filter(Boolean);
    }
  }
  if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: false });
    if (Array.isArray(st?.events)) return st.events.slice(0, n);
  }
  return mem.events.slice(0, n);
}

export async function appendEvents(list = []) {
  const clean = [];
  for (const item of list.slice(0, 25)) {
    const message = sanitizeStr(item?.message || '', 240);
    if (!message) continue;
    clean.push({
      id: sanitizeStr(item?.id || '', 64) || `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: Number(item?.at) || Date.now(),
      type: sanitizeStr(item?.type || 'sync', 40) || 'sync',
      message,
      actor: sanitizeStr(item?.actor || 'client', 24) || 'client',
    });
  }
  if (!clean.length) return 0;

  for (const ev of clean) mem.events.unshift(ev);
  if (mem.events.length > MAX_EVENTS) mem.events.length = MAX_EVENTS;
  mem.rev += 1;

  if (getKvConfig().enabled) {
    await kvPipeline([
      ['LPUSH', K_EVENTS, ...clean.map((e) => JSON.stringify(e))],
      ['LTRIM', K_EVENTS, 0, MAX_EVENTS - 1],
      ['INCR', K_REV],
    ]).catch(() => {});
  } else if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: false });
    const prev = Array.isArray(st?.events) ? st.events : [];
    const merged = [...clean, ...prev].slice(0, MAX_EVENTS);
    await patchFirestoreAdminState({ events: merged, rev: (Number(st?.rev) || 1) + 1 }).catch(() => {});
  }

  return clean.length;
}

export async function appendEvent(type, message, actor = 'client') {
  return (await appendEvents([{ type, message, actor }])) > 0;
}

/* ── Namespaces globaux (/api/store/:ns) ─────────────────────────────────── */

function defaultForNs(ns) {
  return ns === 'users' ? [] : {};
}

export async function getNamespace(ns) {
  if (!VALID_NS.has(ns)) return {};
  const kvOn = getKvConfig().enabled;
  if ((ns === 'overrides' || ns === 'config') && isFirestoreConfigured()) {
    const pub = await readFirestorePublicDoc({ force: false });
    if (pub?.exists && (!kvOn || isServiceAccountConfigured())) {
      if (pub[ns] !== undefined) return pub[ns];
    }
  }
  if (kvOn) {
    const raw = await kvCmd(['GET', `${P}ns:${ns}`]);
    return safeJsonParse(raw, defaultForNs(ns));
  }
  if (isServiceAccountConfigured() && (ns === 'users' || ns === 'history')) {
    const st = await readFirestoreAdminState({ force: false });
    if (st && st[ns] !== undefined) return st[ns];
  }
  const v = mem.namespaces[ns];
  return v !== undefined ? v : defaultForNs(ns);
}

export async function setNamespaceValue(ns, value, { bumpPubRev = false } = {}) {
  if (!VALID_NS.has(ns)) return false;
  mem.namespaces[ns] = value;
  mem.rev += 1;
  if (bumpPubRev) mem.pubRev += 1;

  let nextPubRev = mem.pubRev;
  if (getKvConfig().enabled) {
    const cmds = [
      ['SET', `${P}ns:${ns}`, JSON.stringify(value)],
      ['INCR', K_REV],
    ];
    if (bumpPubRev) cmds.push(['INCR', K_PUB_REV]);
    const r = await kvPipeline(cmds);
    if (bumpPubRev && r[2]) nextPubRev = Number(r[2]) || nextPubRev;
  }

  if (isServiceAccountConfigured()) {
    if (ns === 'overrides' || ns === 'config') {
      const curPub = (await readFirestorePublicDoc({ force: false })) || {
        overrides: mem.namespaces.overrides,
        config: mem.namespaces.config,
        pubRev: nextPubRev,
      };
      await writeFirestorePublicDoc({
        overrides: ns === 'overrides' ? value : curPub.overrides,
        config: ns === 'config' ? value : curPub.config,
        pubRev: bumpPubRev ? Math.max(nextPubRev, (curPub.pubRev || 1) + 1) : curPub.pubRev,
      }).catch(() => {});
    } else if (ns === 'users' || ns === 'history') {
      await patchFirestoreAdminState({ [ns]: value, rev: mem.rev }).catch(() => {});
    }
  }
  return true;
}

export async function setNamespaceKey(ns, key, value) {
  if (!VALID_NS.has(ns) || !isValidKey(key)) return false;
  const current = await getNamespace(ns);
  const obj = isPlainObject(current) ? { ...current } : {};
  if (PROGRESS_NS.has(ns) && isPlainObject(value)) {
    obj[key] = mergeProgress(ns, obj[key], value);
  } else {
    obj[key] = value ?? null;
  }
  const bumpPubRev = ns === 'overrides' || ns === 'config';
  return setNamespaceValue(ns, obj, { bumpPubRev });
}

export async function deleteNamespaceKey(ns, key) {
  if (!VALID_NS.has(ns) || !isValidKey(key)) return false;
  const current = await getNamespace(ns);
  const obj = isPlainObject(current) ? { ...current } : {};
  delete obj[key];
  const bumpPubRev = ns === 'overrides' || ns === 'config';
  return setNamespaceValue(ns, obj, { bumpPubRev });
}

/* ── Stockage Élève : Firestore direct (`students/{uid}`) + Redis hot meta ─ */

function fromFirestoreStudentDoc(doc) {
  if (!doc) return null;
  return {
    uid: doc.uid || '',
    email: doc.email || '',
    displayName: doc.displayName || '',
    photoURL: doc.photoURL || '',
    stRev: Number(doc.stRev) || 0,
    resetAt: Number(doc.resetAt) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    profile: isPlainObject(doc.profile) ? doc.profile : {},
    'progress-revision': isPlainObject(doc.progressRevision) ? doc.progressRevision : {},
    'progress-quiz': isPlainObject(doc.progressQuiz) ? doc.progressQuiz : {},
    'progress-exercises': isPlainObject(doc.progressExercises) ? doc.progressExercises : {},
    'progress-core': isPlainObject(doc.progressCore) ? doc.progressCore : {},
  };
}

function toFirestoreStudentDoc(uid, rec, summary) {
  return {
    uid,
    email: sanitizeStr(rec.email || '', 160),
    displayName: sanitizeStr(rec.displayName || '', 120),
    photoURL: sanitizeStr(rec.photoURL || '', 512),
    stRev: Number(rec.stRev) || 1,
    resetAt: Number(rec.resetAt) || 0,
    updatedAt: Number(rec.updatedAt) || Date.now(),
    profile: isPlainObject(rec.profile) ? rec.profile : {},
    progressRevision: isPlainObject(rec['progress-revision']) ? rec['progress-revision'] : {},
    progressQuiz: isPlainObject(rec['progress-quiz']) ? rec['progress-quiz'] : {},
    progressExercises: isPlainObject(rec['progress-exercises']) ? rec['progress-exercises'] : {},
    progressCore: isPlainObject(rec['progress-core']) ? rec['progress-core'] : {},
    summary: isPlainObject(summary) ? summary : {},
  };
}

async function getStudentRecord(studentId, fbUser = null) {
  const empty = {
    uid: fbUser?.uid || studentId || '',
    email: fbUser?.email || '',
    displayName: fbUser?.name || '',
    photoURL: fbUser?.picture || '',
    stRev: 0,
    resetAt: 0,
    updatedAt: 0,
    profile: {},
    'progress-revision': {},
    'progress-quiz': {},
    'progress-exercises': {},
    'progress-core': {},
  };

  if (fbUser?.uid && isFirestoreConfigured()) {
    try {
      const fsDoc = await fsGetDoc(`students/${fbUser.uid}`, { userToken: fbUser.rawToken });
      const parsed = fromFirestoreStudentDoc(fsDoc);
      if (parsed) {
        return {
          ...empty,
          ...parsed,
          email: fbUser.email || parsed.email,
          displayName: fbUser.name || parsed.displayName,
          photoURL: fbUser.picture || parsed.photoURL,
        };
      }
    } catch {}
  }

  if (!isValidStudentId(studentId)) return empty;
  if (getKvConfig().enabled) {
    const raw = await kvCmd(['GET', `${P}st:${studentId}`]);
    return { ...empty, ...safeJsonParse(raw, {}) };
  }
  return mem.students[studentId] ? { ...empty, ...mem.students[studentId] } : empty;
}

export async function mergeStudentSync(studentId, namespaces = {}, events = [], { fbUser = null, reset = false } = {}) {
  const effectiveId = fbUser?.uid || studentId;
  if (!fbUser?.uid && !isValidStudentId(effectiveId)) {
    throw new Error('Identifiant élève invalide');
  }

  const current = await getStudentRecord(effectiveId, fbUser);
  const now = Date.now();
  const nextStRev = (Number(current.stRev) || Number(mem.stRev[effectiveId]) || 0) + 1;

  const next = reset
    ? {
        ...current,
        uid: fbUser?.uid || effectiveId,
        email: fbUser?.email || current.email || '',
        displayName: fbUser?.name || current.displayName || '',
        photoURL: fbUser?.picture || current.photoURL || '',
        stRev: nextStRev,
        resetAt: now,
        updatedAt: now,
        profile: isPlainObject(namespaces?.profile)
          ? mergeProgress('profile', current.profile, namespaces.profile)
          : current.profile,
        'progress-revision': {},
        'progress-quiz': {},
        'progress-exercises': {},
        'progress-core': {},
      }
    : {
        ...current,
        uid: fbUser?.uid || effectiveId,
        email: fbUser?.email || current.email || '',
        displayName: fbUser?.name || current.displayName || '',
        photoURL: fbUser?.picture || current.photoURL || '',
        stRev: nextStRev,
        updatedAt: now,
      };

  let updated = reset ? 4 : 0;
  if (!reset && isPlainObject(namespaces)) {
    for (const [ns, val] of Object.entries(namespaces)) {
      if (!STUDENT_NS.has(ns) || !isPlainObject(val)) continue;
      next[ns] = mergeProgress(ns, current[ns], val);
      updated += 1;
    }
  }

  // Enrichit automatiquement le prénom/nom depuis le compte Google si vides
  if (fbUser?.name && isPlainObject(next.profile) && !next.profile.firstName && !next.profile.lastName) {
    const parts = fbUser.name.trim().split(/\s+/);
    next.profile = {
      ...next.profile,
      firstName: sanitizeStr(parts[0] || '', 60),
      lastName: sanitizeStr(parts.slice(1).join(' ') || '', 60),
    };
  }

  const summary = summarizeStudent(effectiveId, next);

  // 1. Écriture directe dans Cloud Firestore pour les élèves authentifiés Google
  if (fbUser?.uid && isFirestoreConfigured()) {
    const fsPayload = toFirestoreStudentDoc(fbUser.uid, next, summary);
    await fsSetDoc(`students/${fbUser.uid}`, fsPayload, { userToken: fbUser.rawToken });
    mem.fsSummariesCache.fetchedAt = 0;
  }

  // 2. Mise à jour du cache chaud Redis / mémoire pour lecture O(1) côté Admin
  const cleanEvents = [];
  if (Array.isArray(events)) {
    for (const ev of events.slice(0, 15)) {
      const msg = sanitizeStr(ev?.message || '', 240);
      if (!msg) continue;
      cleanEvents.push({
        id: sanitizeStr(ev?.id || '', 64) || `e-${now}-${Math.random().toString(36).slice(2, 7)}`,
        at: Number(ev?.at) || now,
        type: sanitizeStr(ev?.type || 'eleve', 40) || 'eleve',
        message: msg,
        actor: 'eleve',
      });
    }
  }

  mem.students[effectiveId] = next;
  mem.studentsMeta[effectiveId] = summary;
  mem.stRev[effectiveId] = nextStRev;
  mem.rev += 1;
  for (const ev of cleanEvents) mem.events.unshift(ev);
  if (mem.events.length > MAX_EVENTS) mem.events.length = MAX_EVENTS;

  let pubRev = mem.pubRev;
  if (getKvConfig().enabled) {
    const cmds = [
      ['HSET', K_STUDENTS_META, effectiveId, JSON.stringify(summary)],
      ['HSET', K_ST_REV, effectiveId, String(nextStRev)],
      ['INCR', K_REV],
      ['GET', K_PUB_REV],
    ];
    if (!fbUser?.uid) {
      cmds.unshift(['SET', `${P}st:${effectiveId}`, JSON.stringify(next)]);
    }
    if (cleanEvents.length) {
      cmds.push(['LPUSH', K_EVENTS, ...cleanEvents.map((e) => JSON.stringify(e))]);
      cmds.push(['LTRIM', K_EVENTS, 0, MAX_EVENTS - 1]);
    }
    const res = await kvPipeline(cmds);
    const pubIdx = fbUser?.uid ? 3 : 4;
    pubRev = Number(res[pubIdx]) || pubRev;
  } else if (isFirestoreConfigured()) {
    const pubDoc = await readFirestorePublicDoc({ force: false });
    if (pubDoc?.pubRev) pubRev = Math.max(pubRev, pubDoc.pubRev);
    if (cleanEvents.length && isServiceAccountConfigured()) {
      await appendEvents(cleanEvents).catch(() => {});
    }
  }

  return {
    updated,
    rev: mem.rev,
    pubRev,
    stRev: nextStRev,
    student: next,
  };
}

export async function getStudentSyncSnapshot(studentId, { sincePub = 0, sinceSt = 0, fbUser = null } = {}) {
  const effectiveId = fbUser?.uid || studentId;
  const validSt = Boolean(fbUser?.uid) || isValidStudentId(effectiveId);

  // Étape 1 : vérification ultra-rapide O(1) via Redis ou cache L1 (0 lecture Firestore si à jour)
  let pubRev = mem.pubRev;
  let stRev = validSt ? (mem.stRev[effectiveId] || 0) : 0;

  if (getKvConfig().enabled) {
    const checkCmds = [['GET', K_PUB_REV]];
    if (validSt) checkCmds.push(['HGET', K_ST_REV, effectiveId]);
    const checkRes = await kvPipeline(checkCmds);
    pubRev = Math.max(pubRev, Number(checkRes[0]) || 1);
    if (validSt && checkRes[1] !== null) {
      stRev = Math.max(stRev, Number(checkRes[1]) || 0);
    }
  } else if (isFirestoreConfigured()) {
    const pubDoc = await readFirestorePublicDoc({ force: false });
    if (pubDoc?.pubRev) pubRev = Math.max(pubRev, pubDoc.pubRev);
  }

  // Si l'élève Google se connecte sur un nouvel appareil (sinceSt === 0) ou si pubRev a avancé, on charge Firestore
  const needsFirestoreStudent = Boolean(fbUser?.uid && isFirestoreConfigured() && (sinceSt === 0 || stRev > sinceSt));

  if (!needsFirestoreStudent && sincePub > 0 && pubRev <= sincePub && stRev <= sinceSt) {
    return { changed: false, rev: pubRev, stRev, syncedAt: Date.now() };
  }

  // Étape 2 : lecture groupée (réconcilie Redis et Firestore `platform/public` selon `pubRev`)
  let overrides = mem.namespaces.overrides || {};
  let config = mem.namespaces.config || {};
  let student = null;
  let kvPubRev = 0;

  if (getKvConfig().enabled) {
    const [ovRaw, cfgRaw, pubRevRaw] = await kvPipeline([
      ['GET', `${P}ns:overrides`],
      ['GET', `${P}ns:config`],
      ['GET', K_PUB_REV],
    ]);
    overrides = safeJsonParse(ovRaw, {});
    config = safeJsonParse(cfgRaw, {});
    kvPubRev = Number(pubRevRaw) || 0;
    pubRev = Math.max(pubRev, kvPubRev);
  }

  if (isFirestoreConfigured()) {
    const pubDoc = await readFirestorePublicDoc({ force: false });
    if (pubDoc?.exists && (pubDoc.pubRev >= kvPubRev || !getKvConfig().enabled)) {
      overrides = pubDoc.overrides;
      config = pubDoc.config;
      pubRev = Math.max(pubRev, pubDoc.pubRev);
    }
  }

  if (fbUser?.uid && isFirestoreConfigured()) {
    const rec = await getStudentRecord(fbUser.uid, fbUser);
    stRev = Math.max(stRev, Number(rec?.stRev) || 0);
    if (sincePub > 0 && pubRev <= sincePub && stRev <= sinceSt && sinceSt > 0) {
      return { changed: false, rev: pubRev, stRev, syncedAt: Date.now() };
    }
    student = rec;
  } else if (validSt) {
    if (getKvConfig().enabled) {
      const raw = await kvCmd(['GET', `${P}st:${effectiveId}`]);
      student = safeJsonParse(raw, null);
    } else {
      student = mem.students[effectiveId] || null;
    }
  }

  return {
    changed: true,
    rev: pubRev,
    stRev,
    overrides,
    config,
    student,
    syncedAt: Date.now(),
  };
}

/* ── Synchronisation Admin (Firestore + Redis unifiés) ───────────────────── */

export async function getAdminSyncSnapshot({ since = 0 } = {}) {
  let rev = mem.rev;
  if (getKvConfig().enabled) {
    const revRaw = await kvCmd(['GET', K_REV]);
    rev = Math.max(rev, Number(revRaw) || 1);
    if (since > 0 && rev <= since) {
      return { changed: false, rev, syncedAt: Date.now() };
    }
  } else if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: false });
    if (st?.rev) rev = Math.max(rev, Number(st.rev) || 1);
    if (since > 0 && rev <= since) {
      return { changed: false, rev, syncedAt: Date.now() };
    }
  } else if (since > 0 && mem.rev <= since) {
    return { changed: false, rev: mem.rev, pubRev: mem.pubRev, syncedAt: Date.now() };
  }

  let pubRev = mem.pubRev;
  let overrides = mem.namespaces.overrides || {};
  let config = mem.namespaces.config || {};
  let users = Array.isArray(mem.namespaces.users) ? mem.namespaces.users : [];
  let history = mem.namespaces.history || {};
  let events = mem.events.slice(0, 120);
  const summaryById = new Map();

  for (const [sid, sum] of Object.entries(mem.studentsMeta)) {
    if (sum) summaryById.set(sid, sum);
  }

  if (getKvConfig().enabled) {
    const [pubRevRaw, ovRaw, cfgRaw, usrRaw, histRaw, evList, stMetaRaw] = await kvPipeline([
      ['GET', K_PUB_REV],
      ['GET', `${P}ns:overrides`],
      ['GET', `${P}ns:config`],
      ['GET', `${P}ns:users`],
      ['GET', `${P}ns:history`],
      ['LRANGE', K_EVENTS, 0, 119],
      ['HGETALL', K_STUDENTS_META],
    ]);
    pubRev = Math.max(pubRev, Number(pubRevRaw) || 1);
    overrides = safeJsonParse(ovRaw, overrides);
    config = safeJsonParse(cfgRaw, config);
    users = safeJsonParse(usrRaw, users);
    history = safeJsonParse(histRaw, history);
    if (Array.isArray(evList)) {
      events = evList.map((s) => safeJsonParse(s, null)).filter(Boolean);
    }
    if (Array.isArray(stMetaRaw)) {
      for (let i = 0; i + 1 < stMetaRaw.length; i += 2) {
        const parsed = safeJsonParse(stMetaRaw[i + 1], null);
        if (parsed) summaryById.set(stMetaRaw[i], parsed);
      }
    } else if (isPlainObject(stMetaRaw)) {
      for (const [k, val] of Object.entries(stMetaRaw)) {
        const parsed = safeJsonParse(val, null);
        if (parsed) summaryById.set(k, parsed);
      }
    }
  }

  if (isFirestoreConfigured()) {
    const pubDoc = await readFirestorePublicDoc({ force: false });
    if (pubDoc?.exists && (pubDoc.pubRev >= pubRev || !getKvConfig().enabled)) {
      pubRev = Math.max(pubRev, pubDoc.pubRev);
      overrides = pubDoc.overrides;
      config = pubDoc.config;
    }
  }

  if (isServiceAccountConfigured()) {
    const st = await readFirestoreAdminState({ force: false });
    if (st && !getKvConfig().enabled) {
      if (Array.isArray(st.users)) users = st.users;
      if (isPlainObject(st.history)) history = st.history;
      if (Array.isArray(st.events)) events = st.events.slice(0, 120);
    }
    const now = Date.now();
    let fsList = mem.fsSummariesCache.list;
    if (!fsList || now - mem.fsSummariesCache.fetchedAt >= ADMIN_SUMMARIES_TTL_MS) {
      try {
        fsList = await fsQueryStudentSummaries(60);
        mem.fsSummariesCache = { list: fsList, fetchedAt: now };
      } catch {
        fsList = mem.fsSummariesCache.list || [];
      }
    }
    if (Array.isArray(fsList)) {
      for (const s of fsList) {
        if (s?.studentId) summaryById.set(s.studentId, s);
      }
    }
  }

  const studentsSummary = Array.from(summaryById.values()).sort(
    (a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0)
  );

  return {
    changed: true,
    rev,
    pubRev,
    overrides,
    config,
    users,
    history,
    events,
    studentsSummary,
    syncedAt: Date.now(),
  };
}

export async function mergeAdminSync({ namespaces = {}, events = [] } = {}) {
  let updated = 0;
  let bumpPubRev = false;
  const cmds = [];

  let nextOverrides = null;
  let nextConfig = null;
  const adminStatePatch = {};

  if (isPlainObject(namespaces)) {
    if (isPlainObject(namespaces.overrides)) {
      mem.namespaces.overrides = namespaces.overrides;
      nextOverrides = namespaces.overrides;
      if (getKvConfig().enabled) cmds.push(['SET', `${P}ns:overrides`, JSON.stringify(namespaces.overrides)]);
      bumpPubRev = true;
      updated += 1;
    }
    if (isPlainObject(namespaces.config)) {
      const prevCfg = await getNamespace('config');
      const mergedCfg = {
        ...(isPlainObject(prevCfg) ? prevCfg : {}),
        ...namespaces.config,
      };
      if (isPlainObject(prevCfg?.unlockedChapters) || isPlainObject(namespaces.config.unlockedChapters)) {
        mergedCfg.unlockedChapters = {
          ...(isPlainObject(prevCfg?.unlockedChapters) ? prevCfg.unlockedChapters : {}),
          ...(isPlainObject(namespaces.config.unlockedChapters) ? namespaces.config.unlockedChapters : {}),
        };
      }
      mem.namespaces.config = mergedCfg;
      nextConfig = mergedCfg;
      if (getKvConfig().enabled) cmds.push(['SET', `${P}ns:config`, JSON.stringify(mergedCfg)]);
      bumpPubRev = true;
      updated += 1;
    }
    if (Array.isArray(namespaces.users)) {
      mem.namespaces.users = namespaces.users;
      adminStatePatch.users = namespaces.users;
      if (getKvConfig().enabled) cmds.push(['SET', `${P}ns:users`, JSON.stringify(namespaces.users)]);
      updated += 1;
    }
    if (isPlainObject(namespaces.history)) {
      mem.namespaces.history = namespaces.history;
      adminStatePatch.history = namespaces.history;
      if (getKvConfig().enabled) cmds.push(['SET', `${P}ns:history`, JSON.stringify(namespaces.history)]);
      updated += 1;
    }
  }

  const cleanEvents = [];
  if (Array.isArray(events)) {
    for (const ev of events.slice(0, 20)) {
      const msg = sanitizeStr(ev?.message || '', 240);
      if (!msg) continue;
      cleanEvents.push({
        id: sanitizeStr(ev?.id || '', 64) || `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: Number(ev?.at) || Date.now(),
        type: sanitizeStr(ev?.type || 'admin', 40) || 'admin',
        message: msg,
        actor: 'admin',
      });
    }
  }

  if (updated > 0 || cleanEvents.length > 0) {
    mem.rev += 1;
    if (bumpPubRev) mem.pubRev += 1;
    for (const ev of cleanEvents) mem.events.unshift(ev);
    if (mem.events.length > MAX_EVENTS) mem.events.length = MAX_EVENTS;
  }

  let finalPubRev = mem.pubRev;
  if (getKvConfig().enabled && (cmds.length || cleanEvents.length)) {
    if (cleanEvents.length) {
      cmds.push(['LPUSH', K_EVENTS, ...cleanEvents.map((e) => JSON.stringify(e))]);
      cmds.push(['LTRIM', K_EVENTS, 0, MAX_EVENTS - 1]);
    }
    cmds.push(['INCR', K_REV]);
    if (bumpPubRev) cmds.push(['INCR', K_PUB_REV]);
    const r = await kvPipeline(cmds);
    if (bumpPubRev) {
      const pubVal = Number(r[r.length - 1]);
      if (pubVal > 0) finalPubRev = pubVal;
    }
  }

  if (isServiceAccountConfigured()) {
    if (bumpPubRev) {
      const curPub = (await readFirestorePublicDoc({ force: false })) || {
        overrides: mem.namespaces.overrides,
        config: mem.namespaces.config,
        pubRev: 1,
      };
      finalPubRev = Math.max(finalPubRev, (curPub.pubRev || 1) + 1);
      await writeFirestorePublicDoc({
        overrides: nextOverrides ?? curPub.overrides,
        config: nextConfig ?? curPub.config,
        pubRev: finalPubRev,
      }).catch(() => {});
    }
    if (cleanEvents.length && !getKvConfig().enabled) {
      const st = await readFirestoreAdminState({ force: false });
      const prevEv = Array.isArray(st?.events) ? st.events : [];
      adminStatePatch.events = [...cleanEvents, ...prevEv].slice(0, MAX_EVENTS);
    }
    if (Object.keys(adminStatePatch).length > 0) {
      adminStatePatch.rev = mem.rev;
      await patchFirestoreAdminState(adminStatePatch).catch(() => {});
    }
  }

  const snap = await getAdminSyncSnapshot({ since: 0 });
  return { updated, ...snap };
}

/* ── Utilitaires HTTP communs ────────────────────────────────────────────── */

export function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export async function parseJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        const err = new Error('Payload trop volumineux');
        err.statusCode = 413;
        throw err;
      }
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error('Payload trop volumineux');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Corps JSON invalide');
    err.statusCode = 400;
    throw err;
  }
}
