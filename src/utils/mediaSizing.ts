/**
 * Table unique des dimensions par défaut des figures.
 *
 * Deux gabarits : `compact` pour un exercice d'application ou d'exercice (la
 * figure accompagne un énoncé qu'elle ne doit pas écraser) et `regular` pour
 * une fiche de cours, qui respire. Une `width` explicite dans le JSON gagne
 * toujours sur ces valeurs.
 *
 * Les classes Tailwind sont écrites en entier : le balayage des sources les
 * retrouve, aucune n'est construite dynamiquement.
 */
export interface SizingPair<T> { compact: T; regular: T }

export const pickSizing = <T>(pair: SizingPair<T>, compact: boolean): T => (compact ? pair.compact : pair.regular);

export const MEDIA_SIZING = {
  /** Colonne latérale (position left/right) : largeur de la colonne média. */
  sideColumn: { compact: 'minmax(0, 28%)', regular: 'minmax(0, 32%)' } as SizingPair<string>,
  /** Hauteur minimale de la grille à colonne latérale. */
  sideColumnMinHeight: { compact: 'min-h-[160px]', regular: 'min-h-[200px]' } as SizingPair<string>,
  /** Habillage (float-left/right) d'une figure seule. */
  floatClass: {
    compact: 'w-[42%] md:w-[30%] max-w-[300px]',
    regular: 'w-[45%] md:w-[35%] max-w-[340px]',
  } as SizingPair<string>,
  /** En ligne (inline/inline-right) : largeur maximale sans `width` explicite. */
  inlineMaxWidth: { compact: '150px', regular: '160px' } as SizingPair<string>,
  /** Empilée au-dessus/en dessous. Un énoncé d'application posé en haut reste une vignette. */
  stackedClass: {
    compactTop: 'w-4/5 md:w-2/5 max-w-sm',
    regular: 'w-4/5 md:w-1/2 max-w-md',
  },
  /** Galerie (plusieurs figures autour d'un bloc de texte). */
  gallery: {
    sideColumn: { compact: 'minmax(0, 24%)', regular: 'minmax(0, 26%)' } as SizingPair<string>,
    floatWidth: { compact: '30%', regular: '35%' } as SizingPair<string>,
    floatMaxWidthClass: { compact: 'max-w-[38%]', regular: 'max-w-[45%]' } as SizingPair<string>,
    /** Largeur d'une figure dans une rangée haut/bas. */
    rowItemWidth: 240,
  },
} as const;

/** Coefficient qui donne aux libellés d'un SVG la même taille apparente d'une figure à l'autre. */
const SVG_WIDTH_PERCENT_PER_VIEWBOX_PX = 0.1468;

/**
 * Largeur conseillée (en %) d'une figure SVG : son texte intérieur est en pixels,
 * donc la largeur d'affichage fixe la taille apparente des libellés.
 */
export function svgWidthPercent(viewBoxWidth: number): number {
  if (!Number.isFinite(viewBoxWidth) || viewBoxWidth <= 0) return 100;
  return Math.min(100, Math.round(viewBoxWidth * SVG_WIDTH_PERCENT_PER_VIEWBOX_PX * 10) / 10);
}

/** Rapport l/h déduit de dimensions connues, ou null si elles sont absentes ou invalides. */
export function knownAspectRatio(width?: number, height?: number): number | null {
  if (!width || !height) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}
