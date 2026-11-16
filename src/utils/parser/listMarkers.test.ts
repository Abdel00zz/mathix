import { describe, expect, it } from 'vitest';
import { alphaLabel, orderedMarkerLabel, romanLabel } from './listMarkers';

describe('alphaLabel', () => {
  it('produit les lettres minuscules, puis aa/ab au-delà de z', () => {
    expect(alphaLabel(0)).toBe('a');
    expect(alphaLabel(1)).toBe('b');
    expect(alphaLabel(25)).toBe('z');
    expect(alphaLabel(26)).toBe('aa');
    expect(alphaLabel(27)).toBe('ab');
  });
});

describe('romanLabel', () => {
  it('convertit les premiers entiers', () => {
    expect(romanLabel(1)).toBe('i');
    expect(romanLabel(2)).toBe('ii');
    expect(romanLabel(3)).toBe('iii');
    expect(romanLabel(4)).toBe('iv');
    expect(romanLabel(9)).toBe('ix');
    expect(romanLabel(10)).toBe('x');
  });
});

describe('orderedMarkerLabel', () => {
  it('numérote la liste principale en décimal sans point', () => {
    expect(orderedMarkerLabel(0, 0)).toBe('1');
    expect(orderedMarkerLabel(9, 0)).toBe('10');
  });

  it('numérote les sous-questions en lettres sans point', () => {
    expect(orderedMarkerLabel(0, 1)).toBe('a');
    expect(orderedMarkerLabel(1, 1)).toBe('b');
    expect(orderedMarkerLabel(2, 1)).toBe('c');
  });

  it('repart à « a » dans chaque sous-liste', () => {
    // Deux appels indépendants pour l'index 0 (deux sous-listes distinctes).
    expect(orderedMarkerLabel(0, 1)).toBe('a');
    expect(orderedMarkerLabel(0, 1)).toBe('a');
  });

  it('continue en chiffres romains sans point au troisième niveau', () => {
    expect(orderedMarkerLabel(0, 2)).toBe('i');
    expect(orderedMarkerLabel(1, 2)).toBe('ii');
  });

  it('traite toute profondeur négative comme la liste principale', () => {
    expect(orderedMarkerLabel(0, -1)).toBe('1');
  });
});
