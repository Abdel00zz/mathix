import { useCallback, useEffect, useState } from 'react';
import { profContentService, type ClassEntry } from '../../../services/profContentService';
import { printPrepared } from '../../../services/printService';
import { loadPrintLayout, pageBoxMm, printPageCss, savePrintLayout, type PrintLayout } from '../../../services/printLayout';
import type { Exercise } from '../../../types';
import type { ChapterEntry, ImportableKind, ManagedExercise, PrintJob, StateSetter } from './types';

interface ResourceLibraryOptions {
  chapterId: string;
  chapters: ChapterEntry[];
  loadClassData: (selectedClass: ClassEntry, overrides?: Record<string, number>) => Promise<ChapterEntry[]>;
  open: boolean;
  overrides: Record<string, number>;
  selectedClass: ClassEntry | null;
  selectedClassId: string;
  setChapters: StateSetter<ChapterEntry[]>;
  setJsonError: StateSetter<string | null>;
  setOverrides: StateSetter<Record<string, number>>;
}

export default function useStudioResourceLibrary(options: ResourceLibraryOptions) {
  const { chapterId, chapters, loadClassData, open, overrides, selectedClass, selectedClassId, setChapters, setJsonError, setOverrides } = options;
  const [exercises, setExercises] = useState<ManagedExercise[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);

  useEffect(() => {
    if (!open || !chapterId) return;
    let active = true;
    const chapter = chapters.find(item => item.id === chapterId);
    const load = chapter?.manifestPath
      ? profContentService.fetchChapterManifest(chapter.manifestPath, overrides).then(manifest => (Array.isArray(manifest.exercises) ? manifest.exercises.filter((item: any) => item.path) : []) as ManagedExercise[])
      : Promise.resolve([] as ManagedExercise[]);
    load.then(list => {
      if (!active) return;
      setExercises(list);
      setSelection(new Set());
    }).catch(() => { if (active) setExercises([]); });
    return () => { active = false; };
  }, [chapterId, chapters, open, overrides]);

  const renumber = useCallback(async (fromIndex: number, newNumber: number) => {
    const chapter = chapters.find(item => item.id === chapterId);
    if (!chapter) return;
    const manifestPath = chapter.manifestPath || `data/${selectedClassId}/${chapterId}/manifest.json`;
    
    // Optimistic instant reorder in local state
    setExercises(prev => {
      const next = [...prev];
      if (fromIndex < 0 || fromIndex >= next.length) return prev;
      const target = Math.max(0, Math.min(next.length - 1, newNumber - 1));
      if (target === fromIndex) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(target, 0, moved);
      return next;
    });

    try {
      const manifest = JSON.parse(JSON.stringify(await profContentService.fetchFile(manifestPath, overrides))) as Record<string, any>;
      const manifestExercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];
      if (fromIndex < 0 || fromIndex >= manifestExercises.length) return;
      const target = Math.max(0, Math.min(manifestExercises.length - 1, newNumber - 1));
      if (target === fromIndex) return;
      const [moved] = manifestExercises.splice(fromIndex, 1);
      manifestExercises.splice(target, 0, moved);
      manifest.exercises = manifestExercises;
      const updatedAt = await profContentService.save(manifestPath, manifest);
      setOverrides(previous => ({ ...previous, [manifestPath]: updatedAt }));
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Renumérotation impossible');
    }
  }, [chapterId, chapters, overrides, selectedClassId, setJsonError, setOverrides]);

  const remove = useCallback(async (paths: string[], kind: ImportableKind) => {
    const chapter = chapters.find(item => item.id === chapterId);
    if (!chapter || !selectedClass || !paths.length) return;
    const kindLabel = kind === 'quiz' ? 'quiz' : kind === 'revision' ? 'fiche de révision' : 'exercice';
    const description = paths.length === 1 ? `ce ${kindLabel}` : `ces ${paths.length} ${kind === 'quiz' ? 'quiz' : kind === 'revision' ? 'fiches de révision' : 'exercices'}`;
    if (!window.confirm(`Supprimer définitivement ${description} ?\n\nCette action les retirera du catalogue du chapitre « ${chapter.title} ».`)) return;
    try {
      for (const path of paths) await profContentService.remove(path);
      const pathSet = new Set(paths);
      const nextOverrides = { ...overrides };
      for (const path of paths) delete nextOverrides[path];
      if (kind === 'exercise') {
        const manifestPath = chapter.manifestPath || `data/${selectedClassId}/${chapterId}/manifest.json`;
        const manifest = JSON.parse(JSON.stringify(await profContentService.fetchFile(manifestPath, overrides))) as Record<string, any>;
        if (Array.isArray(manifest.exercises)) manifest.exercises = manifest.exercises.filter((item: any) => !pathSet.has(item.path));
        nextOverrides[manifestPath] = await profContentService.save(manifestPath, manifest);
      } else {
        const classManifest = JSON.parse(JSON.stringify(await profContentService.fetchFile(selectedClass.path, overrides))) as Record<string, any>;
        const manifestChapter = classManifest.chapters?.find((item: any) => item.id === chapterId);
        if (manifestChapter) {
          if (kind === 'quiz') manifestChapter.quizzes = (manifestChapter.quizzes || []).filter((item: any) => !pathSet.has(item.path));
          else manifestChapter.revisions = (manifestChapter.revisions || []).filter((item: any) => !pathSet.has(item.path));
          nextOverrides[selectedClass.path] = await profContentService.save(selectedClass.path, classManifest);
        }
      }
      setOverrides(nextOverrides);
      setChapters(await loadClassData(selectedClass, nextOverrides));
      setSelection(new Set());
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Suppression impossible');
    }
  }, [chapterId, chapters, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setJsonError, setOverrides]);

  const rename = useCallback(async (path: string, kind: ImportableKind, newName: string) => {
    const cleanName = newName.trim();
    if (!cleanName) return;
    try {
      const file = await profContentService.fetchFile(path, overrides) as Record<string, any>;
      const updated = kind === 'exercise' ? { ...file, topic: cleanName }
        : kind === 'revision' ? { ...file, header: { ...(file.header || {}), title: cleanName } }
          : { ...file, title: cleanName };
      const updatedAt = await profContentService.save(path, updated);
      const nextOverrides = { ...overrides, [path]: updatedAt };
      setOverrides(nextOverrides);
      if (selectedClass) setChapters(await loadClassData(selectedClass, nextOverrides));
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Renommage impossible');
    }
  }, [loadClassData, overrides, selectedClass, setChapters, setJsonError, setOverrides]);

  const print = useCallback(async () => {
    const chapter = chapters.find(item => item.id === chapterId);
    if (!chapter || !selectedClassId) return;
    const selectedExercises = exercises.filter(item => selection.has(item.path));
    if (!selectedExercises.length) { setJsonError('Sélectionnez au moins un exercice à imprimer.'); return; }
    setPrinting(true);
    setJsonError(null);
    try {
      const loaded: Exercise[] = [];
      for (const exercise of selectedExercises) {
        const raw = await profContentService.fetchFile(exercise.path, overrides) as Partial<Exercise> | null;
        if (!raw || !Array.isArray(raw.questions)) continue;
        loaded.push({ id: raw.id || exercise.path.split('/').pop()?.replace(/\.json$/, '') || exercise.path, chapterId: chapter.id, classId: selectedClassId, topic: raw.topic, context: raw.context, questions: raw.questions as Exercise['questions'], media: raw.media });
      }
      if (!loaded.length) { setJsonError("Aucun des exercices sélectionnés n'est imprimable."); setPrinting(false); return; }
      setPrintJob({ exercises: loaded, chapterTitle: chapter.title, classId: selectedClassId, layout: loadPrintLayout() });
      setPrintModalOpen(true);
      setPrinting(false);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Préparation de l'impression impossible");
      setPrinting(false);
    }
  }, [chapterId, chapters, exercises, overrides, selectedClassId, selection, setJsonError]);

  useEffect(() => {
    if (!printJob || !printRequested) return;
    let active = true;
    void printPrepared({ selector: '.prof-studio-print-job', pageCss: printPageCss(printJob.layout), contentWidthMm: pageBoxMm(printJob.layout).contentWidth })
      .catch(error => { if (active) setJsonError(error instanceof Error ? error.message : 'Impression impossible'); })
      .finally(() => { if (active) { setPrintJob(null); setPrintRequested(false); setPrinting(false); } });
    return () => { active = false; };
  }, [printJob, printRequested, setJsonError]);

  const confirmPrint = useCallback((layout: PrintLayout) => {
    savePrintLayout(layout);
    setPrintJob(previous => previous ? { ...previous, layout } : null);
    setPrintModalOpen(false);
    setPrinting(true);
    setPrintRequested(true);
  }, []);

  const cancelPrint = useCallback(() => {
    setPrintModalOpen(false);
    setPrintJob(null);
    setPrintRequested(false);
    setPrinting(false);
  }, []);

  return { cancelPrint, confirmPrint, exercises, print, printJob, printModalOpen, printing, remove, rename, renumber, selection, setSelection };
}
