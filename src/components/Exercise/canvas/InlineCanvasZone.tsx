import React, { useCallback, useRef, useState, useEffect } from 'react';
import { faLightbulb, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { DrawingCanvas } from './DrawingCanvas';
import type { Stroke } from './types';
import { useProfessorAccess } from '../../../hooks/useProfessorAccess';
import { useProfPersonalization } from '../../../hooks/useProfPersonalization';
import { setToolState } from './toolStore';
import { useExerciseDisplay } from '../components/exerciseDisplay';
import MathRenderer from '../../MathRenderer';
import { useI18n } from '../../../i18n/I18nContext';

const STROKES_KEY = 'mathplus:exercise-strokes:v1';
const HEIGHT_KEY = 'mathplus:exercise-zone-h:v1';
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 900;
/** Pas du quadrillage du cadre. */
const GRID_STEP = 22;

/**
 * Hauteur d'ouverture proportionnée à l'écran, arrondie à un nombre entier de
 * lignes du quadrillage : ~35 % de la hauteur visible, entre 10 et 16 lignes.
 * Galaxy Tab S7 11" (DPR 2) : 286 px en paysage (800 px de haut),
 * 352 px en portrait (1280 px de haut).
 */
function defaultHeight(): number {
  const target = typeof window === 'undefined' ? 280 : window.innerHeight * 0.35;
  const lines = Math.round(target / GRID_STEP);
  return Math.min(16, Math.max(10, lines)) * GRID_STEP;
}

/**
 * Cache des registres `localStorage`, gardé par la chaîne brute lue.
 *
 * Ce composant est monté une fois par bloc annotable : sans cache, chaque
 * montage relançait `JSON.parse` sur l'intégralité du registre (tous les traits
 * de toutes les fiches), soit plusieurs dizaines de parse au chargement d'une
 * fiche. La comparaison porte sur la chaîne brute — un `getItem` reste O(1) —
 * donc une écriture externe (autre onglet, test, restauration) est détectée et
 * le cache est reconstruit : aucune donnée périmée n'est servie.
 */
const storeCache = new Map<string, { raw: string; value: Record<string, unknown> }>();

function readStore(key: string): Record<string, unknown> {
  let raw = '{}';
  try {
    raw = localStorage.getItem(key) || '{}';
  } catch {
    /* silencieux */
  }

  const cached = storeCache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') value = parsed as Record<string, unknown>;
  } catch {
    value = {};
  }
  storeCache.set(key, { raw, value });
  return value;
}

function loadStrokes(noteKey: string): Stroke[] {
  const value = readStore(STROKES_KEY)[noteKey];
  return Array.isArray(value) ? (value as Stroke[]) : [];
}

function saveStrokes(noteKey: string, strokes: Stroke[]): void {
  try {
    const all = readStore(STROKES_KEY);
    all[noteKey] = strokes;
    localStorage.setItem(STROKES_KEY, JSON.stringify(all));
  } catch {
    /* silencieux */
  }
}

function loadHeight(noteKey: string): number {
  const value = readStore(HEIGHT_KEY)[noteKey];
  return typeof value === 'number' && value >= MIN_HEIGHT && value <= MAX_HEIGHT ? value : defaultHeight();
}

function saveHeight(noteKey: string, height: number): void {
  try {
    const all = readStore(HEIGHT_KEY);
    all[noteKey] = height;
    localStorage.setItem(HEIGHT_KEY, JSON.stringify(all));
  } catch {
    /* silencieux */
  }
}

interface InlineCanvasZoneProps {
  noteKey: string;
  hint?: string;
  hasHint?: boolean;
  isHintActive?: boolean;
  onHintToggle?: () => void;
  isOpenControlled?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Étiquette du bandeau interne. « Indice » sur une fiche d'exercice. */
  hintLabel?: string;
  /**
   * Contenu riche du panneau d'aide, à la place du rendu LaTeX de `hint`. Le quiz s'en
   * sert pour dévoiler une correction structurée (réponse attendue, choix de la
   * classe, rappel de cours) là où l'exercice n'a qu'un indice textuel.
   */
  hintContent?: React.ReactNode;
}

/**
 * Zone manuscrite et cadre de réponse unifié (style cahier de maths & LaTeX).
 * - S'ouvre à la demande via le déclencheur « ... » ou le bouton d'aide.
 * - S'ouvre par défaut réduit (200px) avec le stylo immédiatement activé.
 * - Quadrillage de maths et cadre bleu arrondi avec l'aide intégrée sous la surface manuscrite.
 */
