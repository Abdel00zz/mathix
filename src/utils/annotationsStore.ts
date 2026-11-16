/**
 * Annotations Store — MathPlus (calque manuscrit plein-document, type Samsung Notes)
 *
 * Sous-système de persistance ISOLÉ, parallèle à `progress`/`storageService`.
 * Les annotations n'entrent JAMAIS dans `ChapterProgress` : slice localStorage
 * dédiée, non poussée vers le cloud (branchement cloud possible plus tard en
 * last-write-wins par clé de document).
 *
 * Modèle de données (v2) : une fiche = un `DocDrawing` composé de « marks ».
 * Coordonnées normalisées en fraction de la LARGEUR du contenu (0→1) → le
 * dessin reste aligné et responsive quel que soit le DPR / la largeur.
 */

// Le modèle de données du calque manuscrit vit dans le domaine (annotation/core).
// Ce module ne gère QUE la persistance : marques par fiche + préférences d'outil.
// Les consommateurs importent les types du domaine depuis `annotation/core`.
import type {
  EraserMode, HighlighterStyle, Mark, PenStyle, PressureCurve, SurfaceStyle,
} from '../components/Revision/annotation/core/types';
import {
  PALETTE_SLOTS, RECENCY_DEPTH, sanitizeColors,
} from '../components/Revision/annotation/core/palette';

const ANNOTATIONS_KEY = 'mathplus:annotations:v2';
const PREFS_KEY = 'mathplus:pen-prefs:v2';
const PERSIST_DEBOUNCE = 1200;
const PREFS_PERSIST_DEBOUNCE = 240;

export interface DocDrawing {
  marks: Mark[];
  updatedAt: number;
  v: 2;
}

export interface ToolPrefs {
  /**
   * Palettes éditables — 5 emplacements par groupe d'outil, ordre d'affichage
   * stable. Chaque groupe a la sienne : un surligneur jaune et un stylo bleu
   * coexistent sans se marcher dessus. Voir `annotation/core/palette`.
   */
  penPalette: string[];
  highlighterPalette: string[];
  shapePalette: string[];
  /**
   * Historique de récence des couleurs, tous outils confondus. N'influence PAS
   * l'affichage : il sert uniquement à choisir l'emplacement à réaffecter quand
   * une palette pleine reçoit une nouvelle teinte.
   */
  colorRecency: string[];
  penColor: string;
  penSize: number;
  penStyle: PenStyle;
  pressureCurve: PressureCurve;
  penStabilization: number;
  highlighterColor: string;
  highlighterSize: number;
  highlighterStyle: HighlighterStyle;
  /** Épingle les couleurs rapides de l'outil actif dans la barre Canvas. */
  favoriteToolbarVisible: boolean;
  /** Mémorise le surligneur comme outil favori. */
  favoriteHighlighter: boolean;
  /** Convertit chaque geste du surligneur en segment droit. */
  highlighterStraightLines: boolean;
  shapeColor: string;
  shapeSize: number;
  eraserMode: EraserMode;
  eraserSize: number;
  /** Module le diamètre de la gomme avec la pression du S Pen. */
  eraserAutoSize: boolean;
  /** Limite la gomme aux marques de surligneur. */
  eraserHighlighterOnly: boolean;
  surface: SurfaceStyle;
  /** Aimantation des figures aux intersections de la grille (aide géométrie). */
  snapGrid: boolean;
  /** Contrainte des lignes/flèches aux angles multiples de 15° (aide géométrie). */
  angleSnap: boolean;
  /** Pas angulaire utilisé par la contrainte (degrés). */
  angleStep: 15 | 30 | 45;
  /** Aimantation aux sommets, centres et milieux des figures existantes. */
  smartSnap: boolean;
  /** Force carré, cercle et polygones réguliers. */
  regularShapes: boolean;
  /** Affiche dimensions et angle pendant la construction. */
  showMeasurements: boolean;
  /** Convertit un tracé maintenu en figure géométrique parfaite. */
  shapeRecognition: boolean;
  /** Trace les figures à main levée (Rough.js) au lieu du vecteur net. */
  sketchyShapes: boolean;
}

