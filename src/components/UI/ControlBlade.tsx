import React, { memo, useRef, useCallback, useMemo, useEffect } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCompass,
  faClockRotateLeft,
  faCircleQuestion,
  faGear,
  faPause,
  faPlay,
  faStop,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from './FaIcon';
import type { SessionState } from '../../services/professorClassroomService';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/I18nContext';

type ModalId = 'orientation' | 'help' | 'notification' | 'settings';

interface ControlBladeProps {
  onOpenModal: (modal: ModalId) => void;
  onLogout: () => void;
  activeModal?: ModalId | null;
  /** Mode professeur (tablette) : sidebar réduite, sans aide. */
  isProf?: boolean;
  /** Statut de la séance (pastille sur le rail latéral). */
  sessionStatus?: 'idle' | 'running' | 'paused' | 'stopped';
  sessionBusy?: boolean;
  onControlSession?: (status: SessionState['status']) => void;
}

const LONG_PRESS_MS = 3000;

type ControlItemKey = 'settings' | 'orientation' | 'notification' | 'help' | 'logout' | 'session_start' | 'session_pause' | 'session_resume' | 'session_stop';

const itemThemes: Record<ControlItemKey, { accent: string; bar: string }> = {
  settings:       { accent: 'text-[#1677ff]', bar: 'bg-[#1677ff]' },
  orientation:    { accent: 'text-[var(--dashboard-mauve-deep,#8f1f7d)]', bar: 'bg-[var(--dashboard-mauve,#b5369b)]' },
  notification:   { accent: 'text-[var(--dashboard-mauve-deep,#8f1f7d)]', bar: 'bg-[var(--dashboard-mauve,#b5369b)]' },
  help:           { accent: 'text-[var(--dashboard-mauve-deep,#8f1f7d)]', bar: 'bg-[var(--dashboard-mauve,#b5369b)]' },
  logout:         { accent: 'text-rose-600',  bar: 'bg-rose-500'  },
  session_start:  { accent: 'text-[#52c41a]', bar: 'bg-[#52c41a]' },
  session_pause:  { accent: 'text-[#fa8c16]', bar: 'bg-[#fa8c16]' },
  session_resume: { accent: 'text-[#52c41a]', bar: 'bg-[#52c41a]' },
  session_stop:   { accent: 'text-[#ff4d4f]', bar: 'bg-[#ff4d4f]' },
};

/**
 * Pastille d'attention sans compteur : un point plein sous un halo qui bat.
 * Sert là où le nombre n'apporte rien — « il se passe quelque chose » suffit.
 */
const AttentionDot = memo(() => (
  <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
  </span>
));
AttentionDot.displayName = 'AttentionDot';

