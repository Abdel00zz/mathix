import { useSyncExternalStore } from 'react';
import { profViewModeService, type ProfViewMode } from '../services/profViewModeService';
import { useIsDesktop } from './useMediaQuery';

const getServerSnapshot = (): ProfViewMode => 'auto';

/** Surface forcée du professeur : `auto` (matériel), `tablet` ou `pc`. */
export function useProfViewMode(): ProfViewMode {
  return useSyncExternalStore(
    profViewModeService.subscribe,
    profViewModeService.getMode,
    getServerSnapshot,
  );
}

/**
 * Surface pédagogique destinée au tactile.
 *
 * Contrairement à une simple media query, ce prédicat respecte aussi le mode
 * « tablette » explicitement forcé depuis la console professeur. Il reste
 * réactif à une rotation, à l'ajout d'un clavier/souris et au changement de
 * préférence, sans dupliquer cette décision dans chaque page pédagogique.
 */
export function useIsTabletSurface(): boolean {
  const mode = useProfViewMode();
  const isDesktop = useIsDesktop();
  return mode === 'tablet' || (mode === 'auto' && !isDesktop);
}
