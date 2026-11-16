import { faCheck, faChevronDown, faMinus } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';
import { KIND_LABELS, KIND_ORDER, type CandidateEntry, type CandidateTree, type ContentKind } from '../../services/contentSyncTypes';
import { FaIcon } from '../UI/FaIcon';

interface CandidateTreePickerProps {
  tree: CandidateTree;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  compact?: boolean;
}

export default function CandidateTreePicker({ tree, selected, onSelectedChange, compact = false }: CandidateTreePickerProps) {
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
  const update = (paths: string[], checked: boolean) => {
    const next = new Set(selected);
    paths.forEach(path => checked ? next.add(path) : next.delete(path));
    onSelectedChange(next);
  };

  if (!tree.total) {
    return <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">Aucune mise à jour disponible dans la portée de ce professeur.</p>;
  }

  return (
    <div className={`space-y-2 overflow-y-auto pr-1 ${compact ? 'max-h-64' : 'max-h-[42vh]'}`}>
      {tree.classes.map(classEntry => {
        const classPaths = classEntry.chapters.flatMap(chapter => chapter.entries.map(entry => entry.path));
        const classCollapsed = collapsedClasses.has(classEntry.classId);
        return (
          <section key={classEntry.classId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm [contain-intrinsic-size:auto_260px] [content-visibility:auto]">
            <div className="flex items-center gap-1 p-1">
              <PickerRow label={classEntry.classTitle || classEntry.classId} paths={classPaths} selected={selected} onUpdate={update} strong />
              <button type="button" onClick={() => setCollapsedClasses(previous => toggled(previous, classEntry.classId))} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" aria-label={`${classCollapsed ? 'Déplier' : 'Replier'} ${classEntry.classTitle}`} aria-expanded={!classCollapsed}><FaIcon icon={faChevronDown} size={16} className={`transition ${classCollapsed ? '-rotate-90' : ''}`} /></button>
            </div>
            {!classCollapsed && <div className="border-t border-slate-200 bg-slate-100/70 px-3 py-2">
              {classEntry.chapters.map(chapter => (
                <div key={`${classEntry.classId}:${chapter.chapterId}`} className="rounded-lg px-1 py-1 [contain-intrinsic-size:auto_160px] [content-visibility:auto]">
                  <div className="flex items-center gap-1">
                    <PickerRow label={chapter.chapterTitle || chapter.chapterId || 'Sommaires'} paths={chapter.entries.map(entry => entry.path)} selected={selected} onUpdate={update} />
                    <button type="button" onClick={() => setCollapsedChapters(previous => toggled(previous, `${classEntry.classId}:${chapter.chapterId}`))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" aria-label="Replier ou déplier le chapitre"><FaIcon icon={faChevronDown} size={14} className={`transition ${collapsedChapters.has(`${classEntry.classId}:${chapter.chapterId}`) ? '-rotate-90' : ''}`} /></button>
                  </div>
                  {!collapsedChapters.has(`${classEntry.classId}:${chapter.chapterId}`) && <div className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-2">
                    {KIND_ORDER.map(kind => {
                      const entries = chapter.entries.filter(entry => entry.kind === kind);
                      if (!entries.length) return null;
                      return <KindGroup key={kind} kind={kind} entries={entries} selected={selected} onUpdate={update} />;
                    })}
                  </div>}
                </div>
              ))}
            </div>}
          </section>
        );
      })}
    </div>
  );
}

function toggled(previous: Set<string>, key: string): Set<string> {
  const next = new Set(previous);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

function KindGroup({ kind, entries, selected, onUpdate }: { kind: ContentKind; entries: CandidateEntry[]; selected: Set<string>; onUpdate: (paths: string[], checked: boolean) => void }) {
  const paths = entries.map(entry => entry.path);
  return (
    <div className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
      <PickerRow label={`${KIND_LABELS[kind]} · ${entries.length}`} paths={paths} selected={selected} onUpdate={onUpdate} />
      <div className="ml-7 mt-1 space-y-1">
        {entries.map(entry => (
          <button key={entry.path} type="button" onClick={() => onUpdate([entry.path], !selected.has(entry.path))} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-100">
            <CheckBox state={selected.has(entry.path)} />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.conflict && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">déjà présent</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function PickerRow({ label, paths, selected, onUpdate, strong = false }: { label: string; paths: string[]; selected: Set<string>; onUpdate: (paths: string[], checked: boolean) => void; strong?: boolean }) {
  const count = paths.filter(path => selected.has(path)).length;
  const state = count === 0 ? false : count === paths.length ? true : 'mixed';
  return (
    <button type="button" role="checkbox" aria-checked={state} onClick={() => onUpdate(paths, state !== true)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-emerald-50 ${strong ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold text-slate-700'}`}>
      <CheckBox state={state} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs font-semibold text-slate-500">{count}/{paths.length}</span>
    </button>
  );
}

function CheckBox({ state }: { state: boolean | 'mixed' }) {
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${state ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white text-transparent'}`} aria-hidden="true">
      {state === 'mixed' ? <FaIcon icon={faMinus} size={11} /> : <FaIcon icon={faCheck} size={11} />}
    </span>
  );
}
