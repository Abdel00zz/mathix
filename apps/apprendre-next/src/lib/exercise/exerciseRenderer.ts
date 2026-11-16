import { renderMathInHtml, renderWithMedia } from '../math/mathEngine';
import { escapeHtml as esc, hasMediaSrc, normalizeMedia } from '../math/shared/texUtils';
import {
  parseExerciseModel,
  type ExerciseQuestionBlock,
  type ExerciseSubQuestion,
  type ParsedExercise,
} from './exerciseParser';

const HINT_LAMP_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
  '<path d="M9 18h6"/><path d="M10 22h4"/></svg>';

export type OpenHintsState = Set<string> | ReadonlySet<string> | Record<string, boolean>;

export interface RenderExerciseOptions {
  basePath?: string;
  showSol?: boolean;
  openSol?: boolean;
  openHints?: OpenHintsState;
  keyPrefix?: string;
  index?: number;
}

export interface FailedExercisePayload {
  failed?: boolean;
  error?: string;
}

interface SubRowNode {
  label: string;
  content: string;
  bareme: number | string | null;
  hint: string;
  correction: string;
  media: unknown;
  children?: ExerciseSubQuestion[];
}

interface ResolvedRenderOptions {
  basePath: string;
  showSol: boolean;
  openSol: boolean;
  openHints?: OpenHintsState;
  depth?: number;
  rowKey?: string;
}

const RENDER_CACHE_MAX = 600;
const mathRenderCache = new Map<string, string>();

function buildMathCacheKey(text: string, media: unknown, basePath: string): string | null {
  let mediaStr = '';
  if (media) {
    try {
      mediaStr = JSON.stringify(media);
    } catch {
      return null;
    }
  }
  return `${basePath}\u0001${mediaStr}\u0001${text}`;
}

/** Clears the LRU cache for rendered exercise math fragments. */
export function clearExerciseRenderCache(): void {
  mathRenderCache.clear();
}

function renderMath(raw: unknown, media: unknown, basePath = ''): string {
  const text = String(raw ?? '');
  if (!text && !hasMediaSrc(media)) return '';
  const key = buildMathCacheKey(text, media, basePath);
  if (key !== null && mathRenderCache.has(key)) {
    const hit = mathRenderCache.get(key) as string;
    mathRenderCache.delete(key);
    mathRenderCache.set(key, hit);
    return hit;
  }

  const html = renderMathInHtml(text, { enableLexicon: false, basePath });
  const normMedia = normalizeMedia(media);
  const out =
    normMedia && normMedia.src
      ? renderWithMedia(html, normMedia, {
          enableLexicon: false,
          surface: 'default',
          basePath,
        })
      : html;

  if (key !== null) {
    mathRenderCache.set(key, out);
    if (mathRenderCache.size > RENDER_CACHE_MAX) {
      const oldest = mathRenderCache.keys().next().value;
      if (oldest !== undefined) mathRenderCache.delete(oldest);
    }
  }
  return out;
}

/** Renders an unavailable-exercise alert card with a Retry trigger while keeping list indices stable. */
export function renderUnavailableExerciseHtml(ex: FailedExercisePayload, index = 0): string {
  return (
    `<article class="exo-article exo-failed" role="alert"><div class="ctx"><div class="exo-context">` +
    `<strong>Exercice ${index + 1} indisponible.</strong> ` +
    `${ex.error ? `<span>${esc(ex.error)}</span> ` : ''}` +
    `<button type="button" class="btn" data-a="retry" data-retry="${esc(index)}">Réessayer</button>` +
    `</div></div></article>`
  );
}

/** Formats a numeric, fractional, or string point value into a French bareme label (`1 pt`, `2.5 pts`). */
export function formatBareme(b: number | string | null | undefined): string {
  if (b == null || b === '') return '';
  const s = String(b).trim();
  if (!s) return '';
  if (/\b(?:pts?|points?)\b/i.test(s)) return s;
  const normalized = s.replace(',', '.');
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(normalized);
  const num = frac && Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : Number(normalized);
  return `${s}${Number.isFinite(num) && num > 1 ? ' pts' : ' pt'}`;
}

function isHintOpen(openHints: OpenHintsState | undefined, hintId: string): boolean {
  if (!openHints) return false;
  if ('has' in openHints && typeof openHints.has === 'function') {
    return openHints.has(hintId);
  }
  return Boolean((openHints as Record<string, boolean>)[hintId]);
}

function renderHintPanel(
  node: SubRowNode,
  basePath: string,
  hintId: string,
  isOpen: boolean
): string {
  if (!node.hint || !node.hint.trim()) return '';
  return (
    `<div class="exo-hint-panel" id="${esc(hintId)}"${isOpen ? '' : ' hidden'}>` +
    `<div class="exo-hint-box">${renderMath(node.hint, null, basePath)}</div></div>`
  );
}

function renderSolDetails(node: SubRowNode, opts: ResolvedRenderOptions): string {
  if (!opts.showSol || !node.correction || !node.correction.trim()) return '';
  return (
    `<details class="sol"${opts.openSol ? ' open' : ''}><summary>Corrigé</summary>` +
    `<div class="why okbox">${renderMath(node.correction, null, opts.basePath)}</div></details>`
  );
}

