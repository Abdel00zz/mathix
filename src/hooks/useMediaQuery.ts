import { useCallback, useSyncExternalStore } from 'react';

/**
 * Breakpoints (px) alignés sur la config Tailwind par défaut du projet.
 * Source de vérité unique : à garder synchronisé avec `tailwind.config.js`.
 */
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

const canMatch = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Une seule MediaQueryList par requête. Plusieurs composants peuvent ainsi
 * partager le store natif sans recréer d'objet à chaque lecture React.
 */
const mediaQueryCache = new Map<string, MediaQueryList>();

const getMediaQueryList = (query: string): MediaQueryList | null => {
  if (!canMatch()) return null;
  const cached = mediaQueryCache.get(query);
  if (cached) return cached;
  const mediaQuery = window.matchMedia(query);
  mediaQueryCache.set(query, mediaQuery);
  return mediaQuery;
};

// Sur le serveur (aucun rendu SSR ici, mais on reste robuste) on renvoie `false`.
const getServerSnapshot = () => false;

/**
 * S'abonne à une media query CSS et renvoie son état, de façon réactive.
 *
 * - `useSyncExternalStore` : lecture cohérente dès le premier rendu (pas de
 *   flash ni de mismatch), aucune déchirure de rendu concurrente.
 * - Aucun `useState`/`useEffect` : la valeur est dérivée directement du store
 *   natif `MediaQueryList`, donc pas de re-render superflu.
 * - Compatibilité Safari < 14 (`addListener`/`removeListener` en repli).
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = getMediaQueryList(query);
      if (!mql) return () => {};

      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onStoreChange);
        return () => mql.removeEventListener('change', onStoreChange);
      }

      // Repli navigateurs anciens (Safari < 14, iOS < 14).
      mql.addListener(onStoreChange);
      return () => mql.removeListener(onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => getMediaQueryList(query)?.matches ?? false,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Vrai strictement en dessous du breakpoint Tailwind donné — équivalent de `max-width`. */
function useBreakpointDown(bp: Breakpoint): boolean {
  // -0.02px : évite le chevauchement d'un pixel exact entre `up` et `down`.
  return useMediaQuery(`(max-width: ${BREAKPOINTS[bp] - 0.02}px)`);
}

/**
 * Layout compact (mobile + petites tablettes). Miroir exact du basculement de
 * navigation `lg:` de l'app : sous 1024px on passe en barre du bas.
 */
export function useIsMobile(): boolean {
  return useBreakpointDown('lg');
}

/**
 * Vrai téléphone en portrait OU téléphone tactile tourné en paysage.
 * La seconde branche couvre notamment les iPhone et Pixel dont la largeur CSS
 * dépasse 640 px après rotation, sans classer les ordinateurs bas en téléphone.
 */
export function useIsPhone(): boolean {
  return useMediaQuery(
    `(max-width: ${BREAKPOINTS.sm - 0.02}px), ` +
    '((pointer: coarse) and (orientation: landscape) and (max-height: 560px))',
  );
}

/** Orientation portrait (hauteur ≥ largeur). Réactif à la rotation de l'appareil. */
export function useIsPortrait(): boolean {
  return useMediaQuery('(orientation: portrait)');
}

/** Largeur suffisante pour restituer une vraie colonne média, y compris sur tablette tactile en paysage. */
export function useSupportsSideColumns(): boolean {
  return useMediaQuery('(min-width: 900px)');
}

/**
 * Vrai ordinateur de bureau : écran large, pointeur fin (souris/trackpad) et
 * AUCUN pointeur tactile secondaire. `any-pointer: coarse` exclut les
 * tablettes et 2-en-1 tactiles, même en paysage (≥ 1024px) ou avec un clavier
 * branché — là où `pointer: fine` seul échouait.
 */
export function useIsDesktop(): boolean {
  const wide = useMediaQuery('(min-width: 1024px)');
  const fine = useMediaQuery('(pointer: fine)');
  const touch = useMediaQuery('(any-pointer: coarse)');
  return wide && fine && !touch;
}
