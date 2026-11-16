import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  AnnotationTool, EraserMode, HighlighterStyle, InkMark, InkPoint, Mark, PenStyle, Point,
  PressureCurve, SurfaceStyle,
  AnchorIndex, Transform,
  isShapeKind, isImageMark, buildAnchorIndex, calibratePressure, simplifyInkPoints, StrokeSmoother,
  fromScreen, markAnchors, markHit, marksBBox, marksInLasso, recognizeShape,
  translateMark, scaleMarkToBBox, erasePartialAt,
} from './core';
import {
  renderMark, drawOverlay, drawDynamicBase,
  preloadImages, releaseUnusedImages, onImageReady,
} from './render';
import {
  ANCHOR_GUIDE_PX, ANCHOR_SNAP_PX, GRID_PX, HANDLE, HOLD_MS, RESIZE_HANDLE,
  PEN_PRESENCE_MS, AIR_CLICK_MAX_MS,
  PointerSample, hasPenTipContact, hasPenEraserButton, isPenPointer, AirButtonClick,
  Gesture, ResizeHandle, EraserGestureStyle, eraserRadius, resizeTargetBBox,
  SnapConfig, snapPoint, snapShape,
} from './input';
import { renderDensity } from '../../../utils/renderDensity';

/** Réduit les points d'un trait d'encre au commit (RDP + tolérance par outil). */
function simplifyGesturePoints(
  pts: InkPoint[],
  size: number,
  width: number,
  kind: 'pen' | 'highlighter',
): InkPoint[] {
  if (pts.length <= 2) return pts;
  const w = Math.max(1, width);
  const tolerancePx = kind === 'highlighter'
    ? Math.max(0.65, Math.min(1.6, size * 0.05))
    : Math.max(0.35, Math.min(1.1, size * 0.1));
  const tolerance = tolerancePx / w;
  const pressureScale = Math.max(2, size * 1.25) / w;
  return simplifyInkPoints(pts, tolerance, pressureScale);
}

interface Props {
  marks: Mark[];
  tool: AnnotationTool;
  color: string;
  size: number;
  penStyle: PenStyle;
  highlighterStyle: HighlighterStyle;
  highlighterStraightLines: boolean;
  pressureCurve: PressureCurve;
  penStabilization: number;
  eraserMode: EraserMode;
  eraserSize: number;
  eraserAutoSize: boolean;
  eraserHighlighterOnly: boolean;
  surface: SurfaceStyle;
  snapGrid: boolean;
  angleSnap: boolean;
  angleStep: 15 | 30 | 45;
  smartSnap: boolean;
  regularShapes: boolean;
  showMeasurements: boolean;
  shapeRecognition: boolean;
  sketchyShapes: boolean;
  onCommit: (mark: Mark) => void;
  onSetMarks: (next: Mark[]) => void;
  /** Clic du bouton S Pen (en l'air) → bascule stylo/gomme. */
  onToggleEraser?: () => void;
}

/**
 * Canvas manuscrit BORNÉ (une zone sous un bloc). Orchestration seule : mesures
 * DOM, cache statique, boucle rAF et machine à états des pointeurs. Le domaine
 * (géométrie, reconnaissance, lissage), le rendu (encre/figures/overlay) et
 * l'interprétation du stylet vivent dans `core/`, `render/` et `input/`.
 *
 * Coordonnées normalisées à la largeur : indépendant du scroll et du DPR.
 */
