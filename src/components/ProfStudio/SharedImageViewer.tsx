import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, ZoomIn, ZoomOut, X, RefreshCw } from 'lucide-react';
import type { SharedImage } from '../../services/professorClassroomService';
import { DrawingCanvas } from '../Exercise/canvas/DrawingCanvas';
import { setActiveCanvas } from '../Exercise/canvas/canvasRegistry';
import { setToolState } from '../Exercise/canvas/toolStore';
import { CanvasFloatingToolbar } from '../Exercise/canvas/FloatingToolbar';
import type { Stroke } from '../Exercise/canvas/types';
import { useImagePlate } from '../../hooks/useImagePlate';
import {
  fitImageBox, flushImageInk, inkToFrame, inkToImage, readImageInk, writeImageInk,
} from './sharedImageInk';

interface SharedImageViewerProps {
  image: SharedImage | null;
  onClose: () => void;
  images?: SharedImage[];
  onSelectImage?: (image: SharedImage) => void;
  /**
   * Version tablette professeur : superpose le canvas d'annotation à l'image et
   * monte sa propre barre d'outils, même hors d'une séance pédagogique.
   */
  annotate?: boolean;
}

const ROTATIONS = [0, 90, 180, 270];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/**
 * Visionneuse plein écran d'une image partagée élève → professeur.
 * Rotation par pas de 90° et zoom borné (0,5×–4×).
 *
 * Deux mises en page pour une seule raison : `DrawingCanvas` mesure les
 * pointeurs en pixels d'écran, sans tenir compte des transformations CSS de ses
 * ancêtres.
 *   - Sans annotation : l'image est simplement transformée (le plus fluide).
 *   - Avec annotation : un cadre NON transformé est dimensionné à l'image
 *     affichée (rotation et zoom compris) ; seule l'`<img>` tourne à
 *     l'intérieur. Le canvas reste ainsi aligné sur les axes de l'écran, et les
 *     traits sont conservés dans le repère de l'image (`sharedImageInk`) pour
 *     suivre les rotations sans se déformer.
 */
