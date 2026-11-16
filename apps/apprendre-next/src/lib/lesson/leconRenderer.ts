import {
  renderMathInHtml,
  renderMediaFigure,
  renderWithMedia,
  type MediaDescriptor,
} from '../math/mathEngine';

const HAS = Object.prototype.hasOwnProperty;

function own<T>(map: Record<string, T>, key: string, fallback: T): T {
  return HAS.call(map, key) ? map[key] : fallback;
}

const CHEV_SVG =
  '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const FX_BTN =
  '<button type="button" class="fx" data-focus aria-label="Afficher ce bloc en plein écran" title="Plein écran"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>';

const APP_ALIASES = new Set([
  'application',
  'applicaoin',
  'applicaion',
  'applicatoin',
  'appclaoin',
  'applcaoin',
  'exercice',
  'exercise',
  'exo',
]);

const EX_ALIASES = new Set(['example', 'exemple', 'exmpale', 'exmale', 'examle', 'exaple']);

const SYNONYMS: Record<string, string> = {
  methode: 'method',
  strategie: 'strategy',
  lemme: 'lemma',
  corollaire: 'corollary',
  theoreme: 'theorem',
  propriete: 'property',
  demonstration: 'proof',
  preuve: 'proof',
  remarque: 'remark',
  note: 'remark',
  attention: 'warning',
  avertissement: 'warning',
  objective: 'objectif',
  indice: 'hint',
  indices: 'hint',
  probleme: 'problem',
  activite: 'exploration',
  introduction: 'intro',
  resume: 'summary',
  paragraphe: 'text',
};

const TYPE_LABELS: Record<string, string> = {
  definition: 'Définition',
  theorem: 'Théorème',
  property: 'Propriété',
  proposition: 'Proposition',
  corollary: 'Corollaire',
  lemma: 'Lemme',
  remark: 'Remarque',
  note: 'Note',
  text: 'Cours',
  method: 'Méthode',
  technique: 'Technique',
  strategy: 'Stratégie',
  cela_permet_de: 'À retenir',
  warning: 'Attention',
  example: 'Exemple',
  application: 'Exercice d’application',
  intuition: 'Intuition',
  objectif: 'Objectif',
  rappel: 'Rappel',
  summary: 'À retenir',
  consequence: 'Conséquence',
  savant: 'Note historique',
  intro: 'Introduction',
  exploration: 'Exploration',
  proof: 'Démonstration',
  problem: 'Problème',
  hint: 'Indice',
  solution: 'Solution',
};

const BLOCK_K_CODES: Record<string, string> = {
  definition: 'd',
  theorem: 't',
  property: 'p',
  proposition: 'p',
  corollary: 'p',
  lemma: 'p',
  remark: 'r',
  note: 'r',
  text: 'r',
  method: 'm',
  technique: 'm',
  strategy: 'm',
  cela_permet_de: 'm',
  warning: 'a',
  example: 'e',
  application: 'e',
  problem: 'e',
  intuition: 'i',
  hint: 'i',
  objectif: 'o',
  rappel: 'k',
  summary: 'k',
  consequence: 'c',
  savant: 's',
  intro: 's',
  exploration: 's',
  proof: 'y',
  solution: 'y',
};

const COLLAPSIBLE_TYPES = new Set([
  'definition',
  'theorem',
  'property',
  'proposition',
  'corollary',
  'lemma',
  'method',
  'technique',
  'strategy',
  'proof',
  'hint',
  'solution',
]);

const STATEMENT_TYPES = new Set(['theorem', 'property', 'proposition', 'corollary', 'lemma']);
const CORE_CARD_TYPES = new Set(['definition', ...STATEMENT_TYPES]);
const METHOD_TYPES = new Set(['method', 'technique', 'strategy']);
const CLOSED_BY_DEFAULT = new Set(['proof', 'hint', 'solution']);
const PRACTICE_TYPES = new Set(['application', 'example', 'problem']);
const NUMBERED_TYPES = new Set([
  'definition',
  'property',
  'theorem',
  'proposition',
  'lemma',
  'corollary',
  'method',
  'technique',
  'application',
  'example',
  'remark',
  'warning',
  'hint',
  'exploration',
]);

