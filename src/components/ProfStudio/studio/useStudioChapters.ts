import { useCallback, useState } from 'react';
import { profContentService, type ClassEntry } from '../../../services/profContentService';
import { slugify } from './contentUtils';
import type { ChapterEntry, StateSetter } from './types';

interface StudioChaptersOptions {
  chapters: ChapterEntry[];
  loadClassData: (selectedClass: ClassEntry, overrides?: Record<string, number>) => Promise<ChapterEntry[]>;
  overrides: Record<string, number>;
  selectedClass: ClassEntry | null;
  selectedClassId: string;
  setChapters: StateSetter<ChapterEntry[]>;
  setJsonError: StateSetter<string | null>;
  setOverrides: StateSetter<Record<string, number>>;
}

export default function useStudioChapters(options: StudioChaptersOptions) {
  const { chapters, loadClassData, overrides, selectedClass, selectedClassId, setChapters, setJsonError, setOverrides } = options;
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const loadManifest = useCallback(async (): Promise<Record<string, any>> => {
    if (!selectedClass) throw new Error('Aucun niveau sélectionné.');
    const raw = await profContentService.fetchFile(selectedClass.path, overrides) as Record<string, unknown>;
    return JSON.parse(JSON.stringify(raw)) as Record<string, any>;
  }, [overrides, selectedClass]);

  const create = useCallback(async (titleInput: string) => {
    if (!selectedClass || !selectedClassId) return;
    const title = titleInput.trim();
    const id = slugify(title);
    const manifestPath = `data/${selectedClassId}/${id}/manifest.json`;
    const classManifest = await loadManifest();
    if (!Array.isArray(classManifest.chapters)) classManifest.chapters = [];
    if (classManifest.chapters.some((item: any) => item.id === id)) throw new Error('Un chapitre avec cet identifiant existe déjà.');
    classManifest.chapters.push({ id, title, manifestPath, quizzes: [], revisions: [] });
    const chapterUpdatedAt = await profContentService.save(manifestPath, { id, title, exercises: [] });
    const classUpdatedAt = await profContentService.save(selectedClass.path, classManifest);
    const nextOverrides = { ...overrides, [manifestPath]: chapterUpdatedAt, [selectedClass.path]: classUpdatedAt };
    setOverrides(nextOverrides);
    setChapters(await loadClassData(selectedClass, nextOverrides));
  }, [loadClassData, loadManifest, overrides, selectedClass, selectedClassId, setChapters, setOverrides]);

  const rename = useCallback(async (id: string, titleInput: string) => {
    if (!selectedClass) return;
    const title = titleInput.trim();
    if (!title) return;
    const classManifest = await loadManifest();
    const chapter = classManifest.chapters?.find((item: any) => item.id === id);
    if (!chapter) throw new Error('Chapitre introuvable.');
    chapter.title = title;
    const classUpdatedAt = await profContentService.save(selectedClass.path, classManifest);
    const nextOverrides = { ...overrides, [selectedClass.path]: classUpdatedAt };
    if (chapter.manifestPath) {
      try {
        const chapterManifest = await profContentService.fetchFile(chapter.manifestPath, overrides) as Record<string, any>;
        chapterManifest.title = title;
        await profContentService.save(chapter.manifestPath, chapterManifest);
      } catch { /* manifest de chapitre absent */ }
    }
    setOverrides(nextOverrides);
    setChapters(await loadClassData(selectedClass, nextOverrides));
  }, [loadClassData, loadManifest, overrides, selectedClass, setChapters, setOverrides]);

  const remove = useCallback(async (id: string) => {
    if (!selectedClass) return;
    const classManifest = await loadManifest();
    const chapter = classManifest.chapters?.find((item: any) => item.id === id);
    if (!chapter) return;
    classManifest.chapters = classManifest.chapters.filter((item: any) => item.id !== id);
    const classUpdatedAt = await profContentService.save(selectedClass.path, classManifest);
    if (chapter.manifestPath) await profContentService.remove(chapter.manifestPath).catch(() => {});
    const nextOverrides = { ...overrides, [selectedClass.path]: classUpdatedAt };
    if (chapter.manifestPath) delete nextOverrides[chapter.manifestPath];
    setOverrides(nextOverrides);
    setChapters(await loadClassData(selectedClass, nextOverrides));
  }, [loadClassData, loadManifest, overrides, selectedClass, setChapters, setOverrides]);

  const submit = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true);
    setJsonError(null);
    try {
      await create(name);
      setModalOpen(false);
      setName('');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Création du chapitre impossible');
    } finally { setBusy(false); }
  }, [create, name, setJsonError]);

  const requestRename = useCallback(async (id: string, title: string) => {
    setJsonError(null);
    try { await rename(id, title); }
    catch (error) { setJsonError(error instanceof Error ? error.message : 'Renommage impossible'); }
  }, [rename, setJsonError]);

  const requestDelete = useCallback(async (id: string) => {
    const chapter = chapters.find(item => item.id === id);
    if (!window.confirm(`Supprimer le chapitre « ${chapter?.title || id} » ?\n\nSes ressources seront retirées du catalogue.`)) return false;
    setJsonError(null);
    try { await remove(id); return true; }
    catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Suppression impossible');
      return false;
    }
  }, [chapters, remove, setJsonError]);

  const showModal = useCallback(() => {
    setName('');
    setModalOpen(true);
  }, []);

  return { busy, modalOpen, name, requestDelete, requestRename, setModalOpen, setName, showModal, submit };
}
