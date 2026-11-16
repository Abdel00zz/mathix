import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * `React.lazy` tolérant aux déploiements.
 *
 * Vite nomme chaque chunk avec une empreinte de contenu (`RevisionView-CiwfOH06.js`).
 * Quand une nouvelle version est déployée, les fichiers de l'ancienne build ne
 * sont plus servis : une page restée ouverte — cas courant d'une tablette
 * professeur — qui demande un chunk encore jamais chargé reçoit un **404** et
 * React lève :
 *
 *     TypeError: Failed to fetch dynamically imported module: …/ProfConsoleApp-*.js
 *
 * Aucun écran ne s'affiche, et l'utilisateur ne peut que recharger à la main.
 * Ici, l'échec est intercepté :
 *
 *  1. seconde tentative immédiate (coup de réseau transitoire) ;
 *  2. sinon **un seul** rechargement complet, gardé par un horodatage en
 *     `sessionStorage` — si le problème persiste après rechargement (vrai 404,
 *     plus rien à récupérer), on laisse l'erreur remonter au lieu de boucler.
 */

const RELOAD_MARKER = 'mathplus:chunk-reload-at';

/** Fenêtre pendant laquelle un second échec n'entraîne PAS de rechargement. */
const RELOAD_WINDOW_MS = 30_000;

const reloadOnce = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_MARKER) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    // `sessionStorage` indisponible (navigation privée stricte) : on n'essaie
    // pas de recharger, faute de pouvoir se protéger d'une boucle.
    return false;
  }
};

/** Exposé pour le test : politique « un seul rechargement par fenêtre ». */
export const reloadAfterChunkFailure = reloadOnce;

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch {
      try {
        return await factory();
      } catch (error) {
        reloadOnce();
        throw error;
      }
    }
  });
}
