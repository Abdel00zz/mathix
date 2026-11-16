import React, { useCallback, useEffect, Suspense } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { useGlobalProgress } from './hooks/useGlobalProgress';
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useAppSettings } from './hooks/useAppSettings';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useSessionLifecycle } from './hooks/useSessionLifecycle';
import { useAppBackgroundSync } from './hooks/useAppBackgroundSync';
import { toExercises } from './services/examenService';
import { toExercises as dsToExercises } from './services/dsService';
import DashboardBackground from './components/UI/DashboardBackground';
import LoadingSpinner from './components/UI/LoadingSpinner';
import { PWAInstallPrompt } from './components/UI/PWAInstallPrompt';
import { useMinimumLoading } from './hooks/useMinimumLoading';
import { useIsTabletSurface } from './hooks/useProfViewMode';
import { useProfessorAccess } from './hooks/useProfessorAccess';
import SharedImageViewer from './components/ProfStudio/SharedImageViewer';
import ProfSyncCenter from './components/ProfStudio/sync/ProfSyncCenter';
import { resolveWorkflowNode } from './utils/appWorkflow';

const LoginView = lazyWithRetry(() => import('./components/Views/LoginView'));
const DashboardView = lazyWithRetry(() => import('./components/Views/DashboardView'));
const ExerciseSessionView = lazyWithRetry(() => import('./components/Views/ExerciseSessionView'));
const QuizSessionView = lazyWithRetry(() => import('./components/Views/QuizSessionView'));
const RevisionView = lazyWithRetry(() => import('./components/Views/RevisionView'));
const ConcoursQuizView = lazyWithRetry(() => import('./components/Views/ConcoursQuizView'));
const CadreReferentielView = lazyWithRetry(() => import('./components/Views/CadreReferentielView'));
const ProfConsoleApp = lazyWithRetry(() => import('./components/ProfStudio/ProfConsoleApp'));
const AdminConsole = lazyWithRetry(() => import('./components/Admin/AdminConsole'));
const ProfessorPendingView = lazyWithRetry(() => import('./components/Views/ProfessorPendingView'));

const SplashHider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    if (typeof (window as any).__hideSplash === 'function') {
      (window as any).__hideSplash();
    }
  }, []);
  return <>{children}</>;
};

