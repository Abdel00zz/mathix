/**
 * MathFlow — Synchronisation Cloud (Google Identity + Redis L1 + Firestore L2)
 * Helpers CRDT purs et client API typé pour `apps/apprendre-next`.
 */

import {
  clearAllOutbox,
  clearOutboxIds,
  peekOutbox,
  replaceOutboxWith,
} from './offlineDb';
import {
  applyCloudResumeToLocal,
  clearResumeStore,
  exportCloudResume,
  mergeCloudResumes,
  sanitizeCloudResume,
} from './resumeStore';
import {
  DEFAULT_PROFILE,
  DEFAULT_STATE,
  normalizeLastVisited,
  normalizeState,
  readAccountOwnerFromStorage,
  readProfileFromStorage,
  readResetAtFromStorage,
  writeAccountOwnerToStorage,
  writeResetAtToStorage,
  writeProfileToStorage,
  writeStateToStorage,
} from './storage';
import {
  clearStickyUnlocks,
  mergeStickyUnlocks,
  readStickyUnlocks,
  sanitizeStickyUnlocks,
  writeStickyUnlocks,
} from './unlocks';
import type {
  CloudResumeData,
  LastVisited,
  StickyUnlockEntry,
  StudentProfile,
  StudentState,
} from './types';

export type CloudSyncState = 'idle' | 'syncing' | 'synced' | 'pending' | 'offline' | 'error';

export interface CloudProviders {
  googleEnabled: boolean;
  googleClientId: string;
  firebaseEnabled?: boolean;
  firestoreEnabled: boolean;
  redisEnabled: boolean;
  firebaseWebConfig?: {
    apiKey: string;
    authDomain: string;
    projectId: string;
  } | null;
}

export interface CloudUser {
  accountId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  emailVerified?: boolean;
  picture?: string;
  authProvider?: string;
  phone?: string;
  classId?: string;
  className?: string;
  schoolName?: string;
  dashboardTheme?: string;
  role?: 'prof' | 'student';
  requestedRole?: 'prof' | 'student';
  passwordSet?: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
}

export interface CloudStatus {
  isHttp: boolean;
  authenticated: boolean;
  user: CloudUser | null;
  providers: CloudProviders | null;
  syncState: CloudSyncState;
  lastSyncedAt: number;
  error: string;
}

export type CloudLastVisited = Partial<LastVisited> & { at?: number };

export type CloudQuizEntry =
  | Array<number | null>
  | { answers?: unknown[]; done?: number; isSubmitted?: boolean };

export type CloudExerciseEntry = Record<string, number> | Array<number | null>;

export type CloudLessonEntry = number | { pct?: number };

export interface CloudState {
  q: Record<string, CloudQuizEntry>;
  e: Record<string, CloudExerciseEntry>;
  l: Record<string, CloudLessonEntry>;
  lastVisited: CloudLastVisited | null;
}

export interface CloudEnvelope {
  profile: Partial<StudentProfile>;
  state: CloudState;
  updatedAt: number;
  revision?: number;
  resetAt?: number;
  resume?: CloudResumeData;
  unlocks?: Record<string, StickyUnlockEntry>;
}

export interface CloudSessionResult {
  authenticated: boolean;
  user: CloudUser | null;
  providers: CloudProviders | null;
  error?: string;
}

export interface CloudSignInProfileHint {
  classId?: string;
  firstName?: string;
  lastName?: string;
  schoolName?: string;
}

export interface CloudSignInResult {
  authenticated: boolean;
  isNew: boolean;
  user: CloudUser;
  providers: CloudProviders | null;
  cloudState: CloudEnvelope | null;
}

export interface CloudPushResult {
  ok: boolean;
  queued: boolean;
  syncState: CloudSyncState;
  envelope: CloudEnvelope | null;
  error?: string;
}

export interface CloudFlushResult {
  flushed: number;
  envelope: CloudEnvelope | null;
  error?: string;
}

