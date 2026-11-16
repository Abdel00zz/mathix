
import React, { memo } from 'react';
import { faCircleQuestion, faLightbulb } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { useI18n } from '../../../i18n/I18nContext';

interface HintButtonProps {
    isActive: boolean;
    onClick: () => void;
    hasHint: boolean;
}

const HintButton = memo(({ isActive, onClick, hasHint }: HintButtonProps) => {
    const { t } = useI18n();
    if (!hasHint) return <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 print:hidden" />;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all duration-300 ease-out print:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isActive
                    ? 'bg-amber-400/80 text-white shadow-sm shadow-amber-300/30 opacity-100 scale-100'
                    : 'bg-transparent text-slate-300/70 hover:text-amber-500/80 hover:bg-amber-50/40 opacity-60 hover:opacity-100'
            } active:scale-95`}
            title={isActive ? t('common.hide') : t('common.show')}
            aria-expanded={isActive}
            aria-label={isActive ? t('common.hide') : t('common.show')}
        >
            {isActive ? <FaIcon icon={faLightbulb} size={15} className="drop-shadow-sm" /> : <FaIcon icon={faCircleQuestion} size={15} />}
        </button>
    );
});

export default HintButton;
