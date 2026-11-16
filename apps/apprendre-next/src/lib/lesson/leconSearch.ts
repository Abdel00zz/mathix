const HAS = Object.prototype.hasOwnProperty;

const LATEX_WORDS: Record<string, string> = {
  alpha: 'alpha',
  beta: 'beta',
  gamma: 'gamma',
  delta: 'delta',
  theta: 'theta',
  lambda: 'lambda',
  mu: 'mu',
  pi: 'pi',
  rho: 'rho',
  sigma: 'sigma',
  omega: 'omega',
  infty: 'infini',
  pinf: 'plus infini',
  minf: 'moins infini',
  times: 'fois',
  cdot: 'fois',
  div: 'divise',
  pm: 'plus moins',
  leq: 'inferieur egal',
  le: 'inferieur egal',
  geq: 'superieur egal',
  ge: 'superieur egal',
  neq: 'different',
  approx: 'environ',
  implies: 'implique',
  impl: 'implique',
  iff: 'equivaut',
  ssi: 'equivaut',
  equiv: 'equivalent',
  forall: 'pour tout',
  exists: 'il existe',
  Re: 'partie reelle',
  Im: 'partie imaginaire',
  arg: 'argument',
  lim: 'limite',
  sum: 'somme',
  prod: 'produit',
  int: 'integrale',
  sqrt: 'racine',
  R: 'R',
  N: 'N',
  Z: 'Z',
  Q: 'Q',
  C: 'C',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  ln: 'ln',
  log: 'log',
  exp: 'exp',
};

const GREEK: Record<string, string> = {
  'α': ' alpha ',
  'β': ' beta ',
  'γ': ' gamma ',
  'δ': ' delta ',
  'θ': ' theta ',
  'λ': ' lambda ',
  'μ': ' mu ',
  'π': ' pi ',
  'ρ': ' rho ',
  'σ': ' sigma ',
  'ω': ' omega ',
  'Α': ' alpha ',
  'Β': ' beta ',
  'Γ': ' gamma ',
  'Δ': ' delta ',
  'Θ': ' theta ',
  'Λ': ' lambda ',
  'Μ': ' mu ',
  'Π': ' pi ',
  'Ρ': ' rho ',
  'Σ': ' sigma ',
  'Ω': ' omega ',
};

const GREEK_RE = /[αβγδθλμπρσωΑΒΓΔΘΛΜΠΡΣΩ]/g;
const WRAPPER_RE =
  /\\(?:text|textbf|textit|mathrm|mathbf|mathbb|mathcal|operatorname|objectif|defi|savant|mathqst|qst|question|itemsize|boxed|underline|overline|vec|blank|emph)\s*\{([^{}]*)\}/g;

export type SearchBlockIndex = number | 'title' | 'content' | 'sub';

export interface SearchIndexEntry {
  id: string;
  sectionId: string;
  blockId: string;
  blockIndex: SearchBlockIndex;
  sectionTitle: string;
  blockTitle: string;
  text: string;
  normalizedText: string;
  normalizedSectionTitle: string;
  normalizedBlockTitle: string;
  order: number;
}

export interface SearchHit extends SearchIndexEntry {
  score: number;
  snippet: string;
  terms: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function stringifyInput(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).join('\n');
  }
  return String(value ?? '');
}

function expandGreek(value: unknown): string {
  return stringifyInput(value).replace(GREEK_RE, (ch) => GREEK[ch] ?? ch);
}

