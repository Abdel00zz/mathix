/**
 * Service de gestion KaTeX avec optimisation Web Worker et Lazy Rendering
 */

import { mathWorkerService } from './mathWorkerService';

// ============================================================================
// INTERFACE
// ============================================================================

interface TypesetMetrics {
  totalCalls: number;
  totalElements: number;
  averageTimeMs: number;
  cacheHits: number;
  workerProcessed: number;
}

const metrics: TypesetMetrics = {
  totalCalls: 0,
  totalElements: 0,
  averageTimeMs: 0,
  cacheHits: 0,
  workerProcessed: 0
};

// ============================================================================
// MACROS
// ============================================================================

const KATEX_MACROS: any = {
  "\\R": "\\mathbb{R}", "\\N": "\\mathbb{N}", "\\Z": "\\mathbb{Z}", "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}", "\\K": "\\mathbb{K}", "\\D": "\\mathbb{D}", "\\Primes": "\\mathbb{P}",
  "\\Rstar": "\\mathbb{R}^*", "\\Rplus": "\\mathbb{R}_+", "\\Rminus": "\\mathbb{R}_-",
  "\\Rplusstar": "\\mathbb{R}_+^*", "\\Nstar": "\\mathbb{N}^*", "\\Zstar": "\\mathbb{Z}^*", "\\Qstar": "\\mathbb{Q}^*", "\\Cstar": "\\mathbb{C}^*",
  "\\card": "\\text{Card}\\left(#1\\right)",
  "\\crd": "\\text{Card}\\left(#1\\right)",
  "\\union": "\\cup", "\\inter": "\\cap",
  "\\bigunion": "\\bigcup", "\\biginter": "\\bigcap",
  "\\included": "\\subset", "\\notincluded": "\\not\\subset",
  "\\belongs": "\\in", "\\notbelongs": "\\notin",
  "\\textrightarrow": "\\rightarrow",
  "\\void": "\\varnothing",
  "\\comp": "\\complement_{#1}",
  "\\interval": "\\left[ #1 ; #2 \\right]",
  "\\intervaloo": "\\left] #1 ; #2 \\right[",
  "\\intervalco": "\\left[ #1 ; #2 \\right[",
  "\\intervaloc": "\\left] #1 ; #2 \\right]",
  "\\pa": "\\left( #1 \\right)",
  "\\br": "\\left[ #1 \\right]",
  "\\ac": "\\left\\{ #1 \\right\\}",
  "\\abs": "\\left\\lvert #1 \\right\\rvert",
  "\\norm": "\\left\\lVert #1 \\right\\rVert",
  "\\floor": "\\left\\lfloor #1 \\right\\rfloor",
  "\\ceil": "\\left\\lceil #1 \\right\\rceil",
  "\\ang": "\\left\\langle #1 \\right\\rangle",
  "\\limn": "\\lim_{n \\to +\\infty}",
  "\\limx": "\\lim_{x \\to #1}",
  "\\limpinf": "\\lim_{x \\to +\\infty}",
  "\\limminf": "\\lim_{x \\to -\\infty}",
  "\\d": "\\mathrm{d}",
  "\\dd": "\\frac{\\mathrm{d}}{\\mathrm{d}#1}",
  "\\diff": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}",
  "\\pd": "\\frac{\\partial}{\\partial #1}",
  "\\pdiff": "\\frac{\\partial #1}{\\partial #2}",
  "\\intR": "\\int_{-\\infty}^{+\\infty}",
  "\\intab": "\\int_{#1}^{#2}",
  "\\sumin": "\\sum_{i=1}^{n}",
  "\\sumkn": "\\sum_{k=0}^{n}",
  "\\suminf": "\\sum_{n=0}^{+\\infty}",
  "\\prodin": "\\prod_{i=1}^{n}",
  "\\e": "\\mathrm{e}", "\\i": "\\mathrm{i}",
  "\\sh": "\\sinh", "\\ch": "\\cosh", "\\th": "\\tanh",
  "\\vect": "\\overrightarrow{#1}",
  "\\Oij": "(O\\,; \\overrightarrow{i}\\,, \\overrightarrow{j})",
  "\\Oijk": "(O\\,; \\overrightarrow{i}\\,, \\overrightarrow{j}\\,, \\overrightarrow{k})",
  "\\repere": "\\left(#1\\,; \\overrightarrow{#2}\\,, \\overrightarrow{#3}\\right)",
  "\\repereijk": "\\left(#1\\,; \\overrightarrow{#2}\\,, \\overrightarrow{#3}\\,, \\overrightarrow{#4}\\right)",
  "\\mat": "\\begin{pmatrix} #1 \\end{pmatrix}",
  "\\tr": "\\text{Tr}\\left( #1 \\right)",
  "\\trans": "^\\mathsf{T}",
  "\\rank": "\\text{rg}", "\\ker": "\\text{Ker}", "\\img": "\\text{Im}", "\\id": "\\text{Id}",
  "\\Proba": "\\mathbb{P}\\left( #1 \\right)",
  "\\ProbaC": "\\mathbb{P}_{#1}\\left( #2 \\right)",
  "\\Esper": "\\mathbb{E}\\left[ #1 \\right]",
  "\\Var": "\\mathbb{V}\\left( #1 \\right)",
  "\\Cov": "\\text{Cov}\\left( #1 \\right)",
  "\\Bin": "\\mathcal{B}\\left( #1, #2 \\right)",
  "\\Norm": "\\mathcal{N}\\left( #1, #2 \\right)",
  "\\loi": "\\hookrightarrow",

  // ═══════════════════════════════════════════════════════════════════
  // PROBABILITÉS — Boules colorées avec numéro intérieur
  // Usage : \boulerouge{1} \boulenoire{2} \bouleverte{} \boulejaune{3}
  // ═══════════════════════════════════════════════════════════════════
  "\\boulerouge":   "\\htmlClass{boule boule-rouge}{#1}",
  "\\boulenoire":   "\\htmlClass{boule boule-noire}{#1}",
  "\\bouleverte":   "\\htmlClass{boule boule-verte}{#1}",
  "\\boulebleue":   "\\htmlClass{boule boule-bleue}{#1}",
  "\\boulejaune":   "\\htmlClass{boule boule-jaune}{#1}",
  "\\bouleblanche": "\\htmlClass{boule boule-blanche}{#1}",
  "\\bouleorange":  "\\htmlClass{boule boule-orange}{#1}",
  "\\bouleviolette":"\\htmlClass{boule boule-violette}{#1}",
  "\\desix":        "\\htmlClass{dice-face dice-#1}{}",
  "\\dice":         "\\htmlClass{dice-face dice-#1}{}",
  "\\die":          "\\htmlClass{dice-face dice-#1}{}",
  "\\pile":         "\\htmlClass{coin coin-pile}{P}",
  "\\face":         "\\htmlClass{coin coin-face}{F}",
  "\\impl": "\\implies", "\\rimpl": "\\Longleftarrow",
  "\\eqdef": "\\stackrel{\\text{déf}}{=}",
  "\\land": "\\wedge", "\\lor": "\\vee", "\\lnot": "\\neg",
  "\\existsu": "\\exists !",
  "\\eps": "\\varepsilon", "\\phi": "\\varphi", "\\al": "\\alpha", "\\be": "\\beta",
  "\\ga": "\\gamma", "\\Ga": "\\Gamma", "\\de": "\\delta", "\\De": "\\Delta",
  "\\la": "\\lambda", "\\La": "\\Lambda", "\\om": "\\omega", "\\Om": "\\Omega",
  "\\si": "\\sigma", "\\Si": "\\Sigma", "\\the": "\\theta", "\\Th": "\\Theta",
  "\\green": "\\textcolor{##3b82f6}{#1}",
  "\\greenb": "\\textcolor{##3b82f6}{\\textbf{#1}}",
  "\\red": "\\textcolor{##ef4444}{#1}",
  "\\redb": "\\textcolor{##ef4444}{\\textbf{#1}}",
  "\\blue": "\\textcolor{##3b82f6}{#1}",
  "\\blueb": "\\textcolor{##3b82f6}{\\textbf{#1}}",
  "\\orange": "\\textcolor{##f59e0b}{#1}",
  "\\orangeb": "\\textcolor{##f59e0b}{\\textbf{#1}}",
  "\\purple": "\\textcolor{##8b5cf6}{#1}",
  "\\purpleb": "\\textcolor{##8b5cf6}{\\textbf{#1}}",
  "\\pink": "\\textcolor{##ec4899}{#1}",
  "\\teal": "\\textcolor{##14b8a6}{#1}",
  "\\dst": "\\displaystyle",
  "\\txt": "\\text{#1}",
  "\\st": "\\text{#1}",
  "\\textsuperscript": "^{\\text{#1}}",
  "\\result": "\\boxed{#1}",
  "\\sys": "\\left\\{ \\begin{aligned} #1 \\end{aligned} \\right.",
  "\\blank": "\\htmlClass{math-blank}{#1}",
  "\\blanck": "\\htmlClass{math-blank}{#1}",
  "\\balck": "\\htmlClass{math-blank}{#1}",
  "\\textcircled": "\\htmlClass{circle-text}{#1}",
  "\\circled": "\\htmlClass{circle-text}{#1}",
  "\\step": "\\htmlClass{circle-text}{#1}",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Géométrie analytique
  // ═══════════════════════════════════════════════════════════════════
  "\\coord": "\\left(#1\\,;\\,#2\\right)",
  "\\coordiii": "\\left(#1\\,;\\,#2\\,;\\,#3\\right)",
  "\\seg": "\\left[#1\\right]",
  "\\droite": "\\left(#1\\right)",
  "\\plan": "\\left(\\mathcal{#1}\\right)",
  "\\dist": "d\\!\\left(#1,\\,#2\\right)",
  "\\midpoint": "I_{#1#2}",
  "\\perpmark": "\\perp",
  "\\parmark": "\\parallel",
  "\\scalaire": "\\overrightarrow{#1} \\cdot \\overrightarrow{#2}",
  "\\vectoriel": "\\overrightarrow{#1} \\wedge \\overrightarrow{#2}",
  "\\norme": "\\left\\lVert \\overrightarrow{#1} \\right\\rVert",
  "\\aire": "\\mathcal{A}\\!\\left(#1\\right)",
  "\\vol": "\\mathcal{V}\\!\\left(#1\\right)",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Nombres complexes
  // ═══════════════════════════════════════════════════════════════════
  "\\conj": "\\overline{#1}",
  "\\module": "\\left|#1\\right|",
  "\\argu": "\\arg\\!\\left(#1\\right)",
  "\\affixe": "z_{#1}",
  "\\expo": "#1\\,e^{i#2}",
  "\\trigo": "#1\\left(\\cos #2 + i\\sin #2\\right)",
  "\\cis": "\\cos #1 + i\\sin #1",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Tableaux de signes / variations
  // ═══════════════════════════════════════════════════════════════════
  "\\plus": "\\htmlClass{sign-plus}{\\boldsymbol{+}}",
  "\\moins": "\\htmlClass{sign-moins}{\\boldsymbol{-}}",
  "\\zero": "\\htmlClass{sign-zero}{0}",
  "\\fleup": "\\htmlClass{var-arrow-up}{\\nearrow}",
  "\\fledown": "\\htmlClass{var-arrow-down}{\\searrow}",
  "\\fleupB": "\\htmlClass{var-arrow-up var-arrow-big}{\\Large\\nearrow}",
  "\\fledownB": "\\htmlClass{var-arrow-down var-arrow-big}{\\Large\\searrow}",
  "\\dbar": "\\htmlClass{var-dbar}{\\Vert}",
  "\\interdit": "\\htmlClass{var-dbar var-dbar-big}{\\big\\Vert}",
  "\\pinf": "+\\infty",
  "\\minf": "-\\infty",
  "\\tvstrut": "\\rule[-1em]{0pt}{2.6em}",
  "\\tsstrut": "\\rule[-0.6em]{0pt}{1.7em}",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Annotations visuelles (schémas natifs KaTeX)
  // ═══════════════════════════════════════════════════════════════════
  "\\annoteup": "\\overbrace{#1}^{\\text{#2}}",
  "\\annotedown": "\\underbrace{#1}_{\\text{#2}}",
  "\\encadre": "\\fcolorbox{##3b82f6}{##eff6ff}{$\\displaystyle #1$}",
  "\\encadrevert": "\\fcolorbox{##0fb981}{##ecfdf5}{$\\displaystyle #1$}",
  "\\encadrerouge": "\\fcolorbox{##ef4444}{##fef2f2}{$\\displaystyle #1$}",
  "\\highlight": "\\colorbox{##fef9c3}{$\\displaystyle #1$}",
  "\\crossed": "\\cancel{#1}",
  "\\point": "\\htmlClass{geo-point}{#1}",
  "\\cmark": "\\textcolor{#0fb981}{\\checkmark}",
  "\\xmark": "\\textcolor{#ef4444}{\\times}",
  "\\tag": "\\htmlClass{math-tag}{#1}",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Figures géométriques (schémas natifs)
  // ═══════════════════════════════════════════════════════════════════
  "\\axeH": "\\rule{6em}{0.5pt}",
  "\\axeV": "\\rule{0.5pt}{4em}",
  "\\ptmark": "\\bullet",
  "\\cercle": "\\bigcirc",
  "\\carre": "\\square",
  "\\fleche": "\\xrightarrow{\\;#1\\;}",
  "\\longfleche": "\\xrightarrow{\\quad #1 \\quad}",
  "\\bifleche": "\\xleftrightarrow{\\;#1\\;}",
  "\\mapsmark": "\\xmapsto{\\;#1\\;}",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Analyse avancée
  // ═══════════════════════════════════════════════════════════════════
  "\\ssi": "\\Longleftrightarrow",
  "\\cvto": "\\xrightarrow[#1 \\to #2]{}",
  "\\dvg": "\\xrightarrow[#1 \\to #2]{} \\pm\\infty",
  "\\FI": "\\left[#1\\right]_{#2}^{#3}",
  "\\croiss": "\\nearrow",
  "\\decroiss": "\\searrow",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Arbres de probabilité & dénombrement
  // ═══════════════════════════════════════════════════════════════════
  "\\brup": "\\overset{\\scriptstyle #1}{\\nearrow}",
  "\\brdn": "\\underset{\\scriptstyle #1}{\\searrow}",
  "\\naf": "\\xrightarrow{\\;\\scriptstyle #1\\;}",
  "\\pchemin": "#1 \\times #2",
  "\\noeud": "\\htmlClass{tree-node}{#1}",

  // ═══════════════════════════════════════════════════════════════════
  // PREMIUM — Raccourcis trigonométrie
  // ═══════════════════════════════════════════════════════════════════
  "\\cosq": "\\cos^2\\!#1",
  "\\sinq": "\\sin^2\\!#1",
  "\\tanq": "\\tan^2\\!#1"
};