/**
 * Palettes livrées par défaut — 5 teintes par groupe, choisies pour rester
 * lisibles sur papier blanc comme sur fond sombre. L'utilisateur les remplace
 * une par une (appui long sur une pastille), elles ne sont qu'un point de départ.
 */
const DEFAULT_PALETTES = {
  pen: ['#1f4e63', '#c0392b', '#1e824c', '#e67e22', '#2c2b29'],
  highlighter: ['#f4d03f', '#f5a623', '#ff6b61', '#9b6ef3', '#55bde8'],
  shape: ['#c0392b', '#1f4e63', '#1e824c', '#8e44ad', '#2c2b29'],
} as const;

const DEFAULT_TOOL_PREFS: ToolPrefs = {
  penPalette: [...DEFAULT_PALETTES.pen],
  highlighterPalette: [...DEFAULT_PALETTES.highlighter],
  shapePalette: [...DEFAULT_PALETTES.shape],
  colorRecency: [],
  penColor: '#1f4e63',
  penSize: 3.5,
  penStyle: 'ballpoint',
  pressureCurve: 'balanced',
  penStabilization: 0.35,
  highlighterColor: '#f4d03f',
  highlighterSize: 18,
  highlighterStyle: 'chisel',
  favoriteToolbarVisible: true,
  favoriteHighlighter: false,
  highlighterStraightLines: false,
  shapeColor: '#c0392b',
  shapeSize: 3,
  eraserMode: 'stroke',
  // Aligné sur un preset de la barre d'outils (ERASER_SIZES) pour qu'un bouton
  // de taille soit actif dès la première ouverture.
  eraserSize: 20,
  eraserAutoSize: false,
  eraserHighlighterOnly: false,
  surface: 'ruled',
  snapGrid: false,
  angleSnap: false,
  angleStep: 15,
  smartSnap: true,
  regularShapes: false,
  showMeasurements: true,
  shapeRecognition: true,
  sketchyShapes: true,
};

const hasWindow = typeof window !== 'undefined';

const requestIdle: (cb: () => void) => void =
  hasWindow && 'requestIdleCallback' in window
    ? (cb) => (window as any).requestIdleCallback(cb, { timeout: 2000 })
    : (cb) => setTimeout(cb, 1);

// ── Cache mémoire (source de vérité en session) ────────────────────────────
let cache: Record<string, DocDrawing> | null = null;
let persistTimeout: ReturnType<typeof setTimeout> | null = null;
let prefsCache: ToolPrefs | null = null;
let prefsPersistTimeout: ReturnType<typeof setTimeout> | null = null;

function load(): Record<string, DocDrawing> {
  if (cache) return cache;
  if (!hasWindow) return (cache = {});
  try {
    const raw = localStorage.getItem(ANNOTATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.warn('[Annotations] Slice corrompue — réinitialisation');
    cache = {};
  }
  return cache;
}

function schedulePersist(): void {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    requestIdle(() => {
      try {
        localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(cache || {}));
      } catch (e) {
        console.error('[Annotations] Échec de sauvegarde', e);
      }
    });
  }, PERSIST_DEBOUNCE);
}

/**
 * Résout une palette stockée. Une slice écrite par la version précédente n'a pas
 * de palette par groupe mais une liste `customColors` commune : on la reprend en
 * TÊTE des teintes par défaut (ce sont des couleurs que l'utilisateur avait
 * choisies lui-même, donc les plus pertinentes) et on tronque à 5 emplacements.
 */
function resolvePalette(stored: unknown, legacy: unknown, fallback: readonly string[]): string[] {
  const own = sanitizeColors(stored, PALETTE_SLOTS);
  if (own.length > 0) return own;
  const migrated = sanitizeColors([...sanitizeColors(legacy, PALETTE_SLOTS), ...fallback], PALETTE_SLOTS);
  return migrated.length > 0 ? migrated : [...fallback];
}

