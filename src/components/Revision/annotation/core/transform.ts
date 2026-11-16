import type { Point } from './types';

/**
 * Repère de rendu : les coordonnées normalisées (fraction de la largeur du
 * contenu) sont dénormalisées par `w`, puis translatées par l'origine écran du
 * contenu. Purement arithmétique — aucune lecture du DOM ici, les mesures sont
 * faites en amont et passées en paramètre.
 */
export interface Transform {
  /** Origine écran X du contenu (px). */
  ox: number;
  /** Origine écran Y du contenu (px, tient compte du scroll). */
  oy: number;
  /** Largeur du contenu (px) — base de dénormalisation. */
  w: number;
}

export const toScreen = (t: Transform, p: Point): Point => [t.ox + p[0] * t.w, t.oy + p[1] * t.w];

export const fromScreen = (t: Transform, x: number, y: number): Point => [
  (x - t.ox) / t.w,
  (y - t.oy) / t.w,
];