export interface CloudPullResult {
  ok: boolean;
  envelope: CloudEnvelope | null;
  source?: 'redis' | 'firestore' | 'none';
  error?: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    },
  ): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentityApi;
      };
    };
  }
}

const QUIZ_RANK: Record<string, number> = { null: 0, '-1': 1, '0': 2, '1': 3 };
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
let gsiLoadingPromise: Promise<boolean> | null = null;
let flushInFlight: Promise<CloudFlushResult> | null = null;
let outboxMutation: Promise<unknown> = Promise.resolve();
let localSessionEpoch = 0;

function isSafeKey(key: string): boolean {
  return Boolean(key) && !FORBIDDEN_KEYS.has(key);
}

function normalizeQuizScore(value: unknown): number | null {
  return value === 1 || value === 0 || value === -1 ? value : null;
}

function normalizeExerciseRating(value: unknown): number | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Fusion monotone élément par élément des scores de quiz (`null < -1 < 0 < 1`).
 */
export function mergeQuizScores(
  localArr: ReadonlyArray<number | null | undefined> = [],
  cloudArr: ReadonlyArray<number | null | undefined> = [],
): Array<number | null> {
  const len = Math.max(localArr.length, cloudArr.length);
  const merged: Array<number | null> = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    const a = normalizeQuizScore(localArr[i]);
    const b = normalizeQuizScore(cloudArr[i]);
    const rA = QUIZ_RANK[String(a)] ?? 0;
    const rB = QUIZ_RANK[String(b)] ?? 0;
    merged[i] = rA >= rB ? a : b;
  }
  return merged;
}

/**
 * Fusion monotone des auto-évaluations d'exercices (`null < 0 < 1 < 2`).
 */
export function mergeExerciseRatings(
  localArr: ReadonlyArray<number | null | undefined> = [],
  cloudArr: ReadonlyArray<number | null | undefined> = [],
): Array<number | null> {
  const len = Math.max(localArr.length, cloudArr.length);
  const merged: Array<number | null> = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    const a = normalizeExerciseRating(localArr[i]);
    const b = normalizeExerciseRating(cloudArr[i]);
    if (a === null) merged[i] = b;
    else if (b === null) merged[i] = a;
    else merged[i] = Math.max(a, b);
  }
  return merged;
}

function mergeQuizEntry(
  incomingEntry: CloudQuizEntry | undefined,
  currentEntry: CloudQuizEntry | undefined,
): CloudQuizEntry {
  const incIsObj = isPlainRecord(incomingEntry);
  const curIsObj = isPlainRecord(currentEntry);

  const incArr = Array.isArray(incomingEntry)
    ? incomingEntry
    : incIsObj && Array.isArray(incomingEntry.answers)
      ? (incomingEntry.answers as Array<number | null | undefined>)
      : [];
  const curArr = Array.isArray(currentEntry)
    ? currentEntry
    : curIsObj && Array.isArray(currentEntry.answers)
      ? (currentEntry.answers as Array<number | null | undefined>)
      : [];

  const mergedArr = mergeQuizScores(incArr, curArr);

  if (!incIsObj && !curIsObj) {
    return mergedArr;
  }

  const incDone = incIsObj && typeof incomingEntry.done === 'number' ? incomingEntry.done : undefined;
  const curDone = curIsObj && typeof currentEntry.done === 'number' ? currentEntry.done : undefined;
  const done =
    incDone !== undefined || curDone !== undefined
      ? Math.max(incDone ?? 0, curDone ?? 0)
      : undefined;
  const isSubmitted = Boolean(
    (incIsObj && incomingEntry.isSubmitted) || (curIsObj && currentEntry.isSubmitted),
  );

  return {
    answers: mergedArr,
    ...(done !== undefined ? { done } : {}),
    ...(isSubmitted ? { isSubmitted: true } : {}),
  };
}

