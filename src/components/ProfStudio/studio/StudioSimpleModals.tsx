import React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import PrintableChapterExercises from '../../Exercise/PrintableChapterExercises';
import PrintSurface from '../../Exercise/print/PrintSurface';
import type { HistoryEntry, PrintJob } from './types';
import LoadingSpinner from '../../UI/LoadingSpinner';

export function ChapterModal({ busy, name, onClose, onNameChange, onSubmit, open }: {
  busy: boolean;
  name: string;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  open: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => { if (!busy) onClose(); }} role="presentation">
      <div className="w-full max-w-sm rounded-t-[26px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:rounded-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="studio-new-chapter-title">
        <div className="mx-auto -mt-2 mb-3.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h2 id="studio-new-chapter-title" className="text-sm font-bold text-slate-900">Nouveau chapitre</h2><button type="button" onClick={onClose} disabled={busy} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer"><X size={16} /></button></div>
        <label htmlFor="studio-chapter-name" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Titre du chapitre</label>
        <input id="studio-chapter-name" value={name} onChange={event => onNameChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') onSubmit(); }} placeholder="Ex. Nombres complexes" autoFocus className="mb-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-900" />
        <button type="button" onClick={onSubmit} disabled={busy || !name.trim()} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Créer le chapitre</button>
      </div>
    </div>
  );
}

export function HistoryModal({ history, loading, onClose, onLoad, open }: {
  history: HistoryEntry[];
  loading: boolean;
  onClose: () => void;
  onLoad: (entry: HistoryEntry) => void;
  open: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="presentation">
      <div className="w-full max-w-md rounded-t-[26px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:rounded-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="studio-history-title">
        <div className="mx-auto -mt-2 mb-3.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-4 flex items-center justify-between"><h2 id="studio-history-title" className="text-sm font-bold text-slate-900">Historique des versions</h2><button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer"><X size={16} /></button></div>
        {loading ? <LoadingSpinner variant="section" label="Chargement de l’historique…" audience="professor" className="py-10" />
          : history.length === 0 ? <p className="py-10 text-center text-xs text-slate-400">Aucune version antérieure enregistrée.</p>
            : <ul className="max-h-[60vh] space-y-2 overflow-y-auto">{history.map((entry, index) => <li key={`${entry.at}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-slate-800">Version {history.length - index}</p><p className="truncate text-[11px] text-slate-400">{new Date(entry.at).toLocaleString()}</p></div><button type="button" onClick={() => onLoad(entry)} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50">Charger</button></li>)}</ul>}
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">« Charger » place le contenu de cette version dans l’éditeur : vous pourrez le relire puis le republier.</p>
      </div>
    </div>
  );
}

export function StudioPrintJob({ job }: { job: PrintJob | null }) {
  if (!job) return null;
  const { content, footer, header } = job.layout;
  return <div className="print-only prof-studio-print-job"><PrintSurface layout={job.layout}><PrintableChapterExercises chapterTitle={job.chapterTitle} classId={job.classId} exercises={job.exercises} startIndex={content.startIndex} showCorrections={content.showCorrections} showAnswerSpaces={content.showAnswerSpaces} answerSpaceStyle={content.answerSpaceStyle} answerSpaceColor={content.answerSpaceColor} header={header} hideHeader={!header.show} footer={footer} hideTeacherName={!footer.show} exercisePerPage={content.exercisePerPage} /></PrintSurface></div>;
}
