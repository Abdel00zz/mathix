'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { LastVisited, StudentProfile, StudentState } from '@/lib/types';
import {
  applyProfileToDom,
  CLASS_COOKIE,
  DEFAULT_PROFILE,
  DEFAULT_STATE,
  KEY_PROFILE,
  KEY_STATE,
  normalizeProfile,
  normalizeState,
  playTone,
  readProfileFromStorage,
  readStateFromStorage,
  writeProfileToStorage,
  writeResetAtToStorage,
  writeStateToStorage,
} from '@/lib/storage';
import { clearStickyUnlocks } from '@/lib/unlocks';
import { clearResumeStore } from '@/lib/resumeStore';
import { LexiconAndMediaOverlay } from './LexiconAndMediaOverlay';

export type ModalKind = 'orientation' | 'help' | 'settings' | 'mobileMenu' | null;

interface ToastState {
  message: string;
  id: number;
}

interface AppContextValue {
  profile: StudentProfile;
  state: StudentState;
  hydrated: boolean;
  activeModal: ModalKind;
  setActiveModal: (m: ModalKind) => void;
  updateProfile: (patch: Partial<StudentProfile>, options?: { preserveTimestamp?: boolean }) => StudentProfile;
  saveState: (updater: StudentState | ((prev: StudentState) => StudentState)) => void;
  recordLastVisited: (info: LastVisited | null) => void;
  resetProgress: () => void;
  showToast: (message: string) => void;
  chime: (kind: 'ok' | 'bad' | 'tick') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  initialClassId,
  children,
}: {
  initialClassId?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<StudentProfile>(() =>
    normalizeProfile(initialClassId ? { cls: initialClassId as StudentProfile['cls'] } : DEFAULT_PROFILE)
  );
  const [state, setState] = useState<StudentState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !('serviceWorker' in navigator)) return;
    // A PWA previously installed on this origin must not serve stale development chunks.
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      let releasedController = false;
      for (const registration of registrations) {
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker || new URL(worker.scriptURL).pathname !== '/sw-apprendre.js') continue;
        if (new URL(worker.scriptURL).origin !== window.location.origin) continue;
        const controlled = navigator.serviceWorker.controller?.scriptURL === worker.scriptURL;
        const removed = await registration.unregister();
        releasedController ||= Boolean(controlled && removed);
      }
      if (releasedController) window.location.reload();
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const loadedProfile = readProfileFromStorage();
    const loadedState = readStateFromStorage();
    setProfile(loadedProfile);
    setState(loadedState);
    applyProfileToDom(loadedProfile);
    if (typeof document !== 'undefined') {
      document.cookie = `${CLASS_COOKIE}=${encodeURIComponent(loadedProfile.cls)}; path=/; max-age=31536000; SameSite=Lax`;
    }
    setHydrated(true);

    if (initialClassId && loadedProfile.cls !== initialClassId && navigator.onLine) {
      router.refresh();
    }

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === KEY_PROFILE) {
        const nextP = readProfileFromStorage();
        setProfile(nextP);
        applyProfileToDom(nextP);
        if (navigator.onLine) router.refresh();
      } else if (ev.key === KEY_STATE) {
        setState(readStateFromStorage());
      }
    };
    window.addEventListener('storage', onStorage);

    return () => window.removeEventListener('storage', onStorage);
  }, [initialClassId, router]);

  useEffect(() => {
    if (!hydrated || !('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let cancelled = false;
    const updateWorker = () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker || cancelled) return;
      worker.postMessage({ type: 'SET_CLASS', classId: profile.cls });
      if (navigator.onLine) worker.postMessage({
        type: 'WARM_PAGE',
        url: window.location.href,
        assets: [...new Set([
          ...Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"], link[rel="preload"]'))
            .map((el) => el instanceof HTMLScriptElement ? el.src : el.href),
          ...performance.getEntriesByType('resource').map((entry) => entry.name),
        ])],
      });
    };
    navigator.serviceWorker.addEventListener('controllerchange', updateWorker);
    navigator.serviceWorker.register('/sw-apprendre.js', { updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(updateWorker)
      .catch(() => setToast({ message: 'Le mode hors connexion n’a pas pu être activé.', id: Date.now() }));

    // Next's RSC requests stay network-only. A document navigation can use cached HTML offline.
    const offlineLink = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(url.href);
    };
    document.addEventListener('click', offlineLink, true);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', updateWorker);
      document.removeEventListener('click', offlineLink, true);
    };
  }, [hydrated, profile.cls, pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<StudentProfile>, options?: { preserveTimestamp?: boolean }) => {
      const nextProfile = normalizeProfile({
        ...profile,
        ...patch,
        profileUpdatedAt: options?.preserveTimestamp ? (patch.profileUpdatedAt ?? 0) : Date.now(),
      });
      const clsChanged = nextProfile.cls !== profile.cls;
      writeProfileToStorage(nextProfile);
      applyProfileToDom(nextProfile);
      setProfile(nextProfile);
      if (clsChanged && navigator.onLine) {
        router.refresh();
      } else if (clsChanged) {
        setToast({ message: 'Reconnectez-vous pour charger le programme de cette filière.', id: Date.now() });
      }
      return nextProfile;
    },
    [profile, router]
  );

  const saveState = useCallback((updater: StudentState | ((prev: StudentState) => StudentState)) => {
    setState((prev) => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      if (updated === prev) return prev;
      const next = normalizeState(updated);
      writeStateToStorage(next);
      return next;
    });
  }, []);

  const recordLastVisited = useCallback((info: LastVisited | null) => {
    setState((prev) => {
      const next = { ...prev, lastVisited: info ? { ...info, at: info.at ?? Date.now() } : null };
      writeStateToStorage(next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    clearStickyUnlocks();
    clearResumeStore();
    writeResetAtToStorage(Date.now());
    writeStateToStorage(DEFAULT_STATE);
    setState(DEFAULT_STATE);
    showToast('Progression réinitialisée');
  }, [showToast]);

  const chime = useCallback(
    (kind: 'ok' | 'bad' | 'tick') => {
      playTone(kind, profile.soundEnabled);
    },
    [profile.soundEnabled]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      state,
      hydrated,
      activeModal,
      setActiveModal,
      updateProfile,
      saveState,
      recordLastVisited,
      resetProgress,
      showToast,
      chime,
    }),
    [profile, state, hydrated, activeModal, updateProfile, saveState, recordLastVisited, resetProgress, showToast, chime]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <LexiconAndMediaOverlay />
      {toast ? (
        <div id="pwa-toast" className="mf-toast" role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      ) : null}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
