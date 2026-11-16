
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GlobalState, UserProfile, ChapterProgress, QuizResult, MasteryLevel } from '../types';
import { storageService } from '../services/storageService';
import { cloudSyncService } from '../services/cloudSyncService';
import { useReportGenerator } from './useReportGenerator';
import { computeQuizProgress } from '../utils/progressUtils';
import { UI_DEFAULTS } from '../utils/constants';
import { getScopedChapterProgress, scopeKey, rescopeProgress, unscopeProgress } from '../utils/progressScope';
import { profileBroadcast } from '../utils/profileBroadcast';
import { pushService } from '../services/pushService';

const normalizeIdentityPhone = (phone?: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
};

export const isSameUserIdentity = (
  current: UserProfile | null | undefined,
  next: UserProfile | null | undefined,
): boolean => {
  if (!current || !next) return false;
  if (current.accountId && next.accountId) return current.accountId === next.accountId;

  const currentPhone = normalizeIdentityPhone(current.phone);
  const nextPhone = normalizeIdentityPhone(next.phone);
  if (currentPhone && nextPhone) return currentPhone === nextPhone;

  return !currentPhone
    && !nextPhone
    && current.name === next.name
    && current.classId === next.classId;
};

const syncDeviceIdentityHints = (user: UserProfile | null) => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!user) return;
    if (user.classId) localStorage.setItem('mathplus:class-id', user.classId);
    if (user.name) localStorage.setItem('mathplus:student-name', user.name);
    if (user.phone !== undefined) localStorage.setItem('mathplus:phone', user.phone || '');
    if (user.role) localStorage.setItem('mathplus:user-role', user.role);
  } catch { /* stockage restreint */ }
};

