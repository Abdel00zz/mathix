/**
 * Store Hybride L1 Redis (chaud / atomique) + L2 Cloud Firestore (durable + DLQ retry).
 * Delegue les primitives sans dependance a `firestoreRest.ts` tout en injectant `redis` de `shared.ts`.
 */
import { redis } from '../professor/shared.js';
import type { CloudAppEnvelope } from './appStateMerge.js';
import {
  SYNC_DLQ_KEY,
  drainFirestoreRetryQueueWithRedis,
  getFirestoreDoc,
  mergeAndWriteHybridEnvelope,
  readHybridDocumentWithRedis,
  setFirestoreDoc,
  upsertGoogleAccountWithRedis,
  writeHybridDocumentWithRedis,
  type HybridRedisClient,
  type SyncCasWriteResult,
} from './firestoreRest.js';
import type { VerifiedGoogleIdentity } from './googleAuth.js';

export { SYNC_DLQ_KEY };

export interface HybridWriteResult {
  redis: 'ok';
  firestore: 'ok' | 'queued' | 'skipped';
}

export interface HybridDeps {
  redisClient?: typeof redis;
  getDoc?: typeof getFirestoreDoc;
  setDoc?: typeof setFirestoreDoc;
  firestoreEnabled?: () => boolean;
}

function toStorageDeps(deps: HybridDeps) {
  return {
    redisClient: (deps.redisClient || redis) as unknown as HybridRedisClient,
    getDoc: deps.getDoc,
    setDoc: deps.setDoc,
    firestoreEnabled: deps.firestoreEnabled,
  };
}

export function readHybridDocument<T extends Record<string, any>>(
  redisKey: string,
  firestorePath: string,
  deps: HybridDeps = {},
): Promise<{ data: T | null; source: 'redis' | 'firestore' | 'none' }> {
  return readHybridDocumentWithRedis<T>(redisKey, firestorePath, toStorageDeps(deps));
}

export function writeHybridDocument<T extends Record<string, any>>(
  redisKey: string,
  firestorePath: string,
  payload: T,
  deps: HybridDeps = {},
): Promise<HybridWriteResult> {
  return writeHybridDocumentWithRedis<T>(redisKey, firestorePath, payload, toStorageDeps(deps));
}

export function writeHybridEnvelopeCas(
  redisKey: string,
  firestorePath: string,
  rawEnvelope: Partial<CloudAppEnvelope>,
  deps: HybridDeps = {},
): Promise<SyncCasWriteResult> {
  return mergeAndWriteHybridEnvelope(redisKey, firestorePath, rawEnvelope, toStorageDeps(deps));
}

export function drainFirestoreRetryQueue(maxBatch = 20, deps: HybridDeps = {}): Promise<number> {
  return drainFirestoreRetryQueueWithRedis(maxBatch, toStorageDeps(deps));
}

export function upsertGoogleAccount(
  identity: VerifiedGoogleIdentity,
  overrides: { classId?: string; className?: string; firstName?: string; lastName?: string; schoolName?: string } = {},
  deps: HybridDeps = {},
): Promise<{ user: Record<string, any>; isNew: boolean; storage: HybridWriteResult }> {
  return upsertGoogleAccountWithRedis(identity, overrides, toStorageDeps(deps));
}
