import type { MediaAnchor, MediaConfig, MediaImage, MediaPosition } from '../types';

export function mediaImages(media?: MediaConfig): MediaImage[] {
  if (!media) return [];
  const { additionalImages = [], ...first } = media;
  return [first, ...additionalImages].filter(image => image.src?.trim());
}

/**
 * Famille de zones d'un bloc :
 *  - `single`      : un seul bloc de contenu — la zone n'a pas de sens ;
 *  - `application` : énoncé/question d'un côté, correction repliable de l'autre ;
 *  - `reveal`      : titre/énoncé toujours visible, contenu à découvrir à côté.
 */
export type MediaZoneKind = 'single' | 'application' | 'reveal';

/** Le bloc a-t-il deux zones distinctes ? (sinon l'association n'est pas proposée) */
export const hasTwoZones = (kind: MediaZoneKind): boolean => kind !== 'single';

/**
 * Zone effective d'une figure.
 *
 * Une fiche déjà publiée n'a pas d'`anchor` : on retrouve alors la règle
 * historique, sinon les figures existantes changeraient de place —
 *  - exercice d'application : `bottom` visait la correction, le reste l'énoncé ;
 *  - bloc révélable : tout allait avec le contenu à découvrir.
 */
export function effectiveAnchor(image: MediaImage, kind: MediaZoneKind): MediaAnchor {
  if (image.anchor) return image.anchor;
  if (kind === 'application') return (image.position || 'top') === 'bottom' ? 'content' : 'lead';
  return 'content';
}

/** Ne garde que les figures d'une zone, dans l'ordre choisi par l'auteur. */
export function mediaByAnchor(
  media: MediaConfig | undefined,
  anchor: MediaAnchor,
  kind: MediaZoneKind = 'single',
): MediaConfig | undefined {
  const kept = mediaImages(media).filter(image => effectiveAnchor(image, kind) === anchor);
  return mediaFromImages(kept);
}

/** Media privé d'une zone : sert à ne pas rendre deux fois une figure placée dans une liste. */
export function withoutAnchor(media: MediaConfig | undefined, anchor: MediaAnchor): MediaConfig | undefined {
  return mediaFromImages(mediaImages(media).filter(image => (image.anchor || 'content') !== anchor));
}

/** Compose les figures par zone : « 1 avec l'énoncé · 2 avec la correction ». */
export function countByAnchor(media: MediaConfig | undefined, kind: MediaZoneKind): Record<MediaAnchor, number> {
  const counts: Record<MediaAnchor, number> = { lead: 0, content: 0, item: 0 };
  for (const image of mediaImages(media)) counts[effectiveAnchor(image, kind)] += 1;
  return counts;
}

export function mediaFromImages(images: MediaImage[]): MediaConfig | undefined {
  const clean = images.filter(image => image.src.trim()).map(image => ({ ...image, src: image.src.trim() }));
  const [first, ...additionalImages] = clean;
  return first ? { ...first, ...(additionalImages.length ? { additionalImages } : {}) } : undefined;
}

export function groupMediaByPosition(images: MediaImage[], override?: MediaPosition): Record<MediaPosition, MediaImage[]> {
  const groups: Record<MediaPosition, MediaImage[]> = {
    top: [], bottom: [], left: [], right: [], inline: [], 'inline-right': [], 'float-left': [], 'float-right': [],
  };
  for (const image of images) (groups[override || image.position || 'top'] || groups.top).push(image);
  return groups;
}
