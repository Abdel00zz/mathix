import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { CONTENT_OVERRIDES_UPDATED_EVENT } from '../../services/contentOverrides';
import { profContentService, type ClassEntry } from '../../services/profContentService';
import { useProfShell } from './profShellContext';
import StudioCatalogRail from './studio/StudioCatalogRail';
import StudioDocumentWorkspace from './studio/StudioDocumentWorkspace';
import StudioHeader from './studio/StudioHeader';
import ResourceManagerModal from './studio/ResourceManagerModal';
import { ChapterModal, HistoryModal, StudioPrintJob } from './studio/StudioSimpleModals';
import useStudioChapters from './studio/useStudioChapters';
import useStudioDocument from './studio/useStudioDocument';
import useStudioResourceCreation from './studio/useStudioResourceCreation';
import useStudioResourceLibrary from './studio/useStudioResourceLibrary';
import type { ChapterEntry } from './studio/types';
import ExercisePrintModal from './print/ExercisePrintModal';
import { useIsPhone } from '../../hooks/useMediaQuery';

interface ProfStudioAppProps {
  classId: string;
  onLogout?: () => void;
  /** Mode admin : autorise l'accès sans session prof (édition du contenu officiel). */
  adminMode?: boolean;
  /** Fichier à ouvrir, demandé par la coque (accueil). */
  targetPath?: string | null;
  /** Accusé de réception : la coque peut oublier sa demande. */
  onTargetPathConsumed?: () => void;
}

