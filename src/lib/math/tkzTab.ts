/**
 * MathFlow — Parser & canonical renderer for LaTeX \tkzTabInit / \tkzTabLine / \tkzTabVar
 * and \begin{array} variation & sign tables. Matches CSS contract in math-widgets.css.
 */

import { texToMathML } from './mathmlFallback';
import { countPrecedingBackslashes, escapeHtml, readDelimGroup } from './shared/texUtils';

export type TkzExprRenderer = (tex: string) => string;
export type TkzArrowDir = 'up' | 'down' | 'flat' | 'none' | 'forbidden';

export interface TkzVarSide { top?: string; mid?: string; bot?: string; }
export interface TkzVarBoundary extends TkzVarSide { dbar?: boolean; passThrough?: boolean; left?: TkzVarSide; right?: TkzVarSide; }
export interface TkzVarInterval { dir?: TkzArrowDir | null; isBlank?: boolean; raw?: string; forbidden?: boolean; }
export interface TkzSignCell { kind: 'zero' | 'bar' | 'dbar' | 'forbidden' | 'blank' | 'val' | 'empty' | 'sign'; raw: string; forbidden?: boolean; }
export interface TkzSignRow { type: 'sign'; label: string; boundaries: TkzSignCell[]; intervals: TkzSignCell[]; }
export interface TkzVarRow { type: 'var'; label: string; boundaries: TkzVarBoundary[]; intervals: TkzVarInterval[]; }
export type TkzRow = TkzSignRow | TkzVarRow;

export interface TkzModel {
  xLabel: string;
  xValues: string[];
  rows: TkzRow[];
  forbiddenCols: boolean[];
  forbiddenIntervals: boolean[];
  specDbar?: boolean[];
}

export interface TkzBlankInfo { isBlank: boolean; inner: string; raw: string; }
export interface TkzBracedArgsResult { args: string[]; index: number; end: number; }

const ARROW_UP_RE = /\\(?:nearrow|fleupB?|croiss|brup|uparrow)(?![A-Za-z])/;
const ARROW_DN_RE = /\\(?:searrow|fledownB?|decroiss|brdn|downarrow)(?![A-Za-z])/;
const ARROW_FL_RE = /\\(?:rightarrow|longrightarrow|fleconst)(?![A-Za-z])/;
const DBAR_SPLIT_RE = /\\(?:dbar|interdit|parallel|Vert)(?![A-Za-z])|\\\|/;
const DBAR_EXACT_RE = /^(?:\|\||\\\||\\(?:dbar|interdit|parallel|Vert))$/;
const FORB_RE = /^(?:h|H)$|\\cellcolor|hachure|\/\/\//i;

/** Extracts an optional `[...]` followed by `count` braced `{...}` arguments for a LaTeX command. */
export function extractBracedArgs(src: string, cmd: string, count: number): TkzBracedArgsResult | null {
  const m = new RegExp(`\\\\${cmd}(?![A-Za-z])`).exec(src);
  if (!m) return null;
  const opt = readDelimGroup(src, m.index + m[0].length, '[', ']');
  let p = opt ? opt.end : m.index + m[0].length;
  const args: string[] = [];
  for (let k = 0; k < count; k++) {
    const g = readDelimGroup(src, p, '{', '}');
    if (!g) return null;
    args.push(g.value);
    p = g.end;
  }
  return { args, index: m.index, end: p };
}

function findClosingInlineDollar(str: string, openIdx: number): number {
  for (let j = openIdx + 1; j < str.length; j++) {
    if (str.charAt(j) === '$' && str.charAt(j + 1) !== '$' && countPrecedingBackslashes(str, j) % 2 === 0) {
      return j;
    }
  }
  return -1;
}

