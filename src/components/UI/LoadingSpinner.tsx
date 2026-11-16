import React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { getBrandAssets } from '../../i18n/brandAssets';
import { inferLoadingContext, type LoadingContext } from './loadingConfig';

export interface LoadingSpinnerProps {
  /** Libellé libre (rétrocompatibilité) ou titre personnalisé en mode section. */
  label?: string;
  /** Contexte typé prioritaire sur la détection par chaîne. */
  context?: LoadingContext;
  className?: string;
  /** Les formulations professionnelles restent distinctes de celles des élèves. */
  audience?: 'student' | 'professor';
  /** `page` = page de chargement unique plein écran ; `section` = indicateur intégré cohérent. */
  variant?: 'page' | 'section';
}

const LABELS: Record<'fr' | 'ar', Record<LoadingContext, string>> = {
  fr: {
    dashboard: 'Préparation du tableau de bord',
    lesson: 'Préparation de la leçon',
    problem: 'Préparation du problème',
    exercise: 'Préparation des exercices',
    quiz: 'Préparation du quiz',
    concours: 'Préparation du concours',
    profile: 'Chargement du profil',
    framework: 'Chargement du cadre référentiel',
    studio: 'Chargement du studio',
    general: 'Préparation de votre espace',
  },
  ar: {
    dashboard: 'جارٍ إعداد لوحة المتابعة',
    lesson: 'جارٍ إعداد الدرس',
    problem: 'جارٍ إعداد المسألة',
    exercise: 'جارٍ إعداد التمارين',
    quiz: 'جارٍ إعداد الاختبار',
    concours: 'جارٍ إعداد مباراة الولوج',
    profile: 'جارٍ تحميل الملف الشخصي',
    framework: 'جارٍ تحميل الإطار المرجعي',
    studio: 'جارٍ تحميل مساحة الإعداد',
    general: 'جارٍ إعداد فضائك',
  },
};

/** Page de chargement unique de l'application (plein écran ou intégrée à une section). */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label,
  context: explicitContext,
  className = '',
  audience: _audience,
  variant = 'page',
}) => {
  const { lang, dir } = useI18n();
  const resolvedContext = explicitContext ?? inferLoadingContext(label);
  const title = (variant === 'section' && label) ? label : LABELS[lang][resolvedContext];

  if (variant === 'section') {
    return (
      <div
        className={['flex flex-col items-center justify-center px-4 py-12 text-center', className].filter(Boolean).join(' ')}
        role="status"
        aria-live="polite"
        aria-label={title}
        dir={dir}
      >
        <div className="mp-loading-track mp-loading-track--compact" aria-hidden="true">
          <span className="mp-loading-bar" />
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">{title}</p>
        <span className="sr-only">{lang === 'ar' ? 'جارٍ التحميل' : 'Chargement'}</span>
      </div>
    );
  }

  const brand = getBrandAssets(lang);
  const logoSizeClass = lang === 'ar'
    ? 'mp-loading-brand--ar aspect-[3/1]'
    : 'mp-loading-brand aspect-[3/2]';

  return (
    <div
      className={['mp-loading-page relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 text-center text-[#1A1714] sm:px-6', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={title}
      dir={dir}
    >
      <div className="mp-loading-page__grid" aria-hidden="true" />
      <section className="relative z-10 flex w-[min(560px,calc(100vw-28px))] flex-col items-center px-6 py-8 sm:px-10 sm:py-10">
        <div className={logoSizeClass}>
          <img src={brand.logo} alt="" className="h-full w-full object-contain" />
        </div>
        <div className="mp-loading-track mt-6" aria-hidden="true">
          <span className="mp-loading-bar" />
        </div>
        <span className="mt-[18px] px-2 text-center text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#476240]">
          {title}
        </span>
        <span className="sr-only">{lang === 'ar' ? 'جارٍ التحميل' : 'Chargement'}</span>
      </section>
    </div>
  );
};

export default LoadingSpinner;
