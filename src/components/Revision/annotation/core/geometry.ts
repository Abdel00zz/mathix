import {
  BBox, InkMark, Mark, Point, ShapeMark, isImageMark, isInkMark,
} from './types';

/**
 * Géométrie pure du domaine : boîtes englobantes, chemins de figures, hit-tests,
 * aimantation, lasso et transformations de marques. Aucune dépendance de rendu :
 * ces fonctions sont partagées par le canvas, la reconnaissance de forme et les
 * tests. Toutes les coordonnées sont normalisées.
 */

// ── Boîtes englobantes ─────────────────────────────────────────────────────
export function markBBox(m: Mark): BBox {
  if (isInkMark(m)) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of m.pts) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }
  return {
    minX: Math.min(m.a[0], m.b[0]),
    minY: Math.min(m.a[1], m.b[1]),
    maxX: Math.max(m.a[0], m.b[0]),
    maxY: Math.max(m.a[1], m.b[1]),
  };
}

/** Boîte englobante d'un sous-ensemble de marques (null si vide). */
export function marksBBox(marks: Mark[], indices: number[]): BBox | null {
  if (indices.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of indices) {
    const b = markBBox(marks[i]);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

// ── Chemins de figures (segments constitutifs) ─────────────────────────────
export type ShapePath = { points: Point[]; closed?: boolean };

function regularPolygonPoints(m: ShapeMark, sides: number, startAngle = -Math.PI / 2): Point[] {
  const b = markBBox(m);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const rx = (b.maxX - b.minX) / 2;
  const ry = (b.maxY - b.minY) / 2;
  return Array.from({ length: sides }, (_, i) => {
    const angle = startAngle + (i * Math.PI * 2) / sides;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
}

/** Segments d'une figure, partagés par le rendu, le hit-test et les ancres. */
export function shapePaths(m: ShapeMark): ShapePath[] {
  const { minX, minY, maxX, maxY } = markBBox(m);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  switch (m.kind) {
    case 'line':
    case 'arrow':
      return [{ points: [m.a, m.b] }];
    case 'rect':
      return [{ points: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]], closed: true }];
    case 'triangle':
      return [{ points: [[cx, minY], [maxX, maxY], [minX, maxY]], closed: true }];
    case 'rightTriangle':
      return [{ points: [[minX, minY], [minX, maxY], [maxX, maxY]], closed: true }];
    case 'diamond':
      return [{ points: [[cx, minY], [maxX, cy], [cx, maxY], [minX, cy]], closed: true }];
    case 'parallelogram': {
      const skew = (maxX - minX) * 0.2;
      return [{ points: [[minX + skew, minY], [maxX, minY], [maxX - skew, maxY], [minX, maxY]], closed: true }];
    }
    case 'pentagon':
      return [{ points: regularPolygonPoints(m, 5), closed: true }];
    case 'hexagon':
      return [{ points: regularPolygonPoints(m, 6, 0), closed: true }];
    case 'angle': {
      const direction = m.b[0] >= m.a[0] ? 1 : -1;
      const arm = Math.max(Math.abs(m.b[0] - m.a[0]), Math.abs(m.b[1] - m.a[1]));
      return [{ points: [[m.a[0] + direction * arm, m.a[1]], m.a, m.b] }];
    }
    case 'axes':
      return [
        { points: [[minX, cy], [maxX, cy]] },
        { points: [[cx, maxY], [cx, minY]] },
      ];
    default:
      return [];
  }
}

// ── Hit-tests ──────────────────────────────────────────────────────────────
/** Distance² d'un point à un segment (coords normalisées). */
function distToSegSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** True si le point normalisé (x,y) touche la marque (tolérance normalisée). */
export function markHit(m: Mark, x: number, y: number, tol: number): boolean {
  const tolSq = tol * tol;
  if (isInkMark(m)) {
    for (let i = 1; i < m.pts.length; i++) {
      if (distToSegSq(x, y, m.pts[i - 1][0], m.pts[i - 1][1], m.pts[i][0], m.pts[i][1]) <= tolSq) return true;
    }
    if (m.pts.length === 1) return (x - m.pts[0][0]) ** 2 + (y - m.pts[0][1]) ** 2 <= tolSq;
    return false;
  }
  // Image : surface PLEINE, pas un contour — on la touche partout, sinon il
  // faudrait viser son bord au pixel pour la sélectionner ou l'effacer.
  if (isImageMark(m)) {
    const b = markBBox(m);
    return x >= b.minX - tol && x <= b.maxX + tol
      && y >= b.minY - tol && y <= b.maxY + tol;
  }
  if (m.kind === 'ellipse') {
    const cx = (m.a[0] + m.b[0]) / 2;
    const cy = (m.a[1] + m.b[1]) / 2;
    const rx = Math.abs(m.b[0] - m.a[0]) / 2 || 1e-6;
    const ry = Math.abs(m.b[1] - m.a[1]) / 2 || 1e-6;
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return Math.abs(d - 1) <= tol * 6; // anneau de tolérance
  }
  for (const path of shapePaths(m)) {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i];
      if (distToSegSq(x, y, a[0], a[1], b[0], b[1]) <= tolSq) return true;
    }
    if (path.closed && path.points.length > 2) {
      const a = path.points[path.points.length - 1], b = path.points[0];
      if (distToSegSq(x, y, a[0], a[1], b[0], b[1]) <= tolSq) return true;
    }
  }
  return false;
}

