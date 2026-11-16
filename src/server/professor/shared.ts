// ============================================================================
// Shared backend helpers (Redis, auth, push, history), internal server module.
// Fichier préfixé « _ » → ignoré par Vercel comme route, importable par les
// fonctions de /api.
// ============================================================================

import { Redis } from '@upstash/redis';
import webpush from 'web-push';
import { Resend } from 'resend';
import { createHash, createHmac, timingSafeEqual, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(nodeScrypt);

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const vapidPublic = (process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || '').trim();
const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim();
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT || 'mailto:bdh.malek@gmail.com',
    vapidPublic,
    vapidPrivate
  );
}

export { webpush };

/** Client Resend partagé (envoi d'emails admin/rapports). */
export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : (null as unknown as Resend);

export type ApiRequest = { method?: string; body?: any; headers?: Record<string, string>; query?: Record<string, string> };
export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => ApiResponse | void;
  setHeader?: (name: string, value: string | string[]) => void;
};

// ── Auth ─────────────────────────────────────────────────────────────────────
// ADMIN_SECRET protège exclusivement le panneau admin ; PUSH_SECRET protège
// exclusivement les scripts d'envoi. Les deux périmètres restent séparés.

/**
 * Comparaison de secrets à durée constante.
 *
 * `===` sur des chaînes court-circuite au premier octet différent : le temps de
 * réponse fuit alors la longueur du préfixe correct, ce qui rend le secret
 * devinable octet par octet. On hache les deux côtés avant de comparer, ce qui
 * garantit en plus des buffers de même taille (`timingSafeEqual` lève sinon).
 */
function secretsMatch(received: unknown, expected: string | undefined): boolean {
  if (typeof received !== 'string' || !received || !expected) return false;
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function isAdmin(req: ApiRequest): boolean {
  return secretsMatch(req.headers?.['x-admin-secret'], process.env.ADMIN_SECRET);
}

export function isPushSecret(req: ApiRequest): boolean {
  return secretsMatch(req.headers?.['x-push-secret'], process.env.PUSH_SECRET);
}

/** Autorise les actions push administrateur. */
export function isAuthorized(req: ApiRequest): boolean {
  return isAdmin(req) || isPushSecret(req);
}

// ── Session professeur ──────────────────────────────────────────────────────
// Le rôle affiché dans React n'est jamais une autorisation. Les écritures du
// Studio et la synchronisation des canvas exigent ce jeton signé côté serveur.
export interface AccountSessionClaims {
  v: 1;
  sub: string;
  av: number;
  trust: 'self' | 'admin';
  iat: number;
  exp: number;
}

export interface ActiveAccountSession {
  claims: AccountSessionClaims;
  user: Record<string, any>;
}

export interface ProfessorSessionClaims {
  role: 'prof';
  phone: string;
  classId: string;
  name: string;
  accountId: string;
  sessionVersion: number;
  exp: number;
  /**
   * Compte lu dans Redis pendant cette même requête. Permet de dériver la
   * portée de classes sans second `GET user:id`. Absent des anciens cookies.
   */
  user?: Record<string, any>;
}

export const ACCOUNT_SESSION_COOKIE = 'mathplus_account_session';
export const PROFESSOR_SESSION_COOKIE = 'mathplus_prof_session';

// PROF_SESSION_SECRET reste un fallback de migration afin que les déploiements
// existants continuent de fonctionner. Les nouvelles installations peuvent
// utiliser un secret générique distinct pour toutes les sessions de compte.
const accountSessionSecret = () =>
  process.env.ACCOUNT_SESSION_SECRET || process.env.PROF_SESSION_SECRET || '';

const professorSessionSecret = () =>
  process.env.PROF_SESSION_SECRET || '';

/** Une seule représentation est utilisée dans toutes les clés et comparaisons. */
export function normalizePhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^(?:\+|00)?[0-9\s().-]+$/.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  return digits ? `+${digits}` : '';
}

export function isValidPhone(value: unknown): boolean {
  return /^\+\d{8,15}$/.test(normalizePhone(value));
}

// ── Mot de passe (hachage scrypt, sans dépendance native) ─────────────────────
// Le sel est aléatoire par mot de passe et stocké sous la forme `salt:hash`.
// `scrypt` est fourni par Node (aucun module natif) — compatible Vercel serverless.

const PASSWORD_KEY_LEN = 64;

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 6 && value.length <= 128;
}

