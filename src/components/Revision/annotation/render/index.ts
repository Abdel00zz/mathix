/**
 * Couche de rendu canvas 2D. Surface publique consommée par l'orchestrateur
 * (BoxNoteCanvas) : rendu d'une marque, calque dynamique et overlay. Le rendu de
 * l'encre et des figures reste interne à la couche (importé en relatif).
 */
export { renderMark } from './shapes';
export { drawOverlay, drawDynamicBase } from './overlay';
export { preloadImages, releaseUnusedImages, onImageReady } from './images';
