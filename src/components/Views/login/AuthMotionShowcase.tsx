import React, { useEffect, useState } from 'react';
import {
  faCircleCheck,
  faCircleQuestion,
  faCompass,
  faLayerGroup,
  faLightbulb,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { useI18n } from '../../../i18n/I18nContext';
import type { AuthRole } from './AuthPanel';

interface AuthMotionShowcaseProps {
  previewRole: AuthRole | null;
}

const PHASE_PROGRESS = [36, 68, 96] as const;

/**
 * Constellation d'étude « Original Light » : composition spatiale claire, aérée
 * et interactive cohérente avec les jetons de l'interface session élève.
 */
export const AuthMotionShowcase: React.FC<AuthMotionShowcaseProps> = ({ previewRole }) => {
  const { lang } = useI18n();
  const isArabic = lang === 'ar';
  const isProf = previewRole === 'prof';
  const [activePhase, setActivePhase] = useState<number>(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePhase(prev => (prev + 1) % 3);
    }, 3800);
    return () => window.clearInterval(timer);
  }, []);

  const dockItems = isArabic
    ? ['٠١ · افهم', '٠٢ · اختبر', '٠٣ · تقدّم']
    : ['01 · Comprendre', '02 · Se tester', '03 · Progresser'];

  const phaseBadges = isArabic
    ? [
        { text: 'الخطوة ٠١ · المفاهيم الأساسية', tone: 'is-mauve' },
        { text: 'الخطوة ٠٢ · تحقق هادئ', tone: 'is-violet' },
        { text: 'الخطوة ٠٣ · تقدّم مستمر', tone: 'is-mint' },
      ]
    : [
        { text: 'ÉTAPE 01 · NOTIONS CLÉS', tone: 'is-mauve' },
        { text: 'ÉTAPE 02 · VALIDATION DOUCE', tone: 'is-violet' },
        { text: 'ÉTAPE 03 · PROGRESSION CONTINUE', tone: 'is-mint' },
      ];

  const steps = isArabic
    ? [
        {
          icon: faCircleCheck,
          title: '١. الدرس',
          meta: 'مكتمل · الأساسيات واضحة',
          action: 'مراجعة',
          baseTone: 'is-done',
        },
        {
          icon: faCircleQuestion,
          title: '٢. اختبار',
          meta: 'جارٍ · ثبّت مكتسباتك',
          action: 'متابعة',
          baseTone: 'is-active',
        },
        {
          icon: faLayerGroup,
          title: '٣. تمارين',
          meta: 'متاح · تدريب مركّز',
          action: 'بدء',
          baseTone: 'is-ready',
        },
      ]
    : [
        {
          icon: faCircleCheck,
          title: '1. Leçon',
          meta: 'Terminé · L’essentiel est clair',
          action: 'REVOIR',
          baseTone: 'is-done',
        },
        {
          icon: faCircleQuestion,
          title: '2. Quiz',
          meta: 'En cours · Validez vos acquis',
          action: 'CONTINUER',
          baseTone: 'is-active',
        },
        {
          icon: faLayerGroup,
          title: '3. Exercices',
          meta: 'Disponible · Entraînement ciblé',
          action: 'COMMENCER',
          baseTone: 'is-ready',
        },
      ];

  const currentPhase = phaseBadges[activePhase] ?? phaseBadges[0];
  const progressWidth = PHASE_PROGRESS[activePhase] ?? PHASE_PROGRESS[0];

  return (
    <div className="ts-motion-showcase ts-session-showcase" aria-hidden="true">
      <div className="ts-light-aurora is-rose" />
      <div className="ts-light-aurora is-lilac" />
      <div className="ts-light-aurora is-sun" />
      <div className="ts-light-grid" />

      <svg
        className="ts-light-trajectory-svg"
        viewBox="0 0 640 720"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="tsLightPathGrad" x1="0" y1="560" x2="640" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#b5369b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.42" />
          </linearGradient>
        </defs>
        <path
          id="tsLightSplinePath"
          d="M -20 560 C 180 420, 120 230, 320 260 C 500 290, 440 120, 660 60"
          stroke="url(#tsLightPathGrad)"
          strokeWidth="2"
          strokeDasharray="6 7"
          strokeLinecap="round"
        />
        <circle className="ts-light-orbit-pearl" r="5" fill="#ffffff" stroke="#b5369b" strokeWidth="2.2">
          <animateMotion
            dur="9s"
            repeatCount="indefinite"
            path="M -20 560 C 180 420, 120 230, 320 260 C 500 290, 440 120, 660 60"
          />
        </circle>
      </svg>

      <div className="ts-light-constellation">
        {/* ── En-tête éditorial aérien ── */}
        <header className="ts-light-header">
          <div className="ts-light-dock">
            {dockItems.map((label, index) => (
              <button
                key={label}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActivePhase(index)}
                onClick={() => setActivePhase(index)}
                className={`ts-light-dock-pill ${activePhase === index ? 'is-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <h2 className="ts-light-headline">
            {isProf ? (
              isArabic ? (
                <>
                  الورشة السلسة التي تمنح{' '}
                  <span className="ts-light-script">متعة التعلّم.</span>
                </>
              ) : (
                <>
                  L’atelier fluide qui donne{' '}
                  <span className="ts-light-script">envie d’apprendre.</span>
                </>
              )
            ) : isArabic ? (
              <>
                الفضاء الهادئ حيث يصبح كل شيء{' '}
                <span className="ts-light-script">أكثر وضوحاً.</span>
              </>
            ) : (
              <>
                L’espace calme où tout devient{' '}
                <span className="ts-light-script">plus clair.</span>
              </>
            )}
          </h2>
        </header>

        {/* ── Scène spatiale asymétrique ── */}
        <div className="ts-light-spatial-stage">
          <div className="ts-light-satellite is-top">
            <FaIcon icon={faCompass} size={13} className="ts-light-sat-icon" aria-hidden="true" />
            <span>
              {isArabic ? '١٥ د / يوم · بدون ضغط' : '15 min / jour · Zéro pression'}
            </span>
          </div>

          <article className="ts-light-focal-card">
            <div className="ts-light-card-top">
              <span className={`ts-light-phase-badge ${currentPhase.tone}`}>
                {currentPhase.text}
              </span>
              <span className="ts-light-ring-pill">
                <svg className="ts-light-ring-svg" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" stroke="#e2e8f0" strokeWidth="2.5" fill="none" />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                    pathLength={100}
                    strokeDasharray="100"
                    strokeDashoffset="0"
                    transform="rotate(-90 12 12)"
                  />
                </svg>
                <span>{isArabic ? 'استمرارية · ١٠٠٪' : 'Régularité · 100%'}</span>
              </span>
            </div>

            <div className="ts-session-progress">
              <span
                className="ts-session-progress-bar"
                style={{ width: `${progressWidth}%` }}
              />
            </div>

            <div className="ts-session-steps">
              {steps.map((step, index) => {
                const isHighlighted = activePhase === index;
                return (
                  <div
                    key={step.title}
                    onMouseEnter={() => setActivePhase(index)}
                    onClick={() => setActivePhase(index)}
                    className={`ts-session-step ${step.baseTone} ${isHighlighted ? 'is-highlighted' : ''}`}
                  >
                    <span className="ts-session-step-icon">
                      <FaIcon
                        icon={step.icon}
                        size={step.baseTone === 'is-ready' ? 14 : 15}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="ts-session-step-copy">
                      <span className="ts-session-step-title">{step.title}</span>
                      <span className="ts-session-step-meta">{step.meta}</span>
                    </div>
                    <span className="ts-session-step-action">{step.action}</span>
                  </div>
                );
              })}
            </div>
          </article>

          <aside className="ts-light-satellite is-bottom">
            <span className="ts-light-quote-icon">
              <FaIcon icon={faLightbulb} size={12} aria-hidden="true" />
            </span>
            <p className="ts-light-quote-text">
              {isArabic
                ? '« لا داعي للسرعة، الأهم أن تتقدّم كل يوم. »'
                : '« Pas besoin d’aller vite, l’essentiel est d’avancer chaque jour. »'}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
};