// ============================================================================
// SERVICE
// ============================================================================

export const katexService = {
  isReady: (): boolean => {
    return !!(window as any).katex && !!(window as any).renderMathInElement;
  },

  waitFor: (): Promise<void> => {
    if (katexService.isReady()) return Promise.resolve();

    return new Promise((resolve) => {
      // Listen for the onload event from the auto-render script
      const onReady = () => {
        window.removeEventListener('katex-ready', onReady);
        // Small delay to ensure renderMathInElement is fully initialized
        requestAnimationFrame(() => resolve());
      };

      if ((window as any).__katexReady && katexService.isReady()) {
        resolve();
        return;
      }

      window.addEventListener('katex-ready', onReady);

      // Fallback poll in case event was missed
      const check = () => {
        if (katexService.isReady()) { window.removeEventListener('katex-ready', onReady); resolve(); }
        else setTimeout(check, 100);
      };
      setTimeout(check, 200);
    });
  },

  preprocess: async (latex: string, displayMode: boolean = false) => {
    try {
      const result = await mathWorkerService.processLatex(latex, displayMode);
      if (result.cached) metrics.cacheHits++;
      metrics.workerProcessed++;
      return result;
    } catch {
      return null;
    }
  },

  validateLatex: async (latex: string) => {
    return mathWorkerService.validateLatex(latex);
  },

  /**
   * Typeset optimisé avec KaTeX
   */
  typeset: async (elements: HTMLElement | HTMLElement[] | null) => {
    if (!elements) return;
    const els = Array.isArray(elements) ? elements : [elements];
    const validEls = els.filter(el => document.body.contains(el));
    if (validEls.length === 0) return;

    await katexService.waitFor();
    const renderMathInElement = (window as any).renderMathInElement;

    validEls.forEach(el => {
      renderMathInElement(el, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '\\[', right: '\\]', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
        ],
        throwOnError: false,
        trust: true,
        // Les macros \htmlClass (boules, blancs, signes…) sont volontaires :
        // strict:false évite les avertissements « htmlExtension » en console.
        strict: false,
        macros: KATEX_MACROS
      });
    });
  },

  typesetWithValidation: async (element: HTMLElement, latex: string, displayMode: boolean = false) => {
    const preprocessed = await katexService.preprocess(latex, displayMode);
    if (preprocessed && !preprocessed.isValid) {
      console.warn('[KatexService] Validation warnings:', preprocessed.errors);
    }
    await katexService.typeset(element);
  },

  getMetrics: (): TypesetMetrics => ({ ...metrics }),

  resetMetrics: () => {
    metrics.totalCalls = 0;
    metrics.totalElements = 0;
    metrics.averageTimeMs = 0;
    metrics.cacheHits = 0;
    metrics.workerProcessed = 0;
  },

  isWorkerAvailable: (): boolean => mathWorkerService.isAvailable(),
  clearWorkerCache: async () => await mathWorkerService.clearCache()
};
