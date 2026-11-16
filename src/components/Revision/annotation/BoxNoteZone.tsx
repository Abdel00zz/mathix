import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus, ArrowUpRight, Square, Circle,
  Trash2, Rows3, Grid3x3, Check,
  Grip, Box, Triangle, Diamond, Pentagon, Hexagon,
  Crosshair, Ruler, MoveDiagonal2, Waves, ChevronUp, EllipsisVertical, Heart,
  ImagePlus,
} from 'lucide-react';
import {
  AnnotationTool, HighlighterStyle, fitImageBox, isShapeKind, PenStyle,
  PressureCurve, ShapeKind, SurfaceStyle,
  PALETTE_SLOTS, addColor, isHexColor, normalizeColor, replaceColor, touchColor,
} from './core';
import { ImageImportError, importImageFile } from './core/imageImport';
import { lazyWithRetry } from '../../../utils/lazyWithRetry';
import { canvasImageStore } from '../../../utils/canvasImageStore';
import { annotationsStore, ToolPrefs } from '../../../utils/annotationsStore';
import { useAnnotationEngine } from './useAnnotationEngine';
import MenuDisclosure from './ui/MenuDisclosure';
import { useProfessorAccess } from '../../../hooks/useProfessorAccess';

// Le canvas (et perfect-freehand) n'est chargé qu'à la première ouverture.
const BoxNoteCanvas = lazyWithRetry(() => import('./BoxNoteCanvas'));

interface Props {
  noteKey: string;
}

/** Groupes qui possèdent une palette propre (la gomme et le lasso n'en ont pas). */
type PaletteGroup = 'pen' | 'hl' | 'shape';

const groupOf = (tool: AnnotationTool): PaletteGroup | 'none' =>
  tool === 'highlighter' ? 'hl' : isShapeKind(tool) ? 'shape' : tool === 'pen' ? 'pen' : 'none';

/** Champs de préférences derrière chaque palette : couleur active + emplacements. */
const PALETTE_FIELDS: Record<PaletteGroup, {
  palette: 'penPalette' | 'highlighterPalette' | 'shapePalette';
  color: 'penColor' | 'highlighterColor' | 'shapeColor';
  label: string;
}> = {
  pen: { palette: 'penPalette', color: 'penColor', label: 'Couleur du stylo' },
  hl: { palette: 'highlighterPalette', color: 'highlighterColor', label: 'Couleur du surligneur' },
  shape: { palette: 'shapePalette', color: 'shapeColor', label: 'Couleur des figures' },
};

type ShapeOption = {
  v: ShapeKind;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  hint: string;
};
const SHAPE_GROUPS: { title: string; items: ShapeOption[] }[] = [
  {
    title: 'Lignes & repères',
    items: [
      { v: 'line', icon: Minus, label: 'Ligne', hint: 'Segment libre' },
      { v: 'arrow', icon: ArrowUpRight, label: 'Flèche', hint: 'Vecteur' },
      { v: 'angle', icon: Ruler, label: 'Angle', hint: 'Deux demi-droites' },
      { v: 'axes', icon: Crosshair, label: 'Repère', hint: 'Axes x et y' },
    ],
  },
  {
    title: 'Figures usuelles',
    items: [
      { v: 'rect', icon: Square, label: 'Rectangle', hint: 'Carré avec Maj' },
      { v: 'ellipse', icon: Circle, label: 'Ellipse', hint: 'Cercle avec Maj' },
      { v: 'triangle', icon: Triangle, label: 'Triangle', hint: 'Isocèle' },
      { v: 'rightTriangle', icon: Triangle, label: 'Triangle rectangle', hint: 'Angle droit' },
    ],
  },
  {
    title: 'Polygones',
    items: [
      { v: 'diamond', icon: Diamond, label: 'Losange', hint: 'Diagonales centrées' },
      { v: 'parallelogram', icon: MoveDiagonal2, label: 'Parallélogramme', hint: 'Côtés parallèles' },
      { v: 'pentagon', icon: Pentagon, label: 'Pentagone', hint: '5 côtés' },
      { v: 'hexagon', icon: Hexagon, label: 'Hexagone', hint: '6 côtés' },
    ],
  },
];
const SHAPE_MENU = SHAPE_GROUPS.flatMap((group) => group.items);

const CANVAS_ICON_ROOT = '/assets/canvas-icons';
const CANVAS_TOOL_2D_ROOT = '/assets/canvas-tools-2d';
const CANVAS_REFERENCE_2D_ROOT = '/assets/canvas-reference-2d';

const CANVAS_ICONS = {
  penBallpoint: `${CANVAS_ICON_ROOT}/pen-ballpoint.png`,
  penFountain: `${CANVAS_ICON_ROOT}/pen-fountain.png`,
  penMarker: `${CANVAS_ICON_ROOT}/pen-marker.png`,
  penPencil: `${CANVAS_ICON_ROOT}/pen-pencil.png`,
  highlighterChisel: `${CANVAS_ICON_ROOT}/highlighter-chisel.png`,
  highlighterRound: `${CANVAS_ICON_ROOT}/highlighter-round.png`,
  shapes: `${CANVAS_ICON_ROOT}/shapes.png`,
  eraser: `${CANVAS_ICON_ROOT}/eraser.png`,
  lasso: `${CANVAS_ICON_ROOT}/lasso.png`,
  settings: `${CANVAS_ICON_ROOT}/settings.png`,
  undo: `${CANVAS_ICON_ROOT}/undo.png`,
  redo: `${CANVAS_ICON_ROOT}/redo.png`,
} as const;

const CANVAS_PEN_IMAGES = {
  ballpoint: `${CANVAS_TOOL_2D_ROOT}/pen-ballpoint-complete.png`,
  fountain: `${CANVAS_TOOL_2D_ROOT}/pen-fountain.png`,
  marker: `${CANVAS_TOOL_2D_ROOT}/pen-marker-soft-modern.png`,
  pencil: `${CANVAS_TOOL_2D_ROOT}/pen-pencil-coherent.png`,
} as const;

