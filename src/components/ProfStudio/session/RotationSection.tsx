import { useCallback, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, RotateCcw, Trash2, WifiOff } from 'lucide-react';
import type { ClassroomLiveState, ClassroomRoster } from '../../../services/professorClassroomService';
import { RosterIllustration } from './SessionIllustrations';
import type { RosterSyncState } from './types';

interface RotationSectionProps {
  roster: ClassroomRoster;
  live: ClassroomLiveState;
  online: boolean;
  syncState: RosterSyncState;
  syncLabel: string;
  answeredIds: Set<string>;
  answeredCount: number;
  participation: number;
  onReset: () => Promise<void>;
  onTitleChange: (value: string) => void;
  onNameChange: (index: number, value: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}

/**
 * Onglet « Rotation » : l'ordre d'appel de la séance.
 *
 * Les noms ne sont pas éditables au clic — un clic mal placé pendant la séance
 * ne doit pas renommer un élève. L'édition passe par le crayon de la ligne.
 */
export function RotationSection({
  roster, live, online, syncState, syncLabel, answeredIds, answeredCount, participation,
  onReset, onTitleChange, onNameChange, onMove, onRemove,
}: RotationSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const total = roster.students.length;

  const syncTone = syncState === 'saved' ? 'text-emerald-600'
    : syncState === 'pending' ? 'text-amber-600'
    : syncState === 'saving' ? 'text-slate-400'
    : 'text-rose-600';

  const reset = useCallback(() => {
    if (total > 0 && !window.confirm('Remettre la rotation au premier élève et effacer les passages ?')) return;
    setEditingIndex(null);
    void onReset();
  }, [onReset, total]);

  const remove = useCallback((index: number, name: string) => {
    if (!window.confirm(`Retirer ${name || `l’élève ${index + 1}`} de la rotation ?`)) return;
    setEditingIndex(null);
    onRemove(index);
  }, [onRemove]);

  return (
    <section className="prof-panel overflow-hidden" aria-labelledby="rotation-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
        <div className="mr-auto">
          <h2 id="rotation-title" className="prof-section-title">Rotation</h2>
          <p className="prof-meta">Ordre d’appel pendant la séance, tour par tour.</p>
        </div>
        {!online && (
          <span className="prof-chip prof-chip-gold">
            <WifiOff size={12} aria-hidden="true" /> Hors ligne
          </span>
        )}
        <span className="prof-chip prof-chip-blue">Manche {live.roundId || 1}</span>
        {total > 0 && (
          <span className="prof-chip prof-chip-green" role="status" aria-live="polite">
            {answeredCount}/{total} traités · {participation}%
          </span>
        )}
        <span className={`text-[11px] font-semibold ${syncTone}`} role="status" aria-live="polite">{syncLabel}</span>
        <button type="button" onClick={reset} className="prof-button-secondary h-7 px-2.5 text-[11px] text-[#fa8c16] border-[#ffd591] hover:border-[#fa8c16]">
          <RotateCcw size={12} aria-hidden="true" /> Réinitialiser
        </button>
      </div>

      <div className="border-b border-[#f0f0f0] px-4 py-3">
        <label className="block max-w-xs">
          <span className="prof-label mb-1 block">Libellé du groupe</span>
          <input
            value={roster.title}
            onChange={event => onTitleChange(event.target.value)}
            placeholder="Ex. Groupe A"
            className="prof-input w-full px-3 outline-none"
          />
        </label>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <RosterIllustration />
          <div>
            <p className="text-sm font-semibold text-[#141414]">Aucun élève en rotation</p>
            <p className="prof-meta mx-auto mt-1 max-w-sm leading-relaxed">
              Dans l’onglet « Élèves », utilisez le bouton « Rotation » pour composer l’ordre d’appel.
            </p>
          </div>
        </div>
      ) : (
        <ul aria-label="Ordre d’appel">
          {roster.students.map((student, index) => {
            const isCurrent = index === live.currentStudentIndex;
            const isAnswered = answeredIds.has(student.id);
            const isEditing = editingIndex === index;
            return (
              <li key={student.id} className="prof-row">
                <div className={`flex items-center gap-2 px-3 py-2 ${isCurrent ? 'bg-[#e6f4ff]/50' : ''}`}>
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] font-semibold text-slate-400">{index + 1}</span>
                  {isEditing ? (
                    <input
                      value={student.name}
                      onChange={event => onNameChange(index, event.target.value)}
                      onBlur={() => setEditingIndex(null)}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') setEditingIndex(null); }}
                      autoFocus
                      aria-label={`Nom de l’élève en position ${index + 1}`}
                      placeholder={`Élève ${index + 1}`}
                      className="prof-input min-w-0 flex-1 px-2 outline-none"
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${isAnswered ? 'font-medium text-slate-400' : 'font-semibold text-slate-800'}`}>
                      {student.name || <span className="italic text-slate-400">Sans nom</span>}
                    </span>
                  )}
                  {isAnswered && <Check size={15} className="shrink-0 text-[#52c41a]" aria-label="Déjà passé" />}
                  {isCurrent && <span className="prof-chip prof-chip-blue shrink-0 font-bold">Au tour</span>}
                  <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => setEditingIndex(isEditing ? null : index)} className="prof-button-ghost" aria-label={`Renommer ${student.name}`}><Pencil size={13} /></button>
                    <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} className="prof-button-ghost" aria-label={`Monter ${student.name}`}><ArrowUp size={14} /></button>
                    <button type="button" onClick={() => onMove(index, 1)} disabled={index === total - 1} className="prof-button-ghost" aria-label={`Descendre ${student.name}`}><ArrowDown size={14} /></button>
                    <button type="button" onClick={() => remove(index, student.name)} className="prof-button-ghost text-slate-400 hover:text-rose-600" aria-label={`Retirer ${student.name} de la rotation`}><Trash2 size={14} /></button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