/** Splits `str` by `sepChar` only at brace/bracket nesting depth 0, preserving inline `$...$` (e.g. French `$[0,+\infty[$`). */
export function splitTopLevel(str: string, sepChar: string): string[] {
  const out: string[] = [];
  let cur = '';
  let brace = 0;
  let bracket = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i);
    if (ch === '\\' && i + 1 < str.length) { cur += ch + str.charAt(i + 1); i++; continue; }
    if (ch === '$' && str.charAt(i + 1) !== '$' && countPrecedingBackslashes(str, i) % 2 === 0) {
      const closeDollar = findClosingInlineDollar(str, i);
      if (closeDollar > i) {
        cur += str.slice(i, closeDollar + 1);
        i = closeDollar;
        continue;
      }
    }
    if (ch === '{') brace++;
    else if (ch === '}' && brace > 0) brace--;
    else if (ch === '[' && brace === 0) bracket++;
    else if (ch === ']' && brace === 0 && bracket > 0) bracket--;
    if (ch === sepChar && brace === 0 && bracket === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

export function splitTopLevelCommas(str: string): string[] {
  return splitTopLevel(str, ',');
}

function unwrapOuterDollar(s: unknown): string {
  const t = String(s ?? '').trim();
  if (/^\$\$[\s\S]*\$\$$/.test(t)) return t.slice(2, -2).trim();
  if (/^\$[\s\S]*\$$/.test(t)) return t.slice(1, -1).trim();
  return t;
}

/** Detects `\blank{...}` or `[[...]]` inside a table cell and unwraps its inner expression. */
export function unwrapBlank(raw: unknown): TkzBlankInfo {
  const t = unwrapOuterDollar(raw);
  const m = /^\\(?:blank|blanck|balck)\s*\{([\s\S]*)\}$/.exec(t) ?? /^\[\[([\s\S]*)\]\]$/.exec(t);
  return m ? { isBlank: true, inner: m[1].trim(), raw: t } : { isBlank: false, inner: t, raw: t };
}

/** Strips outer `$` delimiters and layout-only TeX struts from a table cell expression. */
export function cleanTkzText(raw: unknown): string {
  return unwrapOuterDollar(raw).replace(/\\(?:tvstrut|tsstrut|hline|hfill)(?![A-Za-z])/g, '').trim();
}

function defaultRenderExpr(tex: string): string {
  const t = cleanTkzText(tex);
  return t ? texToMathML(t, false) : '';
}

function renderValueOrBlank(raw: unknown, renderExpr?: TkzExprRenderer): string {
  const u = unwrapBlank(raw);
  const cleaned = cleanTkzText(u.inner);
  if (!cleaned && !u.isBlank) return '';
  const innerHtml = cleaned ? (renderExpr ?? defaultRenderExpr)(cleaned) : '';
  return u.isBlank
    ? `<button type="button" class="blank" data-blank="true" aria-expanded="false"><span>${innerHtml}</span></button>`
    : innerHtml;
}

function hashModelKey(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Builds a canonical inline SVG arrow with deterministic marker IDs across SSR and client. */
export function buildArrowSvg(dir: TkzArrowDir | null | undefined, y1?: number | null, y2?: number | null, markerId?: string): string {
  if (!dir || dir === 'none' || dir === 'forbidden') return '';
  const ys = typeof y1 === 'number' ? y1 : dir === 'up' ? 84 : dir === 'down' ? 16 : 50;
  const ye = typeof y2 === 'number' ? y2 : dir === 'up' ? 16 : dir === 'down' ? 84 : 50;
  const id = markerId ?? `tkz-ar-${dir}-${ys}-${ye}`;
  return (
    `<svg class="tkz-arrow-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path class="tkz-arrow-tip" d="M 0 1 L 10 5 L 0 9 L 2.5 5 Z"/></marker></defs>` +
    `<line class="tkz-arrow-line" x1="8" y1="${ys}" x2="90" y2="${ye}" marker-end="url(#${id})"/></svg>`
  );
}

function renderSlots(side: TkzVarSide | undefined, fn: TkzExprRenderer): string {
  const s = side ?? {};
  return `<div class="tkz-slot tkz-slot--top">${renderValueOrBlank(s.top ?? '', fn)}</div>` +
    `<div class="tkz-slot tkz-slot--mid">${renderValueOrBlank(s.mid ?? '', fn)}</div>` +
    `<div class="tkz-slot tkz-slot--bot">${renderValueOrBlank(s.bot ?? '', fn)}</div>`;
}

function sideLevel(side: TkzVarSide | undefined, preferEnd: boolean): number | null {
  if (!side || (!side.top && !side.mid && !side.bot)) return null;
  if (side.top && !side.bot && !side.mid) return 16;
  if (side.bot && !side.top && !side.mid) return 84;
  if (side.mid && !side.top && !side.bot) return 50;
  return preferEnd ? (side.top ? 16 : side.bot ? 84 : 50) : (side.bot ? 84 : side.top ? 16 : 50);
}

function boundaryExitY(row: TkzVarRow, bIdx: number, nB: number, isExit: boolean): number | null {
  const bd = row.boundaries[bIdx];
  if (!bd) return null;
  if (!bd.passThrough) {
    return sideLevel(isExit ? (bd.right ?? bd) : (bd.left ?? bd), !isExit);
  }
  let lIdx = bIdx - 1;
  let lY: number | null = null;
  while (lIdx >= 0) {
    const lBd = row.boundaries[lIdx];
    if (lBd && !lBd.passThrough) { lY = sideLevel(lBd.right ?? lBd, false); break; }
    lIdx--;
  }
  let rIdx = bIdx + 1;
  let rY: number | null = null;
  while (rIdx < nB) {
    const rBd = row.boundaries[rIdx];
    if (rBd && !rBd.passThrough) { rY = sideLevel(rBd.left ?? rBd, true); break; }
    rIdx++;
  }
  if (lY != null && rY != null) return Math.round(lY + ((rY - lY) * (bIdx - lIdx)) / (rIdx - lIdx));
  return lY ?? rY;
}

function renderVarRowHtml(
  row: TkzVarRow, nB: number, nI: number, forbCols: readonly boolean[], forbInts: readonly boolean[],
  fn: TkzExprRenderer, nextMarkerId: () => string,
): string {
  const hasLv3 = row.boundaries.some((bd) => {
    const l = bd.left ?? bd, rt = bd.right ?? bd;
    return !!(l.mid && (l.top || l.bot)) || !!(rt.mid && (rt.top || rt.bot));
  });
  let html = `<tr class="tkz-row tkz-row--var ${hasLv3 ? 'tkz-row--lv3' : 'tkz-row--lv2'}"><th scope="row" class="tkz-lbl">${renderValueOrBlank(row.label || 'f(x)', fn)}</th>`;
  for (let vb = 0; vb < nB; vb++) {
    const bd = row.boundaries[vb] ?? {};
    const isDbar = !!(bd.dbar || (forbCols[vb] && (bd.left || bd.right)));
    html += isDbar
      ? `<td class="tkz-b"><div class="tkz-var-b--forbidden"><div class="tkz-stack tkz-stack--right">${renderSlots(bd.left, fn)}</div><div class="tkz-dbar" aria-hidden="true"></div><div class="tkz-stack tkz-stack--left">${renderSlots(bd.right, fn)}</div></div></td>`
      : `<td class="tkz-b"><div class="tkz-var-b"><div class="tkz-stack">${renderSlots(bd, fn)}</div></div></td>`;
    if (vb < nI) {
      const iv = row.intervals[vb] ?? {};
      if (iv.forbidden || forbInts[vb]) { html += '<td class="tkz-i tkz-zone--forbidden"></td>'; continue; }
      const y1 = boundaryExitY(row, vb, nB, true);
      const y2 = boundaryExitY(row, vb + 1, nB, false);
      const dir: TkzArrowDir = iv.dir ?? (y1 != null && y2 != null ? (y2 < y1 - 5 ? 'up' : y2 > y1 + 5 ? 'down' : 'flat') : 'none');
      const svg = buildArrowSvg(dir, y1, y2, nextMarkerId());
      html += `<td class="tkz-i"><div class="tkz-var-i">${iv.isBlank ? renderValueOrBlank(iv.raw ?? '', () => svg) : svg}</div></td>`;
    }
  }
  return `${html}</tr>`;
}

function renderSignRowHtml(row: TkzSignRow, nB: number, nI: number, forbInts: readonly boolean[], fn: TkzExprRenderer): string {
  let html = `<tr><th scope="row" class="tkz-lbl">${renderValueOrBlank(row.label || '', fn)}</th>`;
  for (let sb = 0; sb < nB; sb++) {
    const sbd = row.boundaries[sb] ?? { kind: 'empty' as const, raw: '' };
    const cls = sbd.kind === 'dbar' ? 'tkz-b tkz-mark--dbar'
      : (sbd.kind === 'zero' || sbd.kind === 'bar') ? 'tkz-b tkz-mark--bar'
      : sbd.kind === 'forbidden' ? 'tkz-b tkz-zone--forbidden' : 'tkz-b';
    const inner = sbd.kind === 'zero'
      ? `<span class="tkz-zero">${sbd.raw ? renderValueOrBlank(sbd.raw, fn) : '0'}</span>`
      : (sbd.kind === 'val' || sbd.kind === 'blank' ? renderValueOrBlank(sbd.raw, fn) : '');
    html += `<td class="${cls}">${inner}</td>`;
    if (sb < nI) {
      const siv = row.intervals[sb] ?? { kind: 'empty' as const, raw: '' };
      const iForb = !!(siv.forbidden || forbInts[sb]);
      html += `<td class="tkz-i${iForb ? ' tkz-zone--forbidden' : ''}">${iForb ? '' : renderValueOrBlank(siv.raw || '', fn)}</td>`;
    }
  }
  return `${html}</tr>`;
}

/** Renders a parsed `TkzModel` into canonical `.tscroll > table.tkz-tab` HTML. */
export function renderTkzModelHtml(model: TkzModel | null | undefined, renderExpr?: TkzExprRenderer): string {
  const fn = renderExpr ?? defaultRenderExpr;
  if (!model || !model.xValues?.length) return '';
  const nB = model.xValues.length, nI = Math.max(0, nB - 1);
  const forbCols = model.forbiddenCols ?? [], forbInts = model.forbiddenIntervals ?? [];
  const tableHash = hashModelKey(`${model.xLabel}|${model.xValues.join('|')}|${JSON.stringify(model.rows)}`);
  let arrowIdx = 0;
  const nextMarkerId = (): string => `tkz-ar-${tableHash}-${++arrowIdx}`;

  let html = `<div class="tscroll"><table class="tkz-tab" role="table" aria-label="Tableau de variation"><tbody><tr><th scope="row" class="tkz-lbl">${renderValueOrBlank(model.xLabel || 'x', fn)}</th>`;
  for (let b = 0; b < nB; b++) html += `<td class="tkz-b">${renderValueOrBlank(model.xValues[b], fn)}</td>${b < nI ? '<td class="tkz-i"></td>' : ''}`;
  html += '</tr>';
  for (const row of model.rows) {
    html += row.type === 'var'
      ? renderVarRowHtml(row, nB, nI, forbCols, forbInts, fn, nextMarkerId)
      : renderSignRowHtml(row, nB, nI, forbInts, fn);
  }
  return `${html}</tbody></table></div>`;
}

function assignSlot(obj: TkzVarSide, ch: string, val: string): void {
  if (ch === '+') obj.top = val; else if (ch === '-') obj.bot = val; else obj.mid = val;
}

function parseVarToken(rawToken: string): TkzVarBoundary {
  const u = unwrapBlank(rawToken), parts = splitTopLevel(cleanTkzText(u.inner), '/');
  const tag = (parts[0] ?? '').replace(/\s+/g, '');
  const wrap = (v: string): string => { const t = v.trim(); return !t ? '' : (u.isBlank && !unwrapBlank(t).isBlank ? `\\blank{${t}}` : t); };
  const dIdx = tag.indexOf('D');
  const v1 = wrap(dIdx < 0 ? parts.slice(1).join('/') : (parts[1] ?? '')), v2 = wrap(parts[2] ?? '');
  if (dIdx >= 0) {
    const out: TkzVarBoundary = { dbar: true, left: {}, right: {} };
    const lCh = dIdx > 0 ? tag.charAt(dIdx - 1) : '', rCh = dIdx + 1 < tag.length ? tag.charAt(dIdx + 1) : '';
    if (lCh && rCh) { assignSlot(out.left!, lCh, v1); assignSlot(out.right!, rCh, v2); }
    else if (lCh) assignSlot(out.left!, lCh, v1);
    else if (rCh) assignSlot(out.right!, rCh, v1);
    else { out.left!.mid = v1; out.right!.mid = v2 || v1; }
    return out;
  }
  if (tag === 'R' && parts.length === 1 && !u.isBlank) return { passThrough: true };
  if (tag === '+') return { top: v1 };
  if (tag === '-') return { bot: v1 };
  return { mid: v1 || (u.isBlank ? u.raw : '') };
}

function parseSignToken(rawToken: string): TkzSignCell {
  const u = unwrapBlank(rawToken), t = cleanTkzText(u.inner);
  if (t === 'z' || t === '0') return { kind: 'zero', raw: u.isBlank ? '\\blank{0}' : '0' };
  if (t === 't' || t === '|') return { kind: 'bar', raw: '' };
  if (t === 'd' || t === '||' || t === '\\dbar' || t === '\\interdit' || t === '\\Vert') return { kind: 'dbar', raw: '' };
  if (t === 'h' || t === 'H') return { kind: 'forbidden', raw: '', forbidden: true };
  return { kind: u.isBlank ? 'blank' : t ? 'val' : 'empty', raw: u.raw };
}

type TkzCmdName = 'tkzTabLine' | 'tkzTabVar' | 'tkzTabVal' | 'tkzTabIma' | 'tkzTabImaFrom';

function extractAllCmds(
  src: string,
  cmd: TkzCmdName,
  argCount: number,
): Array<{ type: TkzCmdName; index: number; args: string[] }> {
  const out: Array<{ type: TkzCmdName; index: number; args: string[] }> = [];
  let off = 0;
  let res: TkzBracedArgsResult | null;
  while (off < src.length && (res = extractBracedArgs(src.slice(off), cmd, argCount))) {
    out.push({ type: cmd, index: off + res.index, args: res.args });
    off += res.end;
  }
  return out;
}

function insertBoundaryInModel(model: TkzModel, insertAt: number, xVal: string, targetRow: TkzVarRow | undefined, yVal: string): void {
  if (insertAt < 1 || insertAt > model.xValues.length) return;
  model.xValues.splice(insertAt, 0, xVal);
  model.forbiddenCols.splice(insertAt, 0, false);
  const intForb = Boolean(model.forbiddenIntervals[insertAt - 1]);
  model.forbiddenIntervals.splice(insertAt, 0, intForb);
  for (const row of model.rows) {
    if (row.type === 'sign') {
      row.boundaries.splice(insertAt, 0, { kind: 'bar', raw: '' });
      const prevIv = row.intervals[insertAt - 1] ?? { kind: 'empty' as const, raw: '' };
      row.intervals.splice(insertAt, 0, { ...prevIv });
    } else {
      const bd: TkzVarBoundary = row === targetRow ? { mid: yVal } : { passThrough: true };
      row.boundaries.splice(insertAt, 0, bd);
      const prevIv = row.intervals[insertAt - 1] ?? {};
      row.intervals.splice(insertAt, 0, { ...prevIv });
    }
  }
}

/** Parses and renders `\tkzTabInit` + `\tkzTabLine` / `\tkzTabVar` / `\tkzTabVal` / `\tkzTabIma` LaTeX into table HTML. */
export function parseTkzTab(latex: unknown, renderExpr?: TkzExprRenderer): string {
  const src = String(latex ?? '');
  const init = extractBracedArgs(src, 'tkzTabInit', 2);
  if (!init) return `<pre class="tkz-fallback">${escapeHtml(src)}</pre>`;
  const leftItems = splitTopLevel(init.args[0], ',').map((it) => {
    const p = splitTopLevel(it, '/');
    if (p.length > 1 && /^\d+(?:\.\d+)?$/.test(p[p.length - 1])) p.pop();
    return p.join('/');
  });
  const xValues = splitTopLevel(init.args[1], ',');
  const model: TkzModel = { xLabel: leftItems[0] || 'x', xValues, rows: [], forbiddenCols: [], forbiddenIntervals: [] };
  const cmds = extractAllCmds(src, 'tkzTabLine', 1)
    .concat(extractAllCmds(src, 'tkzTabVar', 1))
    .concat(extractAllCmds(src, 'tkzTabVal', 5))
    .concat(extractAllCmds(src, 'tkzTabIma', 4))
    .concat(extractAllCmds(src, 'tkzTabImaFrom', 4))
    .sort((a, b) => a.index - b.index);

  let rowCursor = 0;
  let lastVarRow: TkzVarRow | undefined;

  cmds.forEach((c) => {
    const nB = model.xValues.length;
    if (c.type === 'tkzTabVal') {
      const b1 = Number(c.args[0]);
      const b2 = Number(c.args[1]);
      if (Number.isInteger(b1) && Number.isInteger(b2) && b2 === b1 + 1 && b1 >= 1 && b2 <= nB) {
        insertBoundaryInModel(model, b1, c.args[3] ?? '', lastVarRow, c.args[4] ?? '');
      }
      return;
    }
    if (c.type === 'tkzTabIma' || c.type === 'tkzTabImaFrom') {
      const targetIdx = Number(c.args[2]) - 1;
      const val = (c.args[3] ?? '').trim();
      if (lastVarRow && Number.isInteger(targetIdx) && targetIdx >= 0 && targetIdx < nB && val) {
        const cur = lastVarRow.boundaries[targetIdx];
        if (!cur || cur.passThrough || (!cur.top && !cur.mid && !cur.bot)) {
          lastVarRow.boundaries[targetIdx] = { mid: val };
        }
      }
      return;
    }

    const tokens = splitTopLevel(c.args[0], ',');
    const lbl = leftItems[++rowCursor] || (c.type === 'tkzTabVar' ? 'f(x)' : '');
    if (c.type === 'tkzTabLine') {
      const bs: TkzSignCell[] = [], ivs: TkzSignCell[] = [];
      for (let b = 0; b < nB; b++) {
        const bt = b * 2 < tokens.length ? parseSignToken(tokens[b * 2]) : { kind: 'empty' as const, raw: '' };
        bs.push(bt);
        if (bt.kind === 'dbar' || bt.kind === 'forbidden') model.forbiddenCols[b] = true;
        if (b < nB - 1) {
          const it = b * 2 + 1 < tokens.length ? parseSignToken(tokens[b * 2 + 1]) : { kind: 'empty' as const, raw: '' };
          ivs.push(it);
          if (it.forbidden) model.forbiddenIntervals[b] = true;
        }
      }
      model.rows.push({ type: 'sign', label: lbl, boundaries: bs, intervals: ivs });
    } else {
      const vbs: TkzVarBoundary[] = [], vivs: TkzVarInterval[] = [];
      for (let k = 0; k < nB; k++) {
        const vb = k < tokens.length ? parseVarToken(tokens[k]) : {};
        vbs.push(vb);
        if (vb.dbar) model.forbiddenCols[k] = true;
        if (k < nB - 1) vivs.push({});
      }
      const varRow: TkzVarRow = { type: 'var', label: lbl, boundaries: vbs, intervals: vivs };
      lastVarRow = varRow;
      model.rows.push(varRow);
    }
  });
  return renderTkzModelHtml(model, renderExpr);
}

// ── \begin{array} Variation & Sign Table Parser (from tkz-array.js) ──────────

/** Parses column specifiers and double vertical bar (`||`) positions from `\begin{array}{...}`. */
export function parseArraySpec(spec: string): { cols: string[]; dbarBefore: boolean[] } {
  const s = String(spec || '').replace(/\s+/g, ''), cols: string[] = [], dbarBefore: boolean[] = [];
  let barRun = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '|') { barRun++; continue; }
    if (ch === '{') { const cl = s.indexOf('}', i); if (cl > i) i = cl; continue; }
    if (/[lcrp]/.test(ch)) { dbarBefore[cols.length] = barRun >= 2; cols.push(ch); barRun = 0; }
  }
  return { cols, dbarBefore };
}

