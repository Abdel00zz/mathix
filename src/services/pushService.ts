/**
 * Push Notification Service — MathPlus
 *
 * Gere l'abonnement aux notifications push via Web Push API.
 * - Demande de permission intelligente (pas au premier chargement)
 * - Stockage de la subscription sur Vercel KV via API
 * - Desabonnement propre
 */

import { AppSettings, NotificationPrefs } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Même clé que `useAppSettings` : les préférences vivent dans les réglages. */
const SETTINGS_KEY = 'mathplus_settings';
const PUSH_SUB_KEY = 'mathplus:push-subscription';
const PUSH_ASKED_KEY = 'mathplus:push-asked';
const PUSH_DENIED_KEY = 'mathplus:push-denied';

// Cle publique VAPID — generer avec: npx web-push generate-vapid-keys
// Stocker la cle privee dans les env vars Vercel (VAPID_PRIVATE_KEY)
const VAPID_PUBLIC_KEY = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY || '';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Relit les préférences depuis les réglages persistés. Le service push est
 * appelé depuis des contextes sans React (auto-abonnement, réparation au
 * démarrage) : il ne peut pas recevoir les préférences en paramètre partout.
 */
function readStoredPrefs(): NotificationPrefs | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as AppSettings)?.notificationPrefs || null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

// ============================================================================
// SERVICE
// ============================================================================

class PushService {
  private subscription: PushSubscription | null = null;

  /** Verifie si le navigateur supporte les push */
  isSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /** Verifie si l'utilisateur a deja donne la permission */
  getPermissionState(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /** Verifie si deja abonne */
  isSubscribed(): boolean {
    return !!localStorage.getItem(PUSH_SUB_KEY);
  }

  /** Verifie si on a deja demande */
  wasAsked(): boolean {
    return !!localStorage.getItem(PUSH_ASKED_KEY);
  }

  /** Verifie si refuse */
  wasDenied(): boolean {
    return !!localStorage.getItem(PUSH_DENIED_KEY);
  }

  /**
   * Demande la permission et abonne l'utilisateur.
   * Retourne true si l'abonnement a reussi.
   */
  async subscribe(studentName?: string, classId?: string, prefs?: NotificationPrefs, accountId?: string): Promise<boolean> {
    if (!this.isSupported() || !VAPID_PUBLIC_KEY) {
      console.warn('[PushService] Not supported or no VAPID key');
      return false;
    }

    localStorage.setItem(PUSH_ASKED_KEY, '1');

    // Demander la permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      localStorage.setItem(PUSH_DENIED_KEY, '1');
      console.info('[PushService] Permission denied');
      return false;
    }

    localStorage.removeItem(PUSH_DENIED_KEY);

    try {
      const registration = await navigator.serviceWorker.ready;

      // Verifier si deja abonne
      let sub = await registration.pushManager.getSubscription();

      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      this.subscription = sub;

      // Sauvegarder localement
      localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(sub.toJSON()));

      // Envoyer au backend
      await this.syncSubscription(studentName, classId, prefs, accountId);

      console.info('[PushService] Subscribed successfully');
      return true;
    } catch (error) {
      console.error('[PushService] Subscribe failed:', error);
      return false;
    }
  }

  /**
   * Desabonne l'utilisateur
   */
  async unsubscribe(): Promise<boolean> {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();

      if (sub) {
        await sub.unsubscribe();

        // Supprimer du backend
        await fetch('/api/push?action=unsubscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }

      this.subscription = null;
      localStorage.removeItem(PUSH_SUB_KEY);
      console.info('[PushService] Unsubscribed');
      return true;
    } catch (error) {
      console.error('[PushService] Unsubscribe failed:', error);
      return false;
    }
  }

  /**
   * Synchronise la subscription avec le backend Vercel
   */
  private async syncSubscription(studentName?: string, classId?: string, prefs?: NotificationPrefs, accountId?: string): Promise<void> {
    if (!this.subscription) return;

    /*
     * Les préférences voyagent avec l'abonnement afin que les messages
     * manuels respectent les catégories et la plage silencieuse choisies.
     */
    const resolved = prefs || readStoredPrefs();

    try {
      await fetch('/api/push?action=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: this.subscription.toJSON(),
          studentName: studentName || localStorage.getItem('mathplus:student-name') || 'Anonyme',
          classId: classId || localStorage.getItem('mathplus:class-id') || '',
          accountId: accountId || '',
          subscribedAt: Date.now(),
          prefs: resolved
            ? {
                quietHours: resolved.quietHours,
                categories: resolved.categories,
                enabled: resolved.enabled,
              }
            : undefined,
        }),
      });
    } catch (error) {
      console.error('[PushService] Sync failed:', error);
    }
  }

  /** Pousse les préférences courantes vers le backend sans réabonner. */
  async syncPrefs(prefs: NotificationPrefs): Promise<void> {
    if (!this.isSupported() || this.getPermissionState() !== 'granted') return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) return;
      this.subscription = sub;
      await this.syncSubscription(undefined, undefined, prefs);
    } catch (error) {
      console.error('[PushService] syncPrefs failed:', error);
    }
  }

  /**
   * Re-synchronise l'abonnement existant avec le nom/classe courants.
   * À appeler quand l'élève se connecte ou change de classe, pour que les
   * notifications ciblées par classe atteignent le bon groupe.
   */
  async syncClass(studentName?: string, classId?: string, accountId?: string): Promise<void> {
    if (!this.isSupported() || this.getPermissionState() !== 'granted') return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) return; // pas encore abonné : rien à re-synchroniser
      this.subscription = sub;
      localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(sub.toJSON()));
      await this.syncSubscription(studentName, classId, undefined, accountId);
    } catch (error) {
      console.error('[PushService] syncClass failed:', error);
    }
  }

  /**
   * Auto-réparation de l'abonnement push. À appeler à chaque ouverture de
   * session (login, retour online) :
   * - si la subscription a expiré/été perdue alors que l'élève avait activé
   *   les notifications, on se réabonne silencieusement (Android recycle les
   *   subscriptions de façon opaque) ;
   * - sinon on re-synchronise simplement nom/classe avec le backend.
   */
  async ensureHealthy(studentName?: string, classId?: string, accountId?: string): Promise<void> {
    if (!this.isSupported() || this.getPermissionState() !== 'granted') return;
    try {
      const registration = await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();

      if (!sub && this.isSubscribed() && VAPID_PUBLIC_KEY) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.info('[PushService] Subscription auto-repaired');
      }

      if (!sub) return;
      this.subscription = sub;
      localStorage.setItem(PUSH_SUB_KEY, JSON.stringify(sub.toJSON()));
      await this.syncSubscription(studentName, classId, undefined, accountId);
    } catch (error) {
      console.error('[PushService] ensureHealthy failed:', error);
    }
  }

  /**
   * Envoie une notification de test locale (pour debug)
   */
  async sendTestNotification(): Promise<void> {
    if (Notification.permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const isArabic = document.documentElement.lang === 'ar';
    const icon = isArabic ? '/icone-ar.png' : '/icone.png';
    await registration.showNotification(isArabic ? 'تعلّم+ — اختبار' : 'monProf — Test', {
      body: isArabic ? 'تعمل الإشعارات بشكل سليم.' : 'Les notifications fonctionnent correctement !',
      icon,
      badge: icon,
      tag: 'test',
    });
  }
}

export const pushService = new PushService();
