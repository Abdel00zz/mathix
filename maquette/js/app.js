/**
 * MathFlow — App Shell, Precision Timer, WebAudio & SPA Hash Router
 */
(function (global) {
  'use strict';

  const KEY_PROFILE = 'ap-p', KEY_STATE = 'ap', KEY_RESET_AT = 'ap-reset-at', KEY_ACCOUNT_OWNER = 'ap-owner';
  const OLD_SET = 'mathflow_student_settings_v2', OLD_ST = 'mathflow_student_state_v2';
  const VIEWS = ['learn', 'lib', 'les', 'quiz', 'exo'];
  const TABS = [['learn', 'Apprendre'], ['examens', 'Examens nationaux'], ['problemes', 'Problèmes'], ['prepa', 'Prépa concours']];
  const DEFAULT_PROFILE = { th: 'auto', cls: '2eme-bac-sc-ex', fn: '', ln: '', sc: '', docFont: 'literata', docScale: 1, tiersTemps: false, soundEnabled: false, lexiconAutoHighlight: true, reduceMotion: false, quizTimePerQuestion: 120 };
  const DEFAULT_STATE = { q: {}, e: {}, l: {}, lastVisited: null };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const UNSAFE = { __proto__: 1, constructor: 1, prototype: 1 };
  const stripUnsafe = o => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out = {};
    for (const k of Object.keys(o)) if (!UNSAFE[k]) out[k] = o[k];
    return out;
  };
  const lsGet = k => { try { const r = global.localStorage && global.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
  const lsDel = k => { try { if (global.localStorage) global.localStorage.removeItem(k); } catch {} };
  const lsSet = (k, v) => {
    const ls = global.localStorage;
    if (!ls) return false;
    const raw = JSON.stringify(v);
    try { ls.setItem(k, raw); return true; } catch (e) {
      const q = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
      if (q && global.MathFlowResumeStore && typeof global.MathFlowResumeStore.evictForQuota === 'function' && global.MathFlowResumeStore.evictForQuota()) {
        try { ls.setItem(k, raw); return true; } catch {}
      }
      return false;
    }
  };
  const readResetAt = () => { const n = Number(lsGet(KEY_RESET_AT)); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const writeResetAt = ts => { const n = Number(ts); if (Number.isFinite(n) && n > 0) lsSet(KEY_RESET_AT, Math.round(n)); else lsDel(KEY_RESET_AT); };
  const escapeHtml = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function isSafeUrl(url) {
    const v = String(url || '').trim();
    if (!v || /^[\s\x00-\x1f]*(javascript|vbscript|data):/i.test(v)) return false;
    return v.startsWith('#') || /^[a-zA-Z0-9._/-]+$/.test(v);
  }

  function formatTime(sec) {
    const n = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  }

  function migrateUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('#')) return isSafeUrl(url) ? url : null;
    const q = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    if (url.includes('lecon') && q.get('chapter')) return '#lecon-' + encodeURIComponent(q.get('chapter'));
    if (url.includes('quiz') && q.get('concours')) return '#concours-' + encodeURIComponent(q.get('concours'));
    if (url.includes('quiz') && q.get('chapter')) return '#quiz-' + encodeURIComponent(q.get('chapter'));
    if (url.includes('exercice') && q.get('chapter')) return '#exo-' + encodeURIComponent(q.get('chapter'));
    return null;
  }

  function normalizeProfile(raw) {
    const p = Object.assign({}, DEFAULT_PROFILE, stripUnsafe(raw));
    p.th = p.th === 'light' || p.th === 'dark' ? p.th : 'auto';
    p.cls = String(p.cls || DEFAULT_PROFILE.cls).trim().replace(/[^a-z0-9_-]/gi, '') || DEFAULT_PROFILE.cls;
    p.docScale = Math.min(1.4, Math.max(0.85, Number(p.docScale) || 1));
    p.docFont = ['literata', 'serif', 'sans'].includes(p.docFont) ? p.docFont : 'literata';
    p.tiersTemps = Boolean(p.tiersTemps); p.soundEnabled = Boolean(p.soundEnabled);
    p.lexiconAutoHighlight = p.lexiconAutoHighlight !== false; p.reduceMotion = Boolean(p.reduceMotion);
    p.quizTimePerQuestion = Math.max(15, Number(p.quizTimePerQuestion) || 120);
    return p;
  }

  function normalizeLastVisited(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const lv = stripUnsafe(raw);
    const hash = typeof lv.hash === 'string' && isSafeUrl(lv.hash) ? lv.hash : (typeof lv.url === 'string' ? migrateUrl(lv.url) : null);
    const out = { title: typeof lv.title === 'string' ? lv.title : (typeof lv.chapterTitle === 'string' ? lv.chapterTitle : ''), at: Number(lv.at) || Date.now() };
    const h = hash || (lv.chapterId ? '#lecon-' + encodeURIComponent(String(lv.chapterId)) : '');
    if (h) out.hash = h;
    if (typeof lv.href === 'string' && lv.href.startsWith('/') && !/[\x00-\x1f]/.test(lv.href)) out.href = lv.href;
    if (typeof lv.url === 'string' && isSafeUrl(lv.url)) out.url = lv.url;
    if (typeof lv.kind === 'string' || typeof lv.type === 'string') out.kind = typeof lv.kind === 'string' ? lv.kind : lv.type;
    if (typeof lv.chapterId === 'string' && lv.chapterId) out.chapterId = lv.chapterId;
    if (typeof lv.classId === 'string') { const c = lv.classId.trim().replace(/[^a-z0-9_-]/gi, ''); if (c) out.classId = c; }
    return out;
  }

  function normalizeState(raw) {
    const st = Object.assign({}, DEFAULT_STATE, stripUnsafe(raw));
    st.q = stripUnsafe(st.q); st.e = stripUnsafe(st.e); st.l = stripUnsafe(st.l);
    st.lastVisited = normalizeLastVisited(st.lastVisited);
    return st;
  }

  function initStorage() {
    let p = lsGet(KEY_PROFILE);
    let s = lsGet(KEY_STATE);
    const oldSet = !p ? lsGet(OLD_SET) : null;
    const oldSt = (!p || !s) ? lsGet(OLD_ST) : null;
    if (!p && (oldSet || oldSt)) {
      const rt = (oldSet && oldSet.readingTheme) || {};
      const sp = (oldSt && oldSt.studentProfile) || {};
      const parts = String(sp.name || '').trim().split(/\s+/).filter(Boolean);
      p = normalizeProfile({
        cls: (oldSt && oldSt.selectedClassId) || (/math/i.test(sp.level || '') ? '2eme-bac-sc-math' : '2eme-bac-sc-ex'),
        fn: parts[0] || '', ln: parts.slice(1).join(' '), sc: sp.school || '',
        docFont: rt.docFont === 'sans' ? 'sans' : 'literata', docScale: Number(rt.docScale) || 1,
        tiersTemps: Boolean(oldSet && oldSet.tiersTemps), soundEnabled: Boolean(oldSet && oldSet.soundEnabled),
        lexiconAutoHighlight: !oldSet || oldSet.lexiconAutoHighlight !== false,
        reduceMotion: Boolean(oldSet && oldSet.reduceMotion),
        quizTimePerQuestion: (oldSet && Number(oldSet.quizTimePerQuestion)) || 120
      });
      lsSet(KEY_PROFILE, p);
    }
    if (!s && oldSt) {
      const lv = oldSt.lastVisited && typeof oldSt.lastVisited === 'object' ? oldSt.lastVisited : null;
      s = normalizeState({
        q: oldSt.q || {}, e: oldSt.e || {}, l: oldSt.l || {},
        lastVisited: lv ? {
          hash: lv.hash || migrateUrl(lv.url) || (lv.chapterId ? '#lecon-' + encodeURIComponent(lv.chapterId) : null),
          title: lv.title || lv.chapterTitle || '', kind: lv.kind || lv.type || 'lesson', chapterId: lv.chapterId || null
        } : null
      });
      lsSet(KEY_STATE, s);
    }
    return [normalizeProfile(p), normalizeState(s)];
  }

  let [P, S] = initStorage();

  function applyTheme(profile) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    const p = profile || P;
    const root = document.documentElement;
    if (p.th === 'light' || p.th === 'dark') root.dataset.theme = p.th;
    else delete root.dataset.theme;
    const scaleStr = String(p.docScale || 1);
    root.style.setProperty('--doc-scale', scaleStr);
    root.style.setProperty('--reading-doc-scale', scaleStr);
    root.style.setProperty('--mf-doc-scale', scaleStr);
    root.setAttribute('data-doc-font', p.docFont || 'literata');
    root.setAttribute('data-reduce-motion', p.reduceMotion ? 'true' : 'false');
    const name = String(p.fn || '').trim() || 'Ali';
    const hi = $('#hi');
    if (hi) hi.textContent = 'Bonjour ' + name;
  }

  const timer = (() => {
    let acc = 0, t0 = 0, running = false, live = false, manualPause = false;
    let el = null, id = 0, cdSec = null, onTick = null, onTimeout = null, timedOut = false;
    const now = () => (global.performance && typeof global.performance.now === 'function') ? global.performance.now() : Date.now();
    const halt = () => { if (running) { acc += now() - t0; running = false; } };
    const unhalt = () => { if (!running && !timedOut) { t0 = now(); running = true; } };
    const elapsedSec = () => Math.max(0, Math.round((acc + (running ? now() - t0 : 0)) / 1000));
    const remainingSec = () => (cdSec != null ? Math.max(0, cdSec - elapsedSec()) : null);
    function draw() {
      const sec = elapsedSec(), rem = remainingSec();
      if (el) el.textContent = formatTime(rem != null ? rem : sec);
      if (typeof onTick === 'function') onTick(sec, rem);
      if (cdSec != null && rem <= 0 && !timedOut) { timedOut = true; stop(); if (typeof onTimeout === 'function') onTimeout(); }
    }
    function start(opts) {
      stop();
      const cfg = (opts && typeof opts === 'object' && !('nodeType' in opts)) ? opts : { el: opts };
      acc = 0; running = false; live = true; manualPause = false; timedOut = false;
      el = cfg.el || null; onTick = cfg.onTick || null; onTimeout = cfg.onTimeout || null;
      const baseCd = Number(cfg.countdownSec) > 0 ? Math.round(Number(cfg.countdownSec)) : null;
      const applyTiers = cfg.tiersTemps !== undefined ? Boolean(cfg.tiersTemps) : Boolean(P.tiersTemps);
      cdSec = baseCd ? (applyTiers ? Math.round(baseCd * 1.33) : baseCd) : null;
      if (typeof document === 'undefined' || !document.hidden) unhalt();
      id = setInterval(draw, 1000);
      draw();
    }
    function pause() { manualPause = true; halt(); }
    function resume() { manualPause = false; if (live && (typeof document === 'undefined' || !document.hidden)) unhalt(); }
    function stop() { live = false; manualPause = false; halt(); clearInterval(id); id = 0; }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => (document.hidden ? halt() : (live && !manualPause && unhalt())));
    }
    return {
      start, go: start, pause, resume, stop, end: stop,
      isLive: () => live, s: elapsedSec, getElapsed: elapsedSec, getRemaining: remainingSec, format: formatTime
    };
  })();

  let audioCtx = null;
  function playTone(kind) {
    if (!P.soundEnabled) return;
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return;
    const k = kind === 'correct' || kind === 'complete' ? 'ok' : kind === 'wrong' ? 'bad' : kind === 'tap' ? 'tick' : kind;
    try {
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      const cfg = k === 'ok' ? ['sine', 523.25, 659.25, 0.08, 0.25] : k === 'bad' ? ['triangle', 240, 190, 0.08, 0.26] : ['sine', 620, 620, 0.035, 0.055];
      osc.type = cfg[0]; osc.frequency.setValueAtTime(cfg[1], t);
      if (cfg[2] !== cfg[1]) osc.frequency.setValueAtTime(cfg[2], t + 0.09);
      g.gain.setValueAtTime(cfg[3], t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg[4]);
      osc.start(t); osc.stop(t + cfg[4] + 0.01);
    } catch {}
  }

  const decodePart = s => { try { return decodeURIComponent(s || ''); } catch { return s || ''; } };
  function parseRoute(hashStr) {
    const raw = String(hashStr || '').replace(/^#/, '').trim();
    const sep = raw.search(/[&?]/);
    const head = sep >= 0 ? raw.slice(0, sep) : raw;
    const q = new URLSearchParams(sep >= 0 ? raw.slice(sep + 1) : '');
    if (!head || head === 'learn') return { view: 'learn', tab: 'learn', title: 'Programme' };
    if (head === 'examens' || head === 'problemes' || head === 'prepa') {
      return { view: 'lib', tab: head, title: (TABS.find(t => t[0] === head) || [, head])[1] };
    }
    if (head.startsWith('lecon-')) return { view: 'les', title: 'Leçon', ctrl: 'LeconPage', opts: { chapterId: decodePart(head.slice(6)), sheetId: q.get('sheet') || null, kind: 'lesson' } };
    if (head.startsWith('probleme-')) return { view: 'les', title: 'Problème', ctrl: 'LeconPage', opts: { problemeId: decodePart(head.slice(9)), kind: 'probleme' } };
    if (head.startsWith('quiz-')) return { view: 'quiz', title: 'Quiz', ctrl: 'QuizPage', opts: { chapterId: decodePart(head.slice(5)), quizId: q.get('quiz') || null, kind: 'chapter' } };
    if (head.startsWith('concours-')) return { view: 'quiz', title: 'Concours', ctrl: 'QuizPage', opts: { schoolId: decodePart(head.slice(9)), annaleId: q.get('annale') || null, quizId: q.get('quiz') || null, kind: 'concours' } };
    if (head.startsWith('exo-')) return { view: 'exo', title: 'Exercices', ctrl: 'ExercicePage', opts: { chapterId: decodePart(head.slice(4)), exerciseId: q.get('ex') || null, mode: q.get('mode') || null, kind: 'chapter' } };
    if (head.startsWith('examen-')) return { view: 'exo', title: 'Examen national', ctrl: 'ExercicePage', opts: { examId: decodePart(head.slice(7)), exerciseId: q.get('ex') || null, mode: q.get('mode') || null, kind: 'national' } };
    return { view: 'learn', tab: 'learn', title: 'Programme' };
  }

  let activeCtrl = null;
  function route() {
    if (typeof document === 'undefined') return;
    const r = parseRoute(global.location ? global.location.hash : '#learn');
    timer.stop();
    if (activeCtrl && typeof activeCtrl.unmount === 'function') { try { activeCtrl.unmount(); } catch {} }
    activeCtrl = null;
    document.body.dataset.v = r.view;
    VIEWS.forEach(k => { const el = $('#' + k); if (el) el.hidden = k !== r.view; });
    const soonEl = $('#soon');
    if (soonEl) soonEl.hidden = true;
    document.title = 'Apprendre — ' + r.title;
    const targetEl = $('#' + r.view);
    let nextCtrl = null;
    if (r.view === 'learn' && global.ProgrammePage) { nextCtrl = global.ProgrammePage; Promise.resolve(nextCtrl.mountLearn(targetEl)).catch(() => {}); }
    else if (r.view === 'lib' && global.ProgrammePage) { nextCtrl = global.ProgrammePage; Promise.resolve(nextCtrl.mountLibrary(targetEl, r.tab)).catch(() => {}); }
    else if (r.ctrl && global[r.ctrl] && typeof global[r.ctrl].mount === 'function') {
      nextCtrl = global[r.ctrl];
      Promise.resolve(nextCtrl.mount(targetEl, r.opts)).catch(() => {});
    }
    activeCtrl = nextCtrl;
    if (typeof global.scrollTo === 'function') global.scrollTo(0, 0);
    const focusEl = $('#' + r.view + ' [tabindex="-1"]');
    if (focusEl && typeof focusEl.focus === 'function') focusEl.focus({ preventScroll: true });
  }

  function withViewTransition(cb) {
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && !P.reduceMotion) {
      return document.startViewTransition(cb);
    }
    return cb();
  }

  let cachedClasses = null;

  function fallbackClasses() {
    return [
      { id: 'tronc-commun-sc', title: 'Tronc Commun Scientifique', shortName: 'Tronc Commun' },
      { id: '1ere-bac-sc-ex', title: '1ʳᵉ Bac Sciences Expérimentales', shortName: '1Bac Sc. Ex' },
      { id: '1ere-bac-sc-math', title: '1ʳᵉ Bac Sciences Mathématiques', shortName: '1Bac Sc. Math' },
      { id: '2eme-bac-sc-ex', title: '2ᵉ Bac Sciences Expérimentales', shortName: '2Bac Sc. Ex' },
      { id: '2eme-bac-sc-math', title: '2ᵉ Bac Sciences Mathématiques', shortName: '2Bac Sc. Math' }
    ];
  }

  function getCachedClasses() {
    return (cachedClasses && cachedClasses.length ? cachedClasses : fallbackClasses()).slice();
  }

  async function getAvailableClasses() {
    if (cachedClasses && cachedClasses.length) return cachedClasses.slice();
    try {
      if (global.ContentService && typeof global.ContentService.getMasterManifest === 'function') {
        const manifest = await global.ContentService.getMasterManifest();
        if (manifest && Array.isArray(manifest.classes) && manifest.classes.length) {
          cachedClasses = manifest.classes
            .map(c => ({ id: c.id, title: c.title || c.name || c.id, shortName: c.shortName || c.title || c.name || c.id }))
            .filter(c => Boolean(c.id));
          if (cachedClasses.length) return cachedClasses.slice();
        }
      }
    } catch {}
    return fallbackClasses();
  }

  const listeners = new Map();
  function on(evt, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => { const s = listeners.get(evt); if (s) s.delete(fn); };
  }
  function emit(evt, detail) {
    const s = listeners.get(evt);
    if (s) s.forEach(fn => { try { fn(detail); } catch {} });
  }

  function init() {
    if (typeof document === 'undefined') return;
    applyTheme(P);
    if (global.MathFlowUiModals && typeof global.MathFlowUiModals.init === 'function') global.MathFlowUiModals.init();
    global.addEventListener('hashchange', () => withViewTransition(() => { route(); emit('route:change', parseRoute()); }));
    getAvailableClasses().catch(() => {});
    route();
    emit('route:change', parseRoute());
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else Promise.resolve().then(init);
  }

  const MathFlowApp = {
    DEFAULT_PROFILE, DEFAULT_STATE, TABS, on, emit,
    getProfile: () => Object.assign({}, P), getSettings: () => Object.assign({}, P),
    updateProfile(patch, opts) {
      const stamp = opts && opts.silent ? (P.profileUpdatedAt || 0) : Date.now();
      P = normalizeProfile(Object.assign({}, P, patch, { profileUpdatedAt: stamp }));
      lsSet(KEY_PROFILE, P);
      applyTheme(P);
      if (!opts || !opts.silent) emit('profile:change', Object.assign({}, P));
      return Object.assign({}, P);
    },
    updateSettings(patch, opts) { return MathFlowApp.updateProfile(patch, opts); },
    getState: () => S, getStudentState: () => S,
    saveState(next, opts) {
      S = normalizeState(next || S);
      lsSet(KEY_STATE, S);
      if (!opts || !opts.silent) emit('state:change', S);
      return S;
    },
    saveStudentState(next, opts) { return MathFlowApp.saveState(next, opts); },
    resetProgress(opts) {
      S = normalizeState(null);
      lsSet(KEY_STATE, S);
      if (opts && opts.clearResetAt) lsDel(KEY_RESET_AT);
      else writeResetAt((opts && Number(opts.resetAt)) || Date.now());
      if (global.MathFlowUnlocks && typeof global.MathFlowUnlocks.clearStickyUnlocks === 'function') {
        global.MathFlowUnlocks.clearStickyUnlocks();
      } else lsDel('ap-u');
      if (global.MathFlowResumeStore && typeof global.MathFlowResumeStore.clearAll === 'function') {
        global.MathFlowResumeStore.clearAll();
      } else lsDel('ap-resume');
      if (!opts || !opts.silent) emit('state:reset', S);
      return S;
    },
    getActiveClassId: () => P.cls || DEFAULT_PROFILE.cls,
    getResetAt: readResetAt,
    setResetAt: writeResetAt,
    getAccountOwner: () => { const v = lsGet(KEY_ACCOUNT_OWNER); return typeof v === 'string' && v ? v : null; },
    setAccountOwner: id => { if (id) lsSet(KEY_ACCOUNT_OWNER, String(id)); else lsDel(KEY_ACCOUNT_OWNER); },
    normalizeLastVisited,
    getCachedClasses, getAvailableClasses,
    recordLastVisited(info, opts) {
      S.lastVisited = info ? normalizeLastVisited(Object.assign({ at: Date.now() }, info)) : null;
      lsSet(KEY_STATE, S);
      if (!opts || !opts.silent) emit('state:change', S);
    },
    applyTheme, timer, playTone, playSound: playTone, formatTime,
    parseRoute, route, withViewTransition, escapeHtml, isSafeUrl, init
  };

  global.MathFlowApp = MathFlowApp;
  if (typeof module !== 'undefined' && module.exports) module.exports = MathFlowApp;
})(typeof globalThis !== 'undefined' ? globalThis : window);