// ── Gomme partielle ────────────────────────────────────────────────────────
/**
 * Retire d'une marque d'encre les points proches de (x,y) et la scinde en
 * sous-traits autour du trou. Les figures sont effacées entièrement si touchées.
 */
export function erasePartialAt(
  marks: Mark[],
  x: number,
  y: number,
  radius: number,
  highlighterOnly = false,
): { marks: Mark[]; changed: boolean } {
  const rSq = radius * radius;
  const out: Mark[] = [];
  let changed = false;

  for (const m of marks) {
    if (highlighterOnly && (!isInkMark(m) || m.kind !== 'highlighter')) {
      out.push(m);
      continue;
    }
    if (!isInkMark(m)) {
      if (markHit(m, x, y, radius)) changed = true;
      else out.push(m);
      continue;
    }
    let hitAny = false;
    let run: InkMark['pts'] = [];
    const flush = () => {
      if (run.length >= 2) out.push({ ...m, pts: run });
      run = [];
    };
    for (const pt of m.pts) {
      if ((pt[0] - x) ** 2 + (pt[1] - y) ** 2 <= rSq) {
        hitAny = true;
        flush();
      } else {
        run.push(pt);
      }
    }
    flush();
    if (hitAny) changed = true;
  }
  return { marks: out, changed };
}

