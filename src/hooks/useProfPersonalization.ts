import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFS,
  loadProfPersonalization,
  PROF_PREFS_CHANGED_EVENT,
  type ProfPersonalization,
} from '../components/ProfStudio/settings/personalization';

/**
 * Préférences de personnalisation du professeur, lues de façon réactive.
 *
 * Un unique abonnement module partagé par tous les consommateurs : une fiche de
 * révision peut monter des dizaines d'images, chacune testant `canvas.enabled`
 * — autant de listeners `storage` seraient inutiles. `useSyncExternalStore`
 * garantit ici un instantané stable (pas de boucle de rendu) et une mise à jour
 * immédiate dès qu'un réglage change, y compris depuis la modale des paramètres
 * tablette ouverte dans le même onglet.
 */
let snapshot: ProfPersonalization = DEFAULT_PREFS;
let hasLoaded = false;
const listeners = new Set<() => void>();
let listening = false;

function readSnapshot(): ProfPersonalization {
  hasLoaded = true;
  snapshot = loadProfPersonalization();
  return snapshot;
}

function notify(): void {
  readSnapshot();
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('storage', notify);
    window.addEventListener(PROF_PREFS_CHANGED_EVENT, notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listening) {
      listening = false;
      window.removeEventListener('storage', notify);
      window.removeEventListener(PROF_PREFS_CHANGED_EVENT, notify);
    }
  };
}

function getSnapshot(): ProfPersonalization {
  // Le premier abonné lit le stockage réel ; les suivants réutilisent
  // l'instantané déjà calculé, stable par identité.
  return hasLoaded ? snapshot : readSnapshot();
}

function getServerSnapshot(): ProfPersonalization {
  return DEFAULT_PREFS;
}

export function useProfPersonalization(): ProfPersonalization {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