export const useGlobalProgress = () => {
  const [state, setState] = useState<GlobalState>(() => storageService.loadState());
  const [isLoaded] = useState(true);
  const { generateAndSend } = useReportGenerator();
  const dirtyFlagsRef = useRef({ core: false, quiz: false, exercises: false, revision: false });

  // Migre les anciennes données non-scopées vers le format scopé au premier login
  const migrationDoneRef = useRef(false);

  // Track latest state for unload handlers (refs don't trigger re-renders)
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  // Le service possède sa propre barrière de génération. La garder alignée
  // avec le profil React invalide immédiatement tout travail d'un ancien compte.
  useEffect(() => {
    cloudSyncService.setActiveAccount(state.user);
  }, [state.user]);

  useEffect(() => {
    // Persistance avant que la page ne disparaisse (fermeture d'onglet,
    // rafraîchissement, mise en arrière-plan mobile).
    //
    // IMPORTANT : on force d'abord une écriture LOCALE synchrone
    // (storageService.forceSave annule le debounce et écrit immédiatement).
    // Sans cela, la progression d'un quiz quitté avant la fin pouvait être
    // perdue, car la sauvegarde locale est normalement différée
    // (debounce + requestIdle). Ce flush local s'exécute pour TOUS les élèves,
    // connectés ou non ; le cloud reste réservé aux utilisateurs identifiés.
    const persistLocalNow = () => {
      try {
        storageService.forceSave(latestStateRef.current);
      } catch { /* ignore */ }
    };

    let lastUnloadFlushAt = 0;

    // beforeunload / pagehide : sauvegarde locale + beacon cloud (survit à la
    // fermeture). pagehide est plus fiable que beforeunload sur mobile.
    const handlePageHide = () => {
      const now = Date.now();
      if (now - lastUnloadFlushAt < 500) return;
      lastUnloadFlushAt = now;
      persistLocalNow();
      if (latestStateRef.current.user) cloudSyncService.beaconSave(latestStateRef.current);
    };
    // Bascule d'onglet / d'app : flush local + sync cloud immédiat.
    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      persistLocalNow();
      if (latestStateRef.current.user) cloudSyncService.forceSave(latestStateRef.current);
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Cross-tab profile & auth sync: aligne tous les onglets sur logout/login/rescope
  useEffect(() => {
    return profileBroadcast.subscribeCrossTabAuth((event) => {
      if (event.kind === 'logout') {
        cloudSyncService.setActiveAccount(null);
        cloudSyncService.stopPeriodicSync();
        dirtyFlagsRef.current = { core: false, quiz: false, exercises: false, revision: false };
        const cleanState: GlobalState = {
          version: latestStateRef.current.version,
          user: null,
          isSessionActive: false,
          progress: {},
          lastActive: Date.now(),
        };
        latestStateRef.current = cleanState;
        setState(cleanState);
        return;
      }
      if (event.kind === 'login') {
        if (isSameUserIdentity(latestStateRef.current.user, event.user)) return;
        const reloaded = storageService.loadState();
        const syncedState: GlobalState = { ...reloaded, user: event.user, isSessionActive: true };
        latestStateRef.current = syncedState;
        setState(syncedState);
        return;
      }
      const updates = event.updates;
      setState(prev => {
        if (!prev.user) return prev;
        const hasChange = Object.entries(updates).some(
          ([k, v]) => prev.user && prev.user[k as keyof UserProfile] !== v
        );
        if (!hasChange) return prev;
        const classChanged = typeof updates.classId === 'string' && updates.classId !== prev.user.classId;
        const nextProgress = (classChanged && prev.user.classId && updates.classId)
          ? rescopeProgress(prev.progress, prev.user.classId, updates.classId)
          : prev.progress;
        const nextState = { ...prev, user: { ...prev.user, ...updates }, progress: nextProgress, lastActive: Date.now() };
        latestStateRef.current = nextState;
        return nextState;
      });
    });
  }, []);

  // Migration automatique: préfixer les clés existantes avec le classId de l'utilisateur
  useEffect(() => {
    if (!isLoaded || migrationDoneRef.current || !state.user?.classId) return;
    migrationDoneRef.current = true;

    const classId = state.user.classId;
    const prefix = `${classId}_`;
    const progress = state.progress;
    const unscopedKeys = Object.keys(progress).filter(k => !k.includes('_'));

    if (unscopedKeys.length === 0) return;

    // Migrer les clés non-scopées vers le format scopé
    const migratedProgress = { ...progress };
    for (const key of unscopedKeys) {
      const scopedKey = `${prefix}${key}`;
      // Ne pas écraser si une version scopée existe déjà
      if (!migratedProgress[scopedKey]) {
        migratedProgress[scopedKey] = migratedProgress[key];
      }
      delete migratedProgress[key];
    }

    console.info(`[Progress] Migrated ${unscopedKeys.length} chapter(s) to scoped format for class "${classId}"`);
    setState(prev => {
      const newState = { ...prev, progress: migratedProgress };
      dirtyFlagsRef.current = { core: true, quiz: true, exercises: true, revision: true };
      storageService.forceSave(newState);
      return newState;
    });
  }, [isLoaded, state.user?.classId, state.progress]);

  useEffect(() => {
    if (!isLoaded) return;
    const hasDirty = Object.values(dirtyFlagsRef.current).some(Boolean);
    if (!hasDirty) return;

    storageService.saveSlices(state, dirtyFlagsRef.current);
    dirtyFlagsRef.current = { core: false, quiz: false, exercises: false, revision: false };

    // Cloud sync debounce (60s)
    if (state.user) cloudSyncService.scheduleSave(state);
  }, [state, isLoaded]);

  const loadCloudState = useCallback((localState: GlobalState, expectedUser: UserProfile) => {
    void cloudSyncService.loadAndMerge(localState).then(merged => {
      if (!merged || !isSameUserIdentity(latestStateRef.current.user, expectedUser)) return;
      const applied: GlobalState = {
        ...merged,
        user: latestStateRef.current.user,
        isSessionActive: latestStateRef.current.isSessionActive,
      };
      latestStateRef.current = applied;
      storageService.forceSave(applied);
      setState(applied);
    });
  }, []);

  const login = useCallback((user: UserProfile) => {
    // Cette opération purge les debounce/pending/retry de l'ancienne cible
    // avant toute écriture des coordonnées du nouveau compte.
    cloudSyncService.setActiveAccount(user);
    const prev = latestStateRef.current;
    const accountChanged = !!prev.user && !isSameUserIdentity(prev.user, user);
    if (accountChanged) {
      storageService.clear();
    }
    syncDeviceIdentityHints(user);
    void pushService.syncClass(user.name, user.classId, user.accountId);

    const newState: GlobalState = accountChanged
      ? {
          ...prev,
          user,
          isSessionActive: true,
          progress: {},
          lastActive: Date.now(),
        }
      : { ...prev, user, isSessionActive: true, lastActive: Date.now() };

    if (accountChanged) {
      migrationDoneRef.current = false;
      dirtyFlagsRef.current = { core: true, quiz: true, exercises: true, revision: true };
    } else {
      dirtyFlagsRef.current.core = true;
    }
    latestStateRef.current = newState;
    storageService.forceSave(newState);
    setState(newState);
    profileBroadcast.emitAuth({ kind: 'login', user });
    loadCloudState(newState, user);
  }, [loadCloudState]);

  /**
   * Réconcilie le profil local avec une identité rendue par une route de
   * session authentifiée. `null` retire seulement les privilèges locaux : la
   * progression élève reste disponible hors connexion.
   */
  const applyVerifiedUser = useCallback((verifiedUser: UserProfile | null) => {
    if (verifiedUser) cloudSyncService.setActiveAccount(verifiedUser);

    const prev = latestStateRef.current;
    const currentUser = prev.user;
    let nextUser: UserProfile | null = currentUser;
    let accountChanged = false;

    if (!verifiedUser) {
      if (!currentUser || currentUser.role !== 'prof') return;
      nextUser = { ...currentUser, role: 'student' };
    } else {
      const normalizedUser: UserProfile = {
        ...verifiedUser,
        role: verifiedUser.role === 'prof' ? 'prof' : 'student',
      };
      const sameIdentity = isSameUserIdentity(currentUser, normalizedUser);
      accountChanged = !!currentUser && !sameIdentity;
      nextUser = sameIdentity
        ? { ...currentUser, ...normalizedUser }
        : normalizedUser;

      const keys = new Set([
        ...Object.keys(currentUser || {}),
        ...Object.keys(nextUser),
      ] as Array<keyof UserProfile>);
      const unchanged = !!currentUser
        && Array.from(keys).every(key => currentUser[key] === nextUser?.[key]);
      if (unchanged && prev.isSessionActive) return;
    }

    if (accountChanged) {
      storageService.clear();
      migrationDoneRef.current = false;
      dirtyFlagsRef.current = { core: true, quiz: true, exercises: true, revision: true };
    } else {
      dirtyFlagsRef.current.core = true;
    }

    const updated: GlobalState = accountChanged
      ? {
          ...prev,
          user: nextUser,
          isSessionActive: !!nextUser,
          progress: {},
          lastActive: Date.now(),
        }
      : { ...prev, user: nextUser, isSessionActive: !!nextUser };

    latestStateRef.current = updated;
    storageService.forceSave(updated);
    syncDeviceIdentityHints(nextUser);
    setState(updated);
    if (accountChanged && nextUser) loadCloudState(updated, nextUser);
  }, [loadCloudState]);

  const flushCloudSave = useCallback(async () => {
    const snapshot = latestStateRef.current;
    if (!snapshot.user) return false;
    return cloudSyncService.forceSave(snapshot);
  }, []);

  const logout = useCallback((options?: { skipCloudSave?: boolean }) => {
    const outgoingState = latestStateRef.current;
    if (!options?.skipCloudSave && outgoingState.user) {
      void cloudSyncService.forceSave(outgoingState);
    }
    cloudSyncService.setActiveAccount(null);
    cloudSyncService.stopPeriodicSync();
    storageService.clear();
    dirtyFlagsRef.current = { core: false, quiz: false, exercises: false, revision: false };
    const loggedOutState: GlobalState = {
      version: outgoingState.version,
      user: null,
      isSessionActive: false,
      progress: {},
      lastActive: Date.now(),
    };
    latestStateRef.current = loggedOutState;
    setState(loggedOutState);
    profileBroadcast.emitAuth({ kind: 'logout' });
    return outgoingState;
  }, []);

  // Helper pour initialiser ou récupérer un chapitre avec la structure par défaut centralisée
  const getChapterProgress = (progressMap: Record<string, ChapterProgress>, scopedId: string): ChapterProgress => {
    if (progressMap[scopedId]) return progressMap[scopedId];
    return storageService.getDefaultChapterProgress();
  };

  const saveQuizProgress = useCallback((classId: string, chapterId: string, index: number, history: QuizResult[], totalQuestions: number) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const now = Date.now();

      const newProgress: ChapterProgress = {
        ...chapterProgress,
        lastActiveAt: now,
        quiz: { ...chapterProgress.quiz, currentQuestionIndex: index, history: history, totalQuestions: totalQuestions }
      };
      dirtyFlagsRef.current.quiz = true;
      return { ...prev, progress: { ...prev.progress, [sid]: newProgress } };
    });
  }, []);

  const submitQuiz = useCallback((classId: string, chapterId: string, score: number, totalQuestions: number, answersSnapshot?: Record<string, any>, duration?: number) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const now = Date.now();

      if (chapterProgress.quiz.isSubmitted) return prev;
      const newScorePercent = Math.round((score / totalQuestions) * 100);
      const newProgress: ChapterProgress = {
        ...chapterProgress,
        lastActiveAt: now,
        quiz: {
          ...chapterProgress.quiz,
          isSubmitted: true,
          score: newScorePercent,
          highScore: Math.max(chapterProgress.quiz.highScore, newScorePercent),
          attempts: chapterProgress.quiz.attempts + 1,
          answersSnapshot: answersSnapshot || chapterProgress.quiz.answersSnapshot,
          durationSeconds: duration || chapterProgress.quiz.durationSeconds,
          history: chapterProgress.quiz.history,
          currentQuestionIndex: 0,
          totalQuestions: totalQuestions
        }
      };
      dirtyFlagsRef.current.quiz = true;
      dirtyFlagsRef.current.core = true;
      const newState = { ...prev, progress: { ...prev.progress, [sid]: newProgress } };
      // Force cloud save on quiz completion
      cloudSyncService.forceSave(newState);
      return newState;
    });
  }, []);

  const resetQuizProgress = useCallback((classId: string, chapterId: string) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const now = Date.now();

      const newProgress: ChapterProgress = {
        ...chapterProgress,
        lastActiveAt: now,
        quiz: {
          ...chapterProgress.quiz,
          isSubmitted: false,
          score: 0,
          history: [],
          currentQuestionIndex: 0,
          totalQuestions: chapterProgress.quiz.totalQuestions,
          answersSnapshot: undefined,
          durationSeconds: 0,
        },
      };

      dirtyFlagsRef.current.quiz = true;
      dirtyFlagsRef.current.core = true;
      const newState = { ...prev, progress: { ...prev.progress, [sid]: newProgress }, lastActive: Date.now() };
      storageService.forceSave(newState);
      cloudSyncService.forceSave(newState);
      return newState;
    });
  }, []);

  const updateExerciseProgress = useCallback((classId: string, chapterId: string, uniqueId: string, mastery: MasteryLevel, lastHintIndex?: number) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
        const sid = scopeKey(normalizedClassId, chapterId);
        const chapterProgress = getChapterProgress(prev.progress, sid);
        const currentExercises = chapterProgress.exercises || {};
        const now = Date.now();
        const updatedProgress: ChapterProgress = {
          ...chapterProgress,
          lastActiveAt: now,
          exercises: {
            ...currentExercises,
            [uniqueId]: { isCompleted: true, mastery, lastHintIndex }
          }
        };
        dirtyFlagsRef.current.exercises = true;
        return { ...prev, progress: { ...prev.progress, [sid]: updatedProgress } };
    });
  }, []);

  const updateExerciseFeedback = useCallback((classId: string, chapterId: string, exerciseId: string, mastery: MasteryLevel, duration?: number | null) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
        const sid = scopeKey(normalizedClassId, chapterId);
        const chapterProgress = getChapterProgress(prev.progress, sid);
        const currentFeedback = chapterProgress.exerciseFeedback || {};
        const currentDurations = chapterProgress.exerciseDurations || {};
        const now = Date.now();
        const updatedProgress: ChapterProgress = {
          ...chapterProgress,
          lastActiveAt: now,
          exerciseFeedback: {
            ...currentFeedback,
            [exerciseId]: mastery
          },
          exerciseDurations: {
            ...currentDurations,
            ...(duration !== undefined ? { [exerciseId]: duration } : {})
          }
        };
        dirtyFlagsRef.current.exercises = true;
        return { ...prev, progress: { ...prev.progress, [sid]: updatedProgress } };
    });
  }, []);

  const updateRevisionProgress = useCallback((classId: string, chapterId: string, progressPercentage: number, activeSectionId?: string, sheetKey?: string) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const currentProgress = chapterProgress.revisionProgress || 0;
      const newProgress = Math.max(currentProgress, progressPercentage);
      const now = Date.now();
      // Progression par fiche : la clé est vide pour la fiche principale, qui
      // continue d'alimenter `revisionProgress` (compatibilité des données).
      const previousBySheet = chapterProgress.revisionProgressBySheet || {};
      const sheetProgress = sheetKey
        ? Math.max(previousBySheet[sheetKey] || 0, progressPercentage)
        : previousBySheet[sheetKey || ''];
      const bySheet = sheetKey && sheetProgress !== previousBySheet[sheetKey]
        ? { ...previousBySheet, [sheetKey]: sheetProgress }
        : previousBySheet;

      if (
        newProgress === currentProgress
        && bySheet === previousBySheet
        && chapterProgress.lastActiveSection === activeSectionId
      ) return prev;

      const updatedProgress: ChapterProgress = {
        ...chapterProgress,
        lastActiveAt: now,
        revisionProgress: newProgress,
        revisionProgressBySheet: bySheet,
        lastActiveSection: activeSectionId || chapterProgress.lastActiveSection
      };
      dirtyFlagsRef.current.revision = true;
      dirtyFlagsRef.current.core = true;
      return { ...prev, progress: { ...prev.progress, [sid]: updatedProgress }, lastActive: Date.now() };
    });
  }, []);

  const saveRevealedBlank = useCallback((classId: string, chapterId: string, blankId: string) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
        const sid = scopeKey(normalizedClassId, chapterId);
        const chapterProgress = getChapterProgress(prev.progress, sid);
        const currentBlanks = chapterProgress.revealedBlanks || [];
        if (currentBlanks.includes(blankId)) return prev;
        const now = Date.now();

        const updatedProgress: ChapterProgress = {
          ...chapterProgress,
          lastActiveAt: now,
          revealedBlanks: [...currentBlanks, blankId]
        };
        dirtyFlagsRef.current.revision = true;
        return { ...prev, progress: { ...prev.progress, [sid]: updatedProgress } };
    });
  }, []);

  const toggleSkillMastery = useCallback((classId: string, chapterId: string, skillId: string) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
        const sid = scopeKey(normalizedClassId, chapterId);
        const chapterProgress = getChapterProgress(prev.progress, sid);
        const currentSkills = chapterProgress.masteredSkills || [];
        const now = Date.now();
        const newSkills = currentSkills.includes(skillId)
            ? currentSkills.filter(id => id !== skillId)
            : [...currentSkills, skillId];

        const updatedProgress: ChapterProgress = {
            ...chapterProgress,
            lastActiveAt: now,
            masteredSkills: newSkills
        };
        dirtyFlagsRef.current.revision = true;
        return { ...prev, progress: { ...prev.progress, [sid]: updatedProgress } };
    });
  }, []);

  const confirmSeance = useCallback((classId: string, chapterId: string, seance: number, nextSectionId?: string) => {
    if (!Number.isInteger(seance) || seance < 1) return;
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;

    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const completedSeances = chapterProgress.completedSeances || [];
      if (completedSeances.includes(seance)) return prev;

      const now = Date.now();
      const updatedProgress: ChapterProgress = {
        ...chapterProgress,
        lastActiveAt: now,
        lastActiveSection: nextSectionId || chapterProgress.lastActiveSection,
        completedSeances: [...completedSeances, seance].sort((a, b) => a - b),
      };

      dirtyFlagsRef.current.revision = true;
      dirtyFlagsRef.current.core = true;
      const newState: GlobalState = {
        ...prev,
        progress: { ...prev.progress, [sid]: updatedProgress },
        lastActive: now,
      };
      storageService.forceSave(newState);
      if (newState.user) void cloudSyncService.forceSave(newState);
      return newState;
    });
  }, []);

  const submitChapter = useCallback(async (classId: string, chapterId: string) => {
    const normalizedClassId = classId.trim();
    if (!normalizedClassId) return;
    setState(prev => {
      const sid = scopeKey(normalizedClassId, chapterId);
      const chapterProgress = getChapterProgress(prev.progress, sid);
      const now = Date.now();
      const newProgress: ChapterProgress = { ...chapterProgress, lastActiveAt: now, isChapterSubmitted: true, submittedAt: now };
      if (prev.user) generateAndSend(prev.user, chapterId, newProgress, prev.version);
      const newState = { ...prev, progress: { ...prev.progress, [sid]: newProgress } };
      dirtyFlagsRef.current.revision = true;
      dirtyFlagsRef.current.core = true;
      storageService.forceSave(newState);
      // Force cloud save on chapter submission
      cloudSyncService.forceSave(newState);
      return newState;
    });
  }, [generateAndSend]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    const prev = latestStateRef.current;
    if (!prev.user) return;
    const oldUser = prev.user;
    const newUser: UserProfile = { ...oldUser, ...updates };
    const classChanged = Boolean(updates.classId && updates.classId !== oldUser.classId);

    // Un changement de téléphone/classe conserve le compte (accountId) mais
    // change la cible cloud : les travaux visant les anciennes coordonnées
    // doivent être purgés avant de planifier la première sauvegarde des nouvelles.
    cloudSyncService.setActiveAccount(newUser);
    profileBroadcast.emit(updates);

    const newProgress = (classChanged && oldUser.classId && updates.classId)
      ? rescopeProgress(prev.progress, oldUser.classId, updates.classId)
      : prev.progress;

    const updated: GlobalState = { ...prev, user: newUser, progress: newProgress, lastActive: Date.now() };
    dirtyFlagsRef.current.core = true;
    dirtyFlagsRef.current.quiz = true;
    dirtyFlagsRef.current.exercises = true;
    dirtyFlagsRef.current.revision = true;
    latestStateRef.current = updated;
    storageService.forceSave(updated);
    syncDeviceIdentityHints(newUser);
    setState(updated);

    // Re-synchronise l'abonnement push si la classe a changé
    void pushService.syncClass(newUser.name, newUser.classId, newUser.accountId);

    // Sync profile changes to backend (user data + progress migration)
    fetch('/api/users?action=register', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        originalPhone: oldUser.phone || '',
        originalClassId: oldUser.classId,
        originalName: oldUser.name,
        updates: {
          name: newUser.name,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phone: newUser.phone,
          email: newUser.email,
          classId: newUser.classId,
          className: newUser.className,
          schoolName: newUser.schoolName,
          birthdate: newUser.birthdate,
          dashboardTheme: newUser.dashboardTheme,
          profPage: newUser.profPage,
          profPrefs: newUser.profPrefs,
        },
      }),
    }).then((res) => {
      if (!res.ok) return;
      void cloudSyncService.forceSave(latestStateRef.current);
    }).catch(() => {});
  }, []);

  const isExerciseModuleLocked = (classId: string, chapterId: string): boolean => {
    const chap = getScopedChapterProgress(state.progress, classId, chapterId);
    if (!chap) return true;
    if (chap.quiz?.isSubmitted) return false;
    const quizPercent = computeQuizProgress(chap, chap.quiz?.totalQuestions || 0);
    return quizPercent < UI_DEFAULTS.EXERCISE_UNLOCK_THRESHOLD;
  };

  const getChapterProgressForClass = useCallback((classId: string, chapterId: string) => (
    getScopedChapterProgress(state.progress, classId, chapterId)
  ), [state.progress]);

  // Projection de compatibilité réservée aux vues du tableau de bord de la classe courante.
  const scopedProgress = useMemo(() => {
    const classId = state.user?.classId;
    if (!classId) return state.progress;
    return unscopeProgress(state.progress, classId);
  }, [state.progress, state.user?.classId]);

  return {
    user: state.isSessionActive ? state.user : null,
    globalProgress: scopedProgress,
    getChapterProgressForClass,
    login, logout, flushCloudSave, applyVerifiedUser,
    saveQuizProgress, updateExerciseProgress, updateExerciseFeedback, updateRevisionProgress, saveRevealedBlank,
    toggleSkillMastery, confirmSeance,
    submitQuiz, resetQuizProgress, submitChapter, isExerciseModuleLocked, updateProfile, isLoaded
  };
};