export default function SharedImageViewer({ image, images = [], onSelectImage, onClose, annotate = false }: SharedImageViewerProps) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [prevImageId, setPrevImageId] = useState<string | null>(null);
  /** Taille naturelle de l'image, connue seulement après son décodage. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  // Fond requis par l'image : une figure sans fond reçoit une plaque claire,
  // sinon elle disparaît sur le fond sombre de la visionneuse.
  const plate = useImagePlate(image?.dataUri);

  const imageId = image?.id ?? null;
  const currentIndex = images.findIndex(entry => entry.id === imageId);
  const hasGallery = images.length > 1 && currentIndex >= 0 && !!onSelectImage;
  const selectAdjacent = useCallback((direction: -1 | 1) => {
    const next = images[currentIndex + direction];
    if (next && onSelectImage) { flushImageInk(); onSelectImage(next); }
  }, [images, currentIndex, onSelectImage]);

  // Réinitialise la transformation à chaque nouvelle image — pattern React
  // « ajuster l'état pendant le rendu » (pas d'effet : évite un re-render en
  // cascade et reste fluide sur tablette).
  if (imageId !== prevImageId) {
    setPrevImageId(imageId);
    setRotation(0);
    setZoom(1);
    setNatural(null);
  }

  useEffect(() => {
    if (!imageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (hasGallery && e.key === 'ArrowLeft') { e.preventDefault(); selectAdjacent(-1); }
      if (hasGallery && e.key === 'ArrowRight') { e.preventDefault(); selectAdjacent(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageId, onClose, hasGallery, selectAdjacent]);

  // Mesure du plateau : c'est elle qui donne l'échelle « contain » de l'image,
  // donc la taille du cadre d'annotation.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setViewport({ w: stage.clientWidth, h: stage.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [imageId]);

  // Même geste que l'ouverture d'une zone de réponse : stylo armé, barre dépliée.
  useEffect(() => {
    if (!annotate || !imageId) return;
    setToolState({ tool: 'pen', railCollapsed: false, openMenu: null });
  }, [annotate, imageId]);

  // Rien ne doit rester dans la file d'écriture en quittant l'image.
  useEffect(() => flushImageInk, [imageId]);

  const box = useMemo(
    () => fitImageBox(natural?.w ?? 0, natural?.h ?? 0, viewport.w, viewport.h, rotation, zoom),
    [natural, viewport.w, viewport.h, rotation, zoom],
  );

  const geom = useMemo(
    () => ({
      naturalWidth: natural?.w ?? 0,
      naturalHeight: natural?.h ?? 0,
      rotation,
      factor: box.factor,
    }),
    [natural, rotation, box.factor],
  );

  const inkReady = annotate && box.factor > 0 && !!imageId;
  const canvasId = `shared-image:${imageId ?? 'none'}`;
  /**
   * Le canvas relit `initialStrokes` au montage seulement : toute variation de
   * géométrie le remonte avec les traits reconvertis. Les pas de zoom sont
   * discrets (appuis boutons), le coût reste celui d'un redimensionnement.
   */
  const canvasKey = `${canvasId}:${rotation}:${box.width}x${box.height}`;

  const framedStrokes = useMemo(
    () => (inkReady && imageId ? inkToFrame(readImageInk(imageId), geom) : []),
    [inkReady, imageId, geom],
  );

  const handleStrokes = useCallback((next: Stroke[]) => {
    if (!imageId || geom.factor <= 0) return;
    writeImageInk(imageId, inkToImage(next, geom));
  }, [imageId, geom]);

  // Le remontage du canvas rend la main au premier canvas inscrit (une zone de
  // réponse restée derrière) : on rebraque la barre sur l'image après chaque
  // changement de géométrie. Cet effet passe APRÈS l'inscription de l'enfant.
  useEffect(() => {
    if (!inkReady) return;
    setActiveCanvas(canvasId);
  }, [inkReady, canvasId, canvasKey]);

  if (!image) return null;

  const rotateBy = (deg: number) => {
    setRotation(prev => ROTATIONS[(ROTATIONS.indexOf(prev) + (deg > 0 ? 1 : 3)) % ROTATIONS.length]);
  };
  const zoomBy = (factor: number) => {
    setZoom(prev => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev * factor) * 10) / 10)));
  };
  const reset = () => { setRotation(0); setZoom(1); };

  const dateLabel = image.createdAt ? new Date(image.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const alt = image.caption || `Image partagée pour ${image.studentName}`;
  const turned = rotation === 90 || rotation === 270;

  return (
    <div
      className={`fixed inset-0 flex flex-col ${
        // La barre de la visionneuse est montée dans cette même couche.
        annotate ? 'z-[140] bg-slate-900' : 'z-[140] bg-slate-950/90 backdrop-blur-sm'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Image partagée pour ${image.studentName}`}
      // En annotation, un appui hors de l'image ne doit pas refermer la
      // visionneuse : il ne reste que la croix et Échap.
      onMouseDown={annotate ? undefined : onClose}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 text-white" onMouseDown={e => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{image.studentName}</p>
          <p className="truncate text-xs text-white/60">
            {image.caption || 'Image partagée'}{dateLabel && ` · ${dateLabel}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => rotateBy(-90)} title="Tourner à gauche" aria-label="Tourner à gauche" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <RotateCcw size={18} />
          </button>
          <button type="button" onClick={() => rotateBy(90)} title="Tourner à droite" aria-label="Tourner à droite" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <RotateCw size={18} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.2)} title="Zoom arrière" aria-label="Zoom arrière" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <ZoomOut size={18} />
          </button>
          <button type="button" onClick={() => zoomBy(1.2)} title="Zoom avant" aria-label="Zoom avant" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={reset} title="Réinitialiser" aria-label="Réinitialiser" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <RefreshCw size={16} />
          </button>
          <button type="button" onClick={onClose} title="Fermer" aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className={`relative min-h-0 flex-1 ${annotate ? 'flex overflow-auto overscroll-contain mr-20' : 'overflow-hidden'}`}
        onMouseDown={e => e.stopPropagation()}
      >
        {annotate ? (
          /* Cadre à la taille de l'image affichée, sans aucune transformation :
             c'est le repère du canvas. `m-auto` centre tout en laissant les
             débordements atteignables au doigt (contrairement à un centrage par
             `justify-center`). */
          <div
            className={`relative m-auto shrink-0 ${plate === 'light' ? 'bg-paper' : ''}`}
            style={{ width: box.width || undefined, height: box.height || undefined }}
          >
            <img
              src={image.dataUri}
              alt={alt}
              /* `max-w-none` : le preflight Tailwind impose `max-width: 100%` aux
                 images, ce qui écrasait l'image à la largeur du cadre au quart de
                 tour (cadre 388 px pour une image posée à 620 px). C'est le cadre
                 qui donne la taille, pas la contrainte du parent. */
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: turned ? box.height : box.width,
                height: turned ? box.width : box.height,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
              draggable={false}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
            {inkReady && (
              <DrawingCanvas
                key={canvasKey}
                instanceId={canvasId}
                height={box.height}
                initialStrokes={framedStrokes}
                onStrokesChange={handleStrokes}
                panAxis="both"
                isEditMode
              />
            )}
          </div>
        ) : (
          <img
            src={image.dataUri}
            alt={alt}
            className={`absolute left-1/2 top-1/2 max-h-full max-w-full select-none ${plate === 'light' ? 'bg-paper' : ''}`}
            style={{
              transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${zoom})`,
              transition: 'transform 200ms ease-out',
            }}
            draggable={false}
          />
        )}
      </div>

      {annotate && <CanvasFloatingToolbar imageViewer />}

      {hasGallery && (
        <nav aria-label="Images de l’élève" className="flex shrink-0 items-center justify-center gap-3 px-3 py-2" onMouseDown={e => e.stopPropagation()}>
          <button type="button" aria-label="Image précédente" disabled={currentIndex === 0} onClick={() => selectAdjacent(-1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-white disabled:opacity-30"><ChevronLeft size={22} /></button>
          <div className="flex max-w-[65vw] gap-2 overflow-x-auto p-1">
            {images.map((entry, index) => (
              <button key={entry.id} type="button" onClick={() => { flushImageInk(); onSelectImage?.(entry); }} aria-label={`Afficher l’image ${index + 1}`} aria-current={entry.id === imageId ? 'true' : undefined} className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 ${entry.id === imageId ? 'border-emerald-400' : 'border-transparent'}`}>
                <img src={entry.dataUri} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Image suivante" disabled={currentIndex === images.length - 1} onClick={() => selectAdjacent(1)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/10 text-white disabled:opacity-30"><ChevronRight size={22} /></button>
        </nav>
      )}

      <footer className="flex shrink-0 items-center justify-center gap-3 px-4 py-2 text-xs text-white/50" onMouseDown={e => e.stopPropagation()}>
        <span>{rotation}°</span>
        <span className="text-white/20">·</span>
        <span>{Math.round(zoom * 100)}%</span>
        {hasGallery && <span aria-live="polite">Image {currentIndex + 1} / {images.length}</span>}
        {annotate && <span>Annoter au stylet · outils à droite</span>}
      </footer>
    </div>
  );
}
