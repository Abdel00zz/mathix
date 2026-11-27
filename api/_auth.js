/**
 * api/_auth.js — Authentification serveur pour la console d'administration Mathix.
 *
 * Modèle de sécurité :
 *  - Aucun mot de passe codé en dur dans le code client ou serveur.
 *  - Mode Production : `process.env.ADMIN_PASSCODE` est défini dans les variables
 *    d'environnement Vercel (vérification à temps constant).
 *  - Mode Première initialisation (aperçu / déploiement vierge sans ADMIN_PASSCODE) :
 *    le premier administrateur choisit un code (>= 8 caractères) haché par `scryptSync`
 *    avec sel aléatoire et enregistré atomiquement (`SET NX`) dans Redis / mémoire.
 *  - Jetons Bearer HMAC-SHA256 sans état (TTL 12 h), conservés uniquement en mémoire JS
 *    côté client (jamais dans localStorage / sessionStorage).
 *  - Limitation anti-force-brute par adresse IP (fenêtre glissante 5 min).
 */

import crypto from 'node:crypto';
import {
  claimAdminAuthRecord,
  getAdminAuthRecord,
  getOrCreateTokenSecret,
  isDistributedJtiRevoked,
  revokeDistributedJti,
  updateAdminAuthRecord,
} from './_store.js';

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LOCKOUT_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 6;

const rateState = globalThis.__MATHIX_AUTH_RATE || (globalThis.__MATHIX_AUTH_RATE = new Map());
const revokedJtis = globalThis.__MATHIX_REVOKED_JTIS || (globalThis.__MATHIX_REVOKED_JTIS = new Map());

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

export function checkAuthRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = rateState.get(ip) || { failures: [], lockedUntil: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)) };
  }
  entry.lockedUntil = 0;
  entry.failures = entry.failures.filter((t) => now - t < RATE_WINDOW_MS);
  if (entry.failures.length >= RATE_MAX_ATTEMPTS) {
    entry.lockedUntil = now + RATE_LOCKOUT_MS;
    rateState.set(ip, entry);
    return { allowed: false, retryAfterSec: Math.ceil(RATE_LOCKOUT_MS / 1000) };
  }
  rateState.set(ip, entry);
  return { allowed: true, remainingAttempts: RATE_MAX_ATTEMPTS - entry.failures.length };
}

export function recordAuthFailure(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = rateState.get(ip) || { failures: [], lockedUntil: 0 };
  entry.failures = entry.failures.filter((t) => now - t < RATE_WINDOW_MS);
  entry.failures.push(now);
  let retryAfterSec = null;
  if (entry.failures.length >= RATE_MAX_ATTEMPTS) {
    entry.lockedUntil = now + RATE_LOCKOUT_MS;
    retryAfterSec = Math.ceil(RATE_LOCKOUT_MS / 1000);
  }
  rateState.set(ip, entry);
  return {
    remainingAttempts: Math.max(0, RATE_MAX_ATTEMPTS - entry.failures.length),
    retryAfterSec,
  };
}

export function clearAuthFailures(req) {
  rateState.delete(clientIp(req));
}

function pruneRevoked(now) {
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp <= now) revokedJtis.delete(jti);
  }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function timingSafeStrEqual(a, b) {
  const h1 = crypto.createHash('sha256').update(String(a)).digest();
  const h2 = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(h1, h2);
}

function hashPasscode(passcode, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(passcode), salt, 32).toString('hex');
  return { salt, hash: derived };
}