const SAFE_HREF =
  /^(?:#[^\s"'<>`\\\u0000-\u001f\u007f]*|(?:\.{1,2}\/|\/(?!\/))[^\s"'<>`\\\u0000-\u001f\u007f:]*|[a-z0-9_-][^\s"'<>`\\\u0000-\u001f\u007f:]*)$/i;

const MARK: Record<'^^' | '==' | '++', [string, string]> = {
  '^^': ['<span class="ru">', '</span>'],
  '==': ['<b class="cr">', '</b>'],
  '++': ['<b class="cg">', '</b>'],
};

const SKIP_TAGS = /^(?:annotation|code|pre|script|style|textarea)$/i;
const BLOCK_TAGS =
  /^(?:p|div|li|ul|ol|br|hr|h[1-6]|table|thead|tbody|tr|td|th|details|summary|section|blockquote|figure|figcaption)$/i;
const VOID_TAGS = /^(?:br|hr|img|input|meta|link|wbr|col|area|base|source|track|embed)$/i;
const TAG_SPLIT = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g;
const MATH_RE = /\$\$[\s\S]+?\$\$|\$(?:\\[\s\S]|[^$\\])+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;

export type IndexStyle = 'alpha' | 'arabic';

export interface TocResultItem {
  blockId: string;
  sectionId: string;
  sectionTitle: string;
  blockTitle?: string;
  snippet: string;
}

export interface IntroRenderResult<T = Record<string, unknown>> {
  markup: string;
  bodySections: T[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validates and HTML-escapes relative Next.js routes and hash anchors. */
export function safeHref(url: unknown, fallback = '/'): string {
  const s = String(url ?? '').trim();
  if (SAFE_HREF.test(s)) return escapeHtml(s);
  const fb = String(fallback ?? '/').trim();
  return escapeHtml(SAFE_HREF.test(fb) ? fb : '/');
}

/** Normalizes block type aliases and French synonyms into canonical block keys. */
export function normalizeBlockType(raw?: unknown): string {
  const key = String(raw || 'text')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (APP_ALIASES.has(key)) return 'application';
  if (EX_ALIASES.has(key)) return 'example';
  return own(SYNONYMS, key, key);
}

function alphabeticIndex(idx: number): string {
  let n = Number(idx) || 0;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Formats a top-level section index label (`A.`, `B.` by default, or `1`, `2`). */
export function sectionLabel(idx: number, style: IndexStyle = 'alpha'): string {
  return style === 'arabic' ? String(idx + 1) : `${alphabeticIndex(idx)}.`;
}

function subsectionLabel(secIdx: number, subIdx: number, style: IndexStyle = 'alpha'): string {
  return style === 'arabic' ? `${secIdx + 1}.${subIdx + 1}` : `${subIdx + 1}.`;
}

function splitTitleTokens(title: string): string[] {
  const src = String(title || '').trim();
  const tokens: string[] = [];
  let i = 0;

  while (i < src.length) {
    while (i < src.length && /\s/.test(src.charAt(i))) i++;
    if (i >= src.length) break;
    let tok = '';
    while (i < src.length && !/\s/.test(src.charAt(i))) {
      const rest = src.slice(i);
      const delim = rest.startsWith('$$')
        ? '$$'
        : rest.startsWith('\\(')
          ? '\\)'
          : rest.startsWith('\\[')
            ? '\\]'
            : src.charAt(i) === '$' && src.charAt(i - 1) !== '\\'
              ? '$'
              : '';
      if (!delim) {
        tok += src.charAt(i++);
        continue;
      }
      const end = src.indexOf(delim, i + (delim.length === 1 ? 1 : 2));
      if (end === -1) {
        tok += src.slice(i);
        i = src.length;
        break;
      }
      tok += src.slice(i, end + delim.length);
      i = end + delim.length;
    }
    if (tok) tokens.push(tok);
  }

  return tokens;
}

/** Renders the hero title, emphasizing the opening words without splitting inline math tokens. */
export function renderHeroTitleHtml(titleRaw: string, basePath = ''): string {
  const tokens = splitTitleTokens(titleRaw);
  if (tokens.length <= 1) return renderMathText(titleRaw, true, basePath);
  const head = tokens.slice(0, 2).join(' ');
  const tail = tokens.slice(2).join(' ');
  return `<b>${renderMathText(head, true, basePath)}</b>${tail ? ` ${renderMathText(tail, true, basePath)}` : ''}`;
}

function renderStars(difficulty: unknown): string {
  const parsed = Number(difficulty);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  const d = Math.min(5, Math.max(1, Math.round(parsed)));
  return `<span class="dif" role="img" aria-label="Difficulté ${d} sur 5">${'★'.repeat(d)}${'☆'.repeat(5 - d)}</span>`;
}

function matchBrace(src: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < src.length && depth > 0) {
    const ch = src.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '%') {
      while (i < src.length && src.charAt(i) !== '\n') i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return depth === 0 ? i : -1;
}

function extractQuestions(src: string, fromStart: boolean): { prompt: string; solution: string } | null {
  const cmds = ['\\question{', '\\qst{'];
  let pos = 0;
  if (fromStart) {
    const lead = src.match(/^(\s|\\par\b[^{]?)*/);
    pos = lead ? lead[0].length : 0;
  } else {
    pos = cmds.reduce((best, c) => {
      const idx = src.indexOf(c);
      return idx !== -1 && (best === -1 || idx < best) ? idx : best;
    }, -1);
    if (pos === -1) return null;
  }

  const parts: string[] = [];
  const firstStart = pos;
  while (pos < src.length) {
    const skip = src.slice(pos).match(/^(\s|\\par\b[^{]?)*/);
    const skipLen = skip ? skip[0].length : 0;
    const cmd = cmds.find((c) => src.startsWith(c, pos + skipLen));
    if (!cmd) break;
    pos += skipLen;
    const end = matchBrace(src, pos + cmd.length);
    if (end === -1) break;
    parts.push(src.slice(pos, end));
    pos = end;
  }

  if (!parts.length) return null;
  const prefix = fromStart ? '' : src.slice(0, firstStart).trim();
  const rest = src.slice(pos).replace(/^(\s|\\par\b|\\(?:small|med|big)skip\b)+/g, '').trim();
  return {
    prompt: `${prefix ? `${prefix}\n\n` : ''}${parts.join('\n')}`,
    solution: rest,
  };
}

function splitQuestionAndSolution(rawContent: unknown): { prompt: string; solution: string } {
  const src = Array.isArray(rawContent)
    ? rawContent.map((part) => String(part ?? '')).join('\n\n')
    : String(rawContent ?? '');
  const cor = src.match(
    /(?:^|\n|\s)(?:\*\*(?:Correction|Solution)[^*\n]*\*\*|\\textbf\{(?:Correction|Solution)[^{}]*\})\s*:?\s*/i
  );
  if (cor && typeof cor.index === 'number') {
    const before = src.slice(0, cor.index).trim();
    const after = src.slice(cor.index + cor[0].length).trim();
    if (before && after) return { prompt: before, solution: after };
  }
  const qSplit = extractQuestions(src, true) || extractQuestions(src, false);
  return qSplit && qSplit.solution ? qSplit : { prompt: src, solution: '' };
}

function applyMarkers(html: string): string {
  const src = String(html ?? '');
  if (!/\^\^|==|\+\+/.test(src)) return src;

  const parts = src.split(TAG_SPLIT);
  let depth = 0;
  let skip = 0;
  const stack: Array<{ tok: '^^' | '==' | '++'; depth: number; part: number; idx: number }> = [];
  const edits: Record<number, Array<{ pos: number; html: string }>> = {};

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    if (seg.charAt(0) === '<') {
      const tm = /^<\s*(\/)?\s*([a-zA-Z][\w:-]*)/.exec(seg);
      if (!tm) continue;
      const closing = Boolean(tm[1]);
      const name = tm[2];
      const selfClose = VOID_TAGS.test(name) || /\/\s*>$/.test(seg);
      if (BLOCK_TAGS.test(name)) stack.length = 0;
      if (SKIP_TAGS.test(name) && !selfClose) {
        skip = Math.max(0, skip + (closing ? -1 : 1));
      }
      if (!selfClose) {
        depth += closing ? -1 : 1;
        if (closing) {
          while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
        }
      }
      continue;
    }

    if (skip > 0) continue;
    const re = /\^\^|==|\+\+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) {
      const tok = m[0] as '^^' | '==' | '++';
      const idx = m.index;
      const prev = idx > 0 ? seg.charAt(idx - 1) : '';
      const next = idx + 2 < seg.length ? seg.charAt(idx + 2) : '';
      const canOpen = next === '' || !/\s/.test(next);
      const canClose = prev === '' || !/\s/.test(prev);
      let k = -1;
      if (canClose) {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].tok === tok && stack[s].depth === depth) {
            k = s;
            break;
          }
        }
      }
      if (k >= 0) {
        const op = stack[k];
        stack.length = k;
        (edits[op.part] = edits[op.part] ?? []).push({ pos: op.idx, html: MARK[tok][0] });
        (edits[i] = edits[i] ?? []).push({ pos: idx, html: MARK[tok][1] });
      } else if (canOpen) {
        stack.push({ tok, depth, part: i, idx });
      }
    }
  }

  return parts
    .map((seg, i) => {
      const list = edits[i];
      if (!list) return seg;
      list.sort((a, b) => b.pos - a.pos);
      let nextSeg = seg;
      list.forEach((e) => {
        nextSeg = nextSeg.slice(0, e.pos) + e.html + nextSeg.slice(e.pos + 2);
      });
      return nextSeg;
    })
    .join('');
}

function toBlanks(src: string): string {
  if (!src.includes('[[')) return src;
  const ranges: Array<[number, number]> = [];
  MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_RE.exec(src))) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return src.replace(/\[\[((?:(?!\n[ \t]*\n)[\s\S])+?)\]\]/g, (all, inner: string, off: number) => {
    for (let i = 0; i < ranges.length; i++) {
      if (off >= ranges[i][0] && off < ranges[i][1]) return all;
    }
    return `\\blank{${inner}}`;
  });
}

function hasContentValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((part) => String(part ?? '').trim().length > 0);
  }
  return String(value ?? '').trim().length > 0;
}

/** Renders math, blanks, lexicon highlights, and inline revision emphasis markers. */
export function renderMathText(raw: unknown, isPromptOnly = false, basePath = ''): string {
  const src = Array.isArray(raw)
    ? raw.map((part) => String(part ?? '')).join('\n\n')
    : String(raw ?? '');
  if (!src.trim()) return '';
  const normalized = toBlanks(src);
  return applyMarkers(
    renderMathInHtml(normalized, {
      enableLexicon: !isPromptOnly,
      basePath,
    })
  );
}

const INTRO_STAGE_ONLY_TYPES = new Set(['intro', 'savant', 'objectif']);
const INTRO_NARRATIVE_TYPES = new Set(['intro', 'savant', 'objectif', 'text', 'remark', 'rappel', 'intuition']);

function isIntroTitle(rawTitle: unknown): boolean {
  const s = String(rawTitle ?? '').trim();
  return /^(?:introduction|mise en route|pr[ée]sentation)\b/i.test(s);
}

function normalizeBlockMedia(media: unknown): MediaDescriptor | null {
  if (!media) return null;
  const mediaRec =
    typeof media === 'string'
      ? media.trim()
        ? { src: media.trim() }
        : null
      : asRecord(media);
  if (!mediaRec) return null;

  const firstImg =
    Array.isArray(mediaRec.images) && mediaRec.images[0] ? asRecord(mediaRec.images[0]) : null;
  const normMedia = !mediaRec.src && firstImg ? { ...mediaRec, ...firstImg } : mediaRec;
  return typeof normMedia.src === 'string' && normMedia.src.trim()
    ? (normMedia as unknown as MediaDescriptor)
    : null;
}

