/**
 * MathFlow — Contrôleur SPA de fiche de révision & problème de synthèse
 */
(function (global) {
  'use strict';

  var mountToken = 0;
  var activeState = null;

  function cssEscape(val) {
    if (global.CSS && typeof global.CSS.escape === 'function') return global.CSS.escape(String(val));
    return String(val).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function closeModalSafe(modal) {
    if (!modal) return;
    if (typeof modal.close === 'function' && modal.open) modal.close();
    else modal.removeAttribute('open');
    var b = modal.querySelector('.focus-body');
    if (b) b.innerHTML = '';
    if (global.document && global.document.body) global.document.body.classList.remove('focus-open');
  }

  function openFocusModal(container, blk) {
    var modal = container && container.querySelector('#focus-overlay-modal');
    if (!blk || !modal) return;
    var clone = blk.cloneNode(true);
    clone.removeAttribute('id');
    if (clone.tagName === 'DETAILS') clone.open = true;
    clone.querySelectorAll('details').forEach(function (d) { d.open = true; });
    var body = modal.querySelector('.focus-body');
    if (body) { body.innerHTML = ''; body.appendChild(clone); }
    if (typeof modal.showModal === 'function') { if (!modal.open) modal.showModal(); }
    else modal.setAttribute('open', '');
    if (global.document && global.document.body) global.document.body.classList.add('focus-open');
  }

  function closeOverlays(container) {
    if (container) {
      closeModalSafe(container.querySelector('#focus-overlay-modal'));
      var toc = container.querySelector('#toc');
      if (toc && typeof toc.hidePopover === 'function') { try { toc.hidePopover(); } catch (_e) {} }
    }
    ['mf-lexicon-popover', 'mf-media-lightbox'].forEach(function (id) {
      var el = global.document && global.document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function normalizeProblemToSheet(prob, fallbackId) {
    if (!prob) throw new Error('Problème introuvable');
    if (Array.isArray(prob.sections)) return prob;
    var blocks = [];
    if (prob.statement || prob.enonce || prob.content) {
      blocks.push({ type: 'problem', title: prob.title || 'Énoncé', difficulty: prob.difficulty, content: prob.statement || prob.enonce || prob.content, media: prob.media });
    }
    if (Array.isArray(prob.hints)) prob.hints.forEach(function (h, i) { blocks.push({ type: 'hint', title: 'Indice ' + (i + 1), content: h }); });
    else if (prob.hint || prob.indice) blocks.push({ type: 'hint', title: 'Indice', content: prob.hint || prob.indice });
    if (prob.solution || prob.correction) blocks.push({ type: 'solution', title: 'Solution rédigée', content: prob.solution || prob.correction });
    if (Array.isArray(prob.blocks)) blocks = blocks.concat(prob.blocks);
    return {
      header: { title: prob.title || ('Problème ' + fallbackId), subtitle: prob.subtitle || prob.theme || '', context: prob.context || prob.source || '' },
      lexique: prob.lexique || [],
      sections: [{ id: 'probleme-main', title: prob.sectionTitle || 'Sujet & résolution', blocks: blocks }]
    };
  }

  async function loadLessonData(params) {
    var cs = global.ContentService, kind = params.kind === 'probleme' ? 'probleme' : 'lesson';
    var app = global.MathFlowApp;
    var settings = (app && typeof app.getSettings === 'function') ? app.getSettings() : {};
    var activeCls = (app && typeof app.getActiveClassId === 'function') ? app.getActiveClassId() : '';
    var classId = params.classId || activeCls || settings.cls || settings.classId || '2eme-bac-sc-ex';
    if (kind === 'probleme') {
      var probId = params.problemeId || params.problemId || params.id || params.chapterId || '01';
      var prob = params.probleme || (cs && typeof cs.getProbleme === 'function'
        ? await cs.getProbleme(probId, classId)
        : await cs.fetchJson(params.path || ('data/' + classId + '/problemes/' + probId + '.json')));
      return {
        kind: 'probleme', chapId: probId, sheet: normalizeProblemToSheet(prob, probId), sheets: [], activeSheetId: '',
        kicker: (prob && (prob.source || prob.theme)) || 'Problème de synthèse', backHref: '#problemes',
        backLabel: 'Problèmes', backEndLabel: 'Retour aux problèmes',
        scrollKey: 'prob:' + probId, basePath: 'data/' + classId + '/problemes/', hashUrl: '#probleme-' + encodeURIComponent(probId)
      };
    }
    var chapId = params.chapterId || params.id || 'continuite';
    if (params.sheet) {
      return {
        kind: 'lesson', chapId: chapId, sheet: params.sheet, sheets: params.sheets || [], activeSheetId: params.sheetId || 'cours',
        kicker: params.kicker || (params.sheet.header && params.sheet.header.title) || chapId,
        backHref: '#learn', backLabel: 'Programme', backEndLabel: 'Retour au programme',
        scrollKey: params.sheetId ? chapId + ':' + params.sheetId : chapId, basePath: params.basePath || '',
        hashUrl: '#lecon-' + encodeURIComponent(chapId) + (params.sheetId ? '&sheet=' + encodeURIComponent(params.sheetId) : '')
      };
    }
    var classMan = cs ? await cs.getClassManifest(classId) : { chapters: [] };
    var chapMeta = (classMan.chapters || []).find(function (c) { return c.id === chapId; }) || { id: chapId, title: chapId };
    var manRef = chapMeta.manifestPath || chapMeta.manifest || chapId;
    var chapMan = cs ? await cs.getChapterManifest(manRef, classId) : {};
    var sheets = (chapMan.revisions && chapMan.revisions.length ? chapMan.revisions : (chapMeta.revisions || chapMan.sheets || []));
    var rs = global.MathFlowResumeStore;
    var savedSheet = !params.sheetId && sheets.length > 1 && rs && typeof rs.getLessonActiveSheet === 'function' ? rs.getLessonActiveSheet(chapId) : null;
    var targetSheetId = params.sheetId || (savedSheet && savedSheet.sheetId) || '';
    var activeMeta = (targetSheetId && sheets.find(function (s) { return s.id === targetSheetId; })) || sheets[0] || { id: 'cours', label: 'Cours', path: params.path };
    var sheet = activeMeta.path && cs ? await cs.getRevisionSheet(activeMeta.path, classId) : null;
    if (!sheet) throw new Error('Fiche de révision introuvable');
    var sheetId = activeMeta.id || 'cours';
    var scrollKey = sheets.length > 1 ? chapId + ':' + sheetId : chapId;
    var hashUrl = '#lecon-' + encodeURIComponent(chapId) + (sheets.length > 1 ? '&sheet=' + encodeURIComponent(sheetId) : '');
    if (sheets.length > 1 && rs && typeof rs.saveLessonActiveSheet === 'function') {
      rs.saveLessonActiveSheet(chapId, { sheetId: sheetId, href: hashUrl, scrollKey: scrollKey });
    }
    return {
      kind: 'lesson', chapId: chapId, sheet: sheet, sheets: sheets, activeSheetId: sheetId,
      kicker: chapMeta.title || (sheet.header && sheet.header.title) || chapId,
      backHref: '#learn', backLabel: 'Programme', backEndLabel: 'Retour au programme',
      scrollKey: scrollKey,
      basePath: activeMeta.path ? String(activeMeta.path).replace(/[^/]+$/, '') : '',
      hashUrl: hashUrl
    };
  }

  function toggleBlank(el, forceOpen) {
    var open = typeof forceOpen === 'boolean' ? forceOpen : !(el.classList.contains('on') || el.classList.contains('revealed'));
    el.classList.toggle('on', open);
    el.classList.toggle('revealed', open);
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function isMotionReduced() {
    var app = global.MathFlowApp;
    if (app && typeof app.getSettings === 'function' && app.getSettings().reduceMotion) return true;
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function readOpenBlanks(container) {
    var out = [];
    container.querySelectorAll('.blank, .math-blank, [data-blank="true"]').forEach(function (b, idx) {
      if (b.classList.contains('on') || b.classList.contains('revealed')) out.push(idx);
    });
    return out;
  }

  function bindInteractions(container, payload) {
    var search = global.LeconSearch, cleanups = [];
    var searchIdx = search.buildSearchIndex(payload.sheet.sections || []);
    var toc = container.querySelector('#toc'), rhEl = container.querySelector('#rh');
    var activeSec = { secId: '', secTitle: '' }, restored = false;
    var spy = search.createScrollSpy({
      container: container, tocEl: toc,
      onActiveChange: function (secId) {
        var secEl = container.querySelector('#les-' + cssEscape(secId)) || container.querySelector('[data-sec-id="' + cssEscape(secId) + '"]');
        var lht = secEl && secEl.querySelector('.lht');
        var secTitle = lht ? lht.textContent.trim() : '';
        activeSec = { secId: secId, secTitle: secTitle };
        if (rhEl) rhEl.textContent = secTitle;
      }
    });
    var rpBar = container.querySelector('.rp i');
    var useScrollFallback = rpBar && (!global.CSS || !global.CSS.supports || !global.CSS.supports('animation-timeline', 'scroll()'));
    var persist = function (override) {
      if (!restored) return 0;
      return search.saveScroll(payload.scrollKey, override, {
        secId: activeSec.secId || undefined, secTitle: activeSec.secTitle || undefined,
        revealedBlanks: readOpenBlanks(container)
      });
    };

    function on(el, ev, fn, opts) {
      if (!el) return;
      el.addEventListener(ev, fn, opts);
      cleanups.push(function () { el.removeEventListener(ev, fn, opts); });
    }

    var focusModal = container.querySelector('#focus-overlay-modal');
    if (focusModal) {
      on(focusModal, 'close', function () { closeModalSafe(focusModal); });
      on(focusModal, 'click', function (e) { if (e.target === focusModal) closeModalSafe(focusModal); });
    }

    on(container, 'click', function (e) {
      var blank = e.target.closest('.blank, .math-blank, [data-blank="true"]');
      if (blank) { e.stopPropagation(); toggleBlank(blank); persist(); return; }
      if (e.target.closest('[data-focus-close]')) { closeModalSafe(focusModal); return; }
      var fxBtn = e.target.closest('[data-focus]');
      if (fxBtn) { e.preventDefault(); e.stopPropagation(); openFocusModal(container, fxBtn.closest('.blk')); return; }
      var allBtn = e.target.closest('[data-all]');
      if (allBtn) {
        (allBtn.closest('.sol') || container).querySelectorAll('.blank, .math-blank, [data-blank="true"]')
          .forEach(function (b) { toggleBlank(b, true); });
        persist();
        return;
      }
      if (e.target.closest('[data-fold]')) {
        var list = Array.from(container.querySelectorAll('details.blk')), anyOpen = list.some(function (d) { return d.open; });
        list.forEach(function (d) { d.open = !anyOpen; });
        return;
      }
      var jumpBtn = e.target.closest('[data-jump-block], [data-sec]');
      if (jumpBtn) {
        if (toc && typeof toc.hidePopover === 'function') { try { toc.hidePopover(); } catch (_e) {} }
        var blockId = jumpBtn.dataset.jumpBlock, secId = jumpBtn.dataset.sec;
        var target = (blockId && container.querySelector('#' + cssEscape(blockId)))
          || (secId && (container.querySelector('#les-' + cssEscape(secId)) || container.querySelector('[data-sec-id="' + cssEscape(secId) + '"]')));
        for (var node = target; node && node !== container; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
        if (target) target.scrollIntoView({ behavior: isMotionReduced() ? 'auto' : 'smooth', block: 'start' });
      }
    });

    on(container, 'keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var blank = e.target.closest && e.target.closest('.blank, .math-blank, [data-blank="true"]');
      if (blank) { e.preventDefault(); e.stopPropagation(); toggleBlank(blank); }
    });

    on(container, 'dblclick', function (e) {
      if (e.target.closest('#focus-overlay-modal, summary, button, a, input, .blank, .math-blank, [data-blank="true"]')) return;
      openFocusModal(container, e.target.closest('.blk'));
    });

    var tqs = container.querySelector('#tqs'), resultsEl = container.querySelector('#toc-results'), sectionsEl = container.querySelector('#toc-sections');
    on(tqs, 'input', function () {
      var q = tqs.value.trim();
      container.querySelectorAll('.blk.hit').forEach(function (b) { b.classList.remove('hit'); });
      if (!q) {
        if (resultsEl) { resultsEl.hidden = true; resultsEl.innerHTML = ''; }
        if (sectionsEl) sectionsEl.hidden = false;
        return;
      }
      var hits = search.searchIndex(searchIdx, q, 30);
      hits.forEach(function (h) {
        var el = container.querySelector('#' + cssEscape(h.blockId));
        if (el && el.classList.contains('blk')) el.classList.add('hit');
      });
      if (resultsEl) { resultsEl.innerHTML = renderer.renderTocResultsHtml(hits); resultsEl.hidden = false; }
      if (sectionsEl) sectionsEl.hidden = true;
    });

    on(global, 'pagehide', function () { persist(); });
    var saveT = null, lastSavedPct = -1;
    on(global, 'scroll', function () {
      if (!restored) return;
      var doc = global.document.documentElement;
      var max = Math.max(1, doc.scrollHeight - (global.innerHeight || 0));
      var pctNow = Math.min(100, Math.max(0, Math.round(((global.scrollY || 0) * 100) / max)));
      if (useScrollFallback && rpBar) rpBar.style.setProperty('--rp', String(pctNow / 100));
      if (pctNow >= 10 && lastSavedPct < 10) { lastSavedPct = persist(); return; }
      if (!saveT) saveT = global.setTimeout(function () { saveT = null; lastSavedPct = persist(); }, 250);
    }, { passive: true });

    return {
      markRestored: function () { restored = true; },
      destroy: function () { if (saveT) global.clearTimeout(saveT); persist(); spy.disconnect(); cleanups.forEach(function (fn) { fn(); }); closeOverlays(container); }
    };
  }

  function unmount() {
    mountToken++;
    if (activeState) { activeState.destroy(); activeState = null; }
  }

  async function mount(container, params) {
    unmount();
    if (!container) return;
    var token = ++mountToken;
    container.innerHTML = '<div class="les-loading" role="status">Chargement de la fiche…</div>';
    try {
      var payload = await loadLessonData(params || {});
      if (token !== mountToken) return;
      if (payload.sheet && Array.isArray(payload.sheet.lexique) && payload.sheet.lexique.length
        && global.MathEngine && typeof global.MathEngine.registerLexiconEntries === 'function') {
        global.MathEngine.registerLexiconEntries(payload.sheet.lexique);
      }
      var app = global.MathFlowApp;
      if (app && typeof app.recordLastVisited === 'function') {
        var lvTitle = (payload.sheet.header && payload.sheet.header.title) || payload.kicker;
        app.recordLastVisited({
          hash: payload.hashUrl, url: payload.hashUrl, title: lvTitle, chapterTitle: lvTitle,
          kind: payload.kind === 'probleme' ? 'probleme' : 'lesson',
          type: payload.kind === 'probleme' ? 'probleme' : 'lecon',
          chapterId: payload.kind === 'probleme' ? null : payload.chapId
        });
      }
      var numbered = !app || typeof app.getSettings !== 'function' || app.getSettings().revisionBlockNumbering !== false;
      container.innerHTML = global.MathFlowLeconRenderer.renderLessonShellHtml({
        kind: payload.kind, chapId: payload.chapId, title: payload.kicker, kicker: payload.kicker,
        sheet: payload.sheet, sheets: payload.sheets, activeSheetId: payload.activeSheetId,
        backHref: payload.backHref, backLabel: payload.backLabel, backEndLabel: payload.backEndLabel,
        numbered: numbered, basePath: payload.basePath
      });
      var rtEl = container.querySelector('#rt');
      if (rtEl) rtEl.textContent = global.MathFlowLeconRenderer.computeReadTime(container);
      activeState = bindInteractions(container, payload);
      global.LeconSearch.restoreScroll(payload.scrollKey, container, function () { if (activeState) activeState.markRestored(); });
    } catch (err) {
      if (token !== mountToken) return;
      var msg = String(err && err.message ? err.message : 'Erreur de chargement')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      container.innerHTML = '<div class="les-error"><p>Impossible de charger cette fiche : ' + msg + '</p><p class="end2"><a class="link" href="#learn">Retour au programme</a></p></div>';
    }
  }

  var LeconPage = { mount: mount, unmount: unmount };
  global.LeconPage = LeconPage;
  if (typeof module !== 'undefined' && module.exports) module.exports = LeconPage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