const ControlItem = ({
  itemKey,
  icon,
  label,
  onClick,
  onLongPress,
  badge = 0,
  dot = false,
  active = false,
  disabled = false,
  mobile = false,
}: {
  itemKey: ControlItemKey;
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  onLongPress?: () => void;
  badge?: number;
  dot?: boolean;
  active?: boolean;
  disabled?: boolean;
  mobile?: boolean;
}) => {
  const theme = itemThemes[itemKey];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const clearPressTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const startPress = useCallback(() => {
    if (!onLongPress) return;
    didLongPress.current = false;
    clearPressTimer();
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [clearPressTimer, onLongPress]);

  const endPress = useCallback(() => {
    clearPressTimer();
  }, [clearPressTimer]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    onClick();
  }, [disabled, onClick]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ignore unsupported pointer capture.
      }
      startPress();
    },
    [disabled, startPress]
  );

  if (mobile) {
    return (
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        className={`group relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dashboard-mauve,#b5369b)] ${
          disabled ? 'opacity-40 cursor-not-allowed' : ''
        }`}
        title={label}
        aria-pressed={active}
        aria-current={active ? 'page' : undefined}
      >
        <div
          className={`relative flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
            active ? 'bg-[var(--dashboard-mauve-soft,rgba(181,54,155,0.12))]' : 'group-hover:bg-slate-100/70'
          }`}
        >
          <FaIcon
            icon={icon}
            size={18}
            aria-hidden="true"
            className={`transition-colors duration-200 ${
              active ? theme.accent : 'text-[#737067] group-hover:text-[#141414]'
            }`}
          />
          {badge > 0 && (
            <span className="absolute right-1.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-semibold text-white ring-2 ring-white">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
          {dot && badge === 0 && <AttentionDot />}
        </div>
        <span
          className={`relative truncate text-[9.5px] typo-ui font-semibold uppercase tracking-[0.1em] transition-colors duration-200 ${
            active ? theme.accent : 'text-[#737067] group-hover:text-[#141414]'
          }`}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      className={`group relative w-full touch-manipulation text-start rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--dashboard-mauve,#b5369b)] ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      }`}
      title={label}
      aria-pressed={active}
      aria-current={active ? 'page' : undefined}
    >
      <div className={`relative flex items-center gap-3 mx-1.5 my-0.5 px-2 py-2 transition-colors duration-200 rounded-[8px] ${
        active ? 'bg-[var(--dashboard-mauve-soft,rgba(181,54,155,0.1))]' : 'group-hover:bg-[var(--dashboard-mauve-soft,rgba(181,54,155,0.1))]/50'
      }`}>
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <FaIcon
            icon={icon}
            size={18}
            aria-hidden="true"
            className={`transition-colors duration-200 ${
              active ? theme.accent : 'text-[#737067] group-hover:text-[#141414]'
            }`}
          />
          {badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
          {dot && badge === 0 && <AttentionDot />}
        </div>

        <span
          className={`block overflow-hidden whitespace-nowrap typo-ui text-[13px] font-medium tracking-wide transition-all duration-300 max-w-0 opacity-0 group-hover/sidebar:max-w-[180px] group-hover/sidebar:opacity-100 group-focus-within/sidebar:max-w-[180px] group-focus-within/sidebar:opacity-100 ${
            active ? theme.accent : 'text-[#5a564e] group-hover:text-[#141414]'
          }`}
        >
          {label}
        </span>
      </div>
    </button>
  );
};

interface ControlEntry {
  key: ControlItemKey;
  icon: IconDefinition;
  label: string;
  mobileLabel?: string;
  group: 'main' | 'footer';
  onClick: () => void;
  onLongPress?: () => void;
  badge?: number;
  dot?: boolean;
  disabled?: boolean;
}

const ControlBlade: React.FC<ControlBladeProps> = ({ onOpenModal, onLogout, activeModal = null, isProf = false, sessionStatus = 'idle', sessionBusy = false, onControlSession }) => {
  const { lang, dir } = useI18n();
  const tr = useCallback((fr: string, ar: string) => lang === 'ar' ? ar : fr, [lang]);
  const activeItem: ControlItemKey | null = activeModal;
  const isMobile = useIsMobile();
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const el = mobileNavRef.current;
    if (!isMobile || !el) {
      root.style.setProperty('--app-nav-h', '0px');
      return;
    }
    const publish = () => root.style.setProperty('--app-nav-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--app-nav-h', '0px');
    };
  }, [isMobile]);

  const entries = useMemo<ControlEntry[]>(() => {
    if (isProf) {
      const profEntries: ControlEntry[] = [];
      const running = sessionStatus === 'running';
      const paused = sessionStatus === 'paused';

      if (onControlSession) {
        if (running) {
          profEntries.push({
            key: 'session_pause',
            icon: faPause,
            label: tr('Mettre en pause', 'إيقاف مؤقت'),
            mobileLabel: tr('Pause', 'إيقاف'),
            group: 'main',
            onClick: () => onControlSession('paused'),
            disabled: sessionBusy,
          });
          profEntries.push({
            key: 'session_stop',
            icon: faStop,
            label: tr('Arrêter la séance', 'إنهاء الحصة'),
            mobileLabel: tr('Arrêter', 'إنهاء'),
            group: 'main',
            onClick: () => onControlSession('stopped'),
            disabled: sessionBusy,
          });
        } else if (paused) {
          profEntries.push({
            key: 'session_resume',
            icon: faPlay,
            label: tr('Reprendre la séance', 'استئناف الحصة'),
            mobileLabel: tr('Reprendre', 'استئناف'),
            group: 'main',
            onClick: () => onControlSession('running'),
            disabled: sessionBusy,
          });
          profEntries.push({
            key: 'session_stop',
            icon: faStop,
            label: tr('Arrêter la séance', 'إنهاء الحصة'),
            mobileLabel: tr('Arrêter', 'إنهاء'),
            group: 'main',
            onClick: () => onControlSession('stopped'),
            disabled: sessionBusy,
          });
        } else {
          profEntries.push({
            key: 'session_start',
            icon: faPlay,
            label: tr('Démarrer la séance', 'بدء الحصة'),
            mobileLabel: tr('Démarrer', 'بدء'),
            group: 'main',
            onClick: () => onControlSession('running'),
            disabled: sessionBusy,
          });
        }
      }

      profEntries.push(
        { key: 'notification', icon: faClockRotateLeft, label: tr('Historique', 'السجل'), group: 'main', onClick: () => onOpenModal('notification') },
        { key: 'settings', icon: faGear, label: tr('Paramètres', 'الإعدادات'), mobileLabel: tr('Réglages', 'إعدادات'), group: 'footer', onClick: () => onOpenModal('settings') }
      );

      return profEntries;
    }
    return [
      { key: 'orientation', icon: faCompass, label: tr('Orientation & Conseils', 'التوجيه والنصائح'), mobileLabel: tr('Orientation', 'التوجيه'), group: 'main', onClick: () => onOpenModal('orientation') },
      { key: 'help', icon: faCircleQuestion, label: tr('Aide', 'المساعدة'), group: 'main', onClick: () => onOpenModal('help'), onLongPress: onLogout },
      { key: 'settings', icon: faGear, label: tr('Paramètres', 'الإعدادات'), mobileLabel: tr('Réglages', 'إعدادات'), group: 'footer', onClick: () => onOpenModal('settings') },
    ];
  }, [isProf, onOpenModal, onLogout, sessionStatus, sessionBusy, onControlSession, tr]);

  if (isMobile) {
    return (
      <nav ref={mobileNavRef} className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--dashboard-mauve-border,rgba(181,54,155,0.2))] bg-white/90 backdrop-blur-[24px] shadow-[0_-4px_24px_rgba(181,54,155,0.10)] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="relative flex items-center justify-around gap-1 px-2 pt-1.5">
          {entries.map((entry) => (
            <ControlItem
              key={entry.key}
              itemKey={entry.key}
              icon={entry.icon}
              label={entry.mobileLabel ?? entry.label}
              onClick={entry.onClick}
              onLongPress={entry.onLongPress}
              badge={entry.badge}
              dot={entry.dot}
              disabled={entry.disabled}
              active={activeItem === entry.key}
              mobile
            />
          ))}
        </div>
      </nav>
    );
  }

  const renderGroup = (group: ControlEntry['group']) =>
    entries
      .filter((entry) => entry.group === group)
      .map((entry) => (
        <ControlItem
          key={entry.key}
          itemKey={entry.key}
          icon={entry.icon}
          label={entry.label}
          onClick={entry.onClick}
          onLongPress={entry.onLongPress}
          badge={entry.badge}
          dot={entry.dot}
          disabled={entry.disabled}
          active={activeItem === entry.key}
        />
      ));

  return (
    <nav dir={dir} className={`peer group/sidebar flex typo-ui absolute top-0 bottom-0 z-50 w-[60px] hover:w-[232px] focus-within:w-[232px] overflow-hidden py-3 transition-[width] duration-300 ease-out bg-white/75 backdrop-blur-2xl ${dir === 'rtl' ? 'right-0 border-l border-[var(--dashboard-mauve-border,rgba(181,54,155,0.2))] shadow-[-2px_0_18px_rgba(181,54,155,0.07)]' : 'left-0 border-r border-[var(--dashboard-mauve-border,rgba(181,54,155,0.2))] shadow-[2px_0_18px_rgba(181,54,155,0.07)]'}`}>
      <div className="relative flex h-full w-full flex-col justify-between overflow-hidden">
        <div className="space-y-1">{renderGroup('main')}</div>
        <div className="pt-2">{renderGroup('footer')}</div>
      </div>
    </nav>
  );
};

export default memo(ControlBlade);
