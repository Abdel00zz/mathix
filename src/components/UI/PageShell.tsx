import React from 'react';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from './FaIcon';

/**
 * Coquille commune aux pages plein écran (Aide, Paramètres, Orientation,
 * Messages).
 *
 * Sur téléphone, trois choses cassaient systématiquement : l'absence de retour
 * (la barre du bas ne referme pas la page ouverte), le bas de page masqué par
 * cette même barre, et l'empilement de conteneurs défilants qui tuait
 * l'inertie tactile. La coquille règle les trois une fois pour toutes :
 *
 * - en-tête figé avec bouton retour (flèche sur mobile, croix sur desktop) ;
 * - barre d'outils optionnelle, toujours visible, hors de la zone défilante ;
 * - UNE seule zone défilante, qui réserve la hauteur réelle de la navigation ;
 * - barre d'actions optionnelle collée en bas, au-dessus de la navigation.
 *
 * Rendu clair uniquement : l'application n'expose pas de thème sombre.
 */
interface PageShellProps {
  title: React.ReactNode;
  /** Complément de titre, affiché en second sur la même ligne (replié si étroit). */
  subtitle?: React.ReactNode;
  onClose: () => void;
  /** Contrôles alignés à droite dans l'en-tête (sélecteur de langue, etc.). */
  headerRight?: React.ReactNode;
  /** Onglets ou filtres, rendus sous l'en-tête et exclus du défilement. */
  toolbar?: React.ReactNode;
  /** Barre d'actions persistante en bas de page. */
  footer?: React.ReactNode;
  dir?: 'ltr' | 'rtl';
  /** Largeur maximale du contenu (défaut : 900px). */
  contentMaxWidth?: number;
  surfaceClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const PageShell: React.FC<PageShellProps> = ({
  title,
  subtitle,
  onClose,
  headerRight,
  toolbar,
  footer,
  dir = 'ltr',
  contentMaxWidth = 760,
  surfaceClassName = '',
  contentClassName = '',
  children,
}) => {
  /*
   * Colonne calée à gauche, pas centrée : sur un grand écran, un bloc de
   * réglages flottant au milieu du vide se lit mal et déplace les repères à
   * chaque changement de largeur. La largeur maximale reste, pour la
   * longueur de ligne.
   */
  const column = { maxWidth: contentMaxWidth, marginInline: 'auto' };

  return (
    <div dir={dir} className={`app-page modal-ui relative flex h-full w-full flex-col overflow-hidden animate-in fade-in duration-300 ${surfaceClassName}`}>

      {/* ── En-tête Pur & Élégant ── */}
      <header className="modal-ui__header shrink-0">
        <div className="flex w-full items-center justify-between gap-3 px-4 pb-2.5 pt-3.5 sm:px-6 sm:pb-3 sm:pt-4" style={column}>
          <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <h1 className="typo-ui truncate modal-t-h1 font-bold tracking-tight text-[var(--modal-ink)]">
              {title}
            </h1>
            {subtitle && (
              <span className="typo-ui modal-t-label hidden min-w-0 truncate font-medium text-[var(--modal-muted)] sm:block">
                • {subtitle}
              </span>
            )}
          </div>

          {headerRight && <div className="shrink-0">{headerRight}</div>}

          <button
            type="button"
            onClick={onClose}
            aria-label={dir === 'rtl' ? 'إغلاق' : 'Fermer'}
            className="app-tap modal-ui__close flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modal-accent)]"
          >
            <FaIcon icon={faXmark} size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Sous-titre replié sous le titre quand la largeur manque. */}
        {subtitle && (
          <div className="w-full px-4 pb-2 sm:hidden" style={column}>
            <p className="typo-ui modal-t-label truncate font-medium text-[var(--modal-muted)]">{subtitle}</p>
          </div>
        )}

        {toolbar && (
          <div className="w-full px-4 pb-3 sm:px-6" style={column}>
            {toolbar}
          </div>
        )}
      </header>

      {/* ── Contenu (seule zone défilante) ── */}
      <div className={`app-page__scroll min-h-0 flex-1 ${footer ? '' : 'app-page__nav-gap'}`}>
        <div className={`w-full px-3.5 py-4 sm:px-7 sm:py-6 ${contentClassName}`} style={column}>
          {children}
        </div>
      </div>

      {/* ── Barre d'actions ── */}
      {footer && (
        <div className="app-page__footer shrink-0 border-t border-slate-200/60 bg-white/90 pt-3.5 shadow-[0_-8px_25px_-15px_rgba(104,23,88,0.1)] backdrop-blur-md">
          <div className="w-full px-4 sm:px-8" style={column}>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
};

export default PageShell;
