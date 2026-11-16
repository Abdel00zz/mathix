import React, { useState, useEffect } from 'react';
import { faXmark, faShareFromSquare, faDownload } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from './FaIcon';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useI18n } from '../../i18n/I18nContext';
import { getBrandAssets } from '../../i18n/brandAssets';
import Button from './Button';
import { buttonClasses, ui } from './designSystem';

interface Props { afterLogin?: boolean }

export const PWAInstallPrompt: React.FC<Props> = ({ afterLogin = false }) => {
  const { canPrompt, isIOS, isInstalled, isDismissed, readyToShow, triggerShow, promptInstall, dismiss } = usePWAInstall();
  const { lang, dir } = useI18n();
  const [show, setShow] = useState(false);
  const brand = getBrandAssets(lang);
  const copy = lang === 'ar' ? {
    title: 'تثبيت تعلم بذكاء', dismiss: 'تجاهل', description: 'ولوج سريع، مراجعة دون اتصال ووضع ملء الشاشة.',
    share: 'مشاركة ← ', home: 'إضافة إلى الشاشة الرئيسية', install: 'تثبيت',
  } : {
    title: 'Installer Apprendre intelligemen', dismiss: 'Ignorer', description: 'Accès rapide, révisions hors ligne et mode plein écran.',
    share: 'Partager → ', home: "Sur l'écran d'accueil", install: 'Installer',
  };

  useEffect(() => {
    if (!afterLogin || isInstalled || isDismissed || readyToShow) return;
    // Show after 3 seconds of login to not overlap with other initial loading content
    const t = setTimeout(() => triggerShow(), 3000);
    return () => clearTimeout(t);
  }, [afterLogin, isInstalled, isDismissed, readyToShow, triggerShow]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (readyToShow && canPrompt && !isInstalled && !isDismissed) {
      timeoutId = setTimeout(() => setShow(true), 0);
    }
    return () => clearTimeout(timeoutId);
  }, [readyToShow, canPrompt, isInstalled, isDismissed]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isInstalled && show) {
      timeoutId = setTimeout(() => setShow(false), 0);
    }
    return () => clearTimeout(timeoutId);
  }, [isInstalled, show]);

  const handleClose = () => { setShow(false); dismiss(); };

  const handleInstall = async () => {
    const ok = await promptInstall();
    if (ok) setShow(false);
  };

  if (!show) return null;

  return (
    <div dir={dir} className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 z-[99999] sm:w-[clamp(20.5rem,24vw,23.5rem)] p-[clamp(0.8rem,1.6vw,1rem)] flex gap-[clamp(0.65rem,1.4vw,0.9rem)] items-start will-change-transform ${lang === 'ar' ? 'font-arabic' : 'typo-ui'} ${ui.surface.toast}`}
         style={{ animation: 'pwa-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
      <style>{`@keyframes pwa-slide-up { 0% { transform: translateY(120%); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }`}</style>
      
      <div className="w-[clamp(2.4rem,2.2rem_+_0.8vw,2.85rem)] h-[clamp(2.4rem,2.2rem_+_0.8vw,2.85rem)] flex items-center justify-center shrink-0">
         <img src={brand.icon} alt={brand.alt} className="w-full h-full rounded-xl object-contain drop-shadow-sm" />
      </div>
      
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <p className="text-[clamp(0.85rem,0.82rem_+_0.16vw,0.95rem)] text-slate-800 font-bold leading-none tracking-tight truncate">
              {copy.title}
            </p>
          </div>
          <button onClick={handleClose} 
                  className={buttonClasses({ variant: 'ghost', size: 'icon-sm', className: '-mt-1 -mr-1 rounded-full shrink-0 text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600' })}
                  aria-label={copy.dismiss}>
            <FaIcon icon={faXmark} size={14} aria-hidden="true" />
          </button>
        </div>
        
        <p className="text-[clamp(0.72rem,0.69rem_+_0.15vw,0.82rem)] text-slate-500 mt-1.5 leading-[1.3] font-medium pr-1">
          {copy.description}
        </p>

        <div className="mt-3 flex items-center gap-2 relative">
          {isIOS ? (
            <div className="flex w-full items-center justify-center gap-1.5 text-[clamp(0.68rem,0.65rem_+_0.14vw,0.76rem)] text-slate-600 bg-white px-[clamp(0.65rem,1.4vw,0.9rem)] py-1.5 rounded-lg border border-slate-200 font-medium">
              <FaIcon icon={faShareFromSquare} size={13} className="text-pistachio-500" aria-hidden="true" />
              <span>{copy.share}<strong>{copy.home}</strong></span>
            </div>
          ) : (
            <Button onClick={handleInstall} size="xs" fullWidth className="flex-1">
              <FaIcon icon={faDownload} size={13} aria-hidden="true" />
              {copy.install}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
