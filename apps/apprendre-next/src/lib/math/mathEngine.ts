/**
 * MathFlow — Central Student Math Engine (KaTeX, MathML fallback, tkz-tab/array, Blanks, Lexicon & Media).
 * Pure TypeScript ESM module with direct KaTeX import, LRU caching, and zero DOM/global hacks.
 */

import katex, { type TrustContext } from 'katex';
import {
  type LexiconEntry, type LexiconInputEntry, type LexiconMatcher,
  createLexiconMatcher, findLexiconEntry, highlightLexiconTerms, registerLexiconEntries,
} from './lexicon';
import { texToMathML } from './mathmlFallback';
import {
  type MediaDescriptor, type RenderMediaOptions,
  parseImageOptions, readImageCaption,
  renderMediaFigure as renderMediaFigureBase,
  renderWithMedia as renderWithMediaBase,
  resolveMediaUrl,
} from './mediaLexicon';
import { countPrecedingBackslashes, findBalanced, readDelimGroup } from './shared/texUtils';
import {
  LATEX_MACROS, applyProseMacros, escapeHtml,
  normalizeMathBlanks, repairLineBreakBrackets,
} from './texMacros';
import { extractBracedArgs, parseArrayTkzTab, parseTkzTab as parseTkzTabMarkup } from './tkzTab';

export type { LexiconEntry, LexiconInputEntry, LexiconMatcher, MediaDescriptor, RenderMediaOptions };
export {
  LATEX_MACROS, createLexiconMatcher, escapeHtml, findLexiconEntry,
  highlightLexiconTerms, registerLexiconEntries, resolveMediaUrl,
};

export interface RenderMathOptions {
  enableLexicon?: boolean;
  basePath?: string;
  lexicon?: LexiconMatcher | readonly LexiconInputEntry[];
}

export interface KatexMetrics {
  katexHits: number;
  katexMisses: number;
  katexSize: number;
  tkzHits: number;
  tkzMisses: number;
  tkzSize: number;
}

class LruCache<V> {
  private readonly cache = new Map<string, V>();
  public hits = 0;
  public misses = 0;
  constructor(private readonly maxSize: number) {}

  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value === undefined) { this.misses++; return undefined; }
    this.cache.delete(key);
    this.cache.set(key, value);
    this.hits++;
    return value;
  }

  set(key: string, value: V): void {
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number { return this.cache.size; }
}

const katexLRU = new LruCache<string>(800);
const tkzLRU = new LruCache<string>(150);
let holdSeq = 0;

const DIRECTIVES: Readonly<Record<string, string>> = {
  step: 'Étape', method: 'Méthode', conclusion: 'Conclusion', assumption: 'Hypothèse',
  case: 'Cas', calcul: 'Calcul', goal: 'Objectif', remind: 'Rappel',
  hint: 'Indice', answer: 'Réponse', consequence: 'Conséquence', summary: 'Bilan',
  attention: 'Attention', warning: 'Attention', tip: 'Astuce', analyze: 'Analyse', recall: 'Rappel',
};

const BARE_MATH_RE =
  /\\(?:iff|implies|Leftrightarrow|Rightarrow|Leftarrow|longrightarrow|mapsto|equiv|leq|geq|neq|approx|frac|dfrac|sqrt|lim|int|sum|prod|mathbb|infty|cdot|setminus|cup|cap|notin)(?![A-Za-z])/;
const PROSE_SKIP_RE =
  /^\\(?:method|step|conclusion|tip|hint|calcul|case|assumption|answer|goal|remind|consequence|summary|attention|warning|analyze|recall|savant|history|objective|objectif|motivation|challenge|question|qst|mathqst|encadre|encadrevert|encadrerouge|boxed|result|hl|highlight|underline|textbf|textit|emph|textsc|texttt|textcolor|red|blue|green|orange|purple|pink|teal|blank|blanck|balck|item|itemsize|col|column|def|defi)(?![A-Za-z])/;
