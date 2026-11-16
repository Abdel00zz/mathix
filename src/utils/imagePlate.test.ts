import { describe, expect, it } from 'vitest';
import { plateFromSample } from './imagePlate';

describe('plateFromSample — fond derrière une figure', () => {
  it('ne pose aucun fond sur une image opaque (photo)', () => {
    expect(plateFromSample(0, 0.4)).toBe('none');
    expect(plateFromSample(0.01, 0.2)).toBe('none');
  });

  it('pose une plaque claire sous des traits sombres sans fond', () => {
    expect(plateFromSample(0.35, 0.12)).toBe('light');
    expect(plateFromSample(0.9, 0.4)).toBe('light');
  });

  it('laisse le fond sombre pour des traits clairs sans fond', () => {
    expect(plateFromSample(0.35, 0.92)).toBe('dark');
  });

  it('choisit la plaque claire quand la couleur des traits est inconnue', () => {
    // Figure sans aucun pixel mesurable : une plaque claire est le seul choix
    // qui garantit que quelque chose reste visible.
    expect(plateFromSample(1, null)).toBe('light');
  });

  it('traite un dessin au trait antialiasé comme une figure sans fond', () => {
    // Cas réel : 72 % du fond à alpha 0, le reste en traits partiellement
    // opaques — le fond doit être posé, sinon la figure disparaît.
    expect(plateFromSample(0.72, 0.18)).toBe('light');
    expect(plateFromSample(0.99, 0.42)).toBe('light');
  });
});
