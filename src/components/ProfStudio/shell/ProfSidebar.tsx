import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleHelp,
  FolderOpen,
  LogOut,
  Maximize,
  Minimize,
  Plus,
  Radio,
  Settings,
  Tablet,
  WifiOff,
} from 'lucide-react';
import type { SessionState } from '../../../services/professorClassroomService';
import type { ClassEntry } from '../../../services/profContentService';
import { useI18n } from '../../../i18n/I18nContext';
import { getBrandAssets } from '../../../i18n/brandAssets';
import { profViewModeService, TABLET_WINDOW_NAME } from '../../../services/profViewModeService';
import { useFullscreen } from '../../../hooks/useFullscreen';

const SESSION_STATUS = {
  running: { label: 'En cours',   dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused:  { label: 'En pause',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  stopped: { label: 'Arrêtée',    dot: 'bg-red-400',     badge: 'bg-red-50 text-red-600 border-red-200' },
} satisfies Record<'running' | 'paused' | 'stopped', { label: string; dot: string; badge: string }>;

interface ProfSidebarProps {
  classes: ClassEntry[];
  activeClassId: string;
  sessionClassId?: string;
  /** Classe que la tablette du professeur suit actuellement. */
  focusClassId?: string;
  /**
   * Classe de la séance en cours quand elle retient la tablette ailleurs que
   * sur le niveau piloté — `null` dès que les deux coïncident.
   */
  tabletHeldLabel?: string | null;
  session: SessionState;
  syncOk: boolean;
  elsewhereSessionLabel: string | null;
  profName?: string;
  collapsed: boolean;
  onSelectClass: (classId: string) => void;
  onJoinSession: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onToggleCollapsed: () => void;
  /** Replie le rail automatiquement (navigation vers une section de classe). */
  onCollapse: () => void;
  onLogout?: () => void;
}

/** Ferme un panneau au clic extérieur et à Échap. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, open]);
  return ref;
}

export function ProfSidebar({
  classes,
  activeClassId,
  sessionClassId,
  focusClassId,
  tabletHeldLabel = null,
  session,
  syncOk,
  elsewhereSessionLabel,
  profName,
  collapsed,
  onSelectClass,
  onJoinSession,
  onOpenSettings,
  onOpenHelp,
  onToggleCollapsed,
  onCollapse,
  onLogout,
}: ProfSidebarProps) {
  const { lang } = useI18n();
  const brand = getBrandAssets(lang);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const { isFullscreen, canFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const fullscreenLabel = isFullscreen ? 'Quitter le plein écran' : 'Plein écran';

  const rows = useMemo(() => classes, [classes]);
  // Séance terminée : on n'affiche pas le badge « Arrêtée » (l'état est déjà
  // visible ailleurs et le rail reste plus lisible sans pastille rouge).
  const sessionMeta = (session.status === 'idle' || session.status === 'stopped') ? null : SESSION_STATUS[session.status];

  /* Handlers qui naviguent ET replient automatiquement */
  const handleSettings = () => { onCollapse(); onOpenSettings(); };
  const handleHelp     = () => { onCollapse(); onOpenHelp(); };
  const handleJoin     = () => { onCollapse(); onJoinSession(); };

  /* ── Collapsed rail ─────────────────────────────────────────────────────── */
  if (collapsed) {
    return (
      <aside
        className="prof-sidebar flex shrink-0 flex-col w-16 items-center gap-1 pt-2 pb-3"
        aria-label="Console professeur"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Déplier le menu"
          title="Déplier"
          className="prof-button-ghost mb-1"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        {!syncOk && (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-50 text-amber-700" title="Hors ligne">
            <WifiOff size={12} aria-hidden="true" />
          </span>
        )}

        <button type="button" onClick={handleSettings} className="prof-button-ghost prof-sidebar-rail-action" title="Réglages" aria-label="Réglages">
          <Settings size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <button type="button" onClick={handleHelp} className="prof-button-ghost prof-sidebar-rail-action" title="Aide" aria-label="Aide">
          <CircleHelp size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <a href={profViewModeService.getTabletUrl()} target={TABLET_WINDOW_NAME} onClick={profViewModeService.handleTabletLinkClick} className="prof-button-ghost prof-sidebar-rail-action" title="Mode tablette (nouvelle fenêtre ou onglet)" aria-label="Mode tablette (nouvelle fenêtre ou onglet)">
          <Tablet size={20} strokeWidth={1.9} aria-hidden="true" />
        </a>
        {canFullscreen && (
          <button
            type="button"
            onClick={() => { void toggleFullscreen(); }}
            className="prof-button-ghost prof-sidebar-rail-action"
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            aria-pressed={isFullscreen}
          >
            {isFullscreen
              ? <Minimize size={20} strokeWidth={1.9} aria-hidden="true" />
              : <Maximize size={20} strokeWidth={1.9} aria-hidden="true" />}
          </button>
        )}
        {elsewhereSessionLabel && (
          <button
            type="button"
            onClick={handleJoin}
            className="grid h-7 w-7 place-items-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            title={`Séance en cours — ${elsewhereSessionLabel}`}
          >
            <Radio size={14} aria-hidden="true" />
          </button>
        )}
        {/* Le rail se replie tout seul quand une séance démarre : l'avertissement
            doit donc survivre ici, sous une forme réduite au strict minimum. */}
        {tabletHeldLabel && (
          <span
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500"
            title={`La tablette reste sur ${tabletHeldLabel} pendant la séance.`}
          >
            <Tablet size={13} aria-hidden="true" />
          </span>
        )}

        <div className="flex-1" />

        {onLogout && (
          <button type="button" onClick={onLogout} className="prof-button-ghost prof-sidebar-rail-action prof-sidebar-rail-action-danger" title="Déconnexion" aria-label="Déconnexion">
            <LogOut size={20} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
      </aside>
    );
  }

  /* ── Expanded sidebar ───────────────────────────────────────────────────── */
  return (
    <aside className="prof-sidebar flex shrink-0 flex-col w-[272px]" aria-label="Console professeur">

      {/* ── Header : logo + nom du prof + collapse toggle ──────────────────── */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span className="flex shrink-0 items-center gap-1">
          <img src={brand.icon} alt={brand.alt} className="h-7 w-7 rounded-lg object-contain" />
          <span className="-translate-y-px text-[15px] font-bold leading-none text-[#123b70]" aria-hidden="true">:</span>
        </span>
        {profName ? (
          <span className="prof-sidebar-prof-name min-w-0 flex-1 truncate" title={profName}>
            {profName}
          </span>
        ) : (
          <div className="flex-1" />
        )}
        {!syncOk && (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700" title="Le serveur ne répond pas.">
            <WifiOff size={11} aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="prof-button-ghost shrink-0 -mr-1"
          aria-label="Replier le menu"
          title="Replier"
        >
          <ChevronRight size={15} className="rotate-180" aria-hidden="true" />
        </button>
      </div>

      {/* ── Action tiles grid ───────────────────────────────────────────────── */}
      <div className="px-3 pb-4" ref={menuRef}>
        <div className="prof-sidebar-actions grid grid-cols-2">

          <button type="button" onClick={handleSettings} className="prof-sidebar-tile group">
            <span className="prof-sidebar-tile-icon text-slate-600 group-hover:text-[#1677ff]">
              <Settings size={22} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="prof-sidebar-tile-label">Réglages</span>
          </button>

          <button type="button" onClick={handleHelp} className="prof-sidebar-tile group">
            <span className="prof-sidebar-tile-icon text-sky-600 group-hover:text-sky-700">
              <CircleHelp size={22} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="prof-sidebar-tile-label">Aide</span>
          </button>

          <a href={profViewModeService.getTabletUrl()} target={TABLET_WINDOW_NAME} onClick={profViewModeService.handleTabletLinkClick} className="prof-sidebar-tile group" title="Mode tablette (nouvelle fenêtre ou onglet)">
            <span className="prof-sidebar-tile-icon text-violet-600 group-hover:text-violet-700">
              <Tablet size={22} strokeWidth={1.9} aria-hidden="true" />
            </span>
            <span className="prof-sidebar-tile-label">Tablette</span>
          </a>

          {canFullscreen && (
            <button
              type="button"
              onClick={() => { void toggleFullscreen(); }}
              className="prof-sidebar-tile group"
              title={`${fullscreenLabel} — tracé plus fin, veille suspendue`}
              aria-pressed={isFullscreen}
            >
              <span className={`prof-sidebar-tile-icon ${isFullscreen ? 'text-[#1677ff]' : 'text-slate-600 group-hover:text-[#1677ff]'}`}>
                {isFullscreen
                  ? <Minimize size={22} strokeWidth={1.9} aria-hidden="true" />
                  : <Maximize size={22} strokeWidth={1.9} aria-hidden="true" />}
              </span>
              <span className="prof-sidebar-tile-label">{isFullscreen ? 'Réduire' : 'Plein écran'}</span>
            </button>
          )}

          {elsewhereSessionLabel ? (
            <button type="button" onClick={handleJoin} className="prof-sidebar-tile group">
              <span className="prof-sidebar-tile-icon text-emerald-600 group-hover:text-emerald-700">
                <Radio size={22} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="prof-sidebar-tile-label truncate max-w-[88px]">Séance</span>
            </button>
          ) : onLogout ? (
            <button type="button" onClick={onLogout} className="prof-sidebar-tile group">
              <span className="prof-sidebar-tile-icon text-rose-500 group-hover:text-rose-600">
                <LogOut size={22} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="prof-sidebar-tile-label text-rose-500">Déconnexion</span>
            </button>
          ) : (
            <div className="prof-sidebar-tile opacity-0 pointer-events-none" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* ── Séance en cours ailleurs ────────────────────────────────────────── */}
      {elsewhereSessionLabel && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={handleJoin}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition hover:brightness-95 ${sessionMeta ? sessionMeta.badge : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}
          >
            <Radio size={13} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{elsewhereSessionLabel}</span>
            <span className="shrink-0 font-semibold underline underline-offset-2">Rejoindre</span>
          </button>
        </div>
      )}

      {/* ── La tablette est retenue par la séance en cours ──────────────────── */}
      {tabletHeldLabel && (
        <div className="px-3 pb-3">
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-600">
            <Tablet size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              La tablette reste sur <span className="font-semibold text-slate-800">{tabletHeldLabel}</span> pendant
              la séance. Arrêtez-la pour piloter un autre niveau.
            </span>
          </p>
        </div>
      )}

      {/* ── Section "Classes" ───────────────────────────────────────────────── */}
      <div className="flex items-center px-4 pb-2">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">
          <FolderOpen size={11} aria-hidden="true" />
          Classes
        </span>
      </div>

      {/* ── Class list ─────────────────────────────────────────────────────── */}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 space-y-0.5">
        {rows.length === 0 ? (
          <li className="px-2 py-3 text-xs text-slate-400">Aucune classe.</li>
        ) : rows.map(entry => {
          const active = entry.id === activeClassId;
          const hasSession = Boolean(sessionMeta && entry.id === sessionClassId);
          // Le badge de séance porte déjà l'information la plus forte : on ne
          // double pas la ligne d'une seconde pastille.
          const pilots = !hasSession && Boolean(focusClassId) && entry.id === focusClassId;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelectClass(entry.id)}
                aria-current={active ? 'page' : undefined}
                title={entry.title}
                className={`prof-sidebar-class-item ${active ? 'active' : ''}`}
              >
                <span className="prof-sidebar-class-name min-w-0 flex-1 truncate">{entry.title}</span>
                {hasSession && (
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sessionMeta.badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${sessionMeta.dot}`} aria-hidden="true" />
                    {sessionMeta.label}
                  </span>
                )}
                {pilots && (
                  <span
                    className="shrink-0 grid h-5 w-5 place-items-center rounded-full border border-violet-200 bg-violet-50 text-violet-600"
                    title="La tablette suit cette classe"
                  >
                    <Tablet size={11} aria-hidden="true" />
                  </span>
                )}
                {active && !hasSession && !pilots && (
                  <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[#1677ff]" aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ── Bas sidebar ─────────────────────────────────────────────────────── */}
      <div className="prof-sidebar-footer px-3 pb-3 pt-2">
        <button
          type="button"
          className="prof-sidebar-add-class"
          disabled
          title="Bientôt disponible"
        >
          <span className="prof-sidebar-add-class-icon">
            <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
          </span>
          Ajouter une nouvelle classe
        </button>
      </div>

    </aside>
  );
}
