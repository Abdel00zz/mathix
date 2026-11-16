import { RevisionLexiconEntry } from '../types';
import { normalizeLexiconText } from './lexiconUtils';

export const LEXICON_REVEAL_MS = 5_000;
const LEXICON_COOLDOWN_MS = 60 * 60 * 1_000;

const STORAGE_PREFIX = 'mathplus:revision-lexicon:cooldown:';

const storageAvailable = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getLexiconMemoryKey = (term: string, category?: string) => {
  const normalizedTerm = normalizeLexiconText(term);
  const normalizedCategory = normalizeLexiconText(category || 'terme');
  return `${STORAGE_PREFIX}${encodeURIComponent(`${normalizedCategory}:${normalizedTerm}`)}`;
};

export const getLexiconMemoryKeyForEntry = (entry: RevisionLexiconEntry) => (
  getLexiconMemoryKey(entry.term, entry.category)
);

export const getLexiconMemoryKeyForElement = (element: HTMLElement) => (
  element.dataset.lexiconMemoryKey ||
  getLexiconMemoryKey(element.dataset.lexiconTerm || element.dataset.termFr || '', element.dataset.lexiconCategory)
);

export const getLexiconCooldownUntil = (key: string, now = Date.now()) => {
  if (!storageAvailable()) return 0;

  try {
    const storedValue = window.localStorage.getItem(key);
    const cooldownUntil = storedValue ? Number.parseInt(storedValue, 10) : 0;
    if (!Number.isFinite(cooldownUntil) || cooldownUntil <= now) {
      window.localStorage.removeItem(key);
      return 0;
    }
    return cooldownUntil;
  } catch {
    return 0;
  }
};

export const setLexiconCooldown = (key: string, now = Date.now()) => {
  const cooldownUntil = now + LEXICON_COOLDOWN_MS;
  if (!storageAvailable()) return cooldownUntil;

  try {
    window.localStorage.setItem(key, String(cooldownUntil));
  } catch {
    // Storage can be unavailable in private contexts; the in-session timeout still works.
  }

  return cooldownUntil;
};
