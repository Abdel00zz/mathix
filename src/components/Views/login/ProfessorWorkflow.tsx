import { faPenNib, faDesktop, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { useI18n } from '../../../i18n/I18nContext';
import { FaIcon } from '../../UI/FaIcon';

/** Présentation concise des fonctions du studio professeur. */
export function ProfessorWorkflow() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const steps = [
    { icon: faPenNib, title: ar ? 'إنشاء وتعديل' : 'Créer et éditer', detail: ar ? 'ملخصات، تمارين واختبارات.' : 'Cours, exercices et quiz.' },
    { icon: faDesktop, title: ar ? 'معاينة فورية' : 'Prévisualiser', detail: ar ? 'تحقّق من العرض قبل النشر.' : 'Contrôle direct sur tout écran.' },
    { icon: faPaperPlane, title: ar ? 'نشر ومتابعة' : 'Publier et suivre', detail: ar ? 'مشاركة مع الأقسام ومتابعة النتائج.' : 'Diffusion ciblée par classe.' },
  ];
  return (
    <div className="ts-prof-studio-card w-full max-w-md rounded-2xl border border-slate-200/90 bg-slate-50/75 p-[clamp(1.25rem,2.4vw,1.75rem)] text-start shadow-[0_18px_40px_-28px_rgba(0,8,90,0.22)]" dir={ar ? 'rtl' : 'ltr'}>
      <p className="mb-4 text-[11.5px] font-extrabold uppercase tracking-wider text-[#5066dc]">
        {ar ? 'أدوات الأستاذ' : 'Studio professeur'}
      </p>
      <ol className="space-y-3.5">
        {steps.map(({ icon, title, detail }, index) => (
          <li key={index} className="ts-studio-step flex items-center gap-3.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef2ff] text-[#5066dc]">
              <FaIcon icon={icon} size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14.5px] font-bold leading-tight text-[#00085a]">{title}</h3>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
