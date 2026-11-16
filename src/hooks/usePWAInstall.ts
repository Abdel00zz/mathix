import { useState, useEffect, useCallback } from 'react';

const INSTALLED_KEY = 'mathplus:pwa-installed';
const DISMISSED_KEY = 'mathplus:pwa-dismissed';

const isIOSDevice = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());

const isMobileOrTabletDevice = () =>
  typeof navigator !== 'undefined' &&
  (/android|iphone|ipad|ipod|tablet|mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isStandalonePWA = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone);

const wasMarkedInstalled = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(INSTALLED_KEY) === '1';

const isDismissedUntilLater = () => {
  if (typeof localStorage === 'undefined') return false;
  const value = localStorage.getItem(DISMISSED_KEY);
  return !!value && parseInt(value, 10) > Date.now();
};

export const usePWAInstall = () => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isIOS] = useState(isIOSDevice);
  const [isInstalled, setIsInstalled] = useState(() => isStandalonePWA());
  const [readyToShow, setReadyToShow] = useState(false);
  const [isMobileDevice] = useState(isMobileOrTabletDevice);

  useEffect(() => {
    // ── Déjà installée ? ────────────────────────────────────────────────
    if (isStandalonePWA()) {
      localStorage.setItem(INSTALLED_KEY, '1');
      return; // rien à faire
    }

    // Si l'utilisateur a supprimé l'app installée, ne pas bloquer à vie le prompt
    // avec l'ancien marqueur localStorage. Le navigateur reste la source de vérité.
    if (wasMarkedInstalled()) {
      localStorage.removeItem(INSTALLED_KEY);
    }

    // ── Android/Chrome : capturer beforeinstallprompt ────────────────────
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // ── Détection installation réussie ──────────────────────────────────
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
      localStorage.setItem(INSTALLED_KEY, '1');
    };
    window.addEventListener('appinstalled', onInstalled);

    // ── Écouter changement display-mode en continu ──────────────────────
    const mql = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        localStorage.setItem(INSTALLED_KEY, '1');
      }
    };
    mql.addEventListener('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mql.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const triggerShow = useCallback(() => setReadyToShow(true), []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      setIsInstalled(true);
      localStorage.setItem(INSTALLED_KEY, '1');
      return true;
    }
    return false;
  }, [installPrompt]);

  const [isDismissed, setIsDismissed] = useState(isDismissedUntilLater);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, (Date.now() + 86400000).toString());
    setIsDismissed(true);
  }, []);

  return {
    canPrompt: (!!installPrompt || isIOS) && !isInstalled && isMobileDevice,
    isIOS,
    isInstalled,
    isDismissed,
    readyToShow,
    triggerShow,
    promptInstall,
    dismiss,
    isMobileDevice,
  };
};
