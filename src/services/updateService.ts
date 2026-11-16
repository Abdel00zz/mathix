
import { STORAGE_KEYS, TIMING } from '../utils/constants';

/**
 * Service de Mise à Jour Silencieux et Intelligent
 * 
 * Stratégie : "Passive/Opportuniste"
 * 1. Détecte les mises à jour en arrière-plan.
 * 2. Prépare le terrain (vide les caches, met à jour le localStorage).
 * 3. Attend un moment opportun (changement de visibilité ou navigation) pour recharger.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface UpdateCheckResult {
  type: 'app' | 'manifest' | 'content';
  details?: string;
  newVersion?: string;
}

interface ContentVersion {
  manifestVersion: string;
  manifestHash: string;
  lastChecked: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const generateHash = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

const fetchWithCacheBust = async (url: string): Promise<Response> => {
  const cacheBuster = `_cb=${Date.now()}`;
  const separator = url.includes('?') ? '&' : '?';
  return fetch(`${url}${separator}${cacheBuster}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
};

// ============================================================================
// UPDATE SERVICE
// ============================================================================

class UpdateService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastKnownVersion: ContentVersion | null = null;
  private isChecking = false;
  private isEnabled = true;
  
  // État critique : une mise à jour est-elle prête à être appliquée ?
  private _isUpdatePending = false;

  constructor() {
    this.loadStoredVersion();
    this.setupSmartTriggers();
  }

  get isUpdatePending(): boolean {
    return this._isUpdatePending;
  }

  private loadStoredVersion(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONTENT_VERSION);
      if (stored) {
        this.lastKnownVersion = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[UpdateService] Failed to load stored version', e);
    }
  }

  private saveVersion(version: ContentVersion): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONTENT_VERSION, JSON.stringify(version));
      this.lastKnownVersion = version;
    } catch (e) {
      console.warn('[UpdateService] Failed to save version', e);
    }
  }

  /**
   * Configure les déclencheurs intelligents pour appliquer la mise à jour
   * au moment le moins intrusif possible.
   */
  private setupSmartTriggers(): void {
    if (typeof document === 'undefined') return;

    // 1. Trigger : Visibilité (L'utilisateur quitte l'onglet et revient)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Si une mise à jour est en attente, on recharge immédiatement au retour
        if (this._isUpdatePending) {
          console.info('[UpdateService] Applying pending update on visibility change');
          window.location.reload();
        } else if (this.isEnabled) {
          // Sinon, on en profite pour vérifier discrètement
          setTimeout(() => this.checkForUpdates(), TIMING.VISIBILITY_CHECK_DELAY);
        }
      }
    });

    // 2. Trigger : Reconnexion
    window.addEventListener('online', () => {
      if (this.isEnabled && !this._isUpdatePending) {
        this.checkForUpdates();
      }
    });
  }

  /**
   * Méthode appelée par le Router/App lors d'un changement de page majeur.
   * C'est le moment idéal pour appliquer une mise à jour en attente.
   */
  public checkAndReloadIfPending(): boolean {
    if (this._isUpdatePending) {
      console.info('[UpdateService] Applying pending update during navigation');
      window.location.reload();
      return true;
    }
    return false;
  }

  start(intervalMs: number = TIMING.UPDATE_CHECK_INTERVAL): void {
    if (this.intervalId) this.stop();
    this.isEnabled = true;
    this.checkForUpdates(); // Check immédiat au lancement
    this.intervalId = setInterval(() => this.checkForUpdates(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isEnabled = false;
  }

  /**
   * Vérification discrète des mises à jour.
   * Si une mise à jour est trouvée, elle prépare le terrain mais ne recharge PAS la page.
   */
  async checkForUpdates(): Promise<void> {
    if (this.isChecking || this._isUpdatePending) return;

    this.isChecking = true;

    try {
      const response = await fetchWithCacheBust('data/manifest.json');
      if (!response.ok) throw new Error('Manifest fetch failed');

      const text = await response.text();
      const data = JSON.parse(text);
      const newHash = generateHash(text);
      const newVersion = data.meta?.version || '1.0';

      // Initialisation
      if (!this.lastKnownVersion) {
        this.saveVersion({
          manifestVersion: newVersion,
          manifestHash: newHash,
          lastChecked: Date.now()
        });
        return;
      }

      // Comparaison
      const hasChange = 
        this.lastKnownVersion.manifestVersion !== newVersion || 
        this.lastKnownVersion.manifestHash !== newHash;

      if (hasChange) {
        console.info('[UpdateService] New content detected. Preparing update...');
        
        // 1. Sauvegarder la nouvelle version (évite la boucle si le reload échoue)
        this.saveVersion({
          manifestVersion: newVersion,
          manifestHash: newHash,
          lastChecked: Date.now()
        });

        // 2. Nettoyer les caches dynamiques (pour forcer le re-téléchargement au prochain chargement)
        if ('caches' in window) {
          const keys = await caches.keys();
          // On supprime les caches de données, on garde les polices/images pour éviter le flash
          const dataCaches = keys.filter(k => k.includes('data-cache') || k.includes('runtime'));
          await Promise.all(dataCaches.map(k => caches.delete(k)));
        }

        // 3. Marquer comme en attente
        this._isUpdatePending = true;

        // 4. Opportunisme : Si la page est cachée, on reload tout de suite
        if (document.visibilityState === 'hidden') {
            window.location.reload();
        }
      }

    } catch {
      // Silencieux en cas d'erreur réseau
    } finally {
      this.isChecking = false;
    }
  }
}

export const updateService = new UpdateService();
