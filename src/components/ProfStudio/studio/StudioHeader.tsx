import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, History, Loader2, LogOut, MoreHorizontal, Save, Tablet, Trash2, X } from 'lucide-react';
import { profViewModeService, TABLET_WINDOW_NAME } from '../../../services/profViewModeService';
import type { StudioHeaderProps } from './types';

/**
 * Barre du document ouvert.
 *
 * Les classes utilitaires sont explicites plutôt que tokenisées : ce studio est
 * aussi monté par la console d'administration, hors de `.prof-console`, où les
 * tokens `prof-*` ne s'appliquent pas.
 */
export default function StudioHeader({
  adminMode, adminClassId, classes, currentPath, isDirty, isVisualSupported, mode,
  onAdminClassChange, onHistory, onLogout, onModeChange, onRemove, onRevert, onSave,
  overrides, parseError, saveState, shellActive,
}: StudioHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const hasError = Boolean(parseError) || saveState === 'error';
  const selectClass = 'h-8 rounded-xl border border-slate-200/90 bg-slate-50/80 px-2.5 text-xs font-semibold text-slate-700 outline-none transition-all hover:border-indigo-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:ring-3 focus:ring-indigo-500/10';
  const menuItemClass = 'flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-100/80 hover:text-slate-950';
  const fileName = currentPath ? currentPath.split('/').pop() : null;
  const folderHint = currentPath && currentPath.includes('/')
    ? currentPath.slice(0, currentPath.lastIndexOf('/')).replace(/^data\//, '')
    : null;

  return (
    <header className="prof-studio-header sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/88 px-3 py-2 text-slate-900 shadow-[0_4px_20px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
            hasError
              ? 'border-red-200/90 bg-red-50/90 text-red-700'
              : isDirty
                ? 'border-amber-200/90 bg-amber-50/90 text-amber-800'
                : 'border-emerald-200/90 bg-emerald-50/90 text-emerald-700'
          }`}
          role="status"
          aria-live="polite"
          aria-label={hasError ? 'Document à corriger' : isDirty ? 'Modifications non publiées' : 'Document synchronisé'}
          title={hasError ? 'À corriger' : isDirty ? 'Non publié' : 'Synchronisé'}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${hasError ? 'bg-red-500' : isDirty ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} aria-hidden="true" />
          <span className="hidden md:inline">{hasError ? 'Erreur' : isDirty ? 'Brouillon' : 'Synchronisé'}</span>
        </span>

        {fileName ? (
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-tight text-slate-800">{fileName}</p>
            {folderHint && <p className="hidden truncate font-mono text-[10px] text-slate-400 sm:block">{folderHint}</p>}
          </div>
        ) : (
          <span className=" truncate text-xs font-medium text-slate-400">Studio d’édition</span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {adminMode && (
          <label className="min-w-0">
            <span className="sr-only">Niveau</span>
            <select value={adminClassId} onChange={event => onAdminClassChange(event.target.value)} className={`${selectClass} max-w-[170px] sm:max-w-[200px]`}>
              <option value="">Tous les niveaux…</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}

        {currentPath && (
          <label>
            <span className="sr-only">Mode d’affichage</span>
            <select
              value={mode === 'render' && !isVisualSupported ? 'json' : mode}
              onChange={event => onModeChange(event.target.value as typeof mode)}
              className={`${selectClass} pr-7`}
            >
              {isVisualSupported && <option value="render">Édition visuelle</option>}
              <option value="fields">Structure</option>
              <option value="json">JSON</option>
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={!currentPath || !isDirty || saveState === 'saving' || Boolean(parseError)}
          title={parseError ? 'Corrigez le JSON invalide avant de publier.' : 'Publier le document (Ctrl+S)'}
          className="inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-3 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(79,70,229,0.4)] transition-all hover:from-indigo-500 hover:to-indigo-500 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:px-3.5"
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            : saveState === 'saved' ? <CheckCircle2 size={14} aria-hidden="true" />
            : <Save size={14} aria-hidden="true" />}
          <span className="hidden sm:inline">{saveState === 'saving' ? 'Publication…' : saveState === 'saved' ? 'Publié' : 'Publier'}</span>
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen(value => !value)}
            className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
            aria-label="Plus d’actions"
            title="Plus d’actions"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_20px_48px_-16px_rgba(15,23,42,0.26)] backdrop-blur-xl" role="menu">
              {!shellActive && (
                <a href={profViewModeService.getTabletUrl()} target={TABLET_WINDOW_NAME} role="menuitem" onClick={event => {
                  profViewModeService.handleTabletLinkClick(event);
                  // Garder le lien monté pour son action native si le popup est refusé.
                  if (event.defaultPrevented) setMoreOpen(false);
                }} className={menuItemClass}>
                  <Tablet size={14} aria-hidden="true" /> Ouvrir le mode tablette
                </a>
              )}
              {currentPath && (
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onHistory(); }} className={menuItemClass}>
                  <History size={14} aria-hidden="true" /> Historique des versions
                </button>
              )}
              {currentPath && isDirty && (
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onRevert(); }} className={menuItemClass}>
                  <X size={14} aria-hidden="true" /> Annuler les modifications
                </button>
              )}
              {currentPath && overrides[currentPath] !== undefined && (
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onRemove(); }} disabled={saveState === 'saving'} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40">
                  <Trash2 size={14} aria-hidden="true" /> Retirer du catalogue
                </button>
              )}
              {onLogout && !shellActive && (
                <>
                  <div className="my-1 h-px bg-slate-100" role="none" />
                  <button type="button" role="menuitem" onClick={onLogout} className={menuItemClass}>
                    <LogOut size={14} aria-hidden="true" /> Déconnexion
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
