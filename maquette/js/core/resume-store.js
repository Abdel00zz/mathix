/**
 * MathFlow — Persistance fine de reprise d'etude (ap-resume)
 * Memorise position exacte de lecon, blancs reveles, brouillons/etapes de quiz et exercices.
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathFlowResumeStore = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  'use strict';

  const STORAGE_KEY = 'ap-resume', SCHEMA_VERSION = 2, MAX_ENTRIES = 120;
  const UNSAFE = { __proto__: 1, constructor: 1, prototype: 1 };
  const empty = () => ({ schemaVersion: SCHEMA_VERSION, lessons: {}, lessonActiveSheet: {}, quizzes: {}, chapterActiveQuiz: {}, exercises: {} });
  const stripMap = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const k of Object.keys(raw)) if (!UNSAFE[k]) out[k] = raw[k];
    return out;
  };
  const entryTs = (v) => (v && typeof v === 'object' && Number.isFinite(Number(v.updatedAt)) && Number(v.updatedAt) > 0) ? Math.round(Number(v.updatedAt)) : 0;
  const normalizeMode = (m) => (m === 'pas' || m === 'pas-a-pas') ? 'pas' : (m === 'examen' ? 'examen' : null);

  function pruneOldest(map, limit) {
    const cap = limit || MAX_ENTRIES, entries = Object.entries(stripMap(map));
    if (entries.length <= cap) return Object.fromEntries(entries);
    entries.sort((a, b) => entryTs(b[1]) - entryTs(a[1]));
    return Object.fromEntries(entries.slice(0, cap));
  }

  function cleanStore(raw, resetAt) {
    const src = stripMap(raw), rAt = Number(resetAt) > 0 ? Number(resetAt) : 0, keepTs = (v) => !rAt || entryTs(v) > rAt, out = empty();
    for (const b of ['lessons', 'quizzes']) {
      for (const [k, v] of Object.entries(stripMap(src[b]))) if (v && typeof v === 'object' && keepTs(v)) out[b][k] = v;
    }
    for (const [k, v] of Object.entries(stripMap(src.lessonActiveSheet))) {
      if (v && typeof v === 'object' && typeof v.sheetId === 'string' && v.sheetId && keepTs(v)) out.lessonActiveSheet[k] = v;
    }
    for (const [k, v] of Object.entries(stripMap(src.chapterActiveQuiz))) {
      if (typeof v === 'string' && v) { if (!rAt) out.chapterActiveQuiz[k] = { quizId: v, updatedAt: 0 }; }
      else if (v && typeof v === 'object' && typeof v.quizId === 'string' && v.quizId && keepTs(v)) out.chapterActiveQuiz[k] = { quizId: v.quizId, updatedAt: entryTs(v) };
    }
    for (const [k, v] of Object.entries(stripMap(src.exercises))) {
      if (!v || typeof v !== 'object' || !keepTs(v)) continue;
      const mode = normalizeMode(v.mode);
      out.exercises[k] = mode ? Object.assign({}, v, { mode }) : v;
    }
    return out;
  }

  function readAll() {
    try {
      const raw = root && root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty();
      const p = JSON.parse(raw);
      return (!p || typeof p !== 'object' || Array.isArray(p)) ? empty() : cleanStore(p, 0);
    } catch (_) { return empty(); }
  }

  function serializeWithCap(next, cap) {
    const c = cleanStore(next, 0);
    return JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      lessons: pruneOldest(c.lessons, cap), lessonActiveSheet: pruneOldest(c.lessonActiveSheet, cap),
      quizzes: pruneOldest(c.quizzes, cap), chapterActiveQuiz: pruneOldest(c.chapterActiveQuiz, cap), exercises: pruneOldest(c.exercises, cap)
    });
  }

  function writeAll(next) {
    const ls = root && root.localStorage;
    if (!ls) return;
    for (const cap of [MAX_ENTRIES, 60, 24, 8]) {
      try { ls.setItem(STORAGE_KEY, serializeWithCap(next, cap)); return; } catch (e) {
        if (!(e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014))) return;
      }
    }
  }

  function evictForQuota() {
    const ls = root && root.localStorage, prev = ls && ls.getItem(STORAGE_KEY);
    if (!prev) return false;
    const cur = readAll();
    const maxLen = Math.max(Object.keys(cur.lessons).length, Object.keys(cur.quizzes).length, Object.keys(cur.exercises).length, Object.keys(cur.lessonActiveSheet).length, Object.keys(cur.chapterActiveQuiz).length);
    const targetCap = maxLen > 12 ? Math.max(8, Math.floor(maxLen / 2)) : 0;
    if (!targetCap) { try { ls.removeItem(STORAGE_KEY); return true; } catch (_) { return false; } }
    try {
      const nextRaw = serializeWithCap(cur, targetCap);
      if (nextRaw.length < prev.length) ls.setItem(STORAGE_KEY, nextRaw);
      else ls.removeItem(STORAGE_KEY);
      return true;
    } catch (_) { try { ls.removeItem(STORAGE_KEY); return true; } catch (_2) { return false; } }
  }

  function clearAll() { try { if (root && root.localStorage) root.localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  const cleanSeg = (s) => String(s || '').trim().replace(/[^a-zA-Z0-9._-]/g, '');
  const buildLessonScrollKey = (c, ch, sh) => (cleanSeg(c) ? `${cleanSeg(c)}:` : '') + `${cleanSeg(ch)}:${cleanSeg(sh)}`;
  const buildProblemScrollKey = (c, p) => cleanSeg(c) ? `prob:${cleanSeg(c)}:${cleanSeg(p)}` : `prob:${cleanSeg(p)}`;
  const buildLessonActiveSheetKey = (c, ch) => cleanSeg(c) ? `${cleanSeg(c)}:${cleanSeg(ch)}` : cleanSeg(ch);
  const buildConcoursSessionKey = (c, sc, an) => `concours:${cleanSeg(c) ? cleanSeg(c) + ':' : ''}${cleanSeg(sc)}:${cleanSeg(an)}`;

  function getLesson(key, legacyKey) {
    if (!key) return null;
    const l = readAll().lessons;
    return l[key] || (legacyKey && l[legacyKey]) || null;
  }
  function saveLesson(key, patch) {
    if (!key || UNSAFE[key]) return;
    const store = readAll();
    const prev = store.lessons[key] || {};
    const pct = typeof patch.pct === 'number' ? Math.max(0, Math.min(100, Math.round(patch.pct))) : (prev.pct || 0);
    const maxPct = Math.max(prev.maxPct || 0, typeof patch.maxPct === 'number' ? Math.round(patch.maxPct) : pct);
    store.lessons[key] = Object.assign({}, prev, patch, { pct, maxPct: Math.max(0, Math.min(100, maxPct)), updatedAt: Date.now() });
    writeAll(store);
  }

  function getLessonActiveSheet(chapterId, classId) {
    if (!chapterId) return null;
    const m = readAll().lessonActiveSheet;
    const scoped = classId ? buildLessonActiveSheetKey(classId, chapterId) : '';
    return (scoped && m[scoped]) || m[chapterId] || null;
  }
  function saveLessonActiveSheet(chapterId, ref, classId) {
    if (!chapterId || !ref || !ref.sheetId) return;
    const key = classId ? buildLessonActiveSheetKey(classId, chapterId) : chapterId;
    if (!key || UNSAFE[key]) return;
    const store = readAll();
    store.lessonActiveSheet[key] = Object.assign({}, ref, { updatedAt: Date.now() });
    writeAll(store);
  }

  function getQuiz(key, legacyKey) {
    if (!key) return null;
    const q = readAll().quizzes;
    return q[key] || (legacyKey && q[legacyKey]) || null;
  }
  function saveQuiz(key, snap) {
    if (!key || UNSAFE[key]) return;
    const store = readAll();
    store.quizzes[key] = Object.assign({}, snap, { updatedAt: Date.now() });
    writeAll(store);
  }
  function clearQuiz(key) {
    if (!key) return;
    const store = readAll();
    if (store.quizzes[key]) { delete store.quizzes[key]; writeAll(store); }
  }

  function getChapterActiveQuiz(key, legacyKey) {
    if (!key) return null;
    const m = readAll().chapterActiveQuiz;
    const v = m[key] || (legacyKey && m[legacyKey]) || null;
    return typeof v === 'string' ? v : (v && typeof v.quizId === 'string' ? v.quizId : null);
  }
  function saveChapterActiveQuiz(key, qId) {
    if (!key || !qId || UNSAFE[key]) return;
    const store = readAll();
    store.chapterActiveQuiz[key] = { quizId: String(qId), updatedAt: Date.now() };
    writeAll(store);
  }

  function getExercise(key, legacyKey) {
    if (!key) return null;
    const e = readAll().exercises;
    return e[key] || (legacyKey && e[legacyKey]) || null;
  }
  function saveExercise(key, snap) {
    if (!key || UNSAFE[key]) return;
    const store = readAll();
    const mode = snap ? normalizeMode(snap.mode) : null;
    store.exercises[key] = Object.assign({}, snap, mode ? { mode } : {}, { updatedAt: Date.now() });
    writeAll(store);
  }

  function findFirstUnfinishedIndex(total, isDoneFn) {
    for (let i = 0; i < total; i++) if (!isDoneFn(i)) return i;
    return 0;
  }

  function compactSectionLabel(secTitle) {
    const clean = String(secTitle || '').replace(/\s+/g, ' ').trim();
    return clean.length > 34 ? clean.slice(0, 33).trimEnd() + '…' : clean;
  }

  function hydrateQuizState(sessionKey, storeKey, chapId, isSingle, questions, appState) {
    const saved = getQuiz(sessionKey), n = questions.length;
    const cloudRaw = appState && appState.q ? (appState.q[storeKey] || (isSingle && chapId ? appState.q[chapId] : null)) : null;
    const cloudArr = Array.isArray(cloudRaw) ? cloudRaw : (cloudRaw && Array.isArray(cloudRaw.answers) ? cloudRaw.answers : []);
    const answers = new Array(n).fill(null), remainingByIdx = new Array(n).fill(null), drafts = {};
    if (saved) {
      if (saved.answers) Object.entries(saved.answers).forEach(([k, v]) => { const i = Number(k); if (i >= 0 && i < n && v) answers[i] = v; });
      if (Array.isArray(saved.skipped)) saved.skipped.forEach((i) => { if (i >= 0 && i < n && !answers[i]) answers[i] = { status: 'skipped' }; });
      if (saved.drafts) Object.entries(saved.drafts).forEach(([k, d]) => { const i = Number(k); if (i >= 0 && i < n && d) drafts[i] = d; });
      if (saved.remainingByIdx) Object.entries(saved.remainingByIdx).forEach(([k, r]) => { const i = Number(k); if (i >= 0 && i < n && typeof r === 'number') remainingByIdx[i] = r; });
    }
    cloudArr.forEach((sc, i) => {
      if (i >= n) return;
      const q = questions[i];
      const qt = (q && q.type) || 'mcq';
      const canChoiceIdx = sc === 1 && (qt === 'mcq' || qt === 'boolean' || qt === 'error') && q && typeof q.correctIndex === 'number';
      if ((sc === 1 || sc === 0) && (!answers[i] || answers[i].status !== 'answered')) {
        answers[i] = { status: 'answered', isCorrect: sc === 1, selectedIndex: canChoiceIdx ? q.correctIndex : undefined };
      } else if (sc === -1 && !answers[i]) answers[i] = { status: 'skipped' };
    });
    const cleanRev = saved && Array.isArray(saved.reviewQueue) ? saved.reviewQueue.filter((i) => Number.isInteger(i) && i >= 0 && i < n) : [];
    const reviewIndices = cleanRev.length ? cleanRev : null;
    const qLen = reviewIndices ? reviewIndices.length : n;
    let view = 'question', index = 0;
    if (saved && saved.phase === 'end' && n) view = 'summary';
    else if (saved && Number.isInteger(saved.idx) && qLen) index = Math.max(0, Math.min(qLen - 1, saved.idx));
    else if (cloudArr.some((x) => x != null) && n) {
      if (cloudRaw && cloudRaw.isSubmitted) view = 'summary';
      else index = findFirstUnfinishedIndex(n, (i) => Boolean(answers[i]));
    }
    return { answers, drafts, remainingByIdx, elapsed: saved ? Math.max(0, Number(saved.elapsedSec) || 0) : 0, reviewIndices, view, index };
  }

  function snapshotQuizState(sessionKey, qId, st) {
    if (!sessionKey || !st) return;
    const answers = {}, drafts = {}, skipped = [], remainingByIdx = {};
    (st.answers || []).forEach((a, i) => {
      if (!a) return;
      if (a.status === 'answered') answers[i] = a; else if (a.status === 'skipped') skipped.push(i);
    });
    (st.drafts || []).forEach((d, i) => { if (d && Object.keys(d).length) drafts[i] = d; });
    (st.remainingByIdx || []).forEach((r, i) => { if (typeof r === 'number') remainingByIdx[i] = r; });
    saveQuiz(sessionKey, {
      selectedQuizId: qId, phase: st.view === 'summary' ? 'end' : 'run', idx: st.index || 0,
      answers, drafts, skipped, remainingByIdx, elapsedSec: st.elapsed || 0,
      reviewQueue: st.reviewIndices || null, totalQuestions: (st.questions || []).length, answeredCount: Object.keys(answers).length
    });
  }

  function hydrateExerciseState(storageKey, ratings, defaultMode, hasExplicitIdx) {
    const n = ratings.length, saved = getExercise(storageKey), revealed = ratings.map((r) => r != null);
    if (saved && Array.isArray(saved.revealed)) saved.revealed.forEach((i) => { if (i >= 0 && i < n) revealed[i] = true; });
    let index = 0;
    if (!hasExplicitIdx) {
      if (saved && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < n) index = saved.index;
      else if (ratings.some((r) => r != null)) index = findFirstUnfinishedIndex(n, (i) => ratings[i] != null);
    }
    const spent = new Array(n).fill(0);
    if (saved && saved.spent) Object.entries(saved.spent).forEach(([k, v]) => { const i = Number(k); if (i >= 0 && i < n) spent[i] = Math.max(0, Number(v) || 0); });
    const savedMode = saved ? normalizeMode(saved.mode) : null;
    const mode = savedMode ? (savedMode === 'pas' && defaultMode === 'pas-a-pas' ? 'pas-a-pas' : savedMode) : (defaultMode || 'pas');
    return {
      index,
      mode,
      openHints: new Set(saved && Array.isArray(saved.openHints) ? saved.openHints : []),
      openSolutions: new Set(saved && Array.isArray(saved.openSolutions) ? saved.openSolutions : []),
      revealed,
      elapsed: saved ? Math.max(0, Number(saved.elapsedSec) || 0) : 0,
      spent
    };
  }

  function snapshotExerciseState(storageKey, st) {
    if (!storageKey || !st) return;
    const spent = {}, revealed = [];
    (st.spent || []).forEach((v, i) => { if (v > 0) spent[i] = v; });
    (st.revealed || []).forEach((v, i) => { if (v) revealed.push(i); });
    const doneCount = (st.ratings || []).filter((r) => r != null).length;
    saveExercise(storageKey, {
      index: st.index || 0, mode: normalizeMode(st.mode) || 'pas',
      openHints: st.openHints ? Array.from(st.openHints) : [],
      openSolutions: st.openSolutions ? Array.from(st.openSolutions) : [],
      revealed, elapsedSec: st.elapsed || 0, spent, totalExercises: (st.parsed || []).length, doneCount
    });
  }

  function syncExerciseDetails(container, st) {
    if (!container || !st) return;
    const sel = st.mode === 'examen' ? '.exo-sheet-item' : '.exo-stage';
    container.querySelectorAll(sel).forEach((sc, sp) => {
      const exI = st.mode === 'examen' ? sp : st.index;
      sc.querySelectorAll('details.sol').forEach((det, pos) => {
        const k = `ex-${exI}-sol-${pos}`;
        det.dataset.solKey = k;
        if (st.openSolutions && st.openSolutions.has(k)) det.open = true;
      });
    });
  }

  function handleExerciseSolToggle(st, target) {
    if (!st || !target || target.tagName !== 'DETAILS' || !target.classList.contains('sol')) return;
    const k = target.dataset.solKey;
    if (!k) return;
    if (target.open) st.openSolutions.add(k); else st.openSolutions.delete(k);
    snapshotExerciseState(st.bundle.storageKey, st);
  }

  function mergeBucket(aMap, bMap, resetAt) {
    const out = {};
    for (const [k, v] of Object.entries(stripMap(aMap))) if (!resetAt || entryTs(v) > resetAt) out[k] = v;
    for (const [k, v] of Object.entries(stripMap(bMap))) {
      if (resetAt && entryTs(v) <= resetAt) continue;
      if (!out[k] || entryTs(v) >= entryTs(out[k])) out[k] = v;
    }
    return pruneOldest(out, MAX_ENTRIES);
  }

  function mergeCloudResumes(localRes, remoteRes, resetAt) {
    const a = cleanStore(localRes, resetAt), b = cleanStore(remoteRes, resetAt);
    return {
      schemaVersion: SCHEMA_VERSION,
      lessons: mergeBucket(a.lessons, b.lessons, resetAt),
      lessonActiveSheet: mergeBucket(a.lessonActiveSheet, b.lessonActiveSheet, resetAt),
      quizzes: mergeBucket(a.quizzes, b.quizzes, resetAt),
      chapterActiveQuiz: mergeBucket(a.chapterActiveQuiz, b.chapterActiveQuiz, resetAt),
      exercises: mergeBucket(a.exercises, b.exercises, resetAt)
    };
  }

  function isResumeEmpty(res) {
    if (!res || typeof res !== 'object') return true;
    return !['lessons', 'lessonActiveSheet', 'quizzes', 'chapterActiveQuiz', 'exercises']
      .some((k) => res[k] && Object.keys(res[k]).length > 0);
  }

  function exportCloudResume() {
    const cur = readAll();
    return isResumeEmpty(cur) ? null : cur;
  }

  function applyCloudResume(remoteRes, resetAt) {
    const merged = mergeCloudResumes(readAll(), remoteRes, resetAt);
    writeAll(merged);
    return merged;
  }

  return {
    STORAGE_KEY, SCHEMA_VERSION, readAll, writeAll, clearAll, evictForQuota, normalizeMode,
    buildLessonScrollKey, buildProblemScrollKey, buildLessonActiveSheetKey, buildConcoursSessionKey,
    getLesson, saveLesson, getLessonActiveSheet, saveLessonActiveSheet,
    getQuiz, saveQuiz, clearQuiz, getChapterActiveQuiz, saveChapterActiveQuiz,
    getExercise, saveExercise, findFirstUnfinishedIndex, compactSectionLabel,
    hydrateQuizState, snapshotQuizState, hydrateExerciseState, snapshotExerciseState,
    syncExerciseDetails, handleExerciseSolToggle,
    sanitizeCloudResume: (r, rAt) => cleanStore(r, rAt),
    mergeCloudResumes, exportCloudResume, applyCloudResume
  };
});
