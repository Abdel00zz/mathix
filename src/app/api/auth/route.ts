import { type CloudAppEnvelope } from '@/server/cloud/appStateMerge';
import {
  createUpstashRestRedisClient,
  getRedisRestCreds,
  readActiveAccountSessionWithRedis,
  readHybridDocumentWithRedis,
  upsertGoogleAccountWithRedis,
  writeHybridDocumentWithRedis,
} from '@/server/cloud/firestoreRest';
import {
  ACCOUNT_COOKIE_MAX_AGE,
  ACCOUNT_SESSION_COOKIE,
  PROFESSOR_SESSION_COOKIE,
  buildSessionCookieHeader,
  cleanControlText,
  getAccountSessionSecret,
  getPublicCloudConfig,
  isSameOriginMutation,
  isValidAppClassId,
  issueAccountSessionToken,
  mapAuthErrorStatus,
  readBoundedJsonRequest,
  readCookieFromHeader,
  sanitizePublicUser,
  verifyGoogleOrFirebaseToken,
} from '@/server/cloud/googleAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AUTH_BODY_BYTES = 32_768;

function jsonNoStore(data: unknown, status = 200, extraHeaders?: Headers): Response {
  const headers = extraHeaders ? new Headers(extraHeaders) : new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Vary', 'Cookie');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

async function readSession(request: Request) {
  const redisClient = createUpstashRestRedisClient();
  if (!redisClient) return null;
  const token = readCookieFromHeader(request.headers.get('cookie') || '', ACCOUNT_SESSION_COOKIE);
  if (!token) return null;
  return readActiveAccountSessionWithRedis(token, redisClient);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || 'me').trim().toLowerCase();
    const providers = getPublicCloudConfig();

    if (action === 'providers') {
      return jsonNoStore(providers, 200);
    }

    if (action === 'me') {
      const active = await readSession(request);
      if (!active) {
        return jsonNoStore({ authenticated: false, user: null, storage: providers }, 200);
      }
      return jsonNoStore(
        {
          authenticated: true,
          user: sanitizePublicUser(active.user),
          storage: providers,
        },
        200,
      );
    }

    return jsonNoStore({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('[next/api/auth] GET error:', err);
    return jsonNoStore({ error: 'cloud_storage_unavailable' }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonNoStore({ error: 'csrf_origin_mismatch' }, 403);
    }

    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || '').trim().toLowerCase();
    const parsedBody = await readBoundedJsonRequest(request, MAX_AUTH_BODY_BYTES, {
      allowEmpty: action === 'logout',
    });
    if (parsedBody.ok === false) {
      return jsonNoStore({ error: parsedBody.error }, parsedBody.status);
    }
    const body = parsedBody.data;

    if (action === 'logout') {
      const headers = new Headers();
      headers.append('Set-Cookie', buildSessionCookieHeader(ACCOUNT_SESSION_COOKIE, null, 0));
      headers.append('Set-Cookie', buildSessionCookieHeader(PROFESSOR_SESSION_COOKIE, null, 0));
      return jsonNoStore({ ok: true }, 200, headers);
    }

    if (action === 'link-profile') {
      const redisClient = createUpstashRestRedisClient();
      if (!redisClient) {
        return jsonNoStore({ error: 'cloud_storage_unconfigured' }, 503);
      }
      const token = readCookieFromHeader(request.headers.get('cookie') || '', ACCOUNT_SESSION_COOKIE);
      const active = token ? await readActiveAccountSessionWithRedis(token, redisClient) : null;
      if (!active) {
        return jsonNoStore({ error: 'account_session_required' }, 401);
      }

      const current = { ...active.user };
      const accountId = String(current.accountId || active.claims.sub || '').trim();
      const firstName = typeof body.firstName === 'string'
        ? cleanControlText(body.firstName, 60)
        : String(current.firstName || '');
      const lastName = typeof body.lastName === 'string'
        ? cleanControlText(body.lastName, 60)
        : String(current.lastName || '');

      let nextClassId = String(current.classId || '');
      if (current.role !== 'prof' && body.classId !== undefined) {
        if (typeof body.classId !== 'string' || !isValidAppClassId(body.classId)) {
          return jsonNoStore({ error: 'invalid_class_id' }, 400);
        }
        nextClassId = body.classId.trim();
      }

      const schoolName = typeof body.schoolName === 'string'
        ? cleanControlText(body.schoolName, 100)
        : String(current.schoolName || '');
      const className = typeof body.className === 'string'
        ? cleanControlText(body.className, 80)
        : String(current.className || '');

      let dashboardTheme = current.dashboardTheme;
      if (body.dashboardTheme !== undefined) {
        if (typeof body.dashboardTheme !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(body.dashboardTheme.trim())) {
          return jsonNoStore({ error: 'invalid_theme' }, 400);
        }
        dashboardTheme = body.dashboardTheme.trim();
      }

      const previousClassId = String(current.classId || '').trim();
      if (previousClassId && previousClassId !== nextClassId && typeof redisClient.srem === 'function') {
        await redisClient.srem(`users:class:${previousClassId}`, accountId);
      }
      if (nextClassId && nextClassId !== previousClassId) {
        await redisClient.sadd(`users:class:${nextClassId}`, accountId);
      }

      const updated: Record<string, unknown> = {
        ...current,
        accountId,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`.trim() || String(current.name || 'Élève'),
        classId: nextClassId,
        className,
        schoolName,
        ...(dashboardTheme ? { dashboardTheme } : {}),
        updatedAt: new Date().toISOString(),
      };

      const storage = await writeHybridDocumentWithRedis(`user:id:${accountId}`, `users/${accountId}`, updated, {
        redisClient,
      });
      return jsonNoStore({ ok: true, user: sanitizePublicUser(updated), storage }, 200);
    }

    if (action === 'google' || action === 'firebase' || !action) {
      const idToken = typeof body.idToken === 'string'
        ? body.idToken.trim()
        : typeof body.credential === 'string'
          ? body.credential.trim()
          : '';
      if (!idToken || idToken.length > 16_384) {
        return jsonNoStore({ error: 'missing_id_token' }, 400);
      }

      if (body.classId !== undefined && typeof body.classId === 'string' && body.classId.trim() && !isValidAppClassId(body.classId, true)) {
        return jsonNoStore({ error: 'invalid_class_id' }, 400);
      }

      let identity;
      try {
        identity = await verifyGoogleOrFirebaseToken(idToken);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'invalid_token';
        return jsonNoStore({ error: msg }, mapAuthErrorStatus(msg));
      }

      const redisClient = getRedisRestCreds() ? createUpstashRestRedisClient() : null;
      if (!redisClient) {
        return jsonNoStore({ error: 'cloud_storage_unconfigured' }, 503);
      }

      if (!getAccountSessionSecret()) {
        return jsonNoStore({ error: 'session_secret_unconfigured' }, 503);
      }

      const { user: mergedUser, isNew, storage } = await upsertGoogleAccountWithRedis(
        identity,
        {
          classId: typeof body.classId === 'string' ? body.classId : undefined,
          className: typeof body.className === 'string' ? body.className : undefined,
          firstName: typeof body.firstName === 'string' ? body.firstName : undefined,
          lastName: typeof body.lastName === 'string' ? body.lastName : undefined,
          schoolName: typeof body.schoolName === 'string' ? body.schoolName : undefined,
        },
        { redisClient },
      );

      const accountId = String(mergedUser.accountId || '');
      const sessionToken = issueAccountSessionToken(accountId, Number(mergedUser.authVersion || 1), 'self');
      if (!sessionToken) {
        return jsonNoStore({ error: 'session_secret_unconfigured' }, 500);
      }

      const headers = new Headers();
      headers.append('Set-Cookie', buildSessionCookieHeader(ACCOUNT_SESSION_COOKIE, sessionToken, ACCOUNT_COOKIE_MAX_AGE));
      headers.append('Set-Cookie', buildSessionCookieHeader(PROFESSOR_SESSION_COOKIE, null, 0));

      const appDoc = await readHybridDocumentWithRedis<CloudAppEnvelope & Record<string, unknown>>(
        `appstate:${accountId}`,
        `apprendre_states/${accountId}`,
        { redisClient },
      );

      return jsonNoStore(
        {
          authenticated: true,
          isNew,
          user: sanitizePublicUser(mergedUser),
          storage,
          providers: getPublicCloudConfig(),
          cloudState: appDoc.data,
        },
        200,
        headers,
      );
    }

    return jsonNoStore({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('[next/api/auth] POST error:', err);
    return jsonNoStore({ error: 'internal_auth_error' }, 500);
  }
}
