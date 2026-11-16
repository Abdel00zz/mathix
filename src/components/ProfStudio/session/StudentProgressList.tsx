import { ChevronDown, ImagePlus, Plus } from 'lucide-react';
import type { ClassStudentProgress } from '../../../services/professorClassroomService';
import { relativeTime } from './sessionHelpers';

interface StudentProgressListProps {
  students: ClassStudentProgress[];
  presentIds: Set<string>;
  chapterTitles: Record<string, string>;
  expandedStudentId: string | null;
  inRotation: (name: string) => boolean;
  onTogglePresent: (accountId: string) => void;
  onToggleDetails: (accountId: string) => void;
  onAddRotation: (name: string) => void;
  onShare: (student: ClassStudentProgress) => void;
}

/**
 * Liste d'appel. Une ligne = une case de présence, un nom dépliable, deux
 * actions. Les indicateurs chiffrés vivent dans le dépli : la ligne fermée
 * reste lisible d'un coup d'œil pendant l'appel.
 */
export function StudentProgressList({
  students,
  presentIds,
  chapterTitles,
  expandedStudentId,
  inRotation,
  onTogglePresent,
  onToggleDetails,
  onAddRotation,
  onShare,
}: StudentProgressListProps) {
  return (
    <ul aria-label="Élèves de la classe">
      {students.map(student => {
        const isPresent = presentIds.has(student.accountId);
        const isExpanded = expandedStudentId === student.accountId;
        const detailId = `student-progress-${student.accountId}`;
        const chapters = Array.isArray(student.progress.chapters) ? student.progress.chapters : [];
        const alreadyInRotation = inRotation(student.name);
        return (
          <li key={student.accountId} className="prof-row">
            <div className="flex items-center gap-1 px-2 py-1">
              <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center" title={`Présence de ${student.name}`}>
                <span className="sr-only">Présence de {student.name}</span>
                <input
                  type="checkbox"
                  checked={isPresent}
                  onChange={() => onTogglePresent(student.accountId)}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                />
              </label>

              <button
                type="button"
                onClick={() => onToggleDetails(student.accountId)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
                aria-expanded={isExpanded}
                aria-controls={detailId}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${isPresent ? 'font-semibold text-slate-900' : 'font-medium text-slate-500'}`}>
                    {student.name}
                  </span>
                  <span className="prof-meta block truncate">
                    {student.phone || 'Aucun numéro'} · {relativeTime(student.progress.lastActive)}
                  </span>
                </span>
                <ChevronDown size={15} className={`shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>

              {alreadyInRotation ? (
                <span className="prof-chip prof-chip-purple shrink-0">En rotation</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddRotation(student.name)}
                  className="prof-button-secondary h-7 shrink-0 px-2 text-[11px] text-[#722ed1] border-[#d3adf7] hover:border-[#722ed1]"
                  title={`Ajouter ${student.name} à la rotation`}
                >
                  <Plus size={12} aria-hidden="true" /> Rotation
                </button>
              )}
              <button
                type="button"
                onClick={() => onShare(student)}
                className="prof-button-secondary h-7 w-7 shrink-0 p-0 text-[#13c2c2] border-[#87e8de] hover:border-[#13c2c2]"
                aria-label={`Envoyer une image à ${student.name}`}
                title={`Envoyer une image à ${student.name}`}
              >
                <ImagePlus size={14} aria-hidden="true" />
              </button>
            </div>

            {isExpanded && (
              <div id={detailId} className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
                  <Figure label="Révision" value={`${student.progress.revisionAvg}%`} />
                  <Figure label="Quiz faits" value={String(student.progress.quizDone)} />
                  <Figure label="Score quiz" value={`${student.progress.quizScoreAvg}%`} />
                  <Figure label="Exercices" value={String(student.progress.exercisesDone)} />
                </dl>
                {chapters.length === 0 ? (
                  <p className="prof-meta mt-3">Aucun chapitre commencé.</p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {chapters.map(chapter => (
                      <li key={chapter.chapterId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-white px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                          {chapterTitles[chapter.chapterId] || chapter.chapterId}
                        </span>
                        <span className="prof-meta">{chapter.revisionProgress}% rév.</span>
                        <span className="prof-meta">{chapter.quizSubmitted ? `${chapter.quizScore}% quiz` : 'quiz —'}</span>
                        <span className="prof-meta">{chapter.exercisesDone} ex.</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="prof-label">{label}</dt>
      <dd className="text-xs font-bold text-slate-900">{value}</dd>
    </div>
  );
}