// ── Aimantation (aide géométrie) ───────────────────────────────────────────
/** Aimante un point aux intersections d'une grille de pas `step` (normalisé). */
export function snapToGrid(p: Point, step: number): Point {
  if (step <= 0) return p;
  return [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
}

/** Contraint l'extrémité b à un angle multiple de `stepDeg` depuis a. */
export function snapAngle(a: Point, b: Point, stepDeg = 15): Point {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return b;
  const step = (stepDeg * Math.PI) / 180;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return [a[0] + dist * Math.cos(ang), a[1] + dist * Math.sin(ang)];
}

/** Sommets, milieux et centre utiles à l'aimantation intelligente. */
export function markAnchors(m: Mark): Point[] {
  if (isInkMark(m)) {
    if (m.pts.length === 0) return [];
    const first = m.pts[0], last = m.pts[m.pts.length - 1];
    return [[first[0], first[1]], [last[0], last[1]]];
  }
  const box = markBBox(m);
  const center: Point = [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
  // Image : coins + milieux d'arêtes + centre — de quoi aligner une figure sur
  // un schéma importé (le cas d'usage : décalquer une construction).
  if (isImageMark(m)) {
    return [
      center,
      [box.minX, box.minY], [box.maxX, box.minY],
      [box.maxX, box.maxY], [box.minX, box.maxY],
      [center[0], box.minY], [box.maxX, center[1]],
      [center[0], box.maxY], [box.minX, center[1]],
    ];
  }
  if (m.kind === 'ellipse') {
    return [
      center,
      [center[0], box.minY],
      [box.maxX, center[1]],
      [center[0], box.maxY],
      [box.minX, center[1]],
    ];
  }
  const anchors: Point[] = [center];
  for (const path of shapePaths(m)) {
    for (let i = 0; i < path.points.length; i++) {
      const a = path.points[i];
      const b = path.points[(i + 1) % path.points.length];
      anchors.push(a);
      if (path.closed || i < path.points.length - 1) anchors.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  }
  return anchors;
}

// ── Transformations de marques ─────────────────────────────────────────────
function mapPointToBBox(point: Point, source: BBox, target: BBox): Point {
  const sw = source.maxX - source.minX;
  const sh = source.maxY - source.minY;
  const tx = sw < 1e-8 ? 0.5 : (point[0] - source.minX) / sw;
  const ty = sh < 1e-8 ? 0.5 : (point[1] - source.minY) / sh;
  return [
    target.minX + tx * (target.maxX - target.minX),
    target.minY + ty * (target.maxY - target.minY),
  ];
}

/** Redimensionne une marque depuis une boîte source vers une boîte cible. */
export function scaleMarkToBBox(m: Mark, source: BBox, target: BBox): Mark {
  if (isInkMark(m)) {
    return {
      ...m,
      pts: m.pts.map(([x, y, pressure]) => {
        const [nx, ny] = mapPointToBBox([x, y], source, target);
        return [nx, ny, pressure];
      }),
    };
  }
  return {
    ...m,
    a: mapPointToBBox(m.a, source, target),
    b: mapPointToBBox(m.b, source, target),
  };
}

/** Translation d'une marque (coordonnées normalisées). */
export function translateMark(m: Mark, dx: number, dy: number): Mark {
  if (isInkMark(m)) return { ...m, pts: m.pts.map(([x, y, p]) => [x + dx, y + dy, p]) };
  return { ...m, a: [m.a[0] + dx, m.a[1] + dy], b: [m.b[0] + dx, m.b[1] + dy] };
}

// ── Lasso ──────────────────────────────────────────────────────────────────
/** Point dans un polygone (ray casting). */
function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Indices des marques dont le centre de bbox tombe dans le lasso. */
export function marksInLasso(marks: Mark[], poly: Point[]): number[] {
  if (poly.length < 3) return [];
  const out: number[] = [];
  marks.forEach((m, i) => {
    const b = markBBox(m);
    if (pointInPolygon((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, poly)) out.push(i);
  });
  return out;
}

// ── Proportionnalité (images) ──────────────────────────────────────────────
/*
 * Le repère est normalisé à la LARGEUR : x ∈ [0,1] et y ∈ [0, hauteur/largeur].
 * Les deux axes partagent donc la MÊME unité — un carré à l'écran est un carré
 * en normalisé. Conséquence : pour un rapport natif `ratio = w/h`, il suffit
 * d'imposer `hauteurNorm = largeurNorm / ratio`. Aucune conversion de DPR ni de
 * largeur de zone n'intervient, ce qui rend la proportion stable au
 * redimensionnement de la fenêtre comme au changement d'écran.
 */

/** Rapport l/h sûr : rejette NaN, 0, l'infini et les valeurs aberrantes. */
export function safeRatio(ratio: number, fallback = 1): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback;
  // Bornes larges mais finies : une bannière 50:1 reste posable, une valeur
  // corrompue (1e9) ne fait pas exploser la géométrie.
  return Math.min(50, Math.max(0.02, ratio));
}

/**
 * Boîte centrée dans la zone, CONTENUE sans déformation ni débordement.
 * `coverage` = fraction de la zone occupée au maximum (0→1).
 */
export function fitImageBox(
  ratio: number,
  zoneHeightNorm: number,
  coverage = 0.72,
): BBox {
  const r = safeRatio(ratio);
  const maxW = Math.max(0.02, coverage);
  const maxH = Math.max(0.02, zoneHeightNorm * coverage);
  // « contain » : on prend la contrainte la plus serrée des deux axes.
  let w = maxW;
  let h = w / r;
  if (h > maxH) {
    h = maxH;
    w = h * r;
  }
  const cx = 0.5;
  const cy = zoneHeightNorm / 2;
  return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
}

/**
 * Contraint une boîte au rapport `ratio` en gardant `anchor` fixe (le coin
 * opposé à la poignée tirée). Sans ça, tirer une poignée en diagonale écrase
 * l'image ; avec, on obtient le comportement attendu d'un éditeur.
 */
export function constrainBoxToRatio(box: BBox, ratio: number, anchor: Point): BBox {
  const r = safeRatio(ratio);
  const w = Math.abs(box.maxX - box.minX);
  const h = Math.abs(box.maxY - box.minY);
  // On suit la dimension la plus « tirée » pour que le geste reste naturel.
  const useWidth = w / r >= h;
  const nw = useWidth ? w : h * r;
  const nh = useWidth ? w / r : h;
  const towardMaxX = box.maxX > anchor[0] || box.minX >= anchor[0];
  const towardMaxY = box.maxY > anchor[1] || box.minY >= anchor[1];
  const x2 = anchor[0] + (towardMaxX ? nw : -nw);
  const y2 = anchor[1] + (towardMaxY ? nh : -nh);
  return {
    minX: Math.min(anchor[0], x2),
    minY: Math.min(anchor[1], y2),
    maxX: Math.max(anchor[0], x2),
    maxY: Math.max(anchor[1], y2),
  };
}