const DIRECTIVE_LINE_RE =
  /^\s*\\(step|method|conclusion|assumption|case|calcul|goal|remind|hint|answer|consequence|summary|attention|warning|tip|analyze|recall)(?![A-Za-z])(?:\{([^{}]*)\})?[ \t]*(.*)$/;

/** Renders a raw TeX expression using KaTeX (with LRU caching) or structural MathML fallback. */
export function renderTexRaw(tex: unknown, displayMode = false): string {
  const src = repairLineBreakBrackets(normalizeMathBlanks(String(tex ?? ''))).trim();
  if (!src) return '';
  const cacheKey = (displayMode ? 'D:' : 'I:') + src;
  const cached = katexLRU.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const html = katex.renderToString(src, {
      displayMode: Boolean(displayMode),
      macros: { ...LATEX_MACROS },
      throwOnError: false,
      strict: false,
      output: 'htmlAndMathml',
      trust: (ctx: TrustContext) => ctx.command === '\\htmlClass',
    });
    katexLRU.set(cacheKey, html);
    return html;
  } catch {
    const ml = texToMathML(src, Boolean(displayMode));
    const fallbackHtml = displayMode ? `<div class="dm">${ml}</div>` : ml;
    katexLRU.set(cacheKey, fallbackHtml);
    return fallbackHtml;
  }
}

/** Renders a TeX expression into HTML (inline or display mode). */
export function renderTex(tex: unknown, displayMode = false): string {
  return renderTexRaw(tex, displayMode);
}

function isVariationArray(tex: string): boolean {
  return (
    /\\begin\{array\}/.test(tex) &&
    /\\(?:fleupB?|fledownB?|croiss|decroiss|fleconst|nearrow|searrow|dbar|interdit|zero|plus|moins)(?![A-Za-z])|\|\||(?:^|\\\\(?:\[[^\]]*\])?)\s*\$?\s*x\s*\$?\s*&/i.test(tex)
  );
}

