import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, X, Eye } from 'lucide-react';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { RailDockButton } from '../Exercise/canvas/CanvasRailDock';
import {
  professorClassroomService,
  type ClassStudentProgress,
  type SharedImage,
} from '../../services/professorClassroomService';
import SharedImageViewer from './SharedImageViewer';

interface StudentsFloatingIconProps {
  classId?: string;
}

const seenKey = (classId?: string) => `mathplus:students-seen:${classId || 'all'}`;

/**
 * Icône « élèves » du dock flottant, réservée à la version tablette professeur :
 * affiche les élèves connectés (inscrits au prof) et les images partagées.
 * Montée uniquement en mode professeur (useProfessorAccess) — invisible pour
 * les élèves et sur la version PC (qui a sa propre console).
 *
 * L'ancrage vertical et l'alignement sur la barre d'outils canva sont assurés
 * par le conteneur `CanvasRailDock`. Un badge « nouveauté » signale les images
 * partagées depuis la dernière consultation, par élève.
 */
export default function StudentsFloatingIcon({ classId }: StudentsFloatingIconProps) {
  const professorAccess = useProfessorAccess();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<ClassStudentProgress[]>([]);
  const [sharedImages, setSharedImages] = useState<SharedImage[]>([]);
  const [viewerImage, setViewerImage] = useState<SharedImage | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number>(() => {
    try { return Number(localStorage.getItem(seenKey(classId)) || 0); } catch { return 0; }
  });

  useEffect(() => {
    if (!professorAccess || !classId) return;
    let active = true;
    const load = () => {
      Promise.all([
        professorClassroomService.fetchClassStudents(classId),
        professorClassroomService.listSharedImages(classId),
      ])
        .then(([list, images]) => {
          if (!active) return;
          setStudents(list);
          setSharedImages(images);
        })
        .catch(() => { /* silencieux */ });
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [professorAccess, classId]);

  // Repère de consultation rechargé à chaque changement de classe (pattern
  // « ajuster l'état pendant le rendu », sans effet).
  const [lastSeenClassId, setLastSeenClassId] = useState<string | undefined>(classId);
  if (lastSeenClassId !== classId) {
    setLastSeenClassId(classId);
    setViewerImage(null);
    setSharedImages([]);
    setStudents([]);
    let stored = 0;
    try { stored = Number(localStorage.getItem(seenKey(classId)) || 0); } catch { /* stockage restreint */ }
    setLastSeenAt(stored);
  }

  if (!professorAccess) return null;

  const markSeen = () => {
    const now = Date.now();
    setLastSeenAt(now);
    try { localStorage.setItem(seenKey(classId), String(now)); } catch { /* stockage restreint */ }
  };

  // Images nouvelles (partagées depuis la dernière consultation).
  const newImageCount = sharedImages.filter(img => (img.createdAt || 0) > lastSeenAt).length;
  const hasNew = (accountId: string) =>
    sharedImages.some(img => img.studentAccountId === accountId && (img.createdAt || 0) > lastSeenAt);

  return (
    <>
      <RailDockButton
        label="Élèves connectés"
        active={open}
        onClick={() => { setOpen(v => !v); if (!open) markSeen(); }}
      >
        <Users size={19} />
        {newImageCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {newImageCount}
          </span>
        )}
      </RailDockButton>

      {/* Portalisé vers `body` : le dock porte un `backdrop-filter`, il serait
          sinon le bloc contenant de ce panneau `fixed`. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[95]" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="absolute right-[72px] top-1/2 flex max-h-[70vh] w-[280px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-[86px]"
            role="dialog"
            aria-modal="true"
            aria-label="Élèves connectés"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Élèves connectés</h3>
              <button type="button" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {students.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Aucun élève inscrit.</p>
              ) : (
                <div className="space-y-1">
                  {students.map(s => {
                    const images = sharedImages.filter(img => img.studentAccountId === s.accountId);
                    const isNew = hasNew(s.accountId);
                    return (
                      <div key={s.accountId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-50">
                        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                          {s.name.charAt(0).toUpperCase()}
                          {isNew && (
                            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-label="Nouveau" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-slate-700">{s.name}</p>
                          <p className="truncate text-[10px] text-slate-400">
                            {images.length > 0 ? `${images.length} image${images.length > 1 ? 's' : ''} partagée${images.length > 1 ? 's' : ''}` : '—'}
                          </p>
                        </div>
                        {isNew && <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-600">Nouveau</span>}
                        {images.length > 0 && (
                          <button
                            type="button"
                            // La galerie commence par la publication la plus récente.
                            onClick={() => { setViewerImage(images[0]); setOpen(false); }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Voir l'image de ${s.name}`}
                            title={`Voir l'image de ${s.name}`}
                          >
                            <Eye size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* La visionneuse dispose de sa propre barre d'annotation. */}
      {viewerImage && createPortal(
        <SharedImageViewer image={viewerImage} images={sharedImages.filter(img => img.studentAccountId === viewerImage.studentAccountId)} onSelectImage={setViewerImage} onClose={() => setViewerImage(null)} annotate />,
        document.body
      )}
    </>
  );
}