function mergeExerciseEntry(
  incomingEntry: CloudExerciseEntry | undefined,
  currentEntry: CloudExerciseEntry | undefined,
): CloudExerciseEntry {
  const incIsArr = Array.isArray(incomingEntry);
  const curIsArr = Array.isArray(currentEntry);

  if ((incIsArr || incomingEntry === undefined) && (curIsArr || currentEntry === undefined)) {
    return mergeExerciseRatings(
      incIsArr ? incomingEntry : [],
      curIsArr ? currentEntry : [],
    );
  }

  const out: Record<string, number> = {};
  const applySource = (entry: CloudExerciseEntry | undefined) => {
    if (!entry) return;
    if (Array.isArray(entry)) {
      entry.forEach((val, idx) => {
        const rating = normalizeExerciseRating(val);
        if (rating !== null) {
          const key = String(idx);
          out[key] = Math.max(out[key] ?? 0, rating);
        }
      });
      return;
    }
    if (isPlainRecord(entry)) {
      for (const [k, raw] of Object.entries(entry)) {
        if (!isSafeKey(k)) continue;
        const rating = normalizeExerciseRating(raw);
        if (rating !== null) {
          out[k] = Math.max(out[k] ?? 0, rating);
        }
      }
    }
  };

  applySource(currentEntry);
  applySource(incomingEntry);
  return out;
}

function readLessonPct(entry: CloudLessonEntry | undefined): number {
  if (typeof entry === 'number' && Number.isFinite(entry)) {
    return Math.min(100, Math.max(0, Math.round(entry)));
  }
  if (isPlainRecord(entry) && typeof entry.pct === 'number' && Number.isFinite(entry.pct)) {
    return Math.min(100, Math.max(0, Math.round(entry.pct)));
  }
  return 0;
}

function mergeProfilePayloads(
  incoming: Partial<StudentProfile> | undefined,
  current: Partial<StudentProfile> | undefined,
): Partial<StudentProfile> {
  const inc = isPlainRecord(incoming) ? incoming : {};
  const cur = isPlainRecord(current) ? current : {};
  const tInc = Number(inc.profileUpdatedAt) || 0;
  const tCur = Number(cur.profileUpdatedAt) || 0;
  const newer = tInc >= tCur ? inc : cur;
  const older = tInc >= tCur ? cur : inc;

  return {
    ...older,
    ...newer,
    fn: String(newer.fn || older.fn || '').slice(0, 60),
    ln: String(newer.ln || older.ln || '').slice(0, 60),
    sc: String(newer.sc || older.sc || '').slice(0, 100),
    cls: newer.cls || older.cls || DEFAULT_PROFILE.cls,
    profileUpdatedAt: Math.max(tInc, tCur),
  };
}

function mergeLastVisited(
  incomingLv: CloudLastVisited | null | undefined,
  currentLv: CloudLastVisited | null | undefined,
): CloudLastVisited | null {
  const normInc = normalizeLastVisited(incomingLv);
  const normCur = normalizeLastVisited(currentLv);
  if (!normInc && !normCur) return null;
  if (!normCur) return normInc ? { ...normInc } : null;
  if (!normInc) return { ...normCur };
  const atInc = Number(normInc.at) || 0;
  const atCur = Number(normCur.at) || 0;
  return atInc >= atCur ? { ...normInc } : { ...normCur };
}

/**
 * Fusion CRDT monotone complète de deux enveloppes cloud (`profile`, `state`, `updatedAt`, `revision`,
 * plus `resetAt?`, `resume?` et `unlocks?` optionnels).
 */