const CANVAS_REFERENCE_ICONS = {
  highlighterChisel: `${CANVAS_REFERENCE_2D_ROOT}/highlight-chisel.png`,
  highlighterRound: `${CANVAS_REFERENCE_2D_ROOT}/highlight-round.png`,
  highlighterChiselToolbarBase: `${CANVAS_REFERENCE_2D_ROOT}/highlight-chisel-toolbar-base-neutral.png`,
  highlighterChiselToolbarMask: `${CANVAS_REFERENCE_2D_ROOT}/highlight-chisel-toolbar-mask.png`,
  highlighterRoundToolbarBase: `${CANVAS_REFERENCE_2D_ROOT}/highlight-round-toolbar-base-neutral.png`,
  highlighterRoundToolbarMask: `${CANVAS_REFERENCE_2D_ROOT}/highlight-round-toolbar-mask.png`,
  toolbarPen: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-pen-sketch.png`,
  toolbarHighlighter: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-highlighter-sketch.png`,
  toolbarEraser: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-eraser-retina.png`,
  toolbarLasso: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-lasso-retina.png`,
} as const;

const PngToolIcon: React.FC<{
  src: string;
  size?: number;
  color?: string;
  className?: string;
}> = ({ src, size = 22, color, className = '' }) => (
  <span
    className={`boxnote-png-icon ${className}`}
    style={{
      width: size,
      height: size,
      color,
      '--icon-mask': `url("${src}")`,
    } as React.CSSProperties}
    aria-hidden="true"
  />
);

const ToolbarPngIcon: React.FC<{
  src: string;
  color?: string;
  className?: string;
}> = ({ src, color, className = '' }) => (
  <span className="boxnote-toolbar-glyph">
    <PngToolIcon src={src} size={20} color={color} className={className} />
  </span>
);

const ToolbarReferenceIcon: React.FC<{ src: string; className?: string }> = ({
  src,
  className = '',
}) => (
  <span className={`boxnote-toolbar-reference-icon ${className}`} aria-hidden="true">
    <img src={src} alt="" draggable={false} />
  </span>
);

const ToolbarHighlighterIcon: React.FC<{
  base: string;
  mask: string;
  color: string;
  className?: string;
}> = ({ base, mask, color, className = '' }) => (
  <span
    className={`boxnote-toolbar-reference-icon boxnote-toolbar-highlighter-icon ${className}`}
    style={{
      '--highlighter-ink': color,
      '--highlighter-mask': `url("${mask}")`,
    } as React.CSSProperties}
    aria-hidden="true"
  >
    <img src={base} alt="" draggable={false} />
    <i className="boxnote-toolbar-highlighter-ink" />
  </span>
);

