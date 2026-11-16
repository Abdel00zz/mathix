import { describe, it, expect } from 'vitest';
import { REVISION_BLOCK_TYPES } from '../../types';
import { revisionPalette, revisionPaletteEntry } from './revisionPalette';

describe('palette de types du studio', () => {
  it('couvre tous les types du moteur de révision', () => {
    const covered = new Set(revisionPalette.map((entry) => entry.type));
    const missing = REVISION_BLOCK_TYPES.filter((type) => !covered.has(type));
    expect(missing).toEqual([]);
  });

  it('ne propose aucun type inconnu du moteur', () => {
    const known = new Set<string>(REVISION_BLOCK_TYPES);
    const unknown = revisionPalette.map((entry) => entry.type).filter((type) => !known.has(type));
    expect(unknown).toEqual([]);
  });

  it('n’a ni doublon de type ni doublon de libellé', () => {
    const types = revisionPalette.map((entry) => entry.type);
    const labels = revisionPalette.map((entry) => entry.label);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('donne un libellé lisible à chaque type (jamais la clé brute)', () => {
    for (const entry of revisionPalette) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.label).not.toBe(entry.type);
      expect(entry.label).not.toMatch(/[_-]/);
    }
  });

  it('range chaque type dans un groupe connu et non vide', () => {
    const groups = new Set(revisionPalette.map((entry) => entry.group));
    expect([...groups].sort()).toEqual(['aide', 'cours', 'pratique', 'structure']);
  });

  it('retrouve l’entrée d’un type même mal orthographié', () => {
    expect(revisionPaletteEntry('definition')?.label).toBe('Définition');
    expect(revisionPaletteEntry('methode')?.label).toBe('Méthode');
    expect(revisionPaletteEntry('applicaion')?.label).toBe('Application');
    expect(revisionPaletteEntry('rappel')?.label).toBe('Rappel');
    expect(revisionPaletteEntry('lemme')?.label).toBe('Lemme');
  });

  it('expose les types théoriques ajoutés au moteur', () => {
    for (const type of ['lemma', 'corollary', 'consequence', 'strategy', 'rappel'] as const) {
      expect(revisionPaletteEntry(type), type).toBeDefined();
    }
  });
});
