import { useState, useEffect, useCallback, useRef } from 'react';
import { AppView, ChapterInfo, UserProfile } from '../types';
import { updateService } from '../services/updateService';
import { pushService } from '../services/pushService';
import { isKnownAppView } from '../utils/appViewRouting';
import { resolveWorkflowNode } from '../utils/appWorkflow';
import type { ExamenData } from '../services/examenService';
import type { DsDevoirData } from '../services/dsService';
import type { ProblemeEntry } from '../services/problemeService';

const chapterCacheKey = (chapterId: string, classId?: string) => (
  classId ? `chapter_cache_${classId}_${chapterId}` : `chapter_cache_${chapterId}`
);

export function useAppNavigation(
  user: UserProfile | null,
  isLoaded: boolean,
  updateProfile: (updates: Partial<any>) => void,
  accountSessionReady = true,
) {
  const [view, setView] = useState<AppView>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (isKnownAppView(hash)) {
      return resolveWorkflowNode({ view: hash, user }).view;
    }
    return user ? 'dashboard' : 'login';
  });
  const [selectedChapter, setSelectedChapter] = useState<ChapterInfo | null>(null);
  const [currentRevision, setCurrentRevision] = useState<{ path: string } | null>(null);
  const [concoursExamConfig, setConcoursExamConfig] = useState<{
    schoolId: string; themeId: string | null; questionCount: number; year?: string | null;
  } | null>(null);
  const [currentExamen, setCurrentExamen] = useState<ExamenData | null>(null);
  const [currentDs, setCurrentDs] = useState<DsDevoirData | null>(null);
  const [currentProbleme, setCurrentProbleme] = useState<ProblemeEntry | null>(null);
  const profileSwitchTimerRef = useRef<number | null>(null);

  const resolveView = useCallback(
    (candidate: AppView): AppView => resolveWorkflowNode({ view: candidate, user }).view,
    [user],
  );

  // Hyper intelligent history manager
  const pushHistoryState = useCallback((newView: AppView, replace = false) => {
    const currentState = window.history.state;
    const resolvedView = resolveView(newView);
    if (!currentState || currentState.view !== resolvedView) {
      if (replace || resolvedView !== newView) {
        window.history.replaceState({ view: resolvedView }, '', `#${resolvedView}`);
        return;
      }
      window.history.pushState({ view: newView }, '', `#${newView}`);
    }
  }, [resolveView]);

  const safeSetView = useCallback((newView: AppView, shouldPush = true, replace = false) => {
    // Évite de recharger l'application au milieu des sous-écrans de connexion/inscription.
    if (!(newView === 'login' && view === 'login') && updateService.checkAndReloadIfPending()) return;
    const resolvedView = resolveView(newView);
    setView(resolvedView);
    if (shouldPush) {
      pushHistoryState(resolvedView, replace);
    }
  }, [pushHistoryState, resolveView, view]);

  // Handle gentle fallbacks when missing required state
  useEffect(() => {
    if (!isLoaded || !user) return;
    const resolution = resolveWorkflowNode({
      view,
      user,
      isLoaded,
      accountSessionReady,
      sessionAvailability: {
        hasChapter: Boolean(selectedChapter),
        hasRevision: Boolean(currentRevision),
        hasConcoursConfig: Boolean(concoursExamConfig),
        hasExamen: Boolean(currentExamen),
        hasDs: Boolean(currentDs),
        hasProbleme: Boolean(currentProbleme),
      },
    });
    if (resolution.fallbackApplied && resolution.view !== view) {
      const timer = window.setTimeout(() => safeSetView(resolution.view, false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    view, isLoaded, accountSessionReady, user,
    selectedChapter, currentRevision, concoursExamConfig,
    currentExamen, currentDs, currentProbleme, safeSetView,
  ]);

  // Handle native back/forward buttons
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Une épreuve de concours reste dans son espace contrôlé : le bouton
      // Retour natif ne doit pas sortir du quiz ni contourner sa sauvegarde.
      // La sortie officielle passe par le bouton X dans le bandeau supérieur.
      if (view === 'concours-quiz') {
        window.history.pushState({ view: 'concours-quiz' }, '', '#concours-quiz');
        return;
      }
      // Sortie du concours par back natif : purge la config pour ne pas
      // garder une session fantôme en mémoire (la reprise passe par le
      // snapshot local de concoursSession, pas par cet état).
      if (e.state && e.state.view) {
        // Restore last-opened chapter card when native-back lands on a dashboard entry
        if (e.state.view === 'dashboard' && e.state.chapterId) {
          try {
            const cached = sessionStorage.getItem(
              chapterCacheKey(e.state.chapterId, e.state.chapterClassId)
            );
            if (cached) {
              const chapter = JSON.parse(cached) as ChapterInfo;
              // Une entrée d'historique d'une autre classe ne doit jamais
              // restaurer un chapitre homonyme après un changement de profil.
              if (!chapter.classId || chapter.classId === user?.classId) {
                setSelectedChapter(chapter);
              }
            }
          } catch {
            // Ignore stale chapter cache entries.
          }
        }
        const resolvedTarget = resolveView(e.state.view);
        if (resolvedTarget !== e.state.view) {
          window.history.replaceState({ view: resolvedTarget }, '', `#${resolvedTarget}`);
        }
        safeSetView(e.state.view, false);
      } else {
        const hash = window.location.hash.replace('#', '');
        if (hash && hash !== view && hash !== 'login' && user && isKnownAppView(hash)) {
          safeSetView(hash, false);
        } else if (user) {
          safeSetView('dashboard', false);
        } else {
          if (hash && hash !== 'login') {
            window.history.replaceState({ ...(window.history.state || {}), view: 'login' }, '', '#login');
          }
          safeSetView('login', false);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, resolveView, safeSetView, view]);

  // Initial history state replacement
  useEffect(() => {
    if (view && (!window.history.state || !window.history.state.view)) {
      window.history.replaceState({ ...(window.history.state || {}), view }, '', `#${view}`);
    }
  }, [view]);

  useEffect(() => () => {
    if (profileSwitchTimerRef.current !== null) {
      window.clearTimeout(profileSwitchTimerRef.current);
      profileSwitchTimerRef.current = null;
    }
  }, []);

  const handleUpdateProfile = useCallback((updates: Partial<any>, switchView?: 'dashboard') => {
    updateProfile(updates);
    if (switchView) {
      if (profileSwitchTimerRef.current !== null) {
        window.clearTimeout(profileSwitchTimerRef.current);
      }
      profileSwitchTimerRef.current = window.setTimeout(() => {
        profileSwitchTimerRef.current = null;
        safeSetView(switchView);
      }, 350);
    }
  }, [updateProfile, safeSetView]);

  // Auto-redirect after login/logout
  useEffect(() => {
    if (!isLoaded) return;
    if (user) {
      if (view === 'login') {
        const timer = window.setTimeout(() => safeSetView('dashboard', true, true), 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    // Une vue devenue illégale (session perdue, rôle rétrogradé) est corrigée
    // par la règle unique de `resolveWorkflowNode` plutôt que rendue à vide.
    const resolved = resolveView(view);
    if (resolved !== view) {
      const timer = window.setTimeout(() => safeSetView(resolved, true, true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [user, isLoaded, view, resolveView, safeSetView]);

  // Auto-prompt push notifications after login
  useEffect(() => {
    if (!user || !isLoaded || !accountSessionReady || (user.requestedRole === 'prof' && user.role !== 'prof')) return;
    if (!pushService.isSupported() || pushService.wasAsked()) return;
    // La classe doit partir dès le premier abonnement : sans elle, l'abonné
    // atterrit hors index et le ciblage par classe de la page admin le rate.
    const timer = setTimeout(() => { pushService.subscribe(user.name, user.classId, undefined, user.accountId); }, 3000);
    return () => clearTimeout(timer);
  }, [user, isLoaded, accountSessionReady]);

  // Chapter navigation
  const handleSelectChapter = useCallback((chapter: ChapterInfo, force?: boolean) => {
    setSelectedChapter(prev => {
      const next = force
        ? chapter
        : (prev?.id === chapter.id && prev.classId === chapter.classId ? null : chapter);
      try {
        // Le cache est scopé par classe : plusieurs niveaux ont des identifiants
        // de chapitre identiques (par exemple « mise-a-niveau »).
        if (next) sessionStorage.setItem(chapterCacheKey(next.id, next.classId), JSON.stringify(next));
        // Tag the current dashboard history entry with l'identité complète du chapitre.
        window.history.replaceState(
          {
            ...(window.history.state || {}),
            chapterId: next?.id ?? null,
            chapterClassId: next?.classId ?? null,
          },
          ''
        );
      } catch {
        // Ignore history/session storage failures in restricted browser modes.
      }
      return next;
    });
  }, []);

  const handleStartSession = useCallback(() => safeSetView('session'), [safeSetView]);
  const handleStartQuiz = useCallback(() => safeSetView('quiz'), [safeSetView]);

  const handleOpenRevision = useCallback((path: string) => {
    setCurrentRevision({ path });
    safeSetView('revision');
  }, [safeSetView]);

  const handleBackToDashboard = useCallback(() => {
    if (updateService.checkAndReloadIfPending()) return;
    setSelectedChapter(null);
    safeSetView('dashboard');
  }, [safeSetView]);

  const handleBackToHub = useCallback(() => {
    if (updateService.checkAndReloadIfPending()) return;
    safeSetView('dashboard');
  }, [safeSetView]);

  // Concours handlers — le catalogue est désormais inline dans le dashboard,
  // on lance donc directement le quiz et on revient au dashboard à la sortie.
  const handleStartConcoursExam = useCallback((schoolId: string, themeId: string | null, questionCount: number, year?: string | null) => {
    setConcoursExamConfig({ schoolId, themeId, questionCount, year });
    safeSetView('concours-quiz');
  }, [safeSetView]);

  const handleConcoursQuizExit = useCallback(() => {
    setConcoursExamConfig(null);
    safeSetView('dashboard');
  }, [safeSetView]);

  // Examen handlers
  const handleStartExamen = useCallback((examen: ExamenData) => {
    setCurrentExamen(examen);
    safeSetView('examen-session');
  }, [safeSetView]);
  const handleExamenBack = useCallback(() => {
    setCurrentExamen(null);
    safeSetView('dashboard');
  }, [safeSetView]);

  const handleOpenCadreReferentiel = useCallback(() => safeSetView('cadre-referentiel'), [safeSetView]);

  // DS handlers
  const handleStartDs = useCallback((devoir: DsDevoirData) => {
    setCurrentDs(devoir);
    safeSetView('ds-session');
  }, [safeSetView]);
  const handleDsBack = useCallback(() => {
    setCurrentDs(null);
    safeSetView('dashboard');
  }, [safeSetView]);

  // Problème handlers
  const handleStartProbleme = useCallback((entry: ProblemeEntry) => {
    setCurrentProbleme(entry);
    safeSetView('probleme-view');
  }, [safeSetView]);
  const handleProblemeBack = useCallback(() => {
    setCurrentProbleme(null);
    safeSetView('dashboard');
  }, [safeSetView]);

  return {
    view, selectedChapter, currentRevision, concoursExamConfig, currentExamen, currentDs, currentProbleme,
    handleSelectChapter, handleStartSession, handleStartQuiz, handleOpenRevision,
    handleBackToDashboard, handleBackToHub,
    handleStartConcoursExam, handleConcoursQuizExit,
    handleStartExamen, handleExamenBack,
    handleOpenCadreReferentiel,
    handleStartDs, handleDsBack,
    handleStartProbleme, handleProblemeBack,
    handleUpdateProfile,
  };
}
