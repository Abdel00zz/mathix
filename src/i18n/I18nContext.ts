import { createContext, useContext } from 'react';
import { DEFAULT_LANGUAGE, translations, type Language, type TranslationKey } from './translations';

export type I18nContextValue = {
  lang: Language;
  /** Direction d'écriture : `rtl` pour l'arabe, `ltr` sinon. */
  dir: 'ltr' | 'rtl';
  /** Traduit une clé (interpolation `{var}` optionnelle). */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: Language) => void;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé à l’intérieur de I18nProvider');
  return ctx;
}

/**
 * Repli réservé aux composants rendus isolément (tests et aperçus). Dans
 * l’application, `useI18n` reste la règle ; ce helper évite qu’un bouton de
 * quiz testé hors arbre applicatif échoue uniquement faute de provider.
 */
export function useOptionalI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;

  return {
    lang: DEFAULT_LANGUAGE,
    dir: 'ltr',
    setLang: () => undefined,
    t: (key, vars) => {
      let value = translations[DEFAULT_LANGUAGE][key];
      if (vars) {
        value = value.replace(/\{(\w+)\}/g, (match, variable) => (
          variable in vars ? String(vars[variable]) : match
        ));
      }
      return value;
    },
  };
}