export function mergeCloudEnvelopes(
  incoming: Partial<CloudEnvelope> | null | undefined,
  current: Partial<CloudEnvelope> | null | undefined,
  nowMs = Date.now(),
): CloudEnvelope {
  const incReset = Math.max(0, Number(incoming?.resetAt) || 0);
  const curReset = Math.max(0, Number(current?.resetAt) || 0);
  const maxReset = Math.max(incReset, curReset);
  const incUpdated = Number(incoming?.updatedAt) || 0;
  const curUpdated = Number(current?.updatedAt) || 0;

  const ignoreCurrent = incReset > curReset;
  // resetAt identifies a progression generation. Re-sending an old snapshot
  // with a fresh request timestamp must not revive pre-reset progress.
  const ignoreIncoming = incReset < curReset;

  const incState = !ignoreIncoming && isPlainRecord(incoming?.state) ? (incoming.state as Partial<CloudState>) : {};
  const curState = !ignoreCurrent && isPlainRecord(current?.state) ? (current.state as Partial<CloudState>) : {};

  const incQ = isPlainRecord(incState.q) ? incState.q : {};
  const curQ = isPlainRecord(curState.q) ? curState.q : {};
  const q: Record<string, CloudQuizEntry> = {};
  for (const key of new Set([...Object.keys(incQ), ...Object.keys(curQ)])) {
    if (!isSafeKey(key)) continue;
    q[key] = mergeQuizEntry(incQ[key] as CloudQuizEntry | undefined, curQ[key] as CloudQuizEntry | undefined);
  }

  const incE = isPlainRecord(incState.e) ? incState.e : {};
  const curE = isPlainRecord(curState.e) ? curState.e : {};
  const e: Record<string, CloudExerciseEntry> = {};
  for (const key of new Set([...Object.keys(incE), ...Object.keys(curE)])) {
    if (!isSafeKey(key)) continue;
    e[key] = mergeExerciseEntry(
      incE[key] as CloudExerciseEntry | undefined,
      curE[key] as CloudExerciseEntry | undefined,
    );
  }

  const incL = isPlainRecord(incState.l) ? incState.l : {};
  const curL = isPlainRecord(curState.l) ? curState.l : {};
  const l: Record<string, number> = {};
  for (const key of new Set([...Object.keys(incL), ...Object.keys(curL)])) {
    if (!isSafeKey(key)) continue;
    const pct = Math.max(
      readLessonPct(incL[key] as CloudLessonEntry | undefined),
      readLessonPct(curL[key] as CloudLessonEntry | undefined),
    );
    if (pct > 0) l[key] = pct;
  }

  const incResume = !ignoreIncoming && incoming?.resume ? sanitizeCloudResume(incoming.resume, 40) : undefined;
  const curResume = !ignoreCurrent && current?.resume ? sanitizeCloudResume(current.resume, 40) : undefined;
  const hasResume = Boolean(incResume || curResume);

  const incUnlocks = !ignoreIncoming && incoming?.unlocks ? sanitizeStickyUnlocks(incoming.unlocks) : undefined;
  const curUnlocks = !ignoreCurrent && current?.unlocks ? sanitizeStickyUnlocks(current.unlocks) : undefined;
  const hasUnlocks = Boolean(incUnlocks || curUnlocks);

  return {
    profile: mergeProfilePayloads(incoming?.profile, current?.profile),
    state: {
      q,
      e,
      l,
      lastVisited: mergeLastVisited(
        incState.lastVisited as CloudLastVisited | null | undefined,
        curState.lastVisited as CloudLastVisited | null | undefined,
      ),
    },
    updatedAt: Math.max(nowMs, incUpdated, curUpdated),
    revision: Math.max(Number(incoming?.revision) || 0, Number(current?.revision) || 0) + 1,
    ...(maxReset > 0 ? { resetAt: maxReset } : {}),
    ...(hasResume ? { resume: mergeCloudResumes(incResume, curResume, 40) } : {}),
    ...(hasUnlocks ? { unlocks: mergeStickyUnlocks(incUnlocks, curUnlocks) } : {}),
  };
}

export interface CreateCloudEnvelopeOptions {
  resetAt?: number;
  resume?: CloudResumeData | null;
  unlocks?: Record<string, StickyUnlockEntry> | null;
  includeLocalStores?: boolean;
}

