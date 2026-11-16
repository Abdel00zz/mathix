/**
 * Pipeline d'import d'image — normalisation défensive, partagée par le canvas
 * (annotations) et le studio (figures publiées).
 *
 * Toute image entrante est RE-ENCODÉE, jamais stockée telle quelle :
 *
 *  1. SÉCURITÉ. Un SVG peut embarquer `<script>` et des références externes.
 *     Rastérisé via `<img>` (contexte où les scripts ne s'exécutent pas) puis
 *     redessiné, il ressort en pixels : plus de vecteur actif à stocker.
 *  2. TAILLE. Une photo de tablette (12 Mpx, ~6 Mo) descend sous le budget
 *     demandé : on baisse d'abord la qualité, puis la résolution, jusqu'à ce
 *     que le binaire tienne dans `maxBytes`.
 *  3. HOMOGÉNÉITÉ. EXIF, profils colorimétriques exotiques et formats animés
 *     sont aplatis en une image simple et prévisible.
 *
 * Le type est déterminé par les OCTETS D'EN-TÊTE, jamais par l'extension ni par
 * `file.type` — tous deux fournis par le client et donc non fiables.
 */

/** Garde-fou avant décodage. */
export const SOURCE_MAX_BYTES = 30 * 1024 * 1024;
/** Côté le plus long par défaut après import. */
export const DEFAULT_MAX_EDGE = 1600;
/**
 * Budget binaire d'une image synchronisée vers le cloud. Le serveur plafonne la
 * copie à 850 000 caractères de data URI : 600 Ko de binaire donnent ~800 000
 * caractères en base64, avec une marge pour l'en-tête `data:…;base64,`.
 */
export const CLOUD_IMAGE_MAX_BYTES = 600 * 1024;
/** Budget binaire d'une figure publiée par le studio (plafond serveur : 950 000 car.). */
export const STUDIO_MEDIA_MAX_BYTES = 500 * 1024;

const SVG_FALLBACK = { width: 1024, height: 768 };

export type ImageImportFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';

export interface ImportedImage {
  blob: Blob;
  width: number;
  height: number;
  /** Rapport l/h natif (avant redimensionnement) — vérité des proportions. */
  ratio: number;
  bytes: number;
  sourceFormat: ImageImportFormat;
}

export interface ImportImageOptions {
  /** Côté le plus long maximal (défaut 1600 px). */
  maxEdge?: number;
  /** Poids maximal du binaire produit (défaut : budget cloud). */
  maxBytes?: number;
}

export class ImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageImportError';
  }
}

// ── Fonctions pures (testables sans navigateur) ────────────────────────────

/** Reconnaissance par signature binaire (magic bytes). */
export function sniffFormat(bytes: Uint8Array): ImageImportFormat | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (
    b.length >= 12
    && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'webp';
  // SVG : texte. On cherche `<svg` dans les premiers octets, en tolérant BOM,
  // déclaration XML, DOCTYPE et commentaires.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.subarray(0, Math.min(b.length, 1024)))
    .toLowerCase();
  if (head.includes('<svg')) return 'svg';
  return null;
}

