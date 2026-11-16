/**
 * Service Worker Manager
 *
 * Gere le cycle de vie du Service Worker et les mises a jour de l'application.
 * Resout le probleme des multiples F5 necessaires apres un deploiement.
 *
 * Strategie :
 * 1. Detecter quand un nouveau SW est disponible
 * 2. Notifier l'utilisateur via le systeme de notification
 * 3. Recharger automatiquement lors des navigations ou au retour sur l'onglet
 * 4. Forcer le rechargement si necessaire
 */

import { notificationService } from './notificationService';

// ============================================================================
// TYPES
// ============================================================================

interface SWUpdateInfo {
  type: 'app' | 'content';
  timestamp: number;
  version?: string;
  isWaiting: boolean;
}

type UpdateCallback = (info: SWUpdateInfo) => void;

// ============================================================================
// CONSTANTS
// ============================================================================

const SW_UPDATE_KEY = 'mathplus:sw-update-pending';
const CHECK_INTERVAL = 60 * 1000; // 1 minute

// ============================================================================
// SERVICE
// ============================================================================

class SWService {
  private registration: ServiceWorkerRegistration | null = null;
  private updateCallbacks: Set<UpdateCallback> = new Set();
  private isUpdatePending = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Verifier si une mise a jour etait en attente avant le rechargement
    this.checkPendingUpdate();
  }

  /**
   * Initialise le service et enregistre les listeners
   */
  async init(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SWService] Service Workers not supported');
      return;
    }

    try {
      // Recuperer l'enregistrement existant
      this.registration = await navigator.serviceWorker.ready;

      // Ecouter les mises a jour
      this.setupUpdateListeners();

      // Ecouter le changement de controleur (nouveau SW actif)
      //
      // `skipWaiting` + `clientsClaim` (vite.config.ts) font prendre la main au
      // nouveau SW SANS passer par l'état `waiting` : l'ancien garde-fou
      // `isUpdatePending` pouvait donc ne jamais se déclencher. Or c'est le
      // seul moment où l'on sait que le shell en cours d'exécution est périmé —
      // ses chunks hachés ne sont plus servis après le déploiement, d'où le
      // « Failed to fetch dynamically imported module » (404). On recharge donc
      // ici, une seule fois, dès qu'un contrôleur EXISTANT est remplacé.
      if (navigator.serviceWorker.controller) {
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          console.info('[SWService] Nouveau shell actif - rechargement');
          this.clearPendingUpdate();
          window.location.reload();
        });
      }

      // Verifier les mises a jour periodiquement
      this.startPeriodicCheck();

      // Verifier au retour sur l'onglet
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkForUpdate();
          // Si une mise a jour est en attente et l'utilisateur revient, recharger
          if (this.isUpdatePending) {
            this.applyUpdate();
          }
        }
      });

      // Verifier a la reconnexion
      window.addEventListener('online', () => {
        this.checkForUpdate();
      });

    } catch (error) {
      console.error('[SWService] Init failed:', error);
    }
  }

  /**
   * Configure les listeners de mise a jour
   */
  private setupUpdateListeners(): void {
    if (!this.registration) return;

    // Nouveau SW en attente
    if (this.registration.waiting) {
      this.onUpdateFound(this.registration.waiting);
    }

    // Ecouter les nouvelles installations
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration?.installing;
      if (!newWorker) return;

      console.info('[SWService] Update found - new worker installing');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nouveau SW installe, pret a prendre le controle
          console.info('[SWService] New worker installed and waiting');
          this.onUpdateFound(newWorker);
        }
      });
    });
  }

  /**
   * Appele quand une mise a jour est detectee
   */
  private onUpdateFound(_worker: ServiceWorker): void {
    this.isUpdatePending = true;
    this.setPendingUpdate();

    const info: SWUpdateInfo = {
      type: 'app',
      timestamp: Date.now(),
      isWaiting: true
    };

    // Notifier via le systeme de notification
    notificationService.notifyUpdate('nouvelle', 'app');

    // Notifier les callbacks
    this.updateCallbacks.forEach(cb => cb(info));

    console.info('[SWService] Update available - notified user');
  }

  /**
   * Verifie s'il y a une mise a jour
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      await this.registration.update();

      // Verifier si un worker est en attente
      if (this.registration.waiting) {
        this.onUpdateFound(this.registration.waiting);
        return true;
      }

      return false;
    } catch {
      // Silencieux - peut echouer si offline
      return false;
    }
  }

  /**
   * Applique la mise a jour en attente
   */
  applyUpdate(): void {
    if (!this.registration?.waiting) {
      // Pas de worker en attente, juste recharger
      this.clearPendingUpdate();
      window.location.reload();
      return;
    }

    // Envoyer le message skipWaiting au nouveau worker
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Le rechargement sera declenche par l'evenement controllerchange
    console.info('[SWService] Applying update - sent SKIP_WAITING');
  }

  /**
   * Verifie si une mise a jour est en attente
   */
  hasUpdate(): boolean {
    return this.isUpdatePending || !!this.registration?.waiting;
  }

  /**
   * Abonne aux notifications de mise a jour
   */
  onUpdate(callback: UpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Verifie au chargement si une mise a jour etait en attente
   */
  private checkPendingUpdate(): void {
    try {
      const pending = localStorage.getItem(SW_UPDATE_KEY);
      if (pending) {
        const data = JSON.parse(pending);
        // Si l'update est vieille de moins de 5 minutes, on considere qu'elle est appliquee
        if (Date.now() - data.timestamp < 5 * 60 * 1000) {
          // La mise a jour a ete appliquee
          this.clearPendingUpdate();
          notificationService.create('system', 'Application Mise a Jour',
            'La nouvelle version est maintenant active.', {
            priority: 'low'
          });
        }
      }
    } catch {
      localStorage.removeItem(SW_UPDATE_KEY);
    }
  }

  private setPendingUpdate(): void {
    try {
      localStorage.setItem(SW_UPDATE_KEY, JSON.stringify({
        timestamp: Date.now()
      }));
    } catch {
      // Ignore
    }
  }

  private clearPendingUpdate(): void {
    this.isUpdatePending = false;
    localStorage.removeItem(SW_UPDATE_KEY);
  }

  /**
   * Demarre la verification periodique
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkForUpdate();
    }, CHECK_INTERVAL);
  }

  /**
   * Arrete la verification periodique
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Force le rechargement sans cache
   */
  forceReload(): void {
    this.hardReset();
  }

  /**
   * RADICAL RESET: Destruction totale des caches, workers et stockages
   * Utile quand l'application est "bloquée" sur une ancienne version
   */
  async hardReset(): Promise<void> {
    console.warn('[SWService] Initiating NUCLEAR RESET...');
    try {
      // 1. Désenregistrer tous les Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // 2. Vider le Cache Storage (Fichiers, JSON, etc.)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      // 3. Vider le LocalStorage et SessionStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // 4. Rechargement forcé avec un paramètre anti-cache
      window.location.href = window.location.pathname + '?reset=' + Date.now();
    } catch (e) {
      console.error('[SWService] Hard reset failed', e);
      window.location.reload();
    }
  }

  /**
   * Verifie si le SW est actif
   */
  isActive(): boolean {
    return !!navigator.serviceWorker?.controller;
  }

  /**
   * Obtient les informations du SW actuel
   */
  getInfo(): {
    isActive: boolean;
    hasUpdate: boolean;
    registration: ServiceWorkerRegistration | null;
  } {
    return {
      isActive: this.isActive(),
      hasUpdate: this.hasUpdate(),
      registration: this.registration
    };
  }
}

// Export singleton
export const swService = new SWService();