/** Splits top-level `\\` rows inside an `\begin{array}` body. */
export function splitRows(body: string): string[] {
  const rows: string[] = [];
  let cur = '', brace = 0, envDepth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);
    if (body.slice(i, i + 7) === '\\begin{') envDepth++;
    else if (body.slice(i, i + 5) === '\\end{' && envDepth > 0) envDepth--;
    if (ch === '{') brace++; else if (ch === '}' && brace > 0) brace--;
    if (brace === 0 && envDepth === 0 && ch === '\\' && body.charAt(i + 1) === '\\') {
      rows.push(cur); cur = ''; i += 2;
      while (i < body.length && /\s/.test(body.charAt(i))) i++;
      if (body.charAt(i) === '[') { const cl = body.indexOf(']', i + 1); if (cl > i) i = cl + 1; }
      i--; continue;
    }
    cur += ch;
  }
  if (cur.trim()) rows.push(cur);
  return rows;
}

function classifyArrow(rawCell: string): { dir: TkzArrowDir; isBlank: boolean; raw: string } | null {
  const u = unwrapBlank(rawCell), t = u.inner;
  const dir: TkzArrowDir | null = ARROW_UP_RE.test(t) ? 'up' : ARROW_DN_RE.test(t) ? 'down' : ARROW_FL_RE.test(t) ? 'flat' : null;
  return dir ? { dir, isBlank: u.isBlank, raw: u.raw } : null;
}

