/**
 * MathFlow — Programme Hub & Bibliothèque (Apprendre, Examens, Problèmes, Prépa Concours)
 */
(function (global) {
  'use strict';

  const CLASS_LABELS = {
    'tronc-commun-sc': 'Tronc Commun Scientifique',
    '1ere-bac-sc-ex': '1ère Bac Sciences Expérimentales',
    '1ere-bac-sc-math': '1ère Bac Sciences Mathématiques',
    '2eme-bac-sc-ex': '2ème Bac Sciences Expérimentales',
    '2eme-bac-sc-math': '2ème Bac Sciences Mathématiques'
  };
  const pc = n => n + '\u00a0%';
  const ic = (d, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const CHECK = ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 13);
  const CHEV = ic('<path d="M6 9l6 6 6-6"/>').replace('<svg', '<svg class="chev"');

  let mountToken = 0;
  let openChapterId = null;
  let activeLib = null;
  const libFilter = { examens: 'all', problemes: 'all', prepa: 'all' };
  const boundContainers = new WeakSet();

  const esc = s => global.MathFlowApp ? global.MathFlowApp.escapeHtml(s) : String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function renderMathSafe(text, markYear) {
    const str = String(text == null ? '' : text);
    const fmt = s => markYear ? esc(s).replace(/\b((?:19|20)\d{2})\b/, '<b class="yr">$1</b>') : esc(s);
    if (!/[\$\\]/.test(str) || !global.MathEngine || typeof global.MathEngine.renderMathInHtml !== 'function') return fmt(str);
    const html = global.MathEngine.renderMathInHtml(str, { enableLexicon: false });
    if (!markYear) return html;
    return html.split(/(<[^>]+>)/g).map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/\b((?:19|20)\d{2})\b/, '<b class="yr">$1</b>'))).join('');
  }

  function countDone(entry) {
    if (Array.isArray(entry)) return entry.filter(x => x != null).length;
    if (entry && typeof entry === 'object') {
      if (Array.isArray(entry.answers)) return entry.answers.filter(x => x != null).length;
      if (typeof entry.done === 'number') return entry.done;
      return Object.values(entry).filter(x => x != null).length;
    }
    return 0;
  }

  function getLessonPct(lMap, chId, revs) {
    if (!lMap) return 0;
    const v = lMap[chId];
    if (typeof v === 'number') return Math.max(0, Math.min(100, Math.round(v)));
    if (v && typeof v === 'object') {
      if (typeof v.pct === 'number') return Math.max(0, Math.min(100, Math.round(v.pct)));
      const nums = Object.values(v).filter(x => typeof x === 'number');
      return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
    }
    const prefixed = Object.entries(lMap)
      .filter(([k, val]) => k.startsWith(chId + ':') && typeof val === 'number')
      .map(([, val]) => Math.max(0, Math.min(100, Math.round(val))));
    if (prefixed.length) {
      const denom = Math.max(prefixed.length, Array.isArray(revs) ? revs.length : 0);
      return Math.round(prefixed.reduce((a, b) => a + b, 0) / denom);
    }
    return 0;
  }

  function countChapterQuizDone(qMap, classId, chId, quizzes) {
    if (!qMap) return 0;
    const direct = qMap[classId + ':' + chId] || qMap[chId];
    let done = direct ? countDone(direct) : 0;
    const scoped = classId + ':' + chId + ':';
    Object.keys(qMap).forEach(k => { if (k.startsWith(chId + ':') || k.startsWith(scoped)) done += countDone(qMap[k]); });
    if (!done && Array.isArray(quizzes)) {
      quizzes.forEach(qz => { if (qz && qz.id && qMap[qz.id]) done += countDone(qMap[qz.id]); });
    }
    return done;
  }

  const stepStatus = pct => (pct >= 100 ? 'd' : pct > 0 ? 'p' : 'o');
  const stepAction = st => (st === 'd' ? 'Revoir' : st === 'p' ? 'Reprendre' : 'Commencer');
  const stepSub = (st, pct, kind) => st === 'd' ? 'Terminé' : st === 'p' ? pc(pct) + ' réalisé' : kind === 'Leçon' ? 'Fiche de cours' : kind === 'Quiz' ? 'Questions QCM' : 'Série guidée';

  function bindChromeEvents(container) {
    if (!container || boundContainers.has(container)) return;
    boundContainers.add(container);

    container.addEventListener('change', e => {
      const sel = e.target.closest('[data-cls-select]');
      if (sel && global.MathFlowApp) {
        openChapterId = null;
        global.MathFlowApp.updateProfile({ cls: sel.value });
        global.MathFlowApp.route();
      }
    });

    container.addEventListener('click', e => {
      const fBtn = e.target.closest('[data-f]');
      if (fBtn && activeLib) {
        libFilter[activeLib.tabId] = fBtn.dataset.f;
        activeLib.redraw();
        const pressed = container.querySelector('[aria-pressed="true"]');
        if (pressed) pressed.focus();
        return;
      }
      const head = e.target.closest('.head'), li = head && head.closest('.ch');
      if (!li) return;
      const wasOpen = li.classList.contains('open');
      container.querySelectorAll('.ch.open').forEach(x => {
        x.classList.remove('open');
        const b = x.querySelector('.head');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
      openChapterId = null;
      if (!wasOpen) {
        li.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
        openChapterId = li.dataset.ch || null;
        if (openChapterId && global.MathFlowApp && typeof global.MathFlowApp.emit === 'function') {
          global.MathFlowApp.emit('chapter:open', { classId: global.MathFlowApp.getActiveClassId(), chapterId: openChapterId });
        }
      }
    });
  }

  async function mountLearn(container) {
    if (!container || !global.ContentService || !global.MathFlowApp) return;
    const token = ++mountToken, app = global.MathFlowApp, classId = app.getActiveClassId(), state = app.getState();
    bindChromeEvents(container);
    const chrome = global.MathFlowProgrammeChrome;
    let classLabel = CLASS_LABELS[classId] || classId;

    let classManifest;
    try { classManifest = await global.ContentService.getClassManifest(classId); } catch {
      if (token === mountToken) container.innerHTML = '<div class="mf-stage-col"><p class="meta">Programme indisponible.</p></div>';
      return;
    }
    if (token !== mountToken) return;
    if (classManifest && (classManifest.className || classManifest.title)) classLabel = classManifest.className || classManifest.title;

    const chapters = (classManifest && classManifest.chapters) || [];
    const subResults = await Promise.allSettled(chapters.map(c => c.manifestPath ? global.ContentService.getChapterManifest(c.manifestPath) : Promise.resolve(null)));
    if (token !== mountToken) return;

    const rs = global.MathFlowResumeStore;
    const resume = rs && typeof rs.readAll === 'function' ? rs.readAll() : null;
    const lv = state.lastVisited || null;

    let sumPct = 0, firstInProgress = null;
    const rowsData = chapters.map((ch, idx) => {
      const subM = subResults[idx].status === 'fulfilled' && subResults[idx].value ? subResults[idx].value : {};
      const revs = (subM.revisions && subM.revisions.length ? subM.revisions : ch.revisions) || [];
      const quizzes = (subM.quizzes && subM.quizzes.length ? subM.quizzes : ch.quizzes) || [];
      const exercises = (subM.exercises && subM.exercises.length ? subM.exercises : ch.exercises) || [];
      const quizCount = subM.quizCount || ch.quizCount || (quizzes.length ? 10 : 0);
      const lp = revs.length ? getLessonPct(state.l, ch.id, revs) : 0;
      const hasQuiz = quizzes.length > 0 || quizCount > 0;
      const u = global.MathFlowUnlocks;
      const qs = u
        ? u.getQuizStats(state.q, classId, ch.id, quizzes, quizCount)
        : { pct: hasQuiz ? Math.min(100, Math.round(countChapterQuizDone(state.q, classId, ch.id, quizzes) * 100 / (quizCount || 1))) : 0, submitted: false };
      const locks = u
        ? u.computeLocks({ classId, chapterId: ch.id, hasLesson: revs.length > 0, hasQuiz, hasExercises: exercises.length > 0, lessonPct: lp, quizPct: qs.pct, quizSubmitted: qs.submitted })
        : { quizLocked: false, exercisesLocked: false, quizHint: '', exercisesHint: '' };
      const steps = [];
      let ep = 0;
      if (revs.length) {
        const activeSheet = resume && resume.lessonActiveSheet[ch.id];
        const lHref = (activeSheet && activeSheet.href) || ('#lecon-' + encodeURIComponent(ch.id));
        const lRes = resume && (resume.lessons[(activeSheet && activeSheet.scrollKey) || ch.id] || resume.lessons[ch.id]);
        const secShort = lRes && rs ? rs.compactSectionLabel(lRes.secTitle) : '';
        const st = stepStatus(lp);
        let detail = stepSub(st, lp, 'Leçon');
        if (lp > 0 && lp < 100 && secShort) detail = pc(lp) + ' · ' + secShort;
        else if (lp >= 100 && lRes && lRes.pct > 0 && lRes.pct < 97) detail = 'Terminé · reprise à ' + pc(lRes.pct);
        steps.push(['lesson', 'Leçon', st, lp, lHref, false, detail]);
      }
      if (hasQuiz) {
        const chKey = 'chapter:' + classId + ':' + ch.id;
        const activeQid = resume && resume.chapterActiveQuiz[chKey];
        const qRes = resume && ((activeQid && resume.quizzes[chKey + ':' + activeQid]) || (Object.entries(resume.quizzes).find(([k]) => k.startsWith(chKey + ':')) || [])[1]);
        const st = stepStatus(qs.pct), qTot = (qRes && qRes.totalQuestions) || quizCount || 0;
        let detail = locks.quizLocked ? locks.quizHint : stepSub(st, qs.pct, 'Quiz');
        if (!locks.quizLocked && qRes) {
          if (qRes.phase === 'end') detail = 'Terminé' + (qTot ? ' · ' + (qRes.answeredCount || 0) + '/' + qTot + ' rép.' : '');
          else if (qRes.idx > 0 || (qRes.answeredCount || 0) > 0) detail = 'Question ' + (qRes.idx + 1) + (qTot ? ' / ' + qTot : '') + ' · ' + pc(qs.pct);
        }
        const qHref = '#quiz-' + encodeURIComponent(ch.id) + (activeQid ? '&quiz=' + encodeURIComponent(activeQid) : '');
        steps.push(['quiz', 'Quiz', locks.quizLocked ? 'l' : st, qs.pct, qHref, locks.quizLocked, detail]);
      }
      if (exercises.length) {
        ep = Math.min(100, Math.round(countDone(state.e[classId + ':' + ch.id] || state.e[ch.id]) * 100 / exercises.length));
        const exoRes = resume && resume.exercises[classId + ':' + ch.id];
        const st = stepStatus(ep);
        let detail = locks.exercisesLocked ? locks.exercisesHint : stepSub(st, ep, 'Exercices');
        if (!locks.exercisesLocked && exoRes && (exoRes.index > 0 || (exoRes.doneCount || 0) > 0)) {
          detail = 'Exercice ' + Math.min(exercises.length, exoRes.index + 1) + ' / ' + exercises.length + ' · ' + pc(ep);
        }
        steps.push(['exo', 'Exercices', locks.exercisesLocked ? 'l' : st, ep, '#exo-' + encodeURIComponent(ch.id), locks.exercisesLocked, detail]);
      }
      const p = steps.length ? Math.round(steps.reduce((a, x) => a + x[3], 0) / steps.length) : 0;
      sumPct += p;
      if (!firstInProgress && p > 0 && p < 100) firstInProgress = ch.id;
      return { ch, idx, p, steps, meta: [quizCount ? quizCount + ' quiz' : '', exercises.length + ' exercices'].filter(Boolean).join(', ') };
    });

    if (!openChapterId && chapters.length) {
      const lvId = lv && lv.chapterId;
      openChapterId = (lvId && chapters.some(c => c.id === lvId)) ? lvId : (firstInProgress || chapters[0].id);
    }

    const rowsHtml = rowsData.map(({ ch, idx, p, steps, meta }) => {
      const isOpen = ch.id === openChapterId;
      const num = String(ch.order != null ? ch.order : idx + 1).padStart(2, '0');
      const lockIcon = (global.MathFlowUnlocks && global.MathFlowUnlocks.LOCK_SVG) || '';
      const stepsHtml = steps.map(([kind, lbl, st, pct, href, locked, subTxt]) => {
        const isLast = Boolean(!locked && lv && lv.chapterId === ch.id && (lv.kind === kind || (lv.type === 'lecon' && kind === 'lesson')));
        const iconHtml = locked ? lockIcon : (st === 'd' ? CHECK : '');
        const actEl = locked
          ? `<button type="button" class="btn locked-btn" data-locked-hint="${esc(subTxt)}" aria-disabled="true">${lockIcon}<span>Verrouillé</span></button>`
          : `<a class="btn${isLast ? ' primary' : ''}" href="${href}">${stepAction(st)}</a>`;
        const badge = isLast ? '<em class="stp-last">Dernier arrêt</em>' : '';
        return `<li class="stp${locked ? ' l locked' : ''}${isLast ? ' is-last-step' : ''}"><span class="si ${st}" style="--p:${pct}">${iconHtml}</span><div class="tx"><b>${lbl}${badge}</b><small>${esc(subTxt)}</small></div>${actEl}</li>`;
      }).join('');
      return `<li class="ch${isOpen ? ' open' : ''}" data-ch="${esc(ch.id)}"><span class="node" style="--p:${p}"><span>${esc(num)}</span></span><div class="ch-card"><button class="head" type="button" aria-expanded="${isOpen}"><span><span class="ttl">${renderMathSafe(ch.title)}</span><span class="meta">${esc(meta)}</span></span><span class="rside">${pc(p)}${CHEV}</span></button><div class="panel"><div><ul class="steps">${stepsHtml}</ul></div></div></div></li>`;
    }).join('');

    const totalPct = chapters.length ? Math.round(sumPct / chapters.length) : 0;
    const topChromeHtml = chrome ? chrome.buildGreetingAndTabsHtml('learn', classId, classLabel) : '';

    container.innerHTML = topChromeHtml
      + `<div class="mf-stage-col">`
        + `<div class="sec"><h2 tabindex="-1">Programme</h2><div class="mf-sec-right"><span id="total">${pc(totalPct)} du programme</span></div></div>`
        + `<ol class="path" id="path">${rowsHtml}</ol>`
      + `</div>`;
    app.applyTheme();
  }

  async function fetchLibSource(tabId, classId) {
    const cs = global.ContentService;
    if (tabId === 'examens') return typeof cs.getExamensIndex === 'function' ? cs.getExamensIndex(classId) : cs.fetchJson('data/' + classId + '/examen/index.json');
    if (tabId === 'problemes') return typeof cs.getProblemesIndex === 'function' ? cs.getProblemesIndex(classId) : cs.fetchJson('data/' + classId + '/problemes/index.json');
    if (typeof cs.getConcoursIndex === 'function') return cs.getConcoursIndex();
    const master = await cs.getMasterManifest();
    return Promise.all(((master && master.concours) || []).map(c => cs.fetchJson(c.manifestPath || ('data/concours/' + c.id + '/manifest.json'))));
  }

  function renderLibView(container, tabId, classId, classLabel, title, subtitle, chips, rows) {
    const activeF = libFilter[tabId] || 'all';
    const visible = rows.filter(r => activeF === 'all' || r.keys.includes(activeF));
    const chipsHtml = chips.map(([v, lbl]) => `<button class="chip" type="button" aria-pressed="${v === activeF}" data-f="${esc(v)}">${esc(lbl)}</button>`).join('');
    const listHtml = visible.length ? visible.map(r => {
      const tg = r.tag ? `<em class="tg${r.am ? ' am' : ''}">${esc(r.tag)}</em>` : '';
      const pb = r.pct != null ? `<span class="pb"><i style="width:${r.pct}%"></i></span>` : '';
      return `<li><a class="it" href="${esc(r.href)}"><span class="rt2">${r.titleHtml}${tg}</span><span class="mt">${esc(r.meta)}</span>${CHEV}${pb}</a></li>`;
    }).join('') : '<li><div class="it off"><span class="rt2">Aucun élément disponible pour cette filière</span><span class="mt">—</span><span></span></div></li>';
    const chrome = global.MathFlowProgrammeChrome;
    const topChromeHtml = chrome ? chrome.buildGreetingAndTabsHtml(tabId, classId, classLabel) : '';
    container.innerHTML = topChromeHtml
      + `<div class="mf-stage-col"><h1 tabindex="-1">${esc(title)}</h1><p class="sub">${esc(subtitle)}</p><div class="chips2" role="group" aria-label="Filtrer">${chipsHtml}</div><ul class="lst">${listHtml}</ul></div>`;
  }

  function buildLibraryModel(tabId, data, state, classLabel) {
    const resume = global.MathFlowResumeStore && typeof global.MathFlowResumeStore.readAll === 'function' ? global.MathFlowResumeStore.readAll() : null;
    if (tabId === 'examens') {
      const items = Array.isArray(data) ? data : (data && data.examens) || [];
      const years = [...new Set(items.map(x => String(x.year || '')).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
      const chips = [['all', 'Tous'], ['s:normale', 'Normale'], ['s:rattrapage', 'Rattrapage'], ...years.map(y => ['y:' + y, y])];
      const rows = items.map(ex => {
        const rattr = /rattrapage/i.test(String(ex.session || '')), cnt = ex.exerciseCount || 4;
        const done = countDone(state.e['examen-' + ex.id] || state.e[ex.id]);
        const eRes = resume && (resume.exercises['examen-' + ex.id] || resume.exercises[ex.id]);
        const rMeta = eRes && (eRes.index > 0 || (eRes.doneCount || 0) > 0) ? ` · Ex. ${eRes.index + 1}/${cnt}` : '';
        return {
          href: '#examen-' + encodeURIComponent(ex.id), titleHtml: renderMathSafe(ex.title || ('Examen ' + (ex.year || '')), true),
          tag: rattr ? 'Rattrapage' : 'Normale', am: rattr, meta: cnt + ' ex.' + rMeta,
          pct: Math.min(100, Math.round(done * 100 / cnt)), keys: ['y:' + String(ex.year || ''), 's:' + (rattr ? 'rattrapage' : 'normale')]
        };
      });
      return { title: 'Examens Nationaux', sub: 'Sujets corrigés — ' + classLabel, chips, rows };
    }
    if (tabId === 'problemes') {
      const items = Array.isArray(data) ? data : (data && data.problemes) || [];
      const tMap = Object.fromEntries(((data && data.themes) || []).map(t => [t.id, t.name]));
      const chips = [['all', 'Tous'], ...[...new Set(items.map(p => p.theme).filter(Boolean))].map(id => [id, tMap[id] || id])];
      const rows = items.map(pb => {
        const lRes = resume && (resume.lessons['prob:' + pb.id] || resume.lessons[pb.id]);
        const rMeta = lRes && lRes.pct > 0 && lRes.pct < 97 ? ` · Reprise ${lRes.pct}\u00a0%` : '';
        return {
          href: '#probleme-' + encodeURIComponent(pb.id), titleHtml: renderMathSafe(pb.title || pb.id),
          tag: pb.difficulty || '', am: /avanc|diffic/i.test(pb.difficulty || ''),
          meta: (tMap[pb.theme] || pb.theme || 'Problème') + rMeta,
          pct: getLessonPct(state.l, 'prob:' + pb.id) || getLessonPct(state.l, 'probleme-' + pb.id) || getLessonPct(state.l, pb.id), keys: [pb.theme || '']
        };
      });
      return { title: 'Problèmes', sub: 'Problèmes de synthèse — ' + classLabel, chips, rows };
    }
    const schools = Array.isArray(data) ? data : (data && (data.schools || data.concours)) || [];
    const chips = [['all', 'Tous'], ['ensa', 'ENSA'], ['ensam', 'ENSAM'], ['medecine', 'Médecine']];
    const rows = [];
    schools.forEach(sc => {
      const sid = sc.id || '', sname = sc.name || sid.toUpperCase();
      (sc.quizzes || []).forEach(qz => {
        const done = countDone(state.q['concours-' + sid + '-' + qz.id] || state.q[qz.id]);
        rows.push({
          href: '#concours-' + encodeURIComponent(sid) + '&quiz=' + encodeURIComponent(qz.id),
          titleHtml: renderMathSafe(`${sname} — ${qz.title || qz.theme || 'Quiz'}`), tag: 'Quiz', am: false,
          meta: (sc.timePerQuestion || 45) + 's/qst',
          pct: Math.min(100, Math.round(done * 100 / (qz.questionsCount || sc.questionsPerExam || 10))), keys: [sid]
        });
      });
      (sc.annales || []).forEach(an => {
        const aid = an.id || (an.path ? an.path.split('/').pop().replace(/\.json$/i, '') : String(an.year || ''));
        const done = countDone(state.q['concours-' + sid + '-' + aid] || state.q[aid]), tot = an.questionsCount || sc.questionsPerExam || 20;
        rows.push({
          href: '#concours-' + encodeURIComponent(sid) + '&annale=' + encodeURIComponent(aid),
          titleHtml: renderMathSafe(`${sname} — ${an.title || ('Session ' + (an.year || aid))}`, true),
          tag: 'Annale', am: true, meta: tot + ' qst', pct: Math.min(100, Math.round(done * 100 / tot)), keys: [sid]
        });
      });
    });
    return { title: 'Prépa Concours', sub: 'Quiz thématiques et annales — ENSA, ENSAM, Médecine', chips, rows };
  }

  async function mountLibrary(container, tabId) {
    if (!container || !global.ContentService || !global.MathFlowApp) return;
    const token = ++mountToken, app = global.MathFlowApp, classId = app.getActiveClassId();
    bindChromeEvents(container);
    const classLabel = CLASS_LABELS[classId] || classId, state = app.getState();
    const raw = await fetchLibSource(tabId, classId).catch(() => null);
    if (token !== mountToken) return;
    const model = buildLibraryModel(tabId, raw, state, classLabel);
    if (!model.chips.some(c => c[0] === libFilter[tabId])) libFilter[tabId] = 'all';
    const redraw = () => renderLibView(container, tabId, classId, classLabel, model.title, model.sub, model.chips, model.rows);
    activeLib = { tabId, redraw };
    redraw();
  }

  function unmount() { mountToken++; activeLib = null; }

  const ProgrammePage = { mountLearn, mountLibrary, unmount };
  global.ProgrammePage = ProgrammePage;
  if (typeof module !== 'undefined' && module.exports) module.exports = ProgrammePage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