/** Construit une enveloppe cloud à partir du profil, de l'état local et (en navigateur) de `ap-resume` / `ap-u`. */
export function createCloudEnvelope(
  profile: Partial<StudentProfile>,
  state: StudentState,
  revision?: number,
  opts: CreateCloudEnvelopeOptions = {},
): CloudEnvelope {
  const useLocal = opts.includeLocalStores !== false && typeof window !== 'undefined';
  const resetAt = opts.resetAt !== undefined ? opts.resetAt : useLocal ? readResetAtFromStorage() : 0;
  const resume = opts.resume !== undefined ? opts.resume : useLocal ? exportCloudResume(40) : null;
  const unlocksRaw = opts.unlocks !== undefined ? opts.unlocks : useLocal ? readStickyUnlocks() : null;
  const unlocks = unlocksRaw && Object.keys(unlocksRaw).length > 0 ? sanitizeStickyUnlocks(unlocksRaw) : null;

  return {
    profile: { ...profile },
    state: {
      q: { ...state.q },
      e: { ...state.e },
      l: { ...state.l },
      lastVisited: state.lastVisited ? { ...state.lastVisited } : null,
    },
    updatedAt: Date.now(),
    ...(revision !== undefined ? { revision } : {}),
    ...(resetAt > 0 ? { resetAt } : {}),
    ...(resume ? { resume } : {}),
    ...(unlocks && Object.keys(unlocks).length > 0 ? { unlocks } : {}),
  };
}

/** Empreinte déterministe (hors `updatedAt`/`revision`) pour éviter les boucles de re-push React. */
export function getEnvelopeFingerprint(envelope: Partial<CloudEnvelope> | null | undefined): string {
  if (!envelope) return '';
  const { profile, state, resetAt, resume, unlocks } = envelope;
  return JSON.stringify({
    profile: profile || {},
    state: state || {},
    resetAt: resetAt || 0,
    resume: resume || null,
    unlocks: unlocks || null,
  });
}

/** Applique les données auxiliaires d'une enveloppe fusionnée (`unlocks`, `resume`, `resetAt`) aux stores locaux. */
export function applyCloudEnvelopeToLocalStores(envelope: Partial<CloudEnvelope> | null | undefined): void {
  if (typeof window === 'undefined' || !envelope) return;
  if (typeof envelope.resetAt === 'number' && envelope.resetAt > 0) {
    const curReset = readResetAtFromStorage();
    if (envelope.resetAt > curReset) {
      // An upstream reset also invalidates the auxiliary monotone stores.
      clearStickyUnlocks();
      clearResumeStore();
      writeResetAtToStorage(envelope.resetAt);
    }
  }
  if (envelope.unlocks && Object.keys(envelope.unlocks).length > 0) {
    const mergedUnlocks = mergeStickyUnlocks(envelope.unlocks, readStickyUnlocks());
    writeStickyUnlocks(mergedUnlocks);
  }
  if (envelope.resume) {
    applyCloudResumeToLocal(envelope.resume);
  }
}

/** Purge complète des stores locaux et de l'outbox lors d'une déconnexion ou d'un changement d'élève. */
export async function purgeLocalSessionOnLogout(): Promise<void> {
  localSessionEpoch++;
  clearStickyUnlocks();
  clearResumeStore();
  writeStateToStorage(DEFAULT_STATE);
  writeResetAtToStorage(0);
  writeAccountOwnerToStorage('');
  const profile = readProfileFromStorage();
  writeProfileToStorage({ ...profile, fn: '', ln: '', sc: '', profileUpdatedAt: 0 });
  await outboxMutation;
  await clearAllOutbox();
}

/** Isole la session locale : si un autre `accountId` était connecté sur ce navigateur, purge avant fusion. */
export async function reconcileAccountSessionOwner(accountId: string): Promise<boolean> {
  const cleanId = String(accountId || '').trim();
  if (!cleanId || typeof window === 'undefined') return false;
  const prevOwner = readAccountOwnerFromStorage();
  if (prevOwner && prevOwner !== cleanId) {
    await purgeLocalSessionOnLogout();
    writeAccountOwnerToStorage(cleanId);
    return true;
  }
  if (!prevOwner) writeAccountOwnerToStorage(cleanId);
  return false;
}

