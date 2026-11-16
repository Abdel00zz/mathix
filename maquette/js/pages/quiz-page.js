/**
 * Contrôleur SPA de la vue Quiz (#quiz-...).
 * Compte à rebours tiers-temps, Fisher-Yates, raccourcis clavier et persistance S.q.
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuizPage = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  'use strict';

  let st = null;
  const app = () => (root && root.MathFlowApp) || {};
  const rs = () => (root && root.MathFlowResumeStore) || null;
  const activeList = () => (!st ? [] : (st.reviewIndices ? st.reviewIndices.map((i) => st.questions[i]) : st.questions));
  const realIndex = () => (st.reviewIndices ? st.reviewIndices[st.index] : st.index);

  const quizKeys = (quizObj, bundle) => {
    const b = bundle || (st && st.bundle) || {};
    const classId = typeof app().getActiveClassId === 'function' ? app().getActiveClassId() : '2eme-bac-sc-ex';
    const kind = b.kind === 'concours' ? 'concours' : 'chapter';
    const chId = b.chapterId || b.schoolId || '';
    const qId = (quizObj && (quizObj.id || quizObj.path)) || 'quiz';
    const chapterKey = `${kind}:${classId}:${chId}`;
    const sessionKey = `${chapterKey}:${qId}`;
    const storeKey = b.kind === 'concours' && b.schoolId
      ? ('concours-' + b.schoolId + '-' + qId)
      : (b.chapterId ? (b.quizzes && b.quizzes.length > 1 ? classId + ':' + b.chapterId + ':' + qId : classId + ':' + b.chapterId) : qId);
    return { classId, kind, chId, qId, chapterKey, sessionKey, storeKey };
  };

  const fmtTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const shuffleIds = (ids, expected) => {
    const arr = ids.slice();
    if (arr.length <= 1) return arr;
    for (let tries = 0; tries < 4; tries++) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (!expected || !arr.every((v, k) => v === expected[k])) break;
    }
    return arr;
  };

  const getLimit = (q) => {
    const cfg = typeof app().getSettings === 'function' ? (app().getSettings() || {}) : {};
    const base = (q && q.timeLimit) || st.bundle.defaultTimePerQuestion || Number(cfg.quizTimePerQuestion) || 120;
    return st.tiersTemps ? Math.round(base * 1.33) : base;
  };
  const syncTimerDom = () => {
    const el = st && st.container && st.container.querySelector('#tm');
    if (el) el.textContent = fmtTime(st.remaining);
  };
  const stopTimer = () => {
    if (!st) return;
    if (st.timerHandle && typeof st.timerHandle.stop === 'function') st.timerHandle.stop();
    if (st.intervalId) clearInterval(st.intervalId);
    st.timerHandle = st.intervalId = null;
  };
  const startTimer = () => {
    stopTimer();
    if (!st || st.view !== 'question') return;
    const q = activeList()[st.index], rIdx = realIndex();
    if (!q || (st.answers[rIdx] && st.answers[rIdx].status === 'answered')) { st.remaining = 0; return syncTimerDom(); }
    if (st.remainingByIdx[rIdx] == null) st.remainingByIdx[rIdx] = getLimit(q);
    st.remaining = st.remainingByIdx[rIdx];
    syncTimerDom();
    if (app().timer && typeof app().timer.countdown === 'function') {
      st.timerHandle = app().timer.countdown({
        seconds: st.remaining, pauseOnHidden: true,
        onTick: (rem) => { if (st) { st.remaining = st.remainingByIdx[rIdx] = rem; st.elapsed++; syncTimerDom(); if (st.elapsed % 5 === 0) persistResume(); } },
        onExpire: () => validateCurrent(true)
      });
      return;
    }
    st.intervalId = setInterval(() => {
      if (!st || st.paused || (typeof document !== 'undefined' && document.hidden)) return;
      st.elapsed++;
      st.remaining = st.remainingByIdx[rIdx] = Math.max(0, st.remaining - 1);
      syncTimerDom();
      if (st.elapsed % 5 === 0) persistResume();
      if (st.remaining <= 0) validateCurrent(true);
    }, 1000);
  };

  const persistResume = () => {
    const store = rs();
    if (st && st.activeQuiz && store && typeof store.snapshotQuizState === 'function') {
      store.snapshotQuizState(quizKeys(st.activeQuiz, st.bundle).sessionKey, quizKeys(st.activeQuiz, st.bundle).qId, st);
    }
  };

  const initQuizData = (quizObj, fresh) => {
    const store = rs(), keys = quizKeys(quizObj, st.bundle);
    if (store && typeof store.saveChapterActiveQuiz === 'function') store.saveChapterActiveQuiz(keys.chapterKey, keys.qId);
    if (fresh && store && typeof store.clearQuiz === 'function') store.clearQuiz(keys.sessionKey);
    st.activeQuiz = quizObj;
    st.questions = (quizObj.questions || []).map((q, i) => root.MathFlowQuizRenderer.normalizeQuestion(q, i, quizObj.basePath || ''));
    st.drafts = st.questions.map((q) => (q.type === 'order' ? { orderItems: shuffleIds(q.items.map((it) => it.id), q.correctOrder) } : {}));
    st.answers = new Array(st.questions.length).fill(null);
    st.remainingByIdx = new Array(st.questions.length).fill(null);
    st.reviewIndices = null; st.notice = ''; st.index = st.elapsed = 0; st.view = 'question';
    if (fresh || !store || typeof store.hydrateQuizState !== 'function') return;
    const s = typeof app().getStudentState === 'function' ? app().getStudentState() : null;
    const h = store.hydrateQuizState(keys.sessionKey, keys.storeKey, st.bundle.chapterId, !(st.bundle.quizzes && st.bundle.quizzes.length > 1), st.questions, s);
    st.answers = h.answers; st.remainingByIdx = h.remainingByIdx; st.elapsed = h.elapsed;
    st.reviewIndices = h.reviewIndices; st.view = h.view; st.index = h.index;
    Object.entries(h.drafts).forEach(([k, d]) => { st.drafts[Number(k)] = d; });
  };

  const persistProgress = () => {
    if (!st || !st.activeQuiz) return;
    const a = app(), keys = quizKeys(st.activeQuiz, st.bundle);
    const scores = st.answers.map((ans) => (!ans ? null : (ans.status === 'answered' ? (ans.isCorrect ? 1 : 0) : -1)));
    const payload = st.view === 'summary' ? { answers: scores, isSubmitted: true } : scores;
    if (typeof a.saveProgress === 'function') a.saveProgress('q', keys.storeKey, payload);
    else if (typeof a.getStudentState === 'function' && typeof a.saveStudentState === 'function') {
      const s = a.getStudentState() || { q: {}, e: {}, l: {} };
      s.q = s.q || {}; s.q[keys.storeKey] = payload; a.saveStudentState(s);
    }
    persistResume();
  };

  function validateCurrent(fromTimeout) {
    if (!st || st.view !== 'question') return;
    const rIdx = realIndex();
    const q = st.questions[rIdx];
    const renderer = root.MathFlowQuizRenderer;
    if (!q || (st.answers[rIdx] && st.answers[rIdx].status === 'answered')) return;
    if (!fromTimeout && renderer && typeof renderer.isAnswerable === 'function' && !renderer.isAnswerable(q, st.drafts[rIdx])) {
      st.notice = 'Veuillez choisir ou saisir une réponse avant de valider.';
      return render();
    }
    st.notice = '';
    stopTimer();
    const res = renderer.evaluateAnswer(q, st.drafts[rIdx]);
    if (fromTimeout) res.timedOut = true;
    st.answers[rIdx] = res;
    const a = app();
    if (typeof a.playTone === 'function') a.playTone(res.isCorrect ? 'ok' : 'bad');
    else if (typeof a.playSound === 'function') a.playSound(res.isCorrect ? 'success' : 'error');
    persistProgress();
    render();
    const fb = st.container && st.container.querySelector('#quiz-feedback');
    if (fb && typeof fb.focus === 'function') fb.focus({ preventScroll: true });
  }

  const goToIndex = (nextIdx) => {
    if (nextIdx >= 0 && nextIdx < activeList().length) { st.notice = ''; st.index = nextIdx; persistResume(); render(); startTimer(); }
  };

  const skipCurrent = () => {
    if (!st || st.view !== 'question') return;
    st.notice = '';
    const rIdx = realIndex(), d = st.drafts[rIdx] || {};
    if (!st.answers[rIdx] || st.answers[rIdx].status !== 'answered') {
      st.answers[rIdx] = { status: 'skipped', selectedIndex: d.selectedIndex, text: d.text, orderItems: Array.isArray(d.orderItems) ? d.orderItems.slice() : undefined };
    }
    persistProgress();
    if (st.index < activeList().length - 1) goToIndex(st.index + 1); else finishQuiz();
  };

  async function finishQuiz() {
    if (!st) return;
    const skipped = st.answers.filter((a) => !a || a.status !== 'answered').length;
    if (skipped > 0 && !st.reviewIndices) {
      const modals = root.MathFlowUiModals, msg = `${skipped} question(s) restent sans réponse. Afficher le bilan ?`;
      const ok = modals && typeof modals.openConfirmDialog === 'function'
        ? await modals.openConfirmDialog({ title: 'Terminer le quiz ?', message: msg, confirmLabel: 'Voir le bilan', cancelLabel: 'Continuer' })
        : (typeof root.confirm === 'function' ? root.confirm(msg) : true);
      if (!ok) return;
    }
    stopTimer(); st.view = 'summary'; persistProgress(); render();
  }

  const toggleTiersTemps = () => {
    if (!st) return;
    st.tiersTemps = !st.tiersTemps;
    if (typeof app().updateSettings === 'function') app().updateSettings({ tiersTemps: st.tiersTemps });
    const rIdx = realIndex(), cur = st.remainingByIdx[rIdx];
    if ((!st.answers[rIdx] || st.answers[rIdx].status !== 'answered') && typeof cur === 'number' && cur > 0) {
      st.remainingByIdx[rIdx] = st.tiersTemps ? Math.round(cur * 1.33) : Math.max(1, Math.round(cur / 1.33));
      startTimer();
    }
    render();
  };

  function render() {
    if (!st || !st.container) return;
    const b = st.bundle;
    const renderer = root.MathFlowQuizRenderer;
    if (!st.activeQuiz || !st.questions.length) {
      st.container.innerHTML = `<header class="top"><a class="back" href="${b.backHash}">← Retour</a></header><section class="end"><h2>Aucun quiz disponible</h2><a class="btn primary" href="${b.backHash}">Retour</a></section>`;
      return;
    }
    if (st.view === 'summary') {
      const correctCount = st.answers.filter((a) => a && a.isCorrect).length;
      const skippedCount = st.answers.filter((a) => !a || a.status !== 'answered').length;
      st.container.innerHTML = renderer.renderSummaryView({
        title: st.activeQuiz.title || b.title, backHash: b.backHash, total: st.questions.length,
        correctCount, skippedCount, errorCount: st.questions.length - correctCount, elapsedText: fmtTime(st.elapsed)
      });
      return;
    }
    const list = activeList();
    const rIdx = realIndex();
    st.container.innerHTML = renderer.renderQuizView({
      title: st.activeQuiz.title || b.title, backHash: b.backHash, quizzes: b.quizzes, activeQuizId: st.activeQuiz.id,
      index: st.index, total: list.length, question: list[st.index], draft: st.drafts[rIdx], answer: st.answers[rIdx],
      tiersTemps: st.tiersTemps, timerText: fmtTime(st.remaining), notice: st.notice
    });
  }

  const ACTIONS = {
    ok: () => validateCurrent(false), skip: () => skipCurrent(),
    prev: () => goToIndex(st.index - 1), next: () => goToIndex(st.index + 1), finish: () => finishQuiz(),
    redo: () => { initQuizData(st.activeQuiz, true); persistProgress(); render(); startTimer(); },
    'review-errors': () => {
      const errs = st.answers.map((a, i) => (!a || !a.isCorrect ? i : -1)).filter((i) => i >= 0);
      if (errs.length) { st.notice = ''; st.reviewIndices = errs; st.index = 0; st.view = 'question'; persistResume(); render(); startTimer(); }
    }
  };

  const onClick = (e) => {
    if (!st) return;
    if (e.target.closest('[data-tt]')) return toggleTiersTemps();
    const actEl = e.target.closest('[data-a]');
    if (actEl && ACTIONS[actEl.getAttribute('data-a')]) return ACTIONS[actEl.getAttribute('data-a')]();
    const rIdx = realIndex();
    if (st.answers[rIdx] && st.answers[rIdx].status === 'answered') return;
    const choice = e.target.closest('[data-quiz-choice]');
    if (choice) { st.notice = ''; st.drafts[rIdx].selectedIndex = Number(choice.getAttribute('data-quiz-choice')); persistResume(); return render(); }
    const mv = e.target.closest('[data-order-move]');
    if (mv) {
      const pos = Number(mv.getAttribute('data-idx'));
      const seq = st.drafts[rIdx].orderItems;
      const swap = pos + (mv.getAttribute('data-order-move') === 'up' ? -1 : 1);
      if (seq && swap >= 0 && swap < seq.length) { st.notice = ''; [seq[pos], seq[swap]] = [seq[swap], seq[pos]]; persistResume(); render(); }
    }
  };

  const onInput = (e) => {
    if (!st || !e.target.matches('[data-quiz-input]')) return;
    st.drafts[realIndex()].text = e.target.value;
    persistResume();
    if (st.notice) {
      st.notice = '';
      const n = st.container && st.container.querySelector('.quiz-notice');
      if (n) n.remove();
    }
  };
  const onChange = (e) => {
    if (!st || !e.target.matches('[data-quiz-select]')) return;
    const nextQ = st.bundle.quizzes.find((q) => q.id === e.target.value);
    if (nextQ) { initQuizData(nextQ); render(); startTimer(); }
  };

  const onKeyDown = (e) => {
    if (!st || st.view !== 'question' || (typeof document !== 'undefined' && document.body.dataset.v !== 'quiz')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], .modal.is-open')) return;
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target && e.target.tagName);
    if (isInput && e.key !== 'Enter') return;
    const q = activeList()[st.index];
    if (!q) return;
    const rIdx = realIndex();
    const answered = Boolean(st.answers[rIdx] && st.answers[rIdx].status === 'answered');
    const k = String(e.key || '').toUpperCase();
    if (!answered && !isInput) {
      let pick = -1;
      if ('ABCD'.includes(k) && (q.type === 'mcq' || q.type === 'error')) pick = 'ABCD'.indexOf(k);
      else if (/^[1-4]$/.test(k) && q.type !== 'order' && q.type !== 'input') pick = Number(k) - 1;
      else if ((k === 'V' || k === 'F') && q.type === 'boolean') pick = k === 'V' ? 0 : 1;
      const maxLen = q.type === 'error' ? q.steps.length : (q.options ? q.options.length : 0);
      if (pick >= 0 && pick < maxLen) { st.notice = ''; st.drafts[rIdx].selectedIndex = pick; return render(); }
    }
    if (e.key === 'Enter') { e.preventDefault(); !answered ? validateCurrent(false) : (st.index < activeList().length - 1 ? goToIndex(st.index + 1) : finishQuiz()); }
    else if (e.key === 'ArrowLeft') goToIndex(st.index - 1);
    else if (e.key === 'ArrowRight') { if (answered) goToIndex(st.index + 1); else skipCurrent(); }
  };

  const onVisibility = () => { if (st) st.paused = Boolean(typeof document !== 'undefined' && document.hidden); };

  const bindEvents = (c, on) => {
    const fn = on ? 'addEventListener' : 'removeEventListener';
    c[fn]('click', onClick); c[fn]('input', onInput); c[fn]('change', onChange);
    if (typeof document !== 'undefined') { document[fn]('keydown', onKeyDown); document[fn]('visibilitychange', onVisibility); }
    if (typeof root[fn] === 'function') root[fn]('pagehide', persistProgress);
  };

  async function mount(container, params = {}) {
    unmount();
    if (typeof document !== 'undefined' && document.body) document.body.dataset.v = 'quiz';
    const cfg = typeof app().getSettings === 'function' ? (app().getSettings() || {}) : {};
    container.innerHTML = '<div class="ctx">Chargement du quiz...</div>';
    const loadParams = Object.assign({}, params);
    const store = rs();
    if (!loadParams.quizId && !loadParams.annaleId && !loadParams.themeId && !loadParams.quizPath && store && typeof store.getChapterActiveQuiz === 'function') {
      const classId = typeof app().getActiveClassId === 'function' ? app().getActiveClassId() : '2eme-bac-sc-ex';
      const chKey = `${loadParams.schoolId ? 'concours' : 'chapter'}:${classId}:${loadParams.chapterId || loadParams.schoolId || ''}`;
      const savedQid = store.getChapterActiveQuiz(chKey);
      if (savedQid) loadParams.quizId = savedQid;
    }
    const bundle = await root.MathFlowQuizLoader.loadQuizBundle(loadParams);
    if (bundle.kind !== 'concours' && bundle.chapterId && root.MathFlowUnlocks && typeof root.MathFlowUnlocks.verifyStepAccess === 'function') {
      const gate = await root.MathFlowUnlocks.verifyStepAccess(params, 'quiz');
      if (gate && !gate.allowed) return root.MathFlowUnlocks.renderLockedView(container, gate, bundle.backHash || '#learn');
    }
    st = { container, bundle, tiersTemps: Boolean(cfg.tiersTemps), view: 'question', index: 0, elapsed: 0, remaining: 0, paused: false, notice: '', questions: [], drafts: [], answers: [], remainingByIdx: [], reviewIndices: null };
    if (bundle.activeQuiz) initQuizData(bundle.activeQuiz);
    if (bundle.activeQuiz && typeof app().recordLastVisited === 'function') {
      const hash = root.location && root.location.hash ? root.location.hash
        : (bundle.kind === 'concours' ? '#concours-' + encodeURIComponent(bundle.schoolId || '') : '#quiz-' + encodeURIComponent(bundle.chapterId || ''));
      app().recordLastVisited({
        hash, title: bundle.title || bundle.subtitle || 'Quiz',
        kind: bundle.kind === 'concours' ? 'concours' : 'quiz', chapterId: bundle.chapterId || null
      });
    }
    bindEvents(container, true);
    render();
    startTimer();
  }
  function unmount() {
    stopTimer();
    if (!st) return;
    persistResume();
    if (st.container) bindEvents(st.container, false);
    st = null;
  }
  return { mount, unmount };
});