const App: React.FC = () => {
  const {
    user, login, logout, flushCloudSave,
    submitQuiz, resetQuizProgress, saveQuizProgress, updateExerciseProgress,
    updateExerciseFeedback, updateRevisionProgress, saveRevealedBlank,
    toggleSkillMastery, confirmSeance, updateProfile, applyVerifiedUser,
    isLoaded, globalProgress, getChapterProgressForClass,
  } = useGlobalProgress();

  const { appSettings, handleApplySettings } = useAppSettings();
  const {
    accountSessionReady,
    authNotice,
    clearAuthNotice,
    handleVerifiedLogin,
    refreshPendingProfessor,
    handleLogout,
  } = useSessionLifecycle({ user, login, logout, flushCloudSave, applyVerifiedUser });

  const {
    view, selectedChapter, currentRevision, concoursExamConfig, currentExamen, currentDs, currentProbleme,
    handleSelectChapter, handleStartSession, handleStartQuiz, handleOpenRevision,
    handleBackToDashboard, handleBackToHub,
    handleStartConcoursExam, handleConcoursQuizExit,
    handleStartExamen, handleExamenBack,
    handleOpenCadreReferentiel,
    handleStartDs, handleDsBack,
    handleStartProbleme, handleProblemeBack,
    handleUpdateProfile,
  } = useAppNavigation(user, isLoaded, updateProfile, accountSessionReady);

  useAutoUpdate();
  const isTabletSurface = useIsTabletSurface();
  const hasProfessorAccess = useProfessorAccess();

  const userName = user?.name;
  const userClassId = user?.classId;
  const userAccountId = user?.accountId;
  const isProfessor = user?.role === 'prof' && hasProfessorAccess;
  const isPendingProfessor = user?.requestedRole === 'prof' && user.role !== 'prof';

  const {
    appManifest,
    contentRevision,
    refreshPublishedContent,
    sharedViewerImage,
    clearSharedViewerImage,
  } = useAppBackgroundSync({
    accountSessionReady,
    userName,
    userClassId,
    userAccountId,
    isProfessor,
    isPendingProfessor,
  });

  const showInitialLoading = useMinimumLoading(!isLoaded || !accountSessionReady);

  const workflow = resolveWorkflowNode({
    view,
    user,
    isLoaded,
    accountSessionReady,
    isBooting: showInitialLoading,
    hasProfessorAccess,
    isTabletSurface,
    sessionAvailability: {
      hasChapter: Boolean(selectedChapter),
      hasRevision: Boolean(currentRevision),
      hasConcoursConfig: Boolean(concoursExamConfig),
      hasExamen: Boolean(currentExamen),
      hasDs: Boolean(currentDs),
      hasProbleme: Boolean(currentProbleme),
    },
  });

  const handleRevisionProgressUpdate = useCallback((pct: number, sectionId?: string, sheetKey?: string) => {
    if (!selectedChapter) return;
    const classId = selectedChapter.classId || userClassId;
    if (classId) updateRevisionProgress(classId, selectedChapter.id, pct, sectionId, sheetKey);
  }, [selectedChapter, updateRevisionProgress, userClassId]);

  const renderProfConsole = (profUser: NonNullable<typeof user>) => (
    <ProfConsoleApp
      classId={profUser.classId || ''}
      onLogout={handleLogout}
      onUpdateProfile={updateProfile}
      profPage={profUser.profPage}
      profName={profUser.name}
      profUser={profUser}
      profClassScope={profUser.profClassScope}
      profClasses={profUser.profClasses}
    />
  );

  const renderContent = () => {
    switch (workflow.node) {
      case 'booting':
        return null;

      case 'pending_professor':
        if (!user) return null;
        return <ProfessorPendingView user={user} onRefresh={refreshPendingProfessor} onLogout={handleLogout} />;

      case 'auth':
        return (
          <LoginView
            onLogin={handleVerifiedLogin}
            onLogout={handleLogout}
            manifest={appManifest}
            cachedUser={user}
            authNotice={authNotice}
            onClearAuthNotice={clearAuthNotice}
          />
        );

      case 'prof_console':
        if (!user) return null;
        return renderProfConsole(user);

      case 'dashboard':
        if (!user) return null;
        return (
          <DashboardView
            user={user}
            globalProgress={globalProgress}
            onSelectChapter={handleSelectChapter}
            onStartSession={handleStartSession}
            onStartQuiz={handleStartQuiz}
            onResetQuiz={(chapterId) => {
              if (userClassId) resetQuizProgress(userClassId, chapterId);
            }}
            onOpenRevision={handleOpenRevision}
            onLogout={handleLogout}
            currentSettings={appSettings}
            onApplySettings={handleApplySettings}
            onUpdateProfile={handleUpdateProfile}
            appManifest={appManifest}
            onStartExamen={handleStartExamen}
            onStartDs={handleStartDs}
            onStartProbleme={handleStartProbleme}
            onOpenCadreReferentiel={handleOpenCadreReferentiel}
            onStartConcoursExam={handleStartConcoursExam}
            profSession={isProfessor}
            contentRevision={contentRevision}
          />
        );

      case 'admin_console':
        return <AdminConsole onBack={handleBackToDashboard} />;

      case 'session_referentiel':
        if (!user) return null;
        return (
          <CadreReferentielView
            user={user}
            onBack={handleBackToDashboard}
            globalProgress={globalProgress}
            onToggleSkill={(skillId) => {
              if (userClassId) toggleSkillMastery(userClassId, 'cadre_referentiel', skillId);
            }}
          />
        );

      case 'session_exercise': {
        if (!selectedChapter) return null;
        const sessionClassId = selectedChapter.classId || userClassId;
        const sessionProgress = getChapterProgressForClass(sessionClassId || '', selectedChapter.id);
        return (
          <ExerciseSessionView
            chapterId={selectedChapter.id}
            chapterTitle={selectedChapter.title}
            classId={selectedChapter.classId || userClassId}
            onExit={handleBackToHub}
            onHome={handleBackToDashboard}
            onProgressUpdate={(uniqueId, mastery, lastHintIndex) => {
              if (sessionClassId) updateExerciseProgress(sessionClassId, selectedChapter.id, uniqueId, mastery, lastHintIndex);
            }}
            onFeedbackUpdate={(exerciseId, mastery, duration) => {
              if (sessionClassId) updateExerciseFeedback(sessionClassId, selectedChapter.id, exerciseId, mastery, duration);
            }}
            savedFeedback={sessionProgress?.exerciseFeedback}
            savedDurations={sessionProgress?.exerciseDurations}
            isChapterSubmitted={sessionProgress?.isChapterSubmitted || false}
          />
        );
      }

      case 'session_quiz': {
        if (!selectedChapter || !user) return null;
        const quizClassId = selectedChapter.classId || user.classId;
        const quizProgress = getChapterProgressForClass(quizClassId || '', selectedChapter.id);
        return (
          <QuizSessionView
            chapter={selectedChapter}
            classId={quizClassId}
            chapterProgress={quizProgress}
            onExit={handleBackToHub}
            onHome={handleBackToDashboard}
            onStartExercises={handleStartSession}
            onSubmitScore={(score, total, snapshot) => {
              if (quizClassId) submitQuiz(quizClassId, selectedChapter.id, score, total, snapshot);
            }}
            onSaveProgress={(index, history, total) => {
              if (quizClassId) saveQuizProgress(quizClassId, selectedChapter.id, index, history, total);
            }}
          />
        );
      }

      case 'session_revision': {
        if (!selectedChapter || !currentRevision) return null;
        const revisionClassId = selectedChapter.classId || userClassId;
        const revisionProgress = getChapterProgressForClass(revisionClassId || '', selectedChapter.id);
        return (
          <RevisionView
            sheetPath={currentRevision.path}
            chapter={selectedChapter}
            currentSettings={appSettings}
            onBack={handleBackToHub}
            onProgressUpdate={handleRevisionProgressUpdate}
            onSaveBlank={(blankId) => {
              if (revisionClassId) saveRevealedBlank(revisionClassId, selectedChapter.id, blankId);
            }}
            onConfirmSeance={(seance, nextSectionId) => {
              if (revisionClassId) confirmSeance(revisionClassId, selectedChapter.id, seance, nextSectionId);
            }}
            savedProgress={revisionProgress}
          />
        );
      }

      case 'session_concours':
        if (!concoursExamConfig) return null;
        return (
          <ConcoursQuizView
            schoolId={concoursExamConfig.schoolId}
            themeId={concoursExamConfig.themeId}
            year={concoursExamConfig.year}
            questionCount={concoursExamConfig.questionCount}
            onExit={handleConcoursQuizExit}
          />
        );

      case 'session_examen': {
        if (!currentExamen) return null;
        const examenProgress = getChapterProgressForClass(userClassId || '', currentExamen.id);
        return (
          <ExerciseSessionView
            chapterId={currentExamen.id}
            chapterTitle={currentExamen.title}
            onExit={handleExamenBack}
            onHome={handleBackToDashboard}
            onProgressUpdate={() => {}}
            onFeedbackUpdate={(exerciseId, mastery, duration) => {
              if (userClassId) updateExerciseFeedback(userClassId, currentExamen.id, exerciseId, mastery, duration);
            }}
            savedFeedback={examenProgress?.exerciseFeedback}
            savedDurations={examenProgress?.exerciseDurations}
            preloadedExercises={toExercises(currentExamen)}
            examenSession={currentExamen.session}
          />
        );
      }

      case 'session_ds': {
        if (!currentDs) return null;
        const dsProgress = getChapterProgressForClass(userClassId || '', currentDs.id);
        return (
          <ExerciseSessionView
            chapterId={currentDs.id}
            chapterTitle={currentDs.title}
            onExit={handleDsBack}
            onHome={handleBackToDashboard}
            onProgressUpdate={() => {}}
            onFeedbackUpdate={(exerciseId, mastery, duration) => {
              if (userClassId) updateExerciseFeedback(userClassId, currentDs.id, exerciseId, mastery, duration);
            }}
            savedFeedback={dsProgress?.exerciseFeedback}
            savedDurations={dsProgress?.exerciseDurations}
            preloadedExercises={dsToExercises(currentDs)}
          />
        );
      }

      case 'session_probleme':
        if (!currentProbleme || !user) return null;
        return (
          <RevisionView
            sheetPath={currentProbleme.path}
            chapter={{ id: `probleme-${currentProbleme.id}`, title: currentProbleme.title }}
            heroTitle={currentProbleme.title}
            variant="probleme"
            currentSettings={appSettings}
            onBack={handleProblemeBack}
            onProgressUpdate={() => {}}
          />
        );
    }
  };

  const unifiedLoadingPage = (
    <LoadingSpinner context="dashboard" audience={isProfessor ? 'professor' : 'student'} />
  );

  return (
    <div className="min-h-screen font-montserrat bg-[#e4e4e4] print:bg-white text-[#1a1510] selection:bg-[#e8410a]/20 selection:text-[#1a1510] overflow-hidden print:overflow-visible relative transition-colors duration-500">
      <PWAInstallPrompt afterLogin={accountSessionReady && !!user && !isPendingProfessor && workflow.view !== 'login'} />

      {(workflow.node === 'auth' || workflow.node === 'session_referentiel' || (workflow.node === 'booting' && view === 'login')) && <DashboardBackground />}
      <main className="w-full relative z-10">
        <SplashHider>
          {workflow.node === 'booting' ? unifiedLoadingPage : (
            <Suspense fallback={unifiedLoadingPage}>
              {renderContent()}
            </Suspense>
          )}
        </SplashHider>
      </main>

      <SharedImageViewer image={sharedViewerImage} onClose={clearSharedViewerImage} />
      {isProfessor && <ProfSyncCenter onContentApplied={refreshPublishedContent} />}
    </div>
  );
};

export default App;