function verifyScrypt(passcode, salt, expectedHex) {
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(String(passcode), salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

async function resolveSigningSecret() {
  const envSecret = (process.env.AUTH_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;

  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass) {
    return crypto.createHmac('sha256', 'mathix-signing-key-v2').update(envPass).digest('hex');
  }

  return getOrCreateTokenSecret(() => crypto.randomBytes(32).toString('hex'));
}

export async function issueAdminToken() {
  const secret = await resolveSigningSecret();
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;
  const jti = crypto.randomBytes(16).toString('hex');
  const payload = b64url(JSON.stringify({ role: 'admin', iat, exp, jti }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: exp };
}

export function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof header !== 'string') return '';
  const m = header.match(/^Bearer\s+([A-Za-z0-9._-]{16,512})$/);
  return m ? m[1] : '';
}

async function decodeVerifiedPayload(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const secret = await resolveSigningSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const a = Buffer.from(sigB64);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Date.now();
    if (payload?.role !== 'admin') return null;
    if (typeof payload.exp !== 'number' || now > payload.exp) return null;
    if (typeof payload.jti === 'string') {
      pruneRevoked(now);
      if (revokedJtis.has(payload.jti)) return null;
      if (await isDistributedJtiRevoked(payload.jti)) {
        revokedJtis.set(payload.jti, payload.exp);
        return null;
      }
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminRequest(req) {
  return Boolean(await decodeVerifiedPayload(req));
}

export async function revokeAdminRequest(req) {
  const payload = await decodeVerifiedPayload(req);
  if (!payload || typeof payload.jti !== 'string') return false;
  const now = Date.now();
  pruneRevoked(now);
  if (payload.exp > now) {
    revokedJtis.set(payload.jti, payload.exp);
    await revokeDistributedJti(payload.jti, payload.exp);
  }
  return true;
}

export function validateNewPasscode(clean) {
  if (clean.length < 10 || clean.length > 128) {
    return 'Choisissez un code entre 10 et 128 caractères.';
  }
  let classes = 0;
  if (/[a-z]/.test(clean)) classes++;
  if (/[A-Z]/.test(clean)) classes++;
  if (/[0-9]/.test(clean)) classes++;
  if (/[^A-Za-z0-9]/.test(clean)) classes++;
  if (classes < 3) {
    return 'Combinez au moins 3 types : minuscules, majuscules, chiffres ou symboles.';
  }
  if (new Set(clean).size < 5) {
    return 'Code trop répétitif : utilisez davantage de caractères différents.';
  }
  return null;
}

export async function getAuthStatus(req) {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  const payload = await decodeVerifiedPayload(req);
  const authenticated = Boolean(payload);
  const expiresAt = typeof payload?.exp === 'number' ? payload.exp : null;
  if (envPass) {
    return { mode: 'env', claimed: true, authenticated, expiresAt };
  }
  const claimedRec = await getAdminAuthRecord();
  return {
    mode: claimedRec ? 'claimed' : 'setup',
    claimed: Boolean(claimedRec),
    authenticated,
    expiresAt,
  };
}

export async function authenticateAdminPasscode(passcode) {
  const clean = String(passcode || '').trim();
  if (!clean) return { ok: false, status: 400, error: 'Code d’accès requis.' };

  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass) {
    if (!timingSafeStrEqual(clean, envPass)) {
      return { ok: false, status: 401, error: 'Code d’accès incorrect.' };
    }
    const issued = await issueAdminToken();
    return { ok: true, mode: 'env', ...issued };
  }

  const record = await getAdminAuthRecord();
  if (!record) {
    return { ok: false, status: 409, error: 'Aucun code administrateur configuré : initialisez l’accès.' };
  }
  if (!verifyScrypt(clean, record.salt, record.hash)) {
    return { ok: false, status: 401, error: 'Code d’accès incorrect.' };
  }
  const issued = await issueAdminToken();
  return { ok: true, mode: 'claimed', ...issued };
}

export async function claimFirstRunAdmin(passcode) {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass) {
    return { ok: false, status: 409, error: 'Code déjà configuré côté serveur.' };
  }
  const clean = String(passcode || '').trim();
  const err = validateNewPasscode(clean);
  if (err) {
    return { ok: false, status: 400, error: err };
  }
  const { salt, hash } = hashPasscode(clean);
  const ok = await claimAdminAuthRecord({ salt, hash, claimedAt: Date.now() });
  if (!ok) {
    return { ok: false, status: 409, error: 'L’accès administrateur a déjà été initialisé.' };
  }
  const issued = await issueAdminToken();
  return { ok: true, mode: 'claimed', ...issued };
}

export async function refreshAdminToken(req) {
  const payload = await decodeVerifiedPayload(req);
  if (!payload) {
    return { ok: false, status: 401, error: 'Session expirée. Reconnectez-vous.' };
  }
  if (typeof payload.jti === 'string' && payload.exp > Date.now()) {
    pruneRevoked(Date.now());
    revokedJtis.set(payload.jti, payload.exp);
    await revokeDistributedJti(payload.jti, payload.exp);
  }
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  const issued = await issueAdminToken();
  return { ok: true, mode: envPass ? 'env' : 'claimed', ...issued };
}

export async function changeAdminPasscode(req, currentPasscode, newPasscode) {
  const payload = await decodeVerifiedPayload(req);
  if (!payload) {
    return { ok: false, status: 401, error: 'Authentification administrateur requise.' };
  }
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass) {
    return { ok: false, status: 409, error: 'Le code est géré par la variable serveur ADMIN_PASSCODE.' };
  }
  const curClean = String(currentPasscode || '').trim();
  const newClean = String(newPasscode || '').trim();
  if (!curClean) {
    return { ok: false, status: 400, error: 'Saisissez le code actuel.' };
  }
  const err = validateNewPasscode(newClean);
  if (err) {
    return { ok: false, status: 400, error: err };
  }
  if (curClean === newClean) {
    return { ok: false, status: 400, error: 'Le nouveau code doit être différent de l’actuel.' };
  }
  const record = await getAdminAuthRecord();
  if (!record) {
    return { ok: false, status: 409, error: 'Aucun code administrateur configuré.' };
  }
  if (!verifyScrypt(curClean, record.salt, record.hash)) {
    return { ok: false, status: 401, error: 'Code actuel incorrect.' };
  }
  const { salt, hash } = hashPasscode(newClean);
  await updateAdminAuthRecord({
    salt,
    hash,
    claimedAt: record.claimedAt || Date.now(),
    updatedAt: Date.now(),
  });
  if (typeof payload.jti === 'string' && payload.exp > Date.now()) {
    pruneRevoked(Date.now());
    revokedJtis.set(payload.jti, payload.exp);
    await revokeDistributedJti(payload.jti, payload.exp);
  }
  const issued = await issueAdminToken();
  return { ok: true, mode: 'claimed', ...issued };
}
