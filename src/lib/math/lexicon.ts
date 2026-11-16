/**
 * MathFlow — Bilingual FR/AR math lexicon registry & safe HTML term highlighter.
 * Supports pure SSR/client-safe `createLexiconMatcher(entries)` with accent-insensitive matching.
 */

import { HTML_TAG_SPLIT, escapeHtml } from './shared/texUtils';

export interface LexiconEntry {
  id: string;
  term: string;
  termAr: string;
  aliases: string[];
  category: string;
  definition: string;
  definitionAr: string;
  formula: string;
}

export interface LexiconInputEntry {
  id?: string;
  term?: string;
  termeFr?: string;
  termAr?: string;
  termeAr?: string;
  arabic?: string;
  aliases?: readonly string[];
  variantes?: readonly string[];
  category?: string;
  categorie?: string;
  definition?: string;
  definitionFr?: string;
  content?: string;
  definitionAr?: string;
  dfAr?: string;
  formula?: string;
  symbole?: string;
}

export interface LexiconMatcher {
  highlightHtml: (html: string) => string;
  findEntry: (idOrTerm: string) => LexiconEntry | null;
  getEntries: () => LexiconEntry[];
}

export const BUILTIN_LEXICON: readonly LexiconInputEntry[] = [
  {
    id: 'tvi', term: 'théorème des valeurs intermédiaires', termAr: 'مبرهنة القيم الوسيطية',
    aliases: ['TVI', 'valeurs intermédiaires', 'valeur intermédiaire'], category: 'Analyse',
    definition: 'Si $f$ est continue sur $[a,b]$, toute valeur comprise entre $f(a)$ et $f(b)$ admet au moins un antécédent dans $[a,b]$.',
    definitionAr: 'إذا كانت الدالة $f$ متصلة على $[a,b]$، فإن كل عدد محصور بين $f(a)$ و $f(b)$ يقبل سابقا على الأقل في $[a,b]$.',
    formula: 'f([a,b]) \\supset [\\min(f(a),f(b)),\\,\\max(f(a),f(b))]',
  },
  {
    id: 'limite', term: 'limite', termAr: 'نهاية دالة',
    aliases: ['limites', 'limite finie', 'limite infinie'], category: 'Analyse',
    definition: "Valeur vers laquelle tend $f(x)$ lorsque $x$ s'approche d'un point $x_0$ ou de $\\pm\\infty$.",
    definitionAr: 'القيمة التي تقترب منها $f(x)$ عندما يقترب $x$ من نقطة $x_0$ أو من $\\pm\\infty$.',
    formula: '\\lim_{x \\to x_0} f(x) = \\ell',
  },
  {
    id: 'asymptote', term: 'asymptote', termAr: 'مقارب',
    aliases: ['asymptotes', 'asymptote oblique', 'asymptote horizontale', 'asymptote verticale'], category: 'Géométrie & Analyse',
    definition: "Droite dont la courbe représentative $(C_f)$ se rapproche indéfiniment à l'infini.",
    definitionAr: 'مستقيم يقترب منه المنحنى $(C_f)$ دون أن يلامسه بالضرورة عند اللانهاية.',
    formula: '\\lim_{x \\to +\\infty} \\bigl(f(x)-(ax+b)\\bigr) = 0',
  },
  {
    id: 'bijection', term: 'bijection', termAr: 'تقابل',
    aliases: ['bijective', 'fonction réciproque', 'réciproque'], category: 'Analyse',
    definition: 'Application continue et strictement monotone sur $I$ réalisant une correspondance un-à-un de $I$ sur $f(I)$.',
    definitionAr: 'تطبيق متصل ورتيب قطعا على مجال $I$ يربط كل عنصر من $f(I)$ بعنصر وحيد من $I$.',
    formula: '\\forall y \\in f(I),\\; \\exists !\\, x \\in I,\\; f(x)=y',
  },
  {
    id: 'monotone', term: 'strictement monotone', termAr: 'رتيبة قطعا',
    aliases: ['monotone', 'monotonie'], category: 'Analyse',
    definition: "Fonction qui conserve (croissante) ou inverse (décroissante) strictement l'ordre sur un intervalle $I$.",
    definitionAr: 'دالة تحافظ قطعا على الترتيب (تزايدية قطعا) أو تعكسه قطعا (تناقصية قطعا) على مجال $I$.',
    formula: 'x_1 < x_2 \\implies f(x_1) < f(x_2)',
  },
];

