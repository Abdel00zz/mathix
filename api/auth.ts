/**
 * API unifiee Google Identity / Firebase Auth + Session Redis L1 / Firestore L2.
 * Actions GET: ?action=providers | ?action=me
 * Actions POST: ?action=google | ?action=link-profile | ?action=logout
 */
import {
  ACCOUNT_SESSION_COOKIE,
  PROFESSOR_SESSION_COOKIE,
  issueAccountSession,
  readActiveAccountSession,
  redis,
  type ApiRequest,
  type ApiResponse,
} from '../src/server/professor/shared.js';
import {
  ACCOUNT_COOKIE_MAX_AGE,
  buildSessionCookieHeader,
  cleanControlText,
  getAccountSessionSecret,
  getPublicCloudConfig,
  isSameOriginHeaders,
  isValidAppClassId,
  mapAuthErrorStatus,
  parseLegacyJsonObject,
  sanitizePublicUser,
  verifyGoogleOrFirebaseToken,
} from '../src/server/cloud/googleAuth.js';
import { readHybridDocument, upsertGoogleAccount, writeHybridDocument } from '../src/server/cloud/hybridStore.js';
import type { CloudAppEnvelope } from '../src/server/cloud/appStateMerge.js';

const MAX_AUTH_BODY_BYTES = 32_768;

function noStore(res: ApiResponse): void {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader?.('Pragma', 'no-cache');
  res.setHeader?.('Vary', 'Cookie');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
}

export { sanitizePublicUser };

async function handleGet(req: ApiRequest, res: ApiResponse) {
  const action = String(req.query?.action || 'me').trim().toLowerCase();
  const providers = getPublicCloudConfig();

  if (action === 'providers') {
    return res.status(200).json(providers);
  }

  if (action === 'me') {
    const active = await readActiveAccountSession(req);
    if (!active) {
      return res.status(200).json({ authenticated: false, user: null, storage: providers });
    }
    return res.status(200).json({
      authenticated: true,
      user: sanitizePublicUser(active.user),
      storage: providers,
    });
  }

  return res.status(400).json({ error: 'unknown_action' });
}

