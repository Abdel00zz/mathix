/**
 * Hook de Gestion des Mises a Jour
 *
 * Combine:
 * - Service Worker updates (swService)
 * - Content manifest updates (updateService)
 * - Notification system integration
 *
 * Resout le probleme des multiples F5 apres un deploiement.
 */

import { useEffect, useState, useCallback } from 'react';
import { updateService } from '../services/updateService';
import { swService } from '../services/swService';
import { notificationService } from '../services/notificationService';

interface UseAutoUpdateResult {
  hasUpdate: boolean;
  applyUpdate: () => void;
  checkNow: () => Promise<void>;
}

export const useAutoUpdate = (): UseAutoUpdateResult => {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    // Initialiser le service SW
    swService.init().catch(console.error);

    // Demarrer la surveillance du manifest content
    updateService.start();

    // S'abonner aux mises a jour SW
    const unsubSW = swService.onUpdate((info) => {
      setHasUpdate(true);
      notificationService.notifyUpdate(info.version || 'nouvelle', 'app');
    });

    // Verifier l'etat initial
    setTimeout(() => setHasUpdate(swService.hasUpdate() || updateService.isUpdatePending), 0);

    return () => {
      updateService.stop();
      unsubSW();
    };
  }, []);

  const applyUpdate = useCallback(() => {
    // Essayer d'abord via le SW service
    if (swService.hasUpdate()) {
      swService.applyUpdate();
    } else if (updateService.isUpdatePending) {
      // Sinon via updateService
      updateService.checkAndReloadIfPending();
    } else {
      // En dernier recours, forcer le rechargement
      swService.forceReload();
    }
  }, []);

  const checkNow = useCallback(async () => {
    const swUpdate = await swService.checkForUpdate();
    await updateService.checkForUpdates();
    setHasUpdate(swUpdate || swService.hasUpdate() || updateService.isUpdatePending);
  }, []);

  return { hasUpdate, applyUpdate, checkNow };
};
