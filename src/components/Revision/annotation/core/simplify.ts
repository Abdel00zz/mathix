import type { InkPoint } from './types';

/**
 * Simplification Ramer–Douglas–Peucker itérative, enrichie par la pression.
 *
 * Elle réduit les points redondants (segments quasi alignés) sans effacer les
 * variations d'épaisseur d'un vrai stylet, et sans récursion (les très longs
 * tracés restent sûrs). Un préfiltre radial O(n) retire d'abord les échantillons
 * quasi identiques.
 *
 * Les coordonnées sont normalisées (fraction de largeur) ; la tolérance doit
 * donc être exprimée dans ce même repère.
 */

function pointToSegmentDistanceSquared(
  p: InkPoint,
  a: InkPoint,
  b: InkPoint,
): { distance: number; ratio: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { distance: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2, ratio: 0 };
  }
  const ratio = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  const projectedX = a[0] + ratio * dx;
  const projectedY = a[1] + ratio * dy;
  return { distance: (p[0] - projectedX) ** 2 + (p[1] - projectedY) ** 2, ratio };
}

export function simplifyInkPoints(
  points: InkPoint[],
  tolerance: number,
  pressureScale = 0,
): InkPoint[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  const toleranceSquared = tolerance * tolerance;

  // Préfiltre radial O(n) : retire les échantillons quasi identiques avant RDP.
  const radial: InkPoint[] = [points[0]];
  const radialThresholdSquared = toleranceSquared * 0.25;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const previous = radial[radial.length - 1];
    const spatial = (point[0] - previous[0]) ** 2 + (point[1] - previous[1]) ** 2;
    const pressureDistance = Math.abs(point[2] - previous[2]) * pressureScale;
    if (spatial >= radialThresholdSquared || pressureDistance >= tolerance * 0.5) {
      radial.push(point);
    }
  }
  radial.push(points[points.length - 1]);
  if (radial.length <= 2) return radial;

  const keep = new Uint8Array(radial.length);
  keep[0] = 1;
  keep[radial.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, radial.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    const start = radial[startIndex];
    const end = radial[endIndex];
    let farthestIndex = -1;
    let farthestDistance = toleranceSquared;

    for (let index = startIndex + 1; index < endIndex; index++) {
      const point = radial[index];
      const spatial = pointToSegmentDistanceSquared(point, start, end);
      const expectedPressure = start[2] + (end[2] - start[2]) * spatial.ratio;
      const pressureDistance = (point[2] - expectedPressure) * pressureScale;
      const effectiveDistance = Math.max(spatial.distance, pressureDistance * pressureDistance);
      if (effectiveDistance > farthestDistance) {
        farthestDistance = effectiveDistance;
        farthestIndex = index;
      }
    }

    if (farthestIndex !== -1) {
      keep[farthestIndex] = 1;
      stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }

  return radial.filter((_, index) => keep[index] === 1);
}
