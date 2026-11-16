'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCloudEnvelopeToLocalStores,
  createCloudEnvelope,
  fetchCloudSession,
  flushCloudOutbox,
  isHttpOrigin,
  loadGoogleIdentityScript,
  logoutCloudSession,
  mergeCloudEnvelopes,
  pullCloudEnvelope,
  pushCloudEnvelope,
  signInWithGoogleToken,
  toStudentState,
  type CloudEnvelope,
  type CloudProviders,
  type CloudStatus,
  type CloudSyncState,
} from '@/lib/cloudSync';
import { normalizeProfile, readAccountOwnerFromStorage, readProfileFromStorage, readStateFromStorage } from '@/lib/storage';
import { useApp } from './AppProvider';

export interface CloudAccountBoxProps {
  status?: CloudStatus;
  onStatusChange?: (status: CloudStatus) => void;
  onSync?: () => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  onSignInCredential?: (idToken: string) => Promise<void> | void;
  portalHref?: string;
}

const SYNC_STATE_LABELS: Record<CloudSyncState, string> = {
  idle: 'Local',
  syncing: 'Synchro...',
  synced: 'Synchronisé',
  pending: 'En attente',
  offline: 'Hors-ligne',
  error: 'Erreur réseau',
};

function getStorageLabel(isHttp: boolean, providers: CloudProviders | null): string {
  if (!isHttp) return 'file://';
  if (providers?.redisEnabled && providers?.firestoreEnabled) return 'Redis + Firestore';
  if (providers?.redisEnabled) return 'Redis';
  if (providers?.firestoreEnabled) return 'Firestore';
  return 'Local';
}

