import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { profContentService, type ClassEntry } from '../../../services/profContentService';
import type { ProfShellApi } from '../profShellContext';
import { detectContentType, getDocumentKind, getJsonParseError, parseJsonContent, validateStudioDocument } from './contentUtils';
import { confirmDocumentSwitch, createLatestRequestGate } from './latestRequestGate';
import type { ChapterEntry, HistoryEntry, SaveState, StateSetter, StudioMode } from './types';
import { flushPendingStudioDrafts, hasPendingStudioDrafts } from '../studioDraftRegistry';

interface StudioDocumentOptions {
  chapters: ChapterEntry[];
  loadClassData: (selectedClass: ClassEntry, overrides?: Record<string, number>) => Promise<ChapterEntry[]>;
  overrides: Record<string, number>;
  selectedClass: ClassEntry | null;
  selectedClassId: string;
  setChapters: StateSetter<ChapterEntry[]>;
  setOverrides: StateSetter<Record<string, number>>;
  shell: ProfShellApi | null;
}

export default function useStudioDocument(options: StudioDocumentOptions) {
  const { chapters, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setOverrides, shell } = options;
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loadingFile, setLoadingFile] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [mode, setMode] = useState<StudioMode>('json');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const openRequestGateRef = useRef(createLatestRequestGate());
  const contentRef = useRef(content);
  const isDirty = content !== originalContent;

  useEffect(() => { contentRef.current = content; }, [content]);

  const openFile = useCallback(async (path: string) => {
    if (!flushPendingStudioDrafts()) {
      setJsonError('Un champ en cours contient une valeur invalide. Corrigez-le avant de changer de document.');
      return false;
    }
    const hasChanges = contentRef.current !== originalContent;
    if (!confirmDocumentSwitch(hasChanges, path, message => window.confirm(message))) return false;
    const requestId = openRequestGateRef.current.begin();
    setCurrentPath(path);
    setLoadingFile(true);
    setSaveState('idle');
    setJsonError(null);
    try {
      const data = await profContentService.fetchFile(path, overrides);
      if (!openRequestGateRef.current.isCurrent(requestId)) return false;
      const text = JSON.stringify(data, null, 2);
      setContent(text);
      setOriginalContent(text);
      setMode(detectContentType(data) ? 'render' : 'json');
    } catch {
      if (!openRequestGateRef.current.isCurrent(requestId)) return false;
      setContent('');
      setOriginalContent('');
      setJsonError('Impossible de charger ce fichier.');
    } finally {
      if (openRequestGateRef.current.isCurrent(requestId)) setLoadingFile(false);
    }
    return true;
  }, [originalContent, overrides]);

  const save = useCallback(async () => {
    if (!currentPath) return;
    if (!flushPendingStudioDrafts()) {
      setJsonError('Un champ en cours contient une valeur invalide. Corrigez-le avant de publier.');
      setSaveState('error');
      return;
    }
    const contentToSave = contentRef.current;
    let parsed: unknown;
    try { parsed = JSON.parse(contentToSave); }
    catch {
      setJsonError('JSON invalide : vérifiez la syntaxe avant de publier.');
      setSaveState('error');
      return;
    }
    const validationErrors = validateStudioDocument(parsed);
    if (validationErrors.length > 0) {
      setJsonError(`Publication bloquée — ${validationErrors.slice(0, 3).join(' ')}`);
      setSaveState('error');
      return;
    }
    setJsonError(null);
    setSaveState('saving');
    try {
      const updatedAt = await profContentService.save(currentPath, parsed);
      const publishedOverrides: Record<string, number> = { [currentPath]: updatedAt };

      // Le badge du tableau de bord dépend de quizCount. Lorsqu'on modifie le
      // quiz principal, publier aussi son nouveau nombre de questions.
      const quizMatch = currentPath.match(/^data\/([^/]+)\/([^/]+)\/quiz\/.+\.json$/);
      if (quizMatch && selectedClass && quizMatch[1] === selectedClassId) {
        const chapterId = quizMatch[2];
        const classManifest = JSON.parse(JSON.stringify(
          await profContentService.fetchFile(selectedClass.path, { ...overrides, ...publishedOverrides }),
        )) as Record<string, any>;
        const chapter = classManifest.chapters?.find((item: any) => item.id === chapterId);
        const isPrimaryQuiz = chapter?.quizzes?.[0]?.path === currentPath;
        const questionCount = Array.isArray((parsed as any)?.questions) ? (parsed as any).questions.length : 0;
        if (isPrimaryQuiz && chapter.quizCount !== questionCount) {
          chapter.quizCount = questionCount;
          publishedOverrides[selectedClass.path] = await profContentService.save(selectedClass.path, classManifest);
        }
      }

      setOriginalContent(contentToSave);
      setOverrides(previous => ({ ...previous, ...publishedOverrides }));
      if (selectedClass && publishedOverrides[selectedClass.path]) {
        setChapters(await loadClassData(selectedClass, { ...overrides, ...publishedOverrides }));
      }
      setSaveState('saved');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Publication impossible');
      setSaveState('error');
    }
  }, [currentPath, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setOverrides]);

  const revert = useCallback(() => {
    setContent(originalContent);
    contentRef.current = originalContent;
    setEditorRevision(value => value + 1);
    setSaveState('idle');
    setJsonError(null);
  }, [originalContent]);

  const remove = useCallback(async () => {
    if (!currentPath) return;
    const resourceName = currentPath.split('/').pop() || currentPath;
    if (!window.confirm(`Retirer « ${resourceName} » du catalogue ?\n\nCette ressource ne sera plus proposée aux élèves.`)) return;
    setSaveState('saving');
    setJsonError(null);
    try {
      await profContentService.remove(currentPath);
      const match = currentPath.match(/^data\/([^/]+)\/([^/]+)\/(exercises|quiz|revisions)\/(.+)$/);
      if (match) {
        const [, , chapterId, kind] = match;
        if (kind === 'exercises') {
          const chapter = chapters.find(item => item.id === chapterId);
          const manifestPath = chapter?.manifestPath || `data/${selectedClassId}/${chapterId}/manifest.json`;
          try {
            const raw = await profContentService.fetchFile(manifestPath, overrides) as Record<string, unknown>;
            const manifest = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
            if (Array.isArray(manifest.exercises)) manifest.exercises = manifest.exercises.filter((item: any) => item.path !== currentPath);
            const updatedAt = await profContentService.save(manifestPath, manifest);
            setOverrides(previous => ({ ...previous, [manifestPath]: updatedAt }));
          } catch { /* manifest de chapitre absent */ }
        } else if (selectedClass) {
          const raw = await profContentService.fetchFile(selectedClass.path, overrides) as Record<string, unknown>;
          const manifest = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
          const chapter = manifest.chapters?.find((item: any) => item.id === chapterId);
          if (chapter) {
            if (kind === 'quiz') {
              chapter.quizzes = (chapter.quizzes || []).filter((item: any) => item.path !== currentPath);
              const nextPrimaryPath = chapter.quizzes[0]?.path;
              if (nextPrimaryPath) {
                try {
                  const nextQuiz = await profContentService.fetchFile(nextPrimaryPath, overrides) as Record<string, any>;
                  chapter.quizCount = Array.isArray(nextQuiz.questions) ? nextQuiz.questions.length : 0;
                } catch {
                  chapter.quizCount = 0;
                }
              } else {
                chapter.quizCount = 0;
              }
            } else chapter.revisions = (chapter.revisions || []).filter((item: any) => item.path !== currentPath);
            const updatedAt = await profContentService.save(selectedClass.path, manifest);
            setOverrides(previous => ({ ...previous, [selectedClass.path]: updatedAt }));
          }
        }
      }
      const nextOverrides = { ...overrides };
      delete nextOverrides[currentPath];
      setOverrides(nextOverrides);
      setSaveState('saved');
      setCurrentPath(null);
      setContent('');
      setOriginalContent('');
      if (selectedClass) setChapters(await loadClassData(selectedClass, nextOverrides));
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Suppression impossible');
      setSaveState('error');
    }
  }, [chapters, currentPath, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setOverrides]);

  const openHistory = useCallback(async () => {
    if (!currentPath) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setJsonError(null);
    try { setHistoryList(await profContentService.fetchHistory(currentPath)); }
    catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Historique indisponible');
      setHistoryList([]);
    } finally { setHistoryLoading(false); }
  }, [currentPath]);

  const loadHistoryVersion = useCallback((entry: HistoryEntry) => {
    const nextContent = JSON.stringify(entry.content, null, 2);
    setContent(nextContent);
    contentRef.current = nextContent;
    setEditorRevision(value => value + 1);
    setSaveState('idle');
    setHistoryOpen(false);
  }, []);

  const updateContent = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    setContent(nextContent);
    setSaveState('idle');
  }, []);
  const parsedContent = useMemo(() => parseJsonContent(content), [content]);
  const parseError = useMemo(() => getJsonParseError(content), [content]);
  const documentKind = useMemo(() => getDocumentKind(parsedContent), [parsedContent]);

  useEffect(() => {
    if (!shell) return;
    shell.reportDocument({ path: currentPath, dirty: Boolean(currentPath) && isDirty, saving: saveState === 'saving', invalid: Boolean(jsonError) });
  }, [currentPath, isDirty, jsonError, saveState, shell]);

  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    if (!shell) return;
    shell.registerSave(() => { void saveRef.current(); });
    return () => shell.registerSave(null);
  }, [shell]);
  useEffect(() => {
    if (!shell) return;
    return () => shell.reportDocument(null);
  }, [shell]);
  useEffect(() => {
    if (shell) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void save();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save, shell]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!isDirty && !hasPendingStudioDrafts()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);
  useEffect(() => {
    try {
      if (currentPath) sessionStorage.setItem('mathplus:media-folder', currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '');
      else sessionStorage.removeItem('mathplus:media-folder');
    } catch { /* stockage restreint */ }
  }, [currentPath]);

  return {
    content, currentPath, editorRevision, ...documentKind, historyList, historyLoading, historyOpen,
    isDirty, jsonError, loadHistoryVersion, loadingFile, mode, openFile, openHistory,
    parseError, parsedContent, remove, revert, save, saveState, setContent,
    setCurrentPath, setHistoryOpen, setJsonError, setMode, setOriginalContent,
    setSaveState, updateContent,
  };
}
