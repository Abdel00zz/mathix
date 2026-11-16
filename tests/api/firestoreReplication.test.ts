import { describe, expect, it, vi } from 'vitest';
import { getFirestoreDoc, setFirestoreDoc, replicateFirestoreEnvelope } from '../../src/server/cloud/firestoreRest';
import type { CloudAppEnvelope } from '../../src/server/cloud/appStateMerge';

const envelope = (lesson: string, revision: number, resetAt = 0): CloudAppEnvelope => ({
  profile: {}, state: { q: {}, e: {}, l: { [lesson]: 50 }, lastVisited: null },
  updatedAt: 1000, revision, resetAt,
});

describe('Firestore replication concurrency', () => {
  it('re-reads and merges after a concurrent writer wins the precondition', async () => {
    let saved = envelope('newer', 2);
    const getDoc = vi.fn()
      .mockResolvedValueOnce({ ok: true, exists: false })
      .mockImplementation(async () => ({ ok: true, exists: true, data: saved, updateTime: 'v2' }));
    const setDoc = vi.fn().mockRejectedValueOnce(new Error('firestore_precondition_failed'))
      .mockImplementation(async (_path, value, options) => {
        expect(options.currentDocument).toEqual({ updateTime: 'v2' });
        saved = value;
        return { ok: true };
      });
    await replicateFirestoreEnvelope('apprendre_states/u1', envelope('older', 1), { getDoc, setDoc });
    expect(saved.state.l).toEqual({ older: 50, newer: 50 });
    expect(saved.revision).toBe(2);
    expect(getDoc).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect pre-reset progress when an old replication arrives late', async () => {
    const setDoc = vi.fn<typeof setFirestoreDoc>().mockResolvedValue({ ok: true });
    await replicateFirestoreEnvelope('apprendre_states/u1', envelope('obsolete', 1), {
      getDoc: vi.fn().mockResolvedValue({ ok: true, exists: true, data: envelope('current', 3, 200), updateTime: 'v3' }) as typeof getFirestoreDoc,
      setDoc,
    });
    expect((setDoc.mock.calls[0][1] as unknown as CloudAppEnvelope).state.l).toEqual({ current: 50 });
  });

  it('bounds retries and exposes conflicts so the caller queues replication', async () => {
    const setDoc = vi.fn(async () => { throw new Error('firestore_patch_failed:409'); });
    await expect(replicateFirestoreEnvelope('apprendre_states/u1', envelope('a', 1), {
      getDoc: vi.fn(async () => ({ ok: true, exists: false })), setDoc,
    })).rejects.toThrow('firestore_concurrent_conflict');
    expect(setDoc).toHaveBeenCalledTimes(3);
  });
});
