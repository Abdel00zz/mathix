/**
 * Densité de rendu des surfaces manuscrites (canvas du stylet).
 *
 * Le bitmap d'un canvas est dimensionné en **pixels physiques** pour que le
 * tracé reste net ; le plafond de densité existe pour ne pas faire exploser la
 * mémoire quand une fiche affiche une dizaine de zones de dessin.
 *
 * En **plein écran**, ce plafond est relevé : le professeur projette, l'écran
 * est grand, et un tracé redessiné à la densité réelle de la dalle reste net
 * au lieu d'être interpolé. Sur un appareil dont la densité dépasse déjà le
 * plafond ordinaire (dalle 3×), c'est la différence entre un trait pâteux et un
 * trait franc.
 */

/** Plafond de densité en plein écran : au-delà, le gain visuel ne paie plus la mémoire. */
export const FULLSCREEN_DENSITY_CAP = 3;

/** Le document est-il en plein écran natif ? */
export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.msFullscreenElement ?? null);
}

/**
 * Densité à donner à un canvas.
 *
 * @param defaultCap Plafond ordinaire (hors plein écran) — celui du composant
 *                   appelant, conservé à l'identique pour ne rien changer au
 *                   rendu habituel.
 */
export function renderDensity(defaultCap: number): number {
  const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const cap = isFullscreenActive() ? Math.max(defaultCap, FULLSCREEN_DENSITY_CAP) : defaultCap;
  return Math.min(cap, Math.max(1, ratio));
}
