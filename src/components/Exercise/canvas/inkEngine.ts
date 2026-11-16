import type { Point, ShapeType } from './types';
export { calibratePressure, type PressureSample } from '../../../utils/inkPressure';
export { isPenPointerType } from '../../../utils/penPointer';

function pointToSegmentDistanceSquared(point: Point, start: Point, end: Point): { distance: number; ratio: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { distance: (point.x - start.x) ** 2 + (point.y - start.y) ** 2, ratio: 0 };
  }
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projectedX = start.x + ratio * dx;
  const projectedY = start.y + ratio * dy;
  return {
    distance: (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2,
    ratio,
  };
}

/**
 * Simplification Ramer–Douglas–Peucker itérative, enrichie par la pression.
 * Elle réduit les points redondants sans effacer les variations d'épaisseur
 * d'un vrai stylet et évite la récursion sur les très longs tracés.
 */
export function simplifyPoints(points: Point[], tolerance: number, pressureScale = 0): Point[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  const toleranceSquared = tolerance * tolerance;

  // Préfiltre radial O(n) : retire les échantillons quasi identiques avant RDP.
  const radial: Point[] = [points[0]];
  const radialThresholdSquared = toleranceSquared * 0.25;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const previous = radial[radial.length - 1];
    const spatial = (point.x - previous.x) ** 2 + (point.y - previous.y) ** 2;
    const pressureDistance = Math.abs(point.pressure - previous.pressure) * pressureScale;
    if (spatial >= radialThresholdSquared || pressureDistance >= tolerance * 0.5) radial.push(point);
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
      const expectedPressure = start.pressure + (end.pressure - start.pressure) * spatial.ratio;
      const pressureDistance = (point.pressure - expectedPressure) * pressureScale;
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

export function constrainShapePoint(
  start: Point,
  current: Point,
  shape: ShapeType,
  options: { snapGrid: boolean; angleSnap: boolean; angleStep: 15 | 30 | 45; regularShapes: boolean },
): Point {
  let x = options.snapGrid ? Math.round(current.x / 24) * 24 : current.x;
  let y = options.snapGrid ? Math.round(current.y / 24) * 24 : current.y;

  if (options.angleSnap && (shape === 'line' || shape === 'arrow' || shape === 'double-arrow' || shape === 'angle')) {
    const distance = Math.hypot(x - start.x, y - start.y);
    const step = options.angleStep * Math.PI / 180;
    const angle = Math.round(Math.atan2(y - start.y, x - start.x) / step) * step;
    x = start.x + Math.cos(angle) * distance;
    y = start.y + Math.sin(angle) * distance;
  }

  if (options.regularShapes && ['rectangle', 'circle', 'triangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon'].includes(shape)) {
    const side = Math.max(Math.abs(x - start.x), Math.abs(y - start.y));
    x = start.x + (x >= start.x ? side : -side);
    y = start.y + (y >= start.y ? side : -side);
  }

  return { x, y, pressure: current.pressure };
}
