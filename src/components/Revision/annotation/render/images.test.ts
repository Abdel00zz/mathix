import { describe, expect, it } from 'vitest';
import { nextRetryDelay } from './images';

describe('nextRetryDelay', () => {
  it('réessaie une image introuvable après 8 s, 30 s puis 90 s', () => {
    expect(nextRetryDelay(0)).toBe(8_000);
    expect(nextRetryDelay(1)).toBe(30_000);
    expect(nextRetryDelay(2)).toBe(90_000);
  });

  it("s'arrête ensuite : une image qui n'existe pas ne doit pas interroger le cloud indéfiniment", () => {
    expect(nextRetryDelay(3)).toBeNull();
    expect(nextRetryDelay(50)).toBeNull();
  });
});