const InlineCanvasZone: React.FC<InlineCanvasZoneProps> = ({
  noteKey,
  hint,
  hasHint = false,
  isHintActive,
  onHintToggle,
  isOpenControlled,
  onOpenChange,
  hintLabel = 'Indice',
  hintContent,
}) => {
  const { dir, t } = useI18n();
  const professorAccess = useProfessorAccess();
  const { canvas } = useProfPersonalization();
  const { compact } = useExerciseDisplay();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof isOpenControlled === 'boolean';
  const open = isControlled ? isOpenControlled : internalOpen;

  const [internalHintOpen, setInternalHintOpen] = useState(false);
  const hintOpen = typeof isHintActive === 'boolean' ? isHintActive : internalHintOpen;

  const [height, setHeight] = useState<number>(() => loadHeight(noteKey));
  const [isResizing, setIsResizing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>(() => loadStrokes(noteKey));
  const [strokeCount, setStrokeCount] = useState<number>(strokes.length);
  const resizeRef = useRef<{ y: number; h: number } | null>(null);

  const handleStrokesChange = useCallback(
    (next: Stroke[]) => {
      saveStrokes(noteKey, next);
      setStrokeCount(next.length);
    },
    [noteKey]
  );

  const openZone = useCallback(() => {
    setStrokes(loadStrokes(noteKey));
    // Activation automatique du stylo et ouverture de la barre d'outils flottante
    setToolState({ tool: 'pen', railCollapsed: false });
    if (isControlled) {
      onOpenChange?.(true);
    } else {
      setInternalOpen(true);
    }
  }, [noteKey, isControlled, onOpenChange]);

  const closeZone = useCallback(() => {
    if (isControlled) {
      onOpenChange?.(false);
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, onOpenChange]);

  const toggleHint = useCallback(() => {
    if (onHintToggle) {
      onHintToggle();
    } else {
      setInternalHintOpen(prev => !prev);
    }
    // Si la zone n'est pas encore ouverte, on l'ouvre également
    if (!open) {
      openZone();
    }
  }, [onHintToggle, open, openZone]);

  // Si un indice extérieur devient actif, s'assurer que la zone est ouverte.
  // Déféré hors du corps de l'effet : évite un setState synchrone en cascade.
  useEffect(() => {
    if (isHintActive && !open) {
      queueMicrotask(() => openZone());
    }
  }, [isHintActive, open, openZone]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { y: e.clientY, h: height };
      setIsResizing(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* non disponible */
      }
    },
    [height]
  );

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const next = Math.round(
      Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, resizeRef.current.h + (e.clientY - resizeRef.current.y)))
    );
    setHeight(next);
  }, []);

  const onResizeEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    try {
      if (e && e.currentTarget && e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* silencieux */
    }
    resizeRef.current = null;
    setIsResizing(false);
    setHeight((current) => {
      saveHeight(noteKey, current);
      return current;
    });
  }, [noteKey]);

  // ⚠️ SÉCURITÉ : Strictement réservé au mode professeur tablette
  // `compact` : présentation « tableau » — ni zone, ni déclencheur « … ».
  // Les paramètres tablette du prof peuvent couper le canvas (maître) ou
  // seulement ses boutons d'ouverture, sans effacer l'encre déjà écrite.
  if (!professorAccess || compact) return null;
  if (!canvas.enabled) return null;
  if (!open && !canvas.showTriggers) return null;

  // Nettoyage de l'indice
  const cleanHint = hint ? hint.trim() : '';

  if (!open) {
    return (
      <div className="boxnote-trigger-row print:hidden my-0 py-0" data-no-swipe>
        <button
          type="button"
          className={`boxnote-dots ${strokeCount > 0 ? 'is-filled' : ''}`}
          onClick={openZone}
          aria-label={strokeCount > 0 ? t('common.show') : t('common.exercise')}
          title={t('common.exercise')}
        >
          <div className="boxnote-trigger-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative w-full print:hidden pt-7 pb-3 mt-1 animate-in fade-in slide-in-from-top-2 duration-300"
      data-canvas-zone
      data-no-swipe
    >
      <div className="relative">
        {/* ── Onglets en haut à droite fusionnés sur la bordure supérieure (Aide + Bouton X Fermer) ── */}
        <div className={`absolute -top-[27px] ${dir === 'rtl' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'} z-30 flex items-end gap-1.5 pointer-events-auto select-none`}>
          {hasHint && (
            <button
              type="button"
              onClick={toggleHint}
              aria-label={hintOpen ? t('common.hide') : t('common.show')}
              aria-expanded={hintOpen}
              className={`relative flex items-center justify-center h-[27px] px-3.5 rounded-t-lg transition-all duration-200 ease-out typo-ui text-[0.82rem] font-bold tracking-wide ${
                hintOpen
                  ? 'bg-sky-500 text-white border-2 border-b-0 border-sky-500 shadow-sm'
                  : 'bg-white text-sky-700 hover:bg-sky-50 border-2 border-b-0 border-sky-400 shadow-sm'
              }`}
              title={hintOpen ? t('common.hide') : t('common.show')}
            >
              <span>{t('common.startCorrection')}</span>
            </button>
          )}

          {/* Bouton de fermeture 'X' moderne et respirant (fond vert émeraude frais) */}
          <button
            type="button"
            onClick={closeZone}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="relative flex items-center justify-center h-[27px] px-3 rounded-t-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white border-2 border-b-0 border-emerald-500 transition-all duration-200 ease-out shadow-sm"
          >
            <FaIcon icon={faXmark} size={15} />
          </button>
        </div>

        {/* ── Cadre principal avec bordure cyan/bleue et quadrillage mathématique ── */}
        <div
          className={`relative w-full rounded-xl sm:rounded-2xl border-2 bg-white shadow-[0_2px_12px_rgba(14,165,233,0.08)] overflow-hidden transition-[border-color,box-shadow] duration-200 ${
            isResizing
              ? 'border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.25),0_8px_24px_rgba(14,165,233,0.12)]'
              : 'border-sky-400 hover:border-sky-500/80'
          }`}
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(56, 189, 248, 0.22) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(56, 189, 248, 0.22) 1px, transparent 1px)
            `,
            backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
            backgroundColor: '#ffffff',
          }}
        >
          {/* ── Surface de dessin interactive (Canvas) ── */}
          <div className="relative w-full" style={{ height: `${height}px` }}>
            <DrawingCanvas
              height={height}
              isResizing={isResizing}
              initialStrokes={strokes}
              onStrokesChange={handleStrokesChange}
              isEditMode
            />

            {/* ── Zone de redimensionnement directe sur tout le bas du cadre (sans bouton/ligne encombrante) ── */}
            <div
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              onPointerCancel={onResizeEnd}
              onLostPointerCapture={onResizeEnd}
              role="separator"
              aria-label={t('common.exercise')}
              title={t('common.exercise')}
              className={`absolute bottom-0 inset-x-0 z-30 h-4 cursor-ns-resize touch-none select-none transition-colors ${
                isResizing ? 'bg-sky-500/20 border-b-2 border-sky-500' : 'hover:bg-sky-400/10'
              }`}
            />
          </div>

          {/* ── Aide intégrée sous la réponse : changement de matière doux, sans séparateur ── */}
          {hintOpen && (hintContent || cleanHint) && (
            <section
              className="relative z-20 overflow-visible px-3.5 pb-4 pt-3 sm:px-4 sm:pb-[18px] sm:pt-3.5 animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{
                background:
                  'radial-gradient(circle at 12% 0%, rgba(125,211,252,0.24), transparent 38%), linear-gradient(135deg, rgba(240,249,255,0.97), rgba(255,255,255,0.98) 52%, rgba(236,254,255,0.94))',
              }}
              aria-label={hintLabel}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-5 inset-x-0 h-5 bg-gradient-to-b from-transparent to-sky-50/90"
              />
              <div className="relative flex items-start gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-500 text-white shadow-[0_5px_14px_rgba(14,165,233,0.22)]">
                  <FaIcon icon={faLightbulb} size={15} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="typo-ui text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-700">
                      {hintLabel}
                    </span>
                    <button
                      type="button"
                      onClick={toggleHint}
                      className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sky-600/70 transition-colors hover:bg-white/80 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      title={t('common.close')}
                      aria-label={t('common.close')}
                    >
                      <FaIcon icon={faXmark} size={14} />
                    </button>
                  </div>
                  <div className="typo-ui text-[0.94rem] leading-relaxed text-slate-800 sm:text-[1.02rem] [&_.katex]:text-[1em]">
                    {hintContent ?? <MathRenderer content={cleanHint} fontSize="inherit" enableKeywords={false} />}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default InlineCanvasZone;
