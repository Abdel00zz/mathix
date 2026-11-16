/**
 * Moteur de rendu des quiz élève (QCM, V/F, Ordre, Chasse à l'erreur, Saisie libre) — v2
 * Zéro classe Tailwind, zéro URL .html : respecte strictement les classes sémantiques du cahier.
 *
 * Corrections v2 (détails dans AUDIT.md) :
 *  - QCM à options-objets avec `correctIndex` (sans isCorrect ni correctAnswer) : la bonne réponse
 *    retombait silencieusement sur l'option A. Résolution unifiée : drapeaux > correctIndex > id > lettre > texte.
 *  - saisie libre : « 0,5 », « 1/2 », « \frac{1}{2} », « x = 0.5 », « .5 » acceptés pour 0.5 (v1 : égalité stricte)
 *  - valider sans choix n'est plus évalué comme « faux » (isAnswerable) ; l'index -1 n'est jamais « correct »
 *  - rendu maths mémoïsé (LRU) ; esc() toujours local ; role=radiogroup abusif remplacé (boutons aria-pressed)
 *  - retour d'évaluation focalisable (tabindex=-1), message d'invite, vue vide/erreur, question absente tolérée
 *  - champs : autocomplétion/majuscule/correcteur désactivés, libellé accessible
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathFlowQuizRenderer = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
  'use strict';

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  const esc = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const safeHash = (h, fallback = '#learn') =>
    esc(typeof h === 'string' && /^#[A-Za-z0-9_/?=&.-]+$/.test(h) && !/\.html\b/i.test(h) ? h : fallback);

  const toText = (v) => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map(String).join('\n\n');
    return '';
  };

  /* ───────── Rendu maths mémoïsé ───────── */
  const CACHE_MAX = 600, cache = new Map();
  const renderMath = (html, media, basePath = '') => {
    const me = root && root.MathEngine;
    const text = String(html == null ? '' : html);
    if (!text) return '';
    if (!me) return esc(text).replace(/\n/g, '<br>');
    let key = null;
    try { key = basePath + '\u0001' + (media ? JSON.stringify(media) : '') + '\u0001' + text; } catch (_) { key = null; }
    if (key !== null && cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
    let out;
    if (media && typeof me.renderWithMedia === 'function') out = me.renderWithMedia(text, media, { surface: 'default', basePath });
    else if (typeof me.renderMathInHtml === 'function') out = me.renderMathInHtml(text, { enableLexicon: false, basePath });
    else return esc(text).replace(/\n/g, '<br>');
    if (key !== null) { cache.set(key, out); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
    return out;
  };
  const clearCache = () => cache.clear();

  const mapType = (rawType) => {
    const t = String(rawType || 'mcq').toLowerCase();
    if (t === 'boolean' || t === 'true-false' || t === 'tf') return 'boolean';
    if (t === 'order' || t === 'ordering') return 'order';
    if (t === 'error' || t === 'error-spotting') return 'error';
    return t === 'input' || t === 'text' ? 'input' : 'mcq';
  };

  const warn = (msg) => { if (root && root.console && typeof root.console.warn === 'function') root.console.warn('[MathFlow quiz] ' + msg); };

  /** Index de la bonne option. Priorité : drapeaux isCorrect > correctIndex > id > lettre > texte. -1 si introuvable. */
  function resolveCorrectIndex(raw, opts) {
    const flagged = opts.findIndex((o) => o.flag);
    if (flagged >= 0) return flagged;
    const ci = raw.correctIndex != null && raw.correctIndex !== '' ? Number(raw.correctIndex) : NaN;
    if (Number.isInteger(ci) && ci >= 0 && ci < opts.length) return ci;
    const ca = raw.correctAnswer != null ? raw.correctAnswer : raw.answer;
    if (ca == null) return -1;
    const s = String(ca).trim();
    let i = opts.findIndex((o) => String(o.id) === s);
    if (i >= 0) return i;
    if (/^[A-F]$/i.test(s)) { i = LETTERS.indexOf(s.toUpperCase()); if (i >= 0 && i < opts.length) return i; }
    i = opts.findIndex((o) => o.text === s);
    if (i >= 0) return i;
    if (/^\d+$/.test(s) && Number(s) < opts.length) return Number(s);
    return -1;
  }

  function normalizeQuestion(raw = {}, index = 0, basePath = '') {
    raw = raw && typeof raw === 'object' ? raw : {};
    const type = mapType(raw.type);
    const base = {
      id: raw.id || `q-${index}`, index, type,
      category: raw.category || raw.section || '',
      difficulty: raw.difficulty || '',
      context: toText(raw.context),
      prompt: toText(raw.question) || toText(raw.prompt) || toText(raw.statement),
      explanation: toText(raw.explanation) || toText(raw.correction),
      timeLimit: Number(raw.timeLimit) > 0 ? Number(raw.timeLimit) : null,
      media: raw.media || null,
      basePath: raw.basePath || basePath || ''
    };

    if (type === 'boolean') {
      let val = typeof raw.isTrue === 'boolean' ? raw.isTrue : /^(true|vrai|v|oui|1)$/i.test(String(raw.correctAnswer));
      if (typeof raw.isTrue !== 'boolean' && Array.isArray(raw.options) && raw.options[0] && typeof raw.options[0] === 'object') {
        val = Boolean(raw.options[0].isCorrect || raw.options[0].is_correct);
      }
      base.options = [
        { id: 'true', label: 'V', text: 'Vrai', isCorrect: val === true },
        { id: 'false', label: 'F', text: 'Faux', isCorrect: val === false }
      ];
      base.correctIndex = val ? 0 : 1;
      return base;
    }

    if (type === 'order') {
      const items = (Array.isArray(raw.items || raw.options) ? (raw.items || raw.options) : []).map((it, i) => (typeof it === 'string'
        ? { id: String(i + 1), text: it }
        : { id: String(it && it.id != null ? it.id : i + 1), text: toText(it && (it.text || it.content || it.label)) }));
      const ids = items.map((it) => it.id);
      base.items = items;
      base.correctOrder = Array.isArray(raw.correctOrder)
        ? raw.correctOrder.map((v) => (ids.includes(String(v)) ? String(v) : (ids[Number(v)] || String(v))))
        : ids.slice();
      return base;
    }

    if (type === 'error') {
      const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((s, i) => (typeof s === 'string'
        ? { id: String(i + 1), text: s, isError: false, correction: '' }
        : { id: String(s && s.id != null ? s.id : i + 1), text: toText(s && (s.text || s.step || s.content)), isError: Boolean(s && s.isError), correction: toText(s && s.correction) }));
      let errIdx = steps.findIndex((s) => s.isError);
      if (errIdx < 0) errIdx = Number.isInteger(raw.errorIndex) ? raw.errorIndex : (Number.isInteger(raw.errorStepIndex) ? raw.errorStepIndex : -1);
      if (errIdx < 0 || errIdx >= steps.length) { warn(`question « ${base.id} » : étape erronée non indiquée (étape 1 utilisée).`); errIdx = 0; }
      if (steps[errIdx]) steps[errIdx].isError = true;
      base.steps = steps;
      base.correctIndex = errIdx;
      return base;
    }

    if (type === 'input') {
      const list = Array.isArray(raw.correctAnswers) ? raw.correctAnswers : (raw.correctAnswer != null ? [raw.correctAnswer] : []);
      base.correctAnswers = list.map(String);
      base.placeholder = raw.placeholder || 'Votre réponse...';
      return base;
    }

    const opts = (Array.isArray(raw.options) ? raw.options : []).map((opt, i) => (typeof opt === 'string'
      ? { id: String(i), label: LETTERS[i] || String(i + 1), text: opt, flag: false }
      : {
          id: String(opt && opt.id != null ? opt.id : i), label: LETTERS[i] || String(i + 1),
          text: toText(opt && (opt.text || opt.label || opt.content)),
          flag: Boolean(opt && (opt.isCorrect || opt.is_correct))
        }));
    let cIdx = resolveCorrectIndex(raw, opts);
    if (cIdx < 0) { warn(`question « ${base.id} » : bonne réponse introuvable (option A utilisée).`); cIdx = 0; base.keyMissing = true; }
    base.options = opts.map((o, i) => ({ id: o.id, label: o.label, text: o.text, isCorrect: i === cIdx }));
    base.correctIndex = cIdx;
    return base;
  }

  /* ───────── Rendu des réponses ───────── */
  function renderChoiceCard({ idx, label, bodyHtml, stateClass = '', extraClass = '', statusMark = '', selected = false, disabled = false }) {
    const cls = ['opt', extraClass, stateClass].filter(Boolean).join(' ');
    const mark = statusMark ? `<em aria-hidden="true">${esc(statusMark)}</em>` : '';
    const sr = statusMark === '✓' ? '<span class="sr-only"> (bonne réponse)</span>' : (statusMark === '✗' ? '<span class="sr-only"> (réponse choisie, incorrecte)</span>' : '');
    return `<button type="button" class="${cls}" data-quiz-choice="${idx}" aria-pressed="${selected ? 'true' : 'false'}"${disabled ? ' disabled' : ''}><b>${esc(label)}</b><span>${bodyHtml}${sr}</span>${mark}</button>`;
  }

  const choiceState = (answered, isSel, isOk) => !answered
    ? { stateClass: isSel ? 'is-selected' : '', mark: '' }
    : (isOk ? { stateClass: 'ok', mark: '✓' } : (isSel ? { stateClass: 'bad', mark: '✗' } : { stateClass: 'dim', mark: '' }));

  function renderQuestionBody(q, draft = {}, answer = null) {
    draft = draft || {};
    const answered = Boolean(answer && answer.status === 'answered');
    const bp = q.basePath;

    if (q.type === 'mcq' || q.type === 'boolean') {
      const selIdx = answered ? answer.selectedIndex : (Number.isInteger(draft.selectedIndex) ? draft.selectedIndex : -1);
      const cards = q.options.map((opt, i) => {
        const st = choiceState(answered, selIdx === i, i === q.correctIndex);
        return renderChoiceCard({
          idx: i, label: opt.label || LETTERS[i] || String(i + 1), bodyHtml: renderMath(opt.text, null, bp),
          stateClass: st.stateClass, statusMark: st.mark, selected: selIdx === i, disabled: answered
        });
      }).join('');
      return `<div class="${q.type === 'boolean' ? 'opts opts--boolean' : 'opts'}" role="group" aria-label="Réponses possibles">${cards}</div>`;
    }

    if (q.type === 'order') {
      const seq = answered && Array.isArray(answer.orderItems) && answer.orderItems.length
        ? answer.orderItems
        : (Array.isArray(draft.orderItems) && draft.orderItems.length ? draft.orderItems : q.items.map((it) => it.id));
      const byId = Object.fromEntries(q.items.map((it) => [it.id, it]));
      const rows = seq.map((id, pos) => {
        const ok = q.correctOrder[pos] === id;
        const label = ((byId[id] || {}).text || '').replace(/\$/g, '');
        const ctrl = answered ? `<em aria-hidden="true">${ok ? '✓' : '✗'}</em>` : `<span class="quiz-order-controls">` +
          `<button type="button" class="ib" data-order-move="up" data-idx="${pos}"${pos === 0 ? ' disabled' : ''} aria-label="Monter l’élément ${pos + 1}">↑</button>` +
          `<button type="button" class="ib" data-order-move="down" data-idx="${pos}"${pos === seq.length - 1 ? ' disabled' : ''} aria-label="Descendre l’élément ${pos + 1}">↓</button></span>`;
        return `<div class="opt quiz-order-item${answered ? (ok ? ' ok' : ' bad') : ''}" data-order-id="${esc(id)}" data-label="${esc(label.slice(0, 60))}">` +
          `<b>${pos + 1}</b><span>${renderMath((byId[id] || {}).text || '', null, bp)}</span>${ctrl}</div>`;
      }).join('');
      return `<div class="quiz-order-list" role="list" aria-label="Éléments à remettre dans l’ordre">${rows}</div>`;
    }

    if (q.type === 'error') {
      const sel = answered ? answer.selectedIndex : (Number.isInteger(draft.selectedIndex) ? draft.selectedIndex : -1);
      const stepsHtml = q.steps.map((step, i) => {
        const st = choiceState(answered, sel === i, i === q.correctIndex);
        return renderChoiceCard({
          idx: i, label: `É${i + 1}`, extraClass: 'quiz-error-choice', bodyHtml: renderMath(step.text, null, bp),
          stateClass: st.stateClass, statusMark: st.mark, selected: sel === i, disabled: answered
        });
      }).join('');
      const fix = answered && q.steps[q.correctIndex] && q.steps[q.correctIndex].correction
        ? `<div class="quiz-error-fix"><strong>Correction :</strong> ${renderMath(q.steps[q.correctIndex].correction, null, bp)}</div>` : '';
      return `<div class="quiz-error-list" role="group" aria-label="Étapes du raisonnement">${stepsHtml}${fix}</div>`;
    }

    const txt = answered ? (answer.text || '') : (draft.text || '');
    return `<div class="quiz-input-wrap"><input type="text" class="quiz-input" data-quiz-input placeholder="${esc(q.placeholder)}" aria-label="Votre réponse" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" value="${esc(txt)}"${answered ? ' disabled' : ''}></div>`;
  }

  /* ───────── Évaluation ───────── */
  /** Forme canonique d'une réponse saisie : insensible à la casse, aux espaces, à la virgule décimale, aux \frac, au « x = ». */
  function canonAnswer(input) {
    let s = String(input == null ? '' : input).normalize('NFC').toLowerCase()
      .replace(/[\u2212\u2012\u2013\u2014]/g, '-').replace(/\u00a0/g, ' ')
      .replace(/\$/g, '').replace(/\\(?:left|right|displaystyle|,|;|!|quad)/g, '')
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)').replace(/\\infty|∞/g, 'inf')
      .replace(/\s+/g, '').replace(/(\d),(\d)/g, '$1.$2').replace(/[.;]+$/, '');
    s = s.replace(/\(([+-]?\d+(?:\.\d+)?)\)/g, '$1');
    return s;
  }
  const NUM_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\/([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?$/;
  function numericValue(canon) {
    const m = NUM_RE.exec(canon);
    if (!m) return null;
    const a = parseFloat(m[1]), b = m[2] != null ? parseFloat(m[2]) : 1;
    return b === 0 || !Number.isFinite(a / b) ? null : a / b;
  }
  function sameAnswer(given, expected) {
    const g = canonAnswer(given), e = canonAnswer(expected);
    if (!g || !e) return false;
    if (g === e) return true;
    const lhs = /^[a-z]\w*=(.+)$/.exec(g);
    if (lhs && !e.includes('=') && sameAnswer(lhs[1], e)) return true;
    const gn = numericValue(g), en = numericValue(e);
    return gn != null && en != null && Math.abs(gn - en) <= 1e-9 * Math.max(1, Math.abs(en));
  }

  /** Une réponse peut-elle être évaluée ? (évite de compter « faux » un clic sur Valider sans choix) */
  function isAnswerable(q, draft = {}) {
    draft = draft || {};
    if (q.type === 'order') return true;
    if (q.type === 'input') return String(draft.text || '').trim() !== '';
    return Number.isInteger(draft.selectedIndex) && draft.selectedIndex >= 0;
  }

  function evaluateAnswer(q, draft = {}) {
    draft = draft || {};
    if (q.type === 'order') {
      const seq = Array.isArray(draft.orderItems) && draft.orderItems.length ? draft.orderItems.slice() : q.items.map((it) => it.id);
      const isCorrect = seq.length === q.correctOrder.length && seq.every((id, i) => id === q.correctOrder[i]);
      return { status: 'answered', isCorrect, orderItems: seq };
    }
    if (q.type === 'input') {
      const text = String(draft.text || '');
      return { status: 'answered', isCorrect: q.correctAnswers.some((a) => sameAnswer(text, a)), text };
    }
    const selectedIndex = Number.isInteger(draft.selectedIndex) ? draft.selectedIndex : -1;
    return { status: 'answered', isCorrect: selectedIndex >= 0 && selectedIndex === q.correctIndex, selectedIndex };
  }

  function formatComparison(q, answer) {
    const bp = q.basePath;
    if (q.type === 'order') {
      const byId = Object.fromEntries(q.items.map((it, i) => [it.id, `${i + 1}. ${it.text}`]));
      return {
        got: (answer.orderItems || []).map((id) => renderMath(byId[id] || id, null, bp)).join(' → ') || 'Aucune réponse',
        expected: q.correctOrder.map((id) => renderMath(byId[id] || id, null, bp)).join(' → ')
      };
    }
    if (q.type === 'input') return { got: esc(answer.text || 'Aucune réponse'), expected: renderMath(q.correctAnswers[0] || '', null, bp) };
    const list = q.type === 'error' ? q.steps : q.options;
    const label = (i) => q.type === 'error' ? `Étape ${i + 1} : ` : `${(list[i] && list[i].label) || LETTERS[i]} — `;
    const uIdx = Number.isInteger(answer.selectedIndex) ? answer.selectedIndex : -1;
    return {
      got: uIdx >= 0 && list[uIdx] ? `${label(uIdx)}${renderMath(list[uIdx].text, null, bp)}` : 'Aucune réponse',
      expected: list[q.correctIndex] ? `${label(q.correctIndex)}${renderMath(list[q.correctIndex].text, null, bp)}` : ''
    };
  }

  function renderFeedbackHtml(q, answer) {
    if (!answer || answer.status !== 'answered') return '';
    const title = answer.isCorrect ? 'Bonne réponse' : (answer.timedOut ? 'Temps écoulé' : 'Réponse incorrecte');
    const cmp = formatComparison(q, answer);
    const expl = q.explanation ? `<p class="quiz-why-expl">${renderMath(q.explanation, null, q.basePath)}</p>` : '';
    return `<div class="why${answer.isCorrect ? ' okbox' : ''}" role="status" tabindex="-1" id="quiz-feedback"><strong>${esc(title)}</strong>` +
      `<p class="quiz-why-cmp"><b>Attendu :</b> ${cmp.expected}<br><b>Votre choix :</b> ${cmp.got}</p>${expl}</div>`;
  }

  /* ───────── Vues ───────── */
  function renderEmptyView(vm) {
    const href = safeHash(vm && vm.backHash);
    const msg = vm && vm.message ? `<p>${esc(vm.message)}</p>` : '';
    return `<header class="top"><a class="back" href="${href}">← Retour</a></header><section class="end" role="alert"><h2>${esc((vm && vm.title) || 'Aucun quiz disponible')}</h2>${msg}<a class="btn primary" href="${href}">Retour</a></section>`;
  }

  function renderQuizView(vm) {
    const q = vm.question;
    if (!q) return renderEmptyView({ backHash: vm.backHash, title: 'Aucune question à afficher' });
    const pct = vm.total > 0 ? Math.round(((vm.index + 1) / vm.total) * 100) : 0;
    const answered = Boolean(vm.answer && vm.answer.status === 'answered');
    const ls = root && root.LeconSearch;
    const optText = (t) => (ls && typeof ls.contentToPlainText === 'function' ? ls.contentToPlainText(t) : String(t || '').replace(/\$/g, ''));
    const sel = vm.quizzes && vm.quizzes.length > 1
      ? `<select class="quiz-select" data-quiz-select aria-label="Série">${vm.quizzes.map((qz) => `<option value="${esc(qz.id)}"${qz.id === vm.activeQuizId ? ' selected' : ''}>${esc(optText(qz.title))}</option>`).join('')}</select>`
      : `<span class="top-title">${renderMath(vm.title || 'Quiz')}</span>`;
    const ctxParts = [q.category, q.difficulty].filter(Boolean).map(esc).join(' · ');
    const ctxHtml = (ctxParts || q.context) ? `<div class="ctx">${ctxParts ? `<span>${ctxParts}</span>` : ''}${q.context ? `<p>${renderMath(q.context, null, q.basePath)}</p>` : ''}</div>` : '';
    const primary = !answered ? '<button type="button" class="btn primary" data-a="ok">Valider</button>'
      : (vm.index < vm.total - 1 ? '<button type="button" class="btn primary" data-a="next">Suivant</button>' : '<button type="button" class="btn primary" data-a="finish">Terminer</button>');
    const notice = vm.notice ? `<p class="quiz-notice" role="alert">${esc(vm.notice)}</p>` : '';

    return `<header class="top"><a class="back" href="${safeHash(vm.backHash)}">← Retour</a>${sel}` +
      `<span class="cnt">${vm.index + 1} / ${vm.total}</span>` +
      `<button type="button" class="pill quiz-tt-pill${vm.tiersTemps ? ' is-on' : ''}" id="quiz-tiers-temps-badge" data-tt aria-pressed="${vm.tiersTemps ? 'true' : 'false'}" title="Tiers-temps (+33%)">+33%</button>` +
      `<span class="cnt" id="tm" role="timer" aria-label="Temps restant">${esc(vm.timerText || '00:00')}</span></header>` +
      `<div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="${vm.total}" aria-valuenow="${vm.index + 1}" aria-label="Progression"><i style="width:${pct}%"></i></div>` +
      `<section class="quiz-stage">${ctxHtml}<div class="qt">${renderMath(q.prompt, q.media, q.basePath)}</div>` +
      `${renderQuestionBody(q, vm.draft, vm.answer)}${notice}${renderFeedbackHtml(q, vm.answer)}</section>` +
      `<div class="act"><button type="button" class="btn ghost" data-a="prev"${vm.index === 0 ? ' disabled' : ''}>Précédent</button>` +
      `<button type="button" class="btn ghost" data-a="skip"${answered ? ' disabled' : ''}>Passer</button>${primary}</div>`;
  }

  function renderSummaryView(vm) {
    const pct = Math.round(((vm.correctCount || 0) / Math.max(1, vm.total || 0)) * 100);
    const review = vm.errorCount > 0 ? `<button type="button" class="btn" data-a="review-errors">Revoir les erreurs (${vm.errorCount})</button>` : '';
    return `<header class="top"><a class="back" href="${safeHash(vm.backHash)}">← Retour</a><span class="top-title">${renderMath(vm.title || 'Bilan du quiz')}</span></header>` +
      `<section class="end"><div class="ring" style="--p:${pct}" role="img" aria-label="${pct} pour cent de réussite"><b>${pct}%</b></div>` +
      `<h2 tabindex="-1">${vm.correctCount || 0} / ${vm.total || 0} bonnes réponses</h2>` +
      `<p class="xt">${vm.skippedCount ? `${vm.skippedCount} question(s) passée(s) · ` : ''}Durée : ${esc(vm.elapsedText || '00:00')}</p>` +
      `<div class="row">${review}<button type="button" class="btn primary" data-a="redo">Recommencer</button>` +
      `<a class="btn ghost" href="${safeHash(vm.backHash)}">Retour</a></div></section>`;
  }

  return {
    normalizeQuestion, renderChoiceCard, renderQuestionBody, renderFeedbackHtml, renderQuizView, renderSummaryView, renderEmptyView,
    evaluateAnswer, isAnswerable, sameAnswer, canonAnswer, safeHash, clearCache
  };
});
