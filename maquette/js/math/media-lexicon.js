/**
 * MathFlow — Safe media figures, native lightbox & interactive FR/AR lexicon popover (< 280 lines)
 * Zero Tailwind utility classes. Lazy-reads window.MathFlowLexicon so script order never matters.
 */
(function initMediaLexicon(global) {
  'use strict';

  var activeTrigger = null, activeLangAr = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getLexicon() {
    if (!global.MathFlowLexicon && typeof require === 'function') { try { require('./lexicon.js'); } catch (_) {} }
    return global.MathFlowLexicon || null;
  }

  function isSafeImageSrc(src) {
    var s = String(src == null ? '' : src).replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!s || s.indexOf('//') === 0) return false;
    var low = s.toLowerCase();
    if (/^(?:javascript|vbscript):/i.test(low)) return false;
    if (low.indexOf('data:') === 0) return /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)(?:;charset=[^;,]+)?(?:;base64)?,/i.test(low);
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(s) || /\\/.test(s)) return false;
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? /^https?:/i.test(low) : true;
  }

  function normalizeMedia(media) {
    if (!media) return null;
    if (typeof media === 'string') { var t = media.trim(); return t ? { src: t } : null; }
    if (typeof media !== 'object') return null;
    var first = Array.isArray(media.images) && media.images[0] && typeof media.images[0] === 'object' ? media.images[0] : null;
    return !media.src && first ? Object.assign({}, media, first) : media;
  }

  function resolveMediaUrl(src, basePath) {
    var raw = String(src == null ? '' : src).trim();
    if (!isSafeImageSrc(raw)) return '';
    if (global.ContentService && typeof global.ContentService.resolveMediaUrl === 'function') {
      var res = global.ContentService.resolveMediaUrl(raw, basePath || '');
      return isSafeImageSrc(res) ? res : '';
    }
    if (/^(?:https?:|data:|\/)/i.test(raw)) return raw;
    var clean = raw.replace(/^\.\//, '');
    if (!basePath) return clean;
    var base = String(basePath).replace(/\/+$/, '');
    return clean.indexOf(base + '/') === 0 ? clean : (base + '/' + clean);
  }

  function parseLength(val) {
    var s = String(val == null ? '' : val).trim();
    if (!s) return '';
    if (/^\d+(?:\.\d+)?$/.test(s)) return s + 'px';
    return /^\d+(?:\.\d+)?(?:px|%|rem|em|vw)$/.test(s) ? s : '';
  }

  function splitOptionTokens(rawOpts) {
    var out = [], cur = '', brace = 0, bracket = 0, inMath = false, quote = '';
    for (var i = 0; i < rawOpts.length; i++) {
      var ch = rawOpts.charAt(i);
      if (ch === '\\' && i + 1 < rawOpts.length) { cur += ch + rawOpts.charAt(i + 1); i++; continue; }
      if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '$' && rawOpts.charAt(i + 1) !== '$') { inMath = !inMath; cur += ch; continue; }
      if (!inMath) {
        if (ch === '{') brace++; else if (ch === '}' && brace > 0) brace--;
        else if (ch === '[' && brace === 0) bracket++; else if (ch === ']' && brace === 0 && bracket > 0) bracket--;
      }
      if (ch === ',' && brace === 0 && bracket === 0 && !inMath) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function parseImageOptions(rawOpts) {
    var opts = { width: '', align: '', wrap: '', caption: '', alt: '' };
    splitOptionTokens(String(rawOpts || '')).forEach(function (tok) {
      var eq = tok.indexOf('=');
      if (eq < 0) {
        if (/^(?:left|right|center|top|bottom)$/.test(tok)) opts.align = tok;
        else if (/^(?:float|wrap|side|stack)$/.test(tok)) opts.wrap = tok;
        else if (!opts.width) opts.width = parseLength(tok);
        return;
      }
      var k = tok.slice(0, eq).trim().toLowerCase(), v = tok.slice(eq + 1).trim();
      if ((v.charAt(0) === '"' && v.slice(-1) === '"') || (v.charAt(0) === "'" && v.slice(-1) === "'")) v = v.slice(1, -1);
      if (k === 'width' || k === 'w') opts.width = parseLength(v);
      else if (k === 'align' || k === 'pos' || k === 'position') opts.align = v;
      else if (k === 'wrap' || k === 'float' || k === 'layout') opts.wrap = v;
      else if (k === 'caption' || k === 'cap') opts.caption = v;
      else if (k === 'alt') opts.alt = v;
    });
    return opts;
  }

  function readImageCaption(src, startIdx) {
    var p = startIdx;
    while (p < src.length && /\s/.test(src.charAt(p))) p++;
    if (src.charAt(p) !== '{') return { value: '', end: startIdx };
    var depth = 1, st = p + 1;
    p++;
    while (p < src.length && depth > 0) {
      if (src.charAt(p) === '\\' && p + 1 < src.length) { p += 2; continue; }
      if (src.charAt(p) === '{') depth++; else if (src.charAt(p) === '}') depth--;
      p++;
    }
    return depth === 0 ? { value: src.slice(st, p - 1), end: p } : { value: '', end: startIdx };
  }

  function renderRichText(txt, opts) {
    if (!txt) return '';
    return global.MathEngine && typeof global.MathEngine.renderMathInHtml === 'function'
      ? global.MathEngine.renderMathInHtml(txt, { enableLexicon: false, basePath: opts && opts.basePath }) : esc(txt);
  }

  function renderMediaFigure(media, opts) {
    var m = normalizeMedia(media);
    if (!m) return '';
    var src = resolveMediaUrl(m.src, opts && opts.basePath);
    if (!src) return '';
    var capRaw = m.caption || '', alt = m.alt || capRaw.replace(/\$[^$]*\$/g, '').trim() || 'Illustration mathématique';
    var widthCss = parseLength(m.width);
    var wrap = m.wrap && /^(?:left|right|float|side|stack)$/i.test(m.wrap) ? m.wrap.toLowerCase() : '';
    var align = m.align && /^(?:left|right|center|top|bottom)$/i.test(m.align) ? m.align.toLowerCase() : '';
    var attrs = 'class="media-figure"' + (wrap ? ' data-wrap="' + esc(wrap) + '"' : '') +
      (align ? ' data-align="' + esc(align) + '"' : '') + (widthCss ? ' style="--media-w:' + esc(widthCss) + '"' : '');
    var capHtml = capRaw ? '<figcaption class="media-figure-caption">' + renderRichText(capRaw, opts) + '</figcaption>' : '';
    return '<figure ' + attrs + '><div class="media-figure-frame" role="button" tabindex="0" data-media-zoom="true" data-media-src="' +
      esc(src) + '" data-media-alt="' + esc(alt) + '" data-media-caption="' + esc(capRaw) + '" aria-label="' + esc('Agrandir : ' + alt) + '">' +
      '<img class="media-figure-image" src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">' +
      '<span class="media-figure-zoom" aria-hidden="true">&#x2922;</span></div>' + capHtml + '</figure>';
  }

  function renderWithMedia(contentHtml, media, opts) {
    var body = String(contentHtml == null ? '' : contentHtml);
    var m = normalizeMedia(media);
    if (!m || !m.src) return body;
    var fig = renderMediaFigure(m, opts);
    if (!fig) return body;
    var rawPos = String(m.position || 'bottom').toLowerCase();
    var layout = /^float-/.test(rawPos) ? 'float' : ((rawPos === 'left' || rawPos === 'right') ? 'side' : 'stack');
    var pos = rawPos.replace(/^float-/, '');
    if (!/^(?:left|right|top|bottom)$/.test(pos)) pos = 'bottom';
    var widthCss = parseLength(m.width);
    return '<div class="mf-media-split" data-layout="' + layout + '" data-pos="' + pos + '"' +
      (widthCss ? ' style="--media-w:' + esc(widthCss) + '"' : '') + '><div class="mf-media-body">' + body + '</div>' + fig + '</div>';
  }

  function ensurePopoverEl() {
    var doc = global.document;
    if (!doc) return null;
    var pop = doc.getElementById('mf-lexicon-popover');
    if (pop) return pop;
    pop = doc.createElement('aside');
    pop.id = 'mf-lexicon-popover';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false'); pop.setAttribute('aria-labelledby', 'mf-lx-title');
    pop.hidden = true;
    doc.body.appendChild(pop);
    return pop;
  }

  function positionPopover(pop, triggerEl) {
    if (!pop || !triggerEl || !triggerEl.getBoundingClientRect || !global.innerWidth) return;
    var tr = triggerEl.getBoundingClientRect(), pr = pop.getBoundingClientRect(), vw = global.innerWidth, vh = global.innerHeight, gap = 8;
    var pw = pr.width || Math.min(376, vw - 16), ph = pr.height || 180;
    var left = Math.max(gap, Math.min(tr.left, vw - pw - gap));
    var top = tr.bottom + gap + ph <= vh - gap ? tr.bottom + gap : tr.top - ph - gap;
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(Math.max(gap, Math.min(top, Math.max(gap, vh - ph - gap)))) + 'px';
  }

  function closeLexiconPopover() {
    var doc = global.document, pop = doc ? doc.getElementById('mf-lexicon-popover') : null;
    if (pop) pop.hidden = true;
    if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'false');
    activeTrigger = null;
  }

  function applyPopoverLang(pop, isAr) {
    activeLangAr = !!isAr;
    var fr = pop.querySelector('.lx-def'), ar = pop.querySelector('.lx-defar'), btn = pop.querySelector('.mf-lexicon-lang-toggle');
    if (fr && ar) { fr.hidden = activeLangAr; ar.hidden = !activeLangAr; }
    if (btn) { btn.classList.toggle('is-ar', activeLangAr); btn.setAttribute('aria-pressed', activeLangAr ? 'true' : 'false'); btn.textContent = activeLangAr ? 'FR' : 'AR'; }
  }

  function showLexiconPopover(termId, triggerEl) {
    var lex = getLexicon(), entry = lex ? lex.findLexiconEntry(termId) : null, pop = ensurePopoverEl();
    if (!entry || !pop) return false;
    if (activeTrigger === triggerEl && !pop.hidden) { closeLexiconPopover(); return false; }
    if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'false');
    activeTrigger = triggerEl || null;
    if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'true');
    var hasArDef = !!entry.definitionAr;
    var formulaHtml = entry.formula && global.MathEngine ? global.MathEngine.renderTex(entry.formula, true) : esc(entry.formula || '');
    pop.innerHTML = '<div class="lx-top"><div>' + (entry.category ? '<span class="lx-cat">' + esc(entry.category) + '</span>' : '') +
      '<h3 id="mf-lx-title" class="lx-fr">' + esc(entry.term) + '</h3></div><div class="lx-actions">' +
      (hasArDef ? '<button type="button" class="mf-lexicon-lang-toggle" aria-pressed="false">AR</button>' : '') +
      '<button type="button" class="lx-x" aria-label="Fermer">&times;</button></div></div>' +
      (entry.termAr ? '<div class="lx-ar" lang="ar">' + esc(entry.termAr) + '</div>' : '') +
      '<div class="lx-def">' + renderRichText(entry.definition || '', {}) + '</div>' +
      (hasArDef ? '<div class="lx-defar" lang="ar" hidden>' + renderRichText(entry.definitionAr, {}) + '</div>' : '') +
      (formulaHtml ? '<div class="lx-fm">' + formulaHtml + '</div>' : '');
    pop.hidden = false;
    applyPopoverLang(pop, false);
    positionPopover(pop, triggerEl);
    return true;
  }

  function togglePopoverLanguage() {
    var doc = global.document, pop = doc ? doc.getElementById('mf-lexicon-popover') : null;
    if (!pop || pop.hidden) return;
    applyPopoverLang(pop, !activeLangAr);
    if (activeTrigger) positionPopover(pop, activeTrigger);
  }

  function repositionLexiconPopover() {
    var doc = global.document, pop = doc ? doc.getElementById('mf-lexicon-popover') : null;
    if (!pop || pop.hidden || !activeTrigger) return;
    var r = activeTrigger.getBoundingClientRect();
    if (r.bottom < 0 || r.top > (global.innerHeight || 900)) closeLexiconPopover();
    else positionPopover(pop, activeTrigger);
  }

  function openMediaLightbox(src, alt, caption) {
    var doc = global.document, safe = resolveMediaUrl(src, '');
    if (!doc || !safe) return;
    var dlg = doc.getElementById('mf-media-lightbox');
    if (!dlg) {
      dlg = doc.createElement('dialog');
      dlg.id = 'mf-media-lightbox';
      dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeMediaLightbox(); });
      doc.body.appendChild(dlg);
    }
    dlg.innerHTML = '<div class="lx-top"><span class="lx-fr">' + esc(alt || 'Illustration') + '</span>' +
      '<button type="button" class="lx-x" data-lightbox-close="true" aria-label="Fermer">&times;</button></div>' +
      '<img src="' + esc(safe) + '" alt="' + esc(alt || '') + '">' +
      (caption ? '<p class="media-figure-caption">' + renderRichText(caption, {}) + '</p>' : '');
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }

  function closeMediaLightbox() {
    var doc = global.document, dlg = doc ? doc.getElementById('mf-media-lightbox') : null;
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
  }

  global.MathFlowMediaLexicon = {
    isSafeImageSrc: isSafeImageSrc, resolveMediaUrl: resolveMediaUrl, parseLength: parseLength,
    parseImageOptions: parseImageOptions, readImageCaption: readImageCaption,
    renderMediaFigure: renderMediaFigure, renderWithMedia: renderWithMedia,
    showLexiconPopover: showLexiconPopover, closeLexiconPopover: closeLexiconPopover,
    togglePopoverLanguage: togglePopoverLanguage, repositionLexiconPopover: repositionLexiconPopover,
    openMediaLightbox: openMediaLightbox, closeMediaLightbox: closeMediaLightbox,
    registerLexiconEntries: function () { var l = getLexicon(); if (l) l.registerLexiconEntries.apply(null, arguments); },
    findLexiconEntry: function (id) { var l = getLexicon(); return l ? l.findLexiconEntry(id) : null; },
    highlightLexiconTerms: function (h, o) { var l = getLexicon(); return l ? l.highlightLexiconTerms(h, o) : h; }
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowMediaLexicon;
})(typeof window !== 'undefined' ? window : globalThis);
