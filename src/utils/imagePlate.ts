/**
 * Fond à poser derrière une image pour qu'elle reste lisible.
 *
 * Les figures importées dans une révision ou un quiz sont presque toujours
 * exportées **sans fond** : des traits sombres sur du transparent. Affichées en
 * grand sur un fond sombre, elles disparaissent — c'est le cas de la visionneuse
 * plein écran.
 *
 * Ce module échantillonne l'image (au plus 64 × 64 pixels) pour savoir si elle
 * est transparente et de quelle couleur sont ses traits, puis décide :
 *
 * - `light` : traits sombres sur fond transparent → plaque claire (ivoire) ;
 * - `dark` : traits clairs sur fond transparent → le fond sombre convient déjà ;
 * - `none` : image opaque (photo, capture pleine) → aucun fond ajouté.
 *
 * La mesure ne rejette jamais : sans navigateur, sans canvas ou sur une image
 * distante protégée par CORS, elle rend `none` (aucun changement d'affichage).
 */
export type ImagePlate = 'light' | 'dark' | 'none';

/** Part de pixels de fond au-delà de laquelle l'image est dite « sans fond ». */
export const TRANSPARENT_RATIO_THRESHOLD = 0.02;
/** En dessous de cette opacité, un pixel est considéré comme du fond. */
export const BACKGROUND_ALPHA = 16;
/**
 * Luminance en dessous de laquelle une figure sans fond est posée sur une plaque
 * claire. Au-dessus, ses traits sont assez lumineux pour ressortir sur le fond
 * sombre de la visionneuse : une plaque claire les rendrait invisibles à leur
 * tour. Le seuil est volontairement haut — dans le doute, on protège l'image.
 */
export const LIGHT_PLATE_LUMINANCE = 0.8;

/** Décision pure, à partir d'un échantillon (ratio de fond, luminance des traits). */
export const plateFromSample = (transparentRatio: number, meanLuminance: number | null): ImagePlate => {
  if (!(transparentRatio > TRANSPARENT_RATIO_THRESHOLD)) return 'none';
  if (meanLuminance === null) return 'light';
  return meanLuminance < LIGHT_PLATE_LUMINANCE ? 'light' : 'dark';
};

const cache = new Map<string, Promise<ImagePlate>>();

/** Analyse une image (résultat mémorisé par source). */
export const analyseImagePlate = (src: string, size = 64): Promise<ImagePlate> => {
  if (!src) return Promise.resolve<ImagePlate>('none');
  const known = cache.get(src);
  if (known) return known;
  const task = measure(src, size);
  cache.set(src, task);
  return task;
};

/** À appeler si un média est remplacé sur la même URL (éditeur). */
export const clearImagePlateCache = (): void => { cache.clear(); };

const measure = (src: string, size: number): Promise<ImagePlate> => new Promise(resolve => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    resolve('none');
    return;
  }
  const image = new Image();
  image.onerror = () => resolve('none');
  image.onload = () => {
    try {
      const naturalWidth = image.naturalWidth || size;
      const naturalHeight = image.naturalHeight || size;
      const ratio = naturalWidth / naturalHeight;
      const width = Math.max(1, Math.round(ratio >= 1 ? size : size * ratio));
      const height = Math.max(1, Math.round(ratio >= 1 ? size / ratio : size));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) { resolve('none'); return; }
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      let background = 0;
      let weightTotal = 0;
      let luminanceSum = 0;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha < BACKGROUND_ALPHA) { background += 1; continue; }
        // Luminance pondérée par l'opacité : un dessin au trait n'a presque
        // aucun pixel pleinement opaque (traits antialiasés), il faut donc
        // mesurer les pixels partiels au lieu de les ignorer.
        const weight = alpha / 255;
        luminanceSum += weight * (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        weightTotal += weight;
      }
      const total = data.length / 4;
      resolve(plateFromSample(total ? background / total : 0, weightTotal ? luminanceSum / weightTotal : null));
    } catch {
      // Canvas « tainté » : image d'une autre origine sans en-tête CORS.
      resolve('none');
    }
  };
  image.src = src;
});
