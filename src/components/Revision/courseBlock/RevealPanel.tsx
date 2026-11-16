import React from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { useI18n } from '../../../i18n/I18nContext';

interface RevealToggleButtonProps {
  isRevealed: boolean;
  controlsId: string;
  onToggle: () => void;
}

export const RevealToggleButton: React.FC<RevealToggleButtonProps> = ({
  isRevealed,
  controlsId,
  onToggle,
}) => {
  const { dir, t } = useI18n();
  return (
    <button
      type="button"
      dir={dir}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={isRevealed}
      aria-controls={controlsId}
      className="revision-reveal-toggle inline-flex items-center typo-ui cursor-pointer select-none"
    >
      <span>{isRevealed ? t('common.hide') : t('common.show')}</span>
      <FaIcon icon={faChevronDown} aria-hidden="true" className="revision-reveal-chevron" size={14} />
    </button>
  );
};

interface RevealPanelProps {
  id: string;
  open: boolean;
  everOpened: boolean;
  flat?: boolean;
  children: React.ReactNode;
}

export const RevealPanel: React.FC<RevealPanelProps> = ({
  id,
  open,
  everOpened,
  flat = false,
  children,
}) => (
  <div
    id={id}
    aria-hidden={!open}
    inert={!open ? true : undefined}
    className={`revision-reveal-grid grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
  >
    <div className="overflow-hidden min-h-0" style={{ pointerEvents: open ? 'auto' : 'none' }}>
      {!flat && <div className={`revision-reveal-divider ${open ? 'is-visible' : ''}`} aria-hidden="true"><span /></div>}
      {everOpened && (
        <div
          className="revision-reveal-content-shell"
          onClick={(event) => {
            const blank = (event.target as HTMLElement).closest('.math-blank');
            blank?.classList.add('revealed');
          }}
        >
          {children}
        </div>
      )}
    </div>
  </div>
);
