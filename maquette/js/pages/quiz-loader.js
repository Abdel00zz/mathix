/**
 * Chargeur de quiz (chapitres & concours) pour l'espace élève SPA.
 * Filtre les séries vides (0 question) et utilise uniquement des hash routes (#learn, #prepa).
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathFlowQuizLoader = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  'use strict';

  const sanitizeHash = (h, fallback) =>
    typeof h === 'string' && /^#[A-Za-z0-9_/?=&.-]+$/.test(h) && !/\.html\b/i.test(h) ? h : fallback;

  const dirOf = (p) => {
    const clean = String(p || '').replace(/^\.\//, '');
    const i = clean.lastIndexOf('/');
    return i >= 0 ? clean.slice(0, i) : '';
  };

  const joinPath = (base, rel) => {
    if (!rel) return '';
    const p = String(rel).trim();
    if (/^(data\/|public\/|https?:\/\/)/i.test(p)) return p;
    const clean = p.replace(/^\.\//, '');
    return base ? `${base.replace(/\/+$/, '')}/${clean}` : clean;
  };

  const fetchManifest = async (svc, method, arg, fallbackPath) => {
    if (svc && typeof svc[method] === 'function') {
      try { return await svc[method](arg); } catch (_) { /* fallback below */ }
    }
    return svc && typeof svc.fetchJson === 'function' && fallbackPath ? svc.fetchJson(fallbackPath) : null;
  };

  const pushEntry = (list, baseDir, entry, defaultTitle, kind) => {
    if (!entry) return;
    const path = typeof entry === 'string' ? entry : (entry.path || entry.quizPath || entry.file || '');
    if (!path || (typeof entry === 'object' && Number(entry.count) === 0)) return;
    const fallbackId = String(path).split('/').pop().replace(/\.json$/i, '') || path;
    list.push({
      id: (entry && entry.id) || fallbackId,
      title: (entry && (entry.title || entry.label)) || defaultTitle,
      path: joinPath(baseDir, path),
      kind: kind || (entry && entry.kind) || 'quiz',
      questionsCount: entry && (entry.questionsCount || entry.count),
      timePerQuestion: entry && entry.timePerQuestion
    });
  };

  const collectCandidates = (man, baseDir, params, isConcours) => {
    const list = [];
    if (man && isConcours) {
      (man.quizzes || []).forEach((q) => pushEntry(list, baseDir, q, 'Série concours', 'quiz'));
      (man.annales || []).forEach((a) => pushEntry(list, baseDir, a, 'Annale', 'annale'));
      (man.themes || []).forEach((t) =>
        Array.isArray(t.quizzes)
          ? t.quizzes.forEach((q) => pushEntry(list, baseDir, q, t.title || 'Thème', 'theme'))
          : pushEntry(list, baseDir, t, 'Thème', 'theme')
      );
      if (!list.length) (man.fallbackQuizPaths || []).forEach((p) => pushEntry(list, baseDir, p, 'Entraînement', 'fallback'));
    } else if (man) {
      (man.quizzes || []).forEach((q) => pushEntry(list, baseDir, q, 'Quiz du chapitre', 'chapter'));
      if (man.quiz) pushEntry(list, baseDir, man.quiz, 'Quiz du chapitre', 'chapter');
    }
    if (!list.length && params.quizPath) {
      pushEntry(list, '', { id: params.quizId || 'direct', title: params.title || 'Quiz', path: params.quizPath }, 'Quiz', 'direct');
    }
    return list;
  };

  const hydrateQuizzes = async (svc, candidates) => {
    const res = await Promise.all(candidates.map(async (item) => {
      try {
        const data = svc && typeof svc.getQuiz === 'function'
          ? await svc.getQuiz(item.path)
          : (svc && typeof svc.fetchJson === 'function' ? await svc.fetchJson(item.path) : null);
        const questions = data && Array.isArray(data.questions) ? data.questions : [];
        if (!questions.length) return null;
        return {
          id: item.id || data.id || item.path,
          title: data.title || item.title || 'Quiz',
          path: item.path,
          basePath: dirOf(item.path),
          timePerQuestion: data.timePerQuestion || item.timePerQuestion || null,
          questionsCount: questions.length,
          questions,
          data
        };
      } catch (_) { return null; }
    }));
    return res.filter(Boolean);
  };

  const pickActive = (quizzes, p) => {
    if (!quizzes.length) return null;
    const target = p.quizId || p.annaleId || p.themeId || p.quizPath || '';
    if (target) {
      const match = quizzes.find((q) => q.id === target || q.path === target);
      if (match) return match;
    }
    const idx = Number(p.index);
    return Number.isInteger(idx) && quizzes[idx] ? quizzes[idx] : quizzes[0];
  };

  async function loadQuizBundle(params = {}) {
    const svc = root && root.ContentService ? root.ContentService : null;
    const schoolId = params.schoolId || params.school || '';
    const isConcours = Boolean(schoolId) || params.kind === 'concours';
    const backHash = sanitizeHash(params.backHash, isConcours ? '#prepa' : '#learn');

    const app = root && root.MathFlowApp ? root.MathFlowApp : null;
    const activeCls = app && typeof app.getActiveClassId === 'function' ? app.getActiveClassId() : '';
    const classId = params.classId || params.classe || activeCls || '2eme-bac-sc-ex';
    const chapterId = params.chapterId || params.chapter || '';
    const manifestPath = isConcours
      ? `data/concours/${encodeURIComponent(schoolId)}/manifest.json`
      : (params.manifestPath || params.manifest || (chapterId ? `data/${classId}/${chapterId}/manifest.json` : ''));
    const baseDir = isConcours ? `data/concours/${schoolId}` : dirOf(manifestPath);
    const man = manifestPath
      ? await fetchManifest(svc, isConcours ? 'getConcoursSchoolManifest' : 'getChapterManifest', isConcours ? schoolId : manifestPath, manifestPath)
      : null;

    const quizzes = await hydrateQuizzes(svc, collectCandidates(man, baseDir, params, isConcours));
    const activeQuiz = pickActive(quizzes, params);
    const title = isConcours
      ? (man && (man.title || man.name)) || `Prépa ${schoolId.toUpperCase()}`
      : (man && man.title) || params.title || 'Quiz du chapitre';

    return {
      kind: isConcours ? 'concours' : 'chapter',
      schoolId, classId, chapterId, title,
      subtitle: activeQuiz ? activeQuiz.title : (isConcours ? 'Entraînement concours' : 'Évaluation rapide'),
      backHash,
      defaultTimePerQuestion: (activeQuiz && activeQuiz.timePerQuestion) || (man && man.timePerQuestion) || (isConcours ? 60 : null),
      quizzes, activeQuiz
    };
  }

  return { loadQuizBundle, load: loadQuizBundle, sanitizeHash };
});
