import { useCallback, useState } from 'react';
import { profContentService, type ClassEntry } from '../../../services/profContentService';
import { nextExerciseNumber, parseImportText, publishPrimaryQuizReferences, slugify } from './contentUtils';
import type { ChapterEntry, ImportEntry, ImportableKind, SaveState, StateSetter, StudioMode } from './types';

interface ResourceCreationOptions {
  chapters: ChapterEntry[];
  loadClassData: (selectedClass: ClassEntry, overrides?: Record<string, number>) => Promise<ChapterEntry[]>;
  overrides: Record<string, number>;
  selectedClass: ClassEntry | null;
  selectedClassId: string;
  setChapters: StateSetter<ChapterEntry[]>;
  setContent: StateSetter<string>;
  setCurrentPath: StateSetter<string | null>;
  setJsonError: StateSetter<string | null>;
  setMode: StateSetter<StudioMode>;
  setOriginalContent: StateSetter<string>;
  setOverrides: StateSetter<Record<string, number>>;
  setSaveState: StateSetter<SaveState>;
}

export default function useStudioResourceCreation(options: ResourceCreationOptions) {
  const { chapters, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setContent, setCurrentPath, setJsonError, setMode, setOriginalContent, setOverrides, setSaveState } = options;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ImportableKind>('quiz');
  const [chapterId, setChapterId] = useState('');
  const [creating, setCreating] = useState(false);
  const [importPasteOpen, setImportPasteOpen] = useState(false);
  const [importPasteText, setImportPasteText] = useState('');
  const [importEntries, setImportEntries] = useState<ImportEntry[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [importExpandedError, setImportExpandedError] = useState<number | null>(null);

  const create = useCallback(async () => {
    if (!selectedClass || !selectedClassId) return;
    const chapter = chapters.find(item => item.id === chapterId);
    if (!chapter) {
      setJsonError('Sélectionnez un chapitre de destination.');
      return;
    }

    setCreating(true);
    setJsonError(null);
    try {
      const manifestPath = type === 'exercise'
        ? (chapter.manifestPath || `data/${selectedClassId}/${chapter.id}/manifest.json`)
        : selectedClass.path;
      const raw = await profContentService.fetchFile(manifestPath, overrides) as Record<string, unknown>;
      const manifest = JSON.parse(JSON.stringify(raw)) as Record<string, any>;

      let base: string;
      let path: string;
      let template: unknown;

      if (type === 'exercise') {
        // Nommage automatique « Exercice N » : le prochain numéro tient compte
        // des exercices déjà présents, y compris après une suppression.
        const existing = Array.isArray(manifest.exercises) ? manifest.exercises : [];
        const number = nextExerciseNumber(existing);
        base = `exercice-${number}`;
        path = `data/${selectedClassId}/${chapter.id}/exercises/${base}.json`;
        template = { id: base, topic: `Exercice ${number}`, difficulty: 'facile', context: '', questions: [{ id: 'q1', content: 'Question 1', subQuestions: [{ id: 'a', content: '', hint: '' }] }] };
        if (!Array.isArray(manifest.exercises)) manifest.exercises = [];
        manifest.exercises.push({ id: base, path });
      } else if (type === 'quiz') {
        base = slugify(`${chapter.id}-quiz`);
        path = `data/${selectedClassId}/${chapter.id}/quiz/${base}.json`;
        template = { questions: [{ id: 'q1', type: 'mcq', question: 'Nouvelle question', options: [{ id: 'opt-0', text: 'Choix A', isCorrect: true }, { id: 'opt-1', text: 'Choix B', isCorrect: false }] }] };
        if (!Array.isArray(manifest.chapters)) manifest.chapters = [];
        const manifestChapter = manifest.chapters.find((item: any) => item.id === chapter.id);
        if (!manifestChapter) throw new Error('Chapitre introuvable dans le manifest du niveau.');
        if (!Array.isArray(manifestChapter.quizzes)) manifestChapter.quizzes = [];
        // Le dernier quiz créé devient le quiz principal affiché aux élèves.
        publishPrimaryQuizReferences(
          manifestChapter,
          [{ id: base, path }],
          Array.isArray((template as any).questions) ? (template as any).questions.length : 0,
        );
      } else {
        base = slugify(`${chapter.id}-revision`);
        path = `data/${selectedClassId}/${chapter.id}/revisions/${base}.json`;
        template = { header: { title: chapter.title, subtitle: '', context: selectedClass.title }, sections: [{ id: 'section-1', category: 'course', title: 'Section 1', blocks: [] }] };
        if (!Array.isArray(manifest.chapters)) manifest.chapters = [];
        const manifestChapter = manifest.chapters.find((item: any) => item.id === chapter.id);
        if (!manifestChapter) throw new Error('Chapitre introuvable dans le manifest du niveau.');
        if (!Array.isArray(manifestChapter.revisions)) manifestChapter.revisions = [];
        manifestChapter.revisions.push({ path });
      }

      const fileUpdatedAt = await profContentService.save(path, template);
      // Publier la ressource avant sa référence évite un catalogue pointant
      // temporairement vers un fichier encore absent.
      const manifestUpdatedAt = await profContentService.save(manifestPath, manifest);
      const nextOverrides = { ...overrides, [manifestPath]: manifestUpdatedAt, [path]: fileUpdatedAt };
      setOverrides(nextOverrides);
      setChapters(await loadClassData(selectedClass, nextOverrides));
      const text = JSON.stringify(template, null, 2);
      setCurrentPath(path);
      setContent(text);
      setOriginalContent(text);
      setSaveState('saved');
      setMode('render');
      setOpen(false);
      setChapterId('');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Création impossible');
    } finally {
      setCreating(false);
    }
  }, [chapterId, chapters, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setContent, setCurrentPath, setJsonError, setMode, setOriginalContent, setOverrides, setSaveState, type]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const entries: ImportEntry[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text().catch(() => '');
      if (!text.trim()) entries.push({ source: file.name, content: {}, kind: null, error: 'Fichier vide' });
      else entries.push(...parseImportText(text, file.name));
    }
    setImportEntries(entries);
    setImportMessage(null);
    setImportError(null);
    setImportDone(false);
    setImportExpandedError(null);
  }, []);

  const runImport = useCallback(async () => {
    if (!selectedClass || !selectedClassId) return;
    const chapter = chapters.find(item => item.id === chapterId);
    if (!chapter) { setImportError('Sélectionnez un chapitre de destination.'); return; }
    const valid = importEntries.filter(entry => entry.kind && !entry.error);
    if (!valid.length) { setImportError('Aucun document valide à importer.'); return; }
    setImportBusy(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const chapterManifestPath = chapter.manifestPath || `data/${selectedClassId}/${chapter.id}/manifest.json`;
      const chapterManifest = JSON.parse(JSON.stringify(await profContentService.fetchFile(chapterManifestPath, overrides))) as Record<string, any>;
      const classManifest = JSON.parse(JSON.stringify(await profContentService.fetchFile(selectedClass.path, overrides))) as Record<string, any>;
      const existingChapter = classManifest.chapters?.find((item: any) => item.id === chapter.id) || {};
      const counters: Record<ImportableKind, number> = {
        exercise: nextExerciseNumber(Array.isArray(chapterManifest.exercises) ? chapterManifest.exercises : []) - 1,
        quiz: Array.isArray(existingChapter.quizzes) ? existingChapter.quizzes.length : 0,
        revision: Array.isArray(existingChapter.revisions) ? existingChapter.revisions.length : 0,
      };
      const injected: Array<{ kind: ImportableKind; base: string; path: string; content: Record<string, unknown> }> = [];
      for (const entry of valid) {
        const kind = entry.kind as ImportableKind;
        const number = ++counters[kind];
        const base = kind === 'exercise' ? `exercice-${number}` : kind === 'quiz' ? `quiz-${number}` : `revision-${number}`;
        const topic = kind === 'exercise' ? `Exercice ${number}` : kind === 'quiz' ? `Quiz ${number}` : `Révision ${number}`;
        const directory = kind === 'exercise' ? 'exercises' : kind === 'quiz' ? 'quiz' : 'revisions';
        const path = `data/${selectedClassId}/${chapter.id}/${directory}/${base}.json`;
        const content = kind === 'exercise' ? { ...entry.content, id: String(entry.content.id || base), topic: String(entry.content.topic || topic) } : { ...entry.content };
        injected.push({ kind, base, path, content });
      }
      const exercises = injected.filter(item => item.kind === 'exercise');
      const others = injected.filter(item => item.kind !== 'exercise');
      if (exercises.length) {
        if (!Array.isArray(chapterManifest.exercises)) chapterManifest.exercises = [];
        for (const item of exercises) chapterManifest.exercises.push({ id: item.base, path: item.path });
      }
      if (others.length) {
        if (!Array.isArray(classManifest.chapters)) classManifest.chapters = [];
        const manifestChapter = classManifest.chapters.find((item: any) => item.id === chapter.id);
        if (!manifestChapter) throw new Error('Chapitre introuvable dans le manifest du niveau.');
        const importedQuizzes = others.filter(item => item.kind === 'quiz');
        const importedRevisions = others.filter(item => item.kind === 'revision');
        if (importedQuizzes.length) {
          const primaryQuestions = (importedQuizzes[0].content as any).questions;
          publishPrimaryQuizReferences(
            manifestChapter,
            importedQuizzes.map(item => ({ id: item.base, path: item.path })),
            Array.isArray(primaryQuestions) ? primaryQuestions.length : 0,
          );
        }
        if (importedRevisions.length) {
          if (!Array.isArray(manifestChapter.revisions)) manifestChapter.revisions = [];
          for (const item of importedRevisions) manifestChapter.revisions.push({ path: item.path });
        }
      }
      const nextOverrides = { ...overrides };
      // Les fichiers sont disponibles avant que les manifestes ne les exposent.
      for (const item of injected) nextOverrides[item.path] = await profContentService.save(item.path, item.content);
      if (exercises.length) nextOverrides[chapterManifestPath] = await profContentService.save(chapterManifestPath, chapterManifest);
      if (others.length) nextOverrides[selectedClass.path] = await profContentService.save(selectedClass.path, classManifest);
      setOverrides(nextOverrides);
      setChapters(await loadClassData(selectedClass, nextOverrides));
      const rejected = importEntries.length - valid.length;
      setImportMessage(`Importé : ${valid.length} ressource(s).${rejected ? ` ${rejected} rejeté(s).` : ''}`);
      setImportEntries([]);
      setImportPasteText('');
      setImportDone(true);
      setChapterId('');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import impossible');
    } finally {
      setImportBusy(false);
    }
  }, [chapterId, chapters, importEntries, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setOverrides]);

  const analyzePaste = useCallback(() => {
    setImportEntries(parseImportText(importPasteText, 'collé'));
    setImportMessage(null);
    setImportError(null);
  }, [importPasteText]);

  const openForChapter = useCallback((nextChapterId: string) => {
    setChapterId(nextChapterId);
    setImportEntries([]);
    setImportMessage(null);
    setImportError(null);
    setImportDone(false);
    setImportExpandedError(null);
    setOpen(true);
  }, []);

  return {
    analyzePaste, chapterId, create, creating, handleFiles, importBusy, importDone,
    importEntries, importError, importExpandedError, importMessage, importPasteOpen,
    importPasteText, open, openForChapter, runImport, setImportExpandedError,
    setImportPasteOpen, setImportPasteText, setOpen, setType, type,
  };
}
