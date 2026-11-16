/**
 * Contrôleur SPA des exercices et examens nationaux (#exo-...) — v2
 * Chronomètre #tm anti-dérive, Pas à pas / Feuille d'examen, validation S.e, navigation clavier et impression A4.
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ExercicePage = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  'use strict';

  let st = null;
  let mountToken = 0;
  const POOL = 4;

  const app = () => (root && root.MathFlowApp) || {};
  const doc = () => (typeof document !== 'undefined' ? document : null);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    return `${m < 10 ? '0' : ''}${m}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
  };
  const sanitizeHash = (h, fallback) =>
    typeof h === 'string' && /^#[A-Za-z0-9_/?=&.-]+$/.test(h) && !/\.html\b/i.test(h) ? h : fallback;
  const safeId = (v) => (typeof v === 'string' && /^[A-Za-z0-9][\w.-]*$/.test(v) && !v.includes('..') ? v : '');

  /** Chemin de contenu : relatif sans « .. », ou URL absolue de MÊME origine (ou listée dans MathFlowConfig.contentOrigins). */
  const safePath = (p) => {
    const s = String(p == null ? '' : p).trim();
    if (!s || /[\\\u0000-\u001f]/.test(s) || /(^|\/)\.\.(\/|$)/.test(s) || s.startsWith('//')) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      try {
        const origin = new URL(s).origin;
        const allowed = ((root.MathFlowConfig && root.MathFlowConfig.contentOrigins) || []).concat(root.location && root.location.origin ? [root.location.origin] : []);
        return allowed.includes(origin) ? s : '';
      } catch (_) { return ''; }
    }
    return s;
  };

  const dirOf = (p) => {
    const clean = String(p || '').replace(/^\.\//, '');
    const i = clean.lastIndexOf('/');
    return i >= 0 ? clean.slice(0, i) : '';
  };

  const joinPath = (base, rel) => {
    if (!rel) return '';
    const p = String(rel).trim();
    if (/^(data\/|public\/)/i.test(p) || /^https?:\/\//i.test(p)) return safePath(p);
    const clean = p.replace(/^\.\//, '');
    return safePath(base ? `${base.replace(/\/+$/, '')}/${clean}` : clean);
  };

  async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => { while (next < items.length) { const k = next++; out[k] = await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  /** Chronomètre de repli : cumule le temps visible sans dérive (pause onglet masqué). */
  const startClock = (initialSec, onTick) => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let acc = (initialSec || 0) * 1000, last = now(), lastSec = initialSec || 0;
    const id = setInterval(() => {
      const t = now(), d = doc();
      if (!(d && d.hidden)) acc += t - last;
      last = t;
      const s = Math.floor(acc / 1000);
      if (s !== lastSec) { lastSec = s; onTick(s); }
    }, 250);
    return { stop: () => clearInterval(id) };
  };

  const syncTimerDom = () => {
    const el = st && st.container && st.container.querySelector('#tm');
    if (el) el.textContent = fmtTime(st.elapsed);
  };

  const stopTimer = () => {
    if (!st) return;
    if (st.timerHandle && typeof st.timerHandle.stop === 'function') st.timerHandle.stop();
    st.timerHandle = null;
  };

  const startStopwatch = () => {
    stopTimer();
    const tApi = app().timer;
    const onTick = (sec) => { if (st) { st.elapsed = sec; syncTimerDom(); if (sec % 5 === 0 && root.MathFlowResumeStore) root.MathFlowResumeStore.snapshotExerciseState(st.bundle.storageKey, st); } };
    st.timerHandle = tApi && typeof tApi.stopwatch === 'function'
      ? tApi.stopwatch({ initialSeconds: st.elapsed, pauseOnHidden: true, onTick })
      : startClock(st.elapsed, onTick);
  };

  async function loadExercises(p = {}) {
    const svc = root && root.ContentService ? root.ContentService : null;
    if (!svc) throw new Error('Service de contenu indisponible');
    const activeCls = typeof app().getActiveClassId === 'function' ? app().getActiveClassId() : '';
    const classId = p.classId || p.classe || activeCls || '2eme-bac-sc-ex';
    if (!safeId(classId)) throw new Error('Classe invalide');
    const examTarget = p.examPath || p.examId || '';
    const isNational = p.kind === 'national' || Boolean(examTarget) || /^nat_/i.test(String(p.id || ''));

    if (isNational) {
      const rawId = String(examTarget || p.id || '');
      const bare = rawId.replace(/\.json$/, '');
      const examPath = rawId.includes('/') ? safePath(rawId) : (safeId(bare) ? `data/${classId}/examen/${bare}.json` : '');
      if (!examPath) throw new Error('Examen invalide');
      const examData = typeof svc.getExamen === 'function'
        ? await svc.getExamen(examTarget || rawId || examPath)
        : (typeof svc.fetchJson === 'function' ? await svc.fetchJson(examPath) : null);
      if (!examData) throw new Error('Examen introuvable');
      const bp = dirOf(examPath);
      const exercises = (Array.isArray(examData.exercises) ? examData.exercises : [])
        .map((ex, i) => ({ basePath: bp, number: (ex && ex.number) || (i + 1), ...ex }));
      const bareId = (examData && examData.id) || rawId || 'national-exam';
      return {
        kind: 'national',
        storageKey: bareId.startsWith('examen-') ? bareId : 'examen-' + bareId,
        altStorageKey: bareId,
        title: examData.title || 'Examen National',
        subtitle: examData.classId || 'Baccalauréat National',
        year: examData.year, session: examData.session, duration: examData.duration,
        totalPoints: examData.totalPoints, coefficient: examData.coefficient,
        backHash: sanitizeHash(p.backHash, '#examens'),
        defaultMode: p.mode === 'pas-a-pas' ? 'pas-a-pas' : 'examen',
        startIndex: 0, exercises
      };
    }

    const chapterId = p.chapterId || p.chapter || '';
    if (chapterId && !safeId(chapterId)) throw new Error('Chapitre invalide');
    const manifestPath = safePath(p.manifestPath || p.manifest || (chapterId ? `data/${classId}/${chapterId}/manifest.json` : ''));
    const cMan = manifestPath && typeof svc.getChapterManifest === 'function' ? await svc.getChapterManifest(manifestPath) : null;
    const cBase = dirOf(manifestPath);
    let entries = cMan && Array.isArray(cMan.exercises) ? cMan.exercises : [];
    if (!entries.length && p.exercisePath) entries = [{ id: p.exerciseId || 'ex', path: p.exercisePath }];

    const exercises = await mapPool(entries, POOL, async (entry, i) => {
      const id = (entry && entry.id) || String(i + 1);
      const full = joinPath(cBase, typeof entry === 'string' ? entry : ((entry && (entry.path || entry.file)) || ''));
      if (!full) return { failed: true, id, path: '', error: 'Chemin invalide.' };
      try {
        const ex = typeof svc.getExercise === 'function' ? await svc.getExercise(full) : await svc.fetchJson(full);
        if (!ex) throw new Error('Fichier vide.');
        return { id: (entry && entry.id) || ex.id, basePath: dirOf(full), ...ex };
      } catch (err) {
        return { failed: true, id, path: full, error: 'Chargement impossible (' + (err && err.message ? err.message : 'réseau') + ').' };
      }
    });

    let startIndex = 0;
    if (p.exerciseId) {
      const idx = exercises.findIndex((e) => e.id === p.exerciseId);
      if (idx >= 0) startIndex = idx;
    } else if (p.index != null && p.index !== '' && Number.isInteger(Number(p.index)) && exercises[Number(p.index)]) startIndex = Number(p.index);

    return {
      kind: 'chapter', storageKey: `${classId}:${chapterId || manifestPath || 'exo'}`,
      title: (cMan && cMan.title) || p.title || 'Exercices', subtitle: 'Série d’entraînement',
      backHash: sanitizeHash(p.backHash, '#learn'), defaultMode: p.mode === 'examen' ? 'examen' : 'pas-a-pas',
      startIndex, exercises
    };
  }

  const parseOne = (ex) => {
    if (ex && ex.failed) return { failed: true, id: ex.id, path: ex.path, error: ex.error, blocks: [], basePath: '' };
    try { return root.MathFlowExerciceParser.parseExerciseModel(ex, { basePath: (ex && ex.basePath) || '' }); }
    catch (_) { return { failed: true, id: ex && ex.id, path: '', error: 'Format d’exercice invalide.', blocks: [], basePath: '' }; }
  };

  const saveExoResume = () => { if (st && root.MathFlowResumeStore) root.MathFlowResumeStore.snapshotExerciseState(st.bundle.storageKey, st); };
  const loadSavedRatings = (key, count, altKey) => {
    const arr = new Array(count).fill(null);
    const s = typeof app().getStudentState === 'function' ? app().getStudentState() : null;
    const raw = (s && s.e && (s.e[key] || (altKey && s.e[altKey]))) || [];
    (Array.isArray(raw) ? raw : []).forEach((v, i) => { if (i < count && (v === 0 || v === 1 || v === 2)) arr[i] = v; });
    return arr;
  };

  const persistRatings = () => {
    if (!st || !st.dirty) return;
    const a = app();
    if (typeof a.saveProgress === 'function') a.saveProgress('e', st.bundle.storageKey, st.ratings.slice());
    else if (typeof a.getStudentState === 'function' && typeof a.saveStudentState === 'function') {
      const s = a.getStudentState() || { q: {}, e: {}, l: {} };
      s.e = s.e || {}; s.e[st.bundle.storageKey] = st.ratings.slice(); a.saveStudentState(s);
    }
    st.dirty = false;
  };

  const scrollTop = () => {
    if (typeof root.scrollTo !== 'function') return;
    try { root.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (_) { root.scrollTo(0, 0); }
  };

  const timeFor = (idx) => {
    if (st.mode === 'examen') return st.elapsed;
    return (st.spent[idx] || 0) + (idx === st.index ? st.elapsed - st.entryAt : 0);
  };

  const render = (opts = {}) => {
    if (!st || !st.container) return;
    const b = st.bundle;
    st.container.innerHTML = root.MathFlowExerciceRenderer.renderExercisePage({
      title: b.title, subtitle: b.subtitle, backHash: b.backHash,
      year: b.year, session: b.session, duration: b.duration, totalPoints: b.totalPoints, coefficient: b.coefficient,
      mode: st.mode, index: st.index, timerText: fmtTime(st.elapsed),
      exercises: st.parsed, ratings: st.ratings, revealed: st.revealed, openHints: st.openHints
    });
    if (root.MathFlowResumeStore) root.MathFlowResumeStore.syncExerciseDetails(st.container, st);
    if (opts.top) scrollTop();
    const target = opts.focusSel ? st.container.querySelector(opts.focusSel) : null;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  };

  const goTo = (n, focusSel) => {
    if (!st) return;
    const next = Math.max(0, Math.min(st.parsed.length - 1, Number(n) || 0));
    if (next === st.index) return;
    st.spent[st.index] = (st.spent[st.index] || 0) + (st.elapsed - st.entryAt);
    st.index = next;
    st.entryAt = st.elapsed;
    if (root.MathFlowResumeStore) root.MathFlowResumeStore.snapshotExerciseState(st.bundle.storageKey, st);
    render({ top: true, focusSel: focusSel || '.exo-stage' });
  };

  async function validateExercise() {
    const s = st;
    if (!s || !s.parsed.length || s.parsed[s.index].failed) return;
    const idx = s.index;
    const modals = root.MathFlowUiModals;
    const asked = Boolean(modals && typeof modals.openExerciseCompleteDialog === 'function');
    let res = null;
    if (asked) {
      res = await modals.openExerciseCompleteDialog(timeFor(idx));
      if (res == null) return;
    }
    if (st !== s) return;
    const rating = res && typeof res === 'object' ? res.rating : res;
    if (asked && (rating === 0 || rating === 1 || rating === 2)) { s.ratings[idx] = rating; s.dirty = true; persistRatings(); }
    s.revealed[idx] = true;
    if (typeof app().playTone === 'function') app().playTone('ok');
    render({ focusSel: '[data-a="validate"]' });
  }

  async function retryExercise(index) {
    const s = st, svc = root.ContentService;
    const meta = s && s.bundle.exercises[index];
    if (!s || !meta || !meta.failed || !meta.path || !svc) return;
    try {
      const ex = typeof svc.getExercise === 'function' ? await svc.getExercise(meta.path) : await svc.fetchJson(meta.path);
      if (!ex) throw new Error('Fichier vide.');
      if (st !== s) return;
      const full = { id: meta.id || ex.id, basePath: dirOf(meta.path), ...ex };
      s.bundle.exercises[index] = full;
      s.parsed[index] = parseOne(full);
    } catch (err) {
      if (st !== s) return;
      s.parsed[index] = { ...s.parsed[index], error: 'Toujours indisponible (' + (err && err.message ? err.message : 'réseau') + ').' };
    }
    render({ focusSel: '.exo-stage' });
  }

  const toggleHint = (btn) => {
    const id = btn.getAttribute('data-hint-toggle');
    if (!id || !st || !st.container) return;
    const panel = st.container.querySelector('#' + (root.CSS && root.CSS.escape ? root.CSS.escape(id) : id));
    const nextOpen = panel ? panel.hidden : !st.openHints.has(id);
    if (nextOpen) st.openHints.add(id); else st.openHints.delete(id);
    btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (panel) panel.hidden = !nextOpen;
    saveExoResume();
  };
  const onToggleSol = (e) => { if (root.MathFlowResumeStore) root.MathFlowResumeStore.handleExerciseSolToggle(st, e.target); };
  const onClick = (e) => {
    if (!st || !e.target || typeof e.target.closest !== 'function') return;
    const hintBtn = e.target.closest('[data-hint-toggle]');
    if (hintBtn) { toggleHint(hintBtn); return; }
    if (e.target.closest('[data-exm]')) { st.mode = st.mode === 'examen' ? 'pas-a-pas' : 'examen'; saveExoResume(); render({ focusSel: '[data-exm]' }); return; }
    if (e.target.closest('[data-action-print]')) { if (typeof root.print === 'function') root.print(); return; }
    const pill = e.target.closest('[data-exo-idx]');
    if (pill) { goTo(Number(pill.getAttribute('data-exo-idx')) || 0, '.exo-pill.is-active'); return; }
    const act = e.target.closest('[data-a]');
    if (!act) return;
    const name = act.getAttribute('data-a');
    if (name === 'prev') goTo(st.index - 1, '[data-a="prev"]:not([disabled]), .exo-stage');
    else if (name === 'next') goTo(st.index + 1, '[data-a="next"]:not([disabled]), .exo-stage');
    else if (name === 'validate') validateExercise();
    else if (name === 'retry') retryExercise(Number(act.getAttribute('data-retry')) || st.index);
  };

  const onKeyDown = (e) => {
    if (!st || st.mode !== 'pas-a-pas' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const d = doc(), t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (d && d.querySelector('[role="dialog"]:not([hidden]), dialog[open], .modal.is-open')) return;
    goTo(st.index + (e.key === 'ArrowRight' ? 1 : -1), '.exo-stage');
  };

  const showError = (container, err) => {
    const msg = esc(err && err.message ? err.message : 'Erreur inconnue');
    container.innerHTML = `<header class="top"><a class="back" href="#learn">← Retour</a></header><section class="end" role="alert"><h2>Impossible de charger les exercices</h2><p>${msg}</p><a class="btn primary" href="#learn">Retour</a></section>`;
  };

  async function mount(container, params = {}) {
    unmount();
    if (!container) return;
    const token = ++mountToken;
    const d = doc();
    if (d && d.body) d.body.dataset.v = 'exo';
    container.innerHTML = '<div class="ctx" role="status">Chargement des exercices...</div>';
    try {
      const bundle = await loadExercises(params);
      if (token !== mountToken) return;
      if (bundle.kind !== 'national' && (params.chapterId || params.chapter) && root.MathFlowUnlocks && typeof root.MathFlowUnlocks.verifyStepAccess === 'function') {
        const gate = await root.MathFlowUnlocks.verifyStepAccess(params, 'exercises');
        if (token !== mountToken) return;
        if (gate && !gate.allowed) return root.MathFlowUnlocks.renderLockedView(container, gate, bundle.backHash || '#learn');
      }
      const parsed = bundle.exercises.map(parseOne);
      const ratings = loadSavedRatings(bundle.storageKey, parsed.length, bundle.altStorageKey);
      const rs = root.MathFlowResumeStore;
      const explicitIdx = Boolean(params.exerciseId || (params.index != null && params.index !== ''));
      const h = rs && typeof rs.hydrateExerciseState === 'function' ? rs.hydrateExerciseState(bundle.storageKey, ratings, bundle.defaultMode || 'pas-a-pas', explicitIdx) : null;
      st = {
        container, bundle, parsed, mode: (params.mode ? bundle.defaultMode : (h && h.mode)) || bundle.defaultMode || 'pas-a-pas',
        index: explicitIdx ? Math.min(bundle.startIndex || 0, Math.max(0, parsed.length - 1)) : (h ? h.index : 0),
        ratings, revealed: h ? h.revealed : ratings.map((r) => r != null), openHints: h ? h.openHints : new Set(), openSolutions: h ? h.openSolutions : new Set(),
        elapsed: h ? h.elapsed : 0, entryAt: h ? h.elapsed : 0, spent: h ? h.spent : new Array(parsed.length).fill(0), paused: false, timerHandle: null, dirty: false
      };
      st.persistHide = () => { persistRatings(); saveExoResume(); };
      container.addEventListener('click', onClick); container.addEventListener('toggle', onToggleSol, true);
      if (d) d.addEventListener('keydown', onKeyDown);
      if (typeof root.addEventListener === 'function') root.addEventListener('pagehide', st.persistHide);
      render();
      startStopwatch();
      if (typeof app().recordLastVisited === 'function' && parsed.length) {
        const hash = root.location && root.location.hash ? root.location.hash
          : (bundle.kind === 'national' ? '#examen-' + encodeURIComponent(bundle.storageKey) : '#exo-' + encodeURIComponent(params.chapterId || ''));
        app().recordLastVisited({
          hash, title: bundle.title || 'Exercices',
          kind: bundle.kind === 'national' ? 'national' : 'exo',
          chapterId: bundle.kind === 'national' ? null : (params.chapterId || null)
        });
      }
    } catch (err) {
      if (token !== mountToken) return;
      showError(container, err);
    }
  }

  function unmount() {
    mountToken++;
    stopTimer();
    if (!st) return;
    persistRatings();
    saveExoResume();
    if (st.container) { st.container.removeEventListener('click', onClick); st.container.removeEventListener('toggle', onToggleSol, true); }
    const d = doc();
    if (d) d.removeEventListener('keydown', onKeyDown);
    if (typeof root.removeEventListener === 'function' && st.persistHide) root.removeEventListener('pagehide', st.persistHide);
    st = null;
  }

  return { mount, unmount };
});