const ToolbarLineIcon: React.FC<{
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = ({ icon: Icon }) => (
  <span className="boxnote-toolbar-glyph boxnote-toolbar-line-icon" aria-hidden="true">
    <Icon size={22} strokeWidth={2.05} />
  </span>
);

/** Appui long (ms) sur une pastille → ouverture du sélecteur de couleur. */
const SWATCH_EDIT_HOLD_MS = 480;

/**
 * Ouvre le sélecteur natif d'un `input[type=color]`. `showPicker()` est la voie
 * officielle ; `click()` reste le repli pour les navigateurs qui ne l'exposent
 * pas encore. Les deux exigent une activation utilisateur, encore valide pendant
 * l'appui long (l'activation « transitoire » dure quelques secondes).
 */
const openColorPicker = (input: HTMLInputElement | null): void => {
  if (!input) return;
  try {
    input.showPicker();
  } catch {
    input.click();
  }
};

/**
 * Une pastille de la palette. Un appui bref SÉLECTIONNE, un appui long (ou un
 * clic droit, ou Alt+Entrée au clavier) OUVRE l'éditeur pour réaffecter cet
 * emplacement. Deux gestes sur une même cible, sans bouton supplémentaire : à
 * 44 px la place manque pour afficher une icône d'édition par couleur.
 */
const ColorSwatch: React.FC<{
  color: string;
  index: number;
  active: boolean;
  onSelect: (color: string) => void;
  onEdit: (index: number, color: string) => void;
}> = ({ color, index, active, onSelect, onEdit }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un appui long a déjà ouvert l'éditeur : le `click` qui suit le relâchement
  // ne doit pas, en plus, sélectionner la couleur.
  const editedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }, []);
  useEffect(() => clearHold, [clearHold]);

  const beginHold = useCallback(() => {
    editedRef.current = false;
    clearHold();
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      editedRef.current = true;
      navigator.vibrate?.(12);
      openColorPicker(inputRef.current);
    }, SWATCH_EDIT_HOLD_MS);
  }, [clearHold]);

  return (
    <span className="boxnote-swatch-slot">
      <button
        type="button"
        className={`boxnote-swatch ${active ? 'is-active' : ''}`}
        style={{ background: color }}
        onPointerDown={beginHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onClick={() => { if (!editedRef.current) onSelect(color); }}
        onContextMenu={(event) => { event.preventDefault(); openColorPicker(inputRef.current); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.altKey) {
            event.preventDefault();
            openColorPicker(inputRef.current);
          }
        }}
        aria-label={`Couleur ${color}`}
        aria-pressed={active}
        title={`${color} — appui long pour modifier`}
      />
      <input
        ref={inputRef}
        className="boxnote-swatch-picker"
        type="color"
        value={color}
        onChange={(event) => onEdit(index, event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
};

/**
 * Palette d'un outil : au plus `PALETTE_SLOTS` pastilles + le bouton d'ajout.
 * La liste ne s'allonge jamais — c'est ce qui garantit que la rangée reste dans
 * le cadre de la zone, y compris avec des cibles tactiles de 44 px.
 */
const ColorPalette: React.FC<{
  colors: string[];
  value: string;
  onSelect: (color: string) => void;
  onAdd: (color: string) => void;
  onEdit: (index: number, color: string) => void;
  label: string;
}> = React.memo(({ colors, value, onSelect, onAdd, onEdit, label }) => {
  const active = normalizeColor(value);
  const full = colors.length >= PALETTE_SLOTS;
  const pickerValue = isHexColor(value) ? normalizeColor(value) : '#1f4e63';
  return (
    <div className="boxnote-compact-colors" role="group" aria-label={label}>
      {colors.map((color, index) => (
        <ColorSwatch
          key={`${index}-${color}`}
          color={color}
          index={index}
          active={active === color}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
      <label
        className="boxnote-add-color"
        title={full
          ? 'Ajouter une couleur — remplace la moins utilisée'
          : 'Ajouter une couleur'}
      >
        <span aria-hidden="true">+</span>
        <input
          type="color"
          value={pickerValue}
          onChange={(event) => onAdd(event.target.value)}
          aria-label="Ajouter une couleur à la palette"
        />
      </label>
    </div>
  );
});

const PEN_STYLES: { v: PenStyle; src: string; image: string; label: string; title: string; hint: string }[] = [
  { v: 'ballpoint', src: CANVAS_ICONS.penBallpoint, image: CANVAS_PEN_IMAGES.ballpoint, label: 'Bille', title: 'Stylo à bille', hint: 'Trait régulier' },
  { v: 'fountain', src: CANVAS_ICONS.penFountain, image: CANVAS_PEN_IMAGES.fountain, label: 'Plume', title: 'Stylo plume', hint: 'Effilé, calligraphique' },
  { v: 'marker', src: CANVAS_ICONS.penMarker, image: CANVAS_PEN_IMAGES.marker, label: 'Feutre', title: 'Feutre', hint: 'Pointe ronde · encre dense' },
  { v: 'pencil', src: CANVAS_ICONS.penPencil, image: CANVAS_PEN_IMAGES.pencil, label: 'Crayon', title: 'Crayon', hint: 'Fin et léger' },
];
const HIGHLIGHTER_STYLES: {
  v: HighlighterStyle;
  src: string;
  image: string;
  toolbarBase: string;
  toolbarMask: string;
  label: string;
}[] = [
  {
    v: 'chisel',
    src: CANVAS_ICONS.highlighterChisel,
    image: CANVAS_REFERENCE_ICONS.highlighterChisel,
    toolbarBase: CANVAS_REFERENCE_ICONS.highlighterChiselToolbarBase,
    toolbarMask: CANVAS_REFERENCE_ICONS.highlighterChiselToolbarMask,
    label: 'Biseau',
  },
  {
    v: 'round',
    src: CANVAS_ICONS.highlighterRound,
    image: CANVAS_REFERENCE_ICONS.highlighterRound,
    toolbarBase: CANVAS_REFERENCE_ICONS.highlighterRoundToolbarBase,
    toolbarMask: CANVAS_REFERENCE_ICONS.highlighterRoundToolbarMask,
    label: 'Rond',
  },
];
const PRESSURE_CURVES: { v: PressureCurve; label: string }[] = [
  { v: 'soft', label: 'Douce' },
  { v: 'balanced', label: 'Équilibrée' },
  { v: 'firm', label: 'Ferme' },
];
const ERASER_SIZES = [12, 20, 32];
const SURFACES: { v: SurfaceStyle; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string }[] = [
  { v: 'blank', icon: Square, label: 'Blanc' },
  { v: 'ruled', icon: Rows3, label: 'Lignes' },
  { v: 'grid', icon: Grid3x3, label: 'Quadrillage' },
  { v: 'dots', icon: Grip, label: 'Points' },
  { v: 'isometric', icon: Box, label: 'Isométrique' },
];

const HEIGHT_KEY = 'mathplus:boxnote-h:v1';
const DEFAULT_HEIGHT = 180;
const MIN_HEIGHT = 130;
const MAX_HEIGHT = 620;

const loadHeight = (noteKey: string): number => {
  try {
    const all = JSON.parse(localStorage.getItem(HEIGHT_KEY) || '{}');
    return typeof all?.[noteKey] === 'number' ? all[noteKey] : DEFAULT_HEIGHT;
  } catch { return DEFAULT_HEIGHT; }
};
const saveHeight = (noteKey: string, h: number): void => {
  try {
    const all = JSON.parse(localStorage.getItem(HEIGHT_KEY) || '{}');
    all[noteKey] = h;
    localStorage.setItem(HEIGHT_KEY, JSON.stringify(all));
  } catch { /* silencieux */ }
};

const BoxNoteZoneInner: React.FC<Props> = ({ noteKey }) => {
  const [open, setOpen] = useState(false);
  const hasContent = annotationsStore.has(noteKey);

  return open ? (
    <BoxNoteZoneOpen noteKey={noteKey} onClose={() => setOpen(false)} />
  ) : (
    <div className="boxnote-trigger-row">
      <button
        type="button"
        className={`boxnote-dots ${hasContent ? 'is-filled' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={hasContent ? 'Ouvrir la note manuscrite' : 'Ajouter une note manuscrite'}
        title={hasContent ? 'Ouvrir la note manuscrite' : 'Ajouter une note manuscrite'}
      >
        <div className="boxnote-trigger-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </button>
    </div>
  );
};

const BoxNoteZone: React.FC<Props> = (props) => {
  const professorAccess = useProfessorAccess();
  return professorAccess ? <BoxNoteZoneInner {...props} /> : null;
};

type MenuId = 'pen' | 'highlighter' | 'eraser' | 'shapes' | 'more' | null;
/** Sections repliables du menu « options » (accordéon, une seule ouverte). */
type MoreSectionId = 'stylus' | 'guides' | 'surface' | null;

const BoxNoteZoneOpen: React.FC<{ noteKey: string; onClose: () => void }> = ({ noteKey, onClose }) => {
  const engine = useAnnotationEngine(noteKey);
  const [prefs, setPrefs] = useState<ToolPrefs>(() => annotationsStore.getPrefs());
  const [tool, setTool] = useState<AnnotationTool>(() => (
    prefs.favoriteHighlighter ? 'highlighter' : 'pen'
  ));
  const [lastShape, setLastShape] = useState<ShapeKind>('line');
  const [height, setHeight] = useState<number>(() => loadHeight(noteKey));
  const [menu, setMenu] = useState<MenuId>(null);
  // Accordéon du menu « options » : une seule section ouverte à la fois, sinon
  // le panneau redevient aussi long qu'avant. Re-cliquer referme.
  const [section, setSection] = useState<MoreSectionId>('stylus');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  // Dernier outil non-gomme, restauré au clic suivant du bouton S Pen.
  const prevToolRef = useRef<AnnotationTool>('pen');

  // Clic du bouton S Pen (en l'air) : bascule gomme ↔ outil précédent.
  const toggleEraser = useCallback(() => {
    setTool((current) => {
      if (current === 'eraser') return prevToolRef.current;
      prevToolRef.current = current;
      return 'eraser';
    });
    setMenu(null);
  }, []);

  const group = groupOf(tool);
  const color = group === 'hl' ? prefs.highlighterColor : group === 'shape' ? prefs.shapeColor : prefs.penColor;
  const size = group === 'hl' ? prefs.highlighterSize : group === 'shape' ? prefs.shapeSize : prefs.penSize;
  const pressureCurve: PressureCurve = prefs.pressureCurve || 'balanced';
  const penStabilization = Number.isFinite(prefs.penStabilization) ? prefs.penStabilization : 0.35;

  const updatePrefs = useCallback((
    patch: Partial<ToolPrefs> | ((prev: ToolPrefs) => Partial<ToolPrefs>),
  ) => {
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      annotationsStore.setPrefs(next);
      return next;
    });
  }, []);

  /*
   * Contrôleur de palette d'un groupe d'outil : les pastilles à afficher et les
   * trois gestes (choisir, ajouter, modifier un emplacement).
   *
   * Les mutations passent par la forme FONCTIONNELLE de `updatePrefs` : le
   * sélecteur natif émet un événement par nuance survolée, et lire `prefs` du
   * rendu courant ferait travailler ces rafales sur un état périmé. Palette,
   * couleur active et historique de récence sont écrits d'un seul patch, donc
   * jamais désynchronisés.
   */
  const paletteFor = useCallback((group: PaletteGroup) => {
    const field = PALETTE_FIELDS[group];
    const patchColor = (prev: ToolPrefs, color: string) => ({
      [field.color]: normalizeColor(color),
      colorRecency: touchColor(prev.colorRecency, color),
    } as Partial<ToolPrefs>);
    return {
      colors: prefs[field.palette],
      value: prefs[field.color],
      label: field.label,
      onSelect: (color: string) => updatePrefs((prev) => patchColor(prev, color)),
      onAdd: (color: string) => updatePrefs((prev) => ({
        [field.palette]: addColor(prev[field.palette], color, prev.colorRecency, prev[field.color]),
        ...patchColor(prev, color),
      } as Partial<ToolPrefs>)),
      // Modifier une pastille rend sa nouvelle teinte active : on vient de la
      // choisir dans un sélecteur, la faire suivre au trait est le geste attendu.
      onEdit: (index: number, color: string) => updatePrefs((prev) => ({
        [field.palette]: replaceColor(prev[field.palette], index, color),
        ...patchColor(prev, color),
      } as Partial<ToolPrefs>)),
    };
  }, [prefs, updatePrefs]);

  const penPalette = useMemo(() => paletteFor('pen'), [paletteFor]);
  const highlighterPalette = useMemo(() => paletteFor('hl'), [paletteFor]);

  /*
   * Palette de l'outil ACTIF, exposée dans la barre plutôt que dans chaque
   * popup. Changer de couleur était auparavant un aller-retour : ouvrir le menu
   * de l'outil, choisir, refermer — trois gestes pour un réglage qu'on modifie
   * sans arrêt en prenant des notes.
   *
   * La barre suit l'outil : stylo, surligneur et figures ont chacun leur palette
   * et leur couleur mémorisées, donc un surligneur jaune et un stylo bleu
   * coexistent. La gomme et le lasso ne peignent rien : la palette disparaît au
   * lieu d'afficher un réglage sans effet.
   */
  const activeColor = useMemo(() => {
    const group = groupOf(tool);
    return group === 'none' ? null : paletteFor(group);
  }, [tool, paletteFor]);

  // Ferme les menus au clic extérieur / Échap.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Redimensionnement vertical.
  const resizeRef = useRef<{ pointerId: number; y: number; h: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = { pointerId: e.pointerId, y: e.clientY, h: height };
    setResizing(true);
  }, [height]);
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      if (!resizeRef.current || e.pointerId !== resizeRef.current.pointerId) return;
      const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.h + (e.clientY - resizeRef.current.y)));
      setHeight(h);
    };
    const finishResize = () => {
      resizeRef.current = null;
      setResizing(false);
      setHeight((h) => { saveHeight(noteKey, h); return h; });
    };
    const onUp = (e: PointerEvent) => {
      if (!resizeRef.current || e.pointerId !== resizeRef.current.pointerId) return;
      finishResize();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', finishResize);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', finishResize);
    };
  }, [resizing, noteKey]);

  const close = useCallback(() => { annotationsStore.flush(); onClose(); }, [onClose]);

  // Clic outil : sélectionne ; re-clic sur l'outil actif (pen/eraser) ouvre son menu.
  const clickTool = (t: AnnotationTool, hasMenu: MenuId) => {
    if (tool === t && hasMenu) setMenu((m) => (m === hasMenu ? null : hasMenu));
    else { setTool(t); setMenu(null); }
  };

  const activePenStyle = PEN_STYLES.find((s) => s.v === prefs.penStyle) || PEN_STYLES[0];
  const activeHighlighterStyle = HIGHLIGHTER_STYLES.find((s) => s.v === prefs.highlighterStyle) || HIGHLIGHTER_STYLES[0];
  const currentShape = isShapeKind(tool) ? tool : lastShape;
  const activeShape = SHAPE_MENU.find((s) => s.v === currentShape) || SHAPE_MENU[0];
  const activeSurface = SURFACES.find((s) => s.v === prefs.surface) || SURFACES[0];
  const toggleSection = useCallback(
    (id: string) => setSection((current) => (current === id ? null : (id as MoreSectionId))),
    [],
  );

  /**
   * Import d'image : normalisation → stockage LOCAL (IndexedDB) → pose.
   * La marque ne reçoit qu'une référence ; aucun binaire ne transite par
   * localStorage, dont le quota est réservé aux traits manuscrits.
   */
  const handleImportFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const imported = await importImageFile(file);
      const ref = await canvasImageStore.put({
        blob: imported.blob,
        width: imported.width,
        height: imported.height,
        ratio: imported.ratio,
        bytes: imported.bytes,
      });
      if (!ref) {
        throw new ImageImportError(
          "Stockage local indisponible (navigation privée ?). Image non enregistrée.",
        );
      }
      // Hauteur de la zone en unités normalisées (= fraction de sa LARGEUR).
      // Mesurée au moment de la pose : la zone est redimensionnable, une
      // constante donnerait un cadrage faux dès le premier glissement.
      const rect = canvasBoxRef.current?.getBoundingClientRect();
      const zoneHeightNorm = rect && rect.width > 0 ? rect.height / rect.width : 0.5;
      const box = fitImageBox(imported.ratio, zoneHeightNorm);
      engine.commit({
        kind: 'image',
        a: [box.minX, box.minY],
        b: [box.maxX, box.maxY],
        ref,
        ratio: imported.ratio,
      });
      setMenu(null);
      // Le lasso est le seul outil qui permet de déplacer/retailler l'image :
      // y basculer évite de chercher pourquoi « rien ne bouge » après l'import.
      setTool('lasso');
    } catch (error) {
      setImportError(
        error instanceof ImageImportError
          ? error.message
          : "Import impossible. Réessaie avec un autre fichier.",
      );
    } finally {
      setImporting(false);
    }
  }, [engine]);
  // Résumés affichés dans l'en-tête replié : on lit le réglage sans déplier.
  const stylusSummary = useMemo(() => {
    const curve = PRESSURE_CURVES.find((c) => c.v === pressureCurve)?.label ?? '';
    return `${curve} · ${Math.round(penStabilization * 100)}%`;
  }, [pressureCurve, penStabilization]);
  const guidesSummary = useMemo(() => {
    const flags = [
      prefs.smartSnap, prefs.snapGrid, prefs.angleSnap,
      prefs.regularShapes, prefs.showMeasurements, prefs.sketchyShapes,
    ];
    return `${flags.filter(Boolean).length} / ${flags.length}`;
  }, [
    prefs.smartSnap, prefs.snapGrid, prefs.angleSnap,
    prefs.regularShapes, prefs.showMeasurements, prefs.sketchyShapes,
  ]);
  return (
    <div className="boxnote">
      <div className="boxnote-panel">

        <div className="boxnote-toolbar" role="toolbar" aria-label="Outils de dessin" ref={toolbarRef}>
          {/* Actions historique (gauche) */}
          <div className="boxnote-group boxnote-toolbar-start">
            <button type="button" className="boxnote-tool boxnote-tool--utility" onClick={engine.undo} disabled={!engine.canUndo} title="Annuler" aria-label="Annuler">
              <ToolbarPngIcon src={CANVAS_ICONS.undo} />
            </button>
            <button type="button" className="boxnote-tool boxnote-tool--utility" onClick={engine.redo} disabled={!engine.canRedo} title="Rétablir" aria-label="Rétablir">
              <ToolbarPngIcon src={CANVAS_ICONS.redo} />
            </button>
            <span className="boxnote-sep" />
          </div>

          <div className="boxnote-group boxnote-toolbar-center">
            {/* Outils de dessin centrés */}
            <div className="boxnote-group boxnote-pill">
            {/* Stylo (split : sélection + menu de style) */}
            <div className="boxnote-split boxnote-tool-slot is-pen">
              <button
                type="button"
                className={`boxnote-tool boxnote-tool--ink boxnote-tool--pen ${tool === 'pen' ? 'is-active' : ''}`}
                style={{ '--tool-color': prefs.penColor } as React.CSSProperties}
                onClick={() => clickTool('pen', 'pen')}
                title={`Stylo — ${activePenStyle.label}`}
                aria-label={`Stylo ${activePenStyle.label}`}
                aria-pressed={tool === 'pen'}
                aria-haspopup="dialog"
                aria-expanded={menu === 'pen'}
              >
                <ToolbarReferenceIcon
                  src={activePenStyle.image}
                  className={`is-style-preview is-${activePenStyle.v}`}
                />
              </button>
              {menu === 'pen' && (
                <div
                  className="boxnote-menu boxnote-ink-menu boxnote-pen-menu"
                  style={{ '--menu-accent': prefs.penColor } as React.CSSProperties}
                  role="dialog"
                  aria-label="Réglages du stylo"
                >
                  <div className="boxnote-pen-title">{activePenStyle.title}</div>
                  <div className="boxnote-range-row">
                    <span className="boxnote-range-dot" style={{ width: Math.max(5, prefs.penSize * 2), height: Math.max(5, prefs.penSize * 2), background: prefs.penColor }} />
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={prefs.penSize}
                      onChange={(e) => updatePrefs({ penSize: Number(e.target.value) })}
                      aria-label="Épaisseur du stylo"
                    />
                    <output>{prefs.penSize.toFixed(1)}</output>
                  </div>
                  <div className="boxnote-pen-grid" role="radiogroup" aria-label="Style du stylo">
                    {PEN_STYLES.map(({ v, image, label }) => (
                      <button
                        key={v}
                        type="button"
                        className={`boxnote-pen-card is-${v} ${prefs.penStyle === v ? 'is-active' : ''}`}
                        onClick={() => { updatePrefs({ penStyle: v }); setTool('pen'); }}
                        role="radio"
                        aria-checked={prefs.penStyle === v}
                        title={label}
                      >
                        <span className="boxnote-pen-image-frame" aria-hidden="true">
                          <img className="boxnote-pen-image" src={image} alt="" draggable="false" />
                        </span>
                        <small>{label}</small>
                        {prefs.penStyle === v && <Check className="boxnote-tool-check" size={13} strokeWidth={2.8} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                  <div className="boxnote-pen-color-section">
                    <span className="boxnote-pen-color-label">Couleur du trait</span>
                    <ColorPalette {...penPalette} label="Couleur du trait du stylo" />
                  </div>
                  <button
                    type="button"
                    className={`boxnote-switch-row boxnote-recognition-row ${prefs.shapeRecognition ? 'is-active' : ''}`}
                    onClick={() => updatePrefs({ shapeRecognition: !prefs.shapeRecognition })}
                    role="switch"
                    aria-checked={prefs.shapeRecognition}
                    title="Maintenir le stylet sur le tracé pour le convertir"
                  >
                    <span className="boxnote-setting-copy">
                      <strong>Maintenir pour convertir en forme</strong>
                    </span>
                    <i aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            <div className="boxnote-split boxnote-tool-slot is-highlighter">
              <button
                type="button"
                className={`boxnote-tool boxnote-tool--ink boxnote-tool--highlighter ${tool === 'highlighter' ? 'is-active' : ''}`}
                style={{ '--tool-color': prefs.highlighterColor } as React.CSSProperties}
                onClick={() => clickTool('highlighter', 'highlighter')}
                title={`Surligneur — ${activeHighlighterStyle.label}`}
                aria-label={`Surligneur ${activeHighlighterStyle.label}`}
                aria-pressed={tool === 'highlighter'}
                aria-haspopup="dialog"
                aria-expanded={menu === 'highlighter'}
              >
                <ToolbarHighlighterIcon
                  base={activeHighlighterStyle.toolbarBase}
                  mask={activeHighlighterStyle.toolbarMask}
                  color={prefs.highlighterColor}
                  className={`is-style-preview is-highlighter-preview is-${activeHighlighterStyle.v}`}
                />
              </button>
              {menu === 'highlighter' && (
                <div
                  className="boxnote-menu boxnote-ink-menu boxnote-highlighter-menu"
                  style={{ '--menu-accent': prefs.highlighterColor } as React.CSSProperties}
                  role="dialog"
                  aria-label="Réglages du surligneur"
                >
                  <div className="boxnote-range-row boxnote-highlighter-range">
                    <span className="boxnote-range-dot boxnote-range-highlighter" style={{ width: Math.max(8, prefs.highlighterSize), background: prefs.highlighterColor }} />
                    <input
                      type="range"
                      min="8"
                      max="34"
                      step="1"
                      value={prefs.highlighterSize}
                      onChange={(e) => updatePrefs({ highlighterSize: Number(e.target.value) })}
                      aria-label="Épaisseur du surligneur"
                    />
                    <button
                      type="button"
                      className={`boxnote-favorite-button ${prefs.favoriteHighlighter ? 'is-active' : ''}`}
                      onClick={() => updatePrefs({ favoriteHighlighter: !prefs.favoriteHighlighter })}
                      aria-label={prefs.favoriteHighlighter ? 'Ne plus utiliser le surligneur par défaut' : 'Utiliser le surligneur par défaut'}
                      aria-pressed={prefs.favoriteHighlighter}
                      title="Outil par défaut à l’ouverture"
                    >
                      <Heart size={17} strokeWidth={2.3} fill={prefs.favoriteHighlighter ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="boxnote-highlighter-grid" role="radiogroup" aria-label="Pointe du surligneur">
                    {HIGHLIGHTER_STYLES.map(({ v, image, label }) => (
                      <button
                        key={v}
                        type="button"
                        className={`boxnote-highlighter-card ${prefs.highlighterStyle === v ? 'is-active' : ''}`}
                        onClick={() => { updatePrefs({ highlighterStyle: v }); setTool('highlighter'); }}
                        role="radio"
                        aria-checked={prefs.highlighterStyle === v}
                        title={label}
                      >
                        <span className="boxnote-highlighter-icon">
                          <img src={image} alt="" draggable="false" />
                        </span>
                        <small>{label}</small>
                        {prefs.highlighterStyle === v && <Check className="boxnote-tool-check" size={13} strokeWidth={2.8} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                  <ColorPalette {...highlighterPalette} label="Couleurs du surligneur" />
                  <div className="boxnote-highlighter-options">
                    <button
                      type="button"
                      className={`boxnote-switch-row ${prefs.favoriteToolbarVisible ? 'is-active' : ''}`}
                      onClick={() => updatePrefs({ favoriteToolbarVisible: !prefs.favoriteToolbarVisible })}
                      role="switch"
                      aria-checked={prefs.favoriteToolbarVisible}
                    >
                      <span>Afficher la palette de couleurs dans la barre</span>
                      <i aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`boxnote-switch-row ${prefs.shapeRecognition ? 'is-active' : ''}`}
                      onClick={() => updatePrefs({ shapeRecognition: !prefs.shapeRecognition })}
                      role="switch"
                      aria-checked={prefs.shapeRecognition}
                    >
                      <span>Maintenir pour convertir en forme</span>
                      <i aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`boxnote-switch-row ${prefs.highlighterStraightLines ? 'is-active' : ''}`}
                      onClick={() => updatePrefs({ highlighterStraightLines: !prefs.highlighterStraightLines })}
                      role="switch"
                      aria-checked={prefs.highlighterStraightLines}
                    >
                      <span>Tracer des lignes droites</span>
                      <i aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Figures (split : dernière figure + menu de choix) */}
            <div className="boxnote-split boxnote-tool-slot is-shape">
              <button
                type="button"
                className={`boxnote-tool boxnote-tool--ink boxnote-tool--shape ${isShapeKind(tool) ? 'is-active' : ''}`}
                style={{ '--tool-color': prefs.shapeColor } as React.CSSProperties}
                onClick={() => { if (isShapeKind(tool)) setMenu((m) => (m === 'shapes' ? null : 'shapes')); else { setTool(lastShape); setMenu(null); } }}
                title={`Figure — ${activeShape.label}`}
                aria-label={`Figure ${activeShape.label}`}
                aria-pressed={isShapeKind(tool)}
                aria-haspopup="dialog"
                aria-expanded={menu === 'shapes'}
              >
                <ToolbarLineIcon icon={activeShape.icon} />
              </button>
              {menu === 'shapes' && (
                <div
                  className="boxnote-menu boxnote-shape-menu"
                  style={{ '--menu-accent': prefs.shapeColor } as React.CSSProperties}
                  role="dialog"
                  aria-label="Figures géométriques"
                >
                  <div className="boxnote-shape-title">Formes</div>
                  <div className="boxnote-shape-picker-grid" role="radiogroup" aria-label="Choix de la figure">
                    {SHAPE_MENU.map(({ v, icon: Icon, label, hint }) => (
                      <button
                        key={v}
                        type="button"
                        className={`boxnote-shape-picker-item ${tool === v ? 'is-active' : ''}`}
                        onClick={() => { setLastShape(v); setTool(v); setMenu(null); }}
                        role="radio"
                        aria-checked={tool === v}
                        aria-label={label}
                        title={`${label} — ${hint}`}
                      >
                        <Icon size={27} strokeWidth={1.9} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="boxnote-shape-color boxnote-shape-footer">
                    <div className="boxnote-range-row">
                      <span
                        className="boxnote-range-dot"
                        style={{ width: Math.max(5, prefs.shapeSize * 2), height: Math.max(5, prefs.shapeSize * 2), background: prefs.shapeColor }}
                      />
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="0.5"
                        value={prefs.shapeSize}
                        onChange={(e) => updatePrefs({ shapeSize: Number(e.target.value) })}
                        aria-label="Épaisseur des figures"
                      />
                      <output>{prefs.shapeSize.toFixed(1)}</output>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gomme (split : sélection + menu mode/taille) */}
            <div className="boxnote-split boxnote-tool-slot is-eraser">
              <button
                type="button"
                className={`boxnote-tool boxnote-tool--eraser ${tool === 'eraser' ? 'is-active' : ''}`}
                onClick={() => clickTool('eraser', 'eraser')}
                title={`Gomme — ${prefs.eraserMode === 'partial' ? 'partielle' : 'trait entier'}`}
                aria-label={`Gomme ${prefs.eraserMode === 'partial' ? 'partielle' : 'trait entier'}`}
                aria-pressed={tool === 'eraser'}
                aria-haspopup="dialog"
                aria-expanded={menu === 'eraser'}
              >
                <ToolbarReferenceIcon
                  src={CANVAS_REFERENCE_ICONS.toolbarEraser}
                  className="is-eraser-toolbar"
                />
              </button>
              {menu === 'eraser' && (
                <div
                  className="boxnote-menu boxnote-eraser-menu"
                  style={{ '--menu-accent': '#64748b' } as React.CSSProperties}
                  role="dialog"
                  aria-label="Réglages de la gomme"
                >
                  <div className="boxnote-eraser-title">Une gomme</div>
                  <div className="boxnote-eraser-sizes" role="group" aria-label="Taille de la gomme">
                    {ERASER_SIZES.map((s, index) => (
                      <button
                        key={s}
                        type="button"
                        className={!prefs.eraserAutoSize && prefs.eraserSize === s ? 'is-active' : ''}
                        onClick={() => { updatePrefs({ eraserSize: s, eraserAutoSize: false }); setTool('eraser'); }}
                        aria-label={`Gomme ${s}`}
                      >
                        <span
                          className="boxnote-eraser-size-dot"
                          style={{ '--eraser-preview-size': `${18 + index * 11}px` } as React.CSSProperties}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`boxnote-eraser-auto ${prefs.eraserAutoSize ? 'is-active' : ''}`}
                      onClick={() => { updatePrefs({ eraserAutoSize: true }); setTool('eraser'); }}
                      aria-label="Taille automatique selon la pression"
                    >
                      <span className="boxnote-eraser-auto-dot" aria-hidden="true">AUTO</span>
                    </button>
                  </div>
                  <div className="boxnote-eraser-options">
                  <button
                    type="button"
                    className={`boxnote-switch-row boxnote-eraser-option ${prefs.eraserMode === 'stroke' ? 'is-active' : ''}`}
                    onClick={() => updatePrefs({ eraserMode: prefs.eraserMode === 'stroke' ? 'partial' : 'stroke' })}
                    role="switch"
                    aria-checked={prefs.eraserMode === 'stroke'}
                  >
                    <span>Effacer tout le trait</span>
                    <i aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`boxnote-switch-row boxnote-eraser-option ${prefs.eraserHighlighterOnly ? 'is-active' : ''}`}
                    onClick={() => updatePrefs({ eraserHighlighterOnly: !prefs.eraserHighlighterOnly })}
                    role="switch"
                    aria-checked={prefs.eraserHighlighterOnly}
                  >
                    <span>Effacer le surligneur uniquement</span>
                    <i aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="boxnote-clear-zone"
                    onClick={engine.clear}
                    disabled={!engine.hasContent}
                  >
                    Effacer la zone
                  </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lasso — sélection / déplacement / suppression */}
            <button
              type="button"
              className={`boxnote-tool boxnote-tool--selection boxnote-tool-slot is-lasso ${tool === 'lasso' ? 'is-active' : ''}`}
              onClick={() => clickTool('lasso', null)}
              title="Lasso — sélectionner, déplacer ou supprimer"
              aria-label="Lasso de sélection"
              aria-pressed={tool === 'lasso'}
            >
              <ToolbarReferenceIcon
                src={CANVAS_REFERENCE_ICONS.toolbarLasso}
                className="is-lasso-toolbar"
              />
            </button>
            </div>
            {activeColor && prefs.favoriteToolbarVisible && (
              <>
                <span className="boxnote-sep boxnote-color-inline-sep" />
                <div
                  className="boxnote-group boxnote-color-inline"
                  style={{ '--menu-accent': activeColor.value } as React.CSSProperties}
                >
                  <ColorPalette {...activeColor} />
                </div>
              </>
            )}
          </div>

          {/* Actions droite */}
          <div className="boxnote-group boxnote-actions">
            <div className="boxnote-split">
              <button
                type="button"
                className={`boxnote-tool boxnote-tool--utility boxnote-more-button ${menu === 'more' ? 'is-active' : ''}`}
                onClick={() => setMenu((m) => (m === 'more' ? null : 'more'))}
                title="Plus d’options"
                aria-haspopup="dialog"
                aria-expanded={menu === 'more'}
                aria-label="Plus d’options du canvas"
              >
                <EllipsisVertical
                  className="boxnote-more-ellipsis"
                  size={19}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
              {menu === 'more' && (
                <div className="boxnote-menu boxnote-menu-right boxnote-more-menu" role="dialog" aria-label="Options du canvas">
                  <MenuDisclosure
                    sectionId="stylus"
                    icon={<Waves size={14} />}
                    title="Réglages du stylet"
                    summary={stylusSummary}
                    open={section === 'stylus'}
                    onToggle={toggleSection}
                  >
                    <div className="boxnote-spen-controls">
                      <div className="boxnote-pressure-curves" aria-label="Courbe de pression S Pen">
                        {PRESSURE_CURVES.map(({ v, label }) => (
                          <button
                            key={v}
                            type="button"
                            className={`is-${v} ${pressureCurve === v ? 'is-active' : ''}`}
                            onClick={() => updatePrefs({ pressureCurve: v })}
                            aria-pressed={pressureCurve === v}
                            title={`Pression ${label.toLowerCase()}`}
                          >
                            <small>{label}</small>
                          </button>
                        ))}
                      </div>
                      <div className="boxnote-stabilization-row">
                        <Waves size={15} aria-hidden="true" />
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={penStabilization}
                          onChange={(e) => updatePrefs({ penStabilization: Number(e.target.value) })}
                          aria-label="Stabilisation S Pen"
                        />
                        <output>{Math.round(penStabilization * 100)}%</output>
                      </div>
                    </div>
                  </MenuDisclosure>

                  <MenuDisclosure
                    sectionId="guides"
                    icon={<Crosshair size={14} />}
                    title="Guides de dessin"
                    summary={guidesSummary}
                    open={section === 'guides'}
                    onToggle={toggleSection}
                  >
                    <div className="boxnote-guide-grid">
                      <button type="button" className={prefs.smartSnap ? 'is-active' : ''} onClick={() => updatePrefs({ smartSnap: !prefs.smartSnap })} role="switch" aria-checked={prefs.smartSnap} title="Points magnétiques">
                        <span>Accrochage</span><i aria-hidden="true" />
                      </button>
                      <button type="button" className={prefs.snapGrid ? 'is-active' : ''} onClick={() => updatePrefs({ snapGrid: !prefs.snapGrid })} role="switch" aria-checked={prefs.snapGrid} title="Grille magnétique">
                        <span>Grille magnétique</span><i aria-hidden="true" />
                      </button>
                      <button type="button" className={prefs.angleSnap ? 'is-active' : ''} onClick={() => updatePrefs({ angleSnap: !prefs.angleSnap })} role="switch" aria-checked={prefs.angleSnap} title="Angles contraints">
                        <span>Angles fixes</span><i aria-hidden="true" />
                      </button>
                      <button type="button" className={prefs.regularShapes ? 'is-active' : ''} onClick={() => updatePrefs({ regularShapes: !prefs.regularShapes })} role="switch" aria-checked={prefs.regularShapes} title="Figures régulières">
                        <span>Formes régulières</span><i aria-hidden="true" />
                      </button>
                      <button type="button" className={prefs.showMeasurements ? 'is-active' : ''} onClick={() => updatePrefs({ showMeasurements: !prefs.showMeasurements })} role="switch" aria-checked={prefs.showMeasurements} title="Mesures en centimètres">
                        <span>Mesures en cm</span><i aria-hidden="true" />
                      </button>
                      <button type="button" className={prefs.sketchyShapes ? 'is-active' : ''} onClick={() => updatePrefs({ sketchyShapes: !prefs.sketchyShapes })} role="switch" aria-checked={prefs.sketchyShapes} title="Figures tracées à main levée">
                        <span>Tracé main levée</span><i aria-hidden="true" />
                      </button>
                    </div>
                    {prefs.angleSnap && (
                      <div className="boxnote-angle-steps" aria-label="Pas d’angle">
                        {([15, 30, 45] as const).map((step) => (
                          <button
                            key={step}
                            type="button"
                            className={prefs.angleStep === step ? 'is-active' : ''}
                            onClick={() => updatePrefs({ angleStep: step })}
                            aria-pressed={prefs.angleStep === step}
                          >
                            {step}°
                          </button>
                        ))}
                      </div>
                    )}
                  </MenuDisclosure>

                  <MenuDisclosure
                    sectionId="surface"
                    icon={<Rows3 size={14} />}
                    title="Fond de la zone"
                    summary={activeSurface.label}
                    open={section === 'surface'}
                    onToggle={toggleSection}
                  >
                    <div className="boxnote-surface-grid" role="radiogroup" aria-label="Fond de la zone">
                      {SURFACES.map(({ v, icon: Icon, label }) => (
                        <button
                          key={v}
                          type="button"
                          className={prefs.surface === v ? 'is-active' : ''}
                          onClick={() => updatePrefs({ surface: v })}
                          role="radio"
                          aria-checked={prefs.surface === v}
                          title={label}
                        >
                          <Icon size={18} strokeWidth={1.9} />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </MenuDisclosure>

                  <button
                    type="button"
                    className="boxnote-more-import"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    <ImagePlus size={14} strokeWidth={1.9} aria-hidden="true" />
                    <span>{importing ? 'Import en cours…' : 'Importer une image'}</span>
                  </button>
                  {importError && (
                    <p className="boxnote-import-error" role="alert">{importError}</p>
                  )}

                  <button
                    type="button"
                    className="boxnote-more-clear"
                    onClick={() => { engine.clear(); setMenu(null); }}
                    disabled={!engine.hasContent}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Effacer tout</span>
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="boxnote-close" onClick={close} title="Fermer" aria-label="Fermer la zone de dessin">
              <span className="boxnote-toolbar-glyph" aria-hidden="true">
                <ChevronUp size={20} strokeWidth={2.2} />
              </span>
            </button>
          </div>
        </div>


        {/* Sélecteur natif : `accept` filtre l'UI, mais la validation qui fait
            foi est le sniffing des octets d'en-tête côté importImageFile. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // ré-importer le même fichier doit re-déclencher
            void handleImportFile(file);
          }}
        />

        <div style={{ height }} ref={canvasBoxRef}>
          <Suspense fallback={<div className="boxnote-loading" style={{ height }} />}>
            <BoxNoteCanvas
              marks={engine.marks}
              tool={tool}
              color={color}
              size={size}
              penStyle={prefs.penStyle}
              highlighterStyle={prefs.highlighterStyle}
              highlighterStraightLines={prefs.highlighterStraightLines}
              pressureCurve={pressureCurve}
              penStabilization={penStabilization}
              eraserMode={prefs.eraserMode}
              eraserSize={prefs.eraserSize}
              eraserAutoSize={prefs.eraserAutoSize}
              eraserHighlighterOnly={prefs.eraserHighlighterOnly}
              surface={prefs.surface}
              snapGrid={prefs.snapGrid}
              angleSnap={prefs.angleSnap}
              angleStep={prefs.angleStep}
              smartSnap={prefs.smartSnap}
              regularShapes={prefs.regularShapes}
              showMeasurements={prefs.showMeasurements}
              shapeRecognition={prefs.shapeRecognition}
              sketchyShapes={prefs.sketchyShapes}
              onCommit={engine.commit}
              onSetMarks={engine.setMarks}
              onToggleEraser={toggleEraser}
            />
          </Suspense>
        </div>

        <div className="boxnote-resize" onPointerDown={onResizeStart} role="separator" aria-orientation="horizontal" aria-label="Redimensionner la zone" title="Glisser pour redimensionner">
          <span />
        </div>
      </div>
    </div>
  );
};

export default React.memo(BoxNoteZone);
