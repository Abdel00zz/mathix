import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLexiconCategoryClassName,
  getLexiconSearchKeys,
  normalizeLexiconText,
} from './lexiconUtils';
import {
  getLexiconCooldownUntil,
  getLexiconMemoryKeyForEntry,
  LEXICON_REVEAL_MS,
  setLexiconCooldown,
} from './lexiconMemory';

describe('lexicon engine utilities & memory cooldown', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes French diacritics, typographic apostrophes, and punctuation consistently', () => {
    expect(normalizeLexiconText('  Continuité à droite ! ')).toBe('continuite a droite');
    expect(normalizeLexiconText('« L’ensemble »')).toBe("l'ensemble");
    expect(normalizeLexiconText('  Au   voisinage   de  ')).toBe('au voisinage de');
  });

  it('builds deduplicated search keys from term and variants', () => {
    const keys = getLexiconSearchKeys({
      term: 'Limite',
      arabic: 'نهاية',
      category: 'concept',
      definition: 'Valeur limite d’une fonction.',
      variants: ['limites', 'Limite', 'Limite finie'],
    });
    expect(keys).toEqual(['limite', 'limites', 'limite finie']);
  });

  it('formats sanitized lexicon category CSS class names', () => {
    expect(getLexiconCategoryClassName('Concept Clé')).toBe('mathflow-lexicon-kind-concept-cle');
    expect(getLexiconCategoryClassName()).toBe('mathflow-lexicon-kind-terme');
  });

  it('tracks memory key and enforces 1h cooldown until expiration', () => {
    const key = getLexiconMemoryKeyForEntry({
      term: 'Forme indéterminée',
      arabic: 'شكل غير محدد',
      category: 'concept',
      definition: 'Expression dont la limite ne peut pas être lue directement.',
    });

    const now = 1_700_000_000_000;
    const until = setLexiconCooldown(key, now);

    expect(LEXICON_REVEAL_MS).toBe(5_000);
    expect(until).toBe(now + 60 * 60 * 1_000);
    expect(getLexiconCooldownUntil(key, now + 10_000)).toBe(until);
    expect(getLexiconCooldownUntil(key, until)).toBe(0);
  });
});
