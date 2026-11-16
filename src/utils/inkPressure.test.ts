import { describe, expect, it } from 'vitest';
import { calibratePressure } from './inkPressure';

describe('calibratePressure', () => {
  it('uses a stable fallback for a pen without pressure data', () => {
    expect(calibratePressure({ pointerType: 'pen', pressure: 0 }, 'balanced', false)).toBe(0.12);
  });

  it('applies the selected pressure curve and keeps the result bounded', () => {
    const sample = { pointerType: 'pen', pressure: 0.36 };

    expect(calibratePressure(sample, 'soft', false)).toBeGreaterThan(sample.pressure);
    expect(calibratePressure(sample, 'firm', false)).toBeLessThan(sample.pressure);
    expect(calibratePressure({ ...sample, tiltX: 90 }, 'balanced', true)).toBeLessThanOrEqual(1);
  });
});
