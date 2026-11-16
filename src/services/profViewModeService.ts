/**
 * Bascule de surface du professeur (tablette ↔ PC).
 *
 * Par défaut (`auto`), l'application suit la détection matérielle
 * (`useIsDesktop`) : PC = console de gestion, tablette = interface
 * pédagogique. Le professeur peut forcer l'une ou l'autre — notamment pour
 * projeter la vue tablette depuis un PC relié à un vidéoprojecteur.
 *
 * La valeur est persistée en `localStorage` (appareil par appareil) et publiée
 * via un petit store externe lisible par `useSyncExternalStore`.
 */

export type ProfViewMode = 'auto' | 'tablet' | 'pc';

const STORAGE_KEY = 'mathplus:prof-view-mode';
export const TABLET_WINDOW_NAME = 'mathplus-prof-tablet';

type TabletLinkEvent = Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented' | 'preventDefault'>;

function getTabletUrl(): string {
  if (typeof window === 'undefined') return '/?profSurface=tablet#dashboard';
  const url = new URL(window.location.href);
  url.searchParams.set('profSurface', 'tablet');
  url.hash = 'dashboard';
  return url.toString();
}

function readInitialMode(): ProfViewMode {
  // Une fenêtre dédiée peut demander la surface tablette sans modifier la
  // préférence du PC qui l'a ouverte. Les deux fenêtres restent ainsi actives.
  try {
    const surface = new URLSearchParams(window.location.search).get('profSurface');
    if (surface === 'tablet') return 'tablet';
    if (surface === 'pc') return 'pc';
  } catch { /* rendu hors navigateur */ }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'tablet' || stored === 'pc') return stored;
  } catch { /* stockage restreint */ }
  return 'auto';
}

let mode: ProfViewMode = readInitialMode();
const listeners = new Set<() => void>();

function persist(next: ProfViewMode): void {
  try {
    if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch { /* stockage restreint */ }
}

export const profViewModeService = {
  getTabletUrl,

  /** Améliore un vrai lien : si le popup est refusé, conserver son ouverture native. */
  handleTabletLinkClick(event: TabletLinkEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (profViewModeService.openTabletWindow()) event.preventDefault();
  },

  getMode(): ProfViewMode {
    return mode;
  },

  setMode(next: ProfViewMode): void {
    if (mode === next) return;
    mode = next;
    const url = new URL(window.location.href);
    if (url.searchParams.has('profSurface')) {
      if (next === 'auto') url.searchParams.delete('profSurface');
      else url.searchParams.set('profSurface', next);
      window.history.replaceState(window.history.state, '', url);
    } else persist(next);
    listeners.forEach(listener => listener());
  },

  /** Ouvre l'interface pédagogique dans une fenêtre autonome, sans quitter le PC. */
  openTabletWindow(): Window | null {
    if (typeof window === 'undefined') return null;
    // Fenêtre au format tablette (portrait). La navigation reste celle du
    // navigateur, sans barre supplémentaire ni espace réservé dans l'application.
    const width = Math.max(100, Math.min(820, window.screen.availWidth - 40));
    const height = Math.max(100, Math.min(1180, window.screen.availHeight - 40));
    let popup: Window | null;
    try {
      popup = window.open(
        getTabletUrl(),
        TABLET_WINDOW_NAME,
        `width=${width},height=${height},left=80,top=40,resizable=yes,scrollbars=yes`,
      );
    } catch {
      return null;
    }
    // Un navigateur intégré peut refuser le focus sans avoir refusé l'ouverture.
    // Ne pas déclencher un second onglet dans ce cas.
    try { popup?.focus(); } catch { /* focus non disponible */ }
    return popup;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
