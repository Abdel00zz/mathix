import type { InkMark, Point } from './types';

/**
 * Reconnaissance de forme : « dessiner + maintenir → figure parfaite ». Analyse
 * un tracé d'encre et retourne une ligne, un rectangle ou une ellipse si le
 * tracé y ressemble, sinon null. Coordonnées normalisées, sans état ni DOM.
 */
export type RecognizedShape = { kind: 'line' | 'rect' | 'ellipse'; a: Point; b: Point };

export function recognizeShape(pts: InkMark['pts']): RecognizedShape | null {
  if (pts.length < 8) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX, h = maxY - minY;
  const diag = Math.hypot(w, h);
  if (diag < 0.05) return null; // trop petit

  const s = pts[0], e = pts[pts.length - 1];
  const chord = Math.hypot(e[0] - s[0], e[1] - s[1]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (len < 1e-6) return null;

  // Ligne droite : le tracé est proche de sa corde.
  if (chord / len > 0.9 && chord > 0.04) {
    return { kind: 'line', a: [s[0], s[1]], b: [e[0], e[1]] };
  }

  // Figure fermée : les extrémités se rejoignent.
  if (chord > 0.32 * diag) return null;

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rx = Math.max(w / 2, 1e-4), ry = Math.max(h / 2, 1e-4);
  let ellErr = 0, rectErr = 0;
  for (const [x, y] of pts) {
    ellErr += Math.abs(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 - 1);
    const dEdge = Math.min(Math.abs(x - minX), Math.abs(x - maxX), Math.abs(y - minY), Math.abs(y - maxY));
    rectErr += dEdge / diag;
  }
  ellErr /= pts.length;
  rectErr /= pts.length;

  // Léger biais vers l'ellipse (cercles dessinés à main levée très courants).
  return ellErr <= rectErr * 1.25
    ? { kind: 'ellipse', a: [minX, minY], b: [maxX, maxY] }
    : { kind: 'rect', a: [minX, minY], b: [maxX, maxY] };
}