function splitDbarValue(rawCell: string): { dbar: true; left: string; right: string; isBlank?: boolean } | null {
  const u = unwrapBlank(rawCell), t = cleanTkzText(u.inner);
  if (!t) return null;
  if (DBAR_EXACT_RE.test(t)) return { dbar: true, left: '', right: '' };
  const sepIdx = t.indexOf('||');
  if (sepIdx >= 0) return { dbar: true, left: t.slice(0, sepIdx).trim(), right: t.slice(sepIdx + 2).trim(), isBlank: u.isBlank };
  const m = DBAR_SPLIT_RE.exec(t);
  return m ? { dbar: true, left: t.slice(0, m.index).trim(), right: t.slice(m.index + m[0].length).trim(), isBlank: u.isBlank } : null;
}

function alignCellsToGrid(rawCells: readonly string[], nB: number): { boundaries: string[]; intervals: string[] } {
  const cells = rawCells.length === 2 * nB && !cleanTkzText(rawCells[rawCells.length - 1] ?? '')
    ? rawCells.slice(0, -1)
    : rawCells;
  const nI = Math.max(0, nB - 1), boundaries = new Array<string>(nB).fill(''), intervals = new Array<string>(nI).fill('');
  if (cells.length === 2 * nB - 1) {
    for (let b = 0; b < nB; b++) boundaries[b] = cells[2 * b];
    for (let i = 0; i < nI; i++) intervals[i] = cells[2 * i + 1];
  } else if (cells.length === 2 * nB - 3 && nB >= 2) {
    for (let j = 0; j < nI; j++) intervals[j] = cells[2 * j];
    for (let k = 1; k < nB - 1; k++) boundaries[k] = cells[2 * k - 1];
  } else if (cells.length === nI) {
    for (let m = 0; m < nI; m++) intervals[m] = cells[m];
  } else {
    for (let c = 0; c < Math.min(cells.length, nB); c++) boundaries[c] = cells[c];
  }
  return { boundaries, intervals };
}

