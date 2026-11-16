import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  faChalkboard,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faPlus,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import type { Exercise } from '../../../types';
import ExerciseArticle from '../ExerciseArticle';
import { DrawingCanvas } from '../canvas/DrawingCanvas';
import type { Stroke } from '../canvas/types';
import { setActiveCanvas } from '../canvas/canvasRegistry';
import { getToolState, setToolState } from '../canvas/toolStore';
import { BACKGROUND_STYLES } from '../canvas/toolbarParts';
import { RailDockButton } from '../canvas/CanvasRailDock';
import { COMPACT_DISPLAY, ExerciseDisplayContext } from '../components/exerciseDisplay';
import { isDarkSurface, pageSurface, type PageColor, type PageStyle } from './pageSurface';
import { useI18n } from '../../../i18n/I18nContext';
import {
  EXERCISE_PAGE_ID, ZOOM_STEP, clampZoom, flushBoard, newPaperPage, readBoard, writeBoard, writePageStrokes,
  type BoardPage,
} from './boardStorage';

/** Gouttière droite : la barre d'outils et le dock gardent leur couloir. */
const GUTTER = 'right-[72px] sm:right-[86px]';
const CAPSULE = 'flex items-center gap-1 rounded-full border border-[#dedbd2] bg-[#fffefa]/95 px-1.5 py-1.5 shadow-[0_12px_36px_rgba(23,33,38,0.18)] backdrop-blur-xl';

/** Encombrement vertical de l'overlay autour de la feuille (`top-[72px]` + `bottom-3`). */
const SHEET_INSET = 84;
/** Une page vierge s'ouvre plus haute que l'écran : il y a toujours de quoi écrire sous le pli. */
const PAPER_HEIGHT_FACTOR = 1.5;
/** Marge conservée sous le trait le plus bas quand la feuille s'allonge. */
const INK_MARGIN_FACTOR = 0.5;
/** Plafond : au-delà, on ajoute une page plutôt que d'étirer indéfiniment le bitmap. */
const MAX_HEIGHT_FACTOR = 4;

/** Estimation de la hauteur de feuille, le temps que la mesure exacte arrive. */
const estimateSheetHeight = () =>
  (typeof window === 'undefined' ? 640 : Math.max(240, window.innerHeight - SHEET_INSET));

/**
 * Ordonnée du trait le plus bas d'une page, 0 si elle est vierge. Sert à faire
 * suivre la feuille : elle s'allonge quand l'écriture approche du bas.
 */
function inkBottomOf(strokes: Stroke[] | undefined): number {
  if (!strokes || strokes.length === 0) return 0;
  let bottom = 0;
  for (const stroke of strokes) {
    // Un texte est ancré à son coin haut-gauche : sa hauteur compte en plus.
    const extra = stroke.isText ? (stroke.fontSize ?? 0) : 0;
    for (const point of stroke.points) {
      const y = point.y + extra;
      if (y > bottom) bottom = y;
    }
  }
  return bottom;
}

const noop = () => { /* le tableau ne recueille aucune évaluation */ };

const BoardButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, tone = 'neutral', active, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={`canvas-rail-button grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:pointer-events-none disabled:opacity-25 ${
      active
        ? 'bg-[#dceceb] text-[#19788c]'
        : tone === 'danger'
          ? 'text-rose-500 hover:bg-rose-50'
          : 'text-[#5b676a] hover:bg-white hover:text-[#172126]'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-[#dedbd2]" />;

interface BoardOverlayProps {
  exercise: Exercise;
  index: number;
  onClose: () => void;
}

/**
 * Tableau : l'exercice en cours seul, sans zone de réponse et resserré, sur des
 * pages annotables au stylet. Le canvas est celui de la session
 * (`DrawingCanvas`) : la barre d'outils flottante — qui reste au premier plan,
 * dans sa gouttière — le pilote comme n'importe quelle zone de réponse.
 */
const BoardOverlay: React.FC<BoardOverlayProps> = ({ exercise, index, onClose }) => {
  const { dir, t } = useI18n();
  const initial = useMemo(() => readBoard(exercise.id), [exercise.id]);
  const [pages, setPages] = useState<BoardPage[]>(initial.pages);
  const [zoom, setZoom] = useState<number>(initial.zoom);
  const [activeId, setActiveId] = useState<string>(EXERCISE_PAGE_ID);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * Amorcée à une estimation plutôt qu'à 0 : à 0, le canvas n'était pas monté du
   * tout et la barre d'outils restait masquée le temps du premier rendu.
   */
  const [sheetHeight, setSheetHeight] = useState(estimateSheetHeight);
  const [statementHeight, setStatementHeight] = useState(0);
  /** Bas de l'encre de la page courante : la feuille reste plus longue que lui. */
  const [inkBottom, setInkBottom] = useState(0);

  /** Traits hors état React : rien ne doit re-rendre à chaque fin de tracé. */
  const strokesRef = useRef<Record<string, Stroke[]>>(initial.strokes);
  // Snapshot used only when a page's canvas mounts; strokes themselves remain
  // in the ref so drawing does not rerender the whole exercise board.
  const [initialCanvasStrokes, setInitialCanvasStrokes] = useState<Stroke[]>(() => initial.strokes[EXERCISE_PAGE_ID] ?? []);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);

  const pageIndex = Math.max(0, pages.findIndex(p => p.id === activeId));
  const page = pages[pageIndex] ?? pages[0];
  const canvasId = `board:${exercise.id}:${page.id}`;
  const scale = zoom / 100;

  const baseHeight = page.kind === 'exercise'
    ? Math.max(sheetHeight, Math.ceil(statementHeight * scale) + 24)
    : Math.round(sheetHeight * PAPER_HEIGHT_FACTOR);
  // La feuille suit l'écriture, sans jamais dépasser le plafond de bitmap.
  const inkFloor = inkBottom > 0 ? Math.ceil(inkBottom + sheetHeight * INK_MARGIN_FACTOR) : 0;
  const contentHeight = Math.max(baseHeight, Math.min(Math.round(sheetHeight * MAX_HEIGHT_FACTOR), inkFloor));
  const canScroll = contentHeight > sheetHeight + 4;

  // ── Persistance ───────────────────────────────────────────────────────────
  useEffect(() => {
    writeBoard(exercise.id, { pages, zoom, strokes: strokesRef.current });
  }, [exercise.id, pages, zoom]);

  // Fermeture du tableau : on ne laisse rien dans la file d'écriture.
  useEffect(() => flushBoard, []);

  const handleStrokes = useCallback((next: Stroke[]) => {
    strokesRef.current = { ...strokesRef.current, [page.id]: next };
    writePageStrokes(exercise.id, page.id, next);
    // Ne re-rend que si la feuille doit effectivement s'allonger : React court-
    // circuite la mise à jour quand la valeur est inchangée.
    const bottom = inkBottomOf(next);
    setInkBottom(current => (bottom > current ? bottom : current));
  }, [exercise.id, page.id]);

  // Les traits vivant hors de l'état React, le repère d'encre se recalcule au
  // changement de page (et se resserre si la page a été effacée entre-temps).
  useEffect(() => {
    setInkBottom(inkBottomOf(strokesRef.current[page.id]));
  }, [page.id]);

  // ── Ouverture ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Même geste que l'ouverture d'une zone de réponse : stylo armé, barre dépliée.
    setToolState({ tool: 'pen', railCollapsed: false });
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // La barre reste braquée sur la zone inline ouverte tant qu'on ne la redirige
  // pas : `registerCanvas` ne prend la main que si aucun canvas n'est actif.
  // Cet effet passe APRÈS l'inscription du canvas (les effets des enfants
  // s'exécutent d'abord) : viser dès le commit, sans attendre une frame, évite
  // que la barre pilote une seconde la zone inline restée derrière l'overlay.
  useEffect(() => {
    setActiveCanvas(canvasId);
  }, [canvasId]);

  // ── Mesures ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Repli sur l'estimation : une feuille non encore mise en page mesure 0, et
    // à 0 il n'y aurait ni canvas ni barre d'outils.
    const measure = () => setSheetHeight(sheet.clientHeight || estimateSheetHeight());
    const raf = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(raf);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => { window.cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);

  // Hauteur de l'énoncé AVANT mise à l'échelle : `offsetHeight` ignore la
  // transformation, on multiplie ensuite par le zoom.
  useEffect(() => {
    const el = statementRef.current;
    if (!el) { setStatementHeight(0); return; }
    const measure = () => setStatementHeight(el.offsetHeight);
    const raf = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(raf);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { window.cancelAnimationFrame(raf); observer.disconnect(); };
  }, [page.id, zoom, exercise.id]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const goTo = (next: number) => {
    const target = pages[Math.min(pages.length - 1, Math.max(0, next))];
    if (target) {
      setInitialCanvasStrokes(strokesRef.current[target.id] ?? []);
      setActiveId(target.id);
    }
  };

  const scrollPage = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ top: direction * Math.max(120, sheetHeight * 0.8), behavior: 'smooth' });
  };

  const addPage = (style: PageStyle) => {
    const created = newPaperPage(style);
    setPages(current => [...current, created]);
    setInitialCanvasStrokes([]);
    setActiveId(created.id);
    setMenuOpen(false);
    // Encre noire sur ardoise noire : on bascule en blanc, sauf si le prof a
    // déjà choisi une autre couleur que celle par défaut.
    if (isDarkSurface(created.color) && getToolState().color === '#0f172a') {
      setToolState({ color: '#ffffff' });
    }
  };

  const removePage = () => {
    if (page.kind !== 'paper') return;
    const fallback = pages[Math.max(0, pageIndex - 1)];
    delete strokesRef.current[page.id];
    setPages(current => current.filter(p => p.id !== page.id));
    setInitialCanvasStrokes(strokesRef.current[fallback.id] ?? []);
    setActiveId(fallback.id);
  };

  const applyStyle = (style: PageStyle) =>
    setPages(current => current.map(p => (p.id === page.id ? { ...p, style } : p)));

  const applyColor = (color: PageColor) =>
    setPages(current => current.map(p => (p.id === page.id ? { ...p, color } : p)));

  return (
    <div className="fixed inset-0 z-[60] bg-[#eef1f5] print:hidden" role="dialog" aria-modal="true" aria-label={t('common.exercise')}>
      {/* ── Commandes, en haut, dans la même gouttière que la feuille ── */}
      <div className={`absolute ${dir === 'rtl' ? 'right-3 sm:right-6' : 'left-3 sm:left-6'} top-3 z-20 flex items-start justify-between gap-2 ${GUTTER}`}>
        <div className={CAPSULE}>
          <BoardButton label={t('common.previous')} onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0}>
            <FaIcon icon={dir === 'rtl' ? faChevronRight : faChevronLeft} size={18} />
          </BoardButton>
          <span className="min-w-[42px] px-1 text-center text-[13px] font-bold tabular-nums text-[#435054]">
            {pageIndex + 1}/{pages.length}
          </span>
          <BoardButton label={t('common.next')} onClick={() => goTo(pageIndex + 1)} disabled={pageIndex >= pages.length - 1}>
            <FaIcon icon={dir === 'rtl' ? faChevronLeft : faChevronRight} size={18} />
          </BoardButton>

          {canScroll && (
            <>
              <Divider />
              <BoardButton label="Remonter" onClick={() => scrollPage(-1)}>
                <FaIcon icon={faChevronUp} size={18} />
              </BoardButton>
              <BoardButton label="Descendre" onClick={() => scrollPage(1)}>
                <FaIcon icon={faChevronDown} size={18} />
              </BoardButton>
            </>
          )}

          {page.kind === 'paper' && (
            <>
              <Divider />
              <BoardButton label="Supprimer cette page" onClick={removePage} tone="danger">
                <FaIcon icon={faTrashCan} size={17} />
              </BoardButton>
            </>
          )}
        </div>

        <div className={`relative ${CAPSULE}`}>
          {page.kind === 'exercise' && (
            <>
              <BoardButton label="Réduire l'énoncé" onClick={() => setZoom(z => clampZoom(z - ZOOM_STEP))}>
                <FaIcon icon={faMagnifyingGlassMinus} size={18} />
              </BoardButton>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title="Taille d'origine"
                className="min-w-[46px] rounded-full px-1 text-center text-[13px] font-bold tabular-nums text-[#435054] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19788c]"
              >
                {zoom}%
              </button>
              <BoardButton label="Agrandir l'énoncé" onClick={() => setZoom(z => clampZoom(z + ZOOM_STEP))}>
                <FaIcon icon={faMagnifyingGlassPlus} size={18} />
              </BoardButton>
              <Divider />
            </>
          )}

          <BoardButton label="Ajouter une page" onClick={() => setMenuOpen(v => !v)} active={menuOpen}>
            <FaIcon icon={faPlus} size={19} />
          </BoardButton>
          <Divider />
          <BoardButton label="Fermer le tableau" onClick={onClose}>
            <FaIcon icon={faXmark} size={19} />
          </BoardButton>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-[236px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <p className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Nouvelle page</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BACKGROUND_STYLES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addPage(item.id)}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 text-left text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white"
                  >
                    <span
                      aria-hidden
                      className="h-7 w-7 shrink-0 rounded-md border border-slate-300"
                      style={pageSurface(item.id, item.id === 'slate' ? 'black' : 'white')}
                    />
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Feuille ── */}
      <div className={`absolute bottom-3 left-3 top-[72px] sm:left-6 ${GUTTER}`}>
        <div
          ref={sheetRef}
          className="relative mx-auto h-full w-full max-w-[1180px] overflow-hidden rounded-2xl border border-slate-300/80 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
          style={pageSurface(page.style, page.color)}
        >
          {/* `overflow-x-hidden` explicite : sans lui, `overflow-y-auto` fait
              calculer `auto` sur l'axe X, et la colonne d'actions de l'énoncé
              (cellule de largeur nulle au contenu débordant) suffisait à faire
              apparaître une barre horizontale qui rognait 15 px de hauteur.
              L'énoncé, lui, est mis à l'échelle à largeur constante : il n'y a
              jamais de débordement horizontal légitime. */}
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain">
            <div className="relative w-full" style={{ height: contentHeight || undefined, minHeight: '100%' }}>
              {page.kind === 'exercise' && (
                <div
                  ref={statementRef}
                  className="board-statement absolute left-0 top-0 origin-top-left"
                  style={{ width: `${100 / scale}%`, transform: `scale(${scale})` }}
                >
                  <ExerciseDisplayContext.Provider value={COMPACT_DISPLAY}>
                    <ExerciseArticle
                      exercise={exercise}
                      currentIndex={index}
                      activeSubQuestionId={null}
                      onToggle={noop}
                      onGlobalFeedback={noop}
                      isPreview
                      isExamenMode
                    />
                  </ExerciseDisplayContext.Provider>
                </div>
              )}

              {contentHeight > 0 && (
                <DrawingCanvas
                  key={page.id}
                  instanceId={canvasId}
                  height={contentHeight}
                  initialStrokes={initialCanvasStrokes}
                  onStrokesChange={handleStrokes}
                  styleName={page.style}
                  colorName={page.color}
                  onStyleChange={applyStyle}
                  // Page d'énoncé : la couleur reste blanche, un fond sombre
                  // rendrait le texte illisible.
                  onColorChange={page.kind === 'paper' ? applyColor : undefined}
                  isEditMode
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ExerciseBoardProps {
  exercise: Exercise;
  index: number;
}

/**
 * Bouton « tableau » du dock + son overlay. L'overlay est portalisé vers `body`
 * pour sortir du contexte d'empilement du dock : il doit passer SOUS la barre
 * d'outils canva (z-[70]), qui reste ainsi au premier plan.
 */
const ExerciseBoard: React.FC<ExerciseBoardProps> = ({ exercise, index }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <RailDockButton
        label={open ? 'Fermer le tableau' : 'Afficher au tableau'}
        active={open}
        onClick={() => setOpen(value => !value)}
      >
        <FaIcon icon={faChalkboard} size={18} />
      </RailDockButton>

      {open && createPortal(
        <BoardOverlay key={exercise.id} exercise={exercise} index={index} onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  );
};

export default ExerciseBoard;
