import React from 'react';
import { useRailDockBottom } from './useRailAnchor';

/**
 * Colonne de boutons flottants empilée juste au-dessus de la barre d'outils
 * canva, sur le MÊME axe vertical qu'elle : même `right-*`, même rembourrage
 * horizontal (`px-1.5`) et mêmes boutons de 40 px que le rail. Les icônes de la
 * session (élèves, tableau…) restent ainsi parfaitement alignées avec les
 * boutons de la barre, quelle que soit la taille d'écran.
 *
 * Les panneaux ouverts par ces boutons doivent être portalisés vers `body` :
 * `backdrop-filter` fait de ce conteneur le bloc contenant des descendants
 * `position: fixed`.
 */
export const CanvasRailDock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bottom = useRailDockBottom();

  return (
    <div
      data-canvas-dock
      className="canvas-toolbar canvas-rail-edge fixed z-[75] flex flex-col items-center gap-1 rounded-full border border-[#dedbd2] bg-[#fffefa]/95 px-1.5 py-2 shadow-[0_12px_36px_rgba(23,33,38,0.18)] backdrop-blur-xl print:hidden"
      style={{ bottom }}
    >
      {children}
    </div>
  );
};

interface RailDockButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** Bouton de dock : réplique exacte du `RailButton` de la barre d'outils. */
export const RailDockButton: React.FC<RailDockButtonProps> = ({ label, active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={active}
    className={`canvas-rail-button relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition active:scale-95 ${
      active ? 'bg-[#dceceb] text-[#19788c]' : 'text-[#5b676a] hover:bg-[#fffefa] hover:text-[#172126]'
    }`}
  >
    {children}
  </button>
);
