import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, PanelLeftClose, PanelLeftOpen, PenLine } from 'lucide-react';
import { profContentService, type ClassEntry } from '../../../services/profContentService';
import { readableCatalogLabel } from './contentUtils';
import type { ChapterEntry } from './types';
import LoadingSpinner from '../../UI/LoadingSpinner';

interface StudioCatalogRailProps {
  chapters: ChapterEntry[];
  collapsed: boolean;
  currentPath: string | null;
  loading: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onCreateChapter: () => void;
  onCreateResource: (chapterId: string) => void;
  onOpen: (path: string) => void;
  overrides: Record<string, number>;
  selectedClass: ClassEntry | null;
  selectedClassId: string;
}

export default function StudioCatalogRail({
  chapters, collapsed, currentPath, loading, onCollapsedChange,
  onCreateChapter, onCreateResource, onOpen, overrides,
  selectedClass, selectedClassId,
}: StudioCatalogRailProps) {
  return (
    <aside
      className={`prof-studio-catalog relative z-20 flex shrink-0 flex-col overflow-hidden transition-[width] duration-300 ease-out max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:shadow-xl ${collapsed ? 'w-[60px] sm:w-[68px]' : 'w-[min(88vw,304px)] sm:w-[304px]'}`}
      aria-label="Catalogue des contenus"
    >
      <div className="relative p-3 pb-2">
        <div className={`flex h-8 items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0 pl-1">
              <p className="text-[13px] font-bold tracking-tight text-amber-950">Chapitres</p>
              <p className="mt-0.5 truncate text-[10px] font-medium text-amber-800/65">
                {selectedClass ? readableCatalogLabel(selectedClass.title) : 'Sélectionnez un niveau'}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1677ff]"
            aria-label={collapsed ? 'Développer le catalogue' : 'Réduire le catalogue'}
            title={collapsed ? 'Développer le catalogue' : 'Réduire le catalogue'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {collapsed ? (
          <div className="mt-2 flex flex-col items-center gap-1">
            {selectedClassId && (
              <button type="button" onClick={onCreateChapter} className="grid h-8 w-8 place-items-center rounded-xl bg-amber-900 text-amber-50 shadow-sm transition hover:bg-amber-800" title="Nouveau chapitre" aria-label="Nouveau chapitre">
                <PenLine size={15} />
              </button>
            )}
          </div>
        ) : (
          selectedClassId ? (
            <button type="button" onClick={onCreateChapter} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-3 text-xs font-semibold text-amber-50 shadow-sm transition hover:bg-amber-800 active:scale-[.99]">
              <PenLine size={14} /> Nouveau chapitre
            </button>
          ) : null
        )}
      </div>

      {!collapsed && (
        <div className="relative min-h-0 flex-1 overflow-y-auto p-2.5">
          {loading ? (
            <LoadingSpinner variant="section" label="Chargement du catalogue…" audience="professor" className="py-8" />
          ) : chapters.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-slate-400">Sélectionnez un niveau pour parcourir son catalogue.</p>
          ) : chapters.map((chapter, chapterIndex) => (
            <ChapterGroup key={chapter.id} chapter={chapter} chapterIndex={chapterIndex} currentPath={currentPath} isPublished={path => overrides[path] !== undefined} onOpen={onOpen} overrides={overrides} onCreateResource={onCreateResource} />
          ))}
        </div>
      )}
    </aside>
  );
}

function ChapterGroup({ chapter, chapterIndex, currentPath, isPublished, onOpen, overrides, onCreateResource }: {
  chapter: ChapterEntry;
  chapterIndex: number;
  currentPath: string | null;
  isPublished: (path: string) => boolean;
  onOpen: (path: string) => void;
  overrides: Record<string, number>;
  onCreateResource: (chapterId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [exercises, setExercises] = useState<{ id: string; path: string }[]>([]);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const quizzes = (chapter.quizzes || []).filter(item => item.path);
  const revisions = (chapter.revisions || []).filter(item => item.path);
  const currentExerciseIsHidden = exercises.slice(6).some(item => item.path === currentPath);
  const visibleExercises = showAllExercises || currentExerciseIsHidden ? exercises : exercises.slice(0, 6);

  useEffect(() => {
    if (!open || !chapter.manifestPath) return;
    let active = true;
    profContentService.fetchChapterManifest(chapter.manifestPath, overrides)
      .then(manifest => { if (active) setExercises(Array.isArray(manifest.exercises) ? manifest.exercises.filter(item => item.path) : []); })
      .catch(() => { if (active) setExercises([]); });
    return () => { active = false; };
  }, [open, chapter.manifestPath, overrides]);

  const fileButton = (label: string, path: string) => (
    <button key={path} type="button" onClick={() => onOpen(path)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-all ${currentPath === path ? 'bg-white/90 font-semibold text-[#1677ff] shadow-sm' : 'text-amber-950/70 hover:bg-white/55 hover:text-amber-950'}`} aria-current={currentPath === path ? 'page' : undefined}>
      <FileJson size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">{readableCatalogLabel(label)}</span>
      {isPublished(path) && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#52c41a]" title="Publié" aria-label="Publié" />}
    </button>
  );
  const sectionLabel = (text: string) => <p className="px-2 pb-1 pt-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{text}</p>;

  return (
    <div className="mb-1">
      <div className={`group flex items-center gap-0.5 rounded-xl pr-1 transition-all ${open ? 'bg-amber-100/80' : 'hover:bg-amber-100/55'}`}>
        <button type="button" onClick={() => setOpen(value => !value)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] font-semibold text-slate-700" aria-expanded={open}>
          <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90 text-[#1677ff]' : ''}`} />
          <span className={`font-mono text-[9px] ${open ? 'text-[#0f62fe]' : 'text-slate-400'}`}>{String(chapterIndex + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 truncate" title={readableCatalogLabel(chapter.title)}>{readableCatalogLabel(chapter.title)}</span>
        </button>
        <button type="button" onClick={() => onCreateResource(chapter.id)} title="Éditer les ressources" aria-label={`Éditer les ressources du chapitre ${readableCatalogLabel(chapter.title)}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-amber-800/55 opacity-70 transition hover:bg-white/70 hover:text-amber-900 group-hover:opacity-100"><PenLine size={13} /></button>
      </div>
      {open && (
        <div className="ml-[25px] pl-1.5">
          {quizzes.length > 0 && <>{sectionLabel('Quiz')}{quizzes.map((item, index) => fileButton(`Quiz ${index + 1}`, item.path!))}</>}
          {revisions.length > 0 && <>{sectionLabel('Révision')}{revisions.map((item, index) => fileButton(`Révision ${index + 1}`, item.path!))}</>}
          {exercises.length > 0 && <>{sectionLabel('Exercices')}{visibleExercises.map(item => fileButton(`Exercice ${exercises.findIndex(entry => entry.path === item.path) + 1}`, item.path))}{exercises.length > 6 && <button type="button" onClick={() => setShowAllExercises(value => !value)} className="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700" aria-expanded={showAllExercises}><ChevronDown size={12} className={`transition-transform ${showAllExercises ? 'rotate-180' : ''}`} />{showAllExercises ? 'Afficher moins' : `Voir plus (${exercises.length - 6})`}</button>}</>}
          {chapter.manifestPath && <>{sectionLabel('Structure')}{fileButton('manifest.json', chapter.manifestPath)}</>}
        </div>
      )}
    </div>
  );
}
