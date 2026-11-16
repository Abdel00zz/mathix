import React, { useCallback, useId } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../../UI/FaIcon';

/**
 * Section repliable d'un menu du canvas (motif « disclosure »).
 *
 * Deux partis pris qui font la compacité :
 *
 * 1. RÉSUMÉ TOUJOURS VISIBLE. Replié, l'en-tête affiche la valeur courante
 *    (`summary`) — « Lignes », « 3 / 6 actifs »… On lit l'état du réglage sans
 *    déplier. Sans ça, replier ne fait que cacher l'information : on gagne de la
 *    place mais on oblige à ouvrir chaque section pour savoir où l'on en est.
 *
 * 2. ANIMATION PAR `grid-template-rows: 0fr → 1fr`. La hauteur n'est jamais
 *    mesurée en JS : le contenu peut changer (la grille des angles apparaît avec
 *    « Angles fixes ») sans recalcul ni saut. `max-height` arbitraire imposerait
 *    de deviner une borne, et couperait le contenu dès qu'on la dépasse.
 *
 * Accessibilité : bouton natif + `aria-expanded`/`aria-controls`, région
 * `inert`-isée par `visibility: hidden` en CSS quand elle est repliée (le focus
 * ne peut pas atterrir dans une section fermée).
 */
interface MenuDisclosureProps {
  /** Identifiant de section, renvoyé par `onToggle` (accordéon du parent). */
  sectionId: string;
  icon?: React.ReactNode;
  title: string;
  /** Valeur courante, affichée à droite du titre quand la section est repliée. */
  summary?: string;
  open: boolean;
  onToggle: (sectionId: string) => void;
  children: React.ReactNode;
}

const MenuDisclosure: React.FC<MenuDisclosureProps> = ({
  sectionId, icon, title, summary, open, onToggle, children,
}) => {
  const panelId = `${useId()}-${sectionId}`;
  const handleToggle = useCallback(() => onToggle(sectionId), [onToggle, sectionId]);

  return (
    <section className={`boxnote-disclosure ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="boxnote-disclosure-head"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {icon && <span className="boxnote-disclosure-icon" aria-hidden="true">{icon}</span>}
        <span className="boxnote-disclosure-title">{title}</span>
        {summary && <span className="boxnote-disclosure-summary">{summary}</span>}
        <FaIcon icon={faChevronDown} className="boxnote-disclosure-chevron" size={13} aria-hidden="true" />
      </button>
      <div className="boxnote-disclosure-panel" id={panelId} role="group" aria-label={title}>
        <div className="boxnote-disclosure-inner">{children}</div>
      </div>
    </section>
  );
};

export default React.memo(MenuDisclosure);
