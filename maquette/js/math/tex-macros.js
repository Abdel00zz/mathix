/**
 * MathFlow — KaTeX macros, line-break bracket repair, blanks & semantic prose TeX macros (< 280 lines)
 * Zero Tailwind utility classes.
 */
(function initTexMacros(global) {
  'use strict';

  var LATEX_MACROS = {
    '\\R': '\\mathbb{R}', '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\C': '\\mathbb{C}',
    '\\K': '\\mathbb{K}', '\\D': '\\mathbb{D}', '\\Primes': '\\mathbb{P}', '\\Rstar': '\\mathbb{R}^*',
    '\\Rplus': '\\mathbb{R}_+', '\\Rminus': '\\mathbb{R}_-', '\\Rplusstar': '\\mathbb{R}_+^*', '\\Rminusstar': '\\mathbb{R}_-^*',
    '\\Nstar': '\\mathbb{N}^*', '\\Zstar': '\\mathbb{Z}^*', '\\Qstar': '\\mathbb{Q}^*', '\\Cstar': '\\mathbb{C}^*',
    '\\card': '\\text{Card}\\left(#1\\right)', '\\crd': '\\text{Card}\\left(#1\\right)', '\\Card': '\\operatorname{Card}',
    '\\Re': '\\operatorname{Re}', '\\Im': '\\operatorname{Im}', '\\pgcd': '\\operatorname{pgcd}', '\\ppcm': '\\operatorname{ppcm}',
    '\\Ker': '\\operatorname{Ker}', '\\rg': '\\operatorname{rg}', '\\Vect': '\\operatorname{Vect}', '\\cotan': '\\operatorname{cotan}',
    '\\Arccos': '\\operatorname{Arccos}', '\\Arcsin': '\\operatorname{Arcsin}', '\\Arctan': '\\operatorname{Arctan}',
    '\\union': '\\cup', '\\inter': '\\cap', '\\bigunion': '\\bigcup', '\\biginter': '\\bigcap',
    '\\included': '\\subset', '\\notincluded': '\\not\\subset', '\\belongs': '\\in', '\\notbelongs': '\\notin',
    '\\textrightarrow': '\\rightarrow', '\\void': '\\varnothing', '\\comp': '\\complement_{#1}',
    '\\interval': '\\left[ #1 ; #2 \\right]', '\\intervalcc': '\\left[ #1 ; #2 \\right]', '\\intervaloo': '\\left] #1 ; #2 \\right[',
    '\\intervalco': '\\left[ #1 ; #2 \\right[', '\\intervaloc': '\\left] #1 ; #2 \\right]', '\\Ensemble': '\\left\\{#1\\right\\}',
    '\\pa': '\\left( #1 \\right)', '\\br': '\\left[ #1 \\right]', '\\ac': '\\left\\{ #1 \\right\\}',
    '\\abs': '\\left\\lvert #1 \\right\\rvert', '\\norm': '\\left\\lVert #1 \\right\\rVert',
    '\\floor': '\\left\\lfloor #1 \\right\\rfloor', '\\ceil': '\\left\\lceil #1 \\right\\rceil', '\\ang': '\\left\\langle #1 \\right\\rangle',
    '\\limn': '\\lim_{n \\to +\\infty}', '\\limx': '\\lim_{x \\to #1}', '\\limpinf': '\\lim_{x \\to +\\infty}', '\\limminf': '\\lim_{x \\to -\\infty}',
    '\\d': '\\mathrm{d}', '\\dd': '\\frac{\\mathrm{d}}{\\mathrm{d}#1}', '\\diff': '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
    '\\pd': '\\frac{\\partial}{\\partial #1}', '\\pdiff': '\\frac{\\partial #1}{\\partial #2}',
    '\\intR': '\\int_{-\\infty}^{+\\infty}', '\\intab': '\\int_{#1}^{#2}',
    '\\sumin': '\\sum_{i=1}^{n}', '\\sumkn': '\\sum_{k=0}^{n}', '\\suminf': '\\sum_{n=0}^{+\\infty}', '\\prodin': '\\prod_{i=1}^{n}',
    '\\e': '\\mathrm{e}', '\\i': '\\mathrm{i}', '\\sh': '\\sinh', '\\ch': '\\cosh', '\\th': '\\tanh', '\\vect': '\\overrightarrow{#1}',
    '\\Oij': '(O\\,; \\overrightarrow{i}\\,, \\overrightarrow{j})', '\\Oijk': '(O\\,; \\overrightarrow{i}\\,, \\overrightarrow{j}\\,, \\overrightarrow{k})',
    '\\Ouv': '\\left(O\\,;\\,\\overrightarrow{u}\\,,\\,\\overrightarrow{v}\\right)',
    '\\repere': '\\left(#1\\,; \\overrightarrow{#2}\\,, \\overrightarrow{#3}\\right)',
    '\\repereijk': '\\left(#1\\,; \\overrightarrow{#2}\\,, \\overrightarrow{#3}\\,, \\overrightarrow{#4}\\right)',
    '\\mat': '\\begin{pmatrix} #1 \\end{pmatrix}', '\\tr': '\\text{Tr}\\left(#1\\right)', '\\trans': '^\\mathsf{T}',
    '\\rank': '\\text{rg}', '\\ker': '\\text{Ker}', '\\img': '\\text{Im}', '\\id': '\\text{Id}',
    '\\Proba': '\\mathbb{P}\\left(#1\\right)', '\\ProbaC': '\\mathbb{P}_{#1}\\left(#2\\right)',
    '\\Esper': '\\mathbb{E}\\left[#1\\right]', '\\Var': '\\mathbb{V}\\left(#1\\right)', '\\Cov': '\\text{Cov}\\left(#1\\right)',
    '\\Bin': '\\mathcal{B}\\left(#1, #2\\right)', '\\Norm': '\\mathcal{N}\\left(#1, #2\\right)', '\\loi': '\\hookrightarrow',
    '\\boulerouge': '\\htmlClass{boule boule-rouge}{#1}', '\\boulenoire': '\\htmlClass{boule boule-noire}{#1}',
    '\\bouleverte': '\\htmlClass{boule boule-verte}{#1}', '\\boulebleue': '\\htmlClass{boule boule-bleue}{#1}',
    '\\boulejaune': '\\htmlClass{boule boule-jaune}{#1}', '\\bouleblanche': '\\htmlClass{boule boule-blanche}{#1}',
    '\\bouleorange': '\\htmlClass{boule boule-orange}{#1}', '\\bouleviolette': '\\htmlClass{boule boule-violette}{#1}',
    '\\desix': '\\htmlClass{dice-face dice-#1}{}', '\\dice': '\\htmlClass{dice-face dice-#1}{}', '\\die': '\\htmlClass{dice-face dice-#1}{}',
    '\\pile': '\\htmlClass{coin coin-pile}{P}', '\\face': '\\htmlClass{coin coin-face}{F}',
    '\\impl': '\\implies', '\\imp': '\\Longrightarrow', '\\rimpl': '\\Longleftarrow', '\\ssi': '\\Longleftrightarrow', '\\equi': '\\Longleftrightarrow',
    '\\eqdef': '\\stackrel{\\text{déf}}{=}', '\\land': '\\wedge', '\\lor': '\\vee', '\\lnot': '\\neg', '\\existsu': '\\exists !',
    '\\eps': '\\varepsilon', '\\phi': '\\varphi', '\\al': '\\alpha', '\\be': '\\beta', '\\ga': '\\gamma', '\\Ga': '\\Gamma',
    '\\de': '\\delta', '\\De': '\\Delta', '\\la': '\\lambda', '\\La': '\\Lambda', '\\om': '\\omega', '\\Om': '\\Omega',
    '\\si': '\\sigma', '\\Si': '\\Sigma', '\\the': '\\theta', '\\Th': '\\Theta',
    '\\red': '\\textcolor{##ef4444}{#1}', '\\redb': '\\textcolor{##ef4444}{\\textbf{#1}}',
    '\\blue': '\\textcolor{##3b82f6}{#1}', '\\blueb': '\\textcolor{##3b82f6}{\\textbf{#1}}',
    '\\green': '\\textcolor{##16a34a}{#1}', '\\greenb': '\\textcolor{##16a34a}{\\textbf{#1}}',
    '\\orange': '\\textcolor{##f59e0b}{#1}', '\\orangeb': '\\textcolor{##f59e0b}{\\textbf{#1}}',
    '\\purple': '\\textcolor{##8b5cf6}{#1}', '\\purpleb': '\\textcolor{##8b5cf6}{\\textbf{#1}}',
    '\\pink': '\\textcolor{##ec4899}{#1}', '\\teal': '\\textcolor{##14b8a6}{#1}',
    '\\dst': '\\displaystyle', '\\ds': '\\displaystyle', '\\txt': '\\text{#1}', '\\st': '\\text{#1}', '\\textsuperscript': '^{\\text{#1}}',
    '\\result': '\\boxed{#1}', '\\sys': '\\left\\{\\begin{aligned} #1 \\end{aligned}\\right.',
    '\\blank': '\\htmlClass{math-blank}{#1}', '\\blanck': '\\htmlClass{math-blank}{#1}', '\\balck': '\\htmlClass{math-blank}{#1}',
    '\\textcircled': '\\htmlClass{circle-text}{#1}', '\\circled': '\\htmlClass{circle-text}{#1}', '\\step': '\\htmlClass{circle-text}{#1}',
    '\\coord': '\\left(#1\\,;\\,#2\\right)', '\\coordiii': '\\left(#1\\,;\\,#2\\,;\\,#3\\right)',
    '\\seg': '\\left[#1\\right]', '\\droite': '\\left(#1\\right)', '\\plan': '\\left(\\mathcal{#1}\\right)',
    '\\dist': 'd\\!\\left(#1,\\,#2\\right)', '\\midpoint': 'I_{#1#2}', '\\perpmark': '\\perp', '\\parmark': '\\parallel',
    '\\scalaire': '\\overrightarrow{#1} \\cdot \\overrightarrow{#2}', '\\vectoriel': '\\overrightarrow{#1} \\wedge \\overrightarrow{#2}',
    '\\norme': '\\left\\lVert \\overrightarrow{#1} \\right\\rVert', '\\aire': '\\mathcal{A}\\!\\left(#1\\right)', '\\vol': '\\mathcal{V}\\!\\left(#1\\right)',
    '\\conj': '\\overline{#1}', '\\module': '\\left|#1\\right|', '\\argu': '\\arg\\!\\left(#1\\right)', '\\affixe': 'z_{#1}',
    '\\expo': '#1\\,e^{i#2}', '\\trigo': '#1\\left(\\cos #2 + i\\sin #2\\right)', '\\cis': '\\cos #1 + i\\sin #1',
    '\\plus': '\\htmlClass{sign-plus}{\\boldsymbol{+}}', '\\moins': '\\htmlClass{sign-moins}{\\boldsymbol{-}}', '\\zero': '\\htmlClass{sign-zero}{0}',
    '\\fleup': '\\htmlClass{var-arrow-up}{\\nearrow}', '\\fledown': '\\htmlClass{var-arrow-down}{\\searrow}',
    '\\fleupB': '\\htmlClass{var-arrow-up var-arrow-big}{\\Large\\nearrow}', '\\fledownB': '\\htmlClass{var-arrow-down var-arrow-big}{\\Large\\searrow}',
    '\\dbar': '\\htmlClass{var-dbar}{\\Vert}', '\\interdit': '\\htmlClass{var-dbar var-dbar-big}{\\big\\Vert}',
    '\\pinf': '+\\infty', '\\minf': '-\\infty', '\\tvstrut': '\\rule[-1em]{0pt}{2.6em}', '\\tsstrut': '\\rule[-0.6em]{0pt}{1.7em}',
    '\\annoteup': '\\overbrace{#1}^{\\text{#2}}', '\\annotedown': '\\underbrace{#1}_{\\text{#2}}',
    '\\encadre': '\\fcolorbox{##3b82f6}{##eff6ff}{$\\displaystyle #1$}', '\\encadrevert': '\\fcolorbox{##0fb981}{##ecfdf5}{$\\displaystyle #1$}',
    '\\encadrerouge': '\\fcolorbox{##ef4444}{##fef2f2}{$\\displaystyle #1$}', '\\highlight': '\\colorbox{##fef9c3}{$\\displaystyle #1$}',
    '\\crossed': '\\cancel{#1}', '\\point': '\\htmlClass{geo-point}{#1}',
    '\\cmark': '\\textcolor{#0fb981}{\\checkmark}', '\\xmark': '\\textcolor{#ef4444}{\\times}', '\\tag': '\\htmlClass{math-tag}{#1}',
    '\\axeH': '\\rule{6em}{0.5pt}', '\\axeV': '\\rule{0.5pt}{4em}', '\\ptmark': '\\bullet', '\\cercle': '\\bigcirc', '\\carre': '\\square',
    '\\fleche': '\\xrightarrow{\\;#1\\;}', '\\longfleche': '\\xrightarrow{\\quad #1 \\quad}', '\\bifleche': '\\xleftrightarrow{\\;#1\\;}',
    '\\mapsmark': '\\xmapsto{\\;#1\\;}', '\\cvto': '\\xrightarrow[#1 \\to #2]{}', '\\dvg': '\\xrightarrow[#1 \\to #2]{} \\pm\\infty',
    '\\FI': '\\left[#1\\right]_{#2}^{#3}', '\\croiss': '\\nearrow', '\\decroiss': '\\searrow', '\\fleconst': '\\rightarrow',
    '\\brup': '\\overset{\\scriptstyle #1}{\\nearrow}', '\\brdn': '\\underset{\\scriptstyle #1}{\\searrow}',
    '\\naf': '\\xrightarrow{\\;\\scriptstyle #1\\;}', '\\pchemin': '#1 \\times #2', '\\noeud': '\\htmlClass{tree-node}{#1}',
    '\\cosq': '\\cos^2\\!#1', '\\sinq': '\\sin^2\\!#1', '\\tanq': '\\tan^2\\!#1'
  };

  var SIZE_ARG = /^\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:em|ex|mu|pt|mm|cm|in|bp|pc|dd|cc|nd|nc|sp|px)\s*$/;
  var WRAPPERS = {
    hl: ['<mark class="mf-hl">', '</mark>'], highlight: ['<mark class="mf-hl">', '</mark>'],
    underline: ['<span class="mf-ul math-text-underline">', '</span>'],
    textbf: ['<strong class="math-text-bold">', '</strong>'], textit: ['<em class="math-text-italic">', '</em>'], emph: ['<em class="math-text-italic">', '</em>'],
    textsc: ['<span class="ru">', '</span>'], texttt: ['<code class="math-text-code">', '</code>'], textsuperscript: ['<sup class="math-text-sup">', '</sup>'],
    boxed: ['<span class="math-boxed">', '</span>'], encadre: ['<span class="math-boxed">', '</span>'], result: ['<span class="math-boxed">', '</span>'],
    encadrevert: ['<span class="math-boxed mf-badge-emerald">', '</span>'], encadrerouge: ['<span class="math-boxed mf-badge-rose">', '</span>'],
    objectif: ['<span class="mf-objectif mf-badge mf-badge-indigo">', '</span>'], defi: ['<span class="mf-defi mf-badge mf-badge-emerald">', '</span>'],
    method: ['<div class="math-command-label math-command-label-method"><span class="mf-badge mf-badge-indigo">Méthode</span> <span>', '</span></div>'],
    tip: ['<div class="math-savant-card"><span class="mf-badge mf-badge-amber">Astuce</span> <span>', '</span></div>'],
    conclusion: ['<div class="math-boxed"><span class="mf-badge mf-badge-emerald">Conclusion</span> <span>', '</span></div>'],
    question: ['<div class="math-question"><div class="math-question-body">', '</div></div>'],
    qst: ['<div class="math-question"><div class="math-question-body">', '</div></div>'],
    mathqst: ['<span class="math-mathqst mathqst-colored">', '</span>'],
    itemsize: ['<div class="itemsize-block"><span class="itemsize-bullet" aria-hidden="true">&#9670;</span><span>', '</span></div>'],
    red: ['<span class="math-text-red">', '</span>'], blue: ['<span class="math-text-blue">', '</span>'],
    green: ['<span class="math-text-green">', '</span>'], orange: ['<span class="math-text-orange">', '</span>'], purple: ['<span class="math-text-purple">', '</span>']
  };
  var BARE_BADGES = {
    step: '<span class="math-command-label math-command-label--step">Étape</span>',
    method: '<span class="mf-badge mf-badge-indigo math-command-label-method">Méthode</span>',
    conclusion: '<span class="mf-badge mf-badge-emerald">Conclusion</span>',
    assumption: '<span class="math-command-label math-command-label--assumption">Hypothèse</span>',
    case: '<span class="math-command-label math-command-label--case">Cas</span>',
    calcul: '<span class="math-command-label math-command-label--calcul">Calcul</span>',
    goal: '<span class="math-command-label math-command-label--goal">Objectif</span>',
    remind: '<span class="math-command-label math-command-label--remind">Rappel</span>',
    hint: '<span class="math-command-label math-command-label--hint">Indice</span>',
    answer: '<span class="math-command-label math-command-label--answer">Réponse</span>',
    consequence: '<span class="math-command-label math-command-label--consequence">Conséquence</span>',
    summary: '<span class="math-command-label math-command-label--summary">Bilan</span>',
    attention: '<span class="math-command-label math-command-label--attention">Attention</span>',
    warning: '<span class="math-command-label math-command-label--attention">Attention</span>',
    tip: '<span class="mf-badge mf-badge-amber">Astuce</span>',
    analyze: '<span class="math-command-label math-command-label--analyze">Analyse</span>',
    recall: '<span class="math-command-label math-command-label--recall">Rappel</span>',
    itemsize: '<span class="itemsize-block"><span class="itemsize-bullet" aria-hidden="true">&#9670;</span></span>'
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function repairLineBreakBrackets(tex) {
    var src = String(tex == null ? '' : tex);
    if (src.indexOf('\\\\') === -1) return src;
    var re = /\\\\([ \t]*)\[/g, out = '', cur = 0, m;
    while ((m = re.exec(src)) !== null) {
      var argStart = re.lastIndex, close = src.indexOf(']', argStart);
      var arg = close === -1 ? src.slice(argStart) : src.slice(argStart, close);
      out += src.slice(cur, m.index) + (SIZE_ARG.test(arg) ? src.slice(m.index, argStart) : '\\\\' + m[1] + '{}[');
      cur = argStart;
    }
    return out + src.slice(cur);
  }

  function findBalanced(str, openIdx, openCh, closeCh) {
    if (str.charAt(openIdx) !== openCh) return -1;
    var depth = 0;
    for (var i = openIdx; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === '\\' && i + 1 < str.length) { i++; continue; }
      if (ch === openCh) depth++; else if (ch === closeCh && --depth === 0) return i;
    }
    return -1;
  }

  function replaceDoubleBrackets(src, replacer) {
    if (src.indexOf('[[') === -1) return src;
    var out = '', i = 0;
    while (i < src.length) {
      var open = src.indexOf('[[', i);
      if (open < 0) { out += src.slice(i); break; }
      out += src.slice(i, open);
      var p = open + 2, depth = 0, close = -1, fb = -1;
      while (p < src.length) {
        var ch = src.charAt(p);
        if (ch === '\\' && p + 1 < src.length) { p += 2; continue; }
        if (ch === '\n' && /\n[ \t]*\n/.test(src.slice(p, p + 4))) break;
        if (ch === '[') depth++;
        else if (ch === ']') {
          if (depth > 0) depth--;
          else if (src.charAt(p + 1) === ']') { close = p; break; }
          if (src.charAt(p + 1) === ']' && fb < 0) fb = p;
        }
        p++;
      }
      var chosen = close >= 0 ? close : fb;
      if (chosen >= 0) { out += replacer(src.slice(open + 2, chosen)); i = chosen + 2; }
      else { out += '[['; i = open + 2; }
    }
    return out;
  }

  function normalizeMathBlanks(tex) {
    var s = replaceDoubleBrackets(String(tex == null ? '' : tex).replace(/\\(?:blanck|balck)(?=\{)/g, '\\blank'), function (inner) { return '\\blank{' + inner + '}'; });
    if (s.indexOf('\\textbf{') === -1) return s;
    var out = '', i = 0, re = /\\textbf\{/g, m;
    while ((m = re.exec(s)) !== null) {
      out += s.slice(i, m.index);
      var end = findBalanced(s, m.index + 7, '{', '}');
      if (end < 0) { out += m[0]; i = re.lastIndex; continue; }
      var inner = s.slice(m.index + 8, end);
      var isMath = /[_^=\\]/.test(inner) && !/\s(?:et|ou|car|donc|pour|avec|dans|sur|les|des|est|sont|soit)\s/i.test(' ' + inner + ' ');
      out += (isMath ? '\\boldsymbol{' : '\\textbf{') + inner + '}';
      i = end + 1; re.lastIndex = i;
    }
    return out + s.slice(i);
  }

  function renderBlankButton(innerHtml) {
    return '<button type="button" class="blank" data-blank="true" aria-expanded="false"><span>' + innerHtml + '</span></button>';
  }

  function romanize(n) {
    var vals = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    var v = Math.max(1, Math.min(3999, Math.floor(Number(n) || 1))), r = '';
    for (var k = 0; k < vals.length; k++) while (v >= vals[k][0]) { r += vals[k][1]; v -= vals[k][0]; }
    return r;
  }

  function formatMarker(depth, idx) {
    var m = ((depth % 3) + 3) % 3;
    if (m === 1) return String.fromCharCode(97 + ((idx - 1) % 26)) + '.';
    if (m === 2) return romanize(idx) + '.';
    return idx + '.';
  }

  function findEnvEnd(src, fromIdx, env) {
    var re = new RegExp('\\\\(begin|end)\\{' + env + '\\}', 'g');
    re.lastIndex = fromIdx;
    var depth = 1, m;
    while ((m = re.exec(src)) !== null) {
      depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) return { start: m.index, end: re.lastIndex };
    }
    return null;
  }

  function readItemLabelBracket(src, openIdx) {
    if (src.charAt(openIdx) !== '[') return -1;
    var depth = 0, inMath = false;
    for (var i = openIdx; i < src.length; i++) {
      var ch = src.charAt(i);
      if (ch === '\\' && i + 1 < src.length) { i++; continue; }
      if (ch === '$' && src.charAt(i + 1) !== '$') { inMath = !inMath; continue; }
      if (inMath) continue;
      if (ch === '[') depth++; else if (ch === ']' && --depth === 0) return i;
    }
    return -1;
  }

  function splitItems(body) {
    var tokens = [], i = 0, depth = 0, cur = '', curLbl = null, started = false;
    while (i < body.length) {
      if (body.slice(i, i + 17) === '\\begin{enumerate}' || body.slice(i, i + 15) === '\\begin{itemize}') depth++;
      else if (body.slice(i, i + 15) === '\\end{enumerate}' || body.slice(i, i + 13) === '\\end{itemize}') depth = Math.max(0, depth - 1);
      if (depth === 0 && /^\\item(?![A-Za-z])/.test(body.slice(i, i + 6))) {
        if (started) tokens.push({ label: curLbl, body: cur.trim() });
        started = true; cur = ''; curLbl = null; i += 5;
        while (i < body.length && /\s/.test(body.charAt(i))) i++;
        if (body.charAt(i) === '[') {
          var cl = readItemLabelBracket(body, i);
          if (cl > i) { curLbl = body.slice(i + 1, cl).trim(); i = cl + 1; }
        }
        continue;
      }
      if (started) cur += body.charAt(i);
      i++;
    }
    if (started) tokens.push({ label: curLbl, body: cur.trim() });
    return tokens;
  }

  function transformLists(src, rSub, depth) {
    var openRe = /\\begin\{(enumerate|itemize)\}(?:\[[^\]]*\])?/g, out = '', cursor = 0, m;
    while ((m = openRe.exec(src)) !== null) {
      var env = m[1], end = findEnvEnd(src, openRe.lastIndex, env);
      if (!end) continue;
      out += src.slice(cursor, m.index);
      var ordered = env === 'enumerate', tag = ordered ? 'ol' : 'ul';
      var items = splitItems(src.slice(openRe.lastIndex, end.start));
      out += '<' + tag + ' class="math-list ' + (ordered ? 'math-list-ordered' : 'math-list-unordered') + '" data-depth="' + depth + '">' +
        items.map(function (it, idx) {
          var mk = it.label != null ? rSub(it.label) : (ordered ? formatMarker(depth, idx + 1) : '&#8226;');
          var inner = transformLists(it.body, rSub, ordered ? depth + 1 : depth);
          return '<li class="math-list-item"><span class="math-list-marker ' + (ordered ? 'math-list-marker-ordered' : 'math-list-marker-unordered') + '">' + mk + '</span><div class="math-list-text">' + rSub(inner) + '</div></li>';
        }).join('') + '</' + tag + '>';
      cursor = end.end;
      openRe.lastIndex = cursor;
    }
    return out + src.slice(cursor);
  }

  function transformColumns(src, rSub) {
    var re = /\\begin\{columns\}(?:\[([^\]]*)\])?/g, out = '', cursor = 0, m;
    while ((m = re.exec(src)) !== null) {
      var end = findEnvEnd(src, re.lastIndex, 'columns');
      if (!end) continue;
      out += src.slice(cursor, m.index);
      var cols = src.slice(re.lastIndex, end.start).trim().split(/\\(?:column|col)(?![A-Za-z])/).map(function (c) { return c.trim(); }).filter(Boolean);
      if (!cols.length) cols = [src.slice(re.lastIndex, end.start).trim()];
      out += '<div class="math-columns" data-columns="' + cols.length + '"' + (/rule/i.test(m[1] || '') ? ' data-rule="true"' : '') + '>' +
        cols.map(function (c) { return '<div class="math-column">' + rSub(c) + '</div>'; }).join('') + '</div>';
      cursor = end.end;
      re.lastIndex = cursor;
    }
    return out + src.slice(cursor);
  }

  function applyInlineFormatting(html) {
    return String(html == null ? '' : html).split(/(<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>)/g).map(function (part, idx) {
      if (idx % 2 === 1 || !part) return part;
      return part.replace(/\*\*([^\n*](?:[^\n]*?[^\n*])?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^\s*\n](?:[^\n]*?[^\s*\n])?)\*(?!\*)/g, '$1<em>$2</em>')
        .replace(/\^\^((?:(?!\^\^)[^\n])+?)\^\^/g, '<span class="ru">$1</span>')
        .replace(/==((?:(?!==)[^\n])+?)==/g, '<b class="cr">$1</b>').replace(/\+\+((?:(?!\+\+)[^\n])+?)\+\+/g, '<b class="cg">$1</b>');
    }).join('');
  }

  function transformProseMacrosBody(text, renderSub) {
    var r = typeof renderSub === 'function' ? renderSub : function (s) { return s; };
    var recurse = function (sub) { return transformProseMacrosBody(sub, r); };
    var s = transformColumns(String(text == null ? '' : text).replace(/\\def\\arraystretch\{[^}]*\}/g, ''), recurse);
    s = replaceDoubleBrackets(transformLists(s, recurse, 0), function (inner) { return renderBlankButton(r(inner)); });
    var cmdRe = /\\(blank|blanck|balck|hl|highlight|underline|textbf|textit|emph|textsc|texttt|textsuperscript|boxed|encadre|encadrevert|encadrerouge|result|objectif|defi|method|tip|conclusion|question|qst|mathqst|itemsize|savant|textcolor|red|blue|green|orange|purple|step|assumption|case|calcul|goal|remind|hint|answer|consequence|summary|attention|warning|analyze|recall)(?![A-Za-z])/g;
    var out = '', i = 0, m;
    while ((m = cmdRe.exec(s)) !== null) {
      out += s.slice(i, m.index);
      var cmd = m[1], pos = cmdRe.lastIndex;
      while (pos < s.length && s.charAt(pos) === ' ') pos++;
      if (s.charAt(pos) !== '{') { out += BARE_BADGES[cmd] || m[0]; i = cmdRe.lastIndex; continue; }
      var end1 = findBalanced(s, pos, '{', '}');
      if (end1 < 0) { out += m[0]; i = cmdRe.lastIndex; continue; }
      var arg1 = s.slice(pos + 1, end1), arg2 = null, nextPos = end1 + 1;
      if (cmd === 'savant' || cmd === 'textcolor') {
        var p2 = nextPos;
        while (p2 < s.length && s.charAt(p2) === ' ') p2++;
        var end2 = s.charAt(p2) === '{' ? findBalanced(s, p2, '{', '}') : -1;
        if (end2 > p2) { arg2 = s.slice(p2 + 1, end2); nextPos = end2 + 1; }
      }
      if (cmd === 'blank' || cmd === 'blanck' || cmd === 'balck') out += renderBlankButton(recurse(arg1));
      else if (cmd === 'savant') out += arg2 != null ? '<div class="math-savant math-savant-card"><strong>' + recurse(arg1) + '</strong><div>' + recurse(arg2) + '</div></div>' : '<span class="mf-badge mf-badge-amber math-savant">' + recurse(arg1) + '</span>';
      else if (cmd === 'textcolor' && arg2 != null) out += '<span style="color:' + (/^[a-zA-Z]+$|^#[0-9a-fA-F]{3,6}$/.test(arg1.trim()) ? arg1.trim() : 'inherit') + '">' + recurse(arg2) + '</span>';
      else if (cmd === 'mathqst' && /^\s*\\/.test(arg1) && !/^\s*\\(blank|blanck|balck|hl|highlight|underline|textbf|textit|emph|textsc|texttt|textsuperscript|boxed|encadre|encadrevert|encadrerouge|result|objectif|defi|method|tip|conclusion|question|qst|itemsize|savant|textcolor|red|blue|green|orange|purple)(?![A-Za-z])/.test(arg1) && arg1.indexOf('@@MF_HOLD_') === -1) {
        out += WRAPPERS.mathqst[0] + r('$' + arg1 + '$') + WRAPPERS.mathqst[1];
      }
      else if (WRAPPERS[cmd]) out += WRAPPERS[cmd][0] + recurse(arg1) + WRAPPERS[cmd][1];
      else out += s.slice(m.index, nextPos);
      i = nextPos; cmdRe.lastIndex = nextPos;
    }
    return out + s.slice(i);
  }

  function applyProseMacros(text, renderSub) { return applyInlineFormatting(transformProseMacrosBody(text, renderSub)); }

  global.MathFlowTexMacros = {
    LATEX_MACROS: LATEX_MACROS, escapeHtml: escapeHtml, repairLineBreakBrackets: repairLineBreakBrackets,
    findBalanced: findBalanced, replaceDoubleBrackets: replaceDoubleBrackets, normalizeMathBlanks: normalizeMathBlanks,
    renderBlankButton: renderBlankButton, applyInlineFormatting: applyInlineFormatting, applyProseMacros: applyProseMacros
  };
  if (typeof module === 'object' && module.exports) module.exports = global.MathFlowTexMacros;
})(typeof window !== 'undefined' ? window : globalThis);