function buildSignRow(lbl: string, grid: { boundaries: string[]; intervals: string[] }, model: TkzModel): TkzSignRow {
  const nB = model.xValues.length, nI = Math.max(0, nB - 1), bs: TkzSignCell[] = [], ivs: TkzSignCell[] = [];
  for (let b = 0; b < nB; b++) {
    const u = unwrapBlank(grid.boundaries[b] ?? ''), c = cleanTkzText(u.inner);
    if (DBAR_EXACT_RE.test(c) || model.specDbar?.[b]) { bs.push({ kind: 'dbar', raw: '' }); model.forbiddenCols[b] = true; }
    else if (c === '0' || c === 'z' || c === '\\zero') bs.push({ kind: 'zero', raw: u.isBlank ? '\\blank{0}' : '0' });
    else if (c === '|') bs.push({ kind: 'bar', raw: '' });
    else if (FORB_RE.test(c)) { bs.push({ kind: 'forbidden', raw: '' }); model.forbiddenCols[b] = true; }
    else bs.push({ kind: u.isBlank ? 'blank' : c ? 'val' : 'empty', raw: u.raw });
  }
  for (let i = 0; i < nI; i++) {
    const ui = unwrapBlank(grid.intervals[i] ?? ''), ci = cleanTkzText(ui.inner), forb = FORB_RE.test(ci);
    if (forb) model.forbiddenIntervals[i] = true;
    ivs.push({ kind: forb ? 'forbidden' : 'sign', raw: ui.isBlank ? ui.raw : ci === '\\plus' ? '+' : ci === '\\moins' ? '-' : ui.raw, forbidden: forb });
  }
  return { type: 'sign', label: lbl, boundaries: bs, intervals: ivs };
}

