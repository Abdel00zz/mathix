import type {
  HighlighterStyle, PenStyle, Point, PressureCurve, ShapeKind,
} from '../core/types';
import type { BBox } from '../core/types';
import { Transform } from '../core/transform';
import { constrainBoxToRatio } from '../core/geometry';
import type { RecognizedShape } from '../core/recognizeShape';

/** Modèle du geste en cours. Une union discriminée par `type`. */
export type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

interface InkGestureStyle {
  kind: 'pen' | 'highlighter';
  color: string;
  size: number;
  penStyle: PenStyle;
  highlighterStyle: HighlighterStyle;
  stabilization: number;
  pressureCurve: PressureCurve;
  recognizeShapes: boolean;
  straightLine: boolean;
}

export interface EraserGestureStyle {
  size: number;
  autoSize: boolean;
  highlighterOnly: boolean;
  pressureCurve: PressureCurve;
}

export type Gesture =
  | { type: 'ink'; pts: [number, number, number][]; snap: RecognizedShape | null; style: InkGestureStyle }
  | {
    type: 'shape';
    kind: ShapeKind;
    a: Point;
    b: Point;
    regular: boolean;
    regularPreference: boolean;
    color: string;
    size: number;
  }
  | { type: 'eraseStroke'; removed: Set<number>; style: EraserGestureStyle }
  | { type: 'erasePartial'; working: import('../core/types').Mark[]; changed: boolean; style: EraserGestureStyle }
  | { type: 'lasso'; poly: Point[] }
  | { type: 'move'; start: Point; delta: Point; selection: number[] }
  | { type: 'resize'; source: BBox; handle: ResizeHandle; current: Point; selection: number[] }
  | null;

/**
 * Rayon d'effacement normalisé. `style.size` est un DIAMÈTRE (convention
 * partagée avec l'aperçu et le surligneur) → rayon = size/2. Sans le /2, la
 * gomme effaçait dans un cercle deux fois plus large que le curseur affiché.
 */
export function eraserRadius(t: Transform, pressure: number, style: EraserGestureStyle): number {
  const pressureScale = style.autoSize ? 0.55 + Math.max(0, Math.min(1, pressure)) * 0.9 : 1;
  return style.size * pressureScale / 2 / (t.w || 1);
}

/**
 * Boîte cible d'un redimensionnement, en fixant le coin opposé à la poignée.
 *
 * @param lockRatio Rapport l/h à préserver (images). Fourni, la boîte est
 *   contrainte à ce rapport autour du coin fixe : tirer une poignée en diagonale
 *   ne peut plus écraser l'image, quel que soit le trajet du stylet.
 */
export function resizeTargetBBox(
  source: BBox,
  handle: ResizeHandle,
  current: Point,
  lockRatio?: number,
): BBox {
  const opposite: Point =
    handle === 'nw' ? [source.maxX, source.maxY]
      : handle === 'ne' ? [source.minX, source.maxY]
        : handle === 'se' ? [source.minX, source.minY]
          : [source.maxX, source.minY];
  let x = current[0], y = current[1];
  const min = 0.012;
  if (Math.abs(x - opposite[0]) < min) x = opposite[0] + (x >= opposite[0] ? min : -min);
  if (Math.abs(y - opposite[1]) < min) y = opposite[1] + (y >= opposite[1] ? min : -min);
  const box = {
    minX: Math.min(x, opposite[0]),
    minY: Math.min(y, opposite[1]),
    maxX: Math.max(x, opposite[0]),
    maxY: Math.max(y, opposite[1]),
  };
  return lockRatio ? constrainBoxToRatio(box, lockRatio, opposite) : box;
}
