import React from 'react';
import CorrectionProgressControl from './CorrectionProgressControl';
import type { CorrectionProgress, CorrectionToggle } from './types';
import { useI18n } from '../../../i18n/I18nContext';

interface CanvasCorrectionTabProps {
  correctionToggle?: CorrectionToggle;
  correctionProgress?: CorrectionProgress;
  isResizing: boolean;
  isCanvasActive: boolean;
  colorName?: 'black' | 'green' | 'blue' | 'white' | 'cream' | '';
  styleName?: 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
}

/** Badge « Aide » fusionné sur la bordure supérieure du cadre + progression des étapes. */
const CanvasCorrectionTab: React.FC<CanvasCorrectionTabProps> = ({
  correctionToggle,
  correctionProgress,
  isResizing,
  isCanvasActive,
  colorName,
  styleName,
}) => {
  const { dir, t } = useI18n();
  if (!correctionToggle?.available) return null;

  const borderWidth = isResizing || isCanvasActive ? 2 : 1;
  const borderColor = isResizing
    ? '#64748b'
    : isCanvasActive
      ? '#0284c7'
      : (colorName === 'black' || (styleName === 'slate' && !colorName))
        ? '#1e293b'
        : colorName === 'green' ? '#14532d' : colorName === 'blue' ? '#1e3a8a' : colorName === 'cream' ? '#fcd34d' : '#a4b4c4';
  const bgColor = (colorName === 'black' || (styleName === 'slate' && !colorName))
    ? '#0f172a'
    : colorName === 'green' ? '#14532d' : colorName === 'blue' ? '#1e3a8a' : colorName === 'cream' ? '#fef3c7' : '#f4f1ea';
  const textColor = correctionToggle.visible
    ? '#0d9488'
    : (colorName === 'black' || colorName === 'green' || colorName === 'blue' || (styleName === 'slate' && !colorName))
      ? '#cbd5e1'
      : '#64748b';

  return (
    <div
      className={`absolute ${dir === 'rtl' ? 'left-6' : 'right-6'} z-30 flex items-end pointer-events-auto no-print`}
      style={{ top: isResizing || isCanvasActive ? '-26px' : '-25px' }}
    >
      {correctionProgress && correctionToggle.visible && (
        <div className="animate-in fade-in slide-in-from-right-2 duration-200 mr-2 mb-1">
          <CorrectionProgressControl progress={correctionProgress} />
        </div>
      )}
      <button
        type="button"
        aria-label={correctionToggle.visible ? t('common.hide') : t('common.startCorrection')}
        aria-pressed={correctionToggle.visible}
        onClick={correctionToggle.toggle}
        className="group/helpbtn relative flex items-center justify-center h-[26px] px-3.5 rounded-t-lg transition-colors duration-200 ease-out font-itim tracking-wide text-[0.88rem] font-bold"
        style={{
          backgroundColor: bgColor,
          borderTop: `${borderWidth}px solid ${borderColor}`,
          borderLeft: `${borderWidth}px solid ${borderColor}`,
          borderRight: `${borderWidth}px solid ${borderColor}`,
          borderBottom: `${borderWidth}px solid ${bgColor}`,
          color: textColor,
          boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.05), 0 -2px 4px -1px rgba(0, 0, 0, 0.03)',
          clipPath: 'inset(-10px -10px 0 -10px)',
        }}
        title={correctionToggle.visible ? t('common.hide') : t('common.startCorrection')}
      >
        <span>{t('common.correction')}</span>
      </button>
    </div>
  );
};

export default React.memo(CanvasCorrectionTab);
