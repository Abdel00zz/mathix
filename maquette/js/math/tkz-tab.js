/**
 * MathFlow — Parser & canonical renderer for LaTeX \tkzTabInit / \tkzTabLine / \tkzTabVar (< 280 lines)
 * Matches CSS contract in app-math-widgets.css (.tscroll > table.tkz-tab). Zero Tailwind classes.
 */
(function initTkzTab(global) {
  'use strict';

  var arrowSeq = 0;

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readDelimGroup(src, startIdx, openCh, closeCh) {
    var i = startIdx;
    while (i < src.length && /\s/.test(src.charAt(i))) i++;
    if (src.charAt(i) !== openCh) return null;
    var depth = 1, p = i + 1;
    while (p < src.length && depth > 0) {
      if (src.charAt(p) === '\\' && p + 1 < src.length) { p += 2; continue; }
      if (src.charAt(p) === openCh) depth++;
      else if (src.charAt(p) === closeCh) depth--;
      p++;
    }
    return depth === 0 ? { value: src.slice(i + 1, p - 1), end: p } : null;
  }

  function extractBracedArgs(src, cmd, count) {
    var m = new RegExp('\\\\' + cmd + '(?![A-Za-z])').exec(src);
    if (!m) return null;
    var opt = readDelimGroup(src, m.index + m[0].length, '[', ']');
    var p = opt ? opt.end : m.index + m[0].length;
    var args = [];
    for (var k = 0; k < count; k++) {
      var g = readDelimGroup(src, p, '{', '}');
      if (!g) return null;
      args.push(g.value);
      p = g.end;
    }
    return { args: args, index: m.index, end: p };
  }

  function findClosingDollar(str, openIdx) {
    for (var j = openIdx + 1; j < str.length; j++) {
      if (str.charAt(j) === '$' && str.charAt(j + 1) !== '$') {
        var bs = 0, b = j - 1;
        while (b >= 0 && str.charAt(b) === '\\') { bs++; b--; }
        if (bs % 2 === 0) return j;
      }
    }
    return -1;
  }

  function splitTopLevel(str, sepChar) {
    var out = [], cur = '', brace = 0, bracket = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === '\\' && i + 1 < str.length) { cur += ch + str.charAt(i + 1); i++; continue; }
      if (ch === '$' && str.charAt(i + 1) !== '$') {
        var bs = 0, b = i - 1;
        while (b >= 0 && str.charAt(b) === '\\') { bs++; b--; }
        if (bs % 2 === 0) {
          var closeD = findClosingDollar(str, i);
          if (closeD > i) { cur += str.slice(i, closeD + 1); i = closeD; continue; }
        }
      }
      if (ch === '{') brace++; else if (ch === '}' && brace > 0) brace--;
      else if (ch === '[' && brace === 0) bracket++; else if (ch === ']' && brace === 0 && bracket > 0) bracket--;
      if (ch === sepChar && brace === 0 && bracket === 0) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim() || out.length) out.push(cur.trim());
    return out;
  }

  function unwrapOuterDollar(s) {
    var t = String(s == null ? '' : s).trim();
    if (/^\$\$[\s\S]*\$\$$/.test(t)) return t.slice(2, -2).trim();
    if (/^\$[\s\S]*\$$/.test(t)) return t.slice(1, -1).trim();
    return t;
  }

  function unwrapBlank(raw) {
    var t = unwrapOuterDollar(raw);
    var m = /^\\(?:blank|blanck|balck)\s*\{([\s\S]*)\}$/.exec(t) || /^\[\[([\s\S]*)\]\]$/.exec(t);
    return m ? { isBlank: true, inner: m[1].trim(), raw: t } : { isBlank: false, inner: t, raw: t };
  }

  function cleanTkzText(raw) {
    return unwrapOuterDollar(raw).replace(/\\(?:tvstrut|tsstrut|hline|hfill)(?![A-Za-z])/g, '').trim();
  }

  function defaultRenderExpr(tex) {
    var t = cleanTkzText(tex);
    if (!t) return '';
    if (global.MathEngine && typeof global.MathEngine.renderTex === 'function') return global.MathEngine.renderTex(t, false);
    if (global.MathFlowMathMLFallback && typeof global.MathFlowMathMLFallback.texToMathML === 'function') return global.MathFlowMathMLFallback.texToMathML(t, false);
    return escHtml(t);
  }

  function renderValueOrBlank(raw, renderExpr) {
    var u = unwrapBlank(raw), cleaned = cleanTkzText(u.inner);
    if (!cleaned && !u.isBlank) return '';
    var innerHtml = cleaned ? (renderExpr || defaultRenderExpr)(cleaned) : '';
    return u.isBlank ? '<button type="button" class="blank" data-blank="true" aria-expanded="false"><span>' + innerHtml + '</span></button>' : innerHtml;
  }

  function buildArrowSvg(dir, y1, y2) {
    if (!dir || dir === 'none' || dir === 'forbidden') return '';
    var ys = typeof y1 === 'number' ? y1 : (dir === 'up' ? 84 : dir === 'down' ? 16 : 50);
    var ye = typeof y2 === 'number' ? y2 : (dir === 'up' ? 16 : dir === 'down' ? 84 : 50);
    var id = 'tkz-ar-' + (++arrowSeq);
    return '<svg class="tkz-arrow-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path class="tkz-arrow-tip" d="M 0 1 L 10 5 L 0 9 L 2.5 5 Z"/></marker></defs>' +
      '<line class="tkz-arrow-line" x1="8" y1="' + ys + '" x2="90" y2="' + ye + '" marker-end="url(#' + id + ')"/></svg>';
  }

  function renderSlots(side, fn) {
    var s = side || {};
    return '<div class="tkz-slot tkz-slot--top">' + renderValueOrBlank(s.top || '', fn) + '</div>' +
      '<div class="tkz-slot tkz-slot--mid">' + renderValueOrBlank(s.mid || '', fn) + '</div>' +
      '<div class="tkz-slot tkz-slot--bot">' + renderValueOrBlank(s.bot || '', fn) + '</div>';
  }

  function sideLevel(side, preferEnd) {
    if (!side || (!side.top && !side.mid && !side.bot)) return null;
    if (side.top && !side.bot && !side.mid) return 16;
    if (side.bot && !side.top && !side.mid) return 84;
    if (side.mid && !side.top && !side.bot) return 50;
    return preferEnd ? (side.top ? 16 : side.bot ? 84 : 50) : (side.bot ? 84 : side.top ? 16 : 50);
  }

  function boundaryExitY(row, bIdx, nB, isExit) {
    var bd = row.boundaries[bIdx];
    if (!bd) return null;
    if (!bd.passThrough) return sideLevel(isExit ? (bd.right || bd) : (bd.left || bd), !isExit);
    var lIdx = bIdx - 1, lY = null, rIdx = bIdx + 1, rY = null;
    while (lIdx >= 0) {
      var lb = row.boundaries[lIdx];
      if (lb && !lb.passThrough) { lY = sideLevel(lb.right || lb, false); break; }
      lIdx--;
    }
    while (rIdx < nB) {
      var rb = row.boundaries[rIdx];
      if (rb && !rb.passThrough) { rY = sideLevel(rb.left || rb, true); break; }
      rIdx++;
    }
    if (lY != null && rY != null) return Math.round(lY + ((rY - lY) * (bIdx - lIdx)) / (rIdx - lIdx));
    return lY != null ? lY : rY;
  }

  function renderVarRowHtml(row, nB, nI, forbCols, forbInts, fn) {
    var hasLv3 = row.boundaries.some(function (bd) {
      var l = bd.left || bd, rt = bd.right || bd;
      return !!(l.mid && (l.top || l.bot)) || !!(rt.mid && (rt.top || rt.bot));
    });
    var html = '<tr class="tkz-row tkz-row--var ' + (hasLv3 ? 'tkz-row--lv3' : 'tkz-row--lv2') + '">' +
      '<th scope="row" class="tkz-lbl">' + renderValueOrBlank(row.label || 'f(x)', fn) + '</th>';
    for (var vb = 0; vb < nB; vb++) {
      var bd = row.boundaries[vb] || {};
      var isDbar = !!(bd.dbar || (forbCols[vb] && (bd.left || bd.right)));
      html += isDbar
        ? '<td class="tkz-b"><div class="tkz-var-b--forbidden"><div class="tkz-stack tkz-stack--right">' + renderSlots(bd.left, fn) +
          '</div><div class="tkz-dbar" aria-hidden="true"></div><div class="tkz-stack tkz-stack--left">' + renderSlots(bd.right, fn) + '</div></div></td>'
        : '<td class="tkz-b"><div class="tkz-var-b"><div class="tkz-stack">' + renderSlots(bd, fn) + '</div></div></td>';
      if (vb < nI) {
        var iv = row.intervals[vb] || {};
        if (iv.forbidden || forbInts[vb]) { html += '<td class="tkz-i tkz-zone--forbidden"></td>'; continue; }
        var y1 = boundaryExitY(row, vb, nB, true), y2 = boundaryExitY(row, vb + 1, nB, false);
        var dir = iv.dir || (y1 != null && y2 != null ? (y2 < y1 - 5 ? 'up' : y2 > y1 + 5 ? 'down' : 'flat') : 'none');
        var svg = buildArrowSvg(dir, y1, y2);
        html += '<td class="tkz-i"><div class="tkz-var-i">' + (iv.isBlank ? renderValueOrBlank(iv.raw, function () { return svg; }) : svg) + '</div></td>';
      }
    }
    return html + '</tr>';
  }

  function renderSignRowHtml(row, nB, nI, forbInts, fn) {
    var html = '<tr><th scope="row" class="tkz-lbl">' + renderValueOrBlank(row.label || '', fn) + '</th>';
    for (var sb = 0; sb < nB; sb++) {
      var sbd = row.boundaries[sb] || {};
      var cls = sbd.kind === 'dbar' ? 'tkz-b tkz-mark--dbar'
        : (sbd.kind === 'zero' || sbd.kind === 'bar') ? 'tkz-b tkz-mark--bar'
        : sbd.kind === 'forbidden' ? 'tkz-b tkz-zone--forbidden' : 'tkz-b';
      var inner = sbd.kind === 'zero'
        ? '<span class="tkz-zero">' + (sbd.raw ? renderValueOrBlank(sbd.raw, fn) : '0') + '</span>'
        : (sbd.kind === 'val' || sbd.kind === 'blank' ? renderValueOrBlank(sbd.raw, fn) : '');
      html += '<td class="' + cls + '">' + inner + '</td>';
      if (sb < nI) {
        var siv = row.intervals[sb] || {}, iForb = !!(siv.forbidden || forbInts[sb]);
        html += '<td class="tkz-i' + (iForb ? ' tkz-zone--forbidden' : '') + '">' + (iForb ? '' : renderValueOrBlank(siv.raw || '', fn)) + '</td>';
      }
    }
    return html + '</tr>';
  }

  function renderTkzModelHtml(model, renderExpr) {
    var fn = renderExpr || defaultRenderExpr;
    if (!model || !model.xValues || !model.xValues.length) return '';
    var nB = model.xValues.length, nI = Math.max(0, nB - 1);
    var forbCols = model.forbiddenCols || [], forbInts = model.forbiddenIntervals || [];
    var html = '<div class="tscroll"><table class="tkz-tab" role="table" aria-label="Tableau de variation"><tbody><tr><th scope="row" class="tkz-lbl">' +
      renderValueOrBlank(model.xLabel || 'x', fn) + '</th>';
    for (var b = 0; b < nB; b++) html += '<td class="tkz-b">' + renderValueOrBlank(model.xValues[b], fn) + '</td>' + (b < nI ? '<td class="tkz-i"></td>' : '');
    html += '</tr>';
    for (var r = 0; r < model.rows.length; r++) {
      html += model.rows[r].type === 'var'
        ? renderVarRowHtml(model.rows[r], nB, nI, forbCols, forbInts, fn)
        : renderSignRowHtml(model.rows[r], nB, nI, forbInts, fn);
    }
    return html + '</tbody></table></div>';
  }

  function assignSlot(obj, ch, val) {
    if (ch === '+') obj.top = val;
    else if (ch === '-') obj.bot = val;
    else obj.mid = val;
  }

  function parseVarToken(rawToken) {
    var u = unwrapBlank(rawToken), parts = splitTopLevel(cleanTkzText(u.inner), '/');
    var tag = (parts[0] || '').replace(/\s+/g, '');
    var wrap = function (v) { var t = (v || '').trim(); return !t ? '' : (u.isBlank && !unwrapBlank(t).isBlank ? '\\blank{' + t + '}' : t); };
    var v1 = wrap(tag.indexOf('D') < 0 ? parts.slice(1).join('/') : (parts[1] || '')), v2 = wrap(parts[2] || '');
    var dIdx = tag.indexOf('D');
    if (dIdx >= 0) {
      var out = { dbar: true, left: {}, right: {} };
      var lCh = dIdx > 0 ? tag.charAt(dIdx - 1) : '', rCh = dIdx + 1 < tag.length ? tag.charAt(dIdx + 1) : '';
      if (lCh && rCh) { assignSlot(out.left, lCh, v1); assignSlot(out.right, rCh, v2); }
      else if (lCh) assignSlot(out.left, lCh, v1);
      else if (rCh) assignSlot(out.right, rCh, v1);
      else { out.left.mid = v1; out.right.mid = v2 || v1; }
      return out;
    }
    if (tag === 'R' && parts.length === 1 && !u.isBlank) return { passThrough: true };
    if (tag === '+') return { top: v1 };
    if (tag === '-') return { bot: v1 };
    return { mid: v1 || (u.isBlank ? u.raw : '') };
  }

  function parseSignToken(rawToken) {
    var u = unwrapBlank(rawToken), t = cleanTkzText(u.inner);
    if (t === 'z' || t === '0') return { kind: 'zero', raw: u.isBlank ? '\\blank{0}' : '0' };
    if (t === 't' || t === '|') return { kind: 'bar', raw: '' };
    if (t === 'd' || t === '||' || t === '\\dbar' || t === '\\interdit' || t === '\\Vert') return { kind: 'dbar', raw: '' };
    if (t === 'h' || t === 'H') return { kind: 'forbidden', raw: '', forbidden: true };
    return { kind: u.isBlank ? 'blank' : (t ? 'val' : 'empty'), raw: u.raw };
  }

  function extractCmds(src, cmd, cnt) {
    var out = [], off = 0, res;
    while (off < src.length && (res = extractBracedArgs(src.slice(off), cmd, cnt))) {
      out.push({ type: cmd, index: off + res.index, args: res.args });
      off += res.end;
    }
    return out;
  }

  function insertBoundary(model, at, xVal, targetRow, yVal) {
    if (at < 1 || at > model.xValues.length) return;
    model.xValues.splice(at, 0, xVal);
    model.forbiddenCols.splice(at, 0, false);
    model.forbiddenIntervals.splice(at, 0, Boolean(model.forbiddenIntervals[at - 1]));
    model.rows.forEach(function (row) {
      if (row.type === 'sign') {
        row.boundaries.splice(at, 0, { kind: 'bar', raw: '' });
        row.intervals.splice(at, 0, Object.assign({}, row.intervals[at - 1] || { kind: 'empty', raw: '' }));
      } else {
        row.boundaries.splice(at, 0, row === targetRow ? { mid: yVal } : { passThrough: true });
        row.intervals.splice(at, 0, Object.assign({}, row.intervals[at - 1] || {}));
      }
    });
  }

  function parseTkzTab(latex, renderExpr) {
    var src = String(latex == null ? '' : latex);
    var init = extractBracedArgs(src, 'tkzTabInit', 2);
    if (!init) return '<pre class="tkz-fallback">' + escHtml(src) + '</pre>';
    var leftItems = splitTopLevel(init.args[0], ',').map(function (it) {
      var p = splitTopLevel(it, '/');
      if (p.length > 1 && /^\d+(?:\.\d+)?$/.test(p[p.length - 1])) p.pop();
      return p.join('/');
    });
    var xValues = splitTopLevel(init.args[1], ',');
    var model = { xLabel: leftItems[0] || 'x', xValues: xValues, rows: [], forbiddenCols: [], forbiddenIntervals: [] };
    var cmds = extractCmds(src, 'tkzTabLine', 1).concat(extractCmds(src, 'tkzTabVar', 1))
      .concat(extractCmds(src, 'tkzTabVal', 5)).concat(extractCmds(src, 'tkzTabIma', 4))
      .concat(extractCmds(src, 'tkzTabImaFrom', 4)).sort(function (a, b) { return a.index - b.index; });
    var rowCursor = 0, lastVarRow = null;
    cmds.forEach(function (c) {
      var nB = model.xValues.length;
      if (c.type === 'tkzTabVal') {
        var b1 = Number(c.args[0]), b2 = Number(c.args[1]);
        if (Number.isInteger(b1) && Number.isInteger(b2) && b2 === b1 + 1 && b1 >= 1 && b2 <= nB) insertBoundary(model, b1, c.args[3] || '', lastVarRow, c.args[4] || '');
        return;
      }
      if (c.type === 'tkzTabIma' || c.type === 'tkzTabImaFrom') {
        var tIdx = Number(c.args[2]) - 1, val = (c.args[3] || '').trim();
        if (lastVarRow && Number.isInteger(tIdx) && tIdx >= 0 && tIdx < nB && val) {
          var cur = lastVarRow.boundaries[tIdx];
          if (!cur || cur.passThrough || (!cur.top && !cur.mid && !cur.bot)) lastVarRow.boundaries[tIdx] = { mid: val };
        }
        return;
      }
      var tokens = splitTopLevel(c.args[0], ','), lbl = leftItems[++rowCursor] || (c.type === 'tkzTabVar' ? 'f(x)' : '');
      if (c.type === 'tkzTabLine') {
        var bs = [], ivs = [];
        for (var b = 0; b < nB; b++) {
          var bt = b * 2 < tokens.length ? parseSignToken(tokens[b * 2]) : { kind: 'empty', raw: '' };
          bs.push(bt);
          if (bt.kind === 'dbar' || bt.kind === 'forbidden') model.forbiddenCols[b] = true;
          if (b < nB - 1) {
            var it = b * 2 + 1 < tokens.length ? parseSignToken(tokens[b * 2 + 1]) : { kind: 'empty', raw: '' };
            ivs.push(it);
            if (it.forbidden) model.forbiddenIntervals[b] = true;
          }
        }
        model.rows.push({ type: 'sign', label: lbl, boundaries: bs, intervals: ivs });
      } else {
        var vbs = [], vivs = [];
        for (var k = 0; k < nB; k++) {
          var vb = k < tokens.length ? parseVarToken(tokens[k]) : {};
          vbs.push(vb);
          if (vb.dbar) model.forbiddenCols[k] = true;
          if (k < nB - 1) vivs.push({});
        }
        lastVarRow = { type: 'var', label: lbl, boundaries: vbs, intervals: vivs };
        model.rows.push(lastVarRow);
      }
    });
    return renderTkzModelHtml(model, renderExpr);
  }

  global.MathFlowTkz = {
    parseTkzTab: parseTkzTab, renderTkzModelHtml: renderTkzModelHtml, buildArrowSvg: buildArrowSvg,
    cleanTkzText: cleanTkzText, splitTopLevel: splitTopLevel,
    splitTopLevelCommas: function (s) { return splitTopLevel(s, ','); },
    extractBracedArgs: extractBracedArgs, unwrapBlank: unwrapBlank
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowTkz;
})(typeof window !== 'undefined' ? window : globalThis);
