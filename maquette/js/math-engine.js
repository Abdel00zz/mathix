/**
 * MathFlow — Central Student Math Engine (KaTeX, MathML fallback, tkz-tab/array, Blanks, Lexicon & Media)
 * Strictly < 320 lines. Zero Tailwind utility classes. Student session only.
 */
(function initMathEngine(global) {
  'use strict';

  function getSibling(key, rel) {
    if (!global[key] && typeof require === 'function') { try { require(rel); } catch (_) {} }
    return global[key];
  }
  function getMacrosApi() { return getSibling('MathFlowTexMacros', './math/tex-macros.js') || {}; }
  function getFallbackApi() { return getSibling('MathFlowMathMLFallback', './math/mathml-fallback.js'); }
  function getTkzApi() { return getSibling('MathFlowTkz', './math/tkz-tab.js'); }
  function getTkzArrayApi() { return getSibling('MathFlowTkzArray', './math/tkz-array.js'); }
  function getLexApi() { return getSibling('MathFlowLexicon', './math/lexicon.js'); }
  function getMediaApi() { return getSibling('MathFlowMediaLexicon', './math/media-lexicon.js'); }

  function createLru(max) {
    var map = new Map();
    return {
      hits: 0, misses: 0, cache: map,
      get: function (k) { if (!map.has(k)) { this.misses++; return undefined; } var v = map.get(k); map.delete(k); map.set(k, v); this.hits++; return v; },
      set: function (k, v) { if (map.has(k)) map.delete(k); else if (map.size >= max) map.delete(map.keys().next().value); map.set(k, v); },
      clear: function () { map.clear(); }
    };
  }

  var katexLRU = createLru(800), tkzLRU = createLru(150), listenersBound = false, holdSeq = 0;
  var DIRECTIVES = {
    step: 'Étape', method: 'Méthode', conclusion: 'Conclusion', assumption: 'Hypothèse',
    case: 'Cas', calcul: 'Calcul', goal: 'Objectif', remind: 'Rappel',
    hint: 'Indice', answer: 'Réponse', consequence: 'Conséquence', summary: 'Bilan',
    attention: 'Attention', warning: 'Attention', tip: 'Astuce', analyze: 'Analyse', recall: 'Rappel'
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderTexRaw(tex, displayMode) {
    var mApi = getMacrosApi();
    var src = mApi.normalizeMathBlanks ? mApi.normalizeMathBlanks(String(tex == null ? '' : tex)) : String(tex == null ? '' : tex);
    src = (mApi.repairLineBreakBrackets ? mApi.repairLineBreakBrackets(src) : src).trim();
    if (!src) return '';
    var hasKatex = !!(global.katex && typeof global.katex.renderToString === 'function');
    var cacheKey = (displayMode ? 'D:' : 'I:') + src;
    if (hasKatex) {
      var cached = katexLRU.get(cacheKey);
      if (cached !== undefined) return cached;
      try {
        var html = global.katex.renderToString(src, {
          displayMode: !!displayMode, macros: Object.assign({}, mApi.LATEX_MACROS || {}),
          throwOnError: false, strict: false, output: 'htmlAndMathml',
          trust: function (ctx) { return !!ctx && ctx.command === '\\htmlClass'; }
        });
        katexLRU.set(cacheKey, html);
        return html;
      } catch (_) {}
    }
    var fb = getFallbackApi();
    if (fb && typeof fb.texToMathML === 'function') {
      var ml = fb.texToMathML(src, !!displayMode);
      return displayMode ? '<div class="dm">' + ml + '</div>' : ml;
    }
    return '<code class="math-text-code">' + escapeHtml(src) + '</code>';
  }

  function renderTex(tex, displayMode) { return renderTexRaw(tex, displayMode); }

  function isVariationArray(tex) {
    var s = String(tex || '');
    return /\\begin\{array\}/.test(s) && /\\(?:fleupB?|fledownB?|croiss|decroiss|fleconst|nearrow|searrow|dbar|interdit|zero|plus|moins)(?![A-Za-z])|\|\||(?:^|\\\\(?:\[[^\]]*\])?)\s*\$?\s*x\s*\$?\s*&/i.test(s);
  }

  function parseTkzTab(latex) {
    var raw = String(latex == null ? '' : latex).trim();
    if (!raw) return '';
    var hasKatex = !!(global.katex && typeof global.katex.renderToString === 'function');
    if (hasKatex) { var cached = tkzLRU.get(raw); if (cached !== undefined) return cached; }
    var inner = raw.replace(/^\\begin\{tikzpicture\}/, '').replace(/\\end\{tikzpicture\}$/, '').replace(/^\$\$|\$\$$/g, '').replace(/^\\\[|\\\]$/g, '').trim();
    var renderCell = function (expr) { return renderTex(expr, false); };
    var tkz = getTkzApi(), arr = getTkzArrayApi();
    var html = /\\tkzTabInit(?![A-Za-z])/.test(inner) && tkz ? tkz.parseTkzTab(inner, renderCell)
      : /\\begin\{array\}/.test(inner) && arr ? arr.parseArrayTkzTab(inner, renderCell)
      : '<pre class="tkz-fallback">' + escapeHtml(raw) + '</pre>';
    if (hasKatex && html) tkzLRU.set(raw, html);
    return html;
  }

  function bsCount(str, pos) { var bs = 0, b = pos - 1; while (b >= 0 && str.charAt(b) === '\\') { bs++; b--; } return bs; }

  function extractImages(str, mediaApi, opts, hold) {
    if (!mediaApi || str.indexOf('\\image') === -1) return str;
    var out = '', cur = 0, re = /\\image(?![A-Za-z])/g, m;
    while ((m = re.exec(str)) !== null) {
      var optG = null, pos = re.lastIndex;
      while (pos < str.length && /\s/.test(str.charAt(pos))) pos++;
      if (str.charAt(pos) === '[') {
        var mApi = getMacrosApi(), cl = mApi.findBalanced ? mApi.findBalanced(str, pos, '[', ']') : str.indexOf(']', pos + 1);
        if (cl > pos) { optG = str.slice(pos + 1, cl); pos = cl + 1; }
      }
      var srcInfo = mediaApi.readImageCaption ? mediaApi.readImageCaption(str, pos) : { value: '', end: pos };
      if (!srcInfo.value) continue;
      out += str.slice(cur, m.index);
      var cap = mediaApi.readImageCaption ? mediaApi.readImageCaption(str, srcInfo.end) : { value: '', end: srcInfo.end };
      var po = mediaApi.parseImageOptions ? mediaApi.parseImageOptions(optG || '') : {};
      var fig = mediaApi.renderMediaFigure({ src: srcInfo.value.trim(), width: po.width, align: po.align, wrap: po.wrap, caption: cap.value || po.caption || '', alt: po.alt || '' }, opts);
      out += fig ? hold(fig) : '';
      cur = cap.end;
      re.lastIndex = cap.end;
    }
    return out + str.slice(cur);
  }

  function extractDelimMath(str, openSeq, closeSeq, onMatch) {
    if (str.indexOf(openSeq) === -1) return str;
    var out = '', i = 0;
    while (i < str.length) {
      if (str.slice(i, i + openSeq.length) === openSeq && bsCount(str, i) % 2 === 0) {
        var j = i + openSeq.length, found = -1;
        while (j < str.length) {
          if (str.slice(j, j + closeSeq.length) === closeSeq && bsCount(str, j) % 2 === 0) { found = j; break; }
          j++;
        }
        if (found > i + openSeq.length) { out += onMatch(str.slice(i + openSeq.length, found)); i = found + closeSeq.length; continue; }
      }
      out += str.charAt(i++);
    }
    return out;
  }

  function extractStandaloneTkz(str, hold) {
    var tkz = getTkzApi();
    if (!tkz || !tkz.extractBracedArgs || !/\\tkzTabInit(?![A-Za-z])/.test(str)) return str;
    var out = '', rest = str, init;
    while ((init = tkz.extractBracedArgs(rest, 'tkzTabInit', 2))) {
      out += rest.slice(0, init.index);
      var endPos = init.end;
      while (endPos < rest.length) {
        var tail = rest.slice(endPos);
        var nm = /^\s*\\(tkzTabLine|tkzTabVar|tkzTabVal|tkzTabImaFrom|tkzTabIma)(?![A-Za-z])/.exec(tail);
        if (!nm) break;
        var cnt = nm[1] === 'tkzTabVal' ? 5 : (nm[1].indexOf('Ima') >= 0 ? 4 : 1);
        var argRes = tkz.extractBracedArgs(tail, nm[1], cnt);
        if (!argRes) break;
        endPos += argRes.end;
      }
      out += hold(parseTkzTab(rest.slice(init.index, endPos)));
      rest = rest.slice(endPos);
    }
    return out + rest;
  }

  function renderMathInHtml(content, options) {
    if (content == null || content === '') return '';
    var opts = options || {}, mApi = getMacrosApi(), mediaApi = getMediaApi(), lexApi = getLexApi();
    var appCfg = global.MathFlowApp && typeof global.MathFlowApp.getSettings === 'function' ? global.MathFlowApp.getSettings() : null;
    var enableLexicon = opts.enableLexicon !== false && (!appCfg || appCfg.lexiconAutoHighlight !== false);
    var held = [], holdTag = (++holdSeq).toString(36).toUpperCase();
    function hold(html) { var id = '@@MF_HOLD_' + holdTag + '_' + held.length + '@@'; held.push(html); return id; }
    function renderSub(sub) { return renderMathInHtml(sub, { enableLexicon: false, basePath: opts.basePath }); }
    function renderDisp(inner) {
      var math = inner.trim();
      return hold((/\\tkzTabInit(?![A-Za-z])/.test(math) || /\\begin\{tikzpicture\}/.test(math) || isVariationArray(math)) ? parseTkzTab(math) : renderTex(math, true));
    }

    function extractInlineDollar(str) {
      var out = '', i = 0;
      while (i < str.length) {
        if (str.charAt(i) === '$' && bsCount(str, i) % 2 === 0 && str.charAt(i + 1) !== '$') {
          var j = i + 1, found = -1;
          while (j < str.length) {
            if (str.charAt(j) === '$' && str.charAt(j + 1) !== '$' && bsCount(str, j) % 2 === 0) { found = j; break; }
            if (str.charAt(j) === '\n' && str.charAt(j + 1) === '\n') break;
            j++;
          }
          if (found > i + 1) { out += hold(renderTex(str.slice(i + 1, found), false)); i = found + 1; continue; }
        }
        out += str.charAt(i++);
      }
      return out;
    }

    var s = extractImages(String(content).replace(/\r\n?/g, '\n'), mediaApi, opts, hold);
    s = extractDelimMath(s, '$$', '$$', renderDisp);
    s = extractDelimMath(s, '\\[', '\\]', renderDisp);
    s = s.replace(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/g, function (_, inner) { return hold(parseTkzTab(inner)); });
    s = extractDelimMath(s, '\\(', '\\)', function (inner) { return hold(renderTex(inner, false)); });
    s = extractInlineDollar(s);
    s = s.replace(/(?:\\def\\arraystretch\{[^}]*\}\s*)?\\begin\{(array|cases|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|align\*?|equation\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}/g, function (full, env) {
      return hold(env === 'array' && isVariationArray(full) ? parseTkzTab(full) : renderTex(full, true));
    });
    s = extractStandaloneTkz(s, hold);
    var bareMathRe = /\\(?:iff|implies|Leftrightarrow|Rightarrow|Leftarrow|longrightarrow|mapsto|equiv|leq|geq|neq|approx|frac|dfrac|sqrt|lim|int|sum|prod|mathbb|infty|cdot|setminus|cup|cap|notin)(?![A-Za-z])/;
    var proseSkipRe = /^\\(?:method|step|conclusion|tip|hint|calcul|case|assumption|answer|goal|remind|consequence|summary|attention|warning|analyze|recall|savant|history|objective|objectif|motivation|challenge|question|qst|mathqst|encadre|encadrevert|encadrerouge|boxed|result|hl|highlight|underline|textbf|textit|emph|textsc|texttt|textcolor|red|blue|green|orange|purple|pink|teal|blank|blanck|balck|item|itemsize|col|column|def|defi)(?![A-Za-z])/;
    s = s.split('\n').map(function (line) {
      var t = line.trim();
      if (!t || /[\$<]|@@MF_|\\(?:begin|end|tkzTab|image)|^\s*[-•*#]/.test(t) || proseSkipRe.test(t) || !bareMathRe.test(t)) return line;
      var stripped = t.replace(/\\[a-zA-Z]+/g, ' ').replace(/\b(?:true|false|and|with|for)\b/gi, ' ');
      return /[a-zA-Zàâäéèêëïîôöùûüç]{4,}/.test(stripped) ? line : hold(renderTex(t, true));
    }).join('\n');

    if (mApi.findBalanced && s.indexOf('\\savant') !== -1) {
      var savRe = /\\savant(?![A-Za-z])(?:\[([^\]]*)\])?\s*\{/g, sOut = '', sCur = 0, sm;
      while ((sm = savRe.exec(s)) !== null) {
        var eN = mApi.findBalanced(s, savRe.lastIndex - 1, '{', '}');
        if (eN < 0) continue;
        var p2 = eN + 1;
        while (p2 < s.length && /\s/.test(s.charAt(p2))) p2++;
        if (s.charAt(p2) !== '{') continue;
        var eB = mApi.findBalanced(s, p2, '{', '}');
        if (eB < 0) continue;
        sOut += s.slice(sCur, sm.index);
        var dM = sm[1] ? /dates\s*=\s*([^,\]]+)/.exec(sm[1]) : null;
        sOut += hold('<aside class="math-savant math-savant-card"><strong>' + escapeHtml(s.slice(savRe.lastIndex, eN)) + '</strong>' +
          (dM ? ' <span class="mf-badge mf-badge-amber">' + escapeHtml(dM[1].trim()) + '</span>' : '') + '<div>' + renderSub(s.slice(p2 + 1, eB)) + '</div></aside>');
        sCur = eB + 1; savRe.lastIndex = sCur;
      }
      s = sOut + s.slice(sCur);
    }
    if (mApi.findBalanced) {
      var pedRe = /\\(history|objective|motivation|challenge)(?![A-Za-z])\s*\{/g, pOut = '', pCur = 0, pm;
      while ((pm = pedRe.exec(s)) !== null) {
        var eP = mApi.findBalanced(s, pedRe.lastIndex - 1, '{', '}');
        if (eP < 0) continue;
        pOut += s.slice(pCur, pm.index);
        var kind = pm[1], lbl = kind === 'history' ? 'Histoire' : kind === 'objective' ? 'Objectif' : kind === 'motivation' ? 'Pourquoi ce chapitre ?' : 'Défi';
        var cls = kind === 'objective' ? 'math-objective' : kind === 'history' ? 'math-history-note math-savant-card' : 'math-' + kind + ' math-question';
        pOut += hold('<aside class="' + cls + '"><span class="mf-badge">' + lbl + '</span><div>' + renderSub(s.slice(pedRe.lastIndex, eP)) + '</div></aside>');
        pCur = eP + 1; pedRe.lastIndex = pCur;
      }
      s = pOut + s.slice(pCur);
    }

    s = s.split('\n').map(function (line) {
      var m = /^\s*\\(step|method|conclusion|assumption|case|calcul|goal|remind|hint|answer|consequence|summary|attention|warning|tip|analyze|recall)(?![A-Za-z])(?:\{([^{}]*)\})?[ \t]*(.*)$/.exec(line);
      if (!m || (!m[3] && (m[1] === 'method' || m[1] === 'tip' || m[1] === 'conclusion'))) return line;
      var cmd = m[1], mod = cmd === 'warning' ? 'attention' : cmd, bodyText = m[2] && m[3] ? m[2] + ' — ' + m[3] : (m[2] || m[3] || '');
      return hold('<div class="math-command-line"><span class="math-command-label math-command-label--' + mod + '">' + escapeHtml(DIRECTIVES[cmd] || cmd) + '</span><span class="math-command-body">' + renderSub(bodyText) + '</span></div>');
    }).join('\n');

    if (mApi.applyProseMacros) s = mApi.applyProseMacros(s, renderSub);
    s = s.split('\n').map(function (line) {
      var t = line.trim();
      return /^[-•]\s+/.test(t) ? '<div class="math-list-item"><span class="math-list-marker math-list-marker-unordered">&#8226;</span><div class="math-list-text">' + t.replace(/^[-•]\s+/, '') + '</div></div>' : line;
    }).join('\n').replace(/\n{2,}/g, '<br class="math-linebreak" />');

    var unholdRe = new RegExp('@@MF_HOLD_' + holdTag + '_(\\d+)@@', 'g');
    for (var pass = 0; pass < 6; pass++) {
      var next = s.replace(unholdRe, function (_, idx) { return held[Number(idx)] || ''; });
      if (next === s) break;
      s = next;
    }
    if (!enableLexicon) return s;
    if (opts.lexicon) return Array.isArray(opts.lexicon) && lexApi && lexApi.createLexiconMatcher ? lexApi.createLexiconMatcher(opts.lexicon).highlightHtml(s) : (opts.lexicon.highlightHtml ? opts.lexicon.highlightHtml(s) : s);
    return lexApi && typeof lexApi.highlightLexiconTerms === 'function' ? lexApi.highlightLexiconTerms(s) : s;
  }

  function toggleBlankElement(el) {
    if (!el || !el.classList) return false;
    var isOn = el.classList.toggle('on');
    el.classList.toggle('revealed', isOn);
    el.setAttribute('aria-expanded', isOn ? 'true' : 'false');
    return isOn;
  }

  function bindGlobalListeners() {
    var doc = global.document;
    if (listenersBound || !doc || typeof doc.addEventListener !== 'function') return;
    listenersBound = true;
    doc.addEventListener('click', function (ev) {
      var target = ev.target && ev.target.nodeType === 1 ? ev.target : (ev.target && ev.target.parentElement);
      if (!target || !target.closest) return;
      var mLex = getMediaApi(), blankEl = target.closest('.blank, .math-blank');
      if (blankEl) { toggleBlankElement(blankEl); return; }
      if (target.closest('.mf-lexicon-lang-toggle') && mLex) { mLex.togglePopoverLanguage(); return; }
      if (target.closest('#mf-lexicon-popover .lx-x') && mLex) { mLex.closeLexiconPopover(); return; }
      var lexTrigger = target.closest('[data-lexicon-term], .lx, .mathflow-lexicon-term');
      if (lexTrigger && mLex) { mLex.showLexiconPopover(lexTrigger.getAttribute('data-lexicon-term') || lexTrigger.textContent, lexTrigger); return; }
      var zoomEl = target.closest('[data-media-zoom]');
      if (zoomEl && mLex) { mLex.openMediaLightbox(zoomEl.getAttribute('data-media-src') || '', zoomEl.getAttribute('data-media-alt') || '', zoomEl.getAttribute('data-media-caption') || ''); return; }
      if (target.closest('[data-lightbox-close]') && mLex) { mLex.closeMediaLightbox(); return; }
      if (mLex && !target.closest('#mf-lexicon-popover')) mLex.closeLexiconPopover();
    });
    doc.addEventListener('keydown', function (ev) {
      var mLex = getMediaApi();
      if (ev.key === 'Escape' && mLex) { mLex.closeLexiconPopover(); mLex.closeMediaLightbox(); return; }
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var target = ev.target && ev.target.nodeType === 1 ? ev.target : null;
      if (!target || target.tagName === 'BUTTON' || !target.closest) return;
      var blankEl = target.closest('.math-blank, [data-blank="true"]');
      if (blankEl && blankEl.tagName !== 'BUTTON') { ev.preventDefault(); toggleBlankElement(blankEl); return; }
      var zoomEl = target.closest('[data-media-zoom]');
      if (zoomEl && mLex) { ev.preventDefault(); mLex.openMediaLightbox(zoomEl.getAttribute('data-media-src') || '', zoomEl.getAttribute('data-media-alt') || '', zoomEl.getAttribute('data-media-caption') || ''); }
    });
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('scroll', function () { var m = getMediaApi(); if (m) m.repositionLexiconPopover(); }, { passive: true, capture: true });
      global.addEventListener('resize', function () { var m = getMediaApi(); if (m) m.repositionLexiconPopover(); }, { passive: true });
    }
  }

  if (typeof global.window !== 'undefined') bindGlobalListeners();

  var MathEngine = {
    LATEX_MACROS: getMacrosApi().LATEX_MACROS || {},
    escapeHtml: escapeHtml, renderTex: renderTex, renderTexRaw: renderTexRaw,
    renderMathInHtml: renderMathInHtml, parseMathAndFormat: renderMathInHtml, parseTkzTab: parseTkzTab,
    renderWithMedia: function (h, m, o) { var a = getMediaApi(); return a ? a.renderWithMedia(h, m, o) : h; },
    renderMediaFigure: function (m, o) { var a = getMediaApi(); return a ? a.renderMediaFigure(m, o) : ''; },
    resolveMediaUrl: function (s, b) { var a = getMediaApi(); return a ? a.resolveMediaUrl(s, b) : (s || ''); },
    registerLexiconEntries: function () { var l = getLexApi(); if (l) l.registerLexiconEntries.apply(null, arguments); },
    createLexiconMatcher: function (e) { var l = getLexApi(); return l && l.createLexiconMatcher ? l.createLexiconMatcher(e) : null; },
    findLexiconEntry: function (id) { var l = getLexApi(); return l ? l.findLexiconEntry(id) : null; },
    highlightLexiconTerms: function (h, o) { var l = getLexApi(); return l ? l.highlightLexiconTerms(h, o) : h; },
    closeLexiconPopover: function () { var m = getMediaApi(); if (m) m.closeLexiconPopover(); },
    bindGlobalListeners: bindGlobalListeners,
    clearMathCaches: function () { katexLRU.clear(); tkzLRU.clear(); },
    getKatexMetrics: function () {
      return { katexHits: katexLRU.hits, katexMisses: katexLRU.misses, katexSize: katexLRU.cache.size, tkzHits: tkzLRU.hits, tkzMisses: tkzLRU.misses, tkzSize: tkzLRU.cache.size };
    }
  };
  global.MathEngine = MathEngine;
  if (typeof module === 'object' && module.exports) module.exports = MathEngine;
})(typeof window !== 'undefined' ? window : globalThis);
