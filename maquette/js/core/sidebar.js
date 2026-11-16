/* ============================================================================
 * MathFlow — Sidebar Latérale Épurée & Modales Orientation / Aide
 * ============================================================================ */
(function (global) {
  'use strict';

  var SVG = {
    orientation: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    help: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    settings: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  function getApp() { return global.MathFlowApp; }

  function setOrientationButtonState(isOpen) {
    var btn = document.querySelector('#mf-sidebar [data-sb-action="orientation"]');
    if (!btn) return;
    if (isOpen) btn.setAttribute('data-active', 'true');
    else btn.removeAttribute('data-active');
  }

  function openDialog(id) {
    var dlg = document.getElementById(id);
    if (!dlg) return;
    if (id === 'orient-dlg') {
      if (global.MathFlowOrientationModal && typeof global.MathFlowOrientationModal.open === 'function') {
        global.MathFlowOrientationModal.open(dlg);
      }
      setOrientationButtonState(true);
    }
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else dlg.setAttribute('open', '');
  }

  function openSettings() {
    var modals = global.MathFlowUiModals;
    if (modals && typeof modals.openSettingsDialog === 'function') modals.openSettingsDialog();
  }

  function buildSidebarDom() {
    if (typeof document === 'undefined' || document.getElementById('mf-sidebar')) return;

    var aside = document.createElement('aside');
    aside.id = 'mf-sidebar';
    aside.className = 'mf-sidebar';
    aside.setAttribute('aria-label', 'Outils et paramètres');

    aside.innerHTML =
      '<div class="mf-sb-tools">'
        + '<button type="button" class="mf-sb-item" data-sb-action="orientation" title="Orientation & Programme officiel"><span class="mf-sb-ic">' + SVG.orientation + '</span><span class="mf-sb-lbl">Orientation</span></button>'
        + '<button type="button" class="mf-sb-item" data-sb-action="settings" id="av-side" title="Paramètres" aria-label="Paramètres"><span class="mf-sb-ic">' + SVG.settings + '</span><span class="mf-sb-lbl" id="mf-sb-name">Paramètres</span></button>'
      + '</div>'
      + '<div class="mf-sb-foot">'
        + '<button type="button" class="mf-sb-item" data-sb-action="help" title="Aide & Raccourcis"><span class="mf-sb-ic">' + SVG.help + '</span><span class="mf-sb-lbl">Aide</span></button>'
      + '</div>';

    document.body.insertBefore(aside, document.body.firstChild);

    var mnav = document.querySelector('nav.mnav');
    if (mnav && !mnav.querySelector('[data-nav="menu"]')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-nav', 'menu');
      btn.setAttribute('aria-label', 'Menu outils et paramètres');
      btn.innerHTML = SVG.orientation + '<span>Menu</span>';
      btn.addEventListener('click', function () {
        openDialog('mobile-menu-dlg');
      });
      mnav.appendChild(btn);
    }
  }

  function syncSidebar() {
    var app = getApp();
    if (!app) return;
    var p = app.getProfile ? app.getProfile() : {};
    var fn = (p.fn || '').trim();
    var sbName = document.getElementById('mf-sb-name');
    if (sbName) sbName.textContent = fn ? ('Paramètres · ' + fn) : 'Paramètres';
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var actEl = e.target && e.target.closest ? e.target.closest('[data-sb-action]') : null;
      if (!actEl) return;
      var action = actEl.getAttribute('data-sb-action');
      var mobDlg = document.getElementById('mobile-menu-dlg');
      if (mobDlg && mobDlg.open) mobDlg.close();
      if (action === 'orientation') openDialog('orient-dlg');
      else if (action === 'help') openDialog('help-dlg');
      else if (action === 'settings') openSettings();
    });

    ['orient-dlg', 'help-dlg', 'mobile-menu-dlg'].forEach(function (id) {
      var dlg = document.getElementById(id);
      if (!dlg) return;
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      if (id === 'orient-dlg') {
        dlg.addEventListener('close', function () { setOrientationButtonState(false); });
      }
    });

    var app = getApp();
    if (app && typeof app.on === 'function') {
      app.on('route:change', syncSidebar);
      app.on('profile:change', syncSidebar);
    }
    global.addEventListener('hashchange', syncSidebar);
  }

  function init() {
    buildSidebarDom();
    bindEvents();
    syncSidebar();
  }

  global.MathFlowSidebar = { init: init, sync: syncSidebar, openDialog: openDialog };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
