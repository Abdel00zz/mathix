/**
 * Modèles de notification prédéfinis pour l'envoi aux élèves.
 *
 * Source unique partagée entre :
 * - l'onglet Séance (`ProfSessionPanel`, envoi rapide) ;
 * - les paramètres PC (`ProfSettingsModal`, personnalisation persistante).
 *
 * Les modèles sont personnalisables par le professeur et sauvegardés par
 * compte (`profPage.notifyTemplates`) ; ce tableau n'est que le point de départ.
 */

export interface NotifyTemplate {
  key: string;
  title: string;
  body: string;
}

export const DEFAULT_NOTIFY_TEMPLATES: NotifyTemplate[] = [
  { key: 'rappel', title: '📝 Rappel exercices', body: "N'oubliez pas de terminer les exercices du chapitre avant la prochaine séance." },
  { key: 'report', title: '📅 Séance reportée', body: 'La séance est reportée. Consultez le nouveau créneau annoncé.' },
  { key: 'correction', title: '✅ Correction disponible', body: 'La correction du chapitre est disponible. Révisez vos erreurs.' },
  { key: 'quiz', title: '⚠️ Quiz à préparer', body: 'Un quiz arrive bientôt. Révisez le cours pour être prêt.' },
  { key: 'encouragement', title: '💪 Encouragement', body: 'Bon courage pour vos révisions, vous êtes sur la bonne voie !' },
  { key: 'bravo', title: '🎉 Félicitations', body: 'Excellent travail sur le dernier chapitre, continuez !' },
];

/** Résout les modèles du prof, avec repli sur les modèles par défaut. */
export function resolveNotifyTemplates(custom?: NotifyTemplate[]): NotifyTemplate[] {
  if (!custom || custom.length === 0) return DEFAULT_NOTIFY_TEMPLATES;
  return custom.filter(t => t && typeof t.title === 'string' && typeof t.body === 'string');
}