export const LEXIQUE_GROUPS: Readonly<Record<string, readonly LexiconInputEntry[]>> = {
  LEXIQUE_DERIVATION: [
    {
      termeFr: 'dérivable', variantes: ['dérivables', 'dérivabilité', 'nombre dérivé', 'dérivée'],
      termeAr: 'قابلة للاشتقاق', symbole: "f'(x_0)", categorie: 'analyse',
      definitionFr: "Une fonction $f$ est dérivable en $x_0$ si le taux de variation $\\frac{f(x)-f(x_0)}{x-x_0}$ admet une limite finie quand $x \\to x_0$.",
    },
    {
      termeFr: 'tangente', variantes: ['tangentes', 'demi-tangente', 'demi-tangentes'],
      termeAr: 'مماس المنحنى', symbole: "(T) : y = f'(x_0)(x-x_0)+f(x_0)", categorie: 'geometrie',
      definitionFr: "Droite limite passant par $M_0(x_0, f(x_0))$ et de coefficient directeur $f'(x_0)$.",
    },
    {
      id: 'strictement-croissante',
      termeFr: 'strictement croissante', variantes: ['croissante', 'strictement décroissante', 'décroissante'],
      termeAr: 'تزايدية قطعا', symbole: "f'(x) > 0", categorie: 'analyse',
      definitionFr: "Sur un intervalle $I$, si $f'(x) > 0$ (sauf en un nombre fini de points où $f'(x)=0$), alors $f$ est strictement croissante sur $I$.",
    },
    {
      termeFr: "point d'inflexion", variantes: ['inflexion', "points d'inflexion"],
      termeAr: 'نقطة انعطاف', symbole: "f''(a) = 0", categorie: 'geometrie',
      definitionFr: "Point $I(a, f(a))$ où la courbe $(C_f)$ change de concavité (la dérivée seconde $f''$ s'annule en changeant de signe).",
    },
    {
      termeFr: 'convexe', variantes: ['convexité', 'concave', 'concavité'],
      termeAr: 'محدب (أو مقعر)', symbole: "f''(x) \\geq 0", categorie: 'analyse',
      definitionFr: "$f$ est convexe sur $I$ si $f''(x) \\geq 0$ sur $I$ : sa courbe $(C_f)$ est située au-dessus de chacune de ses tangentes.",
    },
    {
      termeFr: 'extremum', variantes: ['extremums', 'extrema', 'minimum', 'maximum'],
      termeAr: 'مطارف الدالة', symbole: "f'(c) = 0", categorie: 'analyse',
      definitionFr: "Valeur maximale ou minimale locale atteinte en un point $c$ où $f'$ s'annule en changeant de signe.",
    },
  ],
  LEXIQUE_CONTINUITE: [
    {
      termeFr: 'continue', variantes: ['continuité', 'continues', 'continu'],
      termeAr: 'متصلة', symbole: '\\lim_{x \\to x_0} f(x) = f(x_0)', categorie: 'analyse',
      definitionFr: 'Une fonction $f$ est continue en $x_0$ si $\\lim_{x \\to x_0} f(x) = f(x_0)$.',
    },
    {
      id: 'tvi',
      termeFr: 'théorème des valeurs intermédiaires', variantes: ['valeurs intermédiaires', 'TVI'],
      termeAr: 'مبرهنة القيم الوسيطية', symbole: 'f(a) \\times f(b) < 0', categorie: 'analyse',
      definitionFr: "Si $f$ est continue sur $[a,b]$ et $f(a)\\cdot f(b) < 0$, alors l'équation $f(x)=0$ admet au moins une solution $\\alpha \\in ]a,b[$.",
    },
    {
      id: 'bijection',
      termeFr: 'bijection', variantes: ['bijective', 'réciproque', 'fonction réciproque'],
      termeAr: 'تقابل (دالة عكسية)', symbole: 'f^{-1} : J \\to I', categorie: 'analyse',
      definitionFr: 'Toute fonction continue et strictement monotone sur un intervalle $I$ réalise une bijection de $I$ sur $J = f(I)$.',
    },
    {
      termeFr: 'dichotomie', variantes: ['encadrement', 'amplitude'],
      termeAr: 'طريقة التفرع الثنائي', symbole: '|b - a| / 2^n', categorie: 'general',
      definitionFr: "Méthode algorithmique consistant à diviser par $2$ à chaque étape la longueur de l'intervalle contenant la racine $\\alpha$.",
    },
  ],
  LEXIQUE_SUITES: [
    {
      termeFr: 'convergente', variantes: ['convergence', 'converge', 'divergente'],
      termeAr: 'متقاربة', symbole: '\\lim_{n \\to +\\infty} u_n = \\ell', categorie: 'analyse',
      definitionFr: 'Une suite $(u_n)$ est convergente si elle admet une limite réelle finie $\\ell \\in \\mathbb{R}$ lorsque $n \\to +\\infty$.',
    },
    {
      termeFr: 'majorée', variantes: ['minorée', 'bornée'],
      termeAr: 'مكبورة (أو مصغورة)', symbole: '\\forall n \\in \\mathbb{N},\\; u_n \\leq M', categorie: 'analyse',
      definitionFr: 'Toute suite croissante et majorée est convergente ; toute suite décroissante et minorée est convergente.',
    },
    {
      termeFr: 'récurrence', variantes: ['raisonnement par récurrence', 'hérédité', 'initialisation'],
      termeAr: 'البرهان بالترجع', symbole: '\\mathcal{P}(n) \\implies \\mathcal{P}(n+1)', categorie: 'logique',
      definitionFr: 'Principe de démonstration en deux étapes : initialisation au premier rang $n_0$ et hérédité de $n$ vers $n+1$.',
    },
  ],
  LEXIQUE_LOGARITHMES: [
    {
      termeFr: 'logarithme népérien', variantes: ['logarithme', 'népérien'],
      termeAr: 'اللوغاريتم النيبيري', symbole: '\\ln(x)', categorie: 'analyse',
      definitionFr: "Primitive sur $]0, +\\infty[$ de la fonction $x \\mapsto \\frac{1}{x}$ qui s'annule en $1$.",
    },
    {
      termeFr: 'domaine de définition', variantes: ['ensemble de définition'],
      termeAr: 'مجموعة التعريف', symbole: 'D_f = \\{x \\in \\mathbb{R} \\mid u(x) > 0\\}', categorie: 'analyse',
      definitionFr: "L'expression $\\ln(u(x))$ est définie si et seulement si $u(x) > 0$ strictement.",
    },
  ],
};

