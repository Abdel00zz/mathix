import React, { useEffect, useState, memo, useMemo, useCallback, useRef } from 'react';
import { faTabletScreenButton } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { UserProfile, ChapterInfo, ChapterProgress, AppSettings } from '../../types';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useTimeTracking } from '../../hooks/useTimeTracking';
import { useDashboardData } from '../../hooks/useDashboardData';
import { useDashboardSessionState } from '../../hooks/useDashboardSessionState';
import { exportProgressData, importProgressData } from '../../utils/dataTransfer';
import { computeActiveChapterIndex, orderChaptersForDashboard, readLastOpenedChapter, type LastOpenedChapter } from '../../utils/dashboardChapterOrder';
import DashboardHeader from '../Dashboard/DashboardHeader';
import ChapterModule, { ChapterModuleSkeleton } from '../Dashboard/ChapterCard';
import ChapterListRow from '../Dashboard/ChapterCard/ChapterListRow';
import { getChapterNumberMap, isPinnedChapter } from '../Dashboard/ChapterCard/chapterTheme';
import ExamenDashboardModule from '../Dashboard/ExamenModule';
import ProblemeModule from '../Dashboard/ProblemeModule';
import OlympiadModule from '../Dashboard/OlympiadModule';
import ConcoursModule from '../Dashboard/ConcoursModule';
import DashboardSectionTabs, { DashboardSectionTab, DashboardTabId } from '../Dashboard/DashboardSectionTabs';
import { DashboardModalHost } from '../Dashboard/DashboardModalHost';
import ControlBlade from '../UI/ControlBlade';
import { useNotificationPreferencesSync } from '../../hooks/useNotificationScheduler';
import { syncStudyMinutesFromTotal } from '../../services/studyPlanService';
import { useIsPhone, useIsPortrait } from '../../hooks/useMediaQuery';
import { problemeService } from '../../services/problemeService';
import { concoursService, SchoolsData } from '../../services/concoursService';
import { getDashboardTheme, themeVars } from '../ProfStudio/dashboardThemes';
import ProfSessionGate, { type SessionMode } from '../ProfStudio/ProfSessionGate';
import { useProfessorAttendance } from '../../hooks/useProfessorAttendance';
import { shouldShowSessionGate } from '../../utils/sessionGate';
import { useI18n } from '../../i18n/I18nContext';
import { translateChapterLabel, translateClassLabel } from '../../i18n/classLabels';

