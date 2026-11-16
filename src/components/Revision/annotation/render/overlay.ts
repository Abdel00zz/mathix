import type { InkMark, Mark, Point } from '../core/types';
import { isShapeKind } from '../core/types';
import { marksBBox, scaleMarkToBBox, translateMark } from '../core/geometry';
import { AnchorIndex, anchorsNear } from '../core/anchorIndex';
import { Transform, toScreen } from '../core/transform';
import { SnapConfig, snapShape } from '../input/snapping';
import { Gesture, resizeTargetBBox } from '../input/gestures';
import { CM_PER_CSS_PX, HANDLE, RESIZE_HANDLE } from '../input/constants';
import { renderInk } from './ink';
import { renderMark, renderShape } from './shapes';

/**
 * Base dynamique : rendu des marques quand un geste les modifie en direct
 * (gomme, déplacement, redimensionnement) et interdit l'usage du cache statique.
 */
export function drawDynamicBase(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  gesture: Exclude<Gesture, null>,
  marks: Mark[],
  sketchy: boolean,
) {
  const list = gesture.type === 'erasePartial' ? gesture.working : marks;
  const erased = gesture.type === 'eraseStroke' ? gesture.removed : null;
  const moveDelta = gesture.type === 'move' ? gesture.delta : null;
  const resizeBox = gesture.type === 'resize' ? resizeTargetBBox(gesture.source, gesture.handle, gesture.current) : null;
  const selection = gesture.type === 'move' || gesture.type === 'resize' ? gesture.selection : null;
  const selectedSet = selection && selection.length ? new Set(selection) : null;
  for (let i = 0; i < list.length; i++) {
    if (erased?.has(i)) continue;
    let m = list[i];
    if (moveDelta && selectedSet?.has(i)) m = translateMark(m, moveDelta[0], moveDelta[1]);
    if (resizeBox && gesture.type === 'resize' && selectedSet?.has(i)) m = scaleMarkToBBox(m, gesture.source, resizeBox);
    renderMark(ctx, t, m, sketchy);
  }
}

/**
 * Rendu de la couche « chrome » du canvas : aperçu du geste en cours, guides
 * d'aimantation, cadre de sélection et curseur de survol. Séparé du rendu des
 * marques persistées (ink/shapes) et de l'orchestration React.
 */
interface OverlayProps {
  tool: import('../core/types').AnnotationTool;
  color: string;
  size: number;
  eraserSize: number;
  eraserAutoSize: boolean;
  showMeasurements: boolean;
  smartSnap: boolean;
  sketchyShapes: boolean;
}

interface OverlayInput {
  ctx: CanvasRenderingContext2D;
  t: Transform;
  cssWidth: number;
  cssHeight: number;
  gesture: Gesture;
  marks: Mark[];
  selection: number[];
  hover: { point: Point; pressure: number; tool?: 'eraser' } | null;
  anchorIndex: AnchorIndex;
  snap: SnapConfig;
  props: OverlayProps;
  anchorGuidePx: number;
}