/** Parses and renders `\tkzTabInit` / `tikzpicture` / variation `\begin{array}` tables into HTML. */
export function parseTkzTab(latex: unknown): string {
  const raw = String(latex ?? '').trim();
  if (!raw) return '';
  const cached = tkzLRU.get(raw);
  if (cached !== undefined) return cached;

  const inner = raw
    .replace(/^\\begin\{tikzpicture\}/, '')
    .replace(/\\end\{tikzpicture\}$/, '')
    .replace(/^\$\$|\$\$$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
    .trim();
  const renderCell = (expr: string): string => renderTex(expr, false);
  const html = /\\tkzTabInit(?![A-Za-z])/.test(inner)
    ? parseTkzTabMarkup(inner, renderCell)
    : /\\begin\{array\}/.test(inner)
      ? parseArrayTkzTab(inner, renderCell)
      : `<pre class="tkz-fallback">${escapeHtml(raw)}</pre>`;

  if (html) tkzLRU.set(raw, html);
  return html;
}

function extractImages(
  str: string,
  opts: RenderMathOptions,
  hold: (html: string) => string,
  renderCaption: (txt: string) => string,
): string {
  if (str.indexOf('\\image') === -1) return str;
  let out = '';
  let cur = 0;
  const re = /\\image(?![A-Za-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    let pos = re.lastIndex;
    const optGroup = readDelimGroup(str, pos, '[', ']');
    if (optGroup) pos = optGroup.end;
    const srcGroup = readDelimGroup(str, pos, '{', '}');
    if (!srcGroup) continue;
    out += str.slice(cur, m.index);
    const cap = readImageCaption(str, srcGroup.end);
    const po = parseImageOptions(optGroup ? optGroup.value : '');
    const fig = renderMediaFigureBase(
      { src: srcGroup.value.trim(), width: po.width, align: po.align, wrap: po.wrap, caption: cap.value || po.caption || '', alt: po.alt || '' },
      { basePath: opts.basePath, renderCaption },
    );
    out += fig ? hold(fig) : '';
    cur = cap.end;
    re.lastIndex = cap.end;
  }
  return out + str.slice(cur);
}

function extractStandaloneTkz(str: string, hold: (html: string) => string): string {
  if (!/\\tkzTabInit(?![A-Za-z])/.test(str)) return str;
  let out = '';
  let rest = str;
  let init = extractBracedArgs(rest, 'tkzTabInit', 2);
  while (init) {
    out += rest.slice(0, init.index);
    let endPos = init.end;
    while (endPos < rest.length) {
      const tail = rest.slice(endPos);
      const nm = /^\s*\\(tkzTabLine|tkzTabVar|tkzTabVal|tkzTabImaFrom|tkzTabIma)(?![A-Za-z])/.exec(tail);
      if (!nm) break;
      const cnt = nm[1] === 'tkzTabVal' ? 5 : nm[1].indexOf('Ima') >= 0 ? 4 : 1;
      const argRes = extractBracedArgs(tail, nm[1], cnt);
      if (!argRes) break;
      endPos += argRes.end;
    }
    out += hold(parseTkzTab(rest.slice(init.index, endPos)));
    rest = rest.slice(endPos);
    init = extractBracedArgs(rest, 'tkzTabInit', 2);
  }
  return out + rest;
}

function extractInlineDollar(str: string, hold: (html: string) => string): string {
  let out = '';
  let i = 0;
  while (i < str.length) {
    if (str.charAt(i) === '$') {
      let bs = 0;
      for (let b = i - 1; b >= 0 && str.charAt(b) === '\\'; b--) bs++;
      if (bs % 2 === 0 && str.charAt(i + 1) !== '$') {
        let j = i + 1;
        let found = -1;
        while (j < str.length) {
          if (str.charAt(j) === '$' && str.charAt(j + 1) !== '$') {
            let bs2 = 0;
            for (let b2 = j - 1; b2 >= 0 && str.charAt(b2) === '\\'; b2--) bs2++;
            if (bs2 % 2 === 0) { found = j; break; }
          }
          if (str.charAt(j) === '\n' && str.charAt(j + 1) === '\n') break;
          j++;
        }
        if (found > i + 1) { out += hold(renderTex(str.slice(i + 1, found), false)); i = found + 1; continue; }
      }
    }
    out += str.charAt(i++);
  }
  return out;
}

function extractDelimMath(
  str: string,
  openSeq: string,
  closeSeq: string,
  onMatch: (inner: string) => string,
): string {
  if (!str.includes(openSeq)) return str;
  let out = '';
  let i = 0;
  while (i < str.length) {
    if (str.startsWith(openSeq, i) && countPrecedingBackslashes(str, i) % 2 === 0) {
      let j = i + openSeq.length;
      let found = -1;
      while (j < str.length) {
        if (str.startsWith(closeSeq, j) && countPrecedingBackslashes(str, j) % 2 === 0) {
          found = j;
          break;
        }
        j++;
      }
      if (found > i + openSeq.length) {
        out += onMatch(str.slice(i + openSeq.length, found));
        i = found + closeSeq.length;
        continue;
      }
    }
    out += str.charAt(i++);
  }
  return out;
}

function extractSavantAside(str: string, hold: (html: string) => string, renderSub: (sub: string) => string): string {
  if (!str.includes('\\savant')) return str;
  const re = /\\savant(?![A-Za-z])(?:\[([^\]]*)\])?\s*\{/g;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const endName = findBalanced(str, re.lastIndex - 1, '{', '}');
    if (endName < 0) continue;
    let p2 = endName + 1;
    while (p2 < str.length && /\s/.test(str.charAt(p2))) p2++;
    if (str.charAt(p2) !== '{') continue;
    const endBio = findBalanced(str, p2, '{', '}');
    if (endBio < 0) continue;
    out += str.slice(cursor, m.index);
    const name = str.slice(re.lastIndex, endName);
    const bio = str.slice(p2 + 1, endBio);
    const dM = m[1] ? /dates\s*=\s*([^,\]]+)/.exec(m[1]) : null;
    const badge = dM ? ` <span class="mf-badge mf-badge-amber">${escapeHtml(dM[1].trim())}</span>` : '';
    out += hold(`<aside class="math-savant math-savant-card"><strong>${escapeHtml(name)}</strong>${badge}<div>${renderSub(bio)}</div></aside>`);
    cursor = endBio + 1;
    re.lastIndex = cursor;
  }
  return out + str.slice(cursor);
}

