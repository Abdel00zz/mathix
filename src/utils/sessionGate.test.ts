import { describe, expect, it } from 'vitest';
import { shouldShowSessionGate } from './sessionGate';

describe('shouldShowSessionGate — page « élèves présents »', () => {
  it('ne s’ouvre pas quand la séance n’a aucun présent déclaré', () => {
    expect(shouldShowSessionGate(0, true)).toBe(false);
  });

  it('s’ouvre dès qu’un élève est présent', () => {
    for (const presentCount of [1, 2, 12]) {
      expect(shouldShowSessionGate(presentCount, true)).toBe(true);
    }
  });

  it('reste prudente tant que la présence n’est pas connue', () => {
    // Présence non lue : on ne saute jamais la page par accident.
    expect(shouldShowSessionGate(0, false)).toBe(true);
  });
});
