import { NotificationPrefs } from '../types';
import { localNotificationService } from '../services/localNotificationService';
import { pushService } from '../services/pushService';

/**
 * Active les notifications sur cet appareil, dans l'ordre qui compte :
 *
 *  1. autorisation du navigateur (obligatoire, et seulement sur geste élève) ;
 *  2. abonnement push auprès du backend — **c'est cette étape qui rend l'élève
 *     joignable depuis la page admin. L'oublier donne une app qui
 *     s'auto-notifie très bien et que le professeur ne peut plus atteindre.
 *
 * L'étape 2 est « best effort » : sans clé VAPID (développement local) elle
 * échoue sans empêcher les rappels locaux de fonctionner.
 */
export async function enableDeviceNotifications(
  studentName?: string,
  classId?: string,
  prefs?: NotificationPrefs,
  accountId?: string
): Promise<NotificationPermission> {
  const permission = await localNotificationService.requestPermission();
  if (permission !== 'granted') return permission;

  void pushService.subscribe(studentName, classId, prefs, accountId);
  return permission;
}
