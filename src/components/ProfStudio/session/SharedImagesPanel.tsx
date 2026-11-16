import { useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { SharedImage } from '../../../services/professorClassroomService';

interface SharedImagesPanelProps {
  images: SharedImage[];
  onOpen: (image: SharedImage) => void;
  onDelete: (id: string) => Promise<void>;
}

/** Images envoyées aux élèves pendant la séance. La vignette ouvre l'aperçu. */
export function SharedImagesPanel({ images, onOpen, onDelete }: SharedImagesPanelProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteImage = async (id: string) => {
    setDeleteError(null);
    try {
      await onDelete(id);
    } catch {
      setDeleteError('Suppression impossible. Vérifiez la connexion puis réessayez.');
    }
  };

  return (
    <section className="prof-panel p-4" aria-labelledby="shared-images-title">
      <div className="flex items-center gap-2">
        <h2 id="shared-images-title" className="prof-section-title mr-auto">Images partagées</h2>
        <span className="prof-chip" aria-label={`${images.length} image(s) partagée(s)`}>{images.length}</span>
      </div>

      {images.length === 0 ? (
        <p className="prof-meta mt-2 leading-relaxed">
          Aucune image partagée. Utilisez le bouton <ImagePlus size={12} className="inline" aria-hidden="true" /> d’une
          ligne d’élève pour lui en envoyer une.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {images.map(image => (
            <li key={image.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-1">
              <button
                type="button"
                onClick={() => onOpen(image)}
                className="flex min-w-0 items-center gap-2 rounded-lg pr-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600"
                title={`Ouvrir l’image envoyée à ${image.studentName}`}
              >
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                  <img src={image.dataUri} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[180px] truncate text-xs font-semibold text-slate-800">{image.studentName}</span>
                  <span className="prof-meta block max-w-[180px] truncate">{image.caption || 'Sans légende'}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void deleteImage(image.id)}
                className="prof-button-ghost shrink-0 text-slate-400 hover:text-rose-600"
                aria-label={`Supprimer l’image envoyée à ${image.studentName}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteError && <p className="mt-2 text-[11px] font-semibold text-rose-600" role="alert" aria-live="assertive">{deleteError}</p>}
    </section>
  );
}
