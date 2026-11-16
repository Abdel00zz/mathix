import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Feuille modale — pensée pour le téléphone d'abord.
 *
 * Sur téléphone elle monte du bas et occupe presque tout l'écran, comme une
 * feuille d'application native : poignée de préhension, glissement vers le bas
 * pour fermer, appui sur le fond, touche Échap. Sur grand écran elle devient
 * une boîte centrée.
 *
 * Points traités parce qu'ils cassent l'illusion quand on les oublie :
 *  - le fond ne défile plus derrière la feuille ;
 *  - le glissement ne se déclenche que depuis la poignée ou un contenu déjà
 *    en haut de sa course, sinon fermer la feuille volerait le défilement ;
 *  - relâcher avant le seuil ramène la feuille en place, sans à-coup.
 */
interface SheetModalProps {
  open: boolean;
  onClose: () => void;
  /** Hauteur de la feuille sur téléphone (défaut : 94% de la hauteur visible). */
  phoneHeight?: string;
  /** Largeur maximale sur grand écran. */
  desktopMaxWidth?: string;
  /** Ajustement visuel propre à une feuille, sans modifier les autres modales. */
  sheetClassName?: string;
  label?: string;
  children: React.ReactNode;
}

/** Course au-delà de laquelle on referme au relâchement. */
const DISMISS_PX = 110;

const SheetModal: React.FC<SheetModalProps> = ({
  open,
  onClose,
  phoneHeight = 'calc(100dvh - 0.5rem)',
  desktopMaxWidth = '48rem',
  sheetClassName = '',
  label,
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  // Échap ferme, et le fond ne défile pas pendant l'ouverture.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const canDragFrom = useCallback((target: EventTarget | null): boolean => {
    const node = target as HTMLElement | null;
    if (!node) return false;
    if (node.closest('[data-sheet-handle]')) return true;
    // Contenu déjà en butée haute : le geste vers le bas n'a plus de
    // défilement à consommer, il peut donc fermer la feuille.
    const scroller = node.closest('.app-page__scroll') as HTMLElement | null;
    return !scroller || scroller.scrollTop <= 0;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    if (!canDragFrom(e.target)) return;
    dragStartY.current = e.clientY;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    setDragY(delta > 0 ? delta : 0);
  };

  const endDrag = () => {
    if (dragStartY.current === null) return;
    const shouldClose = dragY > DISMISS_PX;
    dragStartY.current = null;
    setDragY(0);
    if (shouldClose) onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="absolute inset-0 bg-[#160c18]/45 backdrop-blur-[6px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          height: phoneHeight,
          maxWidth: desktopMaxWidth,
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : 'transform .22s cubic-bezier(0.2,0.9,0.3,1)',
        }}
        className={`modal-sheet relative z-10 flex w-full flex-col overflow-hidden rounded-t-[28px] animate-in slide-in-from-bottom duration-300 sm:h-[92vh] sm:rounded-[24px] sm:slide-in-from-bottom-0 sm:zoom-in-95 ${sheetClassName}`}
      >
        {/* Zone tactile invisible de préhension supérieure (aucun trait visible en haut) */}
        <div
          data-sheet-handle
          className="h-1.5 shrink-0 touch-none sm:hidden"
        />

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
};

export default SheetModal;
