/**
 * Notifications système locales — MathPlus
 *
 * Complète `pushService` (push serveur) par la voie *locale* : l'app affiche
 * elle-même une notification dans la barre du téléphone, sans backend.
 *
 * Ce service affiche uniquement une notification déclenchée par une action
 * explicite. Il ne contient aucun minuteur ni file d'alertes automatiques.
 */

const getIcon = () => document.documentElement.lang === 'ar' ? '/icone-ar.png' : '/icone.png';

class LocalNotificationService {

  // ---------- CAPACITÉS ----------

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  permission(): NotificationPermission {
    return this.isSupported() ? Notification.permission : 'denied';
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'denied';
    }
  }

  // ---------- AFFICHAGE ----------

  /**
   * Affiche une notification système. Passe par le service worker quand il est
   * disponible : c'est la seule voie qui alimente la barre de notifications
   * d'Android, `new Notification()` restant cantonné au bureau.
   */
  async show(title: string, body: string, opts: { tag?: string; silent?: boolean } = {}): Promise<boolean> {
    if (!this.isSupported() || this.permission() !== 'granted') return false;
    const icon = getIcon();
    const payload: NotificationOptions = {
      body,
      icon,
      badge: icon,
      tag: opts.tag,
      silent: opts.silent,
      // Sur Android la notification survit à la fermeture de l'onglet.
      requireInteraction: false,
    };
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, payload);
        return true;
      }
      new Notification(title, payload);
      return true;
    } catch {
      return false;
    }
  }

}

export const localNotificationService = new LocalNotificationService();
