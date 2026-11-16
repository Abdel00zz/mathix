import React from 'react';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import type { CorrectionProgress } from './types';
import { useI18n } from '../../../i18n/I18nContext';

/** Contrôleur compact et harmonieux de la progression des étapes d'aide (sans bouton reset). */
const CorrectionProgressControl: React.FC<{ progress: CorrectionProgress }> = ({ progress }) => {
  const { dir, t } = useI18n();
  return <div className="inline-flex items-center gap-0.5 bg-[#fbf9f4] backdrop-blur-md rounded-full border border-[#19788c]/80 px-1 py-0.5 h-[26px] shadow-2xs font-itim" aria-label={t('common.correction')}>
    <button
      type="button"
      onClick={progress.previous}
      disabled={progress.step === 1}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[#19788c] hover:bg-[#e0f2fe] disabled:opacity-30 disabled:hover:bg-transparent transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19788c]"
      aria-label={t('common.previous')}
      title={t('common.previous')}
    >
      <FaIcon icon={dir === 'rtl' ? faChevronRight : faChevronLeft} size={11} />
    </button>
    <span className="px-1 text-[0.8rem] font-bold text-[#19788c] select-none min-w-[24px] text-center font-itim" aria-live="polite">
      {progress.step}/{progress.maxStep}
    </span>
    <button
      type="button"
      onClick={progress.next}
      disabled={progress.step === progress.maxStep}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#19788c] text-white hover:bg-[#0284c7] disabled:bg-[#19788c]/20 disabled:text-[#19788c]/40 transition active:scale-90 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19788c]"
      aria-label={t('common.next')}
      title={t('common.next')}
    >
      <FaIcon icon={dir === 'rtl' ? faChevronLeft : faChevronRight} size={11} />
    </button>
  </div>
};

export default React.memo(CorrectionProgressControl);
