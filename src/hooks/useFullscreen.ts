import { useCallback, useEffect, useState } from 'react';

/**
 * Plein écran natif de la console professeur (tablette ou PC).
 *
 * « De qualité supérieure » veut dire ici trois choses concrètes, qui n'existent
 * qu'en plein écran :
 *  1. le plein écran est le **vrai** (API Fullscreen, sans barre du navigateur) ;
 *  2. le **tracé manuscrit est redessiné à la densité réelle de l'écran**
 *     (`renderDensity`) — net sur une grande dalle ou sur un vidéoprojecteur ;
 *  3. la **veille de l'appareil est suspendue** : la tablette est souvent
 *     projetée sur le PC (scrcpy), un écran qui s'éteint coupe la projection.
 *
 * Le repli `webkit`/`ms` couvre les navigateurs de tablette anciens ; sur un
 * appareil qui ne sait pas faire de plein écran (iPhone), le bouton est masqué
 * plutôt que de rester inerte.
 */

type VendorDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type VendorElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

interface MinimalWakeLockSentinel {
  release: () => Promise<void>;
  released?: boolean;
}

/** Élément actuellement en plein écran (null sinon), préfixes vendeur compris. */
const currentFullscreenElement = (): Element | null => {
  if (typeof document === 'undefined') return null;
  const doc = document as VendorDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null;
};

/** Le navigateur sait-il passer en plein écran ? (iPhone : non) */
export function canUseFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as VendorDocument;
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? doc.msFullscreenEnabled;
  const element = document.documentElement as VendorElement;
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen ?? element.msRequestFullscreen;
  return Boolean(enabled) && typeof request === 'function';
}

export interface FullscreenControls {
  isFullscreen: boolean;
  /** Faux sur un appareil sans plein écran : l'appelant masque le bouton. */
  canFullscreen: boolean;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useFullscreen(): FullscreenControls {
  const [isFullscreen, setIsFullscreen] = useState(() => currentFullscreenElement() !== null);
  // Capacité lue au premier rendu (application cliente) : sur un appareil sans
  // plein écran — iPhone — le bouton est masqué au lieu de rester inerte.
  const [canFullscreen] = useState(canUseFullscreen);

  useEffect(() => {
    const sync = () => setIsFullscreen(currentFullscreenElement() !== null);
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'];
    events.forEach(name => document.addEventListener(name, sync));
    sync();
    return () => events.forEach(name => document.removeEventListener(name, sync));
  }, []);

  const enter = useCallback(async () => {
    const element = document.documentElement as VendorElement;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen ?? element.msRequestFullscreen;
    if (typeof request !== 'function') return;
    try {
      await request.call(element, { navigationUI: 'hide' } as FullscreenOptions);
    } catch {
      // Refus du navigateur (geste utilisateur requis, iframe…) : sans effet.
    }
  }, []);

  const exit = useCallback(async () => {
    const doc = document as VendorDocument;
    const leave = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.msExitFullscreen;
    if (typeof leave !== 'function') return;
    try {
      await leave.call(doc);
    } catch {
      // Idem : rien à signaler à l'utilisateur.
    }
  }, []);

  const toggle = useCallback(async () => {
    if (currentFullscreenElement()) await exit();
    else await enter();
  }, [enter, exit]);

  // Marqueur pour le CSS et pour `renderDensity` (canvas redessinés plus fins).
  useEffect(() => {
    const root = document.documentElement;
    if (isFullscreen) root.setAttribute('data-fullscreen', 'on');
    else root.removeAttribute('data-fullscreen');
    return () => root.removeAttribute('data-fullscreen');
  }, [isFullscreen]);

  // Veille suspendue : la tablette projetée ne doit pas s'éteindre en pleine séance.
  useEffect(() => {
    if (!isFullscreen) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<MinimalWakeLockSentinel> } };
    if (!nav.wakeLock) return;

    let sentinel: MinimalWakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const next = await nav.wakeLock!.request('screen');
        if (disposed) { void next.release().catch(() => undefined); return; }
        sentinel = next;
      } catch {
        // Refusé (gestion d'énergie, onglet en arrière-plan) : sans conséquence.
      }
    };

    // Le verrou est relâché par le navigateur dès que l'onglet passe en arrière-plan.
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [isFullscreen]);

  return { isFullscreen, canFullscreen, enter, exit, toggle };
}
