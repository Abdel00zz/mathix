/** Constantes de saisie du canvas manuscrit (temps en ms, distances en px). */

/** px — bouton de suppression de la sélection. */
export const HANDLE = 18;
export const RESIZE_HANDLE = 10;
/** Maintien du stylet → reconnaissance de forme. */
export const HOLD_MS = 550;
/** Rejet de paume : le stylet reste « présent » ce délai après son dernier événement. */
export const PEN_PRESENCE_MS = 1000;
/** Durée max d'un clic du bouton S Pen en l'air → bascule outil. */
export const AIR_CLICK_MAX_MS = 650;
/** Pas de la grille d'aimantation (aligné au fond quadrillé). */
export const GRID_PX = 24;
export const ANCHOR_SNAP_PX = 12;
export const ANCHOR_GUIDE_PX = 64;
export const CM_PER_CSS_PX = 2.54 / 96;

/** Masques de boutons Pointer Events. */
export const PEN_TIP_MASK = 1;
export const PEN_BARREL_MASK = 2;
export const PEN_ERASER_MASK = 32;