export function CloudAccountBox({
  status: controlledStatus,
  onStatusChange,
  onSync,
  onLogout,
  onSignInCredential,
  portalHref = '/',
}: CloudAccountBoxProps) {
  const { profile, state, hydrated, updateProfile, saveState, showToast } = useApp();
  const gisSlotRef = useRef<HTMLDivElement>(null);

  const profileRef = useRef(profile);
  const stateRef = useRef(state);
  profileRef.current = profile;
  stateRef.current = state;
  const actionsRef = useRef({ updateProfile, saveState });
  actionsRef.current = { updateProfile, saveState };
  const sessionVersionRef = useRef(0);

  const [internalStatus, setInternalStatus] = useState<CloudStatus>(() => ({
    isHttp: true,
    authenticated: false,
    user: null,
    providers: null,
    syncState: 'idle',
    lastSyncedAt: 0,
    error: '',
  }));

  const status = controlledStatus ?? internalStatus;
  const statusRef = useRef(status);
  statusRef.current = status;
  const applyingRemoteRef = useRef(false);

  const patchStatus = useCallback(
    (patch: Partial<CloudStatus>) => {
      const next = { ...statusRef.current, ...patch };
      statusRef.current = next;
      setInternalStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  const applyRemoteEnvelope = useCallback(
    (remoteEnvelope: CloudEnvelope | null | undefined) => {
      if (!remoteEnvelope) return;
      applyingRemoteRef.current = true;
      try {
        const localEnvelope = createCloudEnvelope(profileRef.current, stateRef.current);
        const merged = mergeCloudEnvelopes(remoteEnvelope, localEnvelope);

        const remUpdated = Number(remoteEnvelope.profile?.profileUpdatedAt) || 0;
        const locUpdated = Number(profileRef.current.profileUpdatedAt) || 0;
        const nextProfile = normalizeProfile({ ...profileRef.current, ...merged.profile });
        if (remUpdated > locUpdated && JSON.stringify({ ...nextProfile, profileUpdatedAt: 0 }) !== JSON.stringify({ ...profileRef.current, profileUpdatedAt: 0 })) {
          actionsRef.current.updateProfile(merged.profile, { preserveTimestamp: true });
          profileRef.current = nextProfile;
        }
        applyCloudEnvelopeToLocalStores(merged);
        const nextState = toStudentState(merged.state);
        // Identical server echoes must not produce another React update / auto-push.
        if (JSON.stringify(nextState) !== JSON.stringify(stateRef.current)) {
          stateRef.current = nextState;
          actionsRef.current.saveState(nextState);
        }
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [],
  );

  const reloadLocalSession = useCallback(() => {
    const nextProfile = readProfileFromStorage();
    const nextState = readStateFromStorage();
    profileRef.current = nextProfile;
    stateRef.current = nextState;
    actionsRef.current.updateProfile(nextProfile, { preserveTimestamp: true });
    actionsRef.current.saveState(nextState);
  }, []);

  // Auto-sync debounced on local progress/profile changes when authenticated
  useEffect(() => {
    if (!hydrated || controlledStatus || applyingRemoteRef.current || !status.isHttp || !status.authenticated) return;
    const sessionVersion = sessionVersionRef.current;
    const t = window.setTimeout(async () => {
      const env = createCloudEnvelope(profileRef.current, stateRef.current);
      const pushed = await pushCloudEnvelope(env);
      if (sessionVersion !== sessionVersionRef.current) return;
      if (pushed.envelope) applyRemoteEnvelope(pushed.envelope);
      patchStatus({
        syncState: pushed.syncState,
        ...(pushed.ok ? { lastSyncedAt: Date.now() } : {}),
        error: pushed.error || '',
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [profile, state, hydrated, status.isHttp, status.authenticated, controlledStatus, applyRemoteEnvelope, patchStatus]);

  // Hydrate cloud session & listen to browser online/offline transitions
  useEffect(() => {
    if (!hydrated || controlledStatus) return;

    const http = isHttpOrigin();
    if (!http) {
      patchStatus({ isHttp: false, syncState: 'offline' });
      return;
    }

    let cancelled = false;
    const sessionVersion = sessionVersionRef.current;
    const isStale = () => cancelled || sessionVersion !== sessionVersionRef.current;

    const initSession = async () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      const previousOwner = readAccountOwnerFromStorage();
      const session = await fetchCloudSession();
      if (isStale()) return;
      if (previousOwner && session.authenticated && session.user?.accountId !== previousOwner) reloadLocalSession();

      patchStatus({
        isHttp: true,
        authenticated: session.authenticated,
        user: session.user,
        providers: session.providers,
        syncState: session.authenticated ? 'syncing' : online ? 'idle' : 'offline',
        error: session.error || '',
      });

      if (session.authenticated) {
        const flushed = await flushCloudOutbox();
        if (isStale()) return;
        if (flushed.envelope) applyRemoteEnvelope(flushed.envelope);

        const pulled = await pullCloudEnvelope();
        if (isStale()) return;
        if (pulled.envelope) applyRemoteEnvelope(pulled.envelope);

        patchStatus({
          syncState: pulled.error ? 'error' : 'synced',
          lastSyncedAt: Date.now(),
          error: pulled.error || '',
        });
      }
    };

    void initSession();

    const handleOnline = () => {
      if (!statusRef.current.authenticated) {
        patchStatus({ syncState: 'idle', error: '' });
        return;
      }
      void (async () => {
        const onlineVersion = sessionVersionRef.current;
        const flushed = await flushCloudOutbox();
        if (cancelled || onlineVersion !== sessionVersionRef.current) return;
        if (flushed.envelope) applyRemoteEnvelope(flushed.envelope);
        patchStatus({
          syncState: flushed.error ? 'error' : 'synced',
          ...(flushed.flushed > 0 ? { lastSyncedAt: Date.now() } : {}),
          error: flushed.error || '',
        });
      })();
    };

    const handleOffline = () => {
      patchStatus({ syncState: 'offline' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hydrated, applyRemoteEnvelope, controlledStatus, patchStatus, reloadLocalSession]);

  const handleCredential = useCallback(
    async (credential: string) => {
      if (onSignInCredential) {
        await onSignInCredential(credential);
        return;
      }

      patchStatus({ syncState: 'syncing', error: '' });
      const sessionVersion = ++sessionVersionRef.current;
      try {
        const previousOwner = readAccountOwnerFromStorage();
        const p = profileRef.current;
        // A previous account's profile must never become a new account's login hints.
        const result = await signInWithGoogleToken(credential, previousOwner ? {} : {
          classId: p.cls,
          firstName: p.fn,
          lastName: p.ln,
          schoolName: p.sc,
        });
        if (sessionVersion !== sessionVersionRef.current) return;
        if (previousOwner && result.authenticated && result.user.accountId !== previousOwner) reloadLocalSession();

        patchStatus({
          authenticated: result.authenticated,
          user: result.user,
          providers: result.providers ?? statusRef.current.providers,
          syncState: result.authenticated ? 'syncing' : 'idle',
          error: '',
        });

        if (!result.authenticated) return;

        if (result.cloudState) {
          applyRemoteEnvelope(result.cloudState);
        }

        const localEnvelope = createCloudEnvelope(profileRef.current, stateRef.current);
        const pushed = await pushCloudEnvelope(localEnvelope);
        if (sessionVersion !== sessionVersionRef.current) return;
        if (pushed.envelope) applyRemoteEnvelope(pushed.envelope);

        patchStatus({
          syncState: pushed.syncState,
          ...(pushed.ok ? { lastSyncedAt: Date.now() } : {}),
          error: pushed.error || '',
        });
        showToast('Compte Google connecté');
      } catch (err) {
        if (sessionVersion !== sessionVersionRef.current) return;
        patchStatus({
          syncState: 'error',
          error: err instanceof Error ? err.message : 'auth_error',
        });
      }
    },
    [applyRemoteEnvelope, onSignInCredential, patchStatus, showToast, reloadLocalSession],
  );

  // Render Google Identity Services Sign-In button into #mf-gis-btn
  const canRenderGis =
    status.isHttp
    && !status.authenticated
    && Boolean(status.providers?.googleEnabled && status.providers?.googleClientId);
  const googleClientId = status.providers?.googleClientId || '';

  useEffect(() => {
    if (!canRenderGis || !googleClientId) return;
    let active = true;

    void loadGoogleIdentityScript().then((ok) => {
      const slot = gisSlotRef.current;
      const gsi = window.google?.accounts?.id;
      if (!active || !ok || !slot || !gsi) return;

      slot.innerHTML = '';
      gsi.initialize({
        client_id: googleClientId,
        callback: (resp) => {
          if (resp?.credential) {
            void handleCredential(resp.credential);
          }
        },
      });
      gsi.renderButton(slot, {
        theme: 'outline',
        size: 'medium',
        text: 'signin_with',
        shape: 'pill',
      });
    });

    return () => {
      active = false;
    };
  }, [canRenderGis, googleClientId, handleCredential]);

  const handleSyncClick = async () => {
    if (onSync) {
      await onSync();
      return;
    }

    patchStatus({ syncState: 'syncing', error: '' });
    const sessionVersion = sessionVersionRef.current;
    const flushed = await flushCloudOutbox();
    if (sessionVersion !== sessionVersionRef.current) return;
    if (flushed.envelope) applyRemoteEnvelope(flushed.envelope);

    const envelope = createCloudEnvelope(profileRef.current, stateRef.current);
    const pushed = await pushCloudEnvelope(envelope);
    if (sessionVersion !== sessionVersionRef.current) return;
    if (pushed.envelope) applyRemoteEnvelope(pushed.envelope);

    patchStatus({
      syncState: pushed.syncState,
      ...(pushed.ok ? { lastSyncedAt: Date.now() } : {}),
      error: pushed.error || '',
    });

    if (pushed.ok) {
      showToast('Progression synchronisée');
    } else if (pushed.queued && pushed.syncState === 'pending') {
      showToast('Hors-ligne : progression en file d’attente');
    }
  };

  const handleLogoutClick = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }

    const result = await logoutCloudSession();
    if (!result.ok) {
      patchStatus({ syncState: 'error', error: 'Déconnexion impossible. Réessayez avec une connexion réseau.' });
      return;
    }
    sessionVersionRef.current += 1;
    reloadLocalSession();
    patchStatus({
      authenticated: false,
      user: null,
      syncState: 'idle',
      error: '',
    });
    showToast('Session cloud fermée');
  };

  const storageLabel = getStorageLabel(status.isHttp, status.providers);
  const isBusy = status.syncState === 'syncing';

  if (!status.isHttp) {
    return (
      <section className="mf-cloud-box" aria-label="Synchronisation Cloud">
        <div className="mf-cloud-head">
          <span className="mf-cloud-title">
            <span className="mf-sync-dot" data-state="offline" aria-hidden="true" />
            Sauvegarde autonome locale
          </span>
          <span className="mf-cloud-pill">{storageLabel}</span>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Mode hors-ligne local actif sur cet appareil.
        </p>
      </section>
    );
  }

  const headerTitle = status.authenticated
    ? SYNC_STATE_LABELS[status.syncState]
    : status.syncState === 'offline'
      ? SYNC_STATE_LABELS.offline
      : 'Synchronisation Cloud';

  return (
    <section className="mf-cloud-box" aria-label="Synchronisation Cloud">
      <div className="mf-cloud-head">
        <span className="mf-cloud-title">
          <span className="mf-sync-dot" data-state={status.syncState} aria-hidden="true" />
          {headerTitle}
        </span>
        <span className="mf-cloud-pill">{storageLabel}</span>
      </div>

      {status.authenticated && status.user ? (
        <>
          <div className="mf-cloud-user">
            {status.user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="mf-cloud-avatar"
                src={status.user.picture}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="mf-cloud-meta">
              <strong>{status.user.name || 'Élève'}</strong>
              <span>{status.user.email || 'Compte synchronisé'}</span>
            </div>
          </div>

          <div className="mf-cloud-actions">
            <button
              type="button"
              className="mf-cloud-link"
              onClick={handleSyncClick}
              disabled={isBusy}
            >
              Synchroniser
            </button>
            <button
              type="button"
              className="mf-cloud-link"
              onClick={handleLogoutClick}
              disabled={isBusy}
            >
              Déconnexion
            </button>
            <a className="mf-cloud-link" href={portalHref}>
              Portail MathPlus &rarr;
            </a>
          </div>
        </>
      ) : (
        <>
          {canRenderGis ? (
            <div id="mf-gis-btn" ref={gisSlotRef} />
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              Progression locale active. Connectez Google sur MathPlus ou configurez GOOGLE_CLIENT_ID.
            </p>
          )}
          <div className="mf-cloud-actions">
            <a className="mf-cloud-link" href={portalHref}>
              Ouvrir le Portail MathPlus &rarr;
            </a>
          </div>
        </>
      )}

      {status.error ? (
        <p className="hint" role="status" style={{ margin: 0, fontSize: 12 }}>
          {status.error}
        </p>
      ) : null}
    </section>
  );
}
