/**
 * MathFlow — Moteur de rendu de la fiche de révision & problèmes de synthèse
 */
(function (global) {
  'use strict';

  var HAS = Object.prototype.hasOwnProperty;
  function own(map, key, fallback) { return HAS.call(map, key) ? map[key] : fallback; }
  var SVG_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var BACK_SVG = SVG_OPEN + '<path d="M15 18l-6-6 6-6"/></svg>';
  var FOLD_SVG = SVG_OPEN + '<path d="M7 10l5-5 5 5M7 14l5 5 5-5"/></svg>';
  var LIST_SVG = SVG_OPEN + '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
  var CHEV_SVG = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var FX_BTN = '<button type="button" class="fx" data-focus aria-label="Afficher ce bloc en plein écran" title="Plein écran"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>';

  var APP_ALIASES = new Set(['application', 'applicaoin', 'applicaion', 'applicatoin', 'appclaoin', 'applcaoin', 'exercice', 'exercise', 'exo']);
  var EX_ALIASES = new Set(['example', 'exemple', 'exmpale', 'exmale', 'examle', 'exaple']);
  var SYNONYMS = {
    methode: 'method', strategie: 'strategy', lemme: 'lemma', corollaire: 'corollary', theoreme: 'theorem', propriete: 'property',
    demonstration: 'proof', preuve: 'proof', remarque: 'remark', note: 'remark', attention: 'warning', avertissement: 'warning',
    objective: 'objectif', indice: 'hint', indices: 'hint', probleme: 'problem', activite: 'exploration',
    introduction: 'intro', resume: 'summary', paragraphe: 'text'
  };
  var TYPE_LABELS = {
    definition: 'Définition', theorem: 'Théorème', property: 'Propriété', proposition: 'Proposition',
    corollary: 'Corollaire', lemma: 'Lemme', remark: 'Remarque', note: 'Note', text: 'Cours',
    method: 'Méthode', technique: 'Technique', strategy: 'Stratégie', cela_permet_de: 'À retenir',
    warning: 'Attention', example: 'Exemple', application: 'Exercice d’application',
    intuition: 'Intuition', objectif: 'Objectif', rappel: 'Rappel', summary: 'À retenir',
    consequence: 'Conséquence', savant: 'Note historique', intro: 'Introduction',
    exploration: 'Exploration', proof: 'Démonstration', problem: 'Problème', hint: 'Indice', solution: 'Solution'
  };
  var BLOCK_K_CODES = {
    definition: 'd', theorem: 't', property: 'p', proposition: 'p', corollary: 'p', lemma: 'p',
    remark: 'r', note: 'r', text: 'r', method: 'm', technique: 'm', strategy: 'm', cela_permet_de: 'm',
    warning: 'a', example: 'e', application: 'e', problem: 'e', intuition: 'i', hint: 'i',
    objectif: 'o', rappel: 'k', summary: 'k', consequence: 'c',
    savant: 's', intro: 's', exploration: 's', proof: 'y', solution: 'y'
  };
  var COLLAPSIBLE_TYPES = new Set(['definition', 'theorem', 'property', 'proposition', 'corollary', 'lemma', 'method', 'technique', 'strategy', 'proof', 'hint', 'solution']);
  var STATEMENT_TYPES = new Set(['theorem', 'property', 'proposition', 'corollary', 'lemma']);
  var CORE_CARD_TYPES = new Set(['definition'].concat(Array.from(STATEMENT_TYPES)));
  var METHOD_TYPES = new Set(['method', 'technique', 'strategy']);
  var FRAMED_TYPES = new Set(['definition'].concat(Array.from(METHOD_TYPES)));
  var CLOSED_BY_DEFAULT = new Set(['proof', 'hint', 'solution']);
  var PRACTICE_TYPES = new Set(['application', 'example', 'problem']);
  var NUMBERED_TYPES = new Set(['definition', 'property', 'theorem', 'proposition', 'lemma', 'corollary', 'method', 'technique', 'application', 'example', 'remark', 'warning', 'hint', 'exploration']);

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var SAFE_HREF = /^(?:#[^\s"'<>`\\]*|(?:\.{1,2}\/|\/(?!\/))[^\s"'<>`\\:]*|[a-z0-9_-][^\s"'<>`\\:]*)$/i;
  function safeHref(url, fallback) {
    var s = String(url == null ? '' : url).trim();
    return escapeHtml(SAFE_HREF.test(s) ? s : (fallback || '#learn'));
  }

  function normalizeBlockType(raw) {
    var key = String(raw || 'text').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
    if (APP_ALIASES.has(key)) return 'application';
    if (EX_ALIASES.has(key)) return 'example';
    return own(SYNONYMS, key, key);
  }

  function alphabeticIndex(idx) {
    var n = Number(idx) || 0, out = '';
    do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return out;
  }
  function sectionLabel(idx, style) { return style === 'arabic' ? String(idx + 1) : alphabeticIndex(idx) + '.'; }
  function subsectionLabel(secIdx, subIdx, style) { return style === 'arabic' ? (secIdx + 1) + '.' + (subIdx + 1) : (subIdx + 1) + '.'; }
  function splitTitleTokens(title) {
    var src = String(title || '').trim(), tokens = [], i = 0;
    while (i < src.length) {
      while (i < src.length && /\s/.test(src.charAt(i))) i++;
      if (i >= src.length) break;
      var tok = '';
      while (i < src.length && !/\s/.test(src.charAt(i))) {
        var rest = src.slice(i), delim = rest.startsWith('$$') ? '$$' : rest.startsWith('\\(') ? '\\)' : rest.startsWith('\\[') ? '\\]' : (src.charAt(i) === '$' && src.charAt(i - 1) !== '\\' ? '$' : '');
        if (!delim) { tok += src.charAt(i++); continue; }
        var end = src.indexOf(delim, i + (delim.length === 1 ? 1 : 2));
        if (end === -1) { tok += src.slice(i); i = src.length; break; }
        tok += src.slice(i, end + delim.length);
        i = end + delim.length;
      }
      if (tok) tokens.push(tok);
    }
    return tokens;
  }

  function renderHeroTitleHtml(titleRaw, basePath) {
    var tokens = splitTitleTokens(titleRaw);
    if (tokens.length <= 1) return renderMathText(titleRaw, true, basePath);
    var head = tokens.slice(0, 2).join(' '), tail = tokens.slice(2).join(' ');
    return '<b>' + renderMathText(head, true, basePath) + '</b>' + (tail ? ' ' + renderMathText(tail, true, basePath) : '');
  }

  function renderStars(difficulty) {
    var parsed = Number(difficulty);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    var d = Math.min(5, Math.max(1, Math.round(parsed)));
    return '<span class="dif" role="img" aria-label="Difficulté ' + d + ' sur 5">' + '★'.repeat(d) + '☆'.repeat(5 - d) + '</span>';
  }

  function matchBrace(src, from) {
    var depth = 1, i = from;
    while (i < src.length && depth > 0) {
      var ch = src.charAt(i);
      if (ch === '\\') { i += 2; continue; }
      if (ch === '%') { while (i < src.length && src.charAt(i) !== '\n') i++; continue; }
      if (ch === '{') depth++; else if (ch === '}') depth--;
      i++;
    }
    return depth === 0 ? i : -1;
  }

  function extractQuestions(src, fromStart) {
    var cmds = ['\\question{', '\\qst{'], pos = 0;
    if (fromStart) { var lead = src.match(/^(\s|\\par\b[^{]?)*/); pos = lead ? lead[0].length : 0; }
    else {
      pos = cmds.reduce(function (best, c) { var i = src.indexOf(c); return i !== -1 && (best === -1 || i < best) ? i : best; }, -1);
      if (pos === -1) return null;
    }
    var parts = [], firstStart = pos;
    while (pos < src.length) {
      var skip = src.slice(pos).match(/^(\s|\\par\b[^{]?)*/), skipLen = skip ? skip[0].length : 0;
      var cmd = cmds.find(function (c) { return src.startsWith(c, pos + skipLen); });
      if (!cmd) break;
      pos += skipLen;
      var end = matchBrace(src, pos + cmd.length);
      if (end === -1) break;
      parts.push(src.slice(pos, end));
      pos = end;
    }
    if (!parts.length) return null;
    var prefix = fromStart ? '' : src.slice(0, firstStart).trim();
    var rest = src.slice(pos).replace(/^(\s|\\par\b|\\(?:small|med|big)skip\b)+/g, '').trim();
    return { prompt: (prefix ? prefix + '\n\n' : '') + parts.join('\n'), solution: rest };
  }

  function splitQuestionAndSolution(rawContent) {
    var src = Array.isArray(rawContent) ? rawContent.join('\n\n') : String(rawContent == null ? '' : rawContent);
    var cor = src.match(/(?:^|\n|\s)(?:\*\*(?:Correction|Solution)[^*\n]*\*\*|\\textbf\{(?:Correction|Solution)[^{}]*\})\s*:?\s*/i);
    if (cor && typeof cor.index === 'number') {
      var before = src.slice(0, cor.index).trim(), after = src.slice(cor.index + cor[0].length).trim();
      if (before && after) return { prompt: before, solution: after };
    }
    var qSplit = extractQuestions(src, true) || extractQuestions(src, false);
    return (qSplit && qSplit.solution) ? qSplit : { prompt: src, solution: '' };
  }

  var MARK = { '^^': ['<span class="ru">', '</span>'], '==': ['<b class="cr">', '</b>'], '++': ['<b class="cg">', '</b>'] };
  var SKIP_TAGS = /^(?:annotation|code|pre|script|style|textarea)$/i;
  var BLOCK_TAGS = /^(?:p|div|li|ul|ol|br|hr|h[1-6]|table|thead|tbody|tr|td|th|details|summary|section|blockquote|figure|figcaption)$/i;
  var VOID_TAGS = /^(?:br|hr|img|input|meta|link|wbr|col|area|base|source|track|embed)$/i;
  var TAG_SPLIT = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/g;

  function applyMarkers(html) {
    var src = String(html == null ? '' : html);
    if (!/\^\^|==|\+\+/.test(src)) return src;
    var parts = src.split(TAG_SPLIT), depth = 0, skip = 0, stack = [], edits = {};
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg) continue;
      if (seg.charAt(0) === '<') {
        var tm = /^<\s*(\/)?\s*([a-zA-Z][\w:-]*)/.exec(seg);
        if (!tm) continue;
        var closing = !!tm[1], name = tm[2], selfClose = VOID_TAGS.test(name) || /\/\s*>$/.test(seg);
        if (BLOCK_TAGS.test(name)) stack.length = 0;
        if (SKIP_TAGS.test(name) && !selfClose) skip = Math.max(0, skip + (closing ? -1 : 1));
        if (!selfClose) {
          depth += closing ? -1 : 1;
          if (closing) while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
        }
        continue;
      }
      if (skip > 0) continue;
      var re = /\^\^|==|\+\+/g, m;
      while ((m = re.exec(seg))) {
        var tok = m[0], idx = m.index, prev = idx > 0 ? seg.charAt(idx - 1) : '', next = idx + 2 < seg.length ? seg.charAt(idx + 2) : '';
        var canOpen = next === '' || !/\s/.test(next), canClose = prev === '' || !/\s/.test(prev), k = -1;
        if (canClose) for (var s = stack.length - 1; s >= 0; s--) { if (stack[s].tok === tok && stack[s].depth === depth) { k = s; break; } }
        if (k >= 0) {
          var op = stack[k]; stack.length = k;
          (edits[op.part] = edits[op.part] || []).push({ pos: op.idx, html: MARK[tok][0] });
          (edits[i] = edits[i] || []).push({ pos: idx, html: MARK[tok][1] });
        } else if (canOpen) stack.push({ tok: tok, depth: depth, part: i, idx: idx });
      }
    }
    return parts.map(function (seg, i) {
      var list = edits[i];
      if (!list) return seg;
      list.sort(function (a, b) { return b.pos - a.pos; });
      list.forEach(function (e) { seg = seg.slice(0, e.pos) + e.html + seg.slice(e.pos + 2); });
      return seg;
    }).join('');
  }

  var MATH_RE = /\$\$[\s\S]+?\$\$|\$(?:\\[\s\S]|[^$\\])+\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;
  function toBlanks(src) {
    if (src.indexOf('[[') === -1) return src;
    var ranges = [], m;
    MATH_RE.lastIndex = 0;
    while ((m = MATH_RE.exec(src))) ranges.push([m.index, m.index + m[0].length]);
    return src.replace(/\[\[((?:(?!\n[ \t]*\n)[\s\S])+?)\]\]/g, function (all, inner, off) {
      for (var i = 0; i < ranges.length; i++) if (off >= ranges[i][0] && off < ranges[i][1]) return all;
      return '\\blank{' + inner + '}';
    });
  }

  function renderMathText(raw, isPromptOnly, basePath) {
    var src = Array.isArray(raw) ? raw.join('\n\n') : String(raw == null ? '' : raw);
    if (!src.trim()) return '';
    var normalized = toBlanks(src);
    if (global.MathEngine && typeof global.MathEngine.renderMathInHtml === 'function') {
      return applyMarkers(global.MathEngine.renderMathInHtml(normalized, { enableLexicon: !isPromptOnly, basePath: basePath || '' }));
    }
    return applyMarkers(escapeHtml(normalized).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
  }

  function renderWithMediaBlock(raw, media, isPromptOnly, basePath) {
    var html = renderMathText(raw, isPromptOnly, basePath);
    if (!media) return html;
    var normMedia = !media.src && Array.isArray(media.images) && media.images[0] ? Object.assign({}, media, media.images[0]) : media;
    if (normMedia.src && global.MathEngine && typeof global.MathEngine.renderWithMedia === 'function') {
      return global.MathEngine.renderWithMedia(html, normMedia, { enableLexicon: !isPromptOnly, basePath: basePath || '' });
    }
    return html;
  }

  function renderBlockHtml(block, domId, counters, numbered, basePath) {
    if (typeof block === 'string') block = { type: 'text', content: block };
    if (!block || typeof block !== 'object') return '';
    var type = normalizeBlockType(block.type), k = own(BLOCK_K_CODES, type, 'r'), label = own(TYPE_LABELS, type, 'Note'), num = '';
    if (numbered && NUMBERED_TYPES.has(type)) { counters[type] = (counters[type] || 0) + 1; num = ' ' + counters[type]; }
    var stars = renderStars(block.difficulty), rawPrompt = String(block.question || block.title || '').trim();
    var isPractice = PRACTICE_TYPES.has(type);
    var split = isPractice ? splitQuestionAndSolution(block.content) : { prompt: block.content, solution: '' };
    var solutionSrc = block.correction || block.solution || split.solution || '';
    var bodyHtml = renderWithMediaBlock(split.prompt, block.media, isPractice, basePath);
    var idAttr = ' id="' + escapeHtml(domId) + '"', tAttr = ' data-t="' + escapeHtml(type) + '" data-k="' + k + '"';

    if (type === 'text') {
      if (rawPrompt) {
        return '<details class="blk blk-txt"' + tAttr + idAttr + ' open><summary><span class="q">' + renderMathText(rawPrompt, true, basePath) + '</span>'
          + '<span class="tgl" aria-hidden="true"><span class="tgl-on">Masquer</span><span class="tgl-off">Afficher</span></span></summary><div class="bx">' + bodyHtml + '</div></details>';
      }
      return '<div class="blk blk-bare"' + tAttr + idAttr + '><div class="bx">' + bodyHtml + '</div></div>';
    }

    if (COLLAPSIBLE_TYPES.has(type)) {
      var hasCustomPrompt = Boolean(rawPrompt);
      var isBareTrigger = type === 'proof' || type === 'hint' || type === 'solution';
      var headingText = rawPrompt || (label + num);
      var showBadge = !isBareTrigger && !(METHOD_TYPES.has(type) && hasCustomPrompt);
      var badge = showBadge ? '<span class="bt">' + escapeHtml(label + num) + '</span>' : '';
      var title = (hasCustomPrompt || isBareTrigger) ? '<span class="q">' + renderMathText(headingText, true, basePath) + '</span>' : '';
      var cls = 'blk' + (CORE_CARD_TYPES.has(type) ? ' blk-core' : '') + (type === 'definition' ? ' blk-def' : '')
        + (STATEMENT_TYPES.has(type) ? ' blk-stmt' : '') + (METHOD_TYPES.has(type) ? ' blk-method' : '');
      return '<details class="' + cls + '"' + tAttr + idAttr + (CLOSED_BY_DEFAULT.has(type) ? '' : ' open') + '><summary>' + badge + title + stars + CHEV_SVG + '</summary><div class="bx">' + FX_BTN + bodyHtml + '</div></details>';
    }

    var head = type === 'warning'
      ? '<div class="bh bh-warn"><span class="bw-lbl">' + escapeHtml(label + num) + '</span>' + (block.title ? '<span class="bw-sep" aria-hidden="true">\u2014</span><span class="bw-ttl">' + renderMathText(block.title, true, basePath) + '</span>' : '') + stars + '</div>'
      : '<div class="bh"><span class="bt">' + escapeHtml(label + num) + '</span>' + stars + '</div>';
    var titlePrefix = (type !== 'warning' && block.title) ? '<p class="btitle">' + renderMathText(block.title, true, basePath) + '</p>' : '';
    var solHtml = solutionSrc
      ? '<details class="sol"><summary>' + escapeHtml(block.solutionLabel || 'Résolvons l’exercice') + CHEV_SVG + '</summary><div class="bx"><div class="cor">Correction</div>' + renderMathText(solutionSrc, false, basePath) + '<button class="ghost" type="button" data-all>Tout révéler</button></div></details>'
      : '';
    return '<div class="blk"' + tAttr + idAttr + '>' + head + '<div class="bx">' + FX_BTN + titlePrefix + bodyHtml + '</div>' + solHtml + '</div>';
  }

  function renderIntroHtml(sheet, sections, basePath) {
    var first = sections[0];
    var isIntroSec = first && (first.id === 'intro' || (!first.title && (first.blocks || []).every(function (b) {
      var t = normalizeBlockType(b && b.type);
      return t === 'intro' || t === 'savant' || t === 'text' || t === 'objectif';
    })));
    var ledeParts = [], noteParts = [];
    if (sheet.header && sheet.header.subtitle) ledeParts.push(renderMathText(sheet.header.subtitle, true, basePath));
    (isIntroSec ? (first.blocks || []) : []).forEach(function (b) {
      if (!b || typeof b !== 'object') return;
      var t = normalizeBlockType(b.type), rendered = renderWithMediaBlock(b.content, b.media, false, basePath);
      if (!rendered) return;
      if (t === 'savant' || /\\savant\b/.test(String(b.content || ''))) noteParts.push(rendered);
      else ledeParts.push(rendered);
    });
    if (!noteParts.length && sheet.header && sheet.header.context) noteParts.push(renderMathText(sheet.header.context, true, basePath));
    var fallbackLede = sheet.kind === 'probleme' ? '' : 'Synthèse complète du chapitre.';
    return {
      markup: '<div class="intro" id="les-intro"><div class="lede">' + (ledeParts.join('') || fallbackLede) + '</div>' + (noteParts.length ? '<aside class="note">' + noteParts.join('') + '</aside>' : '') + '</div>',
      bodySections: isIntroSec ? sections.slice(1) : sections
    };
  }

  function renderSectionHtml(sec, secIdx, counters, numbered, basePath, indexStyle) {
    sec = sec || {};
    var style = indexStyle || 'alpha';
    var secId = String(sec.id != null ? sec.id : 'sec-' + secIdx), ltr = sectionLabel(secIdx, style);
    var leadRaw = sec.lead || sec.description || sec.subtitle || '';
    var leadHtml = leadRaw ? '<p class="lead">' + renderMathText(leadRaw, false, basePath) + '</p>' : '';
    var blocksHtml = (sec.blocks || []).map(function (b, bIdx) { return renderBlockHtml(b, 'revision-block-' + secId + '-' + bIdx, counters, numbered, basePath); }).join('');
    var subHtml = (sec.subsections || []).map(function (sub, subIdx) {
      sub = sub || {};
      var subTitle = sub.title ? '<h3 class="subh"><span class="sn">' + escapeHtml(subsectionLabel(secIdx, subIdx, style)) + '</span><span class="subt">' + renderMathText(sub.title, true, basePath) + '</span></h3>' : '';
      var subLead = sub.lead || sub.description ? '<p class="lead">' + renderMathText(sub.lead || sub.description, false, basePath) + '</p>' : '';
      var subBlocks = (sub.blocks || []).length
        ? sub.blocks.map(function (b, bIdx) { return renderBlockHtml(b, 'revision-block-' + secId + '-sub-' + subIdx + '-' + bIdx, counters, numbered, basePath); }).join('')
        : (sub.content ? '<div class="bx">' + renderMathText(sub.content, false, basePath) + '</div>' : '');
      return '<div class="subsec" id="les-' + escapeHtml(secId) + '-sub-' + subIdx + '">' + subTitle + subLead + subBlocks + '</div>';
    }).join('');
    var fallback = (!blocksHtml && !subHtml && sec.content) ? '<div class="bx">' + renderMathText(sec.content, false, basePath) + '</div>' : '';
    return '<section class="ls" id="les-' + escapeHtml(secId) + '" data-sec-id="' + escapeHtml(secId) + '">'
      + '<h2 class="lh" tabindex="-1"><span class="ltr">' + escapeHtml(ltr) + '</span><span class="lht">' + renderMathText(sec.title || 'Section', true, basePath) + '</span></h2>'
      + leadHtml + blocksHtml + subHtml + fallback + '</section>';
  }

  function renderTocResultsHtml(results) {
    if (!results || !results.length) return '<p class="toc-empty">Aucun passage trouvé.</p>';
    return results.map(function (r) {
      var sub = r.blockTitle ? r.sectionTitle + ' · ' + r.blockTitle : r.sectionTitle;
      return '<button type="button" class="toc-hit" data-jump-block="' + escapeHtml(r.blockId) + '" data-sec="' + escapeHtml(r.sectionId) + '">'
        + '<span class="toc-hit-sec">' + escapeHtml(sub) + '</span><span class="toc-hit-snip">' + escapeHtml(r.snippet) + '</span></button>';
    }).join('');
  }

  function computeReadTime(rootOrText) {
    var text = typeof rootOrText === 'string' ? rootOrText : (rootOrText ? String(rootOrText.textContent || '') : '');
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return Math.max(1, Math.round(words / 220)) + ' min de lecture';
  }

  function renderLessonShellHtml(opts) {
    var sheet = opts.sheet || {}, numbered = opts.numbered !== false, basePath = opts.basePath || '', counters = {};
    var style = opts.indexStyle || 'alpha';
    if (opts.kind === 'probleme') sheet = Object.assign({ kind: 'probleme' }, sheet);
    var intro = renderIntroHtml(sheet, Array.isArray(sheet.sections) ? sheet.sections : [], basePath);
    var sectionsHtml = intro.bodySections.map(function (s, idx) { return renderSectionHtml(s, idx, counters, numbered, basePath, style); }).join('');
    var tocHtml = intro.bodySections.map(function (s, idx) {
      s = s || {};
      var secId = String(s.id != null ? s.id : 'sec-' + idx);
      return '<button type="button" data-sec="' + escapeHtml(secId) + '" data-sec-id="' + escapeHtml(secId) + '"><b>' + escapeHtml(sectionLabel(idx, style)) + '</b><span class="toc-sec-ttl">' + renderMathText(s.title || 'Section', true, basePath) + '</span></button>';
    }).join('');
    var tabsHtml = (opts.sheets && opts.sheets.length > 1)
      ? '<nav class="sheet-tabs" aria-label="Fiches du chapitre">' + opts.sheets.map(function (sh) {
          var active = sh.id === opts.activeSheetId;
          return '<a class="sheet-tab' + (active ? ' active' : '') + '" href="' + safeHref('#lecon-' + encodeURIComponent(opts.chapId) + '&sheet=' + encodeURIComponent(sh.id)) + '"' + (active ? ' aria-current="page"' : '') + '>' + renderMathText(sh.label || sh.title || 'Fiche', true, basePath) + '</a>';
        }).join('') + '</nav>' : '';
    var backHref = safeHref(opts.backHref || '#learn');
    var titleRaw = String((sheet.header && sheet.header.title) || opts.title || 'Fiche de révision');

    return '<div class="rp" aria-hidden="true"><i></i></div>'
      + '<div class="top"><a class="back" href="' + backHref + '">' + BACK_SVG + '<span>' + escapeHtml(opts.backLabel || 'Programme') + '</span></a>' + tabsHtml
      + '<span class="rh" id="rh" aria-hidden="true"></span>'
      + '<span class="cnt"><span id="rt"></span>'
      + '<button class="ib" type="button" data-fold aria-label="Tout déplier ou replier" title="Tout déplier / replier">' + FOLD_SVG + '</button>'
      + '<button class="ib" type="button" popovertarget="toc" aria-label="Sommaire et recherche" aria-keyshortcuts="/" title="Sommaire et recherche ( / )">' + LIST_SVG + '</button></span></div>'
      + '<p class="kick">' + renderMathText(opts.kicker || '', true, basePath) + '</p><h1 class="lt" tabindex="-1">' + renderHeroTitleHtml(titleRaw, basePath) + '</h1>' + intro.markup + sectionsHtml
      + '<p class="end2"><a class="link" href="' + backHref + '">' + escapeHtml(opts.backEndLabel || 'Retour au programme') + '</a></p>'
      + '<div id="toc" popover><input id="tqs" type="search" placeholder="Rechercher dans la fiche…" aria-label="Rechercher dans la fiche" autocomplete="off" enterkeyhint="search">'
      + '<p class="ctx">Sommaire</p><div id="toc-results" hidden></div><div id="toc-sections">' + tocHtml + '</div></div>'
      + '<dialog id="focus-overlay-modal" class="focus-overlay" aria-label="Mode focus">'
      + '<div class="focus-dialog"><div class="focus-head"><span class="focus-badge">Mode focus</span>'
      + '<button type="button" class="ib" data-focus-close aria-label="Fermer">&times;</button></div><div class="focus-body"></div></div></dialog>';
  }

  var Renderer = {
    TYPE_LABELS: TYPE_LABELS, BLOCK_K_CODES: BLOCK_K_CODES, COLLAPSIBLE_TYPES: COLLAPSIBLE_TYPES,
    PRACTICE_TYPES: PRACTICE_TYPES, FRAMED_TYPES: FRAMED_TYPES,
    normalizeBlockType: normalizeBlockType, alphabeticIndex: alphabeticIndex, sectionLabel: sectionLabel,
    renderStars: renderStars, splitQuestionAndSolution: splitQuestionAndSolution,
    applyMarkers: applyMarkers, renderMathText: renderMathText, safeHref: safeHref,
    computeReadTime: computeReadTime, renderBlockHtml: renderBlockHtml, renderIntroHtml: renderIntroHtml, renderHeroTitleHtml: renderHeroTitleHtml, renderSectionHtml: renderSectionHtml, renderTocResultsHtml: renderTocResultsHtml, renderLessonShellHtml: renderLessonShellHtml
  };
  global.MathFlowLeconRenderer = Renderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = Renderer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
