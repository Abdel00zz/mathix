import type { Language } from './translations';

/** Marque adaptée à la langue active : signature large ou icône compacte. */
export function getBrandAssets(lang: Language) {
  const isArabic = lang === 'ar';
  return {
    icon: isArabic ? '/icone-ar.png' : '/icone.png',
    logo: isArabic ? '/logo-ar.png' : '/logo.png',
    alt: isArabic ? 'تعلم بذكاء' : 'Apprendre intelligemen',
  };
}
