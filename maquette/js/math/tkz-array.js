/**
 * MathFlow — Parser for \begin{array} variation & sign tables (< 280 lines)
 * Delegates rendering to MathFlowTkz.renderTkzModelHtml (zero Tailwind classes).
 */
(function initTkzArray(global) {
  'use strict';

  var ARROW_UP_RE = /\\(?:nearrow|fleupB?|croiss|brup|uparrow)(?![A-Za-z])/;
  var ARROW_DN_RE = /\\(?:searrow|fledownB?|decroiss|brdn|downarrow)(?![A-Za-z])/;
  var ARROW_FL_RE = /\\(?:rightarrow|longrightarrow|fleconst)(?![A-Za-z])/;
  var DBAR_SPLIT_RE = /\\(?:dbar|interdit|parallel|Vert)(?![A-Za-z])|\\\|/;
  var DBAR_EXACT_RE = /^(?:\|\||\\\||\\(?:dbar|interdit|parallel|Vert))$/;
  var FORB_RE = /^(?:h|H)$|\\cellcolor|hachure|\/\/\//i;

  function getTkz() {
    if (!global.MathFlowTkz && typeof require === 'function') { try { require('./tkz-tab.js'); } catch (_) {} }
    return global.MathFlowTkz || null;
  }

  function stripArrayStretch(src) {
    return String(src == null ? '' : src)
      .replace(/\\(?:def\s*\\arraystretch|renewcommand\s*\{\s*\\arraystretch\s*\})\s*(?:\{[^}]*\}|[0-9.]+)/g, '').trim();
  }

  function parseArraySpec(spec) {
    var s = String(spec || '').replace(/\s+/g, ''), cols = [], dbarBefore = [], barRun = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '|') { barRun++; continue; }
      if (ch === '{') { var cl = s.indexOf('}', i); if (cl > i) i = cl; continue; }
      if (/[lcrp]/.test(ch)) { dbarBefore[cols.length] = barRun >= 2; cols.push(ch); barRun = 0; }
    }
    return { cols: cols, dbarBefore: dbarBefore };
  }

  function splitRows(body) {
    var rows = [], cur = '', brace = 0, envDepth = 0;
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (body.slice(i, i + 7) === '\\begin{') envDepth++;
      else if (body.slice(i, i + 5) === '\\end{' && envDepth > 0) envDepth--;
      if (ch === '{') brace++; else if (ch === '}' && brace > 0) brace--;
      if (brace === 0 && envDepth === 0 && ch === '\\' && body.charAt(i + 1) === '\\') {
        rows.push(cur); cur = ''; i += 2;
        while (i < body.length && /\s/.test(body.charAt(i))) i++;
        if (body.charAt(i) === '[') { var cl = body.indexOf(']', i + 1); if (cl > i) i = cl + 1; }
        i--; continue;
      }
      cur += ch;
    }
    if (cur.trim()) rows.push(cur);
    return rows;
  }

  function splitCells(rowStr) {
    var tkz = getTkz();
    var clean = String(rowStr || '').replace(/\\hline/g, '').replace(/\\cline\{[^}]*\}/g, '').trim();
    if (!clean) return [];
    return tkz && tkz.splitTopLevel ? tkz.splitTopLevel(clean, '&') : clean.split('&').map(function (c) { return c.trim(); });
  }

  function classifyArrow(rawCell) {
    var tkz = getTkz();
    var u = tkz ? tkz.unwrapBlank(rawCell) : { isBlank: false, inner: rawCell, raw: rawCell };
    var t = String(u.inner || '');
    var dir = ARROW_UP_RE.test(t) ? 'up' : ARROW_DN_RE.test(t) ? 'down' : ARROW_FL_RE.test(t) ? 'flat' : null;
    return dir ? { dir: dir, isBlank: u.isBlank, raw: u.raw } : null;
  }

  function splitDbarValue(rawCell) {
    var tkz = getTkz();
    var u = tkz ? tkz.unwrapBlank(rawCell) : { isBlank: false, inner: rawCell, raw: rawCell };
    var t = (tkz ? tkz.cleanTkzText(u.inner) : String(u.inner || '')).trim();
    if (!t) return null;
    if (DBAR_EXACT_RE.test(t)) return { dbar: true, left: '', right: '' };
    var sepIdx = t.indexOf('||');
    if (sepIdx >= 0) return { dbar: true, left: t.slice(0, sepIdx).trim(), right: t.slice(sepIdx + 2).trim(), isBlank: u.isBlank };
    var m = DBAR_SPLIT_RE.exec(t);
    return m ? { dbar: true, left: t.slice(0, m.index).trim(), right: t.slice(m.index + m[0].length).trim(), isBlank: u.isBlank } : null;
  }

  function alignCellsToGrid(rawCells, nB) {
    var tkz = getTkz();
    var last = rawCells[rawCells.length - 1];
    var cells = rawCells.length === 2 * nB && !(tkz ? tkz.cleanTkzText(last || '') : String(last || '').trim())
      ? rawCells.slice(0, -1) : rawCells;
    var nI = Math.max(0, nB - 1), boundaries = new Array(nB), intervals = new Array(nI);
    if (cells.length === 2 * nB - 1) {
      for (var b = 0; b < nB; b++) boundaries[b] = cells[2 * b];
      for (var i = 0; i < nI; i++) intervals[i] = cells[2 * i + 1];
    } else if (cells.length === 2 * nB - 3 && nB >= 2) {
      for (var j = 0; j < nI; j++) intervals[j] = cells[2 * j];
      for (var k = 1; k < nB - 1; k++) boundaries[k] = cells[2 * k - 1];
    } else if (cells.length === nI) {
      for (var m = 0; m < nI; m++) intervals[m] = cells[m];
    } else {
      for (var c = 0; c < Math.min(cells.length, nB); c++) boundaries[c] = cells[c];
    }
    return { boundaries: boundaries, intervals: intervals };
  }

  function buildSignRow(lbl, grid, model) {
    var tkz = getTkz(), nB = model.xValues.length, nI = Math.max(0, nB - 1), bs = [], ivs = [];
    for (var b = 0; b < nB; b++) {
      var u = tkz.unwrapBlank(grid.boundaries[b] || ''), c = tkz.cleanTkzText(u.inner);
      if (DBAR_EXACT_RE.test(c) || model.specDbar[b]) { bs.push({ kind: 'dbar', raw: '' }); model.forbiddenCols[b] = true; }
      else if (c === '0' || c === 'z' || c === '\\zero') bs.push({ kind: 'zero', raw: u.isBlank ? '\\blank{0}' : '0' });
      else if (c === '|') bs.push({ kind: 'bar', raw: '' });
      else if (FORB_RE.test(c)) { bs.push({ kind: 'forbidden', raw: '' }); model.forbiddenCols[b] = true; }
      else bs.push({ kind: u.isBlank ? 'blank' : (c ? 'val' : 'empty'), raw: u.raw });
    }
    for (var i = 0; i < nI; i++) {
      var ui = tkz.unwrapBlank(grid.intervals[i] || ''), ci = tkz.cleanTkzText(ui.inner), forb = FORB_RE.test(ci);
      if (forb) model.forbiddenIntervals[i] = true;
      ivs.push({ kind: forb ? 'forbidden' : 'sign', raw: ui.isBlank ? ui.raw : (ci === '\\plus' ? '+' : ci === '\\moins' ? '-' : ui.raw), forbidden: forb });
    }
    return { type: 'sign', label: lbl, boundaries: bs, intervals: ivs };
  }

  function buildVarGroup(lbl, grids, model) {
    var tkz = getTkz(), nB = model.xValues.length, nI = Math.max(0, nB - 1), bs = [], ivs = [];
    for (var i = 0; i < nI; i++) ivs.push({ dir: null, forbidden: !!model.forbiddenIntervals[i] });
    for (var g = 0; g < grids.length; g++) {
      for (var ii = 0; ii < nI; ii++) {
        var rawIv = grids[g].intervals[ii] || '', cIv = tkz.cleanTkzText(tkz.unwrapBlank(rawIv).inner);
        if (FORB_RE.test(cIv)) { ivs[ii].forbidden = true; model.forbiddenIntervals[ii] = true; continue; }
        var ar = classifyArrow(rawIv);
        if (ar) ivs[ii] = { dir: ar.dir, isBlank: ar.isBlank, raw: ar.raw, forbidden: ivs[ii].forbidden };
      }
    }
    function slotAt(rIdx, total, bIdx) {
      if (total >= 3) return rIdx === 0 ? 'top' : (rIdx === total - 1 ? 'bot' : 'mid');
      if (total === 2) return rIdx === 0 ? 'top' : 'bot';
      var lA = bIdx > 0 ? ivs[bIdx - 1].dir : null, rA = bIdx < nI ? ivs[bIdx].dir : null;
      if (lA && rA && lA === rA) return 'mid';
      return (lA === 'up' || rA === 'down') ? 'top' : (lA === 'down' || rA === 'up') ? 'bot' : 'mid';
    }
    for (var b = 0; b < nB; b++) {
      var bd = {}, hasDbar = !!(model.forbiddenCols[b] || model.specDbar[b]);
      for (var r = 0; r < grids.length; r++) {
        var rawCell = grids[r].boundaries[b] || '', split = splitDbarValue(rawCell), slot = slotAt(r, grids.length, b);
        if (split) {
          hasDbar = true; model.forbiddenCols[b] = true; bd.dbar = true;
          bd.left = bd.left || {}; bd.right = bd.right || {};
          if (split.left) bd.left[slot] = split.isBlank ? '\\blank{' + split.left + '}' : split.left;
          if (split.right) bd.right[slot] = split.isBlank ? '\\blank{' + split.right + '}' : split.right;
        } else if (tkz.cleanTkzText(rawCell)) bd[slot] = rawCell;
      }
      if (hasDbar && !bd.dbar) {
        bd.dbar = true; bd.left = bd.left || {}; bd.right = bd.right || {};
        ['top', 'mid', 'bot'].forEach(function (k) { if (bd[k]) { bd.left[k] = bd[k]; bd.right[k] = bd[k]; delete bd[k]; } });
      }
      bs.push(bd);
    }
    return { type: 'var', label: lbl || 'f(x)', boundaries: bs, intervals: ivs };
  }

  function parseArrayTkzTab(latex, renderExpr) {
    var tkz = getTkz();
    if (!tkz) return '';
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    var src = stripArrayStretch(latex), open = /\\begin\{array\}(?:\{([^}]*)\})?/.exec(src);
    if (!open) return '<pre class="tkz-fallback">' + esc(src) + '</pre>';
    var endIdx = src.lastIndexOf('\\end{array}');
    var body = src.slice(open.index + open[0].length, endIdx > open.index ? endIdx : src.length);
    var spec = parseArraySpec(open[1] || '');
    var rowObjs = splitRows(body).map(function (ln) { return { hlineAfter: /\\hline/.test(ln), cells: splitCells(ln) }; }).filter(function (r) { return r.cells.length > 0; });
    if (rowObjs.length < 2) return '<pre class="tkz-fallback">' + esc(src) + '</pre>';
    var head = rowObjs[0].cells, xVals = [], xCols = [];
    for (var hc = 1; hc < head.length; hc++) if (tkz.cleanTkzText(head[hc])) { xVals.push(head[hc]); xCols.push(hc); }
    if (!xVals.length) for (var hc2 = 1; hc2 < head.length; hc2++) { xVals.push(head[hc2]); xCols.push(hc2); }
    var specDbar = (spec.cols.length > 0 && spec.cols.length === head.length) ? xCols.map(function (ci) { return Boolean(spec.dbarBefore[ci]); }) : [];
    var model = { xLabel: head[0] || 'x', xValues: xVals, rows: [], forbiddenCols: [], forbiddenIntervals: [], specDbar: specDbar };
    for (var idx = 1; idx < rowObjs.length;) {
      var grp = [rowObjs[idx]], isVar = grp[0].cells.some(function (c) { return !!(classifyArrow(c) || splitDbarValue(c)); }), j = idx + 1;
      while (j < rowObjs.length) {
        var nc = rowObjs[j].cells, hasAr = nc.some(function (c) { return !!(classifyArrow(c) || splitDbarValue(c)); }), noLbl = !tkz.cleanTkzText(nc[0] || '');
        if ((isVar || hasAr) && (noLbl || !grp[grp.length - 1].hlineAfter) && (noLbl || hasAr)) { grp.push(rowObjs[j++]); isVar = true; } else break;
      }
      var lbl = (grp.find(function (r) { return !!tkz.cleanTkzText(r.cells[0] || ''); }) || grp[0]).cells[0] || '';
      var grids = grp.map(function (r) { return alignCellsToGrid(r.cells.slice(1), xVals.length); });
      model.rows.push(isVar || grp.length > 1 ? buildVarGroup(lbl, grids, model) : buildSignRow(lbl, grids[0], model));
      idx = j;
    }
    return tkz.renderTkzModelHtml(model, renderExpr);
  }

  global.MathFlowTkzArray = { parseArrayTkzTab: parseArrayTkzTab, splitRows: splitRows, parseArraySpec: parseArraySpec };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowTkzArray;
})(typeof window !== 'undefined' ? window : globalThis);
