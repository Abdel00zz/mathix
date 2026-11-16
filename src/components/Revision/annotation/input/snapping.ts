import type { Point, ShapeKind } from '../core/types';
import { isRegularShapeKind } from '../core/types';
import { snapAngle, snapToGrid } from '../core/geometry';
import { AnchorIndex, nearestAnchor } from '../core/anchorIndex';

/**
 * Aimantation d'un point et d'une figure, pures. Le canvas fournit la
 * configuration courante (préférences + index d'ancres + largeur de rendu) ;
 * ces fonctions ne lisent aucun état global.
 */
export interface SnapConfig {
  smartSnap: boolean;
  snapGrid: boolean;
  angleSnap: boolean;
  angleStep: 15 | 30 | 45;
  /** Pas de la grille, normalisé (GRID_PX / largeur). */
  gridStep: number;
  /** Distance d'accrochage aux ancres, normalisée (ANCHOR_SNAP_PX / largeur). */
  anchorSnap: number;
  anchorIndex: AnchorIndex;
}

export function snapPoint(point: Point, cfg: SnapConfig): Point {
  if (cfg.smartSnap) {
    const anchor = nearestAnchor(point, cfg.anchorIndex, cfg.anchorSnap);
    if (anchor) return anchor.point;
  }
  return cfg.snapGrid ? snapToGrid(point, cfg.gridStep) : point;
}

/** Applique aimantation, angles contraints et proportions régulières. */
export function snapShape(
  kind: ShapeKind,
  a: Point,
  b: Point,
  regular: boolean,
  cfg: SnapConfig,
): { a: Point; b: Point } {
  const na = snapPoint(a, cfg);
  let nb = snapPoint(b, cfg);
  if (cfg.angleSnap && (kind === 'line' || kind === 'arrow' || kind === 'angle')) {
    nb = snapAngle(na, nb, cfg.angleStep);
  }
  if (regular && isRegularShapeKind(kind)) {
    const dx = nb[0] - na[0], dy = nb[1] - na[1];
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx === 0 ? 1 : Math.sign(dx);
    const sy = dy === 0 ? 1 : Math.sign(dy);
    nb = [na[0] + sx * side, na[1] + sy * side];
  }
  return { a: na, b: nb };
}