/** Normalizes text into accent-free lowercase tokens for search matching. */
export function normalizeSearchText(value: unknown): string {
  return expandGreek(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips HTML, markers, and LaTeX markup into readable plain French text. */
export function contentToPlainText(value: unknown): string {
  let text = expandGreek(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[([\s\S]*?)\]\]/g, '$1')
    .replace(/\^\^([\s\S]*?)\^\^|==([\s\S]*?)==|\+\+([\s\S]*?)\+\+/g, '$1$2$3')
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 sur $2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'racine de $1')
    .replace(/\\(?:begin|end)\s*\{[^{}]+\}/g, ' ');

  for (let pass = 0; pass < 6; pass++) {
    const prev = text;
    text = text
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 sur $2')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'racine de $1')
      .replace(WRAPPER_RE, '$1');
    if (text === prev) break;
  }

  return text
    .replace(/\\(?:left|right|displaystyle|textstyle|quad|qquad|,|;|!)/g, ' ')
    .replace(/\\([A-Za-z]+)\b/g, (_m, cmd: string) => (HAS.call(LATEX_WORDS, cmd) ? LATEX_WORDS[cmd] : ' '))
    .replace(/\\[()[\]]/g, ' ')
    .replace(/[\\$*_`#~^{}|]/g, ' ')
    .replace(/&(?:nbsp|ensp|emsp);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+([,.;:!?])/g, '$1');
}

/** Normalizes a user search query after stripping LaTeX/markup wrappers. */
export function normalizeSearchQuery(value: unknown): string {
  return normalizeSearchText(contentToPlainText(value));
}

function splitIntoParagraphs(value: unknown): string[] {
  const parts = stringifyInput(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/(?:\r?\n\s*\r?\n|\\par\b|\r?\n(?=\s*[-•]))/g)
    .map((part) => contentToPlainText(part))
    .filter(Boolean);
  if (parts.length) return parts;
  const single = contentToPlainText(value);
  return single ? [single] : [];
}

/** Builds a flat full-text search index over lesson sections, blocks, and subsections. */
export function buildSearchIndex(sections?: readonly unknown[] | null): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];
  let order = 0;

  const pushEntry = (
    secId: string,
    secTitle: string,
    blockId: string,
    blockIndex: SearchBlockIndex,
    blockTitle: string,
    text: string,
    pIdx: number
  ): void => {
    entries.push({
      id: `${blockId}:${pIdx}`,
      sectionId: secId,
      blockId,
      blockIndex,
      sectionTitle: contentToPlainText(secTitle),
      blockTitle: blockTitle ? contentToPlainText(blockTitle) : '',
      text,
      normalizedText: normalizeSearchText(text),
      normalizedSectionTitle: normalizeSearchText(secTitle),
      normalizedBlockTitle: normalizeSearchText(blockTitle),
      order: order++,
    });
  };

  const indexContainer = (
    secId: string,
    secTitle: string,
    node: Record<string, unknown>,
    prefix: string,
    fallbackId: string,
    fallbackBlockTitle: string
  ): void => {
    const blocks = Array.isArray(node.blocks) ? node.blocks : [];
    if (blocks.length) {
      blocks.forEach((rawBlk, bIdx) => {
        if (rawBlk == null) return;
        const blk = typeof rawBlk === 'string' ? { content: rawBlk } : asRecord(rawBlk);
        if (!blk) return;

        const bt =
          typeof blk.title === 'string'
            ? blk.title.trim()
            : typeof blk.question === 'string'
              ? blk.question.trim()
              : '';
        const contentItems = Array.isArray(blk.content) ? blk.content : [blk.content ?? ''];
        const paras: string[] = [];
        contentItems.forEach((item) => {
          paras.push(...splitIntoParagraphs(item));
        });
        if (bt && !paras.length) {
          const plainTitle = contentToPlainText(bt);
          if (plainTitle) paras.push(plainTitle);
        }
        paras.forEach((para, pIdx) => {
          pushEntry(secId, secTitle, `${prefix}-${bIdx}`, bIdx, bt, para, pIdx);
        });
      });
      return;
    }

    const rawContent = stringifyInput(node.content);
    if (rawContent.trim()) {
      splitIntoParagraphs(rawContent).forEach((para, pIdx) => {
        pushEntry(secId, secTitle, fallbackId, 'content', fallbackBlockTitle, para, pIdx);
      });
    }
  };

  const list = Array.isArray(sections) ? sections : [];
  list.forEach((rawSec, sIdx) => {
    const sec = asRecord(rawSec);
    if (!sec) return;
    const secId = String(sec.id != null ? sec.id : `sec-${sIdx}`);
    const secTitle = typeof sec.title === 'string' ? sec.title : '';
    const plainTitle = contentToPlainText(secTitle);
    if (plainTitle) {
      pushEntry(secId, secTitle, `les-${secId}`, 'title', '', plainTitle, 0);
    }
    const secLead = typeof sec.lead === 'string' ? sec.lead : (typeof sec.description === 'string' ? sec.description : '');
    if (secLead.trim()) {
      splitIntoParagraphs(secLead).forEach((para, pIdx) => {
        pushEntry(secId, secTitle, `les-${secId}`, 'content', '', para, pIdx + 1);
      });
    }
    indexContainer(secId, secTitle, sec, `revision-block-${secId}`, `revision-block-${secId}-content`, '');

    const subsections = Array.isArray(sec.subsections) ? sec.subsections : [];
    subsections.forEach((rawSub, subIdx) => {
      const sub = asRecord(rawSub);
      if (!sub) return;
      const subId = `les-${secId}-sub-${subIdx}`;
      const subTitle = typeof sub.title === 'string' ? sub.title : '';
      if (subTitle) {
        pushEntry(secId, secTitle, subId, 'sub', subTitle, contentToPlainText(subTitle), 0);
      }
      const subLead = typeof sub.lead === 'string' ? sub.lead : (typeof sub.description === 'string' ? sub.description : '');
      if (subLead.trim()) {
        splitIntoParagraphs(subLead).forEach((para, pIdx) => {
          pushEntry(secId, secTitle, subId, 'sub', subTitle, para, pIdx + 1);
        });
      }
      indexContainer(secId, secTitle, sub, `revision-block-${secId}-sub-${subIdx}`, subId, subTitle);
    });
  });

  return entries;
}

/** Extracts plain readable prose from lesson sections for accurate reading-time estimation (without JSON keys). */
export function extractLessonPlainText(sections?: readonly unknown[] | null): string {
  const parts: string[] = [];
  const collectContainer = (node: Record<string, unknown>) => {
    const blocks = Array.isArray(node.blocks) ? node.blocks : [];
    blocks.forEach((rawBlk) => {
      if (typeof rawBlk === 'string') {
        const plain = contentToPlainText(rawBlk);
        if (plain) parts.push(plain);
        return;
      }
      const blk = asRecord(rawBlk);
      if (!blk) return;
      for (const field of ['title', 'question', 'content', 'correction', 'solution']) {
        const val = blk[field];
        if (val != null) {
          const plain = contentToPlainText(val);
          if (plain) parts.push(plain);
        }
      }
    });
    if (!blocks.length && node.content != null) {
      const plain = contentToPlainText(node.content);
      if (plain) parts.push(plain);
    }
  };

  (Array.isArray(sections) ? sections : []).forEach((rawSec) => {
    const sec = asRecord(rawSec);
    if (!sec) return;
    for (const field of ['title', 'lead', 'description', 'subtitle']) {
      if (sec[field] != null) {
        const plain = contentToPlainText(sec[field]);
        if (plain) parts.push(plain);
      }
    }
    collectContainer(sec);
    const subsections = Array.isArray(sec.subsections) ? sec.subsections : [];
    subsections.forEach((rawSub) => {
      const sub = asRecord(rawSub);
      if (!sub) return;
      for (const field of ['title', 'lead', 'description']) {
        if (sub[field] != null) {
          const plain = contentToPlainText(sub[field]);
          if (plain) parts.push(plain);
        }
      }
      collectContainer(sub);
    });
  });

  return parts.join(' ');
}

/** Extracts a contextual 138-char snippet centered near the first matched term. */
export function makeSnippet(text: string, terms: readonly string[]): string {
  if (!text || text.length <= 138) return text || '';
  const norm = normalizeSearchText(text);
  const posList = terms.map((t) => norm.indexOf(t)).filter((p) => p >= 0);
  const pos = posList.length ? Math.min(...posList) : 0;
  const ratio = norm.length ? pos / norm.length : 0;
  const start = Math.max(0, Math.min(text.length - 138, Math.round(text.length * ratio) - 46));
  const prefix = start > 0 ? '…' : '';
  const suffix = start + 138 < text.length ? '…' : '';
  return `${prefix}${text.slice(start, start + 138).trim()}${suffix}`;
}

/** Searches a prebuilt lesson index with term matching and weighted field scoring. */
export function searchIndex(
  index: readonly SearchIndexEntry[] | null | undefined,
  query: string,
  limit = 40
): SearchHit[] {
  const normQ = normalizeSearchQuery(query);
  if (!normQ) return [];
  const terms = Array.from(new Set(normQ.split(' ').filter(Boolean)));
  if (!terms.length) return [];

  const out: SearchHit[] = [];
  (index ?? []).forEach((entry) => {
    const all = `${entry.normalizedSectionTitle} ${entry.normalizedBlockTitle} ${entry.normalizedText}`;
    if (!terms.every((t) => all.includes(t))) return;

    const direct = `${entry.normalizedBlockTitle} ${entry.normalizedText}`;
    if (entry.blockIndex !== 'title' && !terms.some((t) => direct.includes(t))) return;

    let score =
      (entry.normalizedText.includes(normQ) ? 90 : 0) +
      (entry.normalizedBlockTitle.includes(normQ) ? 125 : 0) +
      (entry.normalizedSectionTitle.includes(normQ) ? 150 : 0) +
      (entry.blockIndex === 'title' ? 20 : 0);

    terms.forEach((t) => {
      if (entry.normalizedText.includes(t)) score += 18;
      if (entry.normalizedBlockTitle.includes(t)) score += 32;
      if (entry.normalizedSectionTitle.includes(t)) score += 42;
      if (entry.normalizedText.indexOf(t) === 0) score += 8;
    });

    out.push({
      ...entry,
      score,
      snippet: makeSnippet(entry.text, terms),
      terms,
    });
  });

  out.sort((a, b) => b.score - a.score || a.order - b.order);
  const cap = typeof limit === 'number' && limit > 0 ? limit : 40;
  return out.slice(0, cap);
}
