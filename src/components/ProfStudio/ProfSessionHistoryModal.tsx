import React, { useMemo, useState } from 'react';
import { ChevronDown, History, X } from 'lucide-react';
import type { SessionState } from '../../services/professorClassroomService';
import { useSharedProfessorSession } from '../../hooks/useSharedProfessorSession';

interface ProfSessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
}

const STATUS_META: Record<SessionState['status'], { label: string; dot: string }> = {
  idle: { label: 'Prête', dot: 'bg-slate-400' },
  running: { label: 'En cours', dot: 'bg-emerald-500 animate-pulse' },
  paused: { label: 'En pause', dot: 'bg-amber-500' },
  stopped: { label: 'Terminée', dot: 'bg-rose-500' },
};
const EMPTY_SESSION: SessionState = { status: 'idle' };

/** Couleur du point selon le type d'événement. */
const EVENT_DOT: Record<string, string> = {
  session: 'bg-emerald-500',
  schedule: 'bg-indigo-500',
  chapter: 'bg-purple-500',
  class: 'bg-blue-500',
  present: 'bg-emerald-400',
};

function dayKey(ts: number): string {
  return new Date(ts).toDateString();
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Boîte « Messages » de la tablette prof — reconvertie en HISTORIQUE de séance :
 * planification, début, pause, fin, chapitres lancés, élèves déclarés présents…
 * Chronologie alimentée par les actions PC et tablette (séance Redis), lue en
 * direct par la tablette (même polling que le reste).
 */
export default function ProfSessionHistoryModal({ isOpen, onClose, classId }: ProfSessionHistoryModalProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sharedSession = useSharedProfessorSession(isOpen && !!classId, true);
  const session = sharedSession.loaded ? sharedSession.session : EMPTY_SESSION;

  // Groupement de la chronologie par jour (du plus récent au plus ancien).
  const groups = useMemo(() => {
    const byDay = new Map<string, { key: string; label: string; events: NonNullable<SessionState['history']> }>();
    for (const ev of session.history || []) {
      const key = dayKey(ev.at);
      const group = byDay.get(key) || { key, label: dayLabel(ev.at), events: [] };
      group.events.push(ev);
      byDay.set(key, group);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, g]) => g);
  }, [session.history]);

  // Jour ouvert : celui choisi, sinon (par défaut) le jour le plus récent.
  // Dérivé — aucun setState dans l'effet, la valeur suit les données.
  const effectiveExpandedKey = expandedKey && groups.some(g => g.key === expandedKey)
    ? expandedKey
    : (groups.length > 0 ? groups[0].key : null);

  // ── Activité en cours (pour l'aperçu du haut) ──
  const act = session.activity;
  const pos = act?.position;
  const positionLabel = !pos ? '—'
    : pos.type === 'exercise' ? `Exercice ${pos.index ?? '?'}/${pos.count ?? '?'}`
    : pos.type === 'quiz' ? `Question ${pos.index ?? '?'}/${pos.count ?? '?'}`
    : (pos.label || 'Révision en cours');
  const activityCounts = `${act?.exerciseIds?.length ?? 0} exercice(s) · ${act?.quiz?.history?.length ?? 0} question(s) quiz · ${Object.keys(act?.strokes || {}).length} zone(s) annotée(s)`;
  const meta = STATUS_META[session.status];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        {/* En-tête */}
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><History size={17} /></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Historique de la séance</h2>
              <p className="text-[11px] text-slate-400">Planification, déroulé et tâches du professeur</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Séance en cours */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Séance</span>
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm">
                <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
                {meta.label}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[13px] font-semibold text-slate-800">{session.chapterTitle || 'Aucun chapitre lancé'}</p>
            <div className="mt-2 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
              <p className="truncate"><span className="font-bold text-slate-400">Position : </span>{positionLabel}</p>
              <p className="truncate"><span className="font-bold text-slate-400">Activité : </span>{activityCounts}</p>
            </div>
          </div>

          {/* Chronologie */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Chronologie</p>
            {groups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
                Aucun événement pour l'instant. Les actions du PC et de la tablette
                (démarrage, planification, présents, chapitre…) apparaîtront ici.
              </p>
            ) : (
              <div className="space-y-2">
                {groups.map(group => {
                  const open = effectiveExpandedKey === group.key;
                  return (
                    <div key={group.key} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(open ? null : group.key)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50"
                      >
                        <span className="text-[13px] font-bold text-slate-800">{group.label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{group.events.length}</span>
                          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-0.5 border-t border-slate-100 px-3 py-2">
                          {group.events.map((ev, i) => (
                            <div key={`${ev.at}-${i}`} className="flex items-center gap-2.5 py-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[ev.type] || 'bg-slate-400'}`} aria-hidden="true" />
                              <span className="min-w-0 flex-1 text-[12px] font-medium text-slate-700">{ev.label}</span>
                              <span className="shrink-0 font-mono text-[10px] text-slate-400">
                                {new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700">Terminé</button>
        </footer>
      </div>
    </div>
  );
}
