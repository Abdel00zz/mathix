import { RevisionLexiconEntry } from '../types';

export const normalizeLexiconText = (value: string) => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019`]/g, "'")
    .replace(/[\u00a0\s]+/g, ' ')
    .replace(/^[\s"'()[\]{}«».,;:!?]+|[\s"'()[\]{}«».,;:!?]+$/g, '')
    .toLocaleLowerCase('fr-FR')
);

export const getLexiconSearchKeys = (entry: RevisionLexiconEntry) => {
  const keys = [entry.term, ...(entry.variants || [])]
    .map(normalizeLexiconText)
    .filter(Boolean);

  return Array.from(new Set(keys));
};

export const getLexiconCategoryClassName = (category?: string) => {
  const normalizedCategory = normalizeLexiconText(category || 'terme').replace(/[^a-z0-9]+/g, '-');
  return `mathflow-lexicon-kind-${normalizedCategory || 'terme'}`;
};
