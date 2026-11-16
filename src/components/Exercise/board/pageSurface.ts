import type { CSSProperties } from 'react';

/** Modèles de page : ceux de la barre d'outils (`BACKGROUND_STYLES`). */
export type PageStyle = 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
/** Couleurs de fond : celles de la barre d'outils (`BACKGROUND_COLORS`). */
export type PageColor = 'white' | 'black' | 'green' | 'blue' | 'cream' | '';

const SURFACES: Record<Exclude<PageColor, ''>, string> = {
  white: '#ffffff',
  black: '#0f172a',
  green: '#14532d',
  blue: '#1e3a8a',
  cream: '#fef3c7',
};

/** Interligne Seyes (mm → px à ~96 dpi, arrondi à un compte entier de lignes). */
const SEYES_SUB = 8;
const SEYES_MAIN = SEYES_SUB * 4;
const SEYES_MARGIN = 64;
const SLATE_LINE = 28;
const GRID_STEP = 20;
const DOT_STEP = 24;

export const isDarkSurface = (color: PageColor): boolean =>
  color === 'black' || color === 'green' || color === 'blue';

/**
 * Réglure d'une page, dessinée par le PARENT du canvas — `DrawingCanvas` ne
 * peint jamais son fond (cf. `InlineCanvasZone`), il ne fait que remonter le
 * style choisi à la barre d'outils.
 *
 * Les recettes d'impression (`print.css`, `.print-answer-box[data-style]`) sont
 * sous `@media print` et en millimètres : elles ne peuvent pas être réutilisées
 * à l'écran. On garde les mêmes intentions visuelles, en pixels.
 */
export function pageSurface(style: PageStyle, color: PageColor): CSSProperties {
  const backgroundColor = SURFACES[color || 'white'];
  const dark = isDarkSurface(color);
  const line = dark ? 'rgba(226,232,240,0.34)' : 'rgba(100,116,139,0.34)';
  const faint = dark ? 'rgba(226,232,240,0.16)' : 'rgba(100,116,139,0.16)';
  const margin = dark ? 'rgba(248,113,113,0.5)' : 'rgba(239,68,68,0.4)';

  switch (style) {
    // Cahier Seyes : lignes maîtresses + 3 interlignes, marge verticale rouge.
    case 'seyes':
      return {
        backgroundColor,
        backgroundImage: [
          `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${faint} 1px, transparent 1px)`,
          `linear-gradient(to right, ${margin} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: `100% ${SEYES_MAIN}px, 100% ${SEYES_SUB}px, 100% 100%`,
        backgroundPosition: `0 0, 0 0, ${SEYES_MARGIN}px 0`,
        backgroundRepeat: 'repeat, repeat, no-repeat',
      };

    // Ardoise / grand cahier : lignes simples largement espacées.
    case 'slate':
      return {
        backgroundColor,
        backgroundImage: `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `100% ${SLATE_LINE}px`,
      };

    case 'grid':
      return {
        backgroundColor,
        backgroundImage: [
          `linear-gradient(to right, ${line} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        ].join(', '),
        backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
      };

    case 'dotted':
      return {
        backgroundColor,
        backgroundImage: `radial-gradient(${line} 1px, transparent 1.2px)`,
        backgroundSize: `${DOT_STEP}px ${DOT_STEP}px`,
      };

    case 'blank':
    default:
      return { backgroundColor };
  }
}

/** Couleur de fond par défaut d'un modèle : l'ardoise n'a de sens qu'en sombre. */
export const defaultColorFor = (style: PageStyle): PageColor => (style === 'slate' ? 'black' : 'white');
