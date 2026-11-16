import type { AppView, UserProfile } from '../types';

/** Vues acceptées dans le hash d'entrée (`#dashboard`, `#studio`, …). */
export const KNOWN_VIEWS: AppView[] = [
  'login', 'dashboard', 'session', 'quiz', 'revision',
  'concours-quiz',
  'examen-session', 'ds-session', 'probleme-view', 'cadre-referentiel', 'studio', 'admin'
];

export const isKnownAppView = (candidate: string): candidate is AppView => (
  KNOWN_VIEWS.includes(candidate as AppView)
);

/**
 * Point unique de résolution d'une vue demandée — hash d'entrée, navigation
 * programmée ou bouton Retour natif — vers la vue réellement affichable.
 *
 * - `admin` a son propre domaine d'authentification (secret admin en
 *   sessionStorage, pas le cookie de compte) : sa garde vit dans AdminConsole,
 *   d'où l'absence de contrôle de compte ici.
 * - sans compte vérifié, toute autre vue retombe sur l'écran d'accueil.
 * - `studio` n'est qu'un alias d'entrée du raccourci `/prof` (vercel.json) :
 *   la surface professeur réelle — console PC ou dashboard tablette — est
 *   arbitrée par la vue `dashboard`, seul endroit qui connaît la préférence
 *   tablette ↔ PC. Un élève qui suit ce lien atterrit donc sur son dashboard
 *   au lieu d'un écran vide.
 */
export const resolveViewForUser = (candidate: AppView, user: UserProfile | null): AppView => {
  if (candidate === 'admin') return 'admin';
  if (!user) return 'login';
  if (user.requestedRole === 'prof' && user.role !== 'prof') return 'dashboard';
  if (candidate === 'login' || candidate === 'studio') return 'dashboard';
  return candidate;
};
