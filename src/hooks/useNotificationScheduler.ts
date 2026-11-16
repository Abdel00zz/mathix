import { useEffect } from 'react';
import { AppSettings } from '../types';
import { pushService } from '../services/pushService';
import { resolveNotificationPrefs } from '../utils/notificationPrefs';

/**
 * Synchronise les préférences de notification avec l'abonnement push.
 * Les alarmes et tâches automatiques de planning n'existent plus.
 */
export function useNotificationPreferencesSync(settings?: AppSettings): void {
  const prefsJson = JSON.stringify(settings?.notificationPrefs ?? null);
  useEffect(() => {
    const prefs = resolveNotificationPrefs(settings);

    // Nettoie une dernière fois la file locale des anciennes alertes de
    // planning, désormais supprimées du produit.
    try { localStorage.removeItem('mathplus:local-notif:due:v1'); } catch { /* stockage indisponible */ }

    // Les préférences valent aussi pour les envois du serveur : sans cette
    // remontée, « ne pas déranger » ne s'appliquerait qu'aux rappels locaux.
    void pushService.syncPrefs(prefs);

    return undefined;
    // `settings` change à chaque rendu ; seules ces deux branches comptent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsJson]);
}
