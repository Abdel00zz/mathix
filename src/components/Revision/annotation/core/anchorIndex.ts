import type { Point } from './types';

/**
 * Index spatial des points d'aimantation, en grille de hachage. Construit une
 * fois par changement de marques puis interrogé à chaque mouvement du stylet :
 * une recherche linéaire sur tous les sommets ferait chuter la fréquence de
 * tracé dès que la fiche se remplit. Pur, sans DOM.
 */
const CELL = 0.04;

export type AnchorIndex = Map<string, Point[]>;

const key = (x: number, y: number): string => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;

export function buildAnchorIndex(anchors: Point[]): AnchorIndex {
  const index: AnchorIndex = new Map();
  for (const anchor of anchors) {
    const k = key(anchor[0], anchor[1]);
    const bucket = index.get(k);
    if (bucket) bucket.push(anchor);
    else index.set(k, [anchor]);
  }
  return index;
}

/** Ancres à moins de `maxDistance` du point (coordonnées normalisées). */
export function anchorsNear(point: Point, index: AnchorIndex, maxDistance: number): Point[] {
  const result: Point[] = [];
  const range = Math.ceil(maxDistance / CELL);
  const cx = Math.floor(point[0] / CELL);
  const cy = Math.floor(point[1] / CELL);
  for (let x = cx - range; x <= cx + range; x++) {
    for (let y = cy - range; y <= cy + range; y++) {
      const bucket = index.get(`${x}:${y}`);
      if (!bucket) continue;
      for (const anchor of bucket) {
        if (Math.hypot(anchor[0] - point[0], anchor[1] - point[1]) <= maxDistance) {
          result.push(anchor);
        }
      }
    }
  }
  return result;
}

/** Ancre la plus proche du point, ou null au-delà de `maxDistance`. */
export function nearestAnchor(
  point: Point,
  index: AnchorIndex,
  maxDistance: number,
): { point: Point; distance: number } | null {
  let best: { point: Point; distance: number } | null = null;
  for (const anchor of anchorsNear(point, index, maxDistance)) {
    const distance = Math.hypot(anchor[0] - point[0], anchor[1] - point[1]);
    if (!best || distance < best.distance) best = { point: anchor, distance };
  }
  return best;
}
