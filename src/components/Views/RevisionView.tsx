import React, { useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { ChapterInfo, ChapterProgress, AppSettings, RevisionSection } from '../../types';
import { useRevisionSheet } from '../../hooks/useRevisionSheet';
import { useActiveSection } from '../../hooks/useActiveSection';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';
import { useSessionActivitySync } from '../../hooks/useSessionActivitySync';
import { useRevisionBlanks } from '../../hooks/useRevisionBlanks';
import { useRevisionNavigation } from '../../hooks/useRevisionNavigation';
import RevisionSectionBlock from '../Revision/RevisionSectionBlock';
import TableOfContents from '../Revision/TableOfContents';
import { RevisionLexiconProvider } from '../Revision/RevisionLexicon';
import LoadingSpinner from '../UI/LoadingSpinner';
import { DEFAULT_REVISION_BLOCK_VISIBILITY } from '../../utils/constants';
import { computeRevisionProgress } from '../../utils/progressUtils';
import { blankScopePrefix, revisionSheetKey } from '../../utils/revisionSheets';
import {
  computeGlobalNumbering,
  filterSectionsByVisibility,
} from '../../utils/revisionCourseStructure';
import { FocusModeProvider } from '../Revision/FocusModeContext';
import { FocusOverlay } from '../Revision/FocusOverlay';
import { RevisionChapterContext } from '../Revision/annotation/RevisionIdentityContext';
import { useIsTabletSurface } from '../../hooks/useProfViewMode';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { useProfPersonalization } from '../../hooks/useProfPersonalization';

// Barre unique partagée par toutes les zones de réponse de la fiche.
const CanvasFloatingToolbar = React.lazy(() =>
  import('../Exercise/canvas/FloatingToolbar').then((module) => ({ default: module.CanvasFloatingToolbar }))
);

interface RevisionViewProps {
  sheetPath: string;
  chapter: ChapterInfo;
  currentSettings: AppSettings;
  onBack: () => void;
  onProgressUpdate: (progress: number, activeSectionId: string, sheetKey?: string) => void;
  onSaveBlank?: (blankId: string) => void;
  onConfirmSeance?: (seance: number, nextSectionId?: string) => void;
  savedProgress?: ChapterProgress;
  /** Override the hero title (default: "Fiche de leçon") */
  heroTitle?: string;
  /** Variante d'affichage : 'probleme' applique un style épuré (sans cadres). */
  variant?: 'revision' | 'probleme';
}

interface CourseViewProps {
  sections: RevisionSection[];
  blockNumbering: Record<string, number>;
  heroTitle?: string;
  /** Surtitre du hero : nom du chapitre (retombe sur « Parcours autonome » si absent). */
  kicker?: string;
}

const CourseView = React.memo<CourseViewProps>(({
  sections,
  blockNumbering,
  heroTitle,
  kicker,
}) => {
  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-70">
        <p className="text-[#64748b] typo-ui text-[0.95rem] tracking-wide">
          Aucun contenu de cours disponible.
        </p>
      </div>
    );
  }

  let numberedIdx = 0;

  return (
    <article dir="ltr" lang="fr" className="revision-surface animate-in fade-in duration-300 w-full mx-auto typo-ui font-normal text-[#1e293b]">
      <header className="revision-hero">
        <div className="revision-hero-inner">
          <p className="revision-hero-kicker">{kicker || 'Parcours autonome'}</p>
          <h1 className="revision-hero-title">
            <span className="revision-hero-title-text">
              {heroTitle ? (
                <span>{heroTitle}</span>
              ) : (
                <>
                  <span>Fiche de </span>
                  <span className="revision-hero-accent italic">leçon</span>
                </>
              )}
            </span>
          </h1>
        </div>
      </header>

      <div className="revision-sections-flow">
        {sections.map((section) => {
          const hasTitle = !!section.title?.trim() && !section.blocks?.some((block) => block.type === 'intro');
          if (hasTitle) numberedIdx++;

          return (
            <RevisionSectionBlock
              key={section.id}
              section={section}
              index={hasTitle ? numberedIdx : 0}
              blockNumbering={blockNumbering}
            />
          );
        })}
      </div>
    </article>
  );
});

