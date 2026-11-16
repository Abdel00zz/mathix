/**
 * MathFlow — Safe media URL resolution, image option parsing, and figure HTML rendering.
 * Pure TypeScript ESM module with zero DOM mutation or event listener side effects.
 */

import { escapeHtml, normalizeMedia, readDelimGroup } from './shared/texUtils';

export interface ImageOptions {
  width: string;
  align: string;
  wrap: string;
  caption: string;
  alt: string;
}

export interface MediaDescriptor {
  src?: string;
  caption?: string;
  alt?: string;
  width?: string | number;
  wrap?: string;
  align?: string;
  position?: string;
  images?: MediaDescriptor[];
}

export interface RenderMediaOptions {
  basePath?: string;
  enableLexicon?: boolean;
  surface?: string;
  renderCaption?: (text: string) => string;
}

/** Validates image URLs against unsafe schemes (`javascript:`, `vbscript:`, protocol-relative `//`, traversal `..`). */
export function isSafeImageSrc(src: unknown): boolean {
  const s = String(src ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!s || s.startsWith('//')) return false;
  const low = s.toLowerCase();
  if (/^(?:javascript|vbscript):/i.test(low)) return false;
  if (low.indexOf('data:') === 0) {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,/i.test(low);
  }
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(s) || /\\/.test(s)) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? /^https?:/i.test(low) : true;
}

/**
 * Resolves a media URL safely and ensures relative `data/...` and chapter-relative paths
 * become root-relative `/...` URLs so Next.js nested routes resolve assets correctly.
 */
export function resolveMediaUrl(src: unknown, basePath?: string): string {
  const raw = String(src ?? '').trim();
  if (!isSafeImageSrc(raw)) return '';
  if (/^(?:https?:|data:|\/)/i.test(raw)) return raw;
  const clean = raw.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!clean) return '';
  if (!basePath || clean.startsWith('data/')) return `/${clean}`;
  const base = String(basePath).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!base) return `/${clean}`;
  const joined = clean.startsWith(`${base}/`) || clean === base ? clean : `${base}/${clean}`;
  return `/${joined.replace(/^\/+/, '')}`;
}

/** Parses CSS length strings or bare pixel numbers into sanitized CSS dimensions. */
export function parseLength(val: unknown): string {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^\d+(?:\.\d+)?$/.test(s)) return `${s}px`;
  return /^\d+(?:\.\d+)?(?:px|%|rem|em|vw)$/.test(s) ? s : '';
}

