import { ImageMark, Transform, safeRatio, toScreen } from '../core';
import { canvasImageStore } from '../../../../utils/canvasImageStore';

/**
 * Rendu des images posées + cache de bitmaps décodés.
 *
 * Le décodage est ASYNCHRONE (IndexedDB → Blob → ImageBitmap) alors que le
 * rendu du canvas est synchrone. Le cache résout ce décalage : au premier
 * passage la marque n'est pas encore décodée, on dessine un cadre d'attente et
 * on prévient l'appelant une fois prête, qui replanifie un rendu.
 *
 * `ImageBitmap` plutôt que `HTMLImageElement` : déjà décodé en mémoire GPU, son
 * `drawImage` ne provoque ni décodage paresseux ni à-coup pendant le tracé —
 * ce qui compte sur un canvas où l'on écrit au stylet en même temps.
 */

type Entry =
  | { state: 'loading' }
  | { state: 'ready'; bitmap: ImageBitmap | HTMLImageElement; ratio: number }
  | { state: 'error'; at: number; tries: number };

/**
 * Une image « introuvable » n'est plus définitive : sa copie cloud peut arriver
 * après (envoi différé, appareil hors ligne). On réessaie après 8 s, 30 s puis
 * 90 s, et dès le retour en ligne ; au-delà, le cadre d'erreur reste affiché.
 */
const RETRY_DELAYS_MS = [8_000, 30_000, 90_000];

export function nextRetryDelay(tries: number): number | null {
  return tries < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[tries] : null;
}

const cache = new Map<string, Entry>();
let notify: (() => void) | null = null;

/** Callback appelé quand une image finit de charger (→ replanifier un rendu). */
export function onImageReady(cb: (() => void) | null): void {
  notify = cb;
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* repli sur <img> ci-dessous */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    el.src = url;
  });
}

function load(ref: string, tries = 0): void {
  cache.set(ref, { state: 'loading' });
  canvasImageStore.get(ref)
    .then(async (record) => {
      if (!record) { cache.set(ref, { state: 'error', at: Date.now(), tries }); return; }
      const bitmap = await decode(record.blob);
      cache.set(ref, { state: 'ready', bitmap, ratio: safeRatio(record.ratio) });
    })
    .catch(() => { cache.set(ref, { state: 'error', at: Date.now(), tries }); })
    .finally(() => notify?.());
}

/** Retour en ligne : les images en erreur retentent tout de suite. */
export function retryFailedImages(): void {
  for (const [ref, entry] of cache) {
    if (entry.state === 'error' && nextRetryDelay(entry.tries) !== null) load(ref, entry.tries + 1);
  }
}

if (typeof window !== 'undefined') window.addEventListener('online', retryFailedImages);

/** Précharge les images d'une liste de références (sans bloquer le rendu). */
export function preloadImages(refs: Iterable<string>): void {
  for (const ref of refs) if (!cache.has(ref)) load(ref);
}

/**
 * Libère les bitmaps devenus inutiles. `ImageBitmap` retient de la mémoire GPU
 * jusqu'à `close()` — sans ça, effacer puis réimporter fuirait à chaque cycle.
 */
export function releaseUnusedImages(referenced: Set<string>): void {
  for (const [ref, entry] of cache) {
    if (referenced.has(ref)) continue;
    if (entry.state === 'ready' && 'close' in entry.bitmap) entry.bitmap.close();
    cache.delete(ref);
  }
}

export function renderImage(ctx: CanvasRenderingContext2D, t: Transform, m: ImageMark): void {
  const [x1, y1] = toScreen(t, m.a);
  const [x2, y2] = toScreen(t, m.b);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w < 0.5 || h < 0.5) return;

  const entry = cache.get(m.ref);
  if (!entry) { load(m.ref); drawPlaceholder(ctx, x, y, w, h, 'loading'); return; }
  if (entry.state === 'loading') { drawPlaceholder(ctx, x, y, w, h, 'loading'); return; }
  if (entry.state === 'error') {
    const delay = nextRetryDelay(entry.tries);
    // load repasse l'entrée en « loading » : un seul essai par échéance.
    if (delay !== null && Date.now() - entry.at >= delay) load(m.ref, entry.tries + 1);
    drawPlaceholder(ctx, x, y, w, h, 'error');
    return;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, m.opacity ?? 1));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(entry.bitmap, x, y, w, h);
  ctx.restore();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  state: 'loading' | 'error',
): void {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = state === 'error' ? 'rgba(192, 57, 43, 0.6)' : 'rgba(37, 105, 121, 0.45)';
  ctx.fillStyle = state === 'error' ? 'rgba(192, 57, 43, 0.05)' : 'rgba(37, 105, 121, 0.04)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  if (state === 'error' && w > 60 && h > 24) {
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(192, 57, 43, 0.85)';
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Image introuvable', x + w / 2, y + h / 2 + 4);
  }
  ctx.restore();
}