/** Dimensions intrinsèques d'un SVG (width/height, sinon viewBox, sinon défaut). */
export function svgIntrinsicSize(source: string): { width: number; height: number } {
  const viewBox = /viewbox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(source);
  const attr = (name: string): number | null => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)`, 'i').exec(source);
    const v = m ? parseFloat(m[1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const w = attr('width');
  const h = attr('height');
  if (w && h) return { width: w, height: h };
  if (viewBox) {
    const vw = parseFloat(viewBox[1]);
    const vh = parseFloat(viewBox[2]);
    if (vw > 0 && vh > 0) return { width: vw, height: vh };
  }
  return SVG_FALLBACK;
}

/**
 * Redimensionnement PROPORTIONNEL : un seul facteur pour les deux axes, donc
 * aucune déformation possible. `min(1, …)` n'agrandit jamais une petite image
 * (un upscale ne crée pas de détail, il ne ferait que gonfler le stockage).
 */
export function fitWithin(srcW: number, srcH: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

export interface BudgetStep { edge: number; quality: number }

const EDGE_FACTORS = [1, 0.85, 0.7, 0.55, 0.4];
const QUALITIES = [0.88, 0.78, 0.68, 0.58];

/**
 * Essais successifs pour tenir dans un budget : on garde la résolution tant
 * que la qualité peut encore baisser, puis on réduit le côté. Le premier essai
 * qui respecte le budget est retenu, donc une image légère reste à pleine
 * qualité.
 */
export function budgetSteps(maxEdge: number): BudgetStep[] {
  const steps: BudgetStep[] = [];
  for (const factor of EDGE_FACTORS) {
    const edge = Math.max(16, Math.round(maxEdge * factor));
    for (const quality of QUALITIES) steps.push({ edge, quality });
  }
  return steps;
}

/** Longueur du base64 d'un binaire (padding compris). */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/** Longueur d'un data URI complet pour un binaire et un type MIME donnés. */
export function dataUriLength(bytes: number, mime: string): number {
  return `data:${mime};base64,`.length + base64Length(bytes);
}

// ── Navigateur : décodage, redessin, encodage ──────────────────────────────

/** Charge un blob dans un HTMLImageElement (contexte sans exécution de script). */
function loadImageElement(blob: Blob, hint?: { width: number; height: number }) {
  return new Promise<{ el: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const el = new Image();
    // Aucune requête réseau ne doit partir depuis l'image importée.
    el.crossOrigin = 'anonymous';
    el.decoding = 'async';
    const cleanup = () => URL.revokeObjectURL(url);
    el.onload = () => {
      const width = el.naturalWidth || hint?.width || 0;
      const height = el.naturalHeight || hint?.height || 0;
      cleanup();
      if (width < 1 || height < 1) {
        reject(new ImageImportError('Image sans dimensions exploitables.'));
        return;
      }
      resolve({ el, width, height });
    };
    el.onerror = () => {
      cleanup();
      reject(new ImageImportError('Fichier illisible ou corrompu.'));
    };
    if (hint) { el.width = hint.width; el.height = hint.height; }
    el.src = url;
  });
}

/** Encodage avec repli : WebP (meilleur ratio), sinon JPEG/PNG. */
function encodeCanvas(canvas: HTMLCanvasElement, hasAlpha: boolean, quality: number): Promise<Blob> {
  const attempts: [string, number][] = hasAlpha
    ? [['image/webp', quality], ['image/png', 1]]
    : [['image/webp', quality], ['image/jpeg', quality], ['image/png', 1]];
  const tryNext = (i: number): Promise<Blob> => new Promise((resolve, reject) => {
    if (i >= attempts.length) { reject(new ImageImportError('Ré-encodage impossible.')); return; }
    const [type, q] = attempts[i];
    canvas.toBlob(
      (blob) => {
        // Un type non supporté renvoie null, ou un PNG déguisé : on vérifie.
        if (blob && blob.size > 0 && blob.type === type) resolve(blob);
        else tryNext(i + 1).then(resolve, reject);
      },
      type,
      q,
    );
  });
  return tryNext(0);
}

/**
 * Normalise un fichier en image sûre, redimensionnée et ré-encodée dans le
 * budget demandé. Lève `ImageImportError` avec un message affichable tel quel.
 */
export async function importImage(file: File, options: ImportImageOptions = {}): Promise<ImportedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options.maxBytes ?? CLOUD_IMAGE_MAX_BYTES;

  if (!file || file.size === 0) throw new ImageImportError('Fichier vide.');
  if (file.size > SOURCE_MAX_BYTES) {
    throw new ImageImportError(
      `Image trop lourde (${(file.size / 1024 / 1024).toFixed(1)} Mo, maximum 30 Mo).`,
    );
  }

  const buffer = await file.arrayBuffer();
  const format = sniffFormat(new Uint8Array(buffer));
  if (!format) {
    throw new ImageImportError('Format non reconnu — PNG, JPG, WebP, GIF ou SVG attendu.');
  }

  // Le blob est reconstruit avec le type RÉEL déduit des octets, pas celui annoncé.
  let decodeBlob: Blob;
  let sizeHint: { width: number; height: number } | undefined;
  if (format === 'svg') {
    const source = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    sizeHint = svgIntrinsicSize(source);
    decodeBlob = new Blob([buffer], { type: 'image/svg+xml' });
  } else {
    decodeBlob = new Blob([buffer], { type: `image/${format}` });
  }

  const { el, width: srcW, height: srcH } = await loadImageElement(decodeBlob, sizeHint);
  const ratio = srcW / srcH;
  const hasAlpha = format === 'png' || format === 'svg' || format === 'webp' || format === 'gif';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new ImageImportError('Canvas indisponible sur cet appareil.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let lastEdge = -1;
  let outW = 0;
  let outH = 0;
  for (const step of budgetSteps(maxEdge)) {
    // Une image plus petite que le côté visé produit plusieurs essais à la même
    // taille : on ne redessine que lorsque les dimensions changent réellement.
    const fitted = fitWithin(srcW, srcH, step.edge);
    const edge = Math.max(fitted.width, fitted.height);
    if (edge !== lastEdge) {
      canvas.width = fitted.width;
      canvas.height = fitted.height;
      ctx.clearRect(0, 0, fitted.width, fitted.height);
      ctx.drawImage(el, 0, 0, fitted.width, fitted.height);
      lastEdge = edge;
      outW = fitted.width;
      outH = fitted.height;
    }
    const blob = await encodeCanvas(canvas, hasAlpha, step.quality);
    if (blob.size <= maxBytes) {
      return {
        blob,
        width: outW,
        height: outH,
        // Ratio NATIF (avant redimensionnement) : l'arrondi au pixel des
        // dimensions de sortie introduirait sinon une dérive de proportion.
        ratio,
        bytes: blob.size,
        sourceFormat: format,
      };
    }
  }
  throw new ImageImportError('Image trop complexe à compresser — réduisez-la avant import.');
}

/** Blob -> data URI (base64). */
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