export default function ProfStudioApp({ classId, onLogout, adminMode = false, targetPath = null, onTargetPathConsumed }: ProfStudioAppProps) {
  const professorAccess = useProfessorAccess();
  // Coque persistante (`null` en mode admin, où le Studio tourne seul) : elle
  // affiche l'état du document et déclenche la publication via Ctrl+S.
  const shell = useProfShell();
  const isPhone = useIsPhone();
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  // Admin : sélection manuelle dans le header (browse tous les niveaux).
  const [adminClassId, setAdminClassId] = useState('');
  // Prof : la classe est fournie explicitement par la coque. Admin : sélection
  // manuelle dans le Studio.
  const selectedClassId = adminMode ? adminClassId : classId;
  const [chapters, setChapters] = useState<ChapterEntry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loadingClass, setLoadingClass] = useState(Boolean(classId));
  const [catalogCollapsed, setCatalogCollapsed] = useState(() => {
    try { return localStorage.getItem('mathplus:studio-catalog-collapsed') === 'true'; }
    catch { return false; }
  });
  // Manifeste des overrides chargé : une demande d'ouverture arrivée avant lui
  // devrait attendre, sinon le fichier serait lu sans sa version publiée.
  const [manifestReady, setManifestReady] = useState(false);
  // Dernier niveau dont le catalogue a été chargé. Sans ce garde-fou, publier
  // rejouait l'effet de classe (via `overrides` → `loadClassData`) et refermait
  // le fichier ouvert.
  const loadedClassRef = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem('mathplus:studio-catalog-collapsed', String(catalogCollapsed)); }
    catch { /* stockage restreint */ }
  }, [catalogCollapsed]);

  // Chargement initial du catalogue des niveaux + manifest des overrides,
  // et resynchronisation bidirectionnelle lors d'une mise à jour appliquée.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [classList, files] = await Promise.all([
          profContentService.fetchClasses(),
          profContentService.fetchOverrides(),
        ]);
        if (!active) return;
        setClasses(classList);
        setOverrides(files);
        setManifestReady(true);
      } catch { /* la grille reste vide, l'utilisateur peut réessayer */ }
    })();
    const onExternalSync = () => {
      void profContentService.fetchOverrides().then(files => {
        if (active) setOverrides(files);
      }).catch(() => {});
    };
    window.addEventListener(CONTENT_OVERRIDES_UPDATED_EVENT, onExternalSync);
    return () => {
      active = false;
      window.removeEventListener(CONTENT_OVERRIDES_UPDATED_EVENT, onExternalSync);
    };
  }, []);

  const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId) || null, [classes, selectedClassId]);

  const loadClassData = useCallback(async (cls: ClassEntry, ov = overrides): Promise<ChapterEntry[]> => {
    return profContentService.fetchClassChapters(cls, ov);
  }, [overrides]);

  const {
    content,
    currentPath,
    editorRevision,
    historyList,
    historyLoading,
    historyOpen,
    isDirty,
    isExercise,
    isQuiz,
    isRevision,
    isVisualSupported,
    jsonError,
    loadHistoryVersion,
    loadingFile,
    mode,
    openFile,
    openHistory,
    parseError,
    parsedContent,
    remove,
    revert,
    save,
    saveState,
    setContent,
    setCurrentPath,
    setHistoryOpen,
    setJsonError,
    setMode,
    setOriginalContent,
    setSaveState,
    updateContent,
  } = useStudioDocument({
    chapters,
    loadClassData,
    overrides,
    selectedClass,
    selectedClassId,
    setChapters,
    setOverrides,
    shell,
  });

  const openCatalogDocument = useCallback(async (path: string) => {
    const opened = await openFile(path);
    if (opened && isPhone) setCatalogCollapsed(true);
  }, [isPhone, openFile]);

  const {
    analyzePaste,
    chapterId: newChapterId,
    create: createResource,
    creating,
    handleFiles: handleImportFiles,
    importBusy,
    importDone,
    importEntries,
    importError,
    importExpandedError,
    importMessage,
    importPasteOpen,
    importPasteText,
    open: newOpen,
    openForChapter: openCreateResourceForChapter,
    runImport: runBatchImport,
    setImportExpandedError,
    setImportPasteOpen,
    setImportPasteText,
    setOpen: setNewOpen,
    setType: setNewType,
    type: newType,
  } = useStudioResourceCreation({
    chapters,
    loadClassData,
    overrides,
    selectedClass,
    selectedClassId,
    setChapters,
    setContent,
    setCurrentPath,
    setJsonError,
    setMode,
    setOriginalContent,
    setOverrides,
    setSaveState,
  });

  const {
    cancelPrint,
    confirmPrint,
    exercises: managerExercises,
    print: printChapterExercises,
    printJob,
    printModalOpen,
    printing: printingChapter,
    remove: deleteResources,
    rename: renameResource,
    renumber: renumberExercise,
    selection: resourceSelection,
    setSelection: setResourceSelection,
  } = useStudioResourceLibrary({
    chapterId: newChapterId,
    chapters,
    loadClassData,
    open: newOpen,
    overrides,
    selectedClass,
    selectedClassId,
    setChapters,
    setJsonError,
    setOverrides,
  });

  // Charge le catalogue du niveau sélectionné (au montage, puis à chaque changement).
  useEffect(() => {
    if (!selectedClass) return;
    let active = true;
    // Un rechargement dû à `overrides` (publication) rafraîchit la liste sans
    // toucher au fichier ouvert ; seul un vrai changement de niveau le referme.
    const classChanged = loadedClassRef.current !== selectedClass.id;
    loadedClassRef.current = selectedClass.id;
    (async () => {
      try {
        const chaptersList = await loadClassData(selectedClass);
        if (!active) return;
        setChapters(chaptersList);
        if (classChanged) {
          setCurrentPath(null);
          setContent('');
          setOriginalContent('');
          setJsonError(null);
        }
      } catch {
        if (active) {
          setChapters([]);
          setJsonError('Impossible de charger le catalogue de ce niveau.');
        }
      } finally {
        if (active) setLoadingClass(false);
      }
    })();
    return () => { active = false; };
  }, [selectedClass, loadClassData, setContent, setCurrentPath, setJsonError, setOriginalContent]);

  // Demande d'ouverture venue de la coque (accueil). Elle attend le manifeste
  // des overrides : sans lui, on lirait la version statique.
  useEffect(() => {
    if (!targetPath || !manifestReady) return;
    let cancelled = false;
    const run = async () => {
      await openFile(targetPath);
      if (!cancelled) onTargetPathConsumed?.();
    };
    void run();
    return () => { cancelled = true; };
  }, [targetPath, manifestReady, openFile, onTargetPathConsumed]);

  const {
    busy: chapterBusy,
    modalOpen: chapterModalOpen,
    name: chapterName,
    requestDelete: requestDeleteChapter,
    requestRename: requestRenameChapter,
    setModalOpen: setChapterModalOpen,
    setName: setChapterName,
    showModal: showChapterModal,
    submit: submitChapter,
  } = useStudioChapters({
    chapters,
    loadClassData,
    overrides,
    selectedClass,
    selectedClassId,
    setChapters,
    setJsonError,
    setOverrides,
  });

  const selectedManagerChapter = useMemo(
    () => chapters.find(chapter => chapter.id === newChapterId) || null,
    [chapters, newChapterId],
  );

  if (!adminMode && !professorAccess) return null;

  return (
    <div className={"prof-studio-workspace relative flex flex-col text-slate-900 vercel-font " + (shell ? "min-h-0 flex-1" : adminMode ? "h-full min-h-0" : "h-dvh")}>
      <StudioHeader
        adminMode={adminMode}
        adminClassId={adminClassId}
        catalogCollapsed={catalogCollapsed}
        classes={classes}
        currentPath={currentPath}
        isDirty={isDirty}
        isVisualSupported={isVisualSupported}
        mode={mode}
        onAdminClassChange={setAdminClassId}
        onHistory={() => { void openHistory(); }}
        onLogout={onLogout}
        onModeChange={setMode}
        onRemove={() => { void remove(); }}
        onRevert={revert}
        onSave={() => { void save(); }}
        overrides={overrides}
        parseError={parseError}
        saveState={saveState}
        shellActive={Boolean(shell)}
      />

      <div className="relative flex min-h-0 flex-1">
        <StudioCatalogRail
          chapters={chapters}
          collapsed={catalogCollapsed}
          currentPath={currentPath}
          loading={loadingClass}
          onCollapsedChange={setCatalogCollapsed}
          onCreateChapter={showChapterModal}
          onCreateResource={openCreateResourceForChapter}
          onOpen={path => { void openCatalogDocument(path); }}
          overrides={overrides}
          selectedClass={selectedClass}
          selectedClassId={selectedClassId}
        />
        <StudioDocumentWorkspace
          content={content}
          currentPath={currentPath}
          editorRevision={editorRevision}
          isExercise={isExercise}
          isQuiz={isQuiz}
          isRevision={isRevision}
          jsonError={jsonError}
          loading={loadingFile}
          mode={mode}
          onBrowseCatalog={() => setCatalogCollapsed(false)}
          onContentChange={updateContent}
          onCreateChapter={showChapterModal}
          parseError={parseError}
          parsedContent={parsedContent}
          selectedClassId={selectedClassId}
        />
      </div>

      <ResourceManagerModal
        chapter={selectedManagerChapter}
        chapterId={newChapterId}
        creating={creating}
        exercises={managerExercises}
        importBusy={importBusy}
        importDone={importDone}
        importEntries={importEntries}
        importError={importError}
        importExpandedError={importExpandedError}
        importMessage={importMessage}
        importPasteOpen={importPasteOpen}
        importPasteText={importPasteText}
        onAnalyzePaste={analyzePaste}
        onClose={() => setNewOpen(false)}
        onCreate={() => { void createResource(); }}
        onDeleteChapter={() => requestDeleteChapter(newChapterId)}
        onDeleteResources={(paths, kind) => { void deleteResources(paths, kind); }}
        onFiles={files => { void handleImportFiles(files); }}
        onImport={() => { void runBatchImport(); }}
        onMoveExercise={(fromIndex, newNumber) => { void renumberExercise(fromIndex, newNumber); }}
        onOpenResource={path => { void openCatalogDocument(path); }}
        onPrint={() => { void printChapterExercises(); }}
        onRenameChapter={title => { void requestRenameChapter(newChapterId, title); }}
        onRenameResource={(path, kind, name) => { void renameResource(path, kind, name); }}
        open={newOpen}
        printing={printingChapter}
        resourceSelection={resourceSelection}
        setImportExpandedError={setImportExpandedError}
        setImportPasteOpen={setImportPasteOpen}
        setImportPasteText={setImportPasteText}
        setResourceSelection={setResourceSelection}
        setType={setNewType}
        type={newType}
      />

      <ChapterModal
        busy={chapterBusy}
        name={chapterName}
        onClose={() => setChapterModalOpen(false)}
        onNameChange={setChapterName}
        onSubmit={() => { void submitChapter(); }}
        open={chapterModalOpen}
      />
      <HistoryModal
        history={historyList}
        loading={historyLoading}
        onClose={() => setHistoryOpen(false)}
        onLoad={loadHistoryVersion}
        open={historyOpen}
      />
      {printModalOpen && printJob && <ExercisePrintModal job={printJob} open={printModalOpen} printing={printingChapter} onCancel={cancelPrint} onConfirm={confirmPrint} />}
      <StudioPrintJob job={printingChapter && !printModalOpen ? printJob : null} />
    </div>
  );
}
