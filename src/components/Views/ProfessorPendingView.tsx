import { useCallback, useEffect, useRef, useState } from 'react';
import {
  faCircleQuestion,
  faClock,
  faRightFromBracket,
  faComments,
  faRotateRight,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import type { UserProfile } from '../../types';
import { useI18n } from '../../i18n/I18nContext';
import HelpModal from '../Modals/HelpModal';

interface ProfessorPendingViewProps {
  user: UserProfile;
  onRefresh: () => Promise<boolean>;
  onLogout: () => void;
}

export default function ProfessorPendingView({ user, onRefresh, onLogout }: ProfessorPendingViewProps) {
  const { lang } = useI18n();
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkStatus = useCallback(async (announce = true) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const activated = await onRefresh();
      if (announce && !activated) {
        setMessage(lang === 'ar' ? 'لا يزال طلبك قيد المراجعة.' : 'Votre demande est toujours en cours de vérification.');
      }
    } catch {
      if (announce) setMessage(lang === 'ar' ? 'تعذّر التحقق الآن. حاول لاحقاً.' : 'Vérification indisponible. Réessayez dans un moment.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [lang, onRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => { void checkStatus(false); }, 20_000);
    return () => window.clearInterval(timer);
  }, [checkStatus]);

  return (
    <div className="min-h-dvh overflow-y-auto bg-[linear-gradient(145deg,#fff7f5,#fbe7e6)] px-4 py-8 sm:px-6 sm:py-12" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="login-prof-contact mx-auto w-full max-w-3xl rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_80px_-34px_rgba(113,38,45,.35)] sm:p-8">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700" aria-hidden="true"><FaIcon icon={faClock} size={24} /></div>
        <div className="login-prof-contact-heading">
          <span>{lang === 'ar' ? 'طلب أستاذ قيد المراجعة' : 'Demande professeur en attente'}</span>
          <h1>{lang === 'ar' ? `تم إنشاء حسابك، ${user.firstName || user.name}.` : `Votre compte est créé, ${user.firstName || user.name}.`}</h1>
          <p>{lang === 'ar' ? 'تبقى جلستك في وضع الانتظار إلى أن يتحقق المشرف من الطلب ويُفعّل فضاء الأستاذ. لن تُمنح أي صلاحية للأستاذ قبل هذه الموافقة.' : 'Votre session reste en attente jusqu’à la vérification de votre demande par l’administrateur. Les outils professeur ne seront accessibles qu’après son activation.'}</p>
        </div>

        <div className="login-prof-capabilities">
          <div><strong>{lang === 'ar' ? 'الطلب مسجّل' : 'Demande enregistrée'}</strong><span>{lang === 'ar' ? 'تم حفظ الاسم ورقم الهاتف والحساب بأمان.' : 'Votre identité, votre numéro et votre compte sont enregistrés.'}</span></div>
          <div><strong>{lang === 'ar' ? 'مراجعة المشرف' : 'Validation administrateur'}</strong><span>{lang === 'ar' ? 'يتحقق المشرف من الطلب قبل منح الصلاحيات.' : 'L’administrateur contrôle puis accepte la demande.'}</span></div>
          <div><strong>{lang === 'ar' ? 'تفعيل فضاء الأستاذ' : 'Activation professeur'}</strong><span>{lang === 'ar' ? 'تظهر الأدوات المهنية تلقائياً بعد الموافقة.' : 'Les outils professionnels apparaissent après validation.'}</span></div>
        </div>

        <div className="login-prof-contact-box">
          <p>{lang === 'ar' ? 'لتأكيد طلبك أو تحديد حاجات فضائك، تواصل معنا على الرقم:' : 'Pour confirmer votre demande et préciser vos besoins, contactez-nous au :'}</p>
          <a href="tel:+2126756789" dir="ltr">+2126756789</a>
        </div>

        <div className="login-prof-contact-actions">
          <a href="https://wa.me/2126756789" target="_blank" rel="noopener noreferrer" className="is-primary"><FaIcon icon={faComments} size={16} aria-hidden="true" />{lang === 'ar' ? 'التواصل عبر واتساب' : 'Contacter sur WhatsApp'}</a>
          <button type="button" onClick={() => setHelpOpen(true)} className="is-secondary"><FaIcon icon={faCircleQuestion} size={16} aria-hidden="true" />{lang === 'ar' ? 'التعرّف على خدمات الأستاذ' : 'Découvrir l’espace professeur'}</button>
        </div>

        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <button type="button" onClick={() => void checkStatus()} disabled={checking} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"><FaIcon icon={faRotateRight} size={15} spin={checking} aria-hidden="true" />{checking ? (lang === 'ar' ? 'جارٍ التحقق…' : 'Vérification…') : (lang === 'ar' ? 'التحقق من التفعيل' : 'Vérifier l’activation')}</button>
          <button type="button" onClick={onLogout} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"><FaIcon icon={faRightFromBracket} size={15} aria-hidden="true" />{lang === 'ar' ? 'تسجيل الخروج' : 'Se déconnecter'}</button>
        </div>
        {message && <p role="status" className="mt-3 text-center text-xs font-semibold text-amber-700">{message}</p>}
        <p className="login-prof-contact-footnote inline-flex items-center justify-center gap-1.5"><FaIcon icon={faShieldHalved} size={13} aria-hidden="true" />{lang === 'ar' ? 'يُفحص وضع الحساب تلقائياً كل بضع ثوانٍ.' : 'Le statut du compte est vérifié automatiquement.'}</p>
      </main>
      <HelpModal variant="modal" isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