/** Convertit un état cloud fusionné en `StudentState` normalisé pour `AppProvider`. */
export function toStudentState(cloudState: CloudState | null | undefined): StudentState {
  if (!cloudState || typeof cloudState !== 'object') {
    return normalizeState(null);
  }
  return normalizeState(cloudState as unknown as Partial<StudentState>);
}

export function isHttpOrigin(): boolean {
  return typeof window !== 'undefined' && /^https?:$/i.test(window.location?.protocol || '');
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errCode = typeof data.error === 'string' && data.error ? data.error : `http_${response.status}`;
    throw new Error(errCode);
  }
  return data as T;
}

/** Récupère la session cloud courante (`/api/auth?action=me`). */
export async function fetchCloudSession(): Promise<CloudSessionResult> {
  if (!isHttpOrigin()) {
    return { authenticated: false, user: null, providers: null };
  }
  try {
    const data = await apiJson<{
      authenticated?: boolean;
      user?: CloudUser | null;
      storage?: CloudProviders | null;
      providers?: CloudProviders | null;
    }>('/api/auth?action=me', { method: 'GET' });
    const authenticated = Boolean(data.authenticated);
    if (authenticated && data.user?.accountId) {
      await reconcileAccountSessionOwner(data.user.accountId);
    }
    return {
      authenticated,
      user: data.user || null,
      providers: data.providers || data.storage || null,
    };
  } catch (err) {
    return {
      authenticated: false,
      user: null,
      providers: null,
      error: err instanceof Error ? err.message : 'session_error',
    };
  }
}

/** Charge l'enveloppe cloud distante de l'élève connecté (`GET /api/sync`). */
export async function pullCloudEnvelope(): Promise<CloudPullResult> {
  if (!isHttpOrigin()) {
    return { ok: false, envelope: null, error: 'offline_protocol' };
  }
  try {
    const data = await apiJson<{
      ok?: boolean;
      source?: 'redis' | 'firestore' | 'none';
      envelope?: CloudEnvelope | null;
    }>('/api/sync', { method: 'GET' });
    return {
      ok: Boolean(data.ok),
      source: data.source,
      envelope: data.envelope || null,
    };
  } catch (err) {
    return {
      ok: false,
      envelope: null,
      error: err instanceof Error ? err.message : 'pull_error',
    };
  }
}

/** Authentifie l'élève auprès du backend via un ID Token Google / Firebase. */
export async function signInWithGoogleToken(
  idToken: string,
  profileHint: CloudSignInProfileHint = {},
): Promise<CloudSignInResult> {
  const data = await apiJson<{
    authenticated?: boolean;
    isNew?: boolean;
    user: CloudUser;
    providers?: CloudProviders | null;
    cloudState?: CloudEnvelope | null;
  }>('/api/auth?action=google', {
    method: 'POST',
    body: JSON.stringify({
      idToken,
      classId: profileHint.classId,
      firstName: profileHint.firstName,
      lastName: profileHint.lastName,
      schoolName: profileHint.schoolName,
    }),
  });

  if (data.authenticated && data.user?.accountId) {
    await reconcileAccountSessionOwner(data.user.accountId);
  }

  return {
    authenticated: Boolean(data.authenticated),
    isNew: Boolean(data.isNew),
    user: data.user,
    providers: data.providers || null,
    cloudState: data.cloudState || null,
  };
}