const BoxNoteCanvas: React.FC<Props> = ({
  marks, tool, color, size, penStyle, highlighterStyle, highlighterStraightLines, pressureCurve, penStabilization,
  eraserMode, eraserSize, eraserAutoSize, eraserHighlighterOnly, surface,
  snapGrid, angleSnap, angleStep, smartSnap, regularShapes, showMeasurements,
  shapeRecognition, sketchyShapes,
  onCommit, onSetMarks, onToggleEraser,
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gestureRef = useRef<Gesture>(null);
  const selectionRef = useRef<number[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const gestureTransformRef = useRef<Transform | null>(null);
  const inputTransformRef = useRef<Transform | null>(null);
  const inputTransformDirtyRef = useRef(true);
  const rafRef = useRef(0);
  const dprRef = useRef(1);
  const cacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const cacheDirtyRef = useRef(true);
  const strokeFilterRef = useRef<StrokeSmoother | null>(null);
  const hoverRef = useRef<{ point: Point; pressure: number; tool?: 'eraser' } | null>(null);
  const anchorIndexRef = useRef<AnchorIndex>(new Map());
  const lastPenAtRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Rejet de paume : maintient l'état « stylet présent » (survol ou contact).
  const penPresenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const airClickRef = useRef(new AirButtonClick(AIR_CLICK_MAX_MS));
  const onToggleEraserRef = useRef(onToggleEraser);
  // Estimation de vitesse (px/ms) pour l'espacement adaptatif des points.
  const strokeDynRef = useRef({ x: 0, y: 0, t: 0, speed: 0 });
  const clearHold = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  }, []);

  useLayoutEffect(() => { onToggleEraserRef.current = onToggleEraser; }, [onToggleEraser]);

  /**
   * Marque le stylet comme présent (survol ou contact) : force `touch-action:
   * none` (rejet paume au niveau navigateur) et prolonge la fenêtre de blocage
   * tactile. L'attribut n'est retiré qu'après PEN_PRESENCE_MS sans événement
   * stylet ET hors tracé — le doigt peut alors de nouveau faire défiler.
   */
  const notePenPresence = useCallback((mode?: 'ink' | 'eraser') => {
    lastPenAtRef.current = performance.now();
    const s = surfaceRef.current;
    if (s) {
      s.setAttribute('data-pen-active', 'true');
      if (mode) s.setAttribute('data-pen-mode', mode);
    }
    if (penPresenceTimerRef.current) clearTimeout(penPresenceTimerRef.current);
    penPresenceTimerRef.current = setTimeout(() => {
      penPresenceTimerRef.current = null;
      if (pointerIdRef.current === null) {
        surfaceRef.current?.removeAttribute('data-pen-active');
        surfaceRef.current?.removeAttribute('data-pen-mode');
      }
    }, PEN_PRESENCE_MS);
  }, []);

  /** Suit les fronts du bouton latéral ; bascule stylo/gomme sur clic en l'air. */
  const trackAirButton = useCallback((e: PointerSample) => {
    if (airClickRef.current.update(e)) {
      onToggleEraserRef.current?.();
      navigator.vibrate?.(12);
    }
  }, []);

  const marksRef = useRef(marks);
  const propsRef = useRef({
    tool, color, size, penStyle, highlighterStyle, highlighterStraightLines, pressureCurve, penStabilization,
    eraserMode, eraserSize, eraserAutoSize, eraserHighlighterOnly, snapGrid, angleSnap,
    angleStep, smartSnap, regularShapes, showMeasurements, shapeRecognition, sketchyShapes,
  });
  useLayoutEffect(() => {
    marksRef.current = marks;
    anchorIndexRef.current = buildAnchorIndex(marks.flatMap(markAnchors));
  }, [marks]);

  /** Index de l'image la plus haute sous le point, -1 si aucune. */
  const topmostImageAt = useCallback((p: Point): number => {
    const list = marksRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (isImageMark(m) && markHit(m, p[0], p[1], 0)) return i;
    }
    return -1;
  }, []);

  /**
   * Verrou de proportion : uniquement quand la sélection est UNE image seule.
   * Sur une sélection multiple, contraindre le ratio déformerait les traits
   * manuscrits qui l'accompagnent — la contrainte ne vaut que pour l'image.
   */
  const selectionRatioLock = useCallback((): number | undefined => {
    const sel = selectionRef.current;
    if (sel.length !== 1) return undefined;
    const m = marksRef.current[sel[0]];
    return m && isImageMark(m) ? m.ratio : undefined;
  }, []);

  // Décodage anticipé + libération des bitmaps orphelins (mémoire GPU).
  useEffect(() => {
    const refs = new Set<string>();
    for (const m of marks) if (isImageMark(m)) refs.add(m.ref);
    preloadImages(refs);
    releaseUnusedImages(refs);
  }, [marks]);

  useLayoutEffect(() => {
    propsRef.current = {
      tool, color, size, penStyle, highlighterStyle, highlighterStraightLines, pressureCurve, penStabilization,
      eraserMode, eraserSize, eraserAutoSize, eraserHighlighterOnly, snapGrid, angleSnap,
      angleStep, smartSnap, regularShapes, showMeasurements, shapeRecognition, sketchyShapes,
    };
  }, [
    tool, color, size, penStyle, highlighterStyle, highlighterStraightLines, pressureCurve, penStabilization,
    eraserMode, eraserSize, eraserAutoSize, eraserHighlighterOnly, snapGrid, angleSnap,
    angleStep, smartSnap, regularShapes, showMeasurements, shapeRecognition, sketchyShapes,
  ]);

  const rectRef = useRef<{ w: number }>({ w: 1 });
  const renderT = useCallback((): Transform => ({ ox: 0, oy: 0, w: rectRef.current.w }), []);
  const inputT = useCallback((forceMeasure = false): Transform => {
    if (!forceMeasure && !inputTransformDirtyRef.current && inputTransformRef.current) {
      return inputTransformRef.current;
    }
    const r = surfaceRef.current!.getBoundingClientRect();
    rectRef.current = { w: r.width };
    const transform = { ox: r.left, oy: r.top, w: r.width };
    inputTransformRef.current = transform;
    inputTransformDirtyRef.current = false;
    return transform;
  }, []);
  const invalidateInputTransform = useCallback(() => {
    inputTransformDirtyRef.current = true;
  }, []);

  // Configuration d'aimantation courante (préférences + ancres + largeur).
  const snapCfg = useCallback((): SnapConfig => {
    const p = propsRef.current;
    const w = rectRef.current.w || 1;
    return {
      smartSnap: p.smartSnap,
      snapGrid: p.snapGrid,
      angleSnap: p.angleSnap,
      angleStep: p.angleStep,
      gridStep: GRID_PX / w,
      anchorSnap: ANCHOR_SNAP_PX / w,
      anchorIndex: anchorIndexRef.current,
    };
  }, []);

  const rebuildStaticCache = useCallback(() => {
    const visible = canvasRef.current;
    if (!visible || visible.width < 1 || visible.height < 1) return;
    let cache = cacheCanvasRef.current;
    if (!cache) {
      cache = document.createElement('canvas');
      cacheCanvasRef.current = cache;
      cacheContextRef.current = cache.getContext('2d', { alpha: true });
    }
    if (cache.width !== visible.width) cache.width = visible.width;
    if (cache.height !== visible.height) cache.height = visible.height;
    const ctx = cacheContextRef.current;
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cache.width / dpr, cache.height / dpr);
    const t = renderT();
    const sketchy = propsRef.current.sketchyShapes;
    for (const mark of marksRef.current) renderMark(ctx, t, mark, sketchy);
    cacheDirtyRef.current = false;
  }, [renderT]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    if (!canvas || !ctx) return;
    const t = renderT();
    if (t.w === 0) return;
    const dpr = dprRef.current;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const g = gestureRef.current;
    const p = propsRef.current;
    // Cache statique pour les marques persistées ; base re-rendue seulement quand
    // un geste les modifie en direct (gomme, déplacement, redimensionnement).
    const needsDynamicBase = g?.type === 'erasePartial' || g?.type === 'eraseStroke'
      || g?.type === 'move' || g?.type === 'resize';
    if (!needsDynamicBase) {
      if (cacheDirtyRef.current) rebuildStaticCache();
      const cache = cacheCanvasRef.current;
      if (cache) {
        ctx.drawImage(cache, 0, 0, cache.width, cache.height, 0, 0, cssWidth, cssHeight);
      }
    } else if (g) {
      drawDynamicBase(ctx, t, g, marksRef.current, p.sketchyShapes);
    }

    const selection = g?.type === 'move' || g?.type === 'resize' ? g.selection : selectionRef.current;
    drawOverlay({
      ctx, t, cssWidth, cssHeight,
      gesture: g,
      marks: marksRef.current,
      selection,
      hover: hoverRef.current,
      anchorIndex: anchorIndexRef.current,
      snap: snapCfg(),
      anchorGuidePx: ANCHOR_GUIDE_PX,
      props: {
        tool: p.tool,
        color: p.color,
        size: p.size,
        eraserSize: p.eraserSize,
        eraserAutoSize: p.eraserAutoSize,
        showMeasurements: p.showMeasurements,
        smartSnap: p.smartSnap,
        sketchyShapes: p.sketchyShapes,
      },
    });
  }, [renderT, rebuildStaticCache, snapCfg]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw(); });
  }, [draw]);

  // Basculer le tracé main levée change le rendu de toutes les figures déjà
  // posées : le cache statique doit être reconstruit, pas seulement redessiné.
  useLayoutEffect(() => {
    cacheDirtyRef.current = true;
    scheduleDraw();
  }, [sketchyShapes, scheduleDraw]);

  /**
   * Les images se décodent de façon ASYNCHRONE (IndexedDB → Blob → ImageBitmap)
   * alors que le rendu est synchrone : au premier passage, seul le cadre
   * d'attente est peint. Sans cette notification, l'image n'apparaissait qu'au
   * prochain repaint fortuit — typiquement en redimensionnant la zone. On
   * invalide le cache STATIQUE : l'image en fait partie, un simple redraw
   * rebliterait l'ancien cache, encore vide.
   */
  useEffect(() => {
    onImageReady(() => {
      cacheDirtyRef.current = true;
      scheduleDraw();
    });
    return () => onImageReady(null);
  }, [scheduleDraw]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const s = surfaceRef.current;
    if (!canvas || !s) return;
    const r = s.getBoundingClientRect();
    rectRef.current = { w: r.width };
    inputTransformRef.current = { ox: r.left, oy: r.top, w: r.width };
    inputTransformDirtyRef.current = false;
    const dpr = renderDensity(2.5);
    const nextWidth = Math.max(1, Math.round(r.width * dpr));
    const nextHeight = Math.max(1, Math.round(r.height * dpr));
    const dimensionsChanged = canvas.width !== nextWidth
      || canvas.height !== nextHeight
      || dprRef.current !== dpr;
    if (!dimensionsChanged && contextRef.current) return;
    dprRef.current = dpr;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    // `alpha: true` sans `desynchronized` : sur Android/Samsung, un canvas
    // « desynchronized » est promu en overlay matériel OPAQUE qui ignore la
    // composition alpha avec la page → toute la zone apparaît noire. La latence
    // reste faible grâce aux événements coalescés/prédits + rAF ; transparence prime.
    const ctx = contextRef.current || canvas.getContext('2d', { alpha: true });
    contextRef.current = ctx;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cacheDirtyRef.current = true;
    rebuildStaticCache();
    draw();
  }, [draw, rebuildStaticCache]);

  useEffect(() => {
    resize();
    const el = surfaceRef.current;
    const ro = new ResizeObserver(() => resize());
    if (el) ro.observe(el);
    window.addEventListener('scroll', invalidateInputTransform, true);
    window.visualViewport?.addEventListener('resize', invalidateInputTransform);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', invalidateInputTransform, true);
      window.visualViewport?.removeEventListener('resize', invalidateInputTransform);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      el?.removeAttribute('data-pen-active');
      el?.removeAttribute('data-pen-mode');
      clearHold();
      if (penPresenceTimerRef.current) { clearTimeout(penPresenceTimerRef.current); penPresenceTimerRef.current = null; }
      contextRef.current = null;
      cacheContextRef.current = null;
      cacheCanvasRef.current = null;
      inputTransformRef.current = null;
    };
  }, [resize, clearHold, invalidateInputTransform]);

  // Les marques invalident le cache statique.
  useEffect(() => {
    selectionRef.current = selectionRef.current.filter((i) => i < marks.length);
    cacheDirtyRef.current = true;
    rebuildStaticCache();
    scheduleDraw();
  }, [marks, rebuildStaticCache, scheduleDraw]);

  // Les préférences d'outil ne redessinent que la couche dynamique.
  useEffect(() => {
    if (tool !== 'lasso') selectionRef.current = [];
    scheduleDraw();
  }, [
    tool, color, size, penStyle, highlighterStyle, pressureCurve, penStabilization,
    eraserMode, eraserSize, eraserAutoSize, eraserHighlighterOnly,
    snapGrid, angleSnap, angleStep, smartSnap, regularShapes, showMeasurements,
    shapeRecognition, scheduleDraw,
  ]);

  // Clavier du lasso : suppression et déplacement précis aux flèches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (propsRef.current.tool !== 'lasso' || selectionRef.current.length === 0) return;
      const sel = selectionRef.current;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        selectionRef.current = [];
        onSetMarks(marksRef.current.filter((_, i) => !sel.includes(i)));
        return;
      }
      const arrows: Record<string, Point> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const direction = arrows[e.key];
      if (!direction) return;
      e.preventDefault();
      const amount = (e.shiftKey ? 10 : 1) / (rectRef.current.w || 1);
      onSetMarks(marksRef.current.map((m, i) => (
        sel.includes(i) ? translateMark(m, direction[0] * amount, direction[1] * amount) : m
      )));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSetMarks]);

  // ── Hit-tests des poignées de sélection ────────────────────────────────────
  const hitDeleteHandle = useCallback((clientX: number, clientY: number): boolean => {
    const sel = selectionRef.current;
    if (sel.length === 0) return false;
    const bb = marksBBox(marksRef.current, sel);
    if (!bb) return false;
    const rect = surfaceRef.current!.getBoundingClientRect();
    // Repère local (px) = normalisé × largeur, cohérent avec le rendu (ox=0).
    const bx = bb.maxX * rect.width + 6 - HANDLE;
    const by = bb.minY * rect.width - 6 - HANDLE;
    const localX = clientX - rect.left, localY = clientY - rect.top;
    return localX >= bx && localX <= bx + HANDLE && localY >= by && localY <= by + HANDLE;
  }, []);

  const hitResizeHandle = useCallback((clientX: number, clientY: number): ResizeHandle | null => {
    const bb = marksBBox(marksRef.current, selectionRef.current);
    if (!bb) return null;
    const rect = surfaceRef.current!.getBoundingClientRect();
    const localX = clientX - rect.left, localY = clientY - rect.top;
    const corners: { handle: ResizeHandle; x: number; y: number }[] = [
      { handle: 'nw', x: bb.minX * rect.width - 6, y: bb.minY * rect.width - 6 },
      { handle: 'ne', x: bb.maxX * rect.width + 6, y: bb.minY * rect.width - 6 },
      { handle: 'se', x: bb.maxX * rect.width + 6, y: bb.maxY * rect.width + 6 },
      { handle: 'sw', x: bb.minX * rect.width - 6, y: bb.maxY * rect.width + 6 },
    ];
    const hit = corners.find(({ x, y }) => (
      Math.abs(localX - x) <= RESIZE_HANDLE && Math.abs(localY - y) <= RESIZE_HANDLE
    ));
    return hit?.handle || null;
  }, []);

  // ── Démarrage des gestes ────────────────────────────────────────────────────
  const beginEraserGesture = useCallback((
    event: PointerSample,
    transform: Transform,
    point: Point,
    fromStylusButton: boolean,
  ) => {
    const current = propsRef.current;
    const style: EraserGestureStyle = {
      size: current.eraserSize,
      // Le bouton S Pen exploite toujours la pression pour une gomme naturelle.
      autoSize: fromStylusButton || current.eraserAutoSize,
      // Le bouton matériel reste une gomme générale, indépendamment du filtre UI.
      highlighterOnly: fromStylusButton ? false : current.eraserHighlighterOnly,
      pressureCurve: current.pressureCurve,
    };
    const radius = eraserRadius(transform, calibratePressure(event, style.pressureCurve, false), style);
    if (current.eraserMode === 'partial') {
      const result = erasePartialAt(marksRef.current, point[0], point[1], radius, style.highlighterOnly);
      gestureRef.current = { type: 'erasePartial', working: result.marks, changed: result.changed, style };
      return;
    }
    const removed = new Set<number>();
    marksRef.current.forEach((mark, index) => {
      if ((!style.highlighterOnly || mark.kind === 'highlighter') && markHit(mark, point[0], point[1], radius)) {
        removed.add(index);
      }
    });
    gestureRef.current = { type: 'eraseStroke', removed, style };
  }, []);

  const beginInkGesture = useCallback((
    event: PointerSample,
    point: Point,
    inkTool: 'pen' | 'highlighter',
  ) => {
    const current = propsRef.current;
    const firstPressure = calibratePressure(
      event,
      current.pressureCurve,
      inkTool === 'pen' && current.penStyle === 'pencil',
    );
    // Moteur de lissage One Euro amorcé sur le point de contact : la sortie suit
    // dès le premier échantillon, sans latence d'amorçage.
    const smoother = new StrokeSmoother(current.penStabilization);
    smoother.seed(event.clientX, event.clientY, firstPressure, event.timeStamp ?? performance.now());
    strokeFilterRef.current = smoother;
    strokeDynRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp ?? performance.now(), speed: 0 };
    gestureRef.current = {
      type: 'ink',
      pts: [[point[0], point[1], firstPressure]],
      snap: null,
      style: {
        kind: inkTool,
        color: current.color,
        size: current.size,
        penStyle: current.penStyle,
        highlighterStyle: current.highlighterStyle,
        stabilization: current.penStabilization,
        pressureCurve: current.pressureCurve,
        recognizeShapes: inkTool === 'pen' && current.shapeRecognition,
        straightLine: inkTool === 'highlighter' && current.highlighterStraightLines,
      },
    };
  }, []);

  const commitTransientGesture = useCallback((gesture: NonNullable<Gesture>) => {
    if (gesture.type === 'ink') {
      if (gesture.snap) {
        onCommit({
          kind: gesture.snap.kind, a: gesture.snap.a, b: gesture.snap.b,
          color: gesture.style.color, size: gesture.style.size,
        });
      } else if (gesture.pts.length >= 1) {
        const raw = gesture.style.straightLine && gesture.pts.length > 1
          ? [gesture.pts[0], gesture.pts[gesture.pts.length - 1]]
          : gesture.pts;
        const pts = gesture.style.straightLine
          ? raw
          : simplifyGesturePoints(raw, gesture.style.size, rectRef.current.w, gesture.style.kind);
        onCommit({
          kind: gesture.style.kind,
          pts,
          color: gesture.style.color,
          size: gesture.style.size,
          ...(gesture.style.kind === 'pen'
            ? { style: gesture.style.penStyle, stabilization: gesture.style.stabilization }
            : { highlighterStyle: gesture.style.highlighterStyle }),
        } as InkMark);
      }
      return true;
    }
    if (gesture.type === 'eraseStroke') {
      if (gesture.removed.size > 0) onSetMarks(marksRef.current.filter((_, index) => !gesture.removed.has(index)));
      return true;
    }
    if (gesture.type === 'erasePartial') {
      if (gesture.changed) onSetMarks(gesture.working);
      return true;
    }
    return false;
  }, [onCommit, onSetMarks]);

  // ── Pointeurs ───────────────────────────────────────────────────────────────
  /**
   * Clôt la session de pointeur en cours et RETOURNE le geste à valider. Appelée
   * au lever (`pointerup`/`pointercancel`) mais aussi quand le lever n'est
   * signalé que par une pression nulle : `pointerIdRef` doit revenir à `null`
   * dans TOUS les cas, sans quoi la fenêtre de présence du stylet ne peut plus
   * expirer et le rejet de paume reste verrouillé.
   */
  const finishPointerSession = useCallback((e: React.PointerEvent): Gesture | undefined => {
    if (pointerIdRef.current === null || e.pointerId !== pointerIdRef.current) return undefined;
    clearHold();
    strokeFilterRef.current = null;
    hoverRef.current = null;
    if (isPenPointer(e)) {
      // Après le lever, le stylet reste « présent » (survol inter-traits) : le
      // tactile demeure rejeté jusqu'à expiration de la fenêtre de présence.
      notePenPresence();
    } else {
      surfaceRef.current?.removeAttribute('data-pen-active');
      surfaceRef.current?.removeAttribute('data-pen-mode');
    }
    const g = gestureRef.current;
    gestureRef.current = null;
    pointerIdRef.current = null;
    gestureTransformRef.current = null;
    try {
      const target = e.target as Element;
      if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture?.(e.pointerId);
    } catch { /* ignore */ }
    return g;
  }, [clearHold, notePenPresence]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      // Rejet de paume : tant qu'un stylet est présent (contact, survol ou
      // fenêtre de grâce), tout contact tactile est ignoré.
      if (pointerIdRef.current !== null || performance.now() - lastPenAtRef.current < PEN_PRESENCE_MS) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.pointerType === 'mouse' && performance.now() - lastPenAtRef.current < 700) return;
    e.preventDefault();
    if (isPenPointer(e)) {
      notePenPresence(hasPenEraserButton(e) ? 'eraser' : 'ink');
      trackAirButton(e);
    }
    /**
     * Reprise d'un geste laissé en l'air par un CHANGEMENT D'IDENTITÉ du stylet.
     * Sur One UI, l'appui du bouton latéral en pleine écriture reclasse le stylet
     * en `eraser` : Chromium y voit un autre périphérique, alloue un nouveau
     * `pointerId` et le trait en cours n'aura jamais son `pointerup`. Sans cette
     * clôture, l'encre déjà tracée était simplement écrasée — le mot en cours
     * disparaissait à l'instant où l'on appuyait pour gommer.
     */
    const orphan = pointerIdRef.current !== null && pointerIdRef.current !== e.pointerId
      ? gestureRef.current
      : null;
    if (orphan) {
      clearHold();
      strokeFilterRef.current = null;
      gestureRef.current = null;
      commitTransientGesture(orphan);
    }
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pointerIdRef.current = e.pointerId;
    const t = inputT(true);
    gestureTransformRef.current = t;
    const p = fromScreen(t, e.clientX, e.clientY);
    const current = propsRef.current;
    const { tool: selectedTool } = current;
    const barrelButton = hasPenEraserButton(e);
    // Appui du bouton pendant le survol : attendre le contact de la pointe.
    if (isPenPointer(e) && barrelButton && !hasPenTipContact(e)) {
      hoverRef.current = { point: p, pressure: calibratePressure(e, current.pressureCurve, false), tool: 'eraser' };
      scheduleDraw();
      return;
    }
    hoverRef.current = null;
    const tl: AnnotationTool = barrelButton ? 'eraser' : selectedTool;

    if (tl === 'lasso') {
      if (hitDeleteHandle(e.clientX, e.clientY)) {
        const sel = selectionRef.current;
        selectionRef.current = [];
        onSetMarks(marksRef.current.filter((_, i) => !sel.includes(i)));
        gestureRef.current = null;
        scheduleDraw();
        return;
      }
      const resizeHandle = hitResizeHandle(e.clientX, e.clientY);
      const resizeSource = resizeHandle ? marksBBox(marksRef.current, selectionRef.current) : null;
      if (resizeHandle && resizeSource) {
        gestureRef.current = {
          type: 'resize', source: resizeSource, handle: resizeHandle, current: p,
          selection: [...selectionRef.current],
        };
        scheduleDraw();
        return;
      }
      const sel = selectionRef.current;
      const bb = sel.length ? marksBBox(marksRef.current, sel) : null;
      const inside = bb && p[0] >= bb.minX && p[0] <= bb.maxX && p[1] >= bb.minY && p[1] <= bb.maxY;
      if (inside) {
        gestureRef.current = { type: 'move', start: p, delta: [0, 0], selection: [...sel] };
      } else {
        // Une image se saisit AU CLIC, sans avoir à l'entourer au lasso : on
        // cherche la plus haute (dernière posée) sous le point. Entourer une
        // photo qui occupe toute la zone était sinon impossible — il n'y avait
        // pas de place autour d'elle pour tracer la boucle.
        const hit = topmostImageAt(p);
        if (hit >= 0) {
          selectionRef.current = [hit];
          gestureRef.current = { type: 'move', start: p, delta: [0, 0], selection: [hit] };
        } else {
          selectionRef.current = [];
          gestureRef.current = { type: 'lasso', poly: [p] };
        }
      }
    } else if (tl === 'eraser') {
      beginEraserGesture(e, t, p, barrelButton);
    } else if (isShapeKind(tl)) {
      const regular = current.regularShapes !== e.shiftKey;
      gestureRef.current = {
        type: 'shape', kind: tl, a: snapPoint(p, snapCfg()), b: p,
        regular, regularPreference: current.regularShapes, color: current.color, size: current.size,
      };
    } else {
      beginInkGesture(e, p, tl === 'highlighter' ? 'highlighter' : 'pen');
    }
    scheduleDraw();
  }, [
    beginEraserGesture, beginInkGesture, clearHold, commitTransientGesture, inputT,
    hitDeleteHandle, hitResizeHandle,
    onSetMarks, scheduleDraw, snapCfg, notePenPresence, trackAirButton, topmostImageAt,
  ]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    let g = gestureRef.current;
    if (g && e.pointerId !== pointerIdRef.current) return;
    const penTipContact = hasPenTipContact(e);
    const penButtonEraser = hasPenEraserButton(e);
    const isPen = isPenPointer(e);
    if (isPen) {
      notePenPresence(penButtonEraser ? 'eraser' : 'ink');
      trackAirButton(e); // suit les fronts du bouton (garde interne sur le contact)
    }

    // Les boutons du stylet sont « chorded » : leur transition arrive souvent
    // dans pointermove, sans pointerdown/pointerup supplémentaire.
    if (
      g && isPen && penTipContact && penButtonEraser
      && g.type !== 'eraseStroke' && g.type !== 'erasePartial'
    ) {
      clearHold();
      gestureRef.current = null;
      // Un trait d'encre commencé est conservé ; une figure/lasso en cours est annulé.
      if (g.type === 'ink') commitTransientGesture(g);
      const transform = gestureTransformRef.current || inputT();
      const point = fromScreen(transform, e.clientX, e.clientY);
      beginEraserGesture(e, transform, point, true);
      g = gestureRef.current;
    } else if (
      g && isPen && penTipContact && !penButtonEraser
      && (g.type === 'eraseStroke' || g.type === 'erasePartial')
      && propsRef.current.tool !== 'eraser'
    ) {
      gestureRef.current = null;
      commitTransientGesture(g);
      const selectedTool = propsRef.current.tool;
      if (selectedTool === 'pen' || selectedTool === 'highlighter') {
        const transform = gestureTransformRef.current || inputT();
        const point = fromScreen(transform, e.clientX, e.clientY);
        beginInkGesture(e, point, selectedTool);
      }
      g = gestureRef.current;
    } else if (
      g && isPen && !penTipContact
      && (g.type === 'ink' || g.type === 'eraseStroke' || g.type === 'erasePartial')
    ) {
      // Le lever de pointe se signale parfois par un `pointermove` à pression
      // nulle, sans `pointerup` derrière (stylet rangé en cours de tracé, sortie
      // de portée du digitiseur). On clôt donc la SESSION entière, pas seulement
      // le geste : ne vider que `gestureRef` laissait `pointerIdRef` armé, donc
      // `data-pen-active` figé et le doigt privé de défilement sur la zone
      // jusqu'au prochain contact du stylet.
      const lifted = finishPointerSession(e);
      if (lifted) commitTransientGesture(lifted);
      g = null;
    }

    if (!g) {
      if (isPen && penTipContact) {
        if (pointerIdRef.current === null) {
          try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
          pointerIdRef.current = e.pointerId;
          gestureTransformRef.current = inputT(true);
        }
        const transform = gestureTransformRef.current || inputT();
        const point = fromScreen(transform, e.clientX, e.clientY);
        if (penButtonEraser) beginEraserGesture(e, transform, point, true);
        else {
          const selectedTool = propsRef.current.tool;
          if (selectedTool === 'pen' || selectedTool === 'highlighter') beginInkGesture(e, point, selectedTool);
        }
        hoverRef.current = null;
        scheduleDraw();
        return;
      }
      if (isPen) {
        const t = inputT();
        hoverRef.current = {
          point: fromScreen(t, e.clientX, e.clientY),
          pressure: calibratePressure(
            e, propsRef.current.pressureCurve,
            propsRef.current.tool === 'pen' && propsRef.current.penStyle === 'pencil',
          ),
          ...(penButtonEraser ? { tool: 'eraser' as const } : {}),
        };
        scheduleDraw();
      }
      return;
    }
    const t = gestureTransformRef.current || inputT();
    hoverRef.current = null;
    const native = e.nativeEvent as PointerEvent;
    const coalesced = native.getCoalescedEvents?.() || [];
    const events = coalesced.length ? coalesced : [native];
    const lastEvent = events[events.length - 1];
    if (g.type === 'ink') {
      const smoother = strokeFilterRef.current;
      const dyn = strokeDynRef.current;
      const isPencil = g.style.kind === 'pen' && g.style.penStyle === 'pencil';
      for (const ce of events) {
        const rawPressure = calibratePressure(ce, g.style.pressureCurve, isPencil);
        // Lissage One Euro adaptatif (px écran) : anti-tremblement à basse
        // vitesse, réactif à haute vitesse. La pression est débruitée aussi.
        const [fx, fy, fp] = smoother
          ? smoother.next(ce.clientX, ce.clientY, rawPressure, ce.timeStamp)
          : [ce.clientX, ce.clientY, rawPressure];
        // Vitesse instantanée lissée (px/ms), estimée sur l'entrée brute.
        const sdt = Math.max(1, ce.timeStamp - dyn.t);
        const inst = Math.hypot(ce.clientX - dyn.x, ce.clientY - dyn.y) / sdt;
        dyn.speed = dyn.speed * 0.6 + inst * 0.4;
        dyn.x = ce.clientX; dyn.y = ce.clientY; dyn.t = ce.timeStamp;
        const point = fromScreen(t, fx, fy);
        const last = g.pts[g.pts.length - 1];
        if (last) {
          const distPx = Math.hypot(point[0] - last[0], point[1] - last[1]) * t.w;
          // Espacement dense à basse vitesse (précision), clairsemé à haute
          // vitesse (trait plus lisse, moins de calcul). Filtre déjà débruité →
          // un plancher fin suffit au repos. Plafond bas (1,75 px) : on garde plus
          // de points en écriture rapide → détail fidèle des lettres, moins de
          // rondeur imposée (l'ancien 3,2 px lissait trop le tracé au S Pen).
          const spacing = Math.min(1.75, 0.25 + dyn.speed * 0.9);
          if (distPx < spacing) continue;
        }
        g.pts.push([point[0], point[1], fp]);
      }
      // Pas de prédiction (getPredictedEvents) : elle extrapolait la trajectoire
      // du S Pen et allongeait l'aperçu DEVANT la pointe, d'où la sensation de
      // trait « guidé/tiré » propre à la tablette. On suit strictement la pointe.
      // Le mouvement annule un éventuel snap et relance le minuteur de maintien.
      g.snap = null;
      clearHold();
      if (g.style.recognizeShapes) {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null;
          const cur = gestureRef.current;
          if (cur?.type === 'ink') {
            const rec = recognizeShape(cur.pts);
            if (rec) {
              const sn = snapShape(rec.kind, rec.a, rec.b, false, snapCfg());
              cur.snap = { kind: rec.kind, a: sn.a, b: sn.b };
              scheduleDraw();
            }
          }
        }, HOLD_MS);
      }
    } else if (g.type === 'shape') {
      g.b = fromScreen(t, lastEvent.clientX, lastEvent.clientY);
      g.regular = g.regularPreference !== e.shiftKey;
    } else if (g.type === 'eraseStroke') {
      for (const sample of events) {
        const r = eraserRadius(t, calibratePressure(sample, g.style.pressureCurve, false), g.style);
        const point = fromScreen(t, sample.clientX, sample.clientY);
        marksRef.current.forEach((m, i) => {
          if ((!g.style.highlighterOnly || m.kind === 'highlighter') && markHit(m, point[0], point[1], r)) {
            g.removed.add(i);
          }
        });
      }
    } else if (g.type === 'erasePartial') {
      for (const sample of events) {
        const r = eraserRadius(t, calibratePressure(sample, g.style.pressureCurve, false), g.style);
        const point = fromScreen(t, sample.clientX, sample.clientY);
        const res = erasePartialAt(g.working, point[0], point[1], r, g.style.highlighterOnly);
        g.working = res.marks;
        if (res.changed) g.changed = true;
      }
    } else if (g.type === 'lasso') {
      for (const sample of events) {
        const point = fromScreen(t, sample.clientX, sample.clientY);
        const last = g.poly[g.poly.length - 1];
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) * t.w >= 0.8) g.poly.push(point);
      }
    } else if (g.type === 'move') {
      const point = fromScreen(t, lastEvent.clientX, lastEvent.clientY);
      g.delta = [point[0] - g.start[0], point[1] - g.start[1]];
    } else if (g.type === 'resize') {
      g.current = fromScreen(t, lastEvent.clientX, lastEvent.clientY);
    }
    scheduleDraw();
  }, [
    beginEraserGesture, beginInkGesture, clearHold, commitTransientGesture,
    finishPointerSession, inputT, snapCfg, scheduleDraw, notePenPresence, trackAirButton,
  ]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    trackAirButton(e); // relâchement en l'air = clic → bascule stylo/gomme
    const g = finishPointerSession(e);
    if (!g) return;
    if (g.type === 'ink') {
      if (g.snap) {
        // Reconnaissance de forme validée au relâchement.
        onCommit({ kind: g.snap.kind, a: g.snap.a, b: g.snap.b, color: g.style.color, size: g.style.size });
      } else if (g.pts.length >= 1) {
        const raw = g.style.straightLine && g.pts.length > 1
          ? [g.pts[0], g.pts[g.pts.length - 1]]
          : g.pts;
        const pts = g.style.straightLine
          ? raw
          : simplifyGesturePoints(raw, g.style.size, rectRef.current.w, g.style.kind);
        onCommit({
          kind: g.style.kind,
          pts,
          color: g.style.color,
          size: g.style.size,
          ...(g.style.kind === 'pen'
            ? { style: g.style.penStyle, stabilization: g.style.stabilization }
            : { highlighterStyle: g.style.highlighterStyle }),
        } as InkMark);
      }
    } else if (g.type === 'shape') {
      if (Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) > 0.01) {
        const sn = snapShape(g.kind, g.a, g.b, g.regular, snapCfg());
        onCommit({ kind: g.kind, a: sn.a, b: sn.b, color: g.color, size: g.size });
      }
    } else if (g.type === 'eraseStroke') {
      if (g.removed.size > 0) onSetMarks(marksRef.current.filter((_, i) => !g.removed.has(i)));
    } else if (g.type === 'erasePartial') {
      if (g.changed) onSetMarks(g.working);
    } else if (g.type === 'lasso') {
      selectionRef.current = marksInLasso(marksRef.current, g.poly);
    } else if (g.type === 'move') {
      if (Math.hypot(g.delta[0], g.delta[1]) > 0.0001) {
        const selected = new Set(g.selection);
        onSetMarks(marksRef.current.map((m, i) => (
          selected.has(i) ? translateMark(m, g.delta[0], g.delta[1]) : m
        )));
      }
    } else if (g.type === 'resize') {
      const target = resizeTargetBBox(g.source, g.handle, g.current, selectionRatioLock());
      const selected = new Set(g.selection);
      onSetMarks(marksRef.current.map((m, i) => (
        selected.has(i) ? scaleMarkToBBox(m, g.source, target) : m
      )));
    }
    scheduleDraw();
  }, [finishPointerSession, onCommit, onSetMarks, snapCfg, scheduleDraw, trackAirButton, selectionRatioLock]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    trackAirButton(e);
    const g = finishPointerSession(e);
    if (g === undefined) return;
    /**
     * Samsung Internet annule le flux de pointeur quand l'appui du bouton latéral
     * est requalifié en clic secondaire : jeter le geste effaçait le mot en cours
     * d'écriture. On valide donc ce qui est déjà tracé — `commitTransientGesture`
     * ne connaît que l'encre et les gommes, les gestes à aperçu (figure, lasso,
     * déplacement) restent abandonnés, ce qui est le comportement voulu.
     */
    if (g) commitTransientGesture(g);
    scheduleDraw();
  }, [finishPointerSession, commitTransientGesture, scheduleDraw, trackAirButton]);

  const clearHover = useCallback(() => {
    if (!gestureRef.current && hoverRef.current) {
      hoverRef.current = null;
      scheduleDraw();
    }
  }, [scheduleDraw]);

  const cursor = tool === 'eraser' ? 'cell' : tool === 'lasso' ? 'default' : 'crosshair';

  return (
    <div ref={surfaceRef} className="boxnote-surface" data-bg={surface} style={{ cursor }}>
      <canvas
        ref={canvasRef}
        className="boxnote-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onPointerEnter={invalidateInputTransform}
        onPointerLeave={clearHover}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
};

export default React.memo(BoxNoteCanvas);
