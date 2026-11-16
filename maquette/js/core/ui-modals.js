/**
 * MathFlow — Native <dialog> Modals (Paramètres élève, Validation exercice & Confirmation)
 */
(function (global) {
  'use strict';

  const PREF_KEYS = [
    'th', 'cls', 'fn', 'ln', 'sc', 'docFont', 'docScale',
    'tiersTemps', 'soundEnabled', 'lexiconAutoHighlight', 'reduceMotion'
  ];
  const BOOL_KEYS = new Set(['tiersTemps', 'soundEnabled', 'lexiconAutoHighlight', 'reduceMotion']);
  let initialized = false;
  let confirmDialogEl = null;

  function showModal(dlg) {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }

  function closeModal(dlg, value) {
    if (!dlg) return;
    if (typeof dlg.close === 'function') { if (dlg.open) dlg.close(value); }
    else { dlg.returnValue = value || ''; dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  }

  function injectField(sf, anchor, html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    while (box.firstElementChild) {
      if (anchor) sf.insertBefore(box.firstElementChild, anchor);
      else sf.appendChild(box.firstElementChild);
    }
  }

  function fillClassOptions(selectEl, classes, activeId) {
    if (!selectEl || !Array.isArray(classes) || !classes.length) return;
    selectEl.innerHTML = '';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title || c.id;
      selectEl.appendChild(opt);
    });
    if (activeId) selectEl.value = activeId;
  }

  function ensureSettingsFields(sf) {
    if (!sf || !sf.elements) return;
    const row = sf.querySelector('.set-foot') || sf.querySelector('.row');
    const clsSlot = document.getElementById('set-cls-slot');
    const lectureGrid = document.getElementById('set-lecture-grid');
    const prefsList = document.getElementById('set-prefs-list');
    const clsList = global.MathFlowApp && typeof global.MathFlowApp.getCachedClasses === 'function'
      ? global.MathFlowApp.getCachedClasses().map(c => [c.id, c.title || c.id])
      : [['2eme-bac-sc-ex', '2ᵉ Bac Sciences Expérimentales'], ['2eme-bac-sc-math', '2ᵉ Bac Sciences Mathématiques']];
    const selects = [
      ['cls', 'Filière', clsList, clsSlot],
      ['docFont', 'Police des cours', [['literata', 'Literata (Sérif)'], ['sans', 'Hanken Grotesk (Sans)']], lectureGrid],
      ['docScale', 'Taille du texte', [['0.95', '95 %'], ['1', '100 %'], ['1.1', '110 %'], ['1.2', '120 %']], lectureGrid]
    ];
    selects.forEach(([name, lbl, opts, host]) => {
      if (sf.elements[name]) return;
      const optHtml = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
      injectField(host || sf, host ? null : row, `<label class="fld">${lbl}<select name="${name}">${optHtml}</select></label>`);
    });
    const checks = [
      ['tiersTemps', 'Tiers-temps (+33 %) sur les quiz', 'Allonge automatiquement le minuteur de chaque question'],
      ['soundEnabled', 'Effets sonores discrets', 'Retours acoustiques lors des validations et réussites'],
      ['lexiconAutoHighlight', 'Surlignage du lexique mathématique', 'Termes clés cliquables avec définition FR / AR dans les leçons'],
      ['reduceMotion', 'Réduire les animations', 'Désactive les transitions de vue et défilements doux']
    ];
    checks.forEach(([name, lbl, desc]) => {
      if (sf.elements[name]) return;
      injectField(
        prefsList || sf,
        prefsList ? null : row,
        `<label class="set-switch-row"><span><strong>${lbl}</strong><small>${desc}</small></span><span class="set-switch"><input type="checkbox" name="${name}"><span class="set-switch-track" aria-hidden="true"></span></span></label>`
      );
    });
  }

  function writeCtrl(ctrl, val) {
    if (!ctrl) return;
    if (ctrl.type === 'checkbox') ctrl.checked = Boolean(val);
    else if (typeof ctrl.length === 'number' && ctrl[0] && ctrl[0].type === 'radio') {
      Array.from(ctrl).forEach(r => { r.checked = String(r.value) === String(val); });
    } else ctrl.value = val == null ? '' : String(val);
  }

  function readCtrl(ctrl, key) {
    if (!ctrl) return undefined;
    if (BOOL_KEYS.has(key) || ctrl.type === 'checkbox') return Boolean(ctrl.checked);
    if (typeof ctrl.length === 'number' && ctrl[0] && ctrl[0].type === 'radio') {
      const checked = Array.from(ctrl).find(r => r.checked);
      return checked ? checked.value : ctrl.value;
    }
    const raw = String(ctrl.value || '').trim();
    return key === 'docScale' ? (parseFloat(raw) || 1) : raw;
  }

  function resetBtnLabel(btn) {
    if (!btn) return;
    delete btn.dataset.step;
    btn.textContent = 'Réinitialiser ma progression';
  }

  function openSettingsDialog() {
    if (typeof document === 'undefined' || !global.MathFlowApp) return;
    const setDlg = document.getElementById('set');
    const sf = document.getElementById('sf');
    if (!setDlg || !sf) return;
    ensureSettingsFields(sf);
    const p = global.MathFlowApp.getProfile();
    PREF_KEYS.forEach(k => writeCtrl(sf.elements[k], p[k]));
    if (typeof global.MathFlowApp.getAvailableClasses === 'function') {
      global.MathFlowApp.getAvailableClasses().then(list => fillClassOptions(sf.elements.cls, list, p.cls)).catch(() => {});
    }
    resetBtnLabel(document.getElementById('rst'));
    if (global.MathFlowCloud && typeof global.MathFlowCloud.renderAccountBox === 'function') {
      global.MathFlowCloud.renderAccountBox(document.getElementById('cloud-account-box'));
    }
    setDlg.returnValue = '';
    showModal(setDlg);
  }

  function handleSettingsClose() {
    const setDlg = document.getElementById('set');
    const sf = document.getElementById('sf');
    resetBtnLabel(document.getElementById('rst'));
    if (!setDlg || !sf || setDlg.returnValue !== 'ok' || !global.MathFlowApp) return;
    const prevCls = global.MathFlowApp.getActiveClassId();
    const patch = {};
    PREF_KEYS.forEach(k => { const v = readCtrl(sf.elements[k], k); if (v !== undefined) patch[k] = v; });
    const next = global.MathFlowApp.updateProfile(patch);
    if (next.cls !== prevCls) {
      const v = document.body.dataset.v;
      if (v === 'les' || v === 'quiz' || v === 'exo') global.location.hash = '#learn';
      else global.MathFlowApp.route();
    }
  }

  function handleResetClick(e) {
    const btn = e.currentTarget;
    if (!btn) return;
    if (btn.dataset.step === 'confirm') {
      resetBtnLabel(btn);
      if (global.MathFlowApp) global.MathFlowApp.resetProgress();
      closeModal(document.getElementById('set'), 'reset');
      if (global.MathFlowApp) global.MathFlowApp.route();
    } else {
      btn.dataset.step = 'confirm';
      btn.textContent = 'Confirmer la réinitialisation';
    }
  }

  function openExerciseCompleteDialog(elapsedSec) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const dlg = document.getElementById('dlg');
    if (!dlg) return Promise.resolve(null);
    const app = global.MathFlowApp, timer = app && app.timer;
    const wasLive = Boolean(timer && typeof timer.isLive === 'function' && timer.isLive());
    if (wasLive) timer.pause();
    const sec = typeof elapsedSec === 'number' ? elapsedSec : (timer ? timer.s() : 0);
    const dt = document.getElementById('dt');
    if (dt) dt.textContent = 'Temps passé : ' + (app ? app.formatTime(sec) : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'));
    const defRadio = dlg.querySelector('input[name="lv"][value="1"]');
    if (defRadio) defRadio.checked = true;
    dlg.returnValue = '';
    return new Promise(resolve => {
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        if (dlg.returnValue === 'ok') {
          const chk = dlg.querySelector('input[name="lv"]:checked');
          const lv = chk ? Number(chk.value) : 1;
          resolve(Number.isInteger(lv) && lv >= 0 && lv <= 2 ? lv : 1);
        } else {
          if (wasLive) timer.resume();
          resolve(null);
        }
      };
      dlg.addEventListener('close', onClose);
      showModal(dlg);
    });
  }

  function getConfirmDialog() {
    if (confirmDialogEl && confirmDialogEl.isConnected) return confirmDialogEl;
    const existing = document.getElementById('mf-confirm-dialog');
    if (existing) { confirmDialogEl = existing; return existing; }
    const dlg = document.createElement('dialog');
    dlg.id = 'mf-confirm-dialog';
    dlg.innerHTML = '<form method="dialog"><h2 data-ct></h2><p data-cm></p><div class="row"><button class="btn" value="no" data-cn></button><button class="btn primary" value="ok" data-co></button></div></form>';
    dlg.addEventListener('click', e => { if (e.target === dlg) closeModal(dlg, 'no'); });
    document.body.appendChild(dlg);
    confirmDialogEl = dlg;
    return dlg;
  }

  function openConfirmDialog(opts) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const cfg = opts || {}, dlg = getConfirmDialog();
    dlg.querySelector('[data-ct]').textContent = cfg.title || 'Confirmation';
    dlg.querySelector('[data-cm]').textContent = cfg.message || '';
    dlg.querySelector('[data-cn]').textContent = cfg.cancelLabel || 'Annuler';
    dlg.querySelector('[data-co]').textContent = cfg.confirmLabel || 'Confirmer';
    dlg.returnValue = '';
    return new Promise(resolve => {
      const onClose = () => { dlg.removeEventListener('close', onClose); resolve(dlg.returnValue === 'ok'); };
      dlg.addEventListener('close', onClose);
      showModal(dlg);
    });
  }

  function init() {
    if (initialized || typeof document === 'undefined') return;
    initialized = true;
    const setDlg = document.getElementById('set');
    const rst = document.getElementById('rst'), dlg = document.getElementById('dlg');
    if (setDlg) {
      setDlg.addEventListener('close', handleSettingsClose);
      setDlg.addEventListener('click', e => {
        if (e.target === setDlg || (e.target && e.target.closest && e.target.closest('[data-set-close]'))) {
          closeModal(setDlg, 'no');
        }
      });
    }
    if (rst) rst.addEventListener('click', handleResetClick);
    if (dlg) dlg.addEventListener('click', e => { if (e.target === dlg) closeModal(dlg, 'no'); });
  }

  const MathFlowUiModals = {
    init, openSettingsDialog, openSettingsModal: openSettingsDialog,
    openExerciseCompleteDialog, openConfirmDialog
  };
  global.MathFlowUiModals = MathFlowUiModals;
  if (typeof module !== 'undefined' && module.exports) module.exports = MathFlowUiModals;
})(typeof globalThis !== 'undefined' ? globalThis : window);
