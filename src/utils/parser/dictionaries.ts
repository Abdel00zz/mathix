
import { MacroConfig } from './shared';

// --- ENVIRONNEMENTS ---
export const SEMANTIC_ENVIRONMENTS = [
  'definition', 'theorem', 'proposition', 'lemma', 'corollary', 'property', 'consequence',
  'axiom', 'postulate', 'conjecture', 'law', 'formula', 'notation', 'vocabulary', 'hypothesis',
  'proof', 'proof_idea', 'proof_sketch',
  'example', 'counterexample', 'exercise', 'solution', 'hint', 'answer', 'application', 'exploration',
  'remark', 'note', 'warning', 'caution', 'important', 'tip', 'recall',
  'summary', 'keypoint', 'intuition', 'interpretation', 'historical', 'quote',
  'method',
  'algorithm', 'procedure', 'strategy', 'technique', 'trick', 'criterion', 'checklist',
].sort((a, b) => b.length - a.length);

export const STRUCTURAL_ENVIRONMENTS = [
  'itemize', 'enumerate', 'center', 'quote', 'verbatim', 'aligned', 'cases', 'array',
  'tabular', 'figure', 'table', 'minipage', 'flushleft', 'flushright',
  'align', 'align\\*', 'columns', 'colonnes', 'polylongdiv',
].sort((a, b) => b.length - a.length);

export const TEXT_MACRO_LIST = [
  'textbf', 'textit', 'texttt', 'textrm', 'textsf', 'textsc',
  'textsuperscript',
  'underline', 'overline', 'sout', 'uwave',
  'emph', 'strong',
  'red', 'blue', 'green', 'orange', 'purple', 'cyan', 'gray',
  'hl', 'hlred', 'hlblue', 'hlgreen', 'hlorange', 'hlpurple',
  'hlyellow', 'hlpink', 'hlcyan', 'hlgray', 'highlight',
  'blank', 'blanck', 'balck', 'reveal', 'hide',
  'fbox', 'doublebox', 'shadowbox', 'ovalbox', 'colorbox',
  'term', 'concept', 'keyword', 'notation', 'foreign', 'name',
  'ref', 'pageref', 'cite', 'footnote', 'label', 'eqref',
  'boxed', 'result', 'answer', 'encadre', 'question', 'qst', 'step', 'st',
  'large', 'huge', 'small', 'tiny', 'semref',
  'cline', 'multicolumn',
  'savant', 'histoire', 'motivation', 'defi', 'objectif', 'mathqst', 'itemsize', 'calcbtn',
  'qpart'
].sort((a, b) => b.length - a.length);

// --- STYLES DES MACROS ---
export const EXTENDED_TEXT_MACROS: Record<string, MacroConfig> = {
  savant: { className: 'math-savant', tag: 'span' },
  histoire: { className: 'math-history-note', tag: 'div' },
  motivation: { className: 'math-motivation', tag: 'span' },
  defi: { className: 'math-challenge', tag: 'span' },
  objectif: { className: 'math-objective', tag: 'span' },
  mathqst: { className: 'math-mathqst mathqst-colored', tag: 'span' },
  calcbtn: { className: 'calc-btn', tag: 'kbd' },
  qpart: { className: 'qpart-wrapper', tag: 'div' },
  
  textbf: { className: 'math-text-bold', tag: 'strong' },
  textit: { className: 'math-text-italic', tag: 'span', wrapQuotes: true },
  texttt: { className: 'math-text-code', tag: 'code' },
  textsuperscript: { className: 'math-text-sup', tag: 'sup' },
  underline: { className: 'math-text-underline', tag: 'span' },
  emph: { className: 'math-text-emph', tag: 'em' },
  strong: { className: 'math-text-bold', tag: 'strong' },

  // Couleurs de texte
  red: { className: 'math-text-red', tag: 'span' },
  blue: { className: 'math-text-blue', tag: 'span' },
  green: { className: 'math-text-green', tag: 'span' },
  orange: { className: 'math-text-orange', tag: 'span' },
  purple: { className: 'math-text-purple', tag: 'span' },


  // Surlignage (texte). `hl` / `highlight` : ambre par défaut ; une couleur
  // = une macro (`\hlyellow`, `\hlgreen`…), comme les couleurs de texte.
  hl: { className: 'math-highlight math-highlight-amber', tag: 'span' },
  highlight: { className: 'math-highlight math-highlight-amber', tag: 'span' },
  hlyellow: { className: 'math-highlight math-highlight-yellow', tag: 'span' },
  hlred: { className: 'math-highlight math-highlight-red', tag: 'span' },
  hlblue: { className: 'math-highlight math-highlight-blue', tag: 'span' },
  hlgreen: { className: 'math-highlight math-highlight-green', tag: 'span' },
  hlorange: { className: 'math-highlight math-highlight-orange', tag: 'span' },
  hlpurple: { className: 'math-highlight math-highlight-purple', tag: 'span' },
  hlpink: { className: 'math-highlight math-highlight-pink', tag: 'span' },
  hlcyan: { className: 'math-highlight math-highlight-cyan', tag: 'span' },
  hlgray: { className: 'math-highlight math-highlight-gray', tag: 'span' },
  
  // Interactivité
  blank: { className: 'math-blank math-interactive-blank', tag: 'span', attributes: { title: 'Cliquer pour révéler' } },
  blanck: { className: 'math-blank math-interactive-blank', tag: 'span', attributes: { title: 'Cliquer pour révéler' } },
  balck: { className: 'math-blank math-interactive-blank', tag: 'span', attributes: { title: 'Cliquer pour révéler' } },
  
  // Tailles
  large: { className: 'math-size-large', tag: 'span' },
  huge: { className: 'math-size-huge', tag: 'div' },
  small: { className: 'math-size-small', tag: 'span' },
  tiny: { className: 'math-size-tiny', tag: 'span' },

  // Référence sémantique
  semref: {
    className: 'math-semref',
    tag: 'span',
    attributes: { 'data-type': 'semantic-link' }
  },

  ref: { className: 'math-ref', tag: 'span' },
  eqref: { className: 'math-ref', tag: 'span' },
  cite: { className: 'math-cite', tag: 'span' },
  boxed: { className: 'math-boxed', tag: 'span' },
  result: { className: 'math-result', tag: 'div' },

  // Énoncé de question dans un exemple — style livre LaTeX, Crimson Pro serif
  question: {
    className: 'math-question',
    tag: 'div',
  },
  qst: {
    className: 'math-question',
    tag: 'div',
  },

  // Étape dans un bloc méthode — style brilliant.org : pastille + ligne + contenu
  step: {
    className: 'method-step',
    tag: 'div',
  },
  
  // Custom non-underlined st macro
  st: {
    className: 'math-text-st',
    tag: 'span',
  },
};
