/**
 * MathFlow — Structural zero-dependency TeX -> MathML fallback (< 200 lines)
 * Guarantees valid MathML output offline without `undefined` or `NaN`.
 */
(function initMathMLFallback(global) {
  'use strict';

  var BB = { R: '&#x211D;', N: '&#x2115;', Z: '&#x2124;', Q: '&#x211A;', C: '&#x2102;', K: '&#x1D542;', D: '&#x1D53B;', P: '&#x2119;' };
  var SYM = {
    infty: '&#x221E;', pinf: '+&#x221E;', minf: '-&#x221E;', ell: '&#x2113;', void: '&#x2205;', varnothing: '&#x2205;',
    zero: '0', plus: '+', moins: '-', fleup: '&#x2197;', fledown: '&#x2198;', croiss: '&#x2197;', decroiss: '&#x2198;',
    fleconst: '&#x2192;', dbar: '&#x2225;', interdit: '&#x2225;', parallel: '&#x2225;', Vert: '&#x2225;',
    cdot: '&#x22C5;', times: '&#x00D7;', div: '&#x00F7;', pm: '&#x00B1;', mp: '&#x2213;',
    le: '&#x2264;', leq: '&#x2264;', ge: '&#x2265;', geq: '&#x2265;', ne: '&#x2260;', neq: '&#x2260;',
    approx: '&#x2248;', equiv: '&#x2261;', sim: '&#x223C;', simeq: '&#x2243;', to: '&#x2192;',
    rightarrow: '&#x2192;', leftarrow: '&#x2190;', Rightarrow: '&#x21D2;', impl: '&#x21D2;',
    Leftarrow: '&#x21D0;', rimpl: '&#x21D0;', Leftrightarrow: '&#x21D4;', ssi: '&#x21D4;', mapsto: '&#x21A6;',
    in: '&#x2208;', belongs: '&#x2208;', notin: '&#x2209;', notbelongs: '&#x2209;', subset: '&#x2282;',
    included: '&#x2282;', subseteq: '&#x2286;', cup: '&#x222A;', union: '&#x222A;', cap: '&#x2229;', inter: '&#x2229;',
    forall: '&#x2200;', exists: '&#x2203;', neg: '&#x00AC;', lnot: '&#x00AC;', wedge: '&#x2227;', land: '&#x2227;',
    vee: '&#x2228;', lor: '&#x2228;', partial: '&#x2202;', nabla: '&#x2207;', alpha: '&#x03B1;', al: '&#x03B1;',
    beta: '&#x03B2;', be: '&#x03B2;', gamma: '&#x03B3;', ga: '&#x03B3;', delta: '&#x03B4;', de: '&#x03B4;',
    Delta: '&#x0394;', De: '&#x0394;', epsilon: '&#x03B5;', varepsilon: '&#x03B5;', eps: '&#x03B5;',
    theta: '&#x03B8;', the: '&#x03B8;', lambda: '&#x03BB;', la: '&#x03BB;', mu: '&#x03BC;', pi: '&#x03C0;',
    sigma: '&#x03C3;', si: '&#x03C3;', Sigma: '&#x03A3;', Si: '&#x03A3;', phi: '&#x03C6;', varphi: '&#x03C6;',
    omega: '&#x03C9;', om: '&#x03C9;', Omega: '&#x03A9;', Om: '&#x03A9;', rho: '&#x03C1;', tau: '&#x03C4;',
    sum: '&#x2211;', prod: '&#x220F;', int: '&#x222B;', bigcup: '&#x22C3;', bigcap: '&#x22C2;',
    langle: '&#x27E8;', rangle: '&#x27E9;', lceil: '&#x2308;', rceil: '&#x2309;', lfloor: '&#x230A;', rfloor: '&#x230B;',
    dots: '&#x2026;', ldots: '&#x2026;', cdots: '&#x22EF;', checkmark: '&#x2713;', cmark: '&#x2713;', xmark: '&#x2717;'
  };
  var ACCENTS = { vec: '&#x2192;', overrightarrow: '&#x2192;', overline: '&#x00AF;', conj: '&#x00AF;', bar: '&#x00AF;', hat: '&#x02C6;', tilde: '&#x02DC;' };
  var ENV_FENCE = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'], Vmatrix: ['&#x2225;', '&#x2225;'], cases: ['{', ''] };
  var FN_OPS = /^(?:lim|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|ln|log|exp|arg|max|min|sup|inf|det|dim|ker|rg|Card)$/;
  var BIG_OPS = /^(?:lim|sum|prod|int|bigcup|bigcap)$/;

  function escXml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function texToMathML(tex, displayMode) {
    var src = String(tex == null ? '' : tex).trim();
    if (!src) return '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow/></math>';
    var pos = 0;
    var len = src.length;
    function skipWs() { while (pos < len && /\s/.test(src.charAt(pos))) pos++; }
    function readBalanced(openCh, closeCh, allowSingle) {
      skipWs();
      if (pos >= len) return null;
      if (src.charAt(pos) !== openCh) return allowSingle ? src.charAt(pos++) : null;
      pos++;
      var depth = 1, start = pos;
      while (pos < len && depth > 0) {
        var ch = src.charAt(pos++);
        if (ch === '\\' && pos < len && openCh === '{') pos++;
        else if (ch === openCh) depth++;
        else if (ch === closeCh) depth--;
      }
      return src.slice(start, depth === 0 ? pos - 1 : pos);
    }
    function innerMl(sub) {
      return sub ? texToMathML(sub, false).replace(/^<math[^>]*>|<\/math>$/g, '') : '<mrow/>';
    }
    function parseDelim() {
      skipWs();
      if (pos >= len) return '';
      var ch = src.charAt(pos);
      if (ch === '.') { pos++; return ''; }
      if (ch !== '\\') { pos++; return escXml(ch); }
      pos++;
      if (pos >= len) return '';
      var nxt = src.charAt(pos);
      if (!/[A-Za-z]/.test(nxt)) { pos++; return escXml(nxt === '|' ? '\u2225' : nxt); }
      var st = pos;
      while (pos < len && /[A-Za-z]/.test(src.charAt(pos))) pos++;
      var name = src.slice(st, pos);
      return SYM[name] || escXml(name);
    }
    function parseEnv(envName) {
      if (envName === 'array') readBalanced('{', '}', true);
      var endTag = '\\end{' + envName + '}';
      var endIdx = src.indexOf(endTag, pos);
      var body = endIdx >= 0 ? src.slice(pos, endIdx) : src.slice(pos);
      pos = endIdx >= 0 ? endIdx + endTag.length : len;
      var rows = [], curRow = [''], depth = 0;
      for (var i = 0; i < body.length; i++) {
        var ch = body.charAt(i);
        if (ch === '{') depth++; else if (ch === '}' && depth > 0) depth--;
        if (depth === 0 && ch === '&') { curRow.push(''); continue; }
        if (depth === 0 && ch === '\\' && body.charAt(i + 1) === '\\') {
          rows.push(curRow); curRow = ['']; i++;
          if (body.charAt(i + 1) === '[') { var cl = body.indexOf(']', i + 1); if (cl > i) i = cl; }
          continue;
        }
        curRow[curRow.length - 1] += ch;
      }
      if (curRow.some(function (c) { return c.trim(); })) rows.push(curRow);
      var align = (envName === 'cases' || envName === 'aligned' || envName === 'align') ? ' columnalign="left"' : '';
      var mtr = rows.map(function (r) {
        return '<mtr>' + r.map(function (c) { return '<mtd>' + innerMl(c.replace(/\\hline/g, '').trim()) + '</mtd>'; }).join('') + '</mtr>';
      }).join('');
      var table = '<mtable' + align + '>' + mtr + '</mtable>';
      var fence = ENV_FENCE[envName];
      return fence ? '<mrow><mo>' + fence[0] + '</mo>' + table + (fence[1] ? '<mo>' + fence[1] + '</mo>' : '') + '</mrow>' : table;
    }
    function parseCmd() {
      pos++;
      if (pos >= len) return '<mrow/>';
      var ch = src.charAt(pos);
      if (!/[A-Za-z]/.test(ch)) {
        pos++;
        if (ch === ' ' || ch === ',' || ch === ';' || ch === ':') return '<mspace width="0.2em"/>';
        if (ch === '!' || ch === '/') return '';
        return '<mo>' + (ch === '|' ? '&#x2225;' : escXml(ch)) + '</mo>';
      }
      var st = pos;
      while (pos < len && /[A-Za-z]/.test(src.charAt(pos))) pos++;
      var cmd = src.slice(st, pos);
      if (BB[cmd]) return '<mi>' + BB[cmd] + '</mi>';
      if (cmd === 'mathbb') return '<mi>' + (BB[(readBalanced('{', '}', true) || '').trim()] || escXml(cmd)) + '</mi>';
      if (cmd === 'mathcal') return '<mi mathvariant="script">' + escXml((readBalanced('{', '}', true) || '').trim()) + '</mi>';
      if (cmd === 'Rstar') return '<msubsup><mi>' + BB.R + '</mi><mrow/><mo>*</mo></msubsup>';
      if (cmd === 'Rplus') return '<msub><mi>' + BB.R + '</mi><mo>+</mo></msub>';
      if (cmd === 'Rminus') return '<msub><mi>' + BB.R + '</mi><mo>-</mo></msub>';
      if (cmd === 'Nstar') return '<msubsup><mi>' + BB.N + '</mi><mrow/><mo>*</mo></msubsup>';
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') return '<mfrac>' + parseAtom() + parseAtom() + '</mfrac>';
      if (cmd === 'sqrt') {
        var idx = readBalanced('[', ']', false);
        var rad = parseAtom();
        return idx != null ? '<mroot>' + rad + innerMl(idx) + '</mroot>' : '<msqrt>' + rad + '</msqrt>';
      }
      if (ACCENTS[cmd]) return '<mover accent="true">' + parseAtom() + '<mo>' + ACCENTS[cmd] + '</mo></mover>';
      if (cmd === 'text' || cmd === 'txt' || cmd === 'st') return '<mtext>' + escXml(readBalanced('{', '}', true) || '') + '</mtext>';
      if (cmd === 'mathrm' || cmd === 'textbf' || cmd === 'textit') {
        var v = cmd === 'textbf' ? 'bold' : (cmd === 'textit' ? 'italic' : 'normal');
        return '<mi mathvariant="' + v + '">' + escXml(readBalanced('{', '}', true) || '') + '</mi>';
      }
      if (cmd === 'operatorname') return '<mo>' + escXml(readBalanced('{', '}', true) || '') + '</mo>';
      if (cmd === 'pmod') return '<mrow><mspace width="0.4em"/><mo>(</mo><mi>mod</mi><mspace width="0.25em"/>' + parseAtom() + '<mo>)</mo></mrow>';
      if (cmd === 'htmlClass') return '<mrow class="' + escXml((readBalanced('{', '}', true) || '').trim()) + '">' + parseAtom() + '</mrow>';
      if (cmd === 'blank' || cmd === 'blanck' || cmd === 'balck') return '<mrow class="math-blank">' + parseAtom() + '</mrow>';
      if (cmd === 'left') return '<mrow><mo>' + parseDelim() + '</mo>' + parseSeq('\\right') + '<mo>' + parseDelim() + '</mo></mrow>';
      if (cmd === 'begin') return parseEnv((readBalanced('{', '}', true) || '').trim());
      if (cmd === 'displaystyle' || cmd === 'dst' || cmd === 'textstyle') return '';
      if (SYM[cmd]) return '<mo' + (BIG_OPS.test(cmd) ? ' movablelimits="true"' : '') + '>' + SYM[cmd] + '</mo>';
      if (FN_OPS.test(cmd)) return '<mi mathvariant="normal">' + cmd + '</mi>';
      return '<mi>' + escXml(cmd) + '</mi>';
    }
    function parseAtom() {
      skipWs();
      if (pos >= len) return '<mrow/>';
      var ch = src.charAt(pos);
      if (ch === '{') { pos++; return '<mrow>' + parseSeq('}') + '</mrow>'; }
      if (ch === '\\') return parseCmd();
      pos++;
      if (/[0-9]/.test(ch)) {
        var num = ch;
        while (pos < len && /[0-9.,]/.test(src.charAt(pos))) num += src.charAt(pos++);
        return '<mn>' + escXml(num) + '</mn>';
      }
      return (/[A-Za-z]/.test(ch) ? '<mi>' : '<mo>') + escXml(ch) + (/[A-Za-z]/.test(ch) ? '</mi>' : '</mo>');
    }
    function parseFactor() {
      var prev = pos, base = parseAtom(), primes = '', sub = null, sup = null;
      skipWs();
      while (pos < len && src.charAt(pos) === "'") { primes += '&#x2032;'; pos++; }
      for (var k = 0; k < 2; k++) {
        skipWs();
        if (pos < len && src.charAt(pos) === '_' && sub == null) { pos++; sub = parseAtom(); }
        else if (pos < len && src.charAt(pos) === '^' && sup == null) { pos++; sup = parseAtom(); }
        else break;
      }
      if (primes) sup = sup ? '<mrow><mo>' + primes + '</mo>' + sup + '</mrow>' : '<mo>' + primes + '</mo>';
      if (pos === prev && pos < len) pos++;
      if (!sub && !sup) return base;
      var isBig = /^<(?:mo|mi)[^>]*>(?:lim|&#x2211;|&#x220F;|&#x222B;|&#x22C3;|&#x22C2;)</.test(base);
      if (sub && sup) return (isBig ? '<munderover>' : '<msubsup>') + base + sub + sup + (isBig ? '</munderover>' : '</msubsup>');
      if (sub) return (isBig ? '<munder>' : '<msub>') + base + sub + (isBig ? '</munder>' : '</msub>');
      return (isBig ? '<mover>' : '<msup>') + base + sup + (isBig ? '</mover>' : '</msup>');
    }
    function parseSeq(stop) {
      var out = [];
      while (pos < len) {
        skipWs();
        if (pos >= len) break;
        if (stop === '}' && src.charAt(pos) === '}') { pos++; break; }
        if (stop === '\\right' && src.slice(pos, pos + 6) === '\\right' && !/[A-Za-z]/.test(src.charAt(pos + 6))) { pos += 6; break; }
        var cur = pos, f = parseFactor();
        if (f) out.push(f);
        if (pos === cur) pos++;
      }
      return out.length === 1 ? out[0] : '<mrow>' + out.join('') + '</mrow>';
    }
    return '<math xmlns="http://www.w3.org/1998/Math/MathML"' + (displayMode ? ' display="block"' : '') + '>' + parseSeq(null) + '</math>';
  }

  global.MathFlowMathMLFallback = { texToMathML: texToMathML };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowMathMLFallback;
})(typeof window !== 'undefined' ? window : globalThis);
