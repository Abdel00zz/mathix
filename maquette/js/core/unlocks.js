/* ============================================================================
 * MathFlow — Règles de progression & Cadenas (Leçon -> Quiz -> Exercices)
 * Aligné sur src/utils/chapterProgress.ts : 10 % leçon, 15 % quiz.
 * ============================================================================ */
(function (global) {
  'use strict';

  var QUIZ_UNLOCK_THRESHOLD = 10;
  var EXERCISE_UNLOCK_THRESHOLD = 15;
  var STORAGE_KEY = 'ap-u';

  var LOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  var UNSAFE_KEYS = { __proto__: 1, constructor: 1, prototype: 1 };

  function safeStorage() {
    try { return global.localStorage || null; } catch (_e) { return null; }
  }

  function sanitizeStickyUnlocks(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (k) {
      if (UNSAFE_KEYS[k]) return;
      var v = raw[k];
      if (!v || typeof v !== 'object') return;
      out[k] = { quiz: Boolean(v.quiz), exercises: Boolean(v.exercises) };
    });
    return out;
  }

  function readStickyMap() {
    var ls = safeStorage();
    if (!ls) return {};
    try {
      return sanitizeStickyUnlocks(JSON.parse(ls.getItem(STORAGE_KEY) || '{}'));
    } catch (_e) {
      return {};
    }
  }

  function writeStickyMap(map) {
    var ls = safeStorage();
    if (!ls) return;
    var raw = JSON.stringify(sanitizeStickyUnlocks(map || {}));
    try { ls.setItem(STORAGE_KEY, raw); } catch (e) {
      var isQuota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
      if (isQuota && global.MathFlowResumeStore && typeof global.MathFlowResumeStore.evictForQuota === 'function') {
        if (global.MathFlowResumeStore.evictForQuota()) {
          try { ls.setItem(STORAGE_KEY, raw); } catch (_e2) {}
        }
      }
    }
  }

  function mergeStickyUnlocks(localMap, remoteMap) {
    var a = sanitizeStickyUnlocks(localMap);
    var b = sanitizeStickyUnlocks(remoteMap);
    var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (k) {
      if (out[k]) return;
      var av = a[k] || {};
      var bv = b[k] || {};
      var q = Boolean(av.quiz || bv.quiz);
      var ex = Boolean(av.exercises || bv.exercises);
      if (q || ex) out[k] = { quiz: q, exercises: ex };
    });
    return out;
  }

  function clearStickyUnlocks() {
    var ls = safeStorage();
    if (!ls) return;
    try { ls.removeItem(STORAGE_KEY); } catch (_e) {}
  }

  function isPinnedChapter(chapterOrId) {
    var id = typeof chapterOrId === 'string'
      ? chapterOrId
      : (chapterOrId && (chapterOrId.id || chapterOrId.chapterId)) || '';
    return id === 'mise-a-niveau' || /mise[-\s]?a[-\s]?niveau/i.test(id);
  }

  function countDone(entry) {
    if (Array.isArray(entry)) return entry.filter(function (x) { return x != null; }).length;
    if (entry && typeof entry === 'object') {
      if (Array.isArray(entry.answers)) return entry.answers.filter(function (x) { return x != null; }).length;
      if (typeof entry.done === 'number') return entry.done;
      return Object.values(entry).filter(function (x) { return x != null; }).length;
    }
    return typeof entry === 'number' ? entry : 0;
  }

  function isEntrySubmitted(entry, expectedCount) {
    if (Array.isArray(entry) && entry.length > 0 && entry.every(function (x) { return x != null; })) return true;
    if (entry && typeof entry === 'object' && entry.isSubmitted) return true;
    return expectedCount > 0 && countDone(entry) >= expectedCount;
  }

  function readLessonNum(v) {
    if (typeof v === 'number') return Math.max(0, Math.min(100, Math.round(v)));
    if (v && typeof v === 'object') {
      if (typeof v.pct === 'number') return Math.max(0, Math.min(100, Math.round(v.pct)));
      var nums = Object.values(v).filter(function (x) { return typeof x === 'number'; });
      return nums.length ? Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length) : 0;
    }
    return 0;
  }

  function getLessonPct(lMap, chId, revs, classId) {
    if (!lMap || !chId) return 0;
    var scopedKey = classId ? (classId + ':' + chId) : '';
    var direct = (scopedKey && lMap[scopedKey] != null) ? lMap[scopedKey] : lMap[chId];
    if (direct != null) return readLessonNum(direct);
    var prefix = (scopedKey && Object.keys(lMap).some(function (k) { return k.indexOf(scopedKey + ':') === 0; }))
      ? (scopedKey + ':')
      : (chId + ':');
    var vals = Object.keys(lMap)
      .filter(function (k) { return k.indexOf(prefix) === 0; })
      .map(function (k) { return readLessonNum(lMap[k]); });
    if (vals.length) {
      var denom = Math.max(vals.length, Array.isArray(revs) ? revs.length : 0);
      return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / denom);
    }
    return 0;
  }

  function getQuizStats(qMap, classId, chId, quizzes, quizCount) {
    if (!qMap || !chId) return { done: 0, pct: 0, submitted: false };
    var done = 0;
    var submitted = false;
    var usedSuffix = {};
    var cId = classId || '';
    var sPrefix = cId ? (cId + ':' + chId + ':') : '';
    var lPrefix = chId + ':';
    if (Array.isArray(quizzes) && quizzes.length) {
      quizzes.forEach(function (qz) {
        var qid = qz && qz.id ? String(qz.id) : '';
        if (!qid || usedSuffix[qid]) return;
        var entry = (sPrefix && qMap[sPrefix + qid]) || qMap[lPrefix + qid] || qMap[qid];
        if (!entry) return;
        usedSuffix[qid] = true;
        done += countDone(entry);
        if (isEntrySubmitted(entry, qz.questionsCount || qz.count || 0)) submitted = true;
      });
    }
    Object.keys(qMap).forEach(function (k) {
      var suf = '';
      if (sPrefix && k.indexOf(sPrefix) === 0) suf = k.slice(sPrefix.length);
      else if (k.indexOf(lPrefix) === 0) suf = k.slice(lPrefix.length);
      if (!suf || usedSuffix[suf]) return;
      var entry = (sPrefix && qMap[sPrefix + suf]) || qMap[lPrefix + suf];
      if (!entry) return;
      usedSuffix[suf] = true;
      done += countDone(entry);
      if (isEntrySubmitted(entry, 0)) submitted = true;
    });
    if (!done && !Object.keys(usedSuffix).length) {
      var direct = (cId && qMap[cId + ':' + chId]) || qMap[chId];
      if (direct) {
        done = countDone(direct);
        submitted = isEntrySubmitted(direct, quizCount || 0);
      }
    }
    var derived = Array.isArray(quizzes) ? quizzes.reduce(function (a, q) { return a + Number((q && (q.questionsCount || q.count)) || 0); }, 0) : 0;
    var total = Number(quizCount) || derived || 0;
    var pct = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : (done > 0 ? 100 : 0);
    return { done: done, pct: pct, submitted: submitted };
  }

  function getExerciseStats(eMap, classId, chId, exercises, totalQuestions) {
    if (!eMap || !chId) return { done: 0, pct: 0, total: Number(totalQuestions) || 0, completed: false };
    var done = 0;
    var used = {};
    var cId = classId || '';
    var sPrefix = cId ? (cId + ':' + chId + ':') : '';
    var lPrefix = chId + ':';
    if (Array.isArray(exercises) && exercises.length) {
      exercises.forEach(function (ex) {
        var eid = typeof ex === 'string' ? ex : (ex && ex.id ? String(ex.id) : '');
        if (!eid || used[eid]) return;
        var entry = (sPrefix && eMap[sPrefix + eid]) || eMap[lPrefix + eid] || eMap[eid];
        if (!entry) return;
        used[eid] = true;
        done += countDone(entry);
      });
    }
    Object.keys(eMap).forEach(function (k) {
      var suf = sPrefix && k.indexOf(sPrefix) === 0 ? k.slice(sPrefix.length) : (k.indexOf(lPrefix) === 0 ? k.slice(lPrefix.length) : '');
      if (!suf || used[suf]) return;
      var entry = (sPrefix && eMap[sPrefix + suf]) || eMap[lPrefix + suf];
      if (!entry) return;
      used[suf] = true;
      done += countDone(entry);
    });
    if (!done && !Object.keys(used).length) {
      var direct = (cId && eMap[cId + ':' + chId]) || eMap[chId];
      if (direct) done = countDone(direct);
    }
    var total = Number(totalQuestions) || (Array.isArray(exercises) ? exercises.reduce(function (a, x) { return a + Number((x && (x.questionsCount || x.count)) || 0); }, 0) : 0);
    var pct = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : (done > 0 ? 100 : 0);
    return { done: done, pct: pct, total: total, completed: total > 0 ? done >= total : done > 0 };
  }

  function computeLocks(opts) {
    var o = opts || {};
    var classId = o.classId || 'default';
    var chapterId = o.chapterId || '';
    var key = classId + ':' + chapterId;
    var map = o.stickyMap || readStickyMap();
    var prev = map[key] || {};
    var pinned = isPinnedChapter(chapterId);

    var quizUnlocked = Boolean(
      pinned || prev.quiz || !o.hasLesson || Number(o.lessonPct || 0) >= QUIZ_UNLOCK_THRESHOLD
    );

    var exGateMet = !o.hasQuiz
      ? true
      : (Boolean(o.quizSubmitted) || Number(o.quizPct || 0) >= EXERCISE_UNLOCK_THRESHOLD);
    var exercisesUnlocked = Boolean(pinned || prev.exercises || exGateMet);

    if (!o.stickyMap && chapterId && (quizUnlocked !== Boolean(prev.quiz) || exercisesUnlocked !== Boolean(prev.exercises))) {
      map[key] = { quiz: quizUnlocked, exercises: exercisesUnlocked };
      writeStickyMap(map);
    }

    return {
      quizLocked: Boolean(o.hasQuiz && !quizUnlocked),
      exercisesLocked: Boolean(o.hasExercises && !exercisesUnlocked),
      quizUnlocked: quizUnlocked,
      exercisesUnlocked: exercisesUnlocked,
      quizHint: 'Débloqué dès ' + QUIZ_UNLOCK_THRESHOLD + ' % de la leçon',
      exercisesHint: o.hasQuiz
        ? ('Débloqué dès ' + EXERCISE_UNLOCK_THRESHOLD + ' % du quiz')
        : 'Exercices accessibles directement'
    };
  }

  async function verifyStepAccess(params, step) {
    var p = params || {};
    var app = global.MathFlowApp;
    var cs = global.ContentService;
    var chapterId = p.chapterId || p.chapter || '';
    var classId = p.classId || p.classe || (app && app.getActiveClassId ? app.getActiveClassId() : '') || '2eme-bac-sc-ex';
    if (!chapterId || !cs || typeof cs.getClassManifest !== 'function') return { allowed: true };
    if (isPinnedChapter(chapterId)) return { allowed: true };

    try {
      var cMan = await cs.getClassManifest(classId);
      var ch = (cMan && Array.isArray(cMan.chapters) ? cMan.chapters : []).find(function (c) { return c.id === chapterId; }) || {};
      var manRef = p.manifestPath || p.manifest || ch.manifestPath || ch.manifest || chapterId;
      var chMan = typeof cs.getChapterManifest === 'function' ? await cs.getChapterManifest(manRef, classId) : null;
      var revs = (chMan && chMan.revisions) || ch.revisions || [];
      var quizzes = (chMan && chMan.quizzes) || ch.quizzes || [];
      var exercises = (chMan && chMan.exercises) || ch.exercises || [];
      var quizCount = Number((chMan && chMan.quizCount) || ch.quizCount || 0) || quizzes.reduce(function (a, q) { return a + (q.questionsCount || 0); }, 0);
      var st = (app && typeof app.getState === 'function' ? app.getState() : null) || {};
      var lp = getLessonPct(st.l, chapterId, revs, classId);
      var qs = getQuizStats(st.q, classId, chapterId, quizzes, quizCount);
      var locks = computeLocks({
        classId: classId, chapterId: chapterId,
        hasLesson: revs.length > 0, hasQuiz: quizzes.length > 0 || quizCount > 0, hasExercises: exercises.length > 0,
        lessonPct: lp, quizPct: qs.pct, quizSubmitted: qs.submitted
      });
      if (step === 'quiz' && locks.quizLocked) {
        return {
          allowed: false,
          title: 'Quiz verrouillé',
          reason: 'Parcourez au moins ' + QUIZ_UNLOCK_THRESHOLD + ' % de la leçon avant de passer au quiz.',
          redirectHash: '#lecon-' + encodeURIComponent(chapterId),
          redirectLabel: 'Ouvrir la leçon'
        };
      }
      if (step === 'exercises' && locks.exercisesLocked) {
        var useQuiz = quizzes.length > 0 || quizCount > 0;
        return {
          allowed: false,
          title: 'Exercices verrouillés',
          reason: useQuiz
            ? ('Répondez à au moins ' + EXERCISE_UNLOCK_THRESHOLD + ' % du quiz pour débloquer les exercices.')
            : ('Parcourez au moins ' + QUIZ_UNLOCK_THRESHOLD + ' % de la leçon pour débloquer les exercices.'),
          redirectHash: (useQuiz ? '#quiz-' : '#lecon-') + encodeURIComponent(chapterId),
          redirectLabel: useQuiz ? 'Ouvrir le quiz' : 'Ouvrir la leçon'
        };
      }
    } catch (_e) {}
    return { allowed: true };
  }

  function showLockedNotice(msg) {
    if (typeof document === 'undefined') return;
    var toast = document.getElementById('pwa-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('is-visible');
    clearTimeout(toast._lkT);
    toast._lkT = setTimeout(function () { toast.classList.remove('is-visible'); toast.hidden = true; }, 3200);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderLockedView(container, gate, backHash) {
    if (!container) return;
    var g = gate || {};
    var safeBack = (backHash && /^#[a-zA-Z0-9_%:&=?/-]+$/.test(backHash)) ? backHash : '#learn';
    var safeTarget = (g.redirectHash && /^#[a-zA-Z0-9_%:&=?/-]+$/.test(g.redirectHash)) ? g.redirectHash : safeBack;
    container.innerHTML =
      '<header class="top"><a class="back" href="' + safeBack + '">← Retour</a></header>' +
      '<section class="end locked-guard">' +
        '<div class="locked-guard-ic" aria-hidden="true">' + LOCK_SVG + '</div>' +
        '<h2>' + escHtml(g.title || 'Contenu verrouillé') + '</h2>' +
        '<p class="ctx">' + escHtml(g.reason || '') + '</p>' +
        '<div class="row">' +
          '<a class="btn primary" href="' + safeTarget + '">' + escHtml(g.redirectLabel || 'Poursuivre la leçon') + '</a>' +
          '<a class="btn" href="' + safeBack + '">Programme</a>' +
        '</div>' +
      '</section>';
  }

  function init() {
    if (typeof document === 'undefined') return;
    if (global.MathFlowApp && typeof global.MathFlowApp.on === 'function') {
      global.MathFlowApp.on('state:reset', clearStickyUnlocks);
    }
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-locked-hint]') : null;
      if (!btn) return;
      e.preventDefault();
      var stp = btn.closest('.stp');
      if (stp) {
        stp.classList.remove('is-shaking');
        void stp.offsetWidth;
        stp.classList.add('is-shaking');
      }
      showLockedNotice(btn.getAttribute('data-locked-hint') || 'Étape verrouillée.');
    });
  }

  var MathFlowUnlocks = {
    QUIZ_UNLOCK_THRESHOLD: QUIZ_UNLOCK_THRESHOLD,
    EXERCISE_UNLOCK_THRESHOLD: EXERCISE_UNLOCK_THRESHOLD,
    LOCK_SVG: LOCK_SVG,
    isPinnedChapter: isPinnedChapter,
    computeLocks: computeLocks,
    verifyStepAccess: verifyStepAccess,
    renderLockedView: renderLockedView,
    clearStickyUnlocks: clearStickyUnlocks,
    readStickyUnlocks: readStickyMap,
    writeStickyUnlocks: writeStickyMap,
    mergeStickyUnlocks: mergeStickyUnlocks,
    getLessonPct: getLessonPct,
    getQuizStats: getQuizStats,
    getExerciseStats: getExerciseStats,
    init: init
  };

  global.MathFlowUnlocks = MathFlowUnlocks;
  if (typeof module !== 'undefined' && module.exports) module.exports = MathFlowUnlocks;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
