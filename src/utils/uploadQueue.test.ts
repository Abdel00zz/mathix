import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUploadQueue, isPermanentUploadError } from './uploadQueue';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

/** Laisse les promesses en attente se résoudre sans avancer l'horloge simulée. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('createUploadQueue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('envoie une fois puis oublie un envoi réussi', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const queue = createUploadQueue<string>({ send });

    queue.enqueue('img_1', 'a');
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('img_1', 'a');
    expect(queue.has('img_1')).toBe(false);
  });

  it('rejoue après un raté passager, avec un délai croissant', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue(undefined);
    const queue = createUploadQueue<string>({ send, baseDelayMs: 1_000 });

    queue.enqueue('img_1', 'a');
    await flush();
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);

    // Deuxième raté : le délai double.
    await vi.advanceTimersByTimeAsync(1_999);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(queue.has('img_1')).toBe(false);
  });

  it("n'insiste jamais sur un refus définitif (fichier trop gros ou invalide)", async () => {
    const send = vi.fn().mockRejectedValue(httpError(413));
    const queue = createUploadQueue<string>({ send, baseDelayMs: 100 });

    queue.enqueue('img_1', 'a');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.has('img_1')).toBe(false);
  });

  it('met en attente après le plafond, puis reprend au retour en ligne', async () => {
    const send = vi.fn().mockRejectedValue(new TypeError('offline'));
    const queue = createUploadQueue<string>({ send, baseDelayMs: 100, maxAttempts: 3 });

    queue.enqueue('img_1', 'a');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(3);
    // Plus d'essai automatique, mais la copie n'est pas perdue.
    expect(queue.has('img_1')).toBe(true);

    send.mockResolvedValue(undefined);
    queue.retryAll();
    await flush();

    expect(send).toHaveBeenCalledTimes(4);
    expect(queue.has('img_1')).toBe(false);
  });

  it("n'envoie jamais deux fois en parallèle la même image", async () => {
    let release: () => void = () => undefined;
    const send = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const queue = createUploadQueue<string>({ send });

    queue.enqueue('img_1', 'a');
    queue.retryAll();
    queue.retryAll();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);

    release();
    await flush();
    expect(queue.has('img_1')).toBe(false);
  });
});

describe('isPermanentUploadError', () => {
  it('reconnaît les refus qu\'un nouvel essai ne corrigera pas', () => {
    for (const status of [400, 413, 415, 422]) expect(isPermanentUploadError(httpError(status))).toBe(true);
  });

  it('traite les pannes passagères et les erreurs réseau comme rejouables', () => {
    for (const status of [401, 408, 429, 500, 502, 503]) expect(isPermanentUploadError(httpError(status))).toBe(false);
    expect(isPermanentUploadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPermanentUploadError(null)).toBe(false);
  });
});
