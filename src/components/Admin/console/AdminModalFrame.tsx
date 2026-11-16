import { useEffect, useRef, type ReactNode } from 'react';

interface AdminModalFrameProps {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function AdminModalFrame({ children, labelledBy, onClose, width = 'sm', className = '' }: AdminModalFrameProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const widthClass = { sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[width];
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`max-h-[92dvh] w-full ${widthClass} overflow-y-auto rounded-t-[26px] border border-stone-200/90 bg-white p-5 text-stone-900 shadow-[0_20px_50px_-15px_rgba(28,25,23,0.12)] outline-none overscroll-contain sm:rounded-[24px] sm:p-7 ${className}`}
      >
        <div className="mx-auto -mt-2 mb-3 h-1 w-10 shrink-0 rounded-full bg-stone-300 sm:hidden" />
        {children}
      </section>
    </div>
  );
}