function findMatchingBraceEnd(str: string, openBraceIdx: number): number {
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    const ch = str.charAt(i);
    if (ch === '\\' && i + 1 < str.length) {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

function extractSavantSentence(rawText: string): {
  mainText: string;
  savantText: string;
  savantName: string;
} {
  const match = /\\savant(?:\[[^\]]*\])?\s*\{/.exec(rawText);
  if (!match) return { mainText: rawText, savantText: '', savantName: '' };

  const braceOpen = rawText.indexOf('{', match.index);
  const braceClose = braceOpen >= 0 ? findMatchingBraceEnd(rawText, braceOpen) : -1;
  if (braceClose < 0) return { mainText: rawText, savantText: '', savantName: '' };

  const savantName = rawText.slice(braceOpen + 1, braceClose).trim();
  // Leave explicit two-argument \savant{Name}{Bio} intact since mathEngine renders its own card.
  let afterNameIdx = braceClose + 1;
  while (afterNameIdx < rawText.length && /\s/.test(rawText.charAt(afterNameIdx))) afterNameIdx++;
  if (rawText.charAt(afterNameIdx) === '{') {
    return { mainText: rawText, savantText: '', savantName };
  }

  let sentStart = match.index;
  const before = rawText.slice(0, match.index);
  const cestMatch = /(?:^|[.!?\n]\s*|\}\s+)(C['’]est\s+)$/i.exec(before);
  if (cestMatch) {
    sentStart = match.index - cestMatch[1].length;
  }

  let braceDepth = 0;
  let inInlineMath = false;
  let sentEnd = rawText.length;
  for (let i = braceClose + 1; i < rawText.length; i++) {
    const ch = rawText.charAt(i);
    if (ch === '\\' && i + 1 < rawText.length) {
      i++;
      continue;
    }
    if (ch === '$' && rawText.charAt(i + 1) !== '$') {
      inInlineMath = !inInlineMath;
      continue;
    }
    if (inInlineMath) continue;
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (braceDepth > 0) continue;

    if (ch === '.' || ch === '!' || ch === '?') {
      const tail = rawText.slice(0, i + 1);
      if (ch === '.' && (/\bav\.$/i.test(tail) || /\b[A-Z]\.$/i.test(tail))) {
        continue;
      }
      const next = rawText.charAt(i + 1);
      if (!next || /\s/.test(next)) {
        sentEnd = i + 1;
        break;
      }
    }
  }

  const savantText = rawText.slice(sentStart, sentEnd).trim();
  const mainText = (rawText.slice(0, sentStart) + ' ' + rawText.slice(sentEnd))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([.,;:!?])/g, '$1')
    .trim();

  if (mainText.length < 24 || savantText.length < 12) {
    return { mainText: rawText, savantText: '', savantName };
  }
  return { mainText, savantText, savantName };
}

function scholarInitials(name: string): string {
  const words = name
    .replace(/\\text[a-z]+\{([^{}]*)\}/gi, '$1')
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, ''))
    .filter((w) => w.length > 1);
  if (!words.length) return 'Σ';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
}