function renderSubQuestionRow(node: SubRowNode, opts: ResolvedRenderOptions): string {
  const depth = opts.depth ?? 2;
  const bp = opts.basePath;
  const rowKey = opts.rowKey ?? 'row';
  const hintId = `exo-hint-${rowKey}`;
  const hasHint = Boolean(node.hint && node.hint.trim());
  const hintOpen = hasHint && isHintOpen(opts.openHints, hintId);
  const rowCls =
    depth <= 1 ? 'exo-q-row' : depth === 2 ? 'exo-sub-row' : 'exo-sub-row exo-sub-row--deep';
  const baremeTxt = formatBareme(node.bareme);
  const badge = baremeTxt ? `<span class="exo-bareme">${esc(baremeTxt)}</span>` : '';
  const hintBtn = hasHint
    ? `<button type="button" class="exo-hint-btn" data-hint-toggle="${esc(hintId)}" aria-expanded="${hintOpen ? 'true' : 'false'}" aria-controls="${esc(hintId)}">${HINT_LAMP_SVG}<span>Indice</span></button>`
    : '';
  const aside = badge || hintBtn ? `<div class="exo-row-aside">${badge}${hintBtn}</div>` : '';

  const childrenHtml =
    Array.isArray(node.children) && node.children.length
      ? node.children
          .map((c, cIdx) =>
            renderSubQuestionRow(c, {
              depth: 3,
              basePath: bp,
              showSol: opts.showSol,
              openSol: opts.openSol,
              openHints: opts.openHints,
              rowKey: `${rowKey}-c${cIdx}`,
            })
          )
          .join('')
      : '';

  const hasBody = Boolean((node.content && node.content.trim()) || hasMediaSrc(node.media));
  const bodyHtml = hasBody ? renderMath(node.content, node.media, bp) : '';

  return (
    `<div class="${rowCls}">` +
    `<div class="exo-row-head">` +
    `<span class="exo-row-label">${esc(node.label || '')}</span>` +
    `<div class="exo-row-content">${bodyHtml}</div>${aside}` +
    `</div>` +
    `${renderHintPanel(node, bp, hintId, hintOpen)}` +
    `${renderSolDetails(node, opts)}` +
    `${childrenHtml}</div>`
  );
}

function renderQuestionBlock(
  block: ExerciseQuestionBlock,
  opts: ResolvedRenderOptions,
  keyPrefix: string
): string {
  const subs = block.subQuestions;
  const hasSingleEmptySub =
    subs.length === 1 &&
    !subs[0].content.trim() &&
    !hasMediaSrc(subs[0].media) &&
    subs[0].children.length === 0;
  const headRow = renderSubQuestionRow(
    {
      label: block.label,
      content: block.content,
      bareme: hasSingleEmptySub ? block.bareme ?? subs[0].bareme : block.bareme,
      hint: hasSingleEmptySub ? block.hint || subs[0].hint : block.hint,
      correction: hasSingleEmptySub ? block.correction || subs[0].correction : block.correction,
      media: block.media,
    },
    { ...opts, depth: 1, rowKey: keyPrefix }
  );

  if (!subs.length || hasSingleEmptySub) return headRow;
  const subsHtml = subs
    .map((sq, sIdx) =>
      renderSubQuestionRow(sq, { ...opts, depth: 2, rowKey: `${keyPrefix}-s${sIdx}` })
    )
    .join('');

  return `<div class="exo-q-group">${headRow}<div class="exo-subs">${subsHtml}</div></div>`;
}

function isParsedExercise(val: unknown): val is ParsedExercise {
  return Boolean(val && typeof val === 'object' && Array.isArray((val as ParsedExercise).blocks));
}

/** Renders the full body of a parsed (or raw) exercise into semantic HTML. */
export function renderExerciseBody(
  rawOrParsed: (ParsedExercise & FailedExercisePayload) | (Record<string, unknown> & FailedExercisePayload),
  opts: RenderExerciseOptions = {}
): string {
  if (rawOrParsed && rawOrParsed.failed) {
    return renderUnavailableExerciseHtml(rawOrParsed, opts.index ?? 0);
  }
  const model = isParsedExercise(rawOrParsed)
    ? rawOrParsed
    : parseExerciseModel(rawOrParsed, { basePath: opts.basePath });
  const bp = model.basePath || opts.basePath || '';
  const prefix = opts.keyPrefix || 'ex';
  const resolved: ResolvedRenderOptions = {
    basePath: bp,
    showSol: Boolean(opts.showSol),
    openSol: Boolean(opts.openSol),
    openHints: opts.openHints,
  };

  const metaTags = [
    model.theme,
    model.topic,
    model.points != null && model.points !== '' ? formatBareme(model.points) : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ');

  const hasContext = Boolean(model.context || hasMediaSrc(model.media));
  const ctxHtml =
    metaTags || hasContext
      ? `<div class="ctx">${metaTags ? `<div class="exo-meta">${metaTags}</div>` : ''}${
          hasContext ? `<div class="exo-context">${renderMath(model.context, model.media, bp)}</div>` : ''
        }</div>`
      : '';

  const blocksHtml = model.blocks
    .map((b, bIdx) => {
      if (b.kind === 'part') {
        return (
          `<div class="exo-part"><h3>${esc(b.label)}${
            b.title ? ` — ${renderMath(b.title, null, bp)}` : ''
          }</h3>${
            b.content || hasMediaSrc(b.media)
              ? `<div class="exo-part-ctx">${renderMath(b.content, b.media, bp)}</div>`
              : ''
          }</div>`
        );
      }
      if (b.kind === 'text') {
        return `<div class="exo-text">${renderMath(b.content, b.media, bp)}</div>`;
      }
      return renderQuestionBlock(b, resolved, `${prefix}-b${bIdx}`);
    })
    .join('');

  return `<article class="exo-article">${ctxHtml}<div class="exo-blocks">${blocksHtml}</div></article>`;
}