function buildVarGroup(lbl: string, grids: ReadonlyArray<{ boundaries: string[]; intervals: string[] }>, model: TkzModel): TkzVarRow {
  const nB = model.xValues.length, nI = Math.max(0, nB - 1), bs: TkzVarBoundary[] = [];
  const ivs: TkzVarInterval[] = Array.from({ length: nI }, (_, i) => ({ dir: null, forbidden: !!model.forbiddenIntervals[i] }));
  for (const grid of grids) {
    for (let ii = 0; ii < nI; ii++) {
      const rawIv = grid.intervals[ii] ?? '', cIv = cleanTkzText(unwrapBlank(rawIv).inner);
      if (FORB_RE.test(cIv)) { ivs[ii].forbidden = true; model.forbiddenIntervals[ii] = true; continue; }
      const ar = classifyArrow(rawIv);
      if (ar) ivs[ii] = { dir: ar.dir, isBlank: ar.isBlank, raw: ar.raw, forbidden: ivs[ii].forbidden };
    }
  }
  const slotAt = (rIdx: number, total: number, bIdx: number): keyof TkzVarSide => {
    if (total >= 3) return rIdx === 0 ? 'top' : rIdx === total - 1 ? 'bot' : 'mid';
    if (total === 2) return rIdx === 0 ? 'top' : 'bot';
    const lA = bIdx > 0 ? ivs[bIdx - 1].dir : null, rA = bIdx < nI ? ivs[bIdx].dir : null;
    if (lA && rA && lA === rA) return 'mid';
    return lA === 'up' || rA === 'down' ? 'top' : lA === 'down' || rA === 'up' ? 'bot' : 'mid';
  };
  for (let b = 0; b < nB; b++) {
    const bd: TkzVarBoundary = {};
    let hasDbar = !!(model.forbiddenCols[b] || model.specDbar?.[b]);
    for (let r = 0; r < grids.length; r++) {
      const rawCell = grids[r].boundaries[b] ?? '', split = splitDbarValue(rawCell), slot = slotAt(r, grids.length, b);
      if (split) {
        hasDbar = true; model.forbiddenCols[b] = true; bd.dbar = true;
        bd.left = bd.left ?? {}; bd.right = bd.right ?? {};
        if (split.left) bd.left[slot] = split.isBlank ? `\\blank{${split.left}}` : split.left;
        if (split.right) bd.right[slot] = split.isBlank ? `\\blank{${split.right}}` : split.right;
      } else if (cleanTkzText(rawCell)) bd[slot] = rawCell;
    }
    if (hasDbar && !bd.dbar) {
      bd.dbar = true; bd.left = bd.left ?? {}; bd.right = bd.right ?? {};
      for (const k of ['top', 'mid', 'bot'] as const) {
        if (bd[k]) { bd.left[k] = bd[k]; bd.right[k] = bd[k]; delete bd[k]; }
      }
    }
    bs.push(bd);
  }
  return { type: 'var', label: lbl || 'f(x)', boundaries: bs, intervals: ivs };
}