function extractPedagogicAside(str: string, hold: (html: string) => string, renderSub: (sub: string) => string): string {
  const re = /\\(history|objective|motivation|challenge)(?![A-Za-z])\s*\{/g;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    const endBody = findBalanced(str, re.lastIndex - 1, '{', '}');
    if (endBody < 0) continue;
    out += str.slice(cursor, m.index);
    const kind = m[1];
    const body = str.slice(re.lastIndex, endBody);
    const lbl = kind === 'history' ? 'Histoire' : kind === 'objective' ? 'Objectif' : kind === 'motivation' ? 'Pourquoi ce chapitre ?' : 'Défi';
    const cls = kind === 'objective' ? 'math-objective' : kind === 'history' ? 'math-history-note math-savant-card' : `math-${kind} math-question`;
    out += hold(`<aside class="${cls}"><span class="mf-badge">${lbl}</span><div>${renderSub(body)}</div></aside>`);
    cursor = endBody + 1;
    re.lastIndex = cursor;
  }
  return out + str.slice(cursor);
}

/** Parses rich mathematical text (LaTeX, tkz-tab, images, directives, prose macros, lexicon) into HTML. */
export function renderMathInHtml(content: unknown, options?: RenderMathOptions): string {
  if (content == null || content === '') return '';
  const opts = options ?? {};
  const enableLexicon = opts.enableLexicon !== false;
  const held: string[] = [];
  const holdTag = (++holdSeq).toString(36).toUpperCase();
  const hold = (html: string): string => { const id = `@@MF_HOLD_${holdTag}_${held.length}@@`; held.push(html); return id; };
  const renderSub = (sub: string): string =>
    renderMathInHtml(sub, { enableLexicon: false, basePath: opts.basePath });

  const renderDisplay = (inner: string): string => {
    const math = inner.trim();
    const isTkz = /\\tkzTabInit(?![A-Za-z])/.test(math) || /\\begin\{tikzpicture\}/.test(math) || isVariationArray(math);
    return hold(isTkz ? parseTkzTab(math) : renderTex(math, true));
  };

  let s = extractImages(String(content).replace(/\r\n?/g, '\n'), opts, hold, renderSub);
  s = extractDelimMath(s, '$$', '$$', renderDisplay);
  s = extractDelimMath(s, '\\[', '\\]', renderDisplay);
  s = s.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, (_, inner: string) => hold(parseTkzTab(inner)));
  s = extractDelimMath(s, '\\(', '\\)', (inner) => hold(renderTex(inner, false)));
  s = extractInlineDollar(s, hold);
  s = s.replace(
    /(?:\\def\\arraystretch\{[^}]*\}\s*)?\\begin\{(array|cases|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|align\*?|equation\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (full: string, env: string) => hold(env === 'array' && isVariationArray(full) ? parseTkzTab(full) : renderTex(full, true)),
  );
  s = extractStandaloneTkz(s, hold);

  s = s.split('\n').map((line) => {
    const t = line.trim();
    if (!t || /[\$<]|@@MF_|\\(?:begin|end|tkzTab|image)|^\s*[-•*#]/.test(t) || PROSE_SKIP_RE.test(t) || !BARE_MATH_RE.test(t)) return line;
    const stripped = t.replace(/\\[a-zA-Z]+/g, ' ').replace(/\b(?:true|false|and|with|for)\b/gi, ' ');
    return /[a-zA-Zàâäéèêëïîôöùûüç]{4,}/.test(stripped) ? line : hold(renderTex(t, true));
  }).join('\n');

  s = extractSavantAside(s, hold, renderSub);
  s = extractPedagogicAside(s, hold, renderSub);

  s = s.split('\n').map((line) => {
    const m = DIRECTIVE_LINE_RE.exec(line);
    if (!m || (!m[3] && (m[1] === 'method' || m[1] === 'tip' || m[1] === 'conclusion'))) return line;
    const cmd = m[1], mod = cmd === 'warning' ? 'attention' : cmd;
    const bodyText = m[2] && m[3] ? `${m[2]} — ${m[3]}` : m[2] || m[3] || '';
    return hold(`<div class="math-command-line"><span class="math-command-label math-command-label--${mod}">${escapeHtml(DIRECTIVES[cmd] ?? cmd)}</span><span class="math-command-body">${renderSub(bodyText)}</span></div>`);
  }).join('\n');

  s = applyProseMacros(s, renderSub);
  s = s.split('\n').map((line) => {
    const t = line.trim();
    return /^[-•]\s+/.test(t)
      ? `<div class="math-list-item"><span class="math-list-marker math-list-marker-unordered">&#8226;</span><div class="math-list-text">${t.replace(/^[-•]\s+/, '')}</div></div>`
      : line;
  }).join('\n').replace(/\n{2,}/g, '<br class="math-linebreak" />');

  const unholdRe = new RegExp(`@@MF_HOLD_${holdTag}_(\\d+)@@`, 'g');
  for (let pass = 0; pass < 6; pass++) {
    const next = s.replace(unholdRe, (_, idx: string) => held[Number(idx)] ?? '');
    if (next === s) break;
    s = next;
  }
  if (!enableLexicon) return s;
  if (opts.lexicon) {
    return Array.isArray(opts.lexicon)
      ? createLexiconMatcher(opts.lexicon).highlightHtml(s)
      : (opts.lexicon as LexiconMatcher).highlightHtml(s);
  }
  return highlightLexiconTerms(s);
}

export const parseMathAndFormat = renderMathInHtml;

/** Renders a media figure with caption math formatting wired through `renderMathInHtml`. */
export function renderMediaFigure(media: MediaDescriptor | string | null | undefined, opts?: RenderMediaOptions): string {
  return renderMediaFigureBase(media, {
    ...opts,
    renderCaption: opts?.renderCaption ?? ((txt: string) => renderMathInHtml(txt, { enableLexicon: false, basePath: opts?.basePath })),
  });
}

/** Wraps HTML content with a positioned/sized media figure with full math caption rendering. */
export function renderWithMedia(contentHtml: unknown, media: MediaDescriptor | string | null | undefined, opts?: RenderMediaOptions): string {
  return renderWithMediaBase(contentHtml, media, {
    ...opts,
    renderCaption: opts?.renderCaption ?? ((txt: string) => renderMathInHtml(txt, { enableLexicon: false, basePath: opts?.basePath })),
  });
}

/** Clears KaTeX and tkz-tab LRU caches. */
export function clearMathCaches(): void {
  katexLRU.clear();
  tkzLRU.clear();
}

/** Returns KaTeX and tkz-tab LRU cache statistics. */
export function getKatexMetrics(): KatexMetrics {
  return {
    katexHits: katexLRU.hits, katexMisses: katexLRU.misses, katexSize: katexLRU.size,
    tkzHits: tkzLRU.hits, tkzMisses: tkzLRU.misses, tkzSize: tkzLRU.size,
  };
}
