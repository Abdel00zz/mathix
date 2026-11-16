import type { Stroke } from '../Exercise/canvas/types';

/**
 * Annotations professeur sur une image partagée par un élève.
 *
 * Le canvas de la fiche (`DrawingCanvas`) raisonne en pixels d'écran et n'est pas
 * conscient des transformations CSS de ses ancêtres : le poser dans le cadre
 * tourné/zoomé de la visionneuse décalerait le tracé. Les traits sont donc
 * stockés dans le repère PROPRE DE L'IMAGE (pixels naturels, sans rotation) et
 * convertis vers le cadre à l'affichage. Tourner ou zoomer l'image déplace
 * l'encre avec elle, sans jamais la déformer.
 */

const INK_KEY = 'mathplus:shared-image-ink:v1';
/** Même politique que le tableau : on regroupe les écritures hors du geste. */
const FLUSH_MS = 600;

/** Correspondance entre les pixels de l'image et ceux du cadre affiché. */
export interface ImageInkGeometry {
  naturalWidth: number;
  naturalHeight: number;
  /** Rotation d'affichage, en degrés : 0, 90, 180 ou 270 (sens horaire). */
  rotation: number;
  /** Facteur px image → px cadre : ajustement à la fenêtre × zoom. */
  factor: number;
}

export interface ImageInkBox {
  width: number;
  height: number;
  factor: number;
}

const isQuarterTurn = (rotation: number) => rotation === 90 || rotation === 270;

/**
 * Boîte visible de l'image : ajustée à la fenêtre (« contain », sans jamais
 * agrandir au-delà de la taille naturelle) puis multipliée par le zoom. Un quart
 * de tour échange les dimensions, sans quoi une photo en paysage débordait du
 * cadre — et l'annotation avec elle — dès qu'on la tournait.
 */
export function fitImageBox(
  naturalWidth: number,
  naturalHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  rotation: number,
  zoom: number,
): ImageInkBox {
  if (naturalWidth <= 0 || naturalHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: 0, height: 0, factor: 0 };
  }
  const turned = isQuarterTurn(rotation);
  const shownWidth = turned ? naturalHeight : naturalWidth;
  const shownHeight = turned ? naturalWidth : naturalHeight;
  const fit = Math.min(1, viewportWidth / shownWidth, viewportHeight / shownHeight);
  const factor = fit * zoom;
  return {
    width: Math.round(shownWidth * factor),
    height: Math.round(shownHeight * factor),
    factor,
  };
}

/** Traits de l'image → repère du cadre affiché. */
export function inkToFrame(strokes: Stroke[], geom: ImageInkGeometry): Stroke[] {
  const { naturalWidth: nw, naturalHeight: nh, rotation, factor } = geom;
  if (factor <= 0) return [];
  return strokes.map(stroke => ({
    ...stroke,
    width: stroke.width * factor,
    fontSize: stroke.fontSize === undefined ? undefined : stroke.fontSize * factor,
    points: stroke.points.map(({ x: u, y: v, pressure }) => {
      switch (rotation) {
        case 90: return { x: (nh - v) * factor, y: u * factor, pressure };
        case 180: return { x: (nw - u) * factor, y: (nh - v) * factor, pressure };
        case 270: return { x: v * factor, y: (nw - u) * factor, pressure };
        default: return { x: u * factor, y: v * factor, pressure };
      }
    }),
  }));
}

/** Traits du cadre affiché → repère de l'image (inverse de `inkToFrame`). */
export function inkToImage(strokes: Stroke[], geom: ImageInkGeometry): Stroke[] {
  const { naturalWidth: nw, naturalHeight: nh, rotation, factor } = geom;
  if (factor <= 0) return [];
  return strokes.map(stroke => ({
    ...stroke,
    width: stroke.width / factor,
    fontSize: stroke.fontSize === undefined ? undefined : stroke.fontSize / factor,
    points: stroke.points.map(({ x, y, pressure }) => {
      const a = x / factor;
      const b = y / factor;
      switch (rotation) {
        case 90: return { x: b, y: nh - a, pressure };
        case 180: return { x: nw - a, y: nh - b, pressure };
        case 270: return { x: nw - b, y: a, pressure };
        default: return { x: a, y: b, pressure };
      }
    }),
  }));
}

// ── Stockage ────────────────────────────────────────────────────────────────

let cache: Record<string, Stroke[]> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function all(): Record<string, Stroke[]> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(INK_KEY) || '{}');
    cache = parsed && typeof parsed === 'object' ? (parsed as Record<string, Stroke[]>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

/** Vide la file immédiatement (fermeture de la visionneuse, mise en veille). */
export function flushImageInk(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!dirty || !cache) return;
  dirty = false;
  try {
    localStorage.setItem(INK_KEY, JSON.stringify(cache));
  } catch {
    /* stockage restreint — une photo annotée pèse lourd, l'échec est possible */
  }
}

/** Traits enregistrés pour une image, dans le repère de l'image. */
export function readImageInk(imageId: string): Stroke[] {
  const stored = all()[imageId];
  return Array.isArray(stored) ? stored : [];
}

export function writeImageInk(imageId: string, strokes: Stroke[]): void {
  all()[imageId] = strokes;
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(flushImageInk, FLUSH_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushImageInk);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushImageInk();
  });
}