function splitOptionTokens(rawOpts: string): string[] {
  const out: string[] = [];
  let cur = '';
  let brace = 0;
  let bracket = 0;
  let inMath = false;
  let quote: '"' | "'" | '' = '';

  for (let i = 0; i < rawOpts.length; i++) {
    const ch = rawOpts.charAt(i);
    if (ch === '\\' && i + 1 < rawOpts.length) {
      cur += ch + rawOpts.charAt(i + 1);
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '$' && rawOpts.charAt(i + 1) !== '$') {
      inMath = !inMath;
      cur += ch;
      continue;
    }
    if (!inMath) {
      if (ch === '{') brace++;
      else if (ch === '}' && brace > 0) brace--;
      else if (ch === '[' && brace === 0) bracket++;
      else if (ch === ']' && brace === 0 && bracket > 0) bracket--;
    }
    if (ch === ',' && brace === 0 && bracket === 0 && !inMath) {
      const t = cur.trim();
      if (t) out.push(t);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function stripOuterQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Parses comma-separated `\image[...]` option tokens into a typed options object. */
export function parseImageOptions(rawOpts?: string): ImageOptions {
  const opts: ImageOptions = { width: '', align: '', wrap: '', caption: '', alt: '' };
  splitOptionTokens(String(rawOpts ?? '')).forEach((tok) => {
    const eq = tok.indexOf('=');
    if (eq < 0) {
      if (/^(?:left|right|center|top|bottom)$/.test(tok)) opts.align = tok;
      else if (/^(?:float|wrap|side|stack)$/.test(tok)) opts.wrap = tok;
      else if (!opts.width) opts.width = parseLength(tok);
      return;
    }
    const k = tok.slice(0, eq).trim().toLowerCase();
    const v = stripOuterQuotes(tok.slice(eq + 1).trim());
    if (k === 'width' || k === 'w') opts.width = parseLength(v);
    else if (k === 'align' || k === 'pos' || k === 'position') opts.align = v;
    else if (k === 'wrap' || k === 'float' || k === 'layout') opts.wrap = v;
    else if (k === 'caption' || k === 'cap') opts.caption = v;
    else if (k === 'alt') opts.alt = v;
  });
  return opts;
}

/** Reads an optional braced `{caption}` argument immediately following `\image[...]{src}`. */
export function readImageCaption(src: string, startIdx: number): { value: string; end: number } {
  const res = readDelimGroup(src, startIdx, '{', '}');
  return res ?? { value: '', end: startIdx };
}

function renderRichCaption(txt: string, opts?: RenderMediaOptions): string {
  if (!txt) return '';
  return opts?.renderCaption ? opts.renderCaption(txt) : escapeHtml(txt);
}

/** Renders a `<figure class="media-figure">` block with zoom trigger metadata attributes. */
export function renderMediaFigure(
  media: MediaDescriptor | string | null | undefined,
  opts?: RenderMediaOptions,
): string {
  const m = normalizeMedia(media) as MediaDescriptor | null;
  if (!m) return '';
  const src = resolveMediaUrl(m.src, opts?.basePath);
  if (!src) return '';

  const capRaw = m.caption ?? '';
  const alt = m.alt || capRaw.replace(/\$[^$]*\$/g, '').trim() || 'Illustration mathématique';
  const widthCss = parseLength(m.width);
  const wrap = m.wrap && /^(?:left|right|float|side|stack)$/i.test(m.wrap) ? m.wrap.toLowerCase() : '';
  const align = m.align && /^(?:left|right|center|top|bottom)$/i.test(m.align) ? m.align.toLowerCase() : '';
  const attrs =
    'class="media-figure"' +
    (wrap ? ` data-wrap="${escapeHtml(wrap)}"` : '') +
    (align ? ` data-align="${escapeHtml(align)}"` : '') +
    (widthCss ? ` style="--media-w:${escapeHtml(widthCss)}"` : '');
  const capHtml = capRaw
    ? `<figcaption class="media-figure-caption">${renderRichCaption(capRaw, opts)}</figcaption>`
    : '';

  return (
    `<figure ${attrs}>` +
    `<div class="media-figure-frame" role="button" tabindex="0" data-media-zoom="true" ` +
    `data-media-src="${escapeHtml(src)}" data-media-alt="${escapeHtml(alt)}" ` +
    `data-media-caption="${escapeHtml(capRaw)}" aria-label="${escapeHtml(`Agrandir : ${alt}`)}">` +
    `<img class="media-figure-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">` +
    `<span class="media-figure-zoom" aria-hidden="true">&#x2922;</span></div>${capHtml}</figure>`
  );
}

/** Wraps content HTML alongside an optional positioned/sized media figure split layout. */
export function renderWithMedia(
  contentHtml: unknown,
  media: MediaDescriptor | string | null | undefined,
  opts?: RenderMediaOptions,
): string {
  const body = String(contentHtml ?? '');
  const m = normalizeMedia(media) as MediaDescriptor | null;
  if (!m || !m.src) return body;
  const fig = renderMediaFigure(m, opts);
  if (!fig) return body;

  const rawPos = String(m.position ?? 'bottom').toLowerCase();
  const layout = /^float-/.test(rawPos) ? 'float' : rawPos === 'left' || rawPos === 'right' ? 'side' : 'stack';
  let pos = rawPos.replace(/^float-/, '');
  if (!/^(?:left|right|top|bottom)$/.test(pos)) pos = 'bottom';
  const widthCss = parseLength(m.width);

  return (
    `<div class="mf-media-split" data-layout="${layout}" data-pos="${pos}"` +
    (widthCss ? ` style="--media-w:${escapeHtml(widthCss)}"` : '') +
    `><div class="mf-media-body">${body}</div>${fig}</div>`
  );
}
