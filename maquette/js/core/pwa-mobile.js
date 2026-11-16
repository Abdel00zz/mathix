/**
 * MathFlow — PWA Mobile Lifecycle (Service Worker + Install + Bottom Nav + Viewport)
 * Totalement silencieux et sans erreur sur file://.
 */
(function (global) {
  'use strict';

  var isHttp = typeof location !== 'undefined' && /^https?:$/i.test(location.protocol || '');
  var deferredPrompt = null;
  var swWaiting = null;
  var toastTimer = null;

  function showToast(text, actionLabel, onAction) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('pwa-toast');
    if (!el) return;
    clearTimeout(toastTimer);
    el.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    if (actionLabel && typeof onAction === 'function') {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', function () { el.hidden = true; onAction(); });
      el.appendChild(btn);
    }
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'mf-toast-x';
    close.setAttribute('aria-label', 'Fermer');
    close.textContent = '×';
    close.addEventListener('click', function () { el.hidden = true; });
    el.appendChild(close);
    el.hidden = false;
    toastTimer = setTimeout(function () { el.hidden = true; }, 9000);
  }

  function syncBottomNav() {
    if (typeof document === 'undefined') return;
    var hash = String((global.location && global.location.hash) || '#learn').toLowerCase();
    var activeTab = hash.indexOf('#examens') === 0 ? 'examens'
      : hash.indexOf('#problemes') === 0 ? 'problemes'
      : hash.indexOf('#prepa') === 0 ? 'prepa' : 'learn';
    var links = document.querySelectorAll('nav.mnav a[data-nav]');
    links.forEach(function (a) {
      if (a.getAttribute('data-nav') === activeTab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function bindViewport() {
    if (typeof window === 'undefined' || !window.visualViewport || typeof document === 'undefined') return;
    var update = function () {
      var vv = window.visualViewport;
      var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb-inset', kb > 80 ? kb + 'px' : '0px');
    };
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
  }

  function registerSw() {
    if (!isHttp || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw-apprendre.js', { scope: './' }).then(function (reg) {
      if (reg.waiting) {
        swWaiting = reg.waiting;
        showToast('Mise à jour disponible', 'Actualiser', applyUpdate);
      }
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            swWaiting = nw;
            showToast('Nouvelle version prête', 'Actualiser', applyUpdate);
          }
        });
      });
    }).catch(function () {});

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!refreshing) { refreshing = true; global.location.reload(); }
    });
  }

  function applyUpdate() {
    if (swWaiting) swWaiting.postMessage({ type: 'SKIP_WAITING' });
  }

  async function promptInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(function () {});
    deferredPrompt = null;
    return true;
  }

  function bindAppHooks() {
    var app = global.MathFlowApp;
    if (app && typeof app.on === 'function') {
      app.on('route:change', syncBottomNav);
      app.on('chapter:open', function (info) {
        if (info && info.chapterId && global.MathFlowOfflineDB) {
          global.MathFlowOfflineDB.prefetchChapter(info.classId, info.chapterId);
        }
      });
    }
    if (typeof document !== 'undefined') {
      var chList = document.getElementById('ch');
      if (chList) {
        chList.addEventListener('click', function (e) {
          var head = e.target.closest('.head'), li = head && head.closest('.ch');
          if (li && li.dataset.ch && global.MathFlowOfflineDB && global.MathFlowApp) {
            global.MathFlowOfflineDB.prefetchChapter(global.MathFlowApp.getActiveClassId(), li.dataset.ch);
          }
        });
      }
    }
  }

  function init() {
    if (typeof document === 'undefined') return;
    syncBottomNav();
    bindViewport();
    bindAppHooks();
    global.addEventListener('hashchange', syncBottomNav);
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
    });
    if (isHttp) {
      global.addEventListener('offline', function () { showToast('Mode hors-ligne activé'); });
      registerSw();
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else Promise.resolve().then(init);
  }

  var api = { init: init, showToast: showToast, syncBottomNav: syncBottomNav, promptInstall: promptInstall, canInstall: function () { return Boolean(deferredPrompt); } };
  global.MathFlowPwa = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