/** Ferme la session cloud côté serveur (`POST /api/auth?action=logout`) et purge les caches locaux de session. */
export async function logoutCloudSession(): Promise<{ ok: boolean }> {
  if (!isHttpOrigin()) {
    await purgeLocalSessionOnLogout();
    return { ok: true };
  }
  try {
    await apiJson<{ ok?: boolean }>('/api/auth?action=logout', {
      method: 'POST',
      body: '{}',
    });
    await purgeLocalSessionOnLogout();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function queueCompactedEnvelope(envelope: CloudEnvelope, accountId?: string): Promise<boolean> {
  const owner = accountId || readAccountOwnerFromStorage();
  const epoch = localSessionEpoch;
  // The merge runs inside a single IDB read/write transaction, including across
  // tabs. Local callers also serialize their mutations for predictable ordering.
  const queued = outboxMutation.then(async () => {
    if (epoch !== localSessionEpoch) return false;
    return (await replaceOutboxWith(envelope, owner, mergeCloudEnvelopes)) !== null;
  });
  outboxMutation = queued.catch(() => false);
  return queued;
}

/**
 * Envoie l'enveloppe locale au serveur (`POST /api/sync`) ou la compacte dans
 * l'outbox IndexedDB si l'appareil est hors-ligne ou si le réseau échoue.
 */
export async function pushCloudEnvelope(envelope: CloudEnvelope, accountId?: string): Promise<CloudPushResult> {
  const epoch = localSessionEpoch;
  if (!isHttpOrigin() || !isOnline()) {
    const queued = await queueCompactedEnvelope(envelope, accountId);
    return {
      ok: false,
      queued,
      syncState: queued ? (isHttpOrigin() ? 'pending' : 'offline') : 'error',
      envelope: null,
      ...(!queued ? { error: 'offline_storage_unavailable' } : {}),
    };
  }

  try {
    const res = await apiJson<{ envelope?: CloudEnvelope | null }>('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ envelope }),
    });
    if (epoch !== localSessionEpoch) {
      return { ok: false, queued: false, syncState: 'idle', envelope: null, error: 'session_changed' };
    }
    return {
      ok: true,
      queued: false,
      syncState: 'synced',
      envelope: res.envelope || envelope,
    };
  } catch (err) {
    if (epoch !== localSessionEpoch) {
      return { ok: false, queued: false, syncState: 'idle', envelope: null, error: 'session_changed' };
    }
    const queued = await queueCompactedEnvelope(envelope, accountId);
    return {
      ok: false,
      queued,
      syncState: 'error',
      envelope: null,
      error: err instanceof Error ? err.message : 'sync_error',
    };
  }
}

/**
 * Vide la file hors-ligne IndexedDB vers `/api/sync` en fusionnant les enveloppes
 * en attente (avec verrou anti-réentrance), puis supprime les entrées confirmées.
 */
export async function flushCloudOutbox(accountId?: string): Promise<CloudFlushResult> {
  if (!isHttpOrigin() || !isOnline()) {
    return { flushed: 0, envelope: null };
  }
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async (): Promise<CloudFlushResult> => {
    const epoch = localSessionEpoch;
    const owner = accountId || readAccountOwnerFromStorage() || undefined;
    const items = await peekOutbox<CloudEnvelope>(owner);
    if (items.length === 0) {
      return { flushed: 0, envelope: null };
    }

    let combined = items[0].envelope;
    for (let i = 1; i < items.length; i++) {
      combined = mergeCloudEnvelopes(items[i].envelope, combined);
    }

    try {
      const res = await apiJson<{ envelope?: CloudEnvelope | null }>('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ envelope: combined }),
      });
      if (epoch !== localSessionEpoch) return { flushed: 0, envelope: null, error: 'session_changed' };
      await clearOutboxIds(items.map((item) => item.id));
      return {
        flushed: items.length,
        envelope: res.envelope || combined,
      };
    } catch (err) {
      return {
        flushed: 0,
        envelope: null,
        error: err instanceof Error ? err.message : 'flush_error',
      };
    }
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

/** Charge paresseusement le SDK Google Identity Services (`gsi/client`). */
export function loadGoogleIdentityScript(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !isHttpOrigin()) {
    return Promise.resolve(false);
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(true);
  }
  if (gsiLoadingPromise) return gsiLoadingPromise;

  gsiLoadingPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.google?.accounts?.id)), { once: true });
      existing.addEventListener(
        'error',
        () => {
          gsiLoadingPromise = null;
          resolve(false);
        },
        { once: true },
      );
      window.setTimeout(() => resolve(Boolean(window.google?.accounts?.id)), 4000);
      return;
    }

    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(Boolean(window.google?.accounts?.id));
    script.onerror = () => {
      gsiLoadingPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return gsiLoadingPromise;
}
