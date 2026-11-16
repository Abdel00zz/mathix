/**
 * Modèle de données du calque manuscrit — cœur du domaine.
 *
 * Coordonnées NORMALISÉES en fraction de la LARGEUR du contenu (0→1) : le
 * dessin reste aligné et responsive quels que soient le DPR et la largeur de
 * rendu.
 *
 * Aucune dépendance DOM, React ou stockage. Le rendu, la saisie et la
 * persistance dépendent de cette couche — jamais l'inverse.
 */

/** Point normalisé [x, y]. */
export type Point = [number, number];

/** Point d'encre normalisé [x, y, pression]. */
export type InkPoint = [number, number, number];

/** Boîte englobante, en coordonnées normalisées. */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type InkKind = 'pen' | 'highlighter';

const SHAPE_KINDS = [
  'line',
  'arrow',
  'rect',
  'ellipse',
  'triangle',
  'rightTriangle',
  'diamond',
  'parallelogram',
  'pentagon',
  'hexagon',
  'angle',
  'axes',
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'lasso' | ShapeKind;

const SHAPE_KIND_SET = new Set<string>(SHAPE_KINDS);
const REGULAR_SHAPE_KIND_SET = new Set<string>([
  'rect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon',
]);

export const isShapeKind = (tool: AnnotationTool): tool is ShapeKind => SHAPE_KIND_SET.has(tool);
export const isRegularShapeKind = (kind: ShapeKind): boolean => REGULAR_SHAPE_KIND_SET.has(kind);

/** Styles de plume — changent le rendu du trait (perfect-freehand + alpha). */
export type PenStyle = 'ballpoint' | 'fountain' | 'marker' | 'pencil';
export type HighlighterStyle = 'chisel' | 'round';
export type PressureCurve = 'soft' | 'balanced' | 'firm';
export type EraserMode = 'stroke' | 'partial';
export type SurfaceStyle = 'blank' | 'ruled' | 'grid' | 'dots' | 'isometric';

export interface InkMark {
  id?: string;
  kind: InkKind;
  pts: InkPoint[];
  color: string;
  /** Épaisseur en px (constante, indépendante de la largeur). */
  size: number;
  /** Style de plume (uniquement pour kind === 'pen'). */
  style?: PenStyle;
  /** Forme de pointe (uniquement pour kind === 'highlighter'). */
  highlighterStyle?: HighlighterStyle;
  /** Stabilisation du trait au moment de sa création (0 → libre, 1 → maximale). */
  stabilization?: number;
}

export interface ShapeMark {
  id?: string;
  kind: ShapeKind;
  a: Point;
  b: Point;
  color: string;
  size: number;
}

/**
 * Image importée (PNG/JPG/SVG rastérisé), posée dans la zone.
 *
 * `a`/`b` sont les coins opposés, comme `ShapeMark` : boîte englobante,
 * translation, lasso et redimensionnement fonctionnent sans cas particulier.
 *
 * Le binaire n'est JAMAIS dans la marque : `ref` pointe une entrée IndexedDB
 * locale. Une image en base64 dans le mark saturerait le quota localStorage
 * (~5 Mo) et ferait perdre silencieusement les annotations manuscrites.
 */
export interface ImageMark {
  id?: string;
  kind: 'image';
  a: Point;
  b: Point;
  /** Clé de l'entrée IndexedDB locale (jamais une URL distante). */
  ref: string;
  /**
   * Rapport largeur/hauteur natif, figé à l'import. Sert de VÉRITÉ pour la
   * proportionnalité : le redimensionnement s'y contraint, donc l'image ne se
   * déforme jamais, même après plusieurs poignées tirées de travers.
   */
  ratio: number;
  /** Opacité 0→1 (permet de poser un calque de référence sous le tracé). */
  opacity?: number;
}

export type Mark = InkMark | ShapeMark | ImageMark;

export const isInkMark = (m: Mark): m is InkMark => m.kind === 'pen' || m.kind === 'highlighter';
export const isImageMark = (m: Mark): m is ImageMark => m.kind === 'image';