/** Copie défensive des seuls champs listes des préférences. */
const clonePaletteFields = (prefs: ToolPrefs) => ({
  penPalette: [...prefs.penPalette],
  highlighterPalette: [...prefs.highlighterPalette],
  shapePalette: [...prefs.shapePalette],
  colorRecency: [...prefs.colorRecency],
});

function loadPrefs(): ToolPrefs {
  if (prefsCache) return prefsCache;
  if (!hasWindow) return (prefsCache = { ...DEFAULT_TOOL_PREFS });
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const source: Record<string, unknown> = parsed && typeof parsed === 'object' ? parsed : {};
    const legacy = source.customColors;
    prefsCache = {
      ...DEFAULT_TOOL_PREFS,
      ...source,
      penPalette: resolvePalette(source.penPalette, legacy, DEFAULT_PALETTES.pen),
      highlighterPalette: resolvePalette(source.highlighterPalette, legacy, DEFAULT_PALETTES.highlighter),
      shapePalette: resolvePalette(source.shapePalette, legacy, DEFAULT_PALETTES.shape),
      colorRecency: sanitizeColors(source.colorRecency, RECENCY_DEPTH),
    };
    // `customColors` n'existe plus dans le schéma : ne pas le laisser traîner
    // dans le cache, il serait réécrit indéfiniment à chaque sauvegarde.
    delete (prefsCache as unknown as Record<string, unknown>).customColors;
  } catch {
    prefsCache = { ...DEFAULT_TOOL_PREFS };
  }
  return prefsCache;
}

function schedulePrefsPersist(): void {
  if (prefsPersistTimeout) clearTimeout(prefsPersistTimeout);
  prefsPersistTimeout = setTimeout(() => {
    prefsPersistTimeout = null;
    requestIdle(() => {
      if (!hasWindow || !prefsCache) return;
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache));
      } catch {
        /* silencieux */
      }
    });
  }, PREFS_PERSIST_DEBOUNCE);
}

export const annotationsStore = {
  getDrawing(key: string): DocDrawing | null {
    return load()[key] || null;
  },

  getMarks(key: string): Mark[] {
    return load()[key]?.marks || [];
  },

  /** Remplace les marks d'une fiche. Persistance différée. */
  setMarks(key: string, marks: Mark[]): void {
    const store = load();
    if (marks.length === 0) {
      if (store[key]) {
        delete store[key];
        schedulePersist();
      }
      return;
    }
    store[key] = { marks, updatedAt: Date.now(), v: 2 };
    schedulePersist();
  },

  has(key: string): boolean {
    const d = load()[key];
    return !!d && d.marks.length > 0;
  },

  /** Écrit immédiatement la slice (anti-perte si l'onglet se ferme vite). */
  flush(): void {
    if (persistTimeout) {
      clearTimeout(persistTimeout);
      persistTimeout = null;
    }
    if (prefsPersistTimeout) {
      clearTimeout(prefsPersistTimeout);
      prefsPersistTimeout = null;
    }
    if (!hasWindow) return;
    if (cache) {
      try {
        localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(cache));
      } catch (e) {
        console.error('[Annotations] Échec du flush', e);
      }
    }
    if (prefsCache) {
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefsCache));
      } catch {
        /* silencieux */
      }
    }
  },

  // ── Préférences d'outils (dernières couleurs/épaisseurs) ─────────────────
  // Les listes sont recopiées dans les deux sens : sans ça, l'état React et le
  // cache du store partageraient le même tableau, et une palette éditée serait
  // invisible pour `useState` (référence inchangée → pas de rendu).
  getPrefs(): ToolPrefs {
    const prefs = loadPrefs();
    return { ...prefs, ...clonePaletteFields(prefs) };
  },

  setPrefs(prefs: ToolPrefs): void {
    prefsCache = { ...prefs, ...clonePaletteFields(prefs) };
    schedulePrefsPersist();
  },
};