const SKIP_TAG_RE = /^(?:button|a|code|pre|h[1-6]|math|svg|summary|script|style)$/i;
const VOID_TAG_RE =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|path|line|rect|circle|polygon|polyline)$/i;
const ACCENT_FOLD: Readonly<Record<string, string>> = {
  a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]', y: '[yÿ]',
};

interface CompiledMatcher {
  re: RegExp | null;
  map: Map<string, LexiconEntry>;
}

/** Normalizes a term or alias into a diacritic-free lowercase lookup key. */
export function normalizeTermKey(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function readStrField(obj: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

function readStrArray(obj: Record<string, unknown>, keys: readonly string[]): string[] {
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val)) return val.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  return [];
}

function upsertIntoMap(targetMap: Map<string, LexiconEntry>, raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const rec = raw as Record<string, unknown>;
  const term = readStrField(rec, ['term', 'termeFr']);
  if (!term) return false;

  const rawId = readStrField(rec, ['id']);
  const key = normalizeTermKey(rawId || term);
  const prev = targetMap.get(key);
  const aliases = [...(prev?.aliases ?? []), term, ...readStrArray(rec, ['aliases', 'variantes'])]
    .filter((a, i, arr) => a.length >= 2 && arr.indexOf(a) === i);

  targetMap.set(key, {
    id: rawId || prev?.id || key,
    term: prev?.term || term,
    termAr: readStrField(rec, ['termAr', 'termeAr', 'arabic']) || prev?.termAr || '',
    aliases,
    category: prev?.category || readStrField(rec, ['category', 'categorie']) || 'Lexique',
    definition: prev?.definition || readStrField(rec, ['definition', 'definitionFr', 'content']) || '',
    definitionAr: prev?.definitionAr || readStrField(rec, ['definitionAr', 'dfAr']) || '',
    formula: prev?.formula || readStrField(rec, ['formula', 'symbole']) || '',
  });
  return true;
}

