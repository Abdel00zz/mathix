import React from 'react';
import { faLanguage } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../components/UI/FaIcon';
import { useI18n } from './I18nContext';

interface LanguageSwitcherProps {
  className?: string;
  variant?: 'default' | 'glass' | 'dark';
}

/** Bascule de langue FR / AR, compacte et réutilisable. */
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '', variant = 'glass' }) => {
  const { lang, setLang } = useI18n();

  const toggle = () => setLang(lang === 'fr' ? 'ar' : 'fr');

  const baseStyle = variant === 'glass'
    ? 'inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition-all duration-200 shadow-sm'
    : 'inline-flex items-center gap-1.5 rounded-full border border-[#D8DEEA]/80 bg-white/85 hover:bg-white text-[#1E2548] px-2.5 py-1 text-[11px] font-bold shadow-[0_10px_22px_-22px_rgba(30,37,72,0.5)] transition duration-200';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Changer de langue / تغيير اللغة"
      className={`${baseStyle} ${className} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5066dc] active:scale-[0.97]`}
    >
      <FaIcon icon={faLanguage} size={15} className={variant === 'glass' ? 'text-white/95' : 'text-[#3A5294]'} aria-hidden="true" />
      <span>{lang === 'fr' ? 'عربي' : 'Français'}</span>
    </button>
  );
};

export default LanguageSwitcher;