/** Parses `\begin{array}...\end{array}` variation/sign tables and renders them to canonical HTML. */
export function parseArrayTkzTab(latex: unknown, renderExpr?: TkzExprRenderer): string {
  const src = String(latex ?? '')
    .replace(/\\(?:def\s*\\arraystretch|renewcommand\s*\{\s*\\arraystretch\s*\})\s*(?:\{[^}]*\}|[0-9.]+)/g, '')
    .trim();
  const open = /\\begin\{array\}(?:\{([^}]*)\})?/.exec(src);
  if (!open) return `<pre class="tkz-fallback">${escapeHtml(src)}</pre>`;
  const endIdx = src.lastIndexOf('\\end{array}');
  const body = src.slice(open.index + open[0].length, endIdx > open.index ? endIdx : src.length);
  const spec = parseArraySpec(open[1] ?? '');
  const rowObjs = splitRows(body)
    .map((ln) => {
      const clean = ln.replace(/\\hline/g, '').replace(/\\cline\{[^}]*\}/g, '').trim();
      return { hlineAfter: /\\hline/.test(ln), cells: clean ? splitTopLevel(clean, '&') : [] };
    })
    .filter((r) => r.cells.length > 0);
  if (rowObjs.length < 2) return `<pre class="tkz-fallback">${escapeHtml(src)}</pre>`;

  const head = rowObjs[0].cells;
  const xVals: string[] = [];
  const xColIndices: number[] = [];
  for (let c = 1; c < head.length; c++) {
    if (cleanTkzText(head[c])) {
      xVals.push(head[c]);
      xColIndices.push(c);
    }
  }
  if (!xVals.length) {
    for (let c = 1; c < head.length; c++) { xVals.push(head[c]); xColIndices.push(c); }
  }
  const specMatchesHead = spec.cols.length > 0 && spec.cols.length === head.length;
  const specDbar = specMatchesHead ? xColIndices.map((colIdx) => Boolean(spec.dbarBefore[colIdx])) : [];
  const model: TkzModel = { xLabel: head[0] || 'x', xValues: xVals, rows: [], forbiddenCols: [], forbiddenIntervals: [], specDbar };

  for (let idx = 1; idx < rowObjs.length; ) {
    const grp = [rowObjs[idx]];
    let isVar = grp[0].cells.some((c) => !!(classifyArrow(c) || splitDbarValue(c)));
    let j = idx + 1;
    while (j < rowObjs.length) {
      const nc = rowObjs[j].cells, hasAr = nc.some((c) => !!(classifyArrow(c) || splitDbarValue(c))), noLbl = !cleanTkzText(nc[0] ?? '');
      if ((isVar || hasAr) && (noLbl || !grp[grp.length - 1].hlineAfter) && (noLbl || hasAr)) { grp.push(rowObjs[j++]); isVar = true; }
      else break;
    }
    const lbl = (grp.find((r) => !!cleanTkzText(r.cells[0] ?? '')) ?? grp[0]).cells[0] ?? '';
    const grids = grp.map((r) => alignCellsToGrid(r.cells.slice(1), xVals.length));
    model.rows.push(isVar || grp.length > 1 ? buildVarGroup(lbl, grids, model) : buildSignRow(lbl, grids[0], model));
    idx = j;
  }
  return renderTkzModelHtml(model, renderExpr);
}
