
import React, { memo } from 'react';
import { faPrint } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { buttonClasses } from '@/components/UI/designSystem';
import { useI18n } from '../../../i18n/I18nContext';

interface PrintButtonProps {
    onClick: () => void;
}

const PrintButton = memo(({ onClick }: PrintButtonProps) => {
    const { t } = useI18n();
    return <button
        type="button"
        onClick={onClick}
        className={buttonClasses({ variant: 'quiet', size: 'icon-sm', className: 'rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' })}
        title={t('common.print')}
        aria-label={t('common.print')}
    >
        <FaIcon icon={faPrint} size={15} />
    </button>;
});

export default PrintButton;
