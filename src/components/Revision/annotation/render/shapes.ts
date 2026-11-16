import type { Mark, Point, ShapeMark } from '../core/types';
import { isImageMark, isInkMark } from '../core/types';
import { renderImage } from './images';
import { shapePaths } from '../core/geometry';
import { Transform, toScreen } from '../core/transform';
import { renderInk } from './ink';
import { drawSketchy } from './sketch';

/** Rendu des figures géométriques (vecteur net ou main levée) + dispatch de marque. */

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const head = Math.max(10, size * 3.2);
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - head * Math.cos(angle - Math.PI / 7), to[1] - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to[0] - head * Math.cos(angle + Math.PI / 7), to[1] - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

/**
 * @param sketchy Tracé main levée (Rough.js) au lieu du vecteur net. Les têtes
 *   de flèche, cotes et libellés d'axes restent nets dans les deux cas : ils
 *   portent du sens, ils ne sont pas du décor.
 */
export function renderShape(ctx: CanvasRenderingContext2D, t: Transform, m: ShapeMark, sketchy = false) {
  const [ax, ay] = toScreen(t, m.a);
  const [bx, by] = toScreen(t, m.b);
  ctx.save();
  ctx.strokeStyle = m.color;
  ctx.fillStyle = m.color;
  ctx.lineWidth = m.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (sketchy) {
    drawSketchy(ctx, t, m);
  } else if (m.kind === 'ellipse') {
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    for (const path of shapePaths(m)) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      path.points.forEach((point, index) => {
        const [x, y] = toScreen(t, point);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (path.closed) ctx.closePath();
      ctx.stroke();
    }
  }

  if (m.kind !== 'ellipse') {
    if (m.kind === 'arrow') drawArrowHead(ctx, [ax, ay], [bx, by], m.size);
    if (m.kind === 'axes') {
      const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by), maxY = Math.max(ay, by);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      drawArrowHead(ctx, [minX, cy], [maxX, cy], m.size);
      drawArrowHead(ctx, [cx, maxY], [cx, minY], m.size);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('x', maxX - 5, cy - 7);
      ctx.fillText('y', cx + 7, minY + 10);
    }
    if (m.kind === 'angle') {
      const direction = bx >= ax ? 1 : -1;
      const angleA = direction > 0 ? 0 : Math.PI;
      const angleB = Math.atan2(by - ay, bx - ax);
      let delta = angleB - angleA;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const radius = Math.min(28, Math.max(13, Math.hypot(bx - ax, by - ay) * 0.22));
      ctx.beginPath();
      ctx.arc(ax, ay, radius, angleA, angleA + delta, delta < 0);
      ctx.stroke();
      const mid = angleA + delta / 2;
      const degrees = Math.round(Math.abs(delta) * 180 / Math.PI);
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${degrees}°`, ax + Math.cos(mid) * (radius + 12) - 8, ay + Math.sin(mid) * (radius + 12) + 4);
    }
  }
  ctx.restore();
}

/** Dispatch : encre ou figure. */
export function renderMark(ctx: CanvasRenderingContext2D, t: Transform, m: Mark, sketchy = false) {
  if (isInkMark(m)) renderInk(ctx, t, m);
  else if (isImageMark(m)) renderImage(ctx, t, m);
  else renderShape(ctx, t, m, sketchy);
}
