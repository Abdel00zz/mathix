/**
 * Import d'image du canvas : mince adaptateur sur le pipeline partagé
 * (`utils/imagePipeline`). Le canvas garde un côté maximal de 1600 px et un
 * budget aligné sur ce que le serveur accepte pour la copie cloud, afin
 * qu'une image enregistrée en local puisse toujours être synchronisée.
 */
import {
  CLOUD_IMAGE_MAX_BYTES,
  DEFAULT_MAX_EDGE,
  ImageImportError,
  importImage,
  type ImportedImage,
} from '../../../../utils/imagePipeline';

export { ImageImportError };
export type { ImportedImage };

export function importImageFile(file: File): Promise<ImportedImage> {
  return importImage(file, { maxEdge: DEFAULT_MAX_EDGE, maxBytes: CLOUD_IMAGE_MAX_BYTES });
}