function buildAccentPattern(normalizedAlias: string): string {
  let out = '';
  for (let i = 0; i < normalizedAlias.length; i++) {
    const ch = normalizedAlias.charAt(i);
    if (ch === ' ') out += '\\s+';
    else if (ch === "'") out += "['’]";
    else if (ACCENT_FOLD[ch]) out += ACCENT_FOLD[ch];
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

function compileMatcher(entries: Iterable<LexiconEntry>): CompiledMatcher {
  const norms: string[] = [];
  const seen = new Map<string, LexiconEntry>();
  for (const entry of entries) {
    for (const al of entry.aliases) {
      const norm = normalizeTermKey(al);
      if (norm.length >= 2 && !/^\d+$/.test(norm) && !seen.has(norm)) {
        seen.set(norm, entry);
        norms.push(norm);
      }
    }
  }
  if (!norms.length) return { re: null, map: seen };
  norms.sort((a, b) => b.length - a.length);
  const pat = norms.map(buildAccentPattern).join('|');
  return {
    re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pat})(?![\\p{L}\\p{N}_])`, 'giu'),
    map: seen,
  };
}

function findInMap(source: Map<string, LexiconEntry>, idOrTerm: string): LexiconEntry | null {
  const target = normalizeTermKey(idOrTerm);
  if (!target) return null;
  const direct = source.get(target);
  if (direct) return direct;
  for (const entry of source.values()) {
    if (
      normalizeTermKey(entry.id) === target ||
      normalizeTermKey(entry.term) === target ||
      entry.aliases.some((a) => normalizeTermKey(a) === target)
    ) {
      return entry;
    }
  }
  return null;
}

function isSkipAttrs(attrs: string): boolean {
  if (!attrs) return false;
  if (/\bdata-(?:lexicon-term|blank)\b/i.test(attrs)) return true;
  if (/\baria-hidden(?:\s*=\s*(?:"true"|'true'|true))?(?=[\s>/]|$)/i.test(attrs) && !/\baria-hidden\s*=\s*["']?false/i.test(attrs)) {
    return true;
  }
  const clsM = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  return !!(clsM && /(?:^|\s)(?:blank|math-blank|katex|lx|mathflow-lexicon-term)(?=\s|$)/.test(clsM[1] || clsM[2] || ''));
}

function highlightWithCompiled(html: string, matcher: CompiledMatcher): string {
  const src = String(html ?? '');
  if (!src || !matcher.re) return src;

  const tokens = src.split(HTML_TAG_SPLIT);
  const stack: Array<{ tag: string; skip: boolean }> = [];
  let skipDepth = 0;

  return tokens
    .map((tok, idx) => {
      if (!tok) return '';
      if (idx % 2 === 1) {
        if (tok.slice(0, 4) === '<!--') return tok;
        const closeM = /^<\/([A-Za-z0-9-]+)/.exec(tok);
        if (closeM) {
          const closeTag = closeM[1].toLowerCase();
          while (stack.length) {
            const pop = stack.pop()!;
            if (pop.skip) skipDepth = Math.max(0, skipDepth - 1);
            if (pop.tag === closeTag) break;
          }
          return tok;
        }
        const openM = /^<([A-Za-z0-9-]+)([\s\S]*?)\/?>$/.exec(tok);
        if (openM && tok.slice(-2) !== '/>' && !VOID_TAG_RE.test(openM[1])) {
          const skip = SKIP_TAG_RE.test(openM[1]) || isSkipAttrs(openM[2]);
          stack.push({ tag: openM[1].toLowerCase(), skip });
          if (skip) skipDepth++;
        }
        return tok;
      }
      if (skipDepth > 0) return tok;
      matcher.re!.lastIndex = 0;
      return tok.replace(matcher.re!, (hit, offset: number, full: string) => {
        if (/&[A-Za-z0-9#]*$/.test(full.slice(0, offset)) && /^[A-Za-z0-9#]*;/.test(full.slice(offset))) return hit;
        const entry = matcher.map.get(normalizeTermKey(hit));
        return entry
          ? `<button type="button" class="lx mathflow-lexicon-term" data-lexicon-term="${escapeHtml(entry.id)}" title="${escapeHtml(entry.term)}">${hit}</button>`
          : hit;
      });
    })
    .join('');
}

function seedBuiltinEntries(target: Map<string, LexiconEntry>): void {
  BUILTIN_LEXICON.forEach((item) => upsertIntoMap(target, item));
  Object.values(LEXIQUE_GROUPS).forEach((group) => group.forEach((item) => upsertIntoMap(target, item)));
}

/** Creates an isolated, SSR/hydration-safe lexicon matcher without mutating global state. */
export function createLexiconMatcher(
  extraEntries: readonly LexiconInputEntry[] | readonly unknown[] = [],
): LexiconMatcher {
  const localMap = new Map<string, LexiconEntry>();
  seedBuiltinEntries(localMap);
  for (const item of extraEntries) upsertIntoMap(localMap, item);
  const compiled = compileMatcher(localMap.values());

  return {
    highlightHtml: (html: string) => highlightWithCompiled(html, compiled),
    findEntry: (idOrTerm: string) => findInMap(localMap, idOrTerm),
    getEntries: () => Array.from(localMap.values()),
  };
}

const defaultRegistry = new Map<string, LexiconEntry>();
let defaultCompiled: CompiledMatcher | null = null;
seedBuiltinEntries(defaultRegistry);

function getDefaultCompiled(): CompiledMatcher {
  if (!defaultCompiled) defaultCompiled = compileMatcher(defaultRegistry.values());
  return defaultCompiled;
}

/** Registers chapter or custom lexicon entries into the active in-memory registry (legacy compatibility). */
export function registerLexiconEntries(
  entriesOrNs: readonly LexiconInputEntry[] | readonly unknown[] | string,
  maybeEntries?: readonly LexiconInputEntry[] | readonly unknown[],
): void {
  const list = Array.isArray(entriesOrNs) ? entriesOrNs : Array.isArray(maybeEntries) ? maybeEntries : [];
  let changed = false;
  for (const item of list) {
    if (upsertIntoMap(defaultRegistry, item)) changed = true;
  }
  if (changed) defaultCompiled = null;
}

/** Returns all currently registered lexicon entries from the default registry. */
export function getActiveLexicon(): LexiconEntry[] {
  return Array.from(defaultRegistry.values());
}

/** Finds a lexicon entry by exact id, term, or alias (accent- and case-insensitive). */
export function findLexiconEntry(idOrTerm: string): LexiconEntry | null {
  return findInMap(defaultRegistry, idOrTerm);
}

/** Wraps known mathematical terms in HTML text nodes with interactive lexicon trigger buttons. */
export function highlightLexiconTerms(html: string): string {
  return highlightWithCompiled(html, getDefaultCompiled());
}
