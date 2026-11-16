import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable, Options as RoughOptions } from 'roughjs/bin/core';
import type { Point, ShapeMark } from '../core/types';
import { markBBox, shapePaths } from '../core/geometry';
import { Transform, toScreen } from '../core/transform';

/**
 * Tracé « main levée » des figures (Rough.js), qui redessine chaque figure avec
 * un tremblement pseudo-aléatoire. Deux contraintes le rendent utilisable :
 *
 * 1. DÉTERMINISME. Sans graine stable, le tremblement se retirerait au sort à
 *    chaque repeint et les figures frémiraient. La graine est dérivée par
 *    hachage du contenu de la marque — rien à migrer dans le stockage.
 * 2. COÛT. La génération est la partie chère. Les figures sont générées dans un
 *    repère LOCAL (origine au coin de leur boîte) puis positionnées par
 *    `translate` : le cache survit au scroll, qui ne change que l'origine.
 */
const CACHE_MAX = 240;
const roughCanvases = new WeakMap<HTMLCanvasElement, RoughCanvas>();
const drawablesCache = new Map<string, Drawable[]>();
// Générateur sans état entre appels (la graine passe en option) : une instance.
const roughGen = rough.generator();

function roughFor(ctx: CanvasRenderingContext2D): RoughCanvas {
  const canvas = ctx.canvas as HTMLCanvasElement;
  let rc = roughCanvases.get(canvas);
  if (!rc) {
    rc = rough.canvas(canvas);
    roughCanvases.set(canvas, rc);
  }
  return rc;
}

/** FNV-1a — hachage stable d'une signature de marque vers une graine entière. */
function seedOf(m: ShapeMark): number {
  const sig = `${m.kind}|${m.color}|${m.size}|${m.a[0].toFixed(4)}|${m.a[1].toFixed(4)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2 ** 31;
}

function roughOpts(m: ShapeMark, seed: number): RoughOptions {
  return {
    stroke: m.color,
    strokeWidth: m.size,
    // Tremblement contenu : une figure de maths doit rester lisible et mesurable.
    roughness: 1.05,
    bowing: 0.85,
    // Ancre les sommets : les angles d'un triangle ne doivent pas se promener.
    preserveVertices: true,
    seed,
  };
}

/** Drawables d'une figure, en repère local, mémoïsés. */
function sketchyDrawables(m: ShapeMark, t: Transform, ox: number, oy: number): Drawable[] {
  const seed = seedOf(m);
  const opts = roughOpts(m, seed);
  const local = (p: Point): [number, number] => {
    const [x, y] = toScreen(t, p);
    return [x - ox, y - oy];
  };

  let key: string;
  let build: () => Drawable[];

  if (m.kind === 'ellipse') {
    const [x0, y0] = local(m.a);
    const [x1, y1] = local(m.b);
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    key = `e|${seed}|${m.size}|${Math.round(w)}|${Math.round(h)}`;
    build = () => [roughGen.ellipse((x0 + x1) / 2, (y0 + y1) / 2, w, h, opts)];
  } else {
    const paths = shapePaths(m).filter((p) => p.points.length >= 2);
    const localPaths = paths.map((p) => ({
      closed: !!p.closed,
      pts: p.points.map(local) as [number, number][],
    }));
    key = `p|${seed}|${m.size}|` + localPaths
      .map((p) => (p.closed ? 'c' : 'o') + p.pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(';'))
      .join('/');
    build = () => localPaths.map((p) => (p.closed
      ? roughGen.polygon(p.pts, opts)
      : roughGen.linearPath(p.pts, opts)));
  }

  let drawables = drawablesCache.get(key);
  if (!drawables) {
    drawables = build();
    if (drawablesCache.size >= CACHE_MAX) {
      // Éviction FIFO : le cache suit le dessin visible, pas tout l'historique.
      const oldest = drawablesCache.keys().next().value;
      if (oldest !== undefined) drawablesCache.delete(oldest);
    }
    drawablesCache.set(key, drawables);
  }
  return drawables;
}

/** Dessine la figure en mode main levée, positionnée par translation. */
export function drawSketchy(ctx: CanvasRenderingContext2D, t: Transform, m: ShapeMark) {
  const box = markBBox(m);
  const [ox, oy] = toScreen(t, [box.minX, box.minY]);
  const drawables = sketchyDrawables(m, t, ox, oy);
  ctx.save();
  ctx.translate(ox, oy);
  const rc = roughFor(ctx);
  for (const d of drawables) rc.draw(d);
  ctx.restore();
}