async function handleGoogleLogin(req: ApiRequest, res: ApiResponse, body: Record<string, any>) {
  const idToken = typeof body.idToken === 'string'
    ? body.idToken.trim()
    : typeof body.credential === 'string'
      ? body.credential.trim()
      : '';
  if (!idToken || idToken.length > 16_384) {
    return res.status(400).json({ error: 'missing_id_token' });
  }

  if (body.classId !== undefined && typeof body.classId === 'string' && body.classId.trim() && !isValidAppClassId(body.classId, true)) {
    return res.status(400).json({ error: 'invalid_class_id' });
  }

  let identity;
  try {
    identity = await verifyGoogleOrFirebaseToken(idToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid_token';
    return res.status(mapAuthErrorStatus(msg)).json({ error: msg });
  }

  if (!getAccountSessionSecret()) {
    return res.status(503).json({ error: 'session_secret_unconfigured' });
  }

  const { user, isNew, storage } = await upsertGoogleAccount(identity, {
    classId: typeof body.classId === 'string' ? body.classId : undefined,
    className: typeof body.className === 'string' ? body.className : undefined,
    firstName: typeof body.firstName === 'string' ? body.firstName : undefined,
    lastName: typeof body.lastName === 'string' ? body.lastName : undefined,
    schoolName: typeof body.schoolName === 'string' ? body.schoolName : undefined,
  });

  const sessionToken = issueAccountSession({
    accountId: String(user.accountId || ''),
    authVersion: Number(user.authVersion || 1),
    trust: 'self',
  });
  if (!sessionToken) {
    return res.status(500).json({ error: 'session_secret_unconfigured' });
  }

  res.setHeader?.('Set-Cookie', [
    buildSessionCookieHeader(ACCOUNT_SESSION_COOKIE, sessionToken, ACCOUNT_COOKIE_MAX_AGE),
    buildSessionCookieHeader(PROFESSOR_SESSION_COOKIE, null, 0),
  ]);

  const appDoc = await readHybridDocument<CloudAppEnvelope>(
    `appstate:${user.accountId}`,
    `apprendre_states/${user.accountId}`,
  );

  return res.status(200).json({
    authenticated: true,
    isNew,
    user: sanitizePublicUser(user),
    storage,
    providers: getPublicCloudConfig(),
    cloudState: appDoc.data,
  });
}

async function handleLinkProfile(req: ApiRequest, res: ApiResponse, body: Record<string, any>) {
  const active = await readActiveAccountSession(req);
  if (!active) {
    return res.status(401).json({ error: 'account_session_required' });
  }

  const current: Record<string, any> = { ...active.user };
  const accountId = String(current.accountId || active.claims.sub || '').trim();
  const firstName = typeof body.firstName === 'string' ? cleanControlText(body.firstName, 60) : String(current.firstName || '');
  const lastName = typeof body.lastName === 'string' ? cleanControlText(body.lastName, 60) : String(current.lastName || '');

  let nextClassId = String(current.classId || '');
  if (current.role !== 'prof' && body.classId !== undefined) {
    if (typeof body.classId !== 'string' || !isValidAppClassId(body.classId, true)) {
      return res.status(400).json({ error: 'invalid_class_id' });
    }
    nextClassId = body.classId.trim();
  }

  const schoolName = typeof body.schoolName === 'string' ? cleanControlText(body.schoolName, 100) : String(current.schoolName || '');
  const className = typeof body.className === 'string' ? cleanControlText(body.className, 80) : String(current.className || '');

  let dashboardTheme = current.dashboardTheme;
  if (body.dashboardTheme !== undefined) {
    if (typeof body.dashboardTheme !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(body.dashboardTheme.trim())) {
      return res.status(400).json({ error: 'invalid_theme' });
    }
    dashboardTheme = body.dashboardTheme.trim();
  }

  const previousClassId = String(current.classId || '').trim();
  if (previousClassId && previousClassId !== nextClassId && typeof (redis as any).srem === 'function') {
    await (redis as any).srem(`users:class:${previousClassId}`, accountId);
  }
  if (nextClassId && nextClassId !== previousClassId && typeof (redis as any).sadd === 'function') {
    await (redis as any).sadd(`users:class:${nextClassId}`, accountId);
  }

  const updated: Record<string, any> = {
    ...current,
    accountId,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim() || current.name || 'Élève',
    classId: nextClassId,
    className,
    schoolName,
    ...(dashboardTheme ? { dashboardTheme } : {}),
    updatedAt: new Date().toISOString(),
  };

  const storage = await writeHybridDocument(
    `user:id:${accountId}`,
    `users/${accountId}`,
    updated,
  );
  return res.status(200).json({ ok: true, user: sanitizePublicUser(updated), storage });
}

function handleLogout(res: ApiResponse) {
  res.setHeader?.('Set-Cookie', [
    buildSessionCookieHeader(ACCOUNT_SESSION_COOKIE, null, 0),
    buildSessionCookieHeader(PROFESSOR_SESSION_COOKIE, null, 0),
  ]);
  return res.status(200).json({ ok: true });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const method = String(req.method || 'GET').toUpperCase();
  const action = String(req.query?.action || '').trim().toLowerCase();

  try {
    if (method === 'GET') return await handleGet(req, res);
    if (method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (!isSameOriginHeaders(req.headers)) {
      return res.status(403).json({ error: 'csrf_origin_mismatch' });
    }

    const parsedBody = parseLegacyJsonObject(req.body, {
      allowEmpty: action === 'logout',
      maxBytes: MAX_AUTH_BODY_BYTES,
    });
    if (parsedBody.ok === false) {
      return res.status(parsedBody.status).json({ error: parsedBody.error });
    }

    if (action === 'google' || action === 'firebase' || !action) {
      return await handleGoogleLogin(req, res, parsedBody.data);
    }
    if (action === 'link-profile') {
      return await handleLinkProfile(req, res, parsedBody.data);
    }
    if (action === 'logout') {
      return handleLogout(res);
    }
    return res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    console.error('[api/auth] unexpected error:', err);
    return res.status(500).json({ error: 'internal_auth_error' });
  }
}
