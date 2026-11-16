import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONTENT_OVERRIDES_UPDATED_EVENT, refreshContentOverrides, startContentOverrideSync } from '../services/contentOverrides';
import { startProfSyncWatch } from '../services/profSyncService';
import { AsyncThreadCoordinator } from '../utils/appWorkflow';
import type { SharedImage } from '../services/professorClassroomService';

interface UseAppBackgroundSyncParams {
  accountSessionReady: boolean;
  userName?: string;
  userClassId?: string;
  userAccountId?: string;
  isProfessor: boolean;
  isPendingProfessor: boolean;
}

/**
 * Synchronise le manifeste racine, les overrides publiés, les notifications push,
 * la veille professeur et les deep-links `?shared=<id>`.
 */
export function useAppBackgroundSync({
  accountSessionReady,
  userName,
  userClassId,
  userAccountId,
  isProfessor,
  isPendingProfessor,
}: UseAppBackgroundSyncParams) {
  const [appManifest, setAppManifest] = useState<any>(null);
  const [contentRevision, setContentRevision] = useState(0);
  const [sharedViewerImage, setSharedViewerImage] = useState<SharedImage | null>(null);
  const threadCoordinator = useMemo(() => new AsyncThreadCoordinator(), []);

  useEffect(() => () => {
    threadCoordinator.cancelAll();
  }, [threadCoordinator]);

  useEffect(() => {
    let active = true;
    void threadCoordinator.run(
      'manifest_refresh',
      async ({ isCurrent }) => {
        const { contentService } = await import('../services/contentService');
        if (!active || !isCurrent()) return;
        const manifest = await contentService.fetchRootManifest();
        if (!active || !isCurrent()) return;
        setAppManifest(manifest);
      },
      { mode: 'supersede' },
    ).catch(() => {});
    return () => {
      active = false;
    };
  }, [threadCoordinator]);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    import('../services/pushInboxBridge')
      .then(({ startPushInboxBridge }) => {
        const cleanup = startPushInboxBridge();
        if (!active) {
          cleanup();
        } else {
          stop = cleanup;
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      stop?.();
    };
  }, []);

  const refreshPublishedContent = useCallback((changedPaths?: string[]) => {
    const relevantPaths = changedPaths?.filter(path => (
      path === 'data/manifest.json'
      || path === `data/classes/${userClassId}.json`
      || path.startsWith(`data/${userClassId}/`)
    ));
    if (changedPaths && relevantPaths?.length === 0) return;

    void threadCoordinator.run(
      'manifest_refresh',
      async ({ isCurrent }) => {
        const [{ contentService }, { chapterStatsService }] = await Promise.all([
          import('../services/contentService'),
          import('../services/chapterStatsService'),
        ]);
        if (!isCurrent()) return;

        if (relevantPaths?.length) {
          contentService.invalidatePaths(relevantPaths);
          chapterStatsService.clearCache(userClassId);
        } else {
          contentService.clearCache();
          chapterStatsService.clearCache();
        }

        if (!changedPaths || relevantPaths?.includes('data/manifest.json')) {
          const manifest = await contentService.fetchRootManifest();
          if (!isCurrent()) return;
          setAppManifest(manifest);
        }
        setContentRevision(revision => revision + 1);
      },
      { mode: 'supersede' },
    ).catch(() => {});
  }, [threadCoordinator, userClassId]);

  useEffect(() => {
    if (!accountSessionReady || !userClassId) return;
    let active = true;
    const handleContentUpdated = (event: Event) => {
      const changedPaths = (event as CustomEvent<{ changedPaths?: string[] }>).detail?.changedPaths;
      refreshPublishedContent(changedPaths);
    };
    void refreshContentOverrides()
      .then(() => {
        if (active) refreshPublishedContent();
      })
      .catch(() => {});
    const stop = startContentOverrideSync(isProfessor ? 10_000 : 60_000);
    window.addEventListener(CONTENT_OVERRIDES_UPDATED_EVENT, handleContentUpdated);
    return () => {
      active = false;
      stop();
      threadCoordinator.cancel('manifest_refresh');
      window.removeEventListener(CONTENT_OVERRIDES_UPDATED_EVENT, handleContentUpdated);
    };
  }, [accountSessionReady, userClassId, isProfessor, refreshPublishedContent, threadCoordinator]);

  useEffect(() => {
    if (!accountSessionReady || !userAccountId || !isProfessor) return;
    return startProfSyncWatch();
  }, [accountSessionReady, userAccountId, isProfessor]);

  useEffect(() => {
    if (!accountSessionReady || !userName || isPendingProfessor) return;
    let active = true;
    const repair = () => {
      import('../services/pushService').then(({ pushService }) => {
        if (!active) return;
        pushService.ensureHealthy(userName, userClassId, userAccountId);
      }).catch(() => {});
    };
    repair();
    window.addEventListener('online', repair);
    return () => {
      active = false;
      window.removeEventListener('online', repair);
    };
  }, [accountSessionReady, userName, userClassId, userAccountId, isPendingProfessor]);

  useEffect(() => {
    if (!accountSessionReady) return;
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('shared');
    if (!sharedId) return;

    const url = new URL(window.location.href);
    url.searchParams.delete('shared');
    window.history.replaceState({}, '', url);

    let active = true;
    void threadCoordinator.run(
      'shared_media_lookup',
      async ({ isCurrent }) => {
        const { professorClassroomService } = await import('../services/professorClassroomService');
        if (!active || !isCurrent()) return;
        const images = await professorClassroomService.listStudentSharedImages();
        if (!active || !isCurrent()) return;
        const found = images.find(img => img.id === sharedId);
        if (found) setSharedViewerImage(found);
      },
      { mode: 'supersede' },
    ).catch(() => { /* l'image reste accessible via la liste des partages */ });

    return () => {
      active = false;
      threadCoordinator.cancel('shared_media_lookup');
    };
  }, [accountSessionReady, threadCoordinator]);

  return {
    appManifest,
    contentRevision,
    refreshPublishedContent,
    sharedViewerImage,
    clearSharedViewerImage: useCallback(() => setSharedViewerImage(null), []),
  };
}
