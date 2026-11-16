/**
 * API de synchronisation hybride L1 Redis + L2 Firestore pour `Apprendre.html`
 * et application Next.js App Router.
 * GET  ?action=health   -> statut Redis/Firestore (DLQ reserve aux requetes autorisees)
 * GET  /api/sync        -> charge l'enveloppe CRDT de l'eleve connecte
 * POST /api/sync        -> fusionne (mergeAppEnvelopes) et persiste L1 + L2 (CAS)
 * POST ?action=drain-dlq -> rejoue la file de reprise Firestore (admin/cron secret)
 */
import {
  isAuthorized,
  readActiveAccountSession,
  redis,
  type ApiRequest,
  type ApiResponse,
} from '../src/server/professor/shared.js';
import { isFirestoreConfigured } from '../src/server/cloud/firestoreRest.js';
import {
  isSameOriginHeaders,
  parseLegacyJsonObject,
  secretsMatchConstantTime,
} from '../src/server/cloud/googleAuth.js';
import {
  SYNC_DLQ_KEY,
  drainFirestoreRetryQueue,
  readHybridDocument,
  writeHybridEnvelopeCas,
} from '../src/server/cloud/hybridStore.js';
import type { CloudAppEnvelope } from '../src/server/cloud/appStateMerge.js';

const MAX_SYNC_BODY_BYTES = 950_000;

function noStore(res: ApiResponse): void {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader?.('Pragma', 'no-cache');
  res.setHeader?.('Vary', 'Cookie');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
}

function isAdminOrCron(req: ApiRequest): boolean {
  const auth = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  return isAuthorized(req) || secretsMatchConstantTime(auth, process.env.CRON_SECRET);
}

function hasRedisEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim()
    && (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim(),
  );
}

async function handleHealth(req: ApiRequest, res: ApiResponse) {
  const authorized = isAdminOrCron(req);
  const redisConfigured = hasRedisEnv();
  const firestoreConfigured = isFirestoreConfigured();
  let dlqPending: number | null = null;

  if (authorized && redisConfigured) {
    try {
      dlqPending = Number(await redis.llen(SYNC_DLQ_KEY)) || 0;
    } catch {
      dlqPending = null;
    }
  }

  return res.status(200).json({
    ok: true,
    mode: 'hybrid-redis-firestore',
    redisConfigured,
    firestoreConfigured,
    dlqPending,
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  noStore(res);
  const method = String(req.method || 'GET').toUpperCase();
  const action = String(req.query?.action || '').trim().toLowerCase();

  try {
    if (method === 'GET' && action === 'health') {
      return await handleHealth(req, res);
    }

    if (method === 'POST') {
      if (!isSameOriginHeaders(req.headers)) {
        return res.status(403).json({ error: 'csrf_origin_mismatch' });
      }
      const parsedBody = parseLegacyJsonObject(req.body, {
        allowEmpty: action === 'drain-dlq',
        maxBytes: MAX_SYNC_BODY_BYTES,
      });
      if (parsedBody.ok === false) {
        return res.status(parsedBody.status).json({ error: parsedBody.error });
      }
      const body = parsedBody.data;

      if (action === 'drain-dlq') {
        if (!isAdminOrCron(req)) {
          return res.status(401).json({ error: 'unauthorized' });
        }
        const rawBatch = Math.trunc(Number(body.maxBatch) || 25);
        const maxBatch = Math.min(100, Math.max(1, rawBatch));
        const synced = await drainFirestoreRetryQueue(maxBatch);
        return res.status(200).json({ ok: true, synced });
      }

      const active = await readActiveAccountSession(req);
      if (!active) {
        return res.status(401).json({ error: 'account_session_required' });
      }

      if (body.envelope !== undefined && (!body.envelope || typeof body.envelope !== 'object' || Array.isArray(body.envelope))) {
        return res.status(400).json({ error: 'invalid_envelope' });
      }

      const accountId = String(active.user.accountId || '').trim();
      const rawEnvelope = body.envelope !== undefined
        ? (body.envelope as Partial<CloudAppEnvelope>)
        : (body as Partial<CloudAppEnvelope>);
      const result = await writeHybridEnvelopeCas(
        `appstate:${accountId}`,
        `apprendre_states/${accountId}`,
        rawEnvelope,
      );
      if (result.ok === false) {
        return res.status(result.status).json({ error: result.error });
      }

      return res.status(200).json({
        ok: true,
        accountId,
        source: result.source,
        storage: result.storage,
        envelope: result.envelope,
      });
    }

    if (method === 'GET') {
      const active = await readActiveAccountSession(req);
      if (!active) {
        return res.status(401).json({ error: 'account_session_required' });
      }
      const accountId = String(active.user.accountId || '').trim();
      const loaded = await readHybridDocument<CloudAppEnvelope>(
        `appstate:${accountId}`,
        `apprendre_states/${accountId}`,
      );
      return res.status(200).json({
        ok: true,
        accountId,
        source: loaded.source,
        envelope: loaded.data,
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/sync] unexpected error:', err);
    return res.status(500).json({ error: 'internal_sync_error' });
  }
}
