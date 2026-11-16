/**
 * MathFlow — Bilingual FR/AR math lexicon registry & safe HTML term highlighter (< 200 lines)
 * Strictly skips interactive/math/heading elements and supports aliases >= 2 chars (e.g. TVI).
 */
(function initLexicon(global) {
  'use strict';

  var BUILTIN_LEXICON = [
    {
      id: 'tvi', term: 'théorème des valeurs intermédiaires', termAr: 'مبرهنة القيم الوسيطية',
      aliases: ['TVI', 'valeurs intermédiaires', 'valeur intermédiaire'], category: 'Analyse',
      definition: "Si $f$ est continue sur $[a,b]$, toute valeur comprise entre $f(a)$ et $f(b)$ admet au moins un antécédent dans $[a,b]$.",
      definitionAr: 'إذا كانت الدالة $f$ متصلة على $[a,b]$، فإن كل عدد محصور بين $f(a)$ و $f(b)$ يقبل سابقا على الأقل في $[a,b]$.',
      formula: 'f([a,b]) \\supset [\\min(f(a),f(b)),\\,\\max(f(a),f(b))]'
    },
    {
      id: 'limite', term: 'limite', termAr: 'نهاية دالة',
      aliases: ['limites', 'limite finie', 'limite infinie'], category: 'Analyse',
      definition: "Valeur vers laquelle tend $f(x)$ lorsque $x$ s'approche d'un point $x_0$ ou de $\\pm\\infty$.",
      definitionAr: 'القيمة التي تقترب منها $f(x)$ عندما يقترب $x$ من نقطة $x_0$ أو من $\\pm\\infty$.',
      formula: '\\lim_{x \\to x_0} f(x) = \\ell'
    },
    {
      id: 'asymptote', term: 'asymptote', termAr: 'مقارب',
      aliases: ['asymptotes', 'asymptote oblique', 'asymptote horizontale', 'asymptote verticale'], category: 'Géométrie & Analyse',
      definition: "Droite dont la courbe représentative $(C_f)$ se rapproche indéfiniment à l'infini.",
      definitionAr: 'مستقيم يقترب منه المنحنى $(C_f)$ دون أن يلامسه بالضرورة عند اللانهاية.',
      formula: '\\lim_{x \\to +\\infty} \\bigl(f(x)-(ax+b)\\bigr) = 0'
    },
    {
      id: 'bijection', term: 'bijection', termAr: 'تقابل',
      aliases: ['bijective', 'fonction réciproque', 'réciproque'], category: 'Analyse',
      definition: "Application continue et strictement monotone sur $I$ réalisant une correspondance un-à-un de $I$ sur $f(I)$.",
      definitionAr: 'تطبيق متصل ورتيب قطعا على مجال $I$ يربط كل عنصر من $f(I)$ بعنصر وحيد من $I$.',
      formula: '\\forall y \\in f(I),\\; \\exists !\\, x \\in I,\\; f(x)=y'
    },
    {
      id: 'monotone', term: 'strictement monotone', termAr: 'رتيبة قطعا',
      aliases: ['monotone', 'strictement croissante', 'strictement décroissante'], category: 'Analyse',
      definition: "Fonction qui conserve (croissante) ou inverse (décroissante) strictement l'ordre sur un intervalle $I$.",
      definitionAr: 'دالة تحافظ قطعا على الترتيب (تزايدية قطعا) أو تعكسه قطعا (تناقصية قطعا) على مجال $I$.',
      formula: 'x_1 < x_2 \\implies f(x_1) < f(x_2)'
    }
  ];

  var SKIP_TAG_RE = /^(?:button|a|code|pre|h[1-6]|math|svg|summary|script|style)$/i;
  var VOID_TAG_RE = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|path|line|rect|circle|polygon|polyline)$/i;
  var HTML_TAG_SPLIT = /(<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>)/g;
  var ACCENT_FOLD = { a: '[aàâä]', e: '[eéèêë]', i: '[iîï]', o: '[oôö]', u: '[uùûü]', c: '[cç]', y: '[yÿ]' };
  var registry = Object.create(null), importedGroups = Object.create(null), compiledCache = null;

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeTermKey(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  }

  function upsertInto(map, raw) {
    if (!raw || typeof raw !== 'object') return false;
    var term = String(raw.term || raw.termeFr || '').trim();
    if (!term) return false;
    var key = normalizeTermKey(raw.id || term), prev = map[key] || {};
    var aliases = [].concat(prev.aliases || [], [term], raw.aliases || raw.variantes || [])
      .map(function (a) { return String(a || '').trim(); })
      .filter(function (a, i, arr) { return a.length >= 2 && arr.indexOf(a) === i; });
    map[key] = {
      id: raw.id || prev.id || key, term: prev.term || term,
      termAr: String(raw.termAr || raw.termeAr || raw.arabic || prev.termAr || '').trim(), aliases: aliases,
      category: prev.category || String(raw.category || raw.categorie || 'Lexique').trim(),
      definition: prev.definition || String(raw.definition || raw.definitionFr || raw.content || '').trim(),
      definitionAr: prev.definitionAr || String(raw.definitionAr || raw.dfAr || '').trim(),
      formula: prev.formula || String(raw.formula || raw.symbole || '').trim()
    };
    return true;
  }

  function upsertEntry(raw) {
    if (upsertInto(registry, raw)) compiledCache = null;
  }

  function ensureDataPartsRegistered() {
    var parts = global.MATHFLOW_DATA_PARTS && global.MATHFLOW_DATA_PARTS.lexiques;
    if (!parts || typeof parts !== 'object') return;
    Object.keys(parts).forEach(function (k) {
      if (!importedGroups[k] && Array.isArray(parts[k])) { importedGroups[k] = true; parts[k].forEach(upsertEntry); }
    });
  }

  function registerLexiconEntries(entriesOrNs, maybeEntries) {
    var list = Array.isArray(entriesOrNs) ? entriesOrNs : (Array.isArray(maybeEntries) ? maybeEntries : []);
    list.forEach(upsertEntry);
  }

  function getActiveLexicon() {
    ensureDataPartsRegistered();
    return Object.keys(registry).map(function (k) { return registry[k]; });
  }

  function findInMap(map, idOrTerm) {
    var target = normalizeTermKey(idOrTerm);
    if (!target) return null;
    if (map[target]) return map[target];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var e = map[keys[i]];
      if (normalizeTermKey(e.id) === target || normalizeTermKey(e.term) === target || e.aliases.some(function (a) { return normalizeTermKey(a) === target; })) return e;
    }
    return null;
  }

  function findLexiconEntry(idOrTerm) {
    ensureDataPartsRegistered();
    return findInMap(registry, idOrTerm);
  }

  function buildAccentPattern(norm) {
    var out = '';
    for (var i = 0; i < norm.length; i++) {
      var ch = norm.charAt(i);
      if (ch === ' ') out += '\\s+';
      else if (ch === "'") out += "['’]";
      else if (ACCENT_FOLD[ch]) out += ACCENT_FOLD[ch];
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return out;
  }

  function compileMap(map) {
    var norms = [], seen = Object.create(null);
    Object.keys(map).forEach(function (k) {
      map[k].aliases.forEach(function (al) {
        var norm = normalizeTermKey(al);
        if (norm.length >= 2 && !/^\d+$/.test(norm) && !seen[norm]) { seen[norm] = map[k]; norms.push(norm); }
      });
    });
    if (!norms.length) return { re: null, map: seen };
    norms.sort(function (a, b) { return b.length - a.length; });
    var pat = norms.map(buildAccentPattern).join('|');
    return { re: new RegExp('(?<![\\p{L}\\p{N}_])(?:' + pat + ')(?![\\p{L}\\p{N}_])', 'giu'), map: seen };
  }

  function getCompiledMatcher() {
    ensureDataPartsRegistered();
    return compiledCache || (compiledCache = compileMap(registry));
  }

  function isSkipAttrs(attrs) {
    if (!attrs) return false;
    if (/\bdata-(?:lexicon-term|blank)\b/i.test(attrs)) return true;
    if (/\baria-hidden(?:\s*=\s*(?:"true"|'true'|true))?(?=[\s>\/]|$)/i.test(attrs) && !/\baria-hidden\s*=\s*["']?false/i.test(attrs)) return true;
    var clsM = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    return !!(clsM && /(?:^|\s)(?:blank|math-blank|katex|lx|mathflow-lexicon-term)(?=\s|$)/.test(clsM[1] || clsM[2] || ''));
  }

  function highlightWith(html, matcher) {
    var src = String(html == null ? '' : html);
    if (!src || !matcher.re) return src;
    var tokens = src.split(HTML_TAG_SPLIT), stack = [], skipDepth = 0;
    return tokens.map(function (tok, idx) {
      if (!tok) return '';
      if (idx % 2 === 1) {
        if (tok.slice(0, 4) === '<!--') return tok;
        var closeM = /^<\/([A-Za-z0-9-]+)/.exec(tok);
        if (closeM) {
          var closeTag = closeM[1].toLowerCase();
          while (stack.length) {
            var pop = stack.pop();
            if (pop.skip) skipDepth = Math.max(0, skipDepth - 1);
            if (pop.tag === closeTag) break;
          }
          return tok;
        }
        var openM = /^<([A-Za-z0-9-]+)([\s\S]*?)\/?>$/.exec(tok);
        if (openM && tok.slice(-2) !== '/>' && !VOID_TAG_RE.test(openM[1])) {
          var skip = SKIP_TAG_RE.test(openM[1]) || isSkipAttrs(openM[2]);
          stack.push({ tag: openM[1].toLowerCase(), skip: skip });
          if (skip) skipDepth++;
        }
        return tok;
      }
      if (skipDepth > 0) return tok;
      matcher.re.lastIndex = 0;
      return tok.replace(matcher.re, function (hit, offset, full) {
        if (/&[A-Za-z0-9#]*$/.test(full.slice(0, offset)) && /^[A-Za-z0-9#]*;/.test(full.slice(offset))) return hit;
        var entry = matcher.map[normalizeTermKey(hit)];
        return entry ? '<button type="button" class="lx mathflow-lexicon-term" data-lexicon-term="' + escAttr(entry.id) + '" title="' + escAttr(entry.term) + '">' + hit + '</button>' : hit;
      });
    }).join('');
  }

  function highlightLexiconTerms(html) { return highlightWith(html, getCompiledMatcher()); }

  function createLexiconMatcher(extraEntries) {
    var local = Object.create(null);
    BUILTIN_LEXICON.forEach(function (e) { upsertInto(local, e); });
    var parts = global.MATHFLOW_DATA_PARTS && global.MATHFLOW_DATA_PARTS.lexiques;
    if (parts && typeof parts === 'object') Object.keys(parts).forEach(function (k) { if (Array.isArray(parts[k])) parts[k].forEach(function (e) { upsertInto(local, e); }); });
    if (Array.isArray(extraEntries)) extraEntries.forEach(function (e) { upsertInto(local, e); });
    var compiled = compileMap(local);
    return {
      highlightHtml: function (html) { return highlightWith(html, compiled); },
      findEntry: function (idOrTerm) { return findInMap(local, idOrTerm); },
      getEntries: function () { return Object.keys(local).map(function (k) { return local[k]; }); }
    };
  }

  BUILTIN_LEXICON.forEach(upsertEntry);
  ensureDataPartsRegistered();
  global.MathFlowLexicon = {
    BUILTIN_LEXICON: BUILTIN_LEXICON, registerLexiconEntries: registerLexiconEntries,
    findLexiconEntry: findLexiconEntry, highlightLexiconTerms: highlightLexiconTerms,
    getActiveLexicon: getActiveLexicon, normalizeTermKey: normalizeTermKey,
    createLexiconMatcher: createLexiconMatcher
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowLexicon;
})(typeof window !== 'undefined' ? window : globalThis);
