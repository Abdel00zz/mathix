import { describe, expect, it } from 'vitest';
import { getChapterNumberMap } from './chapterTheme';

describe('getChapterNumberMap', () => {
  it('exclut Mise à niveau de la numérotation des chapitres', () => {
    const numbers = getChapterNumberMap([
      { id: 'mise-a-niveau' },
      { id: 'arithmetique' },
      { id: 'ensembles' },
    ]);

    expect(numbers.has('mise-a-niveau')).toBe(false);
    expect(numbers.get('arithmetique')).toBe(1);
    expect(numbers.get('ensembles')).toBe(2);
  });

  it('exclut toute entrée explicitement épinglée', () => {
    const numbers = getChapterNumberMap([
      { id: 'rappels', pinned: true },
      { id: 'chapitre-a' },
    ]);

    expect(numbers.get('chapitre-a')).toBe(1);
  });
});
