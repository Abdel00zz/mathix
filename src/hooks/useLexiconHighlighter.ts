import { useCallback, useMemo } from 'react';
import { RevisionLexiconEntry } from '../types';
import { getLexiconCategoryClassName, getLexiconSearchKeys, normalizeLexiconText } from '../utils/lexiconUtils';
import { getLexiconCooldownUntil, getLexiconMemoryKeyForEntry } from '../utils/lexiconMemory';

const LEXICON_CLASS = 'mathflow-lexicon-term';
const AUTO_LEXICON_CLASS = 'mathflow-lexicon-auto';

const SKIP_SELECTOR = [
  '.katex',
  'mjx-container',
  '.math-inline-node',
  '.math-display-node',
  `.${LEXICON_CLASS}`,
  '.math-blank',
  '.mathflow-highlight',
  '[aria-hidden="true"]',
  'script',
  'style',
  'textarea',
  'input',
  'select',
  'button',
  '[contenteditable="true"]',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  '.revision-reveal-header',
  '.revision-block-header',
  '.revision-title-text',
  '.revision-badge',
  '.revision-method-holo',
].join(',');

type CompiledLexiconMatcher = {
  regex: RegExp;
  entriesByKey: Map<string, RevisionLexiconEntry>;
  minKeyLength: number;
} | null;

type FoldedText = {
  folded: string;
  map: number[];
};

type TextMatch = {
  start: number;
  end: number;
  entry: RevisionLexiconEntry;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LETTERS_OR_NUMBERS_RE = /[\p{L}\p{N}]/u;
const hasLettersOrNumbers = (value: string) => LETTERS_OR_NUMBERS_RE.test(value);

const toPatternSource = (key: string) => key.split(/\s+/).map(escapeRegExp).join('\\s+');

const foldTextWithMap = (text: string): FoldedText => {
  let folded = '';
  const map: number[] = [];

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;

    const char = String.fromCodePoint(codePoint);
    const charLength = char.length;
    let normalized = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');

    if (/[\u00a0\s]/u.test(char)) {
      normalized = ' ';
    } else if (char === '\u2019' || char === '`') {
      normalized = "'";
    }

    for (const outputChar of normalized) {
      folded += outputChar;
      map.push(index);
    }

    index += charLength;
  }

  return { folded, map };
};

const compileLexiconMatcher = (entries: RevisionLexiconEntry[]): CompiledLexiconMatcher => {
  if (!entries.length) return null;

  const entriesByKey = new Map<string, RevisionLexiconEntry>();
  let minLen = Infinity;

  for (let i = 0; i < entries.length; i++) {
    const keys = getLexiconSearchKeys(entries[i]);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (key.length < 2 || !hasLettersOrNumbers(key) || entriesByKey.has(key)) continue;
      entriesByKey.set(key, entries[i]);
      if (key.length < minLen) minLen = key.length;
    }
  }

  if (!entriesByKey.size) return null;

  const keys = Array.from(entriesByKey.keys()).sort((a, b) => b.length - a.length);

  return {
    regex: new RegExp(`(^|[^\\p{L}\\p{N}])(${keys.map(toPatternSource).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu'),
    entriesByKey,
    minKeyLength: minLen,
  };
};

const findTextMatches = (text: string, matcher: NonNullable<CompiledLexiconMatcher>): TextMatch[] => {
  const { folded, map } = foldTextWithMap(text);
  const matches: TextMatch[] = [];
  let lastEnd = 0;

  matcher.regex.lastIndex = 0;
  let match = matcher.regex.exec(folded);

  while (match) {
    const prefix = match[1] || '';
    const matchedText = match[2] || '';
    const foldedStart = match.index + prefix.length;
    const foldedEnd = foldedStart + matchedText.length;
    const key = normalizeLexiconText(matchedText);
    const entry = matcher.entriesByKey.get(key);

    if (entry) {
      const start = map[foldedStart];
      const end = foldedEnd < map.length ? map[foldedEnd] : text.length;

      if (
        start !== undefined &&
        end !== undefined &&
        end > start &&
        start >= lastEnd
      ) {
        matches.push({ start, end, entry });
        lastEnd = end;
      }
    }

    match = matcher.regex.exec(folded);
  }

  return matches;
};

const replaceNodeWithHighlights = (node: Text, matches: TextMatch[], now: number) => {
  const text = node.nodeValue || '';
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (let i = 0; i < matches.length; i++) {
    const { start, end, entry } = matches[i];

    if (start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, start)));
    }

    const originalText = text.slice(start, end);
    const span = document.createElement('span');
    const memoryKey = getLexiconMemoryKeyForEntry(entry);
    span.className = `${LEXICON_CLASS} ${AUTO_LEXICON_CLASS} ${getLexiconCategoryClassName(entry.category)} is-french`;
    span.dataset.termFr = originalText;
    span.dataset.termAr = entry.arabic;
    span.dataset.state = 'french';
    span.dataset.lexiconTerm = entry.term;
    span.dataset.lexiconMemoryKey = memoryKey;
    if (entry.category) span.dataset.lexiconCategory = entry.category;
    if (entry.symbol) span.dataset.lexiconSymbol = entry.symbol;
    span.setAttribute('dir', 'ltr');
    span.setAttribute('lang', 'fr');
    span.setAttribute('aria-label', `${entry.term} : ${entry.arabic}`);
    span.textContent = originalText;

    if (getLexiconCooldownUntil(memoryKey, now)) {
      span.classList.add('is-cooling');
    }

    fragment.append(span);
    cursor = end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  node.parentNode?.replaceChild(fragment, node);
};

export const useLexiconHighlighter = (entries: RevisionLexiconEntry[]) => {
  const matcher = useMemo(() => compileLexiconMatcher(entries), [entries]);

  return useCallback((root: HTMLElement | null) => {
    if (!root || !matcher) return;

    // Batch read: collect all eligible text nodes before any DOM mutation
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent || '';
          if (text.trim().length < matcher.minKeyLength || !hasLettersOrNumbers(text)) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent || parent.closest(SKIP_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }

    if (!nodes.length) return;

    // Single timestamp for all cooldown checks in this pass
    const now = Date.now();

    // Batch write: mutate DOM after all reads are done
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const text = node.nodeValue || '';
      const matches = findTextMatches(text, matcher);
      if (matches.length) {
        replaceNodeWithHighlights(node, matches, now);
      }
    }
  }, [matcher]);
};