const RevisionView: React.FC<RevisionViewProps> = ({
  sheetPath,
  chapter,
  currentSettings,
  onBack: _onBack,
  onProgressUpdate,
  onSaveBlank,
  savedProgress,
  heroTitle,
  variant = 'revision',
}) => {
  const { sheet, loading, error } = useRevisionSheet(sheetPath);
  const showLoading = useMinimumLoading(loading);
  const professorAccess = useProfessorAccess();
  const isTabletSurface = useIsTabletSurface();
  const { canvas, revision: revisionPrefs } = useProfPersonalization();
  const blanksLocked = !canvas.showBlanks;
  const baseDocScale = currentSettings.readingTheme?.docScale ?? 1;
  const profTextScale = revisionPrefs.textScale ?? 1;
  const effectiveDocScale = Number((baseDocScale * profTextScale).toFixed(3));
  const profPaperTheme = revisionPrefs.paperTheme && revisionPrefs.paperTheme !== 'classic'
    ? revisionPrefs.paperTheme
    : undefined;
  const containerRef = useRef<HTMLDivElement>(null);

  const sheetKey = revisionSheetKey(sheetPath);
  const blankScope = blankScopePrefix(chapter, sheetPath);

  const sections = useMemo(() => sheet?.sections || [], [sheet]);
  const revisionVisibility = useMemo(() => ({
    ...DEFAULT_REVISION_BLOCK_VISIBILITY,
    ...(currentSettings.revisionBlockVisibility || {}),
  }), [currentSettings.revisionBlockVisibility]);
  const deferredRevisionVisibility = useDeferredValue(revisionVisibility);
  const filteredSections = useMemo(
    () => filterSectionsByVisibility(sections, deferredRevisionVisibility),
    [sections, deferredRevisionVisibility]
  );
  const blockNumbering = useMemo(
    () => computeGlobalNumbering(filteredSections, currentSettings.revisionBlockNumbering),
    [filteredSections, currentSettings.revisionBlockNumbering]
  );

  const courseSections = useMemo(
    () => filteredSections.filter((section) => section.category !== 'method'),
    [filteredSections]
  );
  const activeIds = useMemo(() => courseSections.map((section) => section.id), [courseSections]);
  const activeId = useActiveSection(activeIds, !loading);

  useSessionActivitySync(chapter.classId, () => {
    const section = courseSections.find((item) => item.id === activeId);
    if (!section) return { position: { type: 'revision', label: '' }, revision: {} };
    return {
      position: { type: 'revision', label: section.title },
      revision: { section: section.title, paragraph: section.title },
    };
  });

  const {
    hasRestoredScrollRef,
    pendingActiveSectionRef,
    scrollToSection,
    scrollToSearchResult,
  } = useRevisionNavigation({
    activeIds,
    loading,
    showLoading,
    hasSheet: !!sheet,
    savedLastActiveSection: savedProgress?.lastActiveSection,
  });

  const { totalBlanks, revealedBlanks } = useRevisionBlanks({
    containerRef,
    loading,
    hasSheet: !!sheet,
    chapterId: chapter.id,
    blankScope,
    savedRevealedBlanks: savedProgress?.revealedBlanks,
    blanksLocked,
    onSaveBlank,
  });

  useEffect(() => {
    const weightedPercent = computeRevisionProgress(
      revealedBlanks,
      totalBlanks,
      0,
      0
    );
    const pendingSectionId = pendingActiveSectionRef.current;
    if (pendingSectionId && activeId === pendingSectionId) {
      pendingActiveSectionRef.current = null;
    }
    const sectionIdToPersist = pendingSectionId || (hasRestoredScrollRef.current
      ? activeId
      : savedProgress?.lastActiveSection || activeId);
    onProgressUpdate(weightedPercent, sectionIdToPersist, sheetKey);
  }, [
    activeId,
    hasRestoredScrollRef,
    onProgressUpdate,
    pendingActiveSectionRef,
    revealedBlanks,
    savedProgress?.lastActiveSection,
    sheetKey,
    totalBlanks,
  ]);

  if (showLoading) return <LoadingSpinner context={variant === 'probleme' ? 'problem' : 'lesson'} />;
  if (error || !sheet) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Document indisponible</p>
          <p className="mt-2.5 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
            {error || `Impossible de charger ${sheetPath}`}
          </p>
        </div>
      </div>
    );
  }

  const lexique = sheet.lexique || [];

  return (
    <RevisionChapterContext.Provider value={chapter.id}>
      <RevisionLexiconProvider entries={lexique}>
        <TableOfContents
          sections={courseSections}
          activeId={activeId}
          onScroll={scrollToSection}
          onSearchResultSelect={scrollToSearchResult}
        />
        <FocusOverlay />
        {professorAccess && isTabletSurface && canvas.enabled && canvas.showToolbar && (
          <React.Suspense fallback={null}>
            <CanvasFloatingToolbar />
          </React.Suspense>
        )}
        <div
          dir="ltr"
          lang="fr"
          data-prof-paper={profPaperTheme}
          style={effectiveDocScale !== 1 ? { '--reading-doc-scale': String(effectiveDocScale) } as React.CSSProperties : undefined}
          className={`revision-page-shell ${variant === 'probleme' ? 'revision-variant-probleme' : 'revision-editorial'} ${professorAccess && isTabletSurface ? 'revision-prof-tablet-surface' : ''} ${blanksLocked ? 'math-blanks-locked' : ''} min-h-screen text-slate-800 selection:bg-blue-500/15 selection:text-slate-900 pb-20 sm:pb-24 overflow-x-clip typo-ui`}
        >
          <main ref={containerRef} className="revision-content-stage w-full">
            <CourseView
              sections={courseSections}
              blockNumbering={blockNumbering}
              heroTitle={heroTitle}
              kicker={chapter.title && chapter.title !== heroTitle ? chapter.title : undefined}
            />
          </main>
        </div>
      </RevisionLexiconProvider>
    </RevisionChapterContext.Provider>
  );
};

const RevisionViewWithProvider: React.FC<RevisionViewProps> = (props) => (
  <FocusModeProvider>
    <RevisionView {...props} />
  </FocusModeProvider>
);

export default React.memo(RevisionViewWithProvider);
