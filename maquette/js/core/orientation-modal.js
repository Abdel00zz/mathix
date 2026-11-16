/* ============================================================================
 * MathFlow — Modale Orientation & Programme Officiel Détaillé (5 Classes Lycée)
 * ============================================================================ */
(function (global) {
  'use strict';

  var DOMAIN_ICONS = {
    algebre: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M10.8 7.2L7.2 15.8M13.2 7.2l3.6 8.6"/></svg>',
    analyse: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="10" y2="16"/><line x1="14" y1="16" x2="16" y2="16"/></svg>',
    geometrie: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 3 19 14 5 14 12 3"/><circle cx="8" cy="18.5" r="2.5"/><rect x="13.5" y="16" width="5" height="5" rx="1"/></svg>',
    probabilites: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg>',
    statistiques: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
  };
  var CHEV = '<svg class="or-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  var state = { clsId: null, domain: null, openIdx: 0, bound: false };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderMath(str) {
    var raw = String(str == null ? '' : str);
    if (!/[\$\\]/.test(raw) || !global.MathEngine || typeof global.MathEngine.renderMathInHtml !== 'function') return esc(raw);
    return global.MathEngine.renderMathInHtml(raw, { enableLexicon: false });
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function getDataRoot() { return global.MathFlowOrientationData; }

  function resolveDefaultClass() {
    var app = global.MathFlowApp;
    if (app && typeof app.getActiveClassId === 'function') return app.getActiveClassId();
    return '2eme-bac-sc-ex';
  }

  function renderChapterCard(ch, idx, isOpen) {
    var numBadge = pad2(idx + 1) + (isOpen ? '.' : '');
    var contentsHtml = (ch.contents || []).map(function (line, i) {
      return '<li class="or-row"><span class="or-idx">' + pad2(i + 1) + '</span><span class="or-txt">' + renderMath(line) + '</span></li>';
    }).join('');
    var capsHtml = (ch.capacities || []).map(function (line) {
      return '<li class="or-row"><span class="or-arr" aria-hidden="true">\u2192</span><span class="or-txt">' + renderMath(line) + '</span></li>';
    }).join('');

    var bodyHtml = isOpen
      ? '<div class="or-inner">'
          + '<div class="or-sec"><h4 class="or-eyebrow or-eyebrow--pink">Contenus</h4><ul class="or-items">' + contentsHtml + '</ul></div>'
          + '<hr class="or-sep">'
          + '<div class="or-sec"><h4 class="or-eyebrow or-eyebrow--lilac">Capacités attendues</h4><ul class="or-items">' + capsHtml + '</ul></div>'
        + '</div>'
      : '';

    return '<article class="or-card' + (isOpen ? ' is-open' : '') + '" data-or-idx="' + idx + '">'
      + '<button type="button" class="or-card-head" data-or-toggle="' + idx + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">'
        + '<span class="or-num">' + esc(numBadge) + '</span>'
        + '<span class="or-ttl">' + renderMath(ch.title) + '</span>'
        + CHEV
      + '</button>'
      + bodyHtml
    + '</article>';
  }

  function renderModal(dlg) {
    if (!dlg) dlg = typeof document !== 'undefined' && document.getElementById('orient-dlg');
    if (!dlg) return;
    var root = getDataRoot();
    if (!root || typeof root.getClassProgram !== 'function') return;

    if (!state.clsId) state.clsId = resolveDefaultClass();
    var prog = root.getClassProgram(state.clsId);
    var allClasses = typeof root.getAllClasses === 'function' ? root.getAllClasses() : [prog];
    var domains = (prog && prog.domains) || [];
    if (!state.domain || !domains.some(function (d) { return d.id === state.domain; })) {
      state.domain = domains[0] ? domains[0].id : 'algebre';
      state.openIdx = 0;
    }

    var chapters = ((prog && prog.chapters) || []).filter(function (c) { return c.domain === state.domain; });
    if (state.openIdx >= chapters.length) state.openIdx = 0;

    var optionsHtml = allClasses.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === prog.id ? ' selected' : '') + '>' + esc(c.title) + '</option>';
    }).join('');

    var tabsHtml = domains.map(function (d) {
      var active = d.id === state.domain;
      var ic = DOMAIN_ICONS[d.id] || DOMAIN_ICONS.algebre;
      return '<button type="button" role="tab" class="or-tab' + (active ? ' is-active' : '') + '" aria-selected="' + (active ? 'true' : 'false') + '" data-or-domain="' + esc(d.id) + '">'
        + ic + '<span>' + esc(d.label) + '</span></button>';
    }).join('');

    var cardsHtml = chapters.map(function (ch, idx) {
      return renderChapterCard(ch, idx, idx === state.openIdx);
    }).join('');

    dlg.innerHTML =
      '<div class="or-shell">'
        + '<header class="or-head">'
          + '<div class="or-title-group">'
            + '<h2 class="or-title">Orientation</h2>'
            + '<span class="or-dot" aria-hidden="true">\u2022</span>'
            + '<label class="or-cls-wrap" title="Consulter le programme d’une autre filière">'
              + '<select id="or-cls-select" class="or-cls-select" aria-label="Filière du programme">' + optionsHtml + '</select>'
            + '</label>'
          + '</div>'
          + '<button type="button" class="or-close" data-or-close aria-label="Fermer">&times;</button>'
        + '</header>'
        + '<div class="or-tabs" role="tablist" aria-label="Domaines mathématiques">' + tabsHtml + '</div>'
        + '<div class="or-body" id="orient-list">' + cardsHtml + '</div>'
      + '</div>';

    bindDialogEvents(dlg);
  }

  function bindDialogEvents(dlg) {
    if (!dlg || state.bound) return;
    state.bound = true;

    dlg.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('#or-cls-select') : null;
      if (!sel) return;
      state.clsId = sel.value;
      state.domain = null;
      state.openIdx = 0;
      renderModal(dlg);
    });

    dlg.addEventListener('click', function (e) {
      var closeBtn = e.target && e.target.closest ? e.target.closest('[data-or-close]') : null;
      if (closeBtn) {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
        return;
      }
      var tabBtn = e.target && e.target.closest ? e.target.closest('[data-or-domain]') : null;
      if (tabBtn) {
        var nextDom = tabBtn.getAttribute('data-or-domain');
        if (nextDom && nextDom !== state.domain) {
          state.domain = nextDom;
          state.openIdx = 0;
          renderModal(dlg);
        }
        return;
      }
      var toggleBtn = e.target && e.target.closest ? e.target.closest('[data-or-toggle]') : null;
      if (toggleBtn) {
        var idx = Number(toggleBtn.getAttribute('data-or-toggle'));
        state.openIdx = state.openIdx === idx ? -1 : idx;
        renderModal(dlg);
      }
    });
  }

  function open(dlg, classIdOverride) {
    state.clsId = classIdOverride || resolveDefaultClass();
    state.domain = null;
    state.openIdx = 0;
    renderModal(dlg);
  }

  global.MathFlowOrientationModal = { render: renderModal, open: open };
})(typeof globalThis !== 'undefined' ? globalThis : window);
