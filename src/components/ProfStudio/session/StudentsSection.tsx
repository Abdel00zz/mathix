import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type {
  ClassStudentProgress,
  SharedImage,
} from '../../../services/professorClassroomService';
import SharedImageViewer from '../SharedImageViewer';
import { countPresentStudents, sortStudentsByName } from './sessionHelpers';
import { ShareImageModal } from './ShareImageModal';
import { SharedImagesPanel } from './SharedImagesPanel';
import { StudentProgressList } from './StudentProgressList';

interface StudentsSectionProps {
  loading: boolean;
  busy: boolean;
  enrolled: ClassStudentProgress[];
  presentIds: Set<string>;
  chapterTitles: Record<string, string>;
  sharedImages: SharedImage[];
  inRotation: (name: string) => boolean;
  onTogglePresent: (accountId: string) => void;
  onMarkAllPresent: () => void;
  onMarkNonePresent: () => void;
  onSaveAttendance: () => Promise<void>;
  onAddRotation: (name: string) => void;
  onShareImage: (student: ClassStudentProgress, caption: string, file: File) => Promise<void>;
  onDeleteImage: (id: string) => Promise<void>;
}

/**
 * Onglet « Élèves » : une seule liste d'appel, l'ordre ne bouge jamais, et la
 * progression détaillée se déplie sous la ligne concernée.
 */
export function StudentsSection({
  loading, busy, enrolled, presentIds, chapterTitles, sharedImages, inRotation,
  onTogglePresent, onMarkAllPresent, onMarkNonePresent, onSaveAttendance,
  onAddRotation, onShareImage, onDeleteImage,
}: StudentsSectionProps) {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<ClassStudentProgress | null>(null);
  const [viewerImage, setViewerImage] = useState<SharedImage | null>(null);
  // Les présences sont locales jusqu'à l'enregistrement : il faut le dire.
  const [unsaved, setUnsaved] = useState(false);

  const presentCount = countPresentStudents(enrolled, presentIds);
  const students = useMemo(() => sortStudentsByName(enrolled), [enrolled]);

  const togglePresent = useCallback((accountId: string) => {
    setUnsaved(true);
    onTogglePresent(accountId);
  }, [onTogglePresent]);
  const markAll = useCallback(() => { setUnsaved(true); onMarkAllPresent(); }, [onMarkAllPresent]);
  const markNone = useCallback(() => { setUnsaved(true); onMarkNonePresent(); }, [onMarkNonePresent]);
  const save = useCallback(async () => {
    await onSaveAttendance();
    setUnsaved(false);
  }, [onSaveAttendance]);

  const toggleDetails = useCallback((accountId: string) => {
    setExpandedStudentId(previous => previous === accountId ? null : accountId);
  }, []);
  const closeShareModal = useCallback(() => setShareTarget(null), []);

  return (
    <>
      <div className="space-y-4">
        <section className="prof-panel overflow-hidden" aria-labelledby="attendance-title">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
            <div className="mr-auto">
              <h2 id="attendance-title" className="prof-section-title">Appel</h2>
              <p className="prof-meta" role="status" aria-live="polite">
                {presentCount} présent{presentCount > 1 ? 's' : ''} sur {enrolled.length}
              </p>
            </div>
            {unsaved && <span className="prof-chip prof-chip-gold">Non enregistré</span>}
            <button type="button" onClick={markAll} disabled={loading || enrolled.length === 0} className="prof-button-secondary px-3 text-xs">Tous</button>
            <button type="button" onClick={markNone} disabled={loading || enrolled.length === 0} className="prof-button-secondary px-3 text-xs">Aucun</button>
            <button type="button" onClick={() => void save()} disabled={busy || enrolled.length === 0} className="prof-button-success px-4">
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Enregistrer l’appel
            </button>
          </div>

          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500" role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Chargement…
            </p>
          ) : enrolled.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">Aucun élève inscrit dans cette classe.</p>
          ) : (
            <StudentProgressList
              students={students}
              presentIds={presentIds}
              chapterTitles={chapterTitles}
              expandedStudentId={expandedStudentId}
              inRotation={inRotation}
              onTogglePresent={togglePresent}
              onToggleDetails={toggleDetails}
              onAddRotation={onAddRotation}
              onShare={setShareTarget}
            />
          )}
        </section>

        <SharedImagesPanel images={sharedImages} onOpen={setViewerImage} onDelete={onDeleteImage} />
      </div>
      {shareTarget && <ShareImageModal student={shareTarget} onClose={closeShareModal} onSubmit={onShareImage} />}
      <SharedImageViewer image={viewerImage} onClose={() => setViewerImage(null)} />
    </>
  );
}
