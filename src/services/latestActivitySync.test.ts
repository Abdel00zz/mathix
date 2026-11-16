import { describe, expect, it, vi } from 'vitest';
import { createLatestActivitySync } from './latestActivitySync';

describe('activity delivery', () => {
  it('retries an identical payload after failure and deduplicates only after acknowledgement', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const queue = createLatestActivitySync(send);
    await queue.submit({ position: 1 });
    await queue.submit({ position: 1 });
    await queue.submit({ position: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('serializes writes and coalesces intermediate positions', async () => {
    let finish!: () => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = createLatestActivitySync(send);
    const first = queue.submit({ position: 1 });
    void queue.submit({ position: 2 });
    void queue.submit({ position: 3 }, true);
    expect(send).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ position: 3 }, true);
  });

  it('does not retry stale data over a newer pending snapshot', async () => {
    let fail!: (error: Error) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; })).mockResolvedValue(undefined);
    const queue = createLatestActivitySync(send);
    const first = queue.submit({ position: 1 });
    void queue.submit({ position: 2 });
    fail(new Error('offline'));
    await first;
    await queue.flush();
    expect(send).toHaveBeenLastCalledWith({ position: 2 }, false);
  });
});