interface DashboardViewProps {
  user: UserProfile;
  globalProgress: Record<string, ChapterProgress>;
  onSelectChapter: (chapter: ChapterInfo, force?: boolean) => void;
  onStartSession?: () => void;
  onStartQuiz?: () => void;
  onResetQuiz?: (chapterId: string) => void;
  onOpenRevision?: (path: string) => void;
  onLogout: () => void;
  currentSettings: AppSettings;
  onApplySettings: (settings: AppSettings) => void;
  onUpdateProfile?: (updates: any, switchView?: 'dashboard') => void;
  appManifest?: any;
  onStartExamen?: (examen: any) => void;
  onStartDs?: (ds: any) => void;
  onStartProbleme?: (entry: any) => void;
  onOpenCadreReferentiel?: () => void;
  onStartConcoursExam?: (schoolId: string, themeId: string | null, questionCount: number, year?: string | null) => void;
  profSession?: boolean;
  contentRevision?: number;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  globalProgress,
  onSelectChapter,
  onStartSession,
  onStartQuiz,
  onResetQuiz,
  onOpenRevision,
  onLogout,
  currentSettings,
  onApplySettings,
  onUpdateProfile,
  appManifest,
  onStartExamen,
  onStartDs,
  onStartProbleme,
  onOpenCadreReferentiel,
  onStartConcoursExam,
  profSession = false,
  contentRevision = 0,
}) => {
  const { lang, dir } = useI18n();
  const [sessionGate, setSessionGate] = useState<{ mode: SessionMode; chapterTitle?: string; onStart: () => void } | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardTabId>(() => {
    const saved = localStorage.getItem('dashboard_active_section') || sessionStorage.getItem('dashboard_active_section');
    if (saved === 'devoirs') return 'problemes';
    if (saved === 'chapitres' || saved === 'examens' || saved === 'problemes' || saved === 'olympiad' || saved === 'concours') {
      return saved;
    }
    return 'chapitres';
  });
  const [schoolsData, setSchoolsData] = useState<SchoolsData | null>(null);
  const [schoolsError, setSchoolsError] = useState(false);

  const {
    activeModal, effectiveClassId, levelClasses, pilotedNotice,
    sessionStatus, sessionBusy, controlSession, recordSessionChapter,
    handleOpenModal, handleCloseModal,
  } = useDashboardSessionState({ accountClassId: user.classId, profSession });

  const profFullName = (user.firstName && user.lastName) ? `${user.firstName} ${user.lastName}` : (user.name || '');
  const levelEntry = levelClasses.find(c => c.id === effectiveClassId);
  const levelLabel = translateClassLabel(effectiveClassId, levelEntry?.title || user.className, lang);

  const { chapters, allClassExercises, isLoadingContent, is2bac, hasOlympiad } = useDashboardData(effectiveClassId, globalProgress, currentSettings, contentRevision);
  useNotificationPreferencesSync(currentSettings);
  const hasProblemes = useMemo(() => problemeService.isSupported(effectiveClassId), [effectiveClassId]);

  const lastChapterStorageKey = `mathplus:last-active-chapter:${effectiveClassId}`;
  const [lastOpenedChapter, setLastOpenedChapter] = useState<LastOpenedChapter | null>(() => readLastOpenedChapter(lastChapterStorageKey));
  const lastChapterKeyRef = useRef(lastChapterStorageKey);
  useEffect(() => {
    if (lastChapterKeyRef.current === lastChapterStorageKey) return;
    lastChapterKeyRef.current = lastChapterStorageKey;
    setLastOpenedChapter(readLastOpenedChapter(lastChapterStorageKey));
  }, [lastChapterStorageKey]);

  useEffect(() => {
    if (!is2bac || schoolsData) return;
    let active = true;
    concoursService.loadSchools()
      .then(data => { if (active) setSchoolsData(data); })
      .catch(err => { console.error('Failed to load schools:', err); if (active) setSchoolsError(true); });
    return () => { active = false; };
  }, [is2bac, schoolsData]);

  const loadingSchools = is2bac && !schoolsData && !schoolsError;

  const tabs = useMemo<DashboardSectionTab[]>(() => {
    const availableTabs: DashboardSectionTab[] = [
      { id: 'chapitres', title: lang === 'ar' ? 'التعلّم' : 'Apprendre', shortTitle: lang === 'ar' ? 'التعلّم' : 'Apprendre', show: true, color: '#b5369b', bg: 'rgba(181, 54, 155, 0.08)' },
      { id: 'examens', title: lang === 'ar' ? 'الامتحانات الوطنية' : 'Examens Nationaux', shortTitle: lang === 'ar' ? 'الامتحانات' : 'Examens', show: !!(is2bac && onStartExamen), color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.05)' },
      { id: 'problemes', title: lang === 'ar' ? 'المسائل' : 'Problèmes', show: !!(hasProblemes && onStartProbleme), color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.05)' },
      { id: 'olympiad', title: lang === 'ar' ? 'الأولمبياد' : 'Olympiades', show: !!(hasOlympiad && onStartDs), color: '#ec4899', bg: 'rgba(236, 72, 153, 0.05)' },
      { id: 'concours', title: lang === 'ar' ? 'مباريات الولوج' : 'Prépa Concours', shortTitle: lang === 'ar' ? 'المباريات' : 'Concours', show: !!(is2bac && onStartConcoursExam), color: '#10b981', bg: 'rgba(16, 185, 129, 0.05)' },
    ];
    return availableTabs.filter(tab => tab.show);
  }, [is2bac, onStartExamen, hasProblemes, onStartProbleme, hasOlympiad, onStartDs, onStartConcoursExam, lang]);

  const effectiveActiveSection = tabs.some(t => t.id === activeSection) ? activeSection : tabs[0]?.id;
  const activeTab = useMemo(() => tabs.find(t => t.id === effectiveActiveSection) || tabs[0], [tabs, effectiveActiveSection]);
  const activeColor = activeTab?.color || '#b5369b';
  const activeBg = activeTab?.bg || '#FFF5EE';

  useEffect(() => {
    if (effectiveActiveSection) localStorage.setItem('dashboard_active_section', effectiveActiveSection);
  }, [effectiveActiveSection]);

  const isPhone = useIsPhone();
  const isPortrait = useIsPortrait();
  const chapterGridCols = isPortrait ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  const markChapterAsUsed = useCallback((chapter: ChapterInfo) => {
    const next = { id: chapter.id, at: Date.now() };
    setLastOpenedChapter(next);
    try { localStorage.setItem(lastChapterStorageKey, JSON.stringify(next)); } catch { /* stockage restreint */ }
  }, [lastChapterStorageKey]);

  const attendance = useProfessorAttendance(profSession ? effectiveClassId : undefined);
  const openProfActivity = useCallback((mode: SessionMode, chapterTitle: string, start: () => void) => {
    if (!shouldShowSessionGate(attendance.presentCount, attendance.loaded)) {
      setTimeout(start, 0);
      return;
    }
    setSessionGate({ mode, chapterTitle, onStart: start });
  }, [attendance.presentCount, attendance.loaded]);

  const launchChapterActivity = useCallback((mode: SessionMode, chapter: ChapterInfo, run: () => void) => {
    markChapterAsUsed(chapter);
    recordSessionChapter(chapter);
    onSelectChapter(chapter, true);
    if (profSession) {
      openProfActivity(mode, translateChapterLabel(chapter.id, chapter.title, lang), run);
    } else {
      setTimeout(run, 0);
    }
  }, [markChapterAsUsed, recordSessionChapter, onSelectChapter, profSession, openProfActivity, lang]);

  const handleChapterStartSession = useCallback((chapter: ChapterInfo) => {
    launchChapterActivity('exercise', chapter, () => onStartSession?.());
  }, [launchChapterActivity, onStartSession]);

  const handleChapterStartQuiz = useCallback((chapter: ChapterInfo) => {
    launchChapterActivity('quiz', chapter, () => onStartQuiz?.());
  }, [launchChapterActivity, onStartQuiz]);

  const handleChapterOpenRevision = useCallback((chapter: ChapterInfo, path: string) => {
    launchChapterActivity('revision', chapter, () => onOpenRevision?.(path));
  }, [launchChapterActivity, onOpenRevision]);

  const { globalStats, chapterStats } = useDashboardStats(chapters, allClassExercises, globalProgress);
  const { totalSeconds: totalTimeSpentSeconds } = useTimeTracking(user.uniqueId || user.name);
  useEffect(() => { syncStudyMinutesFromTotal(totalTimeSpentSeconds); }, [totalTimeSpentSeconds]);

  const chaptersById = useMemo(() => new Map(chapters.map(chapter => [chapter.id, chapter])), [chapters]);
  const totalExerciseDurationMinutes = useMemo(() => (
    Object.values(globalProgress).reduce((total, ch) => {
      const durations = ch.exerciseDurations || {};
      return total + Object.values(durations).reduce<number>((sum, d) => sum + (typeof d === 'number' ? d : 0), 0);
    }, 0)
  ), [globalProgress]);

  const enrichedStats = useMemo(() => ({
    ...globalStats,
    totalTimeSpentSeconds,
    totalExerciseDurationMinutes,
  }), [globalStats, totalTimeSpentSeconds, totalExerciseDurationMinutes]);

  const handleExportData = useCallback(
    () => exportProgressData(user, globalProgress, currentSettings),
    [user, globalProgress, currentSettings],
  );

  const handleImportData = useCallback(
    (file: File) => importProgressData(file, user, globalProgress, onApplySettings),
    [user, globalProgress, onApplySettings],
  );

  const activeChapterIndex = useMemo(
    () => computeActiveChapterIndex(chapters, globalProgress, chapterStats, lastOpenedChapter),
    [chapters, globalProgress, chapterStats, lastOpenedChapter],
  );

  const highlightedChapterIds = useMemo(
    () => new Set(user.profPage?.highlightedChapterIds || []),
    [user.profPage?.highlightedChapterIds],
  );

  const orderedChapterEntries = useMemo(
    () => orderChaptersForDashboard(chapters, activeChapterIndex, highlightedChapterIds, profSession),
    [chapters, activeChapterIndex, highlightedChapterIds, profSession],
  );

  const chapterNumberById = useMemo(() => getChapterNumberMap(chapters), [chapters]);
  const dashboardThemeStyle = useMemo(() => themeVars(getDashboardTheme(user.dashboardTheme)), [user.dashboardTheme]);
  const textScale = user.profPrefs?.textScale || 1;

  const [chapterViewMode, setChapterViewMode] = useState<'path' | 'grid'>('path');
  const activeChapter = chapters[activeChapterIndex] || chapters[0];
  const activeProgress = activeChapter ? globalProgress[activeChapter.id] : undefined;
  const activeStats = activeChapter ? chapterStats[activeChapter.id] : undefined;

  const resumeData = useMemo(() => {
    if (!activeChapter) return null;
    const title = translateChapterLabel(activeChapter.id, activeChapter.title, lang);
    const quizTotal = activeProgress?.quiz?.totalQuestions || activeChapter.quizCount || 0;
    const quizAnswered = activeProgress?.quiz?.history?.length || 0;
    const quizPct = activeProgress?.quiz?.isSubmitted
      ? 100
      : (quizTotal > 0 ? Math.round((quizAnswered / quizTotal) * 100) : 0);
    const revPct = activeProgress?.revisionProgress || 0;
    const firstRevisionPath = activeChapter.revisions?.[0]?.path || '';

    if (quizPct > 0 && quizPct < 100) {
      return {
        title,
        subtitle: lang === 'ar' ? `اختبار، ${quizPct}٪ منجز` : `Quiz, ${quizPct} % réalisé`,
        percent: quizPct,
        actionLabel: lang === 'ar' ? 'متابعة الاختبار' : 'Reprendre le quiz',
        onAction: () => handleChapterStartQuiz(activeChapter),
      };
    }
    if (revPct > 0 && revPct < 100) {
      return {
        title,
        subtitle: lang === 'ar' ? `الدرس، ${Math.round(revPct)}٪ منجز` : `Leçon, ${Math.round(revPct)} % réalisé`,
        percent: Math.round(revPct),
        actionLabel: lang === 'ar' ? 'متابعة الدرس' : 'Reprendre la leçon',
        onAction: () => handleChapterOpenRevision(activeChapter, firstRevisionPath),
      };
    }
    const overall = activeStats?.progress || 0;
    return {
      title,
      subtitle: overall > 0
        ? (lang === 'ar' ? `المحور، ${overall}٪ منجز` : `Chapitre, ${overall} % réalisé`)
        : (lang === 'ar' ? 'درس متاح للبدء' : 'Leçon disponible'),
      percent: overall > 0 ? overall : 4,
      actionLabel: overall > 0
        ? (lang === 'ar' ? 'متابعة' : 'Reprendre')
        : (lang === 'ar' ? 'بدء الدرس' : 'Reprendre la leçon'),
      onAction: () => handleChapterStartSession(activeChapter),
    };
  }, [activeChapter, activeProgress, activeStats, lang, handleChapterStartQuiz, handleChapterOpenRevision, handleChapterStartSession]);

  const totalProgramPercent = Math.round(enrichedStats.globalPercentage || 0);

  return (
    <div
      className="dashboard-shell w-full h-screen relative overflow-hidden text-[#1E2548] flex typo-dashboard-body transition-colors duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
      dir={dir}
      style={dashboardThemeStyle}
    >
      <div className="dashboard-shell__canvas absolute inset-0 pointer-events-none z-0 overflow-hidden transition-colors duration-700">
        <div
          className="absolute inset-x-0 top-0 h-[320px] opacity-[0.08] transition-colors duration-700"
          style={{ background: 'linear-gradient(180deg, var(--dashboard-lilac), transparent)' }}
        />
      </div>

      <div className="absolute inset-0 flex overflow-hidden z-[2]">
        {pilotedNotice && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-[60] flex justify-center px-4" role="status" aria-live="polite">
            <span className="flex items-center gap-2 rounded-full border border-violet-200 bg-white/95 px-3.5 py-1.5 text-[12.5px] font-medium text-slate-700 shadow-lg shadow-violet-900/5 backdrop-blur animate-in fade-in slide-in-from-top-2 duration-300">
              <FaIcon icon={faTabletScreenButton} size={13} aria-hidden="true" className="shrink-0 text-violet-500" />
              {lang === 'ar' ? <>المستوى <span className="font-semibold text-slate-900">{levelLabel}</span> — تتم إدارته من الحاسوب</> : <>Niveau <span className="font-semibold text-slate-900">{levelLabel}</span> — piloté depuis le PC</>}
            </span>
          </div>
        )}

        <ControlBlade
          onOpenModal={handleOpenModal}
          onLogout={onLogout}
          activeModal={activeModal}
          isProf={profSession}
          sessionStatus={sessionStatus}
          sessionBusy={sessionBusy}
          onControlSession={profSession ? controlSession : undefined}
        />

        <main className={`flex-1 relative z-10 h-full min-h-0 overflow-y-auto transition-all duration-300 ease-out ${dir === 'rtl' ? 'lg:mr-[60px] lg:peer-hover:mr-[232px]' : 'lg:ml-[60px] lg:peer-hover:ml-[232px]'}`}>
          <DashboardModalHost
            activeModal={activeModal}
            effectiveClassId={effectiveClassId}
            profSession={profSession}
            user={user}
            globalProgress={globalProgress}
            currentSettings={currentSettings}
            appManifest={appManifest}
            chaptersById={chaptersById}
            onClose={handleCloseModal}
            onExportData={handleExportData}
            onImportData={handleImportData}
            onApplySettings={onApplySettings}
            onUpdateProfile={onUpdateProfile}
            onLogout={onLogout}
            onNavigateChapter={(target) => {
              setActiveSection('chapitres');
              onSelectChapter(target, true);
            }}
          />

          <div
            className="dash-container w-full mx-auto relative z-10 flex flex-col bg-transparent"
            style={profSession && textScale !== 1 ? { zoom: textScale } : undefined}
          >
            <div className="dash-header-wrap w-full">
              <DashboardHeader
                user={user}
                stats={enrichedStats}
                chapterCount={chapterNumberById.size}
                activeSectionId={effectiveActiveSection}
                activeSectionTitle={activeTab?.title}
                sectionColor={activeColor}
                isProfSession={profSession}
                profMessage={user.profPage?.bannerMessage}
                levelLabel={levelLabel}
                profName={profFullName}
              />
            </div>

            <DashboardSectionTabs
              tabs={tabs}
              activeId={effectiveActiveSection}
              onChange={setActiveSection}
            />

            <div className="dash-stage w-full mx-auto">
              <div
                className={effectiveActiveSection === 'chapitres' ? 'dash-chapters-stage relative min-w-0 flex-1 w-full' : 'dash-module-stage relative min-w-0 flex-1 w-full transition-all duration-700 ease-in-out'}
                style={effectiveActiveSection === 'chapitres' ? {} : {
                  ['--theme-color' as any]: activeColor,
                  ['--theme-color-light' as any]: activeBg,
                  ['--dashboard-accent' as any]: 'var(--dashboard-mauve)',
                }}
              >
                {effectiveActiveSection === 'chapitres' && (
                  isLoadingContent ? (
                    <div className="w-full mx-auto" role="status" aria-live="polite" aria-label={lang === 'ar' ? 'جارٍ مزامنة المسار الدراسي' : 'Synchronisation du parcours'}>
                      <div className="mb-4 flex items-center gap-3 px-1 text-[0.62rem] font-bold uppercase tracking-wider text-slate-500">
                        <span className="mp-loading-track w-10" aria-hidden="true"><span className="mp-loading-bar" /></span>
                        <span>{lang === 'ar' ? 'جارٍ مزامنة المسار الدراسي' : 'Synchronisation du parcours'}</span>
                      </div>
                      <div className={`grid ${chapterGridCols} dash-chapter-grid items-stretch w-full`}>
                        {Array.from({ length: 6 }).map((_, index) => <ChapterModuleSkeleton key={index} index={index} />)}
                      </div>
                      <span className="sr-only">{lang === 'ar' ? 'جارٍ التحميل' : 'Chargement'}</span>
                    </div>
                  ) : (
                    <>
                      {/* Carte Reprendre inspirée de « Apprendre — Programme » */}
                      {resumeData && (
                        <div
                          className="dash-resume resume animate-in fade-in slide-in-from-top-2 duration-300"
                          role="region"
                          aria-label={lang === 'ar' ? 'متابعة التعلم' : 'Reprendre l’apprentissage'}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="dash-resume-title rt">{resumeData.title}</p>
                            <p className="dash-resume-sub">{resumeData.subtitle}</p>
                            <div className="dash-resume-bar bar">
                              <i style={{ width: `${resumeData.percent}%` }} />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={resumeData.onAction}
                            className="dash-resume-btn btn primary"
                          >
                            {resumeData.actionLabel}
                          </button>
                        </div>
                      )}

                      {/* En-tête de section avec totalisation et bascule de vue */}
                      <div className="dash-sec sec">
                        <h2>{lang === 'ar' ? 'البرنامج' : 'Programme'}</h2>
                        <div className="flex items-center gap-3">
                          <span className="dash-sec-total font-medium">
                            {totalProgramPercent} {lang === 'ar' ? '٪ من البرنامج' : '% du programme'}
                          </span>
                          {!isPhone && (
                            <div className="hidden sm:inline-flex items-center rounded-lg border border-[#DEDFE6] bg-white p-0.5 text-xs shadow-xs">
                              <button
                                type="button"
                                onClick={() => setChapterViewMode('path')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${chapterViewMode === 'path' ? 'bg-[#1D2B66] text-white font-medium shadow-xs' : 'text-[#666B78] hover:text-[#1A1C25]'}`}
                              >
                                {lang === 'ar' ? 'المسار' : 'Parcours'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setChapterViewMode('grid')}
                                className={`px-2.5 py-1 rounded-md transition-colors ${chapterViewMode === 'grid' ? 'bg-[#1D2B66] text-white font-medium shadow-xs' : 'text-[#666B78] hover:text-[#1A1C25]'}`}
                              >
                                {lang === 'ar' ? 'بطاقات' : 'Cartes'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Chemin du programme le long de la marge rouge Seyès */}
                      {isPhone || chapterViewMode === 'path' ? (
                        <ol className="dash-chapter-list dash-path path flex w-full max-w-2xl mx-auto flex-col animate-in fade-in duration-500">
                          {chapters.map((chapter, index) => (
                            <ChapterListRow
                              key={chapter.id}
                              chapter={chapter}
                              index={index}
                              chapterNumber={chapterNumberById.get(chapter.id)}
                              progress={globalProgress[chapter.id]}
                              stats={chapterStats[chapter.id]}
                              onStartSession={handleChapterStartSession}
                              onStartQuiz={handleChapterStartQuiz}
                              onResetQuiz={onResetQuiz}
                              onOpenRevision={handleChapterOpenRevision}
                              defaultExpanded={index === activeChapterIndex}
                              isInactive={user.role === 'prof' ? false : !isPinnedChapter(chapter) && index !== activeChapterIndex}
                              forceUnlocked={user.role === 'prof'}
                            />
                          ))}
                        </ol>
                      ) : (
                        <div className={`grid ${chapterGridCols} dash-chapter-grid items-stretch w-full mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                          {orderedChapterEntries.map(({ chapter, index }) => {
                            const isActiveChapter = index === activeChapterIndex;
                            const isInactive = !isPinnedChapter(chapter) && !isActiveChapter;
                            return (
                              <ChapterModule
                                key={chapter.id}
                                chapter={chapter}
                                index={index}
                                chapterNumber={chapterNumberById.get(chapter.id)}
                                progress={globalProgress[chapter.id]}
                                stats={chapterStats[chapter.id]}
                                onStartSession={handleChapterStartSession}
                                onStartQuiz={handleChapterStartQuiz}
                                onResetQuiz={onResetQuiz}
                                onOpenRevision={handleChapterOpenRevision}
                                isInactive={user.role === 'prof' ? false : isInactive}
                                forceUnlocked={user.role === 'prof'}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  )
                )}

                {effectiveActiveSection === 'examens' && is2bac && onStartExamen && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <ExamenDashboardModule user={user} globalProgress={globalProgress} onStartExamen={onStartExamen} onOpenCadreReferentiel={onOpenCadreReferentiel} isExpanded hideHeader />
                  </div>
                )}

                {effectiveActiveSection === 'problemes' && hasProblemes && onStartProbleme && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <ProblemeModule user={user} onSelectProbleme={onStartProbleme} isExpanded hideHeader />
                  </div>
                )}

                {effectiveActiveSection === 'olympiad' && hasOlympiad && onStartDs && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <OlympiadModule user={user} globalProgress={globalProgress} onStartOlympiad={onStartDs} />
                  </div>
                )}

                {effectiveActiveSection === 'concours' && is2bac && onStartConcoursExam && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <ConcoursModule schoolsData={schoolsData} loading={loadingSchools} onStartConcoursExam={onStartConcoursExam} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {sessionGate && (
        <ProfSessionGate
          classId={effectiveClassId}
          mode={sessionGate.mode}
          chapterTitle={sessionGate.chapterTitle}
          onStart={() => {
            const start = sessionGate.onStart;
            setSessionGate(null);
            start();
          }}
          onClose={() => setSessionGate(null)}
        />
      )}
    </div>
  );
};

export default memo(DashboardView);
