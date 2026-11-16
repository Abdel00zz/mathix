import { AppSettings, NotificationPrefs } from '../types';
import { DEFAULT_NOTIFICATION_PREFS } from './constants';

/**
 * Complète les préférences enregistrées avec les valeurs par défaut.
 *
 * Une sauvegarde exportée avant l'arrivée d'une catégorie ne doit pas la
 * laisser `undefined` : la fusion se fait champ par champ, catégories et plage
 * silencieuse incluses.
 */
export function resolveNotificationPrefs(settings?: AppSettings | null): NotificationPrefs {
  const base = DEFAULT_NOTIFICATION_PREFS as unknown as NotificationPrefs;
  const stored = settings?.notificationPrefs;
  if (!stored) {
    return { ...base, categories: { ...base.categories }, quietHours: { ...base.quietHours } };
  }
  return {
    ...base,
    ...stored,
    categories: { ...base.categories, ...(stored.categories || {}) },
    quietHours: { ...base.quietHours, ...(stored.quietHours || {}) },
  };
}
