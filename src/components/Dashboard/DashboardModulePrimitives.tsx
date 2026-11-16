import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faChevronLeft, faChevronRight, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { cn, dashboardClasses, ui } from '../UI/designSystem';
import { motion, AnimatePresence } from 'motion/react';

type ModuleHeaderProps = {
  badge: string;
  eyebrow: string;
  title: React.ReactNode;
  expanded?: boolean;
  accentClassName?: string;
  onToggle?: () => void;
  right?: React.ReactNode;
};

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
  badge,
  eyebrow,
  title,
  expanded = false,
  accentClassName = '',
  onToggle,
  right,
}) => (
  <div className="w-full max-w-[1180px] mx-auto mt-8 mb-5 group cursor-pointer" onClick={onToggle}>
    <div
      className={cn(
        ui.dashboard.moduleHeader,
        'dash-module-header',
        expanded ? ui.dashboard.moduleHeaderExpanded : ui.dashboard.moduleHeaderCollapsed
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 pr-2 sm:gap-4">
        <div className="shrink-0 flex items-center justify-center">
          <div className={cn(
              "dash-module-header__badge inline-flex items-center justify-center rounded-xl border border-[var(--theme-color,#3b82f6)] bg-[var(--theme-color-light,rgba(59,130,246,0.1))] font-bold text-[var(--theme-color,#3b82f6)] shadow-sm transition-transform duration-300 group-hover:scale-105", 
              accentClassName
            )}>
              {badge}
          </div>
        </div>
        <div className="relative flex min-w-0 flex-col justify-center">
          <div className="mb-0.5 flex items-center sm:mb-1">
            <span className={cn(ui.dashboard.eyebrow, 'dash-module-header__eyebrow whitespace-nowrap')}>{eyebrow}</span>
          </div>
          <h2 className={cn(ui.dashboard.title, 'dash-module-header__title group-hover:text-slate-900')}>{title}</h2>
        </div>
      </div>
      {right ?? (
        <div
          className={cn(
            'shrink-0 transition-all duration-300',
            expanded ? 'pointer-events-none translate-x-2 opacity-0' : 'translate-x-0 opacity-100'
          )}
        >
          <span className={cn(ui.dashboard.explorePill, 'group-hover:bg-[var(--theme-color,#3b82f6)]')}>
            Explorer
            <FaIcon icon={faChevronRight} size={12} aria-hidden="true" />
          </span>
        </div>
      )}
    </div>
  </div>
);

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  color?: string;
};

type SegmentControlProps<T extends string> = {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: SegmentControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layoutId] = useState(() => 'segmentBg-' + Math.random().toString(36).substring(2, 9));
  
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [dragged, setDragged] = useState(false);
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canScrollLeft = el.scrollLeft > 4;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setScrollState({ canScrollLeft, canScrollRight });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeftState(scrollRef.current.scrollLeft);
    setDragged(false);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 5) {
      setDragged(true);
    }
    scrollRef.current.scrollLeft = scrollLeftState - walk;
  };

  const handleScrollLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = scrollRef.current;
    if (el) {
      el.scrollBy({ left: -140, behavior: 'smooth' });
    }
  };

  const handleScrollRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = scrollRef.current;
    if (el) {
      el.scrollBy({ left: 140, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      checkScroll();
      window.addEventListener('resize', checkScroll);
      const t = setTimeout(checkScroll, 100);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearTimeout(t);
      };
    }
  }, [options, checkScroll]);

  return (
    <div className="relative flex-1 min-w-0 max-w-full overflow-hidden flex items-center justify-between p-1 bg-slate-100/40 rounded-full border border-slate-200/50 backdrop-blur-sm">
      
      {/* Left Integrated Arrow */}
      <AnimatePresence initial={false}>
        {scrollState.canScrollLeft && (
          <motion.div
            initial={{ opacity: 0, width: 0, scale: 0.8 }}
            animate={{ opacity: 1, width: 'auto', scale: 1 }}
            exit={{ opacity: 0, width: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="shrink-0 flex items-center overflow-hidden"
          >
            <button
              onClick={handleScrollLeft}
              type="button"
              className="flex items-center justify-center h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-all cursor-pointer mr-0.5 shadow-sm active:scale-95"
              aria-label="Défiler vers la gauche"
            >
              <FaIcon icon={faChevronLeft} size={12} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeaveOrUp}
        onMouseUp={handleMouseLeaveOrUp}
        onMouseMove={handleMouseMove}
        className="flex-1 w-full overflow-x-auto scrollbar-none cursor-grab active:cursor-grabbing select-none"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        <div 
          ref={containerRef}
          className={cn('flex flex-row flex-nowrap w-max gap-1 items-center bg-transparent p-0 border-0', className)}
        >
          {options.map((option) => {
            const isActive = value === option.value;
            const optionStyle = {
              '--option-color': option.color || 'var(--theme-color, var(--accent, #3b82f6))',
            } as React.CSSProperties;
            return (
              <button
                key={option.value}
                style={optionStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragged) return;
                  onChange(option.value);

                  // ADVANCED PUSH-LEFT/SCROLL MECHANISM
                  const buttonEl = e.currentTarget;
                  const containerEl = scrollRef.current;
                  if (containerEl && buttonEl) {
                    const containerWidth = containerEl.clientWidth;
                    const buttonLeft = buttonEl.offsetLeft;
                    const buttonWidth = buttonEl.offsetWidth;

                    // Centering calculation for fluidity
                    const targetScrollLeft = buttonLeft - (containerWidth / 2) + (buttonWidth / 2);
                    containerEl.scrollTo({
                      left: Math.max(0, Math.min(targetScrollLeft, containerEl.scrollWidth - containerWidth)),
                      behavior: 'smooth'
                    });
                  }
                }}
                className={cn(
                  "relative shrink-0 whitespace-nowrap rounded-full border-0 px-4 py-[6px] text-[0.6rem] sm:text-[0.65rem] font-bold uppercase tracking-wider transition-all duration-300 z-10 cursor-pointer focus:outline-none select-none outline-none",
                  isActive 
                    ? "text-[color:var(--option-color)] font-extrabold" 
                    : "text-slate-500 hover:text-[color:var(--option-color)]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId={layoutId}
                    className="absolute inset-0 rounded-full -z-10 shadow-sm border"
                    style={{
                      background: 'color-mix(in srgb, var(--option-color) 12%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--option-color) 25%, transparent)',
                    }}
                    transition={{ type: "spring", stiffness: 450, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Integrated Arrow */}
      <AnimatePresence initial={false}>
        {scrollState.canScrollRight && (
          <motion.div
            initial={{ opacity: 0, width: 0, scale: 0.8 }}
            animate={{ opacity: 1, width: 'auto', scale: 1 }}
            exit={{ opacity: 0, width: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="shrink-0 flex items-center overflow-hidden"
          >
            <button
              onClick={handleScrollRight}
              type="button"
              className="flex items-center justify-center h-7 w-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-all cursor-pointer ml-0.5 shadow-sm active:scale-95"
              aria-label="Défiler vers la droite"
            >
              <FaIcon icon={faChevronRight} size={12} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


type DashboardRowProps = {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  centerClassName?: string;
  isLoading?: boolean;
  onSelect: () => void;
  className?: string;
  titleClassName?: string;
};

export const DashboardRow: React.FC<DashboardRowProps> = ({
  title,
  eyebrow,
  center,
  right,
  centerClassName = '',
  isLoading = false,
  onSelect,
  className = '',
  titleClassName = '',
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={(e) => {
      e.stopPropagation();
      if (!isLoading) onSelect();
    }}
    onKeyDown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (!isLoading && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); }
    }}
    className={dashboardClasses.row({ disabled: isLoading, className: cn('dashboard-card-frame dash-module-row', className) })}
  >
    <div className="min-w-0 flex-1 pr-2 sm:pr-5">
      {eyebrow && (
        <div className="mb-2 flex items-center gap-2">
          {eyebrow}
        </div>
      )}
      <h3 className={cn(ui.dashboard.rowTitle, 'dash-module-row__title', titleClassName)}>{title}</h3>
    </div>
    {center && <div className={cn('flex shrink-0 items-center justify-center', centerClassName)}>{center}</div>}
    <div className={cn('flex shrink-0 items-center justify-end', right ? 'min-w-7' : 'w-7')}>
      {right ?? (
        <span className="inline-flex opacity-30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-70">
          {isLoading ? <FaIcon icon={faCircleNotch} size={15} spin className="text-[#FF7F50]" aria-hidden="true" /> : <FaIcon icon={faChevronRight} size={14} aria-hidden="true" />}
        </span>
      )}
    </div>
  </div>
);

export const LoadingState: React.FC<{ className?: string; label?: string; rows?: number }> = ({
  className = '',
  label = 'Préparation du contenu',
  rows = 3,
}) => (
  <div className={cn('w-full py-5 sm:py-8', className)} role="status" aria-live="polite" aria-label={label}>
    <div className="mb-4 flex items-center gap-2 px-3 text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">
      <span>{label}</span>
    </div>
    <div className={ui.dashboard.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 border border-transparent"
        >
          <div className="min-w-0 flex-1 space-y-3">
            <div className="learning-skeleton h-3 w-24" />
            <div className="learning-skeleton h-4 w-[min(340px,72%)]" />
          </div>
          <div className="learning-skeleton h-7 w-20" />
        </div>
      ))}
    </div>
    <span className="sr-only">Chargement</span>
  </div>
);

export const EmptyState: React.FC<{ icon: IconDefinition; text: string }> = ({ icon, text }) => (
  <div className={ui.dashboard.empty}>
    <p className="flex max-w-md items-center gap-2 px-5 text-center text-sm font-medium leading-relaxed text-slate-600"><FaIcon icon={icon} size={17} className="shrink-0" aria-hidden="true" />{text}</p>
  </div>
);

export const InlineAlert: React.FC<{ children: React.ReactNode; onDismiss: () => void }> = ({
  children,
  onDismiss,
}) => (
  <div className={ui.dashboard.alert}>
    <span>{children}</span>
    <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="text-[#6B6460] hover:text-[#1E2548]">
      &times;
    </button>
  </div>
);
