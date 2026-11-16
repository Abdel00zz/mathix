/**
 * Validation serveur des images reçues en data URI.
 *
 * Le préfixe `data:image/png;base64,` est fourni par le client : il ne prouve
 * rien. On décode donc l'en-tête, on vérifie que la signature binaire
 * correspond au type annoncé, et on en lit les dimensions pour les borner et
 * les restituer (le client n'a alors plus à les deviner au chargement).
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface InspectedImage {
  mime: ImageMime;
  /** null si l'en-tête ne permet pas de lire la dimension. */
  width: number | null;
  height: number | null;
  bytes: number;
}

export type InspectResult =
  | ({ ok: true } & InspectedImage)
  | { ok: false; error: 'invalid_data_uri' | 'unsupported_type' | 'type_mismatch' | 'unreadable' | 'dimensions_too_large' };

/** Côté maximal accepté : le client importe à 1600 px, on garde une marge. */
export const MAX_IMAGE_EDGE = 4096;

/** Caractères base64 décodés pour lire l'en-tête (JPEG : SOF parfois après l'EXIF). */
const HEADER_CHARS = 140_000;

const DATA_URI = /^data:(image\/(?:png|jpe?g|webp|gif));base64,/i;

function detectMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (
    b.length >= 12
    && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp';
  return null;
}

function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [view.getUint32(16, false), view.getUint32(20, false)];
}

function gifSize(b: Uint8Array): [number, number] | null {
  if (b.length < 10) return null;
  return [b[6] | (b[7] << 8), b[8] | (b[9] << 8)];
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (b.length < 30) return null;
  const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (tag === 'VP8 ') {
    return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  }
  if (tag === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (tag === 'VP8X') {
    const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return [width, height];
  }
  return null;
}

function jpegSize(b: Uint8Array): [number, number] | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function readSize(mime: ImageMime, b: Uint8Array): [number, number] | null {
  switch (mime) {
    case 'image/png': return pngSize(b);
    case 'image/gif': return gifSize(b);
    case 'image/webp': return webpSize(b);
    case 'image/jpeg': return jpegSize(b);
  }
}

/** Taille du binaire décodé, sans le décoder en entier. */
function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function inspectImageDataUri(
  dataUri: unknown,
  options: { allowed?: readonly ImageMime[]; maxEdge?: number } = {},
): InspectResult {
  if (typeof dataUri !== 'string') return { ok: false, error: 'invalid_data_uri' };
  const match = DATA_URI.exec(dataUri);
  if (!match) return { ok: false, error: 'invalid_data_uri' };

  const claimed = match[1].toLowerCase().replace('image/jpg', 'image/jpeg') as ImageMime;
  const allowed = options.allowed ?? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowed.includes(claimed)) return { ok: false, error: 'unsupported_type' };

  const base64 = dataUri.slice(match[0].length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64.slice(0, 2000)) || base64.length < 16) {
    return { ok: false, error: 'invalid_data_uri' };
  }
  const head = Buffer.from(base64.slice(0, HEADER_CHARS - (HEADER_CHARS % 4)), 'base64');
  const actual = detectMime(head);
  if (!actual) return { ok: false, error: 'unreadable' };
  if (actual !== claimed) return { ok: false, error: 'type_mismatch' };

  const size = readSize(actual, head);
  const maxEdge = options.maxEdge ?? MAX_IMAGE_EDGE;
  if (size && (size[0] < 1 || size[1] < 1)) return { ok: false, error: 'unreadable' };
  if (size && Math.max(size[0], size[1]) > maxEdge) return { ok: false, error: 'dimensions_too_large' };

  return {
    ok: true,
    mime: actual,
    width: size ? size[0] : null,
    height: size ? size[1] : null,
    bytes: decodedLength(base64),
  };
}
