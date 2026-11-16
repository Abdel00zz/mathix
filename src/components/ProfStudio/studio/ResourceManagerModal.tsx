import React, { useState } from 'react';
import { ChevronDown, Loader2, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import type { ChapterEntry, ImportEntry, ImportableKind, ManagedExercise, StateSetter } from './types';
import { exerciseDisplayNumber } from './contentUtils';
import ResourceImportPanel from './ResourceImportPanel';
import ResourceRow from './ResourceRow';

interface ResourceManagerModalProps {
  chapter: ChapterEntry | null;
  chapterId: string;
  creating: boolean;
  exercises: ManagedExercise[];
  importBusy: boolean;
  importDone: boolean;
  importEntries: ImportEntry[];
  importError: string | null;
  importExpandedError: number | null;
  importMessage: string | null;
  importPasteOpen: boolean;
  importPasteText: string;
  onAnalyzePaste: () => void;
  onClose: () => void;
  onCreate: () => void;
  onDeleteChapter: () => Promise<boolean>;
  onDeleteResources: (paths: string[], kind: ImportableKind) => void;
  onFiles: (files: FileList | null) => void;
  onImport: () => void;
  onMoveExercise: (fromIndex: number, newNumber: number) => void;
  onOpenResource: (path: string) => void;
  onPrint: () => void;
  onRenameChapter: (title: string) => void;
  onRenameResource: (path: string, kind: ImportableKind, name: string) => void;
  open: boolean;
  printing: boolean;
  resourceSelection: Set<string>;
  setImportExpandedError: (index: number | null) => void;
  setImportPasteOpen: (open: boolean) => void;
  setImportPasteText: (text: string) => void;
  setResourceSelection: StateSetter<Set<string>>;
  setType: (kind: ImportableKind) => void;
  type: ImportableKind;
}

export default function ResourceManagerModal(props: ResourceManagerModalProps) {
  const { chapter, chapterId, creating, exercises, importBusy, importDone, importEntries, importError, importExpandedError, importMessage, importPasteOpen, importPasteText, onAnalyzePaste, onClose, onCreate, onDeleteChapter, onDeleteResources, onFiles, onImport, onMoveExercise, onOpenResource, onPrint, onRenameChapter, onRenameResource, open, printing, resourceSelection, setImportExpandedError, setImportPasteOpen, setImportPasteText, setResourceSelection, setType, type } = props;
  const [exercisesExpanded, setExercisesExpanded] = useState(false);
  const [renamingChapter, setRenamingChapter] = useState(false);
  const [chapterName, setChapterName] = useState('');
  if (!open) return null;

  const quizzes = (chapter?.quizzes || []).filter(item => item.path);
  const revisions = (chapter?.revisions || []).filter(item => item.path);
  const visibleExercises = exercisesExpanded ? exercises : exercises.slice(0, 10);
  const allSelected = exercises.length > 0 && exercises.every(item => resourceSelection.has(item.path));
  const closeIfIdle = () => { if (!creating && !importBusy) onClose(); };
  const commitChapterName = () => {
    setRenamingChapter(false);
    const nextName = chapterName.trim();
    if (nextName && chapter && nextName !== chapter.title) onRenameChapter(nextName);
  };

  // Un chapitre peut porter plusieurs fiches : on les numérote comme le rail
  // de catalogue, sinon la liste afficherait plusieurs entrées « Révision ».
  const resourceList = type === 'quiz' ? quizzes.map((item, index) => ({ path: item.path!, label: quizzes.length > 1 ? `Quiz ${index + 1}` : 'Quiz', index }))
    : type === 'revision' ? revisions.map((item, index) => ({ path: item.path!, label: revisions.length > 1 ? `Révision ${index + 1}` : 'Révision', index }))
      : visibleExercises.map((item, index) => ({ path: item.path, label: `Exercice ${exerciseDisplayNumber(item, index + 1)}`, index }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={closeIfIdle} role="presentation">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[26px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] overscroll-contain sm:max-h-[94vh] sm:rounded-2xl" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="studio-resource-manager-title">
        {/* Mobile top pull handle */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="studio-resource-manager-title" className="truncate text-sm font-bold text-slate-900">Ressources du chapitre</h2>
            {renamingChapter ? <input autoFocus value={chapterName} onChange={event => setChapterName(event.target.value)} onBlur={commitChapterName} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenamingChapter(false); }} className="h-6 w-full rounded border border-slate-300 px-1.5 text-[12px] font-semibold text-slate-800 outline-none focus:border-slate-900" aria-label="Nouveau titre du chapitre" />
              : <p className="truncate text-[11px] text-slate-400">{chapter?.title || '—'}</p>}
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => { setChapterName(chapter?.title || ''); setRenamingChapter(true); }} disabled={!chapter || creating || importBusy} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30" aria-label="Renommer le chapitre" title="Renommer le chapitre"><Pencil size={14} /></button>
            <button type="button" onClick={() => { void onDeleteChapter().then(deleted => { if (deleted) onClose(); }); }} disabled={!chapter || creating || importBusy} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Supprimer le chapitre" title="Supprimer le chapitre"><Trash2 size={14} /></button>
            <button type="button" onClick={onClose} disabled={creating || importBusy} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer"><X size={16} /></button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r" aria-label="Types de ressources">
            {([['quiz', 'Quiz', quizzes.length], ['revision', 'Révision', revisions.length], ['exercise', 'Exercices', exercises.length]] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setType(value)} className={`flex min-w-[112px] items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition sm:min-w-0 ${type === value ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`} aria-current={type === value ? 'page' : undefined}><span>{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${type === value ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{count}</span></button>)}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Créer {type === 'quiz' ? 'un quiz' : type === 'revision' ? 'une fiche de révision' : 'un exercice'}</label>
                <button type="button" onClick={onCreate} disabled={creating || !chapterId} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">{creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer</button>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{type === 'quiz' ? 'Quiz' : type === 'revision' ? 'Révisions' : 'Exercices'}</span><span className="text-[11px] font-medium text-slate-400">{type === 'quiz' ? quizzes.length : type === 'revision' ? revisions.length : exercises.length} ressource(s)</span></div>
                {resourceList.length === 0 ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Aucune ressource de ce type dans ce chapitre.</p>
                  : <div className="space-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-2">{resourceList.map(item => <ResourceRow key={item.path} index={item.index} label={item.label} total={resourceList.length} canRenumber={type === 'exercise'} showOrder={type === 'exercise'} selected={resourceSelection.has(item.path)} onToggleSelect={type === 'exercise' ? () => setResourceSelection(previous => { const next = new Set(previous); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next; }) : undefined} onOpen={() => { onOpenResource(item.path); onClose(); }} onMove={direction => onMoveExercise(item.index, item.index + 1 + direction)} onDragReorder={type === 'exercise' ? (from, to) => onMoveExercise(from, to + 1) : undefined} onDelete={() => onDeleteResources([item.path], type)} onRenumber={number => onMoveExercise(item.index, number)} onRename={name => onRenameResource(item.path, type, name)} />)}
                    {type === 'exercise' && exercises.length > 10 && <button type="button" onClick={() => setExercisesExpanded(value => !value)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800" aria-expanded={exercisesExpanded}><ChevronDown size={13} className={`transition-transform ${exercisesExpanded ? 'rotate-180' : ''}`} />{exercisesExpanded ? 'Afficher moins' : `Voir plus (${exercises.length - 10})`}</button>}
                  </div>}
              </section>

              <ResourceImportPanel busy={importBusy} done={importDone} entries={importEntries} error={importError} expandedError={importExpandedError} message={importMessage} onAnalyzePaste={onAnalyzePaste} onClose={onClose} onExpandedErrorChange={setImportExpandedError} onFiles={onFiles} onImport={onImport} onPasteModeChange={setImportPasteOpen} onPasteTextChange={setImportPasteText} pasteMode={importPasteOpen} pasteText={importPasteText} ready={Boolean(chapterId)} />
            </div>

            {type === 'exercise' && exercises.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.035)] sm:px-5">
              <label className="mr-auto inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={allSelected} onChange={() => setResourceSelection(allSelected ? new Set() : new Set(exercises.map(item => item.path)))} className="h-4 w-4 rounded border-slate-300 accent-slate-900" />Tout sélectionner{resourceSelection.size > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{resourceSelection.size}/{exercises.length}</span>}</label>
              <button type="button" onClick={onPrint} disabled={printing || resourceSelection.size === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#91caff] bg-white px-3 text-xs font-semibold text-[#1677ff] shadow-sm transition hover:border-[#1677ff] hover:bg-[#e6f4ff]/40 disabled:cursor-not-allowed disabled:opacity-40" title="Imprimer les exercices sélectionnés">{printing ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}{printing ? 'Préparation…' : `Imprimer…${resourceSelection.size ? ` (${resourceSelection.size})` : ''}`}</button>
              <button type="button" onClick={() => onDeleteResources(Array.from(resourceSelection), 'exercise')} disabled={resourceSelection.size === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#ffccc7] bg-white px-3 text-xs font-semibold text-[#ff4d4f] shadow-sm transition hover:bg-[#fff2f0] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} /> Supprimer{resourceSelection.size ? ` (${resourceSelection.size})` : ''}</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
