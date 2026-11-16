import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSameUserIdentity } from './useGlobalProgress';
import { accountSessionService, type AccountSessionProbeResult } from '../services/accountSessionService';
import { professorSessionService } from '../services/professorSessionService';
import { AsyncThreadCoordinator } from '../utils/appWorkflow';
import type { UserProfile } from '../types';

export type AuthNotice = 'session_expired' | null;

interface UseSessionLifecycleParams {
  user: UserProfile | null;
  login: (userData: UserProfile) => void;
  logout: (options?: { skipCloudSave?: boolean }) => void;
  flushCloudSave: () => Promise<boolean>;
  applyVerifiedUser: (verifiedUser: UserProfile | null) => void;
}

/**
 * Orchestre la vérification serveur du cookie HttpOnly, la bascule propre entre
 * comptes, l'expiration sur 401 et la déconnexion ordonnée.
 */
export function useSessionLifecycle({
  user,
  login,
  logout,
  flushCloudSave,
  applyVerifiedUser,
}: UseSessionLifecycleParams) {
  const [accountSessionReady, setAccountSessionReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null);

  const currentUserRef = useRef<UserProfile | null>(user);
  const sessionReadyRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const sessionRefreshPausedRef = useRef(false);
  const bootstrapPromiseRef = useRef<Promise<AccountSessionProbeResult> | null>(null);
  const threadCoordinator = useMemo(() => new AsyncThreadCoordinator(), []);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  const commitVerifiedUser = useCallback((nextUser: UserProfile, forceLogin = false) => {
    professorSessionService.acceptVerifiedUser(nextUser);
    const current = currentUserRef.current;
    const sameIdentity = isSameUserIdentity(current, nextUser);
    if (current && !sameIdentity) {
      // Le cookie serveur appartient déjà à `nextUser` : purge locale de A sans sauvegarde sous le cookie de B.
      logout({ skipCloudSave: true });
      login(nextUser);
    } else if (forceLogin || !current) {
      login(nextUser);
    } else {
      applyVerifiedUser(nextUser);
    }
    currentUserRef.current = nextUser;
    sessionRefreshPausedRef.current = false;
    setAuthNotice(null);
  }, [applyVerifiedUser, login, logout]);

  const removeUnverifiedProfessorAccess = useCallback(() => {
    professorSessionService.acceptVerifiedUser(null);
    applyVerifiedUser(null);
    if (currentUserRef.current?.role === 'prof') {
      currentUserRef.current = { ...currentUserRef.current, role: 'student' };
    }
  }, [applyVerifiedUser]);

  const expireAuthenticatedSession = useCallback(() => {
    const hadSession = Boolean(currentUserRef.current) || professorSessionService.isProfessor();
    sessionEpochRef.current += 1;
    professorSessionService.clear(false);
    applyVerifiedUser(null);
    if (hadSession) {
      currentUserRef.current = null;
      logout({ skipCloudSave: true });
      setAuthNotice('session_expired');
    }
  }, [applyVerifiedUser, logout]);

  const handleVerifiedLogin = useCallback((nextUser: UserProfile) => {
    sessionEpochRef.current += 1;
    threadCoordinator.cancel('session_restore');
    commitVerifiedUser(nextUser, true);
  }, [commitVerifiedUser, threadCoordinator]);

  const refreshPendingProfessor = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    const result = await threadCoordinator.run(
      'session_restore',
      async ({ signal, isCurrent }) => {
        const probe = await accountSessionService.getCurrentUserStatus({ signal });
        if (!isCurrent() || sessionRefreshPausedRef.current || epoch !== sessionEpochRef.current) {
          return false;
        }
        if (probe.status === 'authenticated') {
          commitVerifiedUser(probe.user);
          return probe.user.role === 'prof';
        }
        if (probe.status === 'unauthenticated') {
          expireAuthenticatedSession();
        }
        return false;
      },
      { mode: 'supersede' },
    );
    return result.status === 'completed' ? result.value : false;
  }, [commitVerifiedUser, expireAuthenticatedSession, threadCoordinator]);

  const handleLogout = useCallback(async () => {
    const epoch = ++sessionEpochRef.current;
    sessionRefreshPausedRef.current = true;
    threadCoordinator.cancel('session_restore');
    setAuthNotice(null);
    professorSessionService.clear(false);
    currentUserRef.current = null;
    const savePromise = flushCloudSave();
    logout({ skipCloudSave: true });
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      let timeoutId: number | undefined;
      await Promise.race([
        savePromise.catch(() => false),
        new Promise<void>(resolve => {
          timeoutId = window.setTimeout(resolve, 900);
        }),
      ]).finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      });
    }
    if (epoch !== sessionEpochRef.current) return;
    await accountSessionService.logout().catch(() => undefined);
  }, [flushCloudSave, logout, threadCoordinator]);

  useEffect(() => {
    let active = true;
    const bootstrapEpoch = sessionEpochRef.current;

    if (!bootstrapPromiseRef.current) {
      const timeoutMs = typeof navigator !== 'undefined' && navigator.onLine === false ? 500 : 3500;
      bootstrapPromiseRef.current = accountSessionService.getCurrentUserStatus({ timeoutMs });
    }

    const applyProbe = (probe: AccountSessionProbeResult) => {
      if (probe.status === 'authenticated') {
        commitVerifiedUser(probe.user);
      } else if (probe.status === 'unauthenticated') {
        expireAuthenticatedSession();
      } else {
        removeUnverifiedProfessorAccess();
      }
    };

    void bootstrapPromiseRef.current
      .then(probe => {
        if (!active || bootstrapEpoch !== sessionEpochRef.current) return;
        applyProbe(probe);
      })
      .catch(() => {
        if (!active || bootstrapEpoch !== sessionEpochRef.current) return;
        removeUnverifiedProfessorAccess();
      })
      .finally(() => {
        if (!active) return;
        sessionReadyRef.current = true;
        setAccountSessionReady(true);
      });

    const refreshSession = async () => {
      if (
        !active
        || !sessionReadyRef.current
        || sessionRefreshPausedRef.current
        || threadCoordinator.isRunning('session_restore')
      ) return;
      const epoch = sessionEpochRef.current;
      await threadCoordinator.run(
        'session_restore',
        async ({ signal, isCurrent }) => {
          const probe = await accountSessionService.getCurrentUserStatus({ signal });
          if (!active || !isCurrent() || sessionRefreshPausedRef.current || epoch !== sessionEpochRef.current) return;
          applyProbe(probe);
        },
        { mode: 'dedupe' },
      );
    };

    const handleOnline = () => { void refreshSession(); };
    const handleVisibility = () => {
      if (!document.hidden) void refreshSession();
    };
    const refreshTimer = window.setInterval(() => { void refreshSession(); }, 60_000);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      threadCoordinator.cancelAll();
      window.clearInterval(refreshTimer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [commitVerifiedUser, expireAuthenticatedSession, removeUnverifiedProfessorAccess, threadCoordinator]);

  return {
    accountSessionReady,
    authNotice,
    clearAuthNotice: useCallback(() => setAuthNotice(null), []),
    handleVerifiedLogin,
    refreshPendingProfessor,
    handleLogout,
  };
}
