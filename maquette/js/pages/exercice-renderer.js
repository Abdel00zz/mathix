/**
 * Moteur de rendu des exercices (Pas à pas & Feuille d'examen imprimable A4) — v2
 * Zéro classe Tailwind, zéro URL .html : utilise exclusivement les classes sémantiques.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.MathFlowExerciceRenderer = api;
    root.MathFlowExerciseRenderer = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var RATING_LABELS = ['À revoir', 'Presque', 'Maîtrisé'];
  var HINT_LAMP_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
    '<path d="M9 18h6"/><path d="M10 22h4"/></svg>';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeHash(h, fallback) {
    if (typeof h === 'string' && /^#[A-Za-z0-9_/?=&.-]+$/.test(h) && !/\.html\b/i.test(h)) return esc(h);
    return esc(fallback || '#learn');
  }

  function hasMediaSrc(media) {
    if (!media) return false;
    if (typeof media === 'string') return Boolean(media.trim());
    if (media.src) return true;
    return Boolean(Array.isArray(media.images) && media.images[0] && media.images[0].src);
  }

  /* ───────── Rendu maths mémoïsé (LRU) ───────── */
  var CACHE_MAX = 600, cache = new Map();
  function cacheKey(text, media, basePath) {
    var m = '';
    if (media) { try { m = JSON.stringify(media); } catch (_e) { return null; } }
    return basePath + '\u0001' + m + '\u0001' + text;
  }
  function renderMath(html, media, basePath) {
    var me = root && root.MathEngine;
    var text = String(html == null ? '' : html);
    if (!text && !hasMediaSrc(media)) return '';
    var bp = basePath || '';
    var key = me ? cacheKey(text, media, bp) : null;
    if (key !== null && cache.has(key)) {
      var hit = cache.get(key);
      cache.delete(key); cache.set(key, hit);
      return hit;
    }
    var out;
    if (me && hasMediaSrc(media) && typeof me.renderWithMedia === 'function') out = me.renderWithMedia(text, media, { surface: 'default', basePath: bp });
    else if (me && typeof me.renderMathInHtml === 'function') out = me.renderMathInHtml(text, { enableLexicon: false, basePath: bp });
    else return esc(text).replace(/\n/g, '<br>');
    if (key !== null) {
      cache.set(key, out);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
    return out;
  }
  function clearCache() { cache.clear(); }

  function formatBareme(b) {
    if (b == null || b === '') return '';
    var s = String(b).trim();
    if (!s) return '';
    return /pt/i.test(s) ? s : (s + (Number(s.replace(',', '.')) > 1 ? ' pts' : ' pt'));
  }

  function renderHintPanel(node, opts, hintId, isOpen) {
    if (!node.hint || !String(node.hint).trim()) return '';
    var bp = (opts && opts.basePath) || '';
    return '<div class="exo-hint-panel" id="' + esc(hintId) + '"' + (isOpen ? '' : ' hidden') + '>' +
      '<div class="exo-hint-box">' + renderMath(node.hint, null, bp) + '</div></div>';
  }

  function renderSolDetails(node, opts) {
    if (!opts || !opts.showSol || !node.correction || !String(node.correction).trim()) return '';
    var bp = opts.basePath || '';
    return '<details class="sol"' + (opts.openSol ? ' open' : '') + '><summary>Corrigé</summary>' +
      '<div class="why okbox">' + renderMath(node.correction, null, bp) + '</div></details>';
  }

  function isHintOpen(openHints, hintId) {
    if (!openHints) return false;
    if (typeof openHints.has === 'function') return openHints.has(hintId);
    return Array.isArray(openHints) ? openHints.indexOf(hintId) !== -1 : Boolean(openHints[hintId]);
  }

  function renderSubQuestionRow(node, opts) {
    node = node || {};
    var o = opts || {};
    var depth = o.depth || 2;
    var bp = o.basePath || '';
    var rowKey = o.rowKey || 'row';
    var hintId = 'exo-hint-' + rowKey;
    var hasHint = Boolean(node.hint && String(node.hint).trim());
    var hintOpen = hasHint && isHintOpen(o.openHints, hintId);
    var rowCls = depth <= 1 ? 'exo-q-row' : (depth === 2 ? 'exo-sub-row' : 'exo-sub-row exo-sub-row--deep');
    var baremeTxt = formatBareme(node.bareme);
    var badge = baremeTxt ? '<span class="exo-bareme">' + esc(baremeTxt) + '</span>' : '';
    var hintBtn = hasHint
      ? '<button type="button" class="exo-hint-btn" data-hint-toggle="' + esc(hintId) + '" aria-expanded="' + (hintOpen ? 'true' : 'false') + '" aria-controls="' + esc(hintId) + '">' + HINT_LAMP_SVG + '<span>Indice</span></button>'
      : '';
    var aside = (badge || hintBtn) ? '<div class="exo-row-aside">' + badge + hintBtn + '</div>' : '';
    var childrenHtml = Array.isArray(node.children) && node.children.length
      ? node.children.map(function (c, cIdx) {
          return renderSubQuestionRow(c, { depth: 3, basePath: bp, showSol: o.showSol, openSol: o.openSol, openHints: o.openHints, rowKey: rowKey + '-c' + cIdx });
        }).join('')
      : '';
    var bodyHtml = (node.content && String(node.content).trim()) || hasMediaSrc(node.media) ? renderMath(node.content, node.media, bp) : '';

    return '<div class="' + rowCls + '">' +
      '<div class="exo-row-head">' +
        '<span class="exo-row-label">' + esc(node.label || '') + '</span>' +
        '<div class="exo-row-content">' + bodyHtml + '</div>' + aside +
      '</div>' +
      renderHintPanel(node, o, hintId, hintOpen) +
      renderSolDetails(node, o) +
      childrenHtml +
    '</div>';
  }

  function renderQuestionBlock(block, opts, keyPrefix) {
    var subs = block.subQuestions || [];
    var hasSingleEmptySub = subs.length === 1 && !String(subs[0].content || '').trim() && !(subs[0].children && subs[0].children.length);
    var headRow = renderSubQuestionRow({
      label: block.label,
      content: block.content,
      bareme: block.bareme,
      hint: hasSingleEmptySub ? (block.hint || subs[0].hint) : block.hint,
      correction: hasSingleEmptySub ? (block.correction || subs[0].correction) : block.correction,
      media: block.media
    }, { depth: 1, basePath: opts.basePath, showSol: opts.showSol, openSol: opts.openSol, openHints: opts.openHints, rowKey: keyPrefix });

    if (!subs.length || hasSingleEmptySub) return headRow;
    var subsHtml = subs.map(function (sq, sIdx) {
      return renderSubQuestionRow(sq, { depth: 2, basePath: opts.basePath, showSol: opts.showSol, openSol: opts.openSol, openHints: opts.openHints, rowKey: keyPrefix + '-s' + sIdx });
    }).join('');
    return '<div class="exo-q-group">' + headRow + '<div class="exo-subs">' + subsHtml + '</div></div>';
  }

  function renderUnavailable(ex, index) {
    return '<article class="exo-article exo-failed" role="alert"><div class="ctx"><div class="exo-context">' +
      '<strong>Exercice ' + (index + 1) + ' indisponible.</strong> ' +
      (ex && ex.error ? '<span>' + esc(ex.error) + '</span> ' : '') +
      '<button type="button" class="btn" data-a="retry" data-retry="' + esc(index) + '">Réessayer</button></div></div></article>';
  }

  function renderExerciseBody(rawOrParsed, opts) {
    if (rawOrParsed && rawOrParsed.failed) return renderUnavailable(rawOrParsed, (opts && opts.index) || 0);
    var parser = root && root.MathFlowExerciceParser;
    var model = rawOrParsed && Array.isArray(rawOrParsed.blocks)
      ? rawOrParsed
      : (parser ? parser.parseExerciseModel(rawOrParsed, opts) : { blocks: [], context: '', basePath: '' });
    var bp = model.basePath || (opts && opts.basePath) || '';
    var prefix = (opts && opts.keyPrefix) || 'ex';
    var o = { basePath: bp, showSol: Boolean(opts && opts.showSol), openSol: Boolean(opts && opts.openSol), openHints: opts && opts.openHints };

    var metaTags = [model.theme, model.topic, model.points ? formatBareme(model.points) : ''].filter(Boolean).map(esc).join(' · ');
    var hasCtx = Boolean(model.context || hasMediaSrc(model.media));
    var ctxHtml = (metaTags || hasCtx)
      ? '<div class="ctx">' + (metaTags ? '<div class="exo-meta">' + metaTags + '</div>' : '') +
        (hasCtx ? '<div class="exo-context">' + renderMath(model.context, model.media, bp) + '</div>' : '') + '</div>'
      : '';

    var blocksHtml = (model.blocks || []).map(function (b, bIdx) {
      if (b.kind === 'part') {
        return '<div class="exo-part"><h3>' + esc(b.label) + (b.title ? ' — ' + renderMath(b.title, null, bp) : '') + '</h3>' +
          (b.content || hasMediaSrc(b.media) ? '<div class="exo-part-ctx">' + renderMath(b.content, b.media, bp) + '</div>' : '') + '</div>';
      }
      if (b.kind === 'text') {
        return '<div class="exo-text">' + renderMath(b.content, b.media, bp) + '</div>';
      }
      return renderQuestionBlock(b, o, prefix + '-b' + bIdx);
    }).join('');

    return '<article class="exo-article">' + ctxHtml + '<div class="exo-blocks">' + blocksHtml + '</div></article>';
  }

  function renderTopBar(vm) {
    var exs = vm.exercises || [];
    var isExam = vm.mode === 'examen';
    return '<header class="top">' +
      '<a class="back" href="' + safeHash(vm.backHash, '#learn') + '">← Retour</a>' +
      '<span class="top-title">' + renderMath(vm.title || 'Exercices', null, '') + '</span>' +
      '<span class="cnt">' + (isExam ? (exs.length + ' ex.') : (((vm.index || 0) + 1) + ' / ' + exs.length)) + '</span>' +
      '<span class="cnt" id="tm" role="timer" aria-label="Temps écoulé">' + esc(vm.timerText || '00:00') + '</span>' +
      '<button type="button" class="pill' + (isExam ? ' is-on' : '') + '" data-exm aria-pressed="' + (isExam ? 'true' : 'false') + '">' +
        (isExam ? 'Pas à pas' : 'Feuille d’examen') + '</button>' +
      '<button type="button" class="pill" data-action-print>Imprimer</button>' +
      '</header>';
  }

  function renderPrintHeader(vm) {
    var meta = [
      vm.subtitle,
      vm.year ? ('Session ' + vm.year + (vm.session ? ' (' + vm.session + ')' : '')) : '',
      vm.duration ? (vm.duration + ' min') : '',
      vm.totalPoints ? (vm.totalPoints + ' pts') : '',
      vm.coefficient ? ('Coeff. ' + vm.coefficient) : ''
    ].filter(Boolean).map(esc).join(' · ');
    return '<div class="print-doc-header">' +
      '<h1>' + renderMath(vm.title || 'Feuille d’examen', null, '') + '</h1>' +
      (meta ? '<p>' + meta + '</p>' : '') +
      '</div>';
  }

  function renderStepView(vm) {
    var pills = '<div class="exo-pills" id="exercise-pills" role="group" aria-label="Exercices">' + vm.exercises.map(function (ex, i) {
      var rating = vm.ratings && vm.ratings[i];
      var active = i === vm.index;
      var cls = 'exo-pill' + (active ? ' is-active' : '') + (rating != null ? (' is-rated-' + rating) : '') + (ex && ex.failed ? ' is-failed' : '');
      var state = ex && ex.failed ? ', indisponible' : (rating != null && RATING_LABELS[rating] ? ', ' + RATING_LABELS[rating].toLowerCase() : '');
      return '<button type="button" class="' + cls + '" data-exo-idx="' + i + '"' + (active ? ' aria-current="true"' : '') +
        ' aria-label="Exercice ' + (i + 1) + esc(state) + '">Ex. ' + (i + 1) + '</button>';
    }).join('') + '</div>';

    var active = vm.exercises[vm.index];
    var revealed = Boolean(vm.revealed && vm.revealed[vm.index]);
    var ratingVal = vm.ratings && vm.ratings[vm.index];
    var statusBadge = ratingVal != null && RATING_LABELS[ratingVal]
      ? '<span class="cnt exo-rating-tag is-rated-' + ratingVal + '" data-rating="' + ratingVal + '">' + esc(RATING_LABELS[ratingVal]) + '</span>'
      : '';
    var body = active
      ? renderExerciseBody(active, { index: vm.index, basePath: active.basePath, showSol: revealed, openSol: revealed, openHints: vm.openHints, keyPrefix: 'e' + vm.index })
      : '<p class="ctx">Aucun exercice.</p>';
    var failed = Boolean(active && active.failed);

    return renderTopBar(vm) + pills +
      '<section class="exo-stage" tabindex="-1">' + body + '</section>' +
      '<div class="act">' +
      '<button type="button" class="btn ghost" data-a="prev"' + (vm.index <= 0 ? ' disabled' : '') + '>Précédent</button>' +
      statusBadge +
      '<button type="button" class="btn primary" data-a="validate"' + (failed ? ' disabled' : '') + '>Valider l’exercice</button>' +
      '<button type="button" class="btn ghost" data-a="next"' + (vm.index >= vm.exercises.length - 1 ? ' disabled' : '') + '>Suivant</button>' +
      '</div>';
  }

  function renderExamView(vm) {
    var listHtml = vm.exercises.map(function (ex, i) {
      var rev = Boolean(vm.revealed && vm.revealed[i]);
      var heading = '<h2 class="exo-sheet-title">Exercice ' + esc((ex && ex.number) || (i + 1)) +
        (ex && ex.points ? ' <span class="exo-bareme">' + esc(formatBareme(ex.points)) + '</span>' : '') + '</h2>';
      return '<section class="exo-sheet-item">' + heading +
        renderExerciseBody(ex, { index: i, basePath: ex && ex.basePath, showSol: true, openSol: rev, openHints: vm.openHints, keyPrefix: 'e' + i }) +
        '</section>';
    }).join('');
    return renderTopBar(vm) + renderPrintHeader(vm) + '<div class="exo-sheet">' + listHtml + '</div>';
  }

  function renderExercisePage(vm) {
    if (!vm || !vm.exercises || !vm.exercises.length) {
      return renderTopBar(vm || { exercises: [], index: 0, backHash: '#learn' }) +
        '<section class="end"><h2>Aucun exercice disponible</h2><a class="btn primary" href="' + safeHash(vm && vm.backHash, '#learn') + '">Retour</a></section>';
    }
    return vm.mode === 'examen' ? renderExamView(vm) : renderStepView(vm);
  }

  return {
    renderSubQuestionRow: renderSubQuestionRow,
    renderExerciseBody: renderExerciseBody,
    renderPrintHeader: renderPrintHeader,
    renderExercisePage: renderExercisePage,
    clearCache: clearCache
  };
});