function renderWithMediaBlock(
  raw: unknown,
  media: unknown,
  isPromptOnly: boolean,
  basePath: string
): string {
  const html = renderMathText(raw, isPromptOnly, basePath);
  const normMedia = normalizeBlockMedia(media);
  if (normMedia) {
    return renderWithMedia(html, normMedia, {
      enableLexicon: !isPromptOnly,
      basePath,
    });
  }
  return html;
}

/** Renders a single lesson block into revision-study HTML. */
export function renderBlockHtml(
  block: unknown,
  domId: string,
  counters: Record<string, number>,
  numbered = true,
  basePath = ''
): string {
  const blk = typeof block === 'string' ? { type: 'text', content: block } : asRecord(block);
  if (!blk) return '';

  const type = normalizeBlockType(blk.type);
  const k = own(BLOCK_K_CODES, type, 'r');
  const label = own(TYPE_LABELS, type, 'Note');
  let num = '';
  if (numbered && NUMBERED_TYPES.has(type)) {
    counters[type] = (counters[type] || 0) + 1;
    num = ` ${counters[type]}`;
  }

  const stars = renderStars(blk.difficulty);
  const qPrompt = typeof blk.question === 'string' ? blk.question.trim() : '';
  const tPrompt = typeof blk.title === 'string' ? blk.title.trim() : '';
  const rawPrompt = qPrompt || tPrompt;
  const isPractice = PRACTICE_TYPES.has(type);
  const split = isPractice
    ? splitQuestionAndSolution(blk.content)
    : { prompt: blk.content, solution: '' };
  const rawSolution = blk.correction ?? blk.solution ?? split.solution;
  const hasSolution = hasContentValue(rawSolution);
  const bodyHtml = renderWithMediaBlock(split.prompt, blk.media, isPractice, basePath);
  const idAttr = ` id="${escapeHtml(domId)}"`;
  const tAttr = ` data-t="${escapeHtml(type)}" data-k="${k}"`;

  if (type === 'text') {
    if (rawPrompt) {
      return (
        `<details class="blk blk-txt"${tAttr}${idAttr} open>` +
        `<summary><span class="q">${renderMathText(rawPrompt, true, basePath)}</span>` +
        `<span class="tgl" aria-hidden="true"><span class="tgl-on">Masquer</span><span class="tgl-off">Afficher</span></span>` +
        `</summary><div class="bx">${bodyHtml}</div></details>`
      );
    }
    return `<div class="blk blk-bare"${tAttr}${idAttr}><div class="bx">${bodyHtml}</div></div>`;
  }

  if (COLLAPSIBLE_TYPES.has(type)) {
    const hasCustomPrompt = Boolean(rawPrompt);
    const isBareTrigger = type === 'proof' || type === 'hint' || type === 'solution';
    const headingText = rawPrompt || `${label}${num}`;
    // Method/technique/strategy cards omit the generic type badge when a custom heading is present.
    const showBadge = !isBareTrigger && !(METHOD_TYPES.has(type) && hasCustomPrompt);
    const badge = showBadge ? `<span class="bt">${escapeHtml(`${label}${num}`)}</span>` : '';
    const title =
      hasCustomPrompt || isBareTrigger
        ? `<span class="q">${renderMathText(headingText, true, basePath)}</span>`
        : '';
    const cls = [
      'blk',
      CORE_CARD_TYPES.has(type) ? 'blk-core' : '',
      type === 'definition' ? 'blk-def' : '',
      STATEMENT_TYPES.has(type) ? 'blk-stmt' : '',
      METHOD_TYPES.has(type) ? 'blk-method' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const openAttr = CLOSED_BY_DEFAULT.has(type) ? '' : ' open';
    return (
      `<details class="${cls}"${tAttr}${idAttr}${openAttr}>` +
      `<summary>${badge}${title}${stars}${CHEV_SVG}</summary>` +
      `<div class="bx">${FX_BTN}${bodyHtml}</div></details>`
    );
  }

  const head =
    type === 'warning'
      ? `<div class="bh bh-warn"><span class="bw-lbl">${escapeHtml(`${label}${num}`)}</span>${
          tPrompt
            ? `<span class="bw-sep" aria-hidden="true">\u2014</span><span class="bw-ttl">${renderMathText(tPrompt, true, basePath)}</span>`
            : ''
        }${stars}</div>`
      : `<div class="bh"><span class="bt">${escapeHtml(`${label}${num}`)}</span>${stars}</div>`;
  const titlePrefix =
    type !== 'warning' && tPrompt
      ? `<p class="btitle">${renderMathText(tPrompt, true, basePath)}</p>`
      : '';
  const solLabel =
    typeof blk.solutionLabel === 'string' && blk.solutionLabel.trim()
      ? blk.solutionLabel
      : 'Résolvons l’exercice';
  const solHtml = hasSolution
    ? `<details class="sol"><summary>${escapeHtml(solLabel)}${CHEV_SVG}</summary>` +
      `<div class="bx"><div class="cor">Correction</div>${renderMathText(rawSolution, false, basePath)}` +
      `<button class="ghost" type="button" data-all>Tout révéler</button></div></details>`
    : '';

  const typeCls =
    type === 'intro'
      ? ' blk-intro'
      : type === 'savant'
        ? ' blk-savant'
        : type === 'objectif'
          ? ' blk-objectif'
          : '';
  return `<div class="blk${typeCls}"${tAttr}${idAttr}>${head}<div class="bx">${FX_BTN}${titlePrefix}${bodyHtml}</div>${solHtml}</div>`;
}

/** Renders the lesson introduction lede/aside and splits off leading intro sections. */
export function renderIntroHtml<T = Record<string, unknown>>(
  sheet: unknown,
  sections: readonly T[] | null | undefined,
  basePath = ''
): IntroRenderResult<T> {
  const sheetRec = asRecord(sheet) ?? {};
  const headerRec = asRecord(sheetRec.header);
  const secList = Array.isArray(sections) ? sections : [];
  const firstRec = secList.length ? asRecord(secList[0]) : null;
  const firstBlocks = firstRec && Array.isArray(firstRec.blocks) ? firstRec.blocks : [];

  const firstIdIsIntro = Boolean(firstRec && (firstRec.id === 'intro' || isIntroTitle(firstRec.title)));
  const allFirstNarrative =
    firstBlocks.length > 0 &&
    firstBlocks.every((rawB) => {
      const bRec = asRecord(rawB);
      return INTRO_NARRATIVE_TYPES.has(normalizeBlockType(bRec ? bRec.type : undefined));
    });
  const isPureIntroSec = Boolean(firstRec && (firstIdIsIntro || !firstRec.title) && allFirstNarrative);

  let consumedIntroCount = 0;
  if (isPureIntroSec) {
    consumedIntroCount = firstBlocks.length;
  } else if (firstIdIsIntro && firstBlocks.length > 0) {
    while (consumedIntroCount < firstBlocks.length) {
      const bRec = asRecord(firstBlocks[consumedIntroCount]);
      if (!INTRO_STAGE_ONLY_TYPES.has(normalizeBlockType(bRec ? bRec.type : undefined))) break;
      consumedIntroCount++;
    }
  }

  let subtitleHtml = '';
  if (headerRec && headerRec.subtitle) {
    const renderedSub = renderMathText(headerRec.subtitle, true, basePath);
    if (renderedSub) subtitleHtml = `<p class="intro-standfirst">${renderedSub}</p>`;
  }

  const ledeCopies: string[] = [];
  const keyIdeas: string[] = [];
  const savantTexts: string[] = [];
  const guideParts: string[] = [];
  let savantMedia: MediaDescriptor | null = null;
  let savantName = '';

  const introSlice = firstBlocks.slice(0, consumedIntroCount);
  for (const rawB of introSlice) {
    const bRec = asRecord(rawB);
    if (!bRec) continue;
    const t = normalizeBlockType(bRec.type);
    const media = normalizeBlockMedia(bRec.media);
    const rawStr = Array.isArray(bRec.content)
      ? bRec.content.map((p) => String(p ?? '')).join('\n\n')
      : String(bRec.content ?? '');

    if (t === 'savant') {
      if (media && !savantMedia) savantMedia = media;
      const html = renderMathText(rawStr, false, basePath);
      if (html) savantTexts.push(html);
      continue;
    }

    if (t === 'remark' && introSlice.length > 1) {
      const html = renderWithMediaBlock(bRec.content, media, false, basePath);
      if (html) guideParts.push(`<div class="note-guide-item">${html}</div>`);
      continue;
    }

    const splitSavant = extractSavantSentence(rawStr);
    if (splitSavant.savantName && !savantName) savantName = splitSavant.savantName;
    if (splitSavant.savantText) {
      const sHtml = renderMathText(splitSavant.savantText, false, basePath);
      if (sHtml) savantTexts.push(sHtml);
    }
    if (media && !savantMedia) savantMedia = media;

    const mainHtml = renderMathText(splitSavant.mainText, false, basePath);
    if (!mainHtml) continue;

    if (t === 'text' && ledeCopies.length > 0 && consumedIntroCount > 1) {
      keyIdeas.push(`<div class="intro-key-idea"><span class="intro-idea-lbl">À retenir</span><div>${mainHtml}</div></div>`);
    } else if (t === 'objectif' || t === 'rappel' || t === 'intuition') {
      const tag = TYPE_LABELS[t] || 'Repère';
      keyIdeas.push(`<div class="intro-callout" data-kind="${escapeHtml(t)}"><span class="intro-idea-lbl">${escapeHtml(tag)}</span><div>${mainHtml}</div></div>`);
    } else {
      ledeCopies.push(`<div class="intro-copy">${mainHtml}</div>`);
    }
  }

  const hasPortraitMedia = savantMedia !== null;
  const contextHtml = headerRec && headerRec.context ? renderMathText(headerRec.context, true, basePath) : '';
  const contextChip = contextHtml ? `<span class="note-context-chip">${contextHtml}</span>` : '';

  let asideHtml = '';
  if (savantTexts.length || savantMedia) {
    const portraitMarkup = savantMedia
      ? `<div class="note-portrait-slot">${renderMediaFigure(
          { ...savantMedia, position: undefined, width: undefined, wrap: undefined },
          {
            basePath,
            renderCaption: (txt: string) => renderMathInHtml(txt, { enableLexicon: false, basePath }),
          }
        )}</div>`
      : savantName
        ? `<div class="note-seal" aria-hidden="true">${escapeHtml(scholarInitials(savantName))}</div>`
        : '';
    const bioMarkup = savantTexts.length
      ? `<div class="note-prose">${savantTexts.map((s) => `<p>${s}</p>`).join('')}</div>`
      : hasPortraitMedia
        ? `<p class="note-portrait-lead">Figure historique associée aux notions de ce chapitre.</p>`
        : '';
    const asideClass = hasPortraitMedia ? 'note note-savant has-portrait' : 'note note-savant';
    asideHtml =
      `<aside class="${asideClass}">` +
      `<div class="note-head"><span class="note-kicker">${savantTexts.length ? 'Repère historique' : 'Figure historique'}</span>${contextChip}</div>` +
      `<div class="note-savant-body">${portraitMarkup}${bioMarkup}</div>` +
      `</aside>`;
  } else if (guideParts.length) {
    asideHtml =
      `<aside class="note note-guide">` +
      `<div class="note-head"><span class="note-kicker">Fil conducteur</span>${contextChip}</div>` +
      `<div class="note-prose">${guideParts.join('')}</div>` +
      `</aside>`;
  } else if (contextHtml) {
    const kindLabel = sheetRec.kind === 'probleme' ? 'Cadre du problème' : 'Programme';
    asideHtml =
      `<aside class="note note-context">` +
      `<div class="note-head"><span class="note-kicker">${kindLabel}</span></div>` +
      `<p class="note-context-val">${contextHtml}</p>` +
      `</aside>`;
  }

  const ledeInner = subtitleHtml + ledeCopies.join('') + keyIdeas.join('');
  const fallbackLede =
    sheetRec.kind === 'probleme' ? '' : '<p class="intro-standfirst">Synthèse complète du chapitre.</p>';
  const hasProseBody = ledeCopies.length > 0 || keyIdeas.length > 0;
  const introStageCls = [
    'intro',
    hasProseBody ? 'intro-editorial' : 'intro-compact',
    asideHtml ? 'has-aside' : 'intro-solo',
  ].join(' ');

  const markup =
    `<div class="${introStageCls}" id="les-intro">` +
    `<div class="lede">${ledeInner || fallbackLede}</div>${asideHtml}</div>`;

  let bodySections: T[];
  if (consumedIntroCount >= firstBlocks.length && isPureIntroSec) {
    bodySections = secList.slice(1);
  } else if (consumedIntroCount > 0 && firstRec) {
    const remainingBlocks = firstBlocks.slice(consumedIntroCount);
    const trimmedFirst = {
      ...firstRec,
      title: isIntroTitle(firstRec.title) || !firstRec.title ? 'Mise en route' : firstRec.title,
      blocks: remainingBlocks,
    } as unknown as T;
    bodySections = [trimmedFirst, ...secList.slice(1)];
  } else {
    bodySections = secList.slice();
  }

  return { markup, bodySections };
}

/** Renders a numbered lesson section with its blocks and subsections. */
export function renderSectionHtml(
  sec: unknown,
  secIdx: number,
  counters: Record<string, number>,
  numbered = true,
  basePath = '',
  indexStyle: IndexStyle = 'alpha'
): string {
  const secRec = asRecord(sec) ?? {};
  const style: IndexStyle = indexStyle || 'alpha';
  const secId = String(secRec.id != null ? secRec.id : `sec-${secIdx}`);
  const ltr = sectionLabel(secIdx, style);
  const leadRaw = secRec.lead || secRec.description || secRec.subtitle || '';
  const leadHtml = leadRaw ? `<p class="lead">${renderMathText(leadRaw, false, basePath)}</p>` : '';

  const blocks = Array.isArray(secRec.blocks) ? secRec.blocks : [];
  const blocksHtml = blocks
    .map((b, bIdx) => renderBlockHtml(b, `revision-block-${secId}-${bIdx}`, counters, numbered, basePath))
    .join('');

  const subsections = Array.isArray(secRec.subsections) ? secRec.subsections : [];
  const subHtml = subsections
    .map((rawSub, subIdx) => {
      const subRec = asRecord(rawSub) ?? {};
      const subTitle = subRec.title
        ? `<h3 class="subh"><span class="sn">${escapeHtml(subsectionLabel(secIdx, subIdx, style))}</span><span class="subt">${renderMathText(subRec.title, true, basePath)}</span></h3>`
        : '';
      const subLeadRaw = subRec.lead || subRec.description || '';
      const subLead = subLeadRaw ? `<p class="lead">${renderMathText(subLeadRaw, false, basePath)}</p>` : '';
      const subBlockList = Array.isArray(subRec.blocks) ? subRec.blocks : [];
      const subBlocks = subBlockList.length
        ? subBlockList
            .map((b, bIdx) =>
              renderBlockHtml(b, `revision-block-${secId}-sub-${subIdx}-${bIdx}`, counters, numbered, basePath)
            )
            .join('')
        : subRec.content
          ? `<div class="bx">${renderMathText(subRec.content, false, basePath)}</div>`
          : '';
      return `<div class="subsec" id="les-${escapeHtml(secId)}-sub-${subIdx}">${subTitle}${subLead}${subBlocks}</div>`;
    })
    .join('');

  const fallback =
    !blocksHtml && !subHtml && secRec.content
      ? `<div class="bx">${renderMathText(secRec.content, false, basePath)}</div>`
      : '';

  return (
    `<section class="ls" id="les-${escapeHtml(secId)}" data-sec-id="${escapeHtml(secId)}">` +
    `<h2 class="lh" tabindex="-1"><span class="ltr">${escapeHtml(ltr)}</span><span class="lht">${renderMathText(secRec.title || 'Section', true, basePath)}</span></h2>` +
    `${leadHtml}${blocksHtml}${subHtml}${fallback}</section>`
  );
}

/** Formats search hits for the lesson TOC search drawer. */
export function renderTocResultsHtml(results: readonly TocResultItem[] | null | undefined): string {
  if (!results || !results.length) {
    return '<p class="toc-empty">Aucun passage trouvé.</p>';
  }
  return results
    .map((r) => {
      const sub = r.blockTitle ? `${r.sectionTitle} · ${r.blockTitle}` : r.sectionTitle;
      return (
        `<button type="button" class="toc-hit" data-jump-block="${escapeHtml(r.blockId)}" data-sec="${escapeHtml(r.sectionId)}">` +
        `<span class="toc-hit-sec">${escapeHtml(sub)}</span><span class="toc-hit-snip">${escapeHtml(r.snippet)}</span></button>`
      );
    })
    .join('');
}

/** Estimates lesson reading duration in minutes at ~220 words per minute. */
export function computeReadTime(
  rootOrText: string | { textContent?: string | null } | null | undefined
): string {
  const text =
    typeof rootOrText === 'string'
      ? rootOrText
      : rootOrText && typeof rootOrText.textContent === 'string'
        ? rootOrText.textContent
        : '';
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return `${Math.max(1, Math.round(words / 220))} min de lecture`;
}