export async function hashPassword(password: string): Promise<string | null> {
  if (!password) return null;
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, PASSWORD_KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!password || !stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const derived = (await scryptAsync(password, salt, PASSWORD_KEY_LEN)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Clé canonique d'abord, puis les deux formes historiques à migrer. */
export function phoneAliasVariants(value: unknown): string[] {
  const canonical = normalizePhone(value);
  if (!isValidPhone(canonical)) return [];
  const digits = canonical.slice(1);
  return [canonical, digits, `00${digits}`];
}

/**
 * Les anciens comptes n'avaient pas d'identifiant. Un identifiant déterministe
 * empêche deux requêtes concurrentes de créer deux autorités `user:id:*`.
 */
export function deriveLegacyAccountId(user: Record<string, any>): string {
  const phone = normalizePhone(user?.phone);
  const classId = String(user?.classId || '').trim();
  const name = String(user?.name || '').normalize('NFKC').trim().toLowerCase();
  const stableIdentity = phone ? `phone:${phone}` : `class:${classId}|name:${name}`;
  return `legacy_${createHash('sha256').update(stableIdentity).digest('hex').slice(0, 40)}`;
}

function decodeRedisObject(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw !== 'string' || !raw.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function accountIdFromAlias(raw: unknown): string {
  if (typeof raw === 'string' && raw && !raw.trim().startsWith('{')) return raw;
  const legacy = decodeRedisObject(raw);
  if (!legacy) return '';
  return typeof legacy.accountId === 'string' && legacy.accountId
    ? legacy.accountId
    : deriveLegacyAccountId(legacy);
}

async function readIndexedPhoneAlias(phone: unknown): Promise<{ raw: unknown; accountId: string } | null> {
  for (const variant of phoneAliasVariants(phone)) {
    const raw = await redis.get(`user:phone:${variant}`) as unknown;
    if (raw) return { raw, accountId: accountIdFromAlias(raw) };
  }
  return null;
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function readCookie(req: ApiRequest, name: string): string {
  const cookieHeader = req.headers?.cookie || req.headers?.Cookie || '';
  return cookieHeader.split(';').map(part => part.trim()).reduce((found, part) => {
    if (found) return found;
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator) !== name) return '';
    try { return decodeURIComponent(part.slice(separator + 1)); } catch { return ''; }
  }, '');
}

export function issueAccountSession(input: {
  accountId: string;
  authVersion: number;
  trust: 'self' | 'admin';
}): string | null {
  const secret = accountSessionSecret();
  if (!secret || !input.accountId) return null;
  const now = Math.floor(Date.now() / 1000);
  const claims: AccountSessionClaims = {
    v: 1,
    sub: input.accountId,
    av: Number(input.authVersion || 1),
    trust: input.trust,
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
  };
  const payload = encodePart(claims);
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readAccountSession(req: ApiRequest): AccountSessionClaims | null {
  const token = readCookie(req, ACCOUNT_SESSION_COOKIE);
  const secret = accountSessionSecret();
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccountSessionClaims>;
    const claims: AccountSessionClaims = {
      ...decoded,
      trust: decoded.trust === 'admin' ? 'admin' : 'self',
    } as AccountSessionClaims;
    if (
      claims.v !== 1
      || !claims.sub
      || !Number.isInteger(claims.av)
      || claims.av < 1
      || !Number.isInteger(claims.iat)
      || !Number.isInteger(claims.exp)
      || claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function readActiveAccountSession(req: ApiRequest): Promise<ActiveAccountSession | null> {
  const claims = readAccountSession(req);
  if (!claims) return null;
  if (await redis.get(`user:tombstone:${claims.sub}`)) return null;
  const raw = await redis.get(`user:id:${claims.sub}`) as unknown;
  const user = decodeRedisObject(raw);
  if (
    !user
    || user.accountId !== claims.sub
    || Number(user.authVersion || 1) !== claims.av
  ) return null;

  // `user:id:*` seul ne suffit pas : une ancienne copie orpheline ne doit
  // jamais conserver les droits après une migration ou une rétrogradation.
  const phone = normalizePhone(user.phone);
  if (isValidPhone(phone)) {
    const phoneAlias = await readIndexedPhoneAlias(phone);
    if (phoneAlias?.accountId !== claims.sub) return null;
    return { claims, user };
  }
  const googleSub = typeof user.googleSub === 'string' ? user.googleSub.trim() : '';
  const identityKey = typeof user.authIdentityKey === 'string' ? user.authIdentityKey.trim() : '';
  if (identityKey || googleSub) {
    const linkedId = String((await redis.get(identityKey || `idx:google:${googleSub}`)) || '').trim();
    if (linkedId !== claims.sub) return null;
    return { claims, user };
  }
  return null;
}

export function readProfessorSession(req: ApiRequest): ProfessorSessionClaims | null {
  const token = readCookie(req, PROFESSOR_SESSION_COOKIE);
  const secret = professorSessionSecret();
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ProfessorSessionClaims;
    if (
      claims.role !== 'prof'
      || !claims.phone
      || !Number.isFinite(claims.sessionVersion)
      || !Number.isInteger(claims.exp)
      || claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function readActiveProfessorSession(req: ApiRequest): Promise<ProfessorSessionClaims | null> {
  const accountSession = await readActiveAccountSession(req);
  if (accountSession) {
    if (accountSession.user?.role !== 'prof') return null;
    const { claims, user } = accountSession;
    return {
      role: 'prof',
      phone: String(user.phone || ''),
      classId: String(user.classId || ''),
      name: String(user.name || ''),
      accountId: String(claims.sub || user.accountId || ''),
      sessionVersion: Number(user.profSessionVersion || 0),
      exp: claims.exp,
      user,
    };
  }

  // Migration douce : les anciens cookies professeur restent valides pendant
  // leur courte durée de vie. /api/users?action=me les convertit ensuite en
  // session de compte générique, sans redemander de code.
  const claims = readProfessorSession(req);
  if (!claims) return null;
  const phone = normalizePhone(claims.phone);
  if (!isValidPhone(phone)) return null;
  const indexed = await readIndexedPhoneAlias(phone);
  if (!indexed) return null;
  let user = decodeRedisObject(indexed.raw);
  const canonicalId = indexed.accountId;
  if (canonicalId) {
    if (await redis.get(`user:tombstone:${canonicalId}`)) return null;
    const canonical = decodeRedisObject(await redis.get(`user:id:${canonicalId}`) as unknown);
    if (canonical?.accountId === canonicalId) user = canonical;
  }
  // Un changement de rôle OU de classe invalide immédiatement les anciens
  // jetons. Le professeur doit se reconnecter pour recevoir les nouveaux droits.
  return user?.role === 'prof'
    && user?.classId === claims.classId
    && Number(user?.profSessionVersion || 0) === claims.sessionVersion
    ? { ...claims, accountId: String(user.accountId || '') }
    : null;
}

export async function canEditContent(req: ApiRequest): Promise<boolean> {
  return isAdmin(req) || (await readActiveProfessorSession(req)) !== null;
}

// ── Liens & boutons d'action ─────────────────────────────────────────────────

/** Normalise un lien : ajoute https:// si l'utilisateur a omis le schéma. */
export function normalizeUrl(url?: string): string {
  if (!url) return '/';
  const u = url.trim();
  if (!u) return '/';
  if (u.startsWith('/')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return 'https://' + u;
  return u;
}

/** Boutons affichés dans la notification selon le type de lien. */
export function linkActions(url: string): Array<{ action: string; title: string }> | undefined {
  if (!/^https?:\/\//i.test(url)) return undefined;
  if (/meet\.google|zoom\.us|teams\.microsoft|whereby\.com/i.test(url)) {
    return [{ action: 'open', title: '🎥 Rejoindre' }];
  }
  return [{ action: 'open', title: 'Ouvrir le lien' }];
}

// ── Payload de notification push ─────────────────────────────────────────────

export interface NotifyPayloadSpec {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
  priority?: string;
  image?: string;
}

/** Construit le JSON envoyé au SW pour les envois manuels. */
export function buildNotifyPayload(spec: NotifyPayloadSpec): string {
  const finalUrl = normalizeUrl(spec.url);
  const actions = linkActions(finalUrl);
  return JSON.stringify({
    title: String(spec.title).trim(),
    body: String(spec.body).trim(),
    url: finalUrl,
    tag: spec.tag || `mathplus-${Date.now()}`,
    type: spec.type || 'reminder',
    priority: spec.priority || 'normal',
    timestamp: Date.now(),
    ...(spec.image ? { image: normalizeUrl(spec.image) } : {}),
    ...(actions ? { actions } : {}),
  });
}

// ── Abonnés push ─────────────────────────────────────────────────────────────

export interface Subscriber {
  key: string;
  classId?: string;
  data: any;
}

export interface SubscriberPrefs {
  enabled?: boolean;
  quietHours?: { enabled?: boolean; from?: string; to?: string };
  categories?: Record<string, boolean>;
}

/** Heure locale de l'élève. Toute la promotion est au Maroc. */
const STUDENT_TZ = 'Africa/Casablanca';

function minutesNowInTz(now: Date): number {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: STUDENT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

function toMinutes(value?: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Plage silencieuse, gérée à cheval sur minuit (21:30 → 07:00). */
function isQuiet(prefs: SubscriberPrefs | null | undefined, now: Date): boolean {
  const q = prefs?.quietHours;
  if (!q?.enabled) return false;
  const start = toMinutes(q.from);
  const end = toMinutes(q.to);
  if (start === null || end === null || start === end) return false;
  const cur = minutesNowInTz(now);
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * Décide si un envoi est autorisé pour cet abonné, selon ses préférences.
 *
 * Un abonnement antérieur aux préférences (`prefs === null`) continue de tout
 * recevoir. `bypassQuiet` laisse passer un message urgent pendant la plage
 * silencieuse.
 */
export function subscriberAllows(
  prefs: SubscriberPrefs | null | undefined,
  category: string,
  now: Date,
  opts?: { bypassQuiet?: boolean },
): boolean {
  if (!prefs) return true;
  if (prefs.enabled === false) return false;
  if (prefs.categories && prefs.categories[category] === false) return false;
  return opts?.bypassQuiet ? true : !isQuiet(prefs, now);
}

/** Charge les données d'abonnés en un seul aller-retour Redis (pipeline). */
export async function loadSubscribers(keys: string[]): Promise<{ subs: Subscriber[]; orphans: string[] }> {
  const subs: Subscriber[] = [];
  const orphans: string[] = [];
  if (!keys.length) return { subs, orphans };

  const pipeline = redis.pipeline();
  keys.forEach(k => pipeline.get(k));
  const results = await pipeline.exec();

  for (let i = 0; i < keys.length; i++) {
    const raw = results[i] as unknown;
    if (!raw) { orphans.push(keys[i]); continue; }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data?.subscription) { orphans.push(keys[i]); continue; }
    subs.push({ key: keys[i], classId: data.classId, data });
  }
  return { subs, orphans };
}

/** Envoie un payload à une liste d'abonnés avec une limite de concurrence. */
export async function sendToSubscribers(
  subs: Subscriber[],
  payload: string,
  concurrency = 20
): Promise<{ sent: number; failed: number; expired: Subscriber[] }> {
  let sent = 0;
  let failed = 0;
  const expired: Subscriber[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < subs.length) {
      const sub = subs[cursor++];
      try {
        await webpush.sendNotification(sub.data.subscription, payload);
        sent++;
      } catch (error: any) {
        failed++;
        if (error?.statusCode === 410 || error?.statusCode === 404) expired.push(sub);
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, subs.length) }, worker);
  await Promise.all(pool);
  return { sent, failed, expired };
}

/** Supprime les abonnements expirés des index Redis. */
export async function cleanupExpired(expired: Array<{ key: string; classId?: string }>): Promise<number> {
  if (!expired.length) return 0;
  const seen = new Set<string>();
  const unique = expired.filter(e => (seen.has(e.key) ? false : seen.add(e.key)));
  await Promise.all(unique.map(async ({ key, classId }) => {
    await redis.del(key);
    await redis.srem('push:subscribers', key);
    if (classId) await redis.srem(`push:class:${classId}`, key);
  }));
  return unique.length;
}

/** Résout les abonnés d'une classe (avec repli sur le scan global). */
export async function resolveClassSubscribers(classId: string): Promise<{ subs: Subscriber[]; orphans: string[] }> {
  let keys = await redis.smembers(`push:class:${classId}`) as string[];
  if (!keys.length) keys = await redis.smembers('push:subscribers') as string[];
  const { subs, orphans } = await loadSubscribers(keys);
  return { subs: subs.filter(s => s.data.classId === classId), orphans };
}

// ── Historique des envois ────────────────────────────────────────────────────

export interface HistoryEntry {
  at: number;
  kind: 'manual' | 'report' | 'scheduled' | 'auto';
  title: string;
  body: string;
  targetClass?: string;
  sent?: number;
  failed?: number;
}

const HISTORY_KEY = 'notif:history';
const HISTORY_MAX = 200;

export async function logHistory(entry: HistoryEntry): Promise<void> {
  try {
    await redis.lpush(HISTORY_KEY, JSON.stringify(entry));
    await redis.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
  } catch { /* non bloquant */ }
}

export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  const raw = await redis.lrange(HISTORY_KEY, 0, Math.max(0, limit - 1)) as unknown[];
  const out: HistoryEntry[] = [];
  for (const r of raw) {
    try { out.push(typeof r === 'string' ? JSON.parse(r) : r as HistoryEntry); } catch { /* skip */ }
  }
  return out;
}
