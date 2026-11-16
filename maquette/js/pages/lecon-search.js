/**
 * MathFlow — Indexation, Recherche plein-texte, Scroll-Spy & Reprise de lecture
 */
(function (global) {
  'use strict';

  var LATEX_WORDS = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta', lambda: 'lambda', mu: 'mu',
    pi: 'pi', rho: 'rho', sigma: 'sigma', omega: 'omega', infty: 'infini', times: 'fois', cdot: 'fois',
    div: 'divise', pm: 'plus moins', leq: 'inferieur egal', le: 'inferieur egal', geq: 'superieur egal',
    ge: 'superieur egal', neq: 'different', approx: 'environ', implies: 'implique', iff: 'equivaut',
    forall: 'pour tout', exists: 'il existe', Re: 'partie reelle', Im: 'partie imaginaire', arg: 'argument',
    sin: 'sin', cos: 'cos', tan: 'tan', ln: 'ln', log: 'log', exp: 'exp'
  };
  var GREEK = {
    'α': ' alpha ', 'β': ' beta ', 'γ': ' gamma ', 'δ': ' delta ', 'θ': ' theta ', 'λ': ' lambda ',
    'μ': ' mu ', 'π': ' pi ', 'ρ': ' rho ', 'σ': ' sigma ', 'ω': ' omega ',
    'Α': ' alpha ', 'Β': ' beta ', 'Γ': ' gamma ', 'Δ': ' delta ', 'Θ': ' theta ', 'Λ': ' lambda ',
    'Μ': ' mu ', 'Π': ' pi ', 'Ρ': ' rho ', 'Σ': ' sigma ', 'Ω': ' omega '
  };
  var WRAPPER_RE = /\\(?:text|textbf|textit|mathrm|mathbf|mathbb|mathcal|operatorname|objectif|defi|savant|mathqst|qst|question|itemsize|boxed|underline|overline|vec|blank|emph)\s*\{([^{}]*)\}/g;

  function expandGreek(v) {
    return String(v || '').replace(/[αβγδθλμπρσωΑΒΓΔΘΛΜΠΡΣΩ]/g, function (s) { return GREEK[s] || s; });
  }
  function normalizeSearchText(value) {
    return expandGreek(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr-FR').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function contentToPlainText(value) {
    var text = expandGreek(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/\[\[([\s\S]*?)\]\]/g, '$1').replace(/\^\^([\s\S]*?)\^\^|==([\s\S]*?)==|\+\+([\s\S]*?)\+\+/g, '$1$2$3')
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 sur $2')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'racine de $1').replace(/\\(?:begin|end)\s*\{[^{}]+\}/g, ' ');
    for (var pass = 0; pass < 3; pass++) text = text.replace(WRAPPER_RE, '$1');
    return text.replace(/\\(?:left|right|displaystyle|textstyle|quad|qquad|,|;|!)/g, ' ')
      .replace(/\\([A-Za-z]+)\b/g, function (_m, cmd) { return LATEX_WORDS[cmd] || ' '; })
      .replace(/\\[()[\]]/g, ' ').replace(/[\\$*_`#~^{}|]/g, ' ')
      .replace(/&(?:nbsp|ensp|emsp);/gi, ' ').replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ').trim().replace(/\s+([,.;:!?])/g, '$1');
  }
  function normalizeSearchQuery(value) { return normalizeSearchText(contentToPlainText(value)); }
  function splitIntoParagraphs(value) {
    var parts = String(value || '').replace(/<br\s*\/?>/gi, '\n')
      .split(/(?:\r?\n\s*\r?\n|\\par\b|\r?\n(?=\s*[-•]))/g).map(contentToPlainText).filter(Boolean);
    if (parts.length) return parts;
    var single = contentToPlainText(value);
    return single ? [single] : [];
  }

  function buildSearchIndex(sections) {
    var entries = [], order = 0;
    function pushEntry(secId, secTitle, blockId, blockIndex, blockTitle, text, pIdx) {
      entries.push({
        id: blockId + ':' + pIdx, sectionId: secId, blockId: blockId, blockIndex: blockIndex,
        sectionTitle: contentToPlainText(secTitle), blockTitle: blockTitle ? contentToPlainText(blockTitle) : '',
        text: text, normalizedText: normalizeSearchText(text),
        normalizedSectionTitle: normalizeSearchText(secTitle), normalizedBlockTitle: normalizeSearchText(blockTitle || ''), order: order++
      });
    }
    function indexContainer(secId, secTitle, node, prefix, fallbackId, bTitle) {
      if (node.blocks && node.blocks.length) {
        node.blocks.forEach(function (blk, bIdx) {
          if (!blk) return;
          var bt = blk.title ? String(blk.title).trim() : '', paras = [];
          (Array.isArray(blk.content) ? blk.content : [blk.content || '']).forEach(function (v) { paras = paras.concat(splitIntoParagraphs(v)); });
          if (bt && !paras.length) paras.push(contentToPlainText(bt));
          paras.forEach(function (p, pIdx) { pushEntry(secId, secTitle, prefix + '-' + bIdx, bIdx, bt, p, pIdx); });
        });
      } else if (node.content && String(node.content).trim()) {
        splitIntoParagraphs(node.content).forEach(function (p, pIdx) { pushEntry(secId, secTitle, fallbackId, 'content', bTitle || '', p, pIdx); });
      }
    }
    (Array.isArray(sections) ? sections : []).forEach(function (sec, sIdx) {
      if (!sec) return;
      var secId = String(sec.id != null ? sec.id : 'sec-' + sIdx), secTitle = sec.title || '', plain = contentToPlainText(secTitle);
      if (plain) pushEntry(secId, secTitle, 'les-' + secId, 'title', '', plain, 0);
      indexContainer(secId, secTitle, sec, 'revision-block-' + secId, 'revision-block-' + secId + '-content', '');
      (sec.subsections || []).forEach(function (sub, subIdx) {
        if (!sub) return;
        var subId = 'les-' + secId + '-sub-' + subIdx;
        if (sub.title) pushEntry(secId, secTitle, subId, 'sub', sub.title, contentToPlainText(sub.title), 0);
        indexContainer(secId, secTitle, sub, 'revision-block-' + secId + '-sub-' + subIdx, subId, sub.title || '');
      });
    });
    return entries;
  }

  function makeSnippet(text, terms) {
    if (!text || text.length <= 138) return text || '';
    var norm = normalizeSearchText(text);
    var posList = (terms || []).map(function (t) { return norm.indexOf(t); }).filter(function (p) { return p >= 0; });
    var pos = posList.length ? Math.min.apply(null, posList) : 0;
    var start = Math.max(0, Math.min(text.length - 138, Math.round(text.length * (norm.length ? pos / norm.length : 0)) - 46));
    return (start > 0 ? '…' : '') + text.slice(start, start + 138).trim() + (start + 138 < text.length ? '…' : '');
  }

  function searchIndex(index, query, limit) {
    var normQ = normalizeSearchQuery(query);
    if (!normQ) return [];
    var terms = Array.from(new Set(normQ.split(' ').filter(Boolean)));
    if (!terms.length) return [];
    var out = [];
    (index || []).forEach(function (e) {
      var all = e.normalizedSectionTitle + ' ' + e.normalizedBlockTitle + ' ' + e.normalizedText;
      if (!terms.every(function (t) { return all.indexOf(t) !== -1; })) return;
      var direct = e.normalizedBlockTitle + ' ' + e.normalizedText;
      if (e.blockIndex !== 'title' && !terms.some(function (t) { return direct.indexOf(t) !== -1; })) return;
      var score = (e.normalizedText.indexOf(normQ) !== -1 ? 90 : 0) + (e.normalizedBlockTitle.indexOf(normQ) !== -1 ? 125 : 0)
        + (e.normalizedSectionTitle.indexOf(normQ) !== -1 ? 150 : 0) + (e.blockIndex === 'title' ? 20 : 0);
      terms.forEach(function (t) {
        if (e.normalizedText.indexOf(t) !== -1) score += 18;
        if (e.normalizedBlockTitle.indexOf(t) !== -1) score += 32;
        if (e.normalizedSectionTitle.indexOf(t) !== -1) score += 42;
        if (e.normalizedText.indexOf(t) === 0) score += 8;
      });
      out.push(Object.assign({}, e, { score: score, snippet: makeSnippet(e.text, terms), terms: terms }));
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out.slice(0, typeof limit === 'number' && limit > 0 ? limit : 40);
  }

  function createScrollSpy(opts) {
    var container = opts && opts.container, tocEl = opts && opts.tocEl;
    if (!container || typeof IntersectionObserver === 'undefined') return { disconnect: function () {} };
    var sections = Array.from(container.querySelectorAll('section.ls[data-sec-id]'));
    if (!sections.length) return { disconnect: function () {} };
    var visible = new Map(), activeId = '';
    function setActive(secId) {
      if (!secId || secId === activeId) return;
      activeId = secId;
      if (tocEl) tocEl.querySelectorAll('[data-sec]').forEach(function (btn) {
        var hit = (btn.dataset.secId || btn.dataset.sec) === secId;
        btn.classList.toggle('active', hit);
        if (hit) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current');
      });
      if (opts && typeof opts.onActiveChange === 'function') opts.onActiveChange(secId);
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.dataset.secId || en.target.id;
        if (en.isIntersecting) visible.set(id, en.boundingClientRect.top); else visible.delete(id);
      });
      var best = visible.size ? Array.from(visible.entries()).sort(function (a, b) { return Math.abs(a[1]) - Math.abs(b[1]); })[0] : null;
      if (best) setActive(best[0]);
    }, { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.25, 0.6] });
    sections.forEach(function (s) { obs.observe(s); });
    setActive(sections[0].dataset.secId || sections[0].id);
    return { disconnect: function () { obs.disconnect(); visible.clear(); } };
  }

  function getSavedPercent(key) {
    var app = global.MathFlowApp;
    if (global.S && global.S.l && typeof global.S.l[key] === 'number') return global.S.l[key];
    var src = (app && typeof app.getProgress === 'function' && app.getProgress()) || (app && typeof app.getStudentState === 'function' && app.getStudentState());
    return (src && src.l && typeof src.l[key] === 'number') ? src.l[key] : 0;
  }
  function saveScroll(key, pctOverride, meta) {
    if (!key) return 0;
    var doc = global.document && global.document.documentElement;
    var r = Math.min(100, Math.max(0, Math.round(((global.scrollY || 0) * 100) / (doc ? Math.max(1, doc.scrollHeight - (global.innerHeight || 0)) : 1))));
    var pct = typeof pctOverride === 'number' ? pctOverride : (r >= 97 ? 100 : Math.min(99, Math.max(getSavedPercent(key), r)));
    var rs = global.MathFlowResumeStore;
    if (rs && typeof rs.saveLesson === 'function') {
      rs.saveLesson(key, Object.assign({ pct: typeof pctOverride === 'number' ? pctOverride : r, maxPct: pct }, meta || {}));
    }
    if (global.S && global.S.l) global.S.l[key] = pct;
    var app = global.MathFlowApp;
    if (app && typeof app.getStudentState === 'function' && typeof app.saveStudentState === 'function') {
      var st = app.getStudentState() || {};
      st.l = Object.assign({}, st.l); st.l[key] = pct; app.saveStudentState(st);
    }
    if (app && typeof app.saveProgress === 'function') {
      try {
        if (app.saveProgress.length >= 2) app.saveProgress('l', key, pct);
        else { var p = (typeof app.getProgress === 'function' && app.getProgress()) || {}; p.l = Object.assign({}, p.l); p.l[key] = pct; app.saveProgress(p); }
      } catch (_e) {}
    }
    return pct;
  }
  function restoreScroll(key, container, onRestored) {
    var rs = global.MathFlowResumeStore;
    var saved = rs && typeof rs.getLesson === 'function' ? rs.getLesson(key) : null;
    if (saved && Array.isArray(saved.revealedBlanks) && container) {
      var blanks = container.querySelectorAll('.blank, .math-blank, [data-blank="true"]');
      saved.revealedBlanks.forEach(function (idx) {
        var el = blanks[idx];
        if (el) { el.classList.add('on', 'revealed'); el.setAttribute('aria-expanded', 'true'); }
      });
    }
    var pct = saved && typeof saved.pct === 'number' ? saved.pct : getSavedPercent(key);
    var done = function () { if (typeof onRestored === 'function') onRestored(pct); };
    if (pct > 0 && pct < 98 && global.document && typeof global.scrollTo === 'function') {
      var run = function () {
        var d = global.document.documentElement;
        var max = Math.max(0, d.scrollHeight - (global.innerHeight || 0));
        if (max > 0) {
          global.scrollTo(0, (pct / 100) * max);
          var rp = container && container.querySelector('.rp i');
          if (rp) rp.style.setProperty('--rp', String(Math.min(1, Math.max(0, pct / 100))));
        }
        done();
      };
      if (typeof global.requestAnimationFrame === 'function') global.requestAnimationFrame(function () { global.requestAnimationFrame(run); });
      else run();
    } else {
      done();
    }
    return pct;
  }
  var LeconSearch = {
    normalizeSearchText: normalizeSearchText, normalizeSearchQuery: normalizeSearchQuery,
    contentToPlainText: contentToPlainText, buildSearchIndex: buildSearchIndex,
    makeSnippet: makeSnippet, searchIndex: searchIndex,
    createScrollSpy: createScrollSpy, saveScroll: saveScroll, restoreScroll: restoreScroll
  };
  global.LeconSearch = LeconSearch;
  if (typeof module !== 'undefined' && module.exports) module.exports = LeconSearch;
})(typeof globalThis !== 'undefined' ? globalThis : window);
