import { useEffect, useState } from 'react';
import { useHasOpenCanvases } from './canvasRegistry';
import { useToolValue } from './toolStore';

/**
 * Hauteur réelle de la barre d'outils canva, 0 si elle n'est pas montée.
 *
 * La barre est chargée en lazy et disparaît dès qu'aucun canvas n'est ouvert :
 * on suit donc son apparition/disparition (MutationObserver) autant que son
 * redimensionnement (ResizeObserver). Aucune écoute du pointeur : la mesure ne
 * doit rien coûter pendant le tracé au stylet.
 */
export function useRailHeight(): number {
  const railCollapsed = useToolValue(s => s.railCollapsed);
  const hasOpenCanvases = useHasOpenCanvases();
  const [railHeight, setRailHeight] = useState(0);

  useEffect(() => {
    let raf = 0;
    let observer: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const measure = () => {
      const rail = document.querySelector<HTMLElement>('[data-canvas-rail]');
      setRailHeight(rail ? rail.getBoundingClientRect().height : 0);
    };

    const attachObserver = () => {
      if (observer) return;
      const rail = document.querySelector<HTMLElement>('[data-canvas-rail]');
      if (rail && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(rail);
      }
    };

    // Différé d'une frame : évite un setState synchrone dans l'effet.
    raf = window.requestAnimationFrame(() => { measure(); attachObserver(); });

    // Détecte l'apparition/disparition de la barre (y compris le montage lazy
    // via Suspense) : on ne re-mesure que si un nœud « barre » a été ajouté ou
    // retiré du DOM, pour rester léger pendant le tracé au stylet.
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(records => {
        const touchesRail = (node: Node) =>
          node instanceof HTMLElement && (node.matches?.('[data-canvas-rail]') || node.querySelector?.('[data-canvas-rail]'));
        const relevant = records.some(r =>
          Array.from(r.addedNodes).some(touchesRail) || Array.from(r.removedNodes).some(touchesRail));
        if (relevant) { measure(); attachObserver(); }
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [railCollapsed, hasOpenCanvases]);

  return railHeight;
}

/**
 * Décalage `bottom` d'une colonne de boutons empilée juste au-dessus de la barre
 * d'outils (centrée verticalement). On ancre par le bas et non par le haut : le
 * dock grandit alors vers le haut à mesure qu'on lui ajoute des boutons, sans
 * jamais recouvrir la barre. Sans barre montée, il reste au-dessus du centre.
 */
export function useRailDockBottom(): string {
  const railHeight = useRailHeight();
  return railHeight > 0
    ? `calc(50% + ${Math.round(railHeight / 2 + 10)}px)`
    : 'calc(50% + 40px)';
}
