import { formatNumberedLabel } from '../utils/format';
import { ACCENT_BY_TYPE } from './revisionPalette';

// ═══════════════════════════════════════════════════════════════════
// THEME: ÉLÉGANCE COGNITIVE
// ═══════════════════════════════════════════════════════════════════

// Corps de texte - interface Quicksand homogène

// Texte des réponses révélées - même système Fira

// Titre après le badge - display Fredoka
export const BLOCK_TITLE_CLS = 'math-block-title';

const _noop = (..._args: unknown[]) => '';
const UNIFIED_ENV_TEXT_BASE = 'typo-ui font-normal leading-[inherit] antialiased text-left';
const UNIFIED_ENV_TEXT_JUSTIFY = UNIFIED_ENV_TEXT_BASE;

export interface EnvironmentStyle {
  containerClass: string;
  contentClass: string;
  headerClass?: string;
  headerHTML: (label: string, number?: number) => string;
  footerHTML?: () => string;
}

// ─── BASE DES BLOCS — Premium & Modern ───
const REVEALABLE_BASE = 'revision-env revision-env-reveal';
const REVEALABLE_BASE_SQUARE = REVEALABLE_BASE;
const STATIC_BASE = 'revision-env revision-env-static';
const APPLICATION_ENV: EnvironmentStyle = {
  containerClass: 'revision-env revision-env-application',
  contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
  headerHTML: (l, n) => _noop(l, n),
};

const EXPLORATION_ENV: EnvironmentStyle = {
  containerClass: 'revision-env revision-env-plain',
  contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
  headerHTML: (l, n) => _noop(l, n),
};

// Badge inline pour les headerHTML (style identique à BlockHeader)
export const ENV_STYLES: Record<string, EnvironmentStyle> = {

  definition: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  theorem: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  proposition: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  property: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  lemma: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  corollary: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  consequence: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  method: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  strategy: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  technique: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  rappel: {
    containerClass: 'revision-env revision-env-rappel',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
    headerHTML: (l, n) => _noop(l, n),
  },

  application: APPLICATION_ENV,
  example: {
    containerClass: 'revision-env revision-env-example',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
    headerHTML: (l, n) => _noop(l, n),
  },

  exploration: EXPLORATION_ENV,

  remark: {
    containerClass: 'revision-env revision-env-plain',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
    headerHTML: (l, n) => `<div class="math-env-header math-env-header-remark"><span class="math-env-badge math-env-badge-remark">${formatNumberedLabel(l, n)}</span></div>`,
  },

  note: {
    containerClass: STATIC_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
    headerHTML: () => `<div class="math-env-header math-env-header-note"><span class="math-env-badge math-env-badge-note">Note</span></div>`,
  },

  warning: {
    containerClass: 'revision-env revision-env-warning',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#9f1239]`,
    headerHTML: () => ``,
  },

  proof: {
    containerClass: 'revision-env revision-env-plain',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#52606D] italic`,
    headerHTML: (l, n) => _noop(l, n),
    footerHTML: () => `<div class="math-proof-footer"><span class="math-proof-square"></span></div>`,
  },

  intuition: {
    containerClass: 'revision-env revision-env-plain',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D]`,
    headerHTML: () => '',
  },

  summary: {
    containerClass: 'revision-env revision-env-static',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#53441F]`,
    headerHTML: () => '',
  },

  intro: {
    containerClass: 'revision-env revision-env-plain',
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-[#34414D] [overflow-wrap:break-word]`,
    headerHTML: () => '',
  },

  problem: {
    containerClass: REVEALABLE_BASE_SQUARE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  hint: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  },

  solution: {
    containerClass: REVEALABLE_BASE,
    contentClass: `${UNIFIED_ENV_TEXT_JUSTIFY} text-slate-700`,
    headerHTML: (l, n) => _noop(l, n),
  }
};

export interface ThemeConfig {
  text: string;
  background: string;
  mathText: string;
}

/** Thème unique du rendu math. L'application est en clair uniquement. */
export const THEME_LIGHT: ThemeConfig = {
  text: 'math-renderer-theme-light',
  background: 'bg-ivoire',
  mathText: 'math-inline-theme-light',
};

export const FONT_SIZES = {
  xs: 'math-renderer-size-xs',
  sm: 'math-renderer-size-sm',
  base: 'math-renderer-size-base',
  lg: 'math-renderer-size-lg',
  xl: 'math-renderer-size-xl',
  '2xl': 'math-renderer-size-2xl',
};

export const TEXT_MACROS: Record<string, string> = {
  textbf: 'math-text-bold',
  textit: 'math-text-italic',
  underline: 'math-text-underline',
  blank: 'math-blank math-interactive-blank',
};

export const ENV_LABELS: Record<string, string> = {
  definition: 'Définition',
  theorem: 'Théorème',
  proposition: 'Proposition',
  cela_permet_de: 'Cela permet de :',
  property: 'Propriété',
  lemma: 'Lemme',
  corollary: 'Corollaire',
  consequence: 'Conséquence',
  technique: 'Technique',
  rappel: 'Rappel',
  method: 'Méthode',
  strategy: 'Stratégie',
  intuition: 'Intuition',
  summary: 'En Résumé',
  application: 'Exercice d\u2019application',
  example: 'Exemple',
  exploration: 'Exploration',
  warning: 'Attention',
  remark: 'Remarque',
  note: 'Note',
  proof: 'Preuve',
  intro: '',
  problem: 'Problème',
  hint: 'Indice',
  solution: 'Solution'
};

// Accents dérivés du système de palette centralisé (4 familles pastel).
// Voir styles/revisionPalette.ts pour ajuster les couleurs.
export const ENV_COLORS: Record<string, string> = {
  ...ACCENT_BY_TYPE,
  default: '#64748B',
};
