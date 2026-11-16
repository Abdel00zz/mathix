/**
 * MathFlow — Shared pure TeX, HTML, delimiter, Roman numeral, and media normalization helpers.
 * Zero DOM/browser/React dependencies; safe for Node SSR and client bundles.
 */

export const HTML_TAG_SPLIT = /(<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>)/g;
export const TAG_SPLIT = HTML_TAG_SPLIT;

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/** Type guard returning true for non-null plain object records. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Coerces unknown values into a plain record (returning `{}` when non-object). */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Normalizes a string, finite number, or array of paragraphs into clean text. */
export function toText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    return v
      .filter((x) => x != null && x !== '')
      .map(String)
      .join('\n\n');
  }
  return '';
}

/** Escapes HTML special characters for safe attribute and text interpolation. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Finds the matching closing delimiter index starting from `openIdx`, respecting backslash escapes. */
export function findBalanced(str: string, openIdx: number, openCh: string, closeCh: string): number {
  if (str.charAt(openIdx) !== openCh) return -1;
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str.charAt(i);
    if (ch === '\\' && i + 1 < str.length) {
      i++;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh && --depth === 0) return i;
  }
  return -1;
}

/** Reads a delimited group starting at or after `startIdx` (skipping leading whitespace). */
export function readDelimGroup(
  src: string,
  startIdx: number,
  openCh: string,
  closeCh: string,
): { value: string; end: number } | null {
  let i = startIdx;
  while (i < src.length && /\s/.test(src.charAt(i))) i++;
  if (src.charAt(i) !== openCh) return null;
  const closeIdx = findBalanced(src, i, openCh, closeCh);
  return closeIdx > i ? { value: src.slice(i + 1, closeIdx), end: closeIdx + 1 } : null;
}

/** Counts consecutive preceding backslashes before index `pos`. */
export function countPrecedingBackslashes(str: string, pos: number): number {
  let bs = 0;
  for (let b = pos - 1; b >= 0 && str.charAt(b) === '\\'; b--) bs++;
  return bs;
}

/** Converts an integer (1..3999) into lowercase Roman numerals (`i`, `ii`, `iii`, ...). */
export function romanize(n: number): string {
  let num = Math.max(1, Math.min(3999, Math.floor(Number(n) || 1)));
  let out = '';
  for (const [val, sym] of ROMAN_NUMERALS) {
    while (num >= val) {
      out += sym;
      num -= val;
    }
  }
  return out;
}

/** Normalizes string, `{ src }`, or `{ images: [...] }` media descriptors. */
export function normalizeMedia(media: unknown): Record<string, unknown> | null {
  if (!media) return null;
  if (typeof media === 'string') {
    const trimmed = media.trim();
    return trimmed ? { src: trimmed } : null;
  }
  if (typeof media !== 'object') return null;
  const rec = media as Record<string, unknown>;
  const firstImg =
    Array.isArray(rec.images) && rec.images[0] && typeof rec.images[0] === 'object'
      ? (rec.images[0] as Record<string, unknown>)
      : null;
  return !rec.src && firstImg ? { ...rec, ...firstImg } : rec;
}

/** Returns true when a media descriptor resolves to a non-empty `src` string. */
export function hasMediaSrc(media: unknown): boolean {
  const norm = normalizeMedia(media);
  return Boolean(norm && typeof norm.src === 'string' && norm.src.trim());
}
