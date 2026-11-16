import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, translations, type Language } from './translations';
import { I18nContext, type I18nContextValue } from './I18nContext';
import { getBrandAssets } from './brandAssets';

const STORAGE_KEY = 'mathplus:lang';

function readInitialLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ar' || stored === 'fr') return stored;
  } catch { /* stockage restreint */ }
  return DEFAULT_LANGUAGE;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(readInitialLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* stockage restreint */ }
  }, []);

  // Applique la langue et la direction sur <html> (RTL pour l'arabe).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    const { icon } = getBrandAssets(lang);
    const appName = lang === 'ar' ? 'تعلم بذكاء' : 'Apprendre intelligemen';
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')
      .forEach(link => { link.href = icon; });
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', appName);
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute(
      'href',
      lang === 'ar' ? '/manifest-ar.webmanifest' : '/manifest.webmanifest',
    );
    document.title = appName;
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    setLang,
    t: (key, vars) => {
      const raw = translations[lang][key];
      return typeof raw === 'string' ? interpolate(raw, vars) : key;
    },
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
