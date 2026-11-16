import { type CloudAppEnvelope } from '../../../../../../src/server/cloud/appStateMerge';
import {
  SYNC_DLQ_KEY,
  createUpstashRestRedisClient,
  drainFirestoreRetryQueueWithRedis,
  getRedisRestCreds,
  isFirestoreConfigured,
  mergeAndWriteHybridEnvelope,
  readActiveAccountSessionWithRedis,
  readHybridDocumentWithRedis,
} from '../../../../../../src/server/cloud/firestoreRest';
import {
  ACCOUNT_SESSION_COOKIE,
  isSameOriginMutation,
  readBoundedJsonRequest,
  readCookieFromHeader,
  secretsMatchConstantTime,
} from '../../../../../../src/server/cloud/googleAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SYNC_BODY_BYTES = 950_000;

function jsonNoStore(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function isAuthorized(request: Request): boolean {
  return (
    secretsMatchConstantTime(request.headers.get('x-admin-secret'), process.env.ADMIN_SECRET)
    || secretsMatchConstantTime(request.headers.get('x-push-secret'), process.env.PUSH_SECRET)
    || secretsMatchConstantTime(
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
      process.env.CRON_SECRET,
    )
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || '').trim().toLowerCase();

    if (action === 'health') {
      const redisClient = getRedisRestCreds() ? createUpstashRestRedisClient() : null;
      const redisConfigured = Boolean(redisClient);
      const firestoreConfigured = isFirestoreConfigured();
      let dlqPending: number | null = null;

      if (isAuthorized(request) && redisClient?.llen) {
        try {
          dlqPending = Number(await redisClient.llen(SYNC_DLQ_KEY)) || 0;
        } catch {
          dlqPending = null;
        }
      }

      return jsonNoStore({
        ok: true,
        mode: 'hybrid-redis-firestore',
        redisConfigured,
        firestoreConfigured,
        dlqPending,
      });
    }

    const redisClient = createUpstashRestRedisClient();
    const token = readCookieFromHeader(request.headers.get('cookie') || '', ACCOUNT_SESSION_COOKIE);
    const active = redisClient && token ? await readActiveAccountSessionWithRedis(token, redisClient) : null;
    if (!active) {
      return jsonNoStore({ error: 'account_session_required' }, 401);
    }

    const accountId = String(active.user.accountId || active.claims.sub || '').trim();
    const loaded = await readHybridDocumentWithRedis<CloudAppEnvelope & Record<string, unknown>>(
      `appstate:${accountId}`,
      `apprendre_states/${accountId}`,
      { redisClient: redisClient! },
    );

    return jsonNoStore({
      ok: true,
      accountId,
      source: loaded.source,
      envelope: loaded.data,
    });
  } catch (err) {
    console.error('[next/api/sync] GET error:', err);
    return jsonNoStore({ error: 'internal_sync_error' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (!isSameOriginMutation(request)) {
      return jsonNoStore({ error: 'csrf_origin_mismatch' }, 403);
    }

    const url = new URL(request.url);
    const action = (url.searchParams.get('action') || '').trim().toLowerCase();
    const parsedBody = await readBoundedJsonRequest(request, MAX_SYNC_BODY_BYTES, {
      allowEmpty: action === 'drain-dlq',
    });
    if (parsedBody.ok === false) {
      return jsonNoStore({ error: parsedBody.error }, parsedBody.status);
    }
    const body = parsedBody.data;

    const redisClient = createUpstashRestRedisClient();

    if (action === 'drain-dlq') {
      if (!isAuthorized(request)) {
        return jsonNoStore({ error: 'unauthorized' }, 401);
      }
      if (!redisClient) {
        return jsonNoStore({ ok: true, synced: 0 }, 200);
      }
      const rawBatch = Math.trunc(Number(body.maxBatch) || 25);
      const maxBatch = Math.min(100, Math.max(1, rawBatch));
      const synced = await drainFirestoreRetryQueueWithRedis(maxBatch, { redisClient });
      return jsonNoStore({ ok: true, synced }, 200);
    }

    if (!redisClient) {
      return jsonNoStore({ error: 'account_session_required' }, 401);
    }

    const token = readCookieFromHeader(request.headers.get('cookie') || '', ACCOUNT_SESSION_COOKIE);
    const active = token ? await readActiveAccountSessionWithRedis(token, redisClient) : null;
    if (!active) {
      return jsonNoStore({ error: 'account_session_required' }, 401);
    }

    if (body.envelope !== undefined && (!body.envelope || typeof body.envelope !== 'object' || Array.isArray(body.envelope))) {
      return jsonNoStore({ error: 'invalid_envelope' }, 400);
    }

    const rawEnvelope = body.envelope !== undefined
      ? (body.envelope as Partial<CloudAppEnvelope>)
      : (body as Partial<CloudAppEnvelope>);
    const accountId = String(active.user.accountId || active.claims.sub || '').trim();
    const result = await mergeAndWriteHybridEnvelope(
      `appstate:${accountId}`,
      `apprendre_states/${accountId}`,
      rawEnvelope,
      { redisClient },
    );

    if (result.ok === false) {
      return jsonNoStore({ error: result.error }, result.status);
    }

    return jsonNoStore({
      ok: true,
      accountId,
      source: result.source,
      storage: result.storage,
      envelope: result.envelope,
    });
  } catch (err) {
    console.error('[next/api/sync] POST error:', err);
    return jsonNoStore({ error: 'internal_sync_error' }, 500);
  }
}