/** Aperçu du geste transitoire (ink/forme reconnue, figure, lasso) + cotes. */
function drawGesturePreview(input: OverlayInput) {
  const { ctx, t, gesture: g, snap, props } = input;
  if (!g) return;
  if (g.type === 'ink') {
    if (g.snap) {
      // Aperçu de la forme reconnue (le tracé « snappe »).
      renderShape(ctx, t, {
        kind: g.snap.kind, a: g.snap.a, b: g.snap.b, color: g.style.color, size: g.style.size,
      }, props.sketchyShapes);
    } else {
      // `live: true` : le bout ne chasse pas la pointe. Le trait validé sera
      // re-rendu avec `last: true`. Aperçu strictement sur les points réels
      // (aucune extrapolation) → le trait ne devance jamais la pointe du stylet.
      renderInk(ctx, t, {
        kind: g.style.kind,
        pts: g.pts,
        color: g.style.color,
        size: g.style.size,
        style: g.style.penStyle,
        highlighterStyle: g.style.highlighterStyle,
        stabilization: g.style.stabilization,
      } as InkMark, true);
    }
  } else if (g.type === 'shape') {
    const sn = snapShape(g.kind, g.a, g.b, g.regular, snap);
    renderShape(ctx, t, { kind: g.kind, a: sn.a, b: sn.b, color: g.color, size: g.size }, props.sketchyShapes);
    if (props.showMeasurements) drawMeasurements(ctx, t, g.kind, sn.a, sn.b);
  } else if (g.type === 'lasso') {
    ctx.save();
    ctx.strokeStyle = '#256979';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    g.poly.forEach((pt, i) => { const [x, y] = toScreen(t, pt); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.restore();
  }
}

function drawMeasurements(ctx: CanvasRenderingContext2D, t: Transform, kind: string, a: Point, b: Point) {
  const [x1, y1] = toScreen(t, a);
  const [x2, y2] = toScreen(t, b);
  const widthCm = Math.abs(x2 - x1) * CM_PER_CSS_PX;
  const heightCm = Math.abs(y2 - y1) * CM_PER_CSS_PX;
  const angle = Math.round(Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI));
  const label = kind === 'line' || kind === 'arrow' || kind === 'angle'
    ? `${(Math.hypot(x2 - x1, y2 - y1) * CM_PER_CSS_PX).toFixed(1)} cm · ${angle}°`
    : `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
  const lx = (x1 + x2) / 2, ly = Math.min(y1, y2) - 10;
  ctx.save();
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.lineWidth = 4;
  ctx.strokeText(label, lx, ly + 2);
  ctx.fillStyle = '#234e5a';
  ctx.fillText(label, lx, ly + 2);
  ctx.restore();
}

/** Points magnétiques et guides de construction. */
function drawSnapGuides(input: OverlayInput) {
  const { ctx, t, gesture: g, hover, anchorIndex, snap, props, cssWidth, cssHeight, anchorGuidePx } = input;
  const activeShapeKind = g?.type === 'shape' ? g.kind : isShapeKind(props.tool) ? props.tool : null;
  const guidePoint = g?.type === 'shape' ? g.b : hover?.point;
  if (!activeShapeKind || !props.smartSnap || !guidePoint) return;
  ctx.save();
  const guideAnchors = anchorsNear(guidePoint, anchorIndex, anchorGuidePx / (t.w || 1));
  for (const anchor of guideAnchors) {
    const [x, y] = toScreen(t, anchor);
    ctx.beginPath();
    ctx.fillStyle = 'rgba(37, 105, 121, 0.78)';
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g?.type === 'shape') {
    const sn = snapShape(g.kind, g.a, g.b, g.regular, snap);
    const [x, y] = toScreen(t, sn.b);
    ctx.strokeStyle = 'rgba(37, 105, 121, 0.36)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, cssHeight);
    ctx.moveTo(0, y); ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Cadre de sélection + poignées de redimensionnement/suppression. */
function drawSelection(input: OverlayInput) {
  const { ctx, t, gesture: g, marks, selection, props } = input;
  if (selection.length === 0 || !(props.tool === 'lasso' || g?.type === 'move' || g?.type === 'resize')) return;
  const resizeBox = g?.type === 'resize' ? resizeTargetBBox(g.source, g.handle, g.current) : null;
  const bb = resizeBox || marksBBox(marks, selection);
  if (!bb) return;
  const moveDelta = g?.type === 'move' ? g.delta : null;
  const dx = moveDelta ? moveDelta[0] : 0;
  const dy = moveDelta ? moveDelta[1] : 0;
  const [x1, y1] = toScreen(t, [bb.minX + dx, bb.minY + dy]);
  const [x2, y2] = toScreen(t, [bb.maxX + dx, bb.maxY + dy]);
  ctx.save();
  ctx.strokeStyle = '#256979';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x1 - 6, y1 - 6, x2 - x1 + 12, y2 - y1 + 12);
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#256979';
  ctx.lineWidth = 1.6;
  const corners: Point[] = [[x1 - 6, y1 - 6], [x2 + 6, y1 - 6], [x2 + 6, y2 + 6], [x1 - 6, y2 + 6]];
  for (const [hx, hy] of corners) {
    ctx.fillRect(hx - RESIZE_HANDLE / 2, hy - RESIZE_HANDLE / 2, RESIZE_HANDLE, RESIZE_HANDLE);
    ctx.strokeRect(hx - RESIZE_HANDLE / 2, hy - RESIZE_HANDLE / 2, RESIZE_HANDLE, RESIZE_HANDLE);
  }
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x2 + 6 - HANDLE, y1 - 6 - HANDLE, HANDLE, HANDLE);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.7;
  const cx = x2 + 6 - HANDLE / 2, cy = y1 - 6 - HANDLE / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5, cy - 3.5); ctx.lineTo(cx + 3.5, cy + 3.5);
  ctx.moveTo(cx + 3.5, cy - 3.5); ctx.lineTo(cx - 3.5, cy + 3.5);
  ctx.stroke();
  ctx.restore();
}

/** Aperçu S Pen au survol : diamètre et couleur avant de toucher l'écran. */
function drawHoverCursor(input: OverlayInput) {
  const { ctx, t, gesture: g, hover, props } = input;
  if (g || !hover) return;
  const [x, y] = toScreen(t, hover.point);
  const hoverTool = hover.tool === 'eraser' ? 'eraser' : props.tool;
  const pressureEraser = hover.tool === 'eraser' || props.eraserAutoSize;
  const radius = hoverTool === 'eraser'
    ? props.eraserSize * (pressureEraser ? 0.55 + hover.pressure * 0.9 : 1) / 2
    : hoverTool === 'highlighter'
      ? props.size / 2
      : Math.max(2.5, props.size * (0.42 + hover.pressure * 0.48));
  ctx.save();
  ctx.globalAlpha = hoverTool === 'highlighter' ? 0.28 : 0.62;
  ctx.strokeStyle = hoverTool === 'eraser' ? '#69757b' : props.color;
  ctx.fillStyle = hoverTool === 'eraser' ? 'rgba(105,117,123,0.08)' : `${props.color}18`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Compose la couche dynamique par-dessus la base (marques ou cache statique). */
export function drawOverlay(input: OverlayInput) {
  drawGesturePreview(input);
  drawSnapGuides(input);
  drawSelection(input);
  drawHoverCursor(input);
}
