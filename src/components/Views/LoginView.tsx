import React, { useState, useRef, useEffect, memo } from 'react';
import { UserProfile, RootManifest } from '../../types';
import { storageService } from '../../services/storageService';
import { accountSessionService } from '../../services/accountSessionService';
import { AuthPanel, AuthMode, AuthRole } from './login/AuthPanel';
import { COLLEGE_CLASS_OPTIONS } from '../../constants/collegeClasses';
import LanguageSwitcher from '../../i18n/LanguageSwitcher';
import { useIsPhone, useIsPortrait } from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/I18nContext';
import { getBrandAssets } from '../../i18n/brandAssets';
import {
  faArrowLeft,
  faArrowRight,
  faUsers,
  faGaugeHigh,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';

import { authenticateAccount, accountErrorCode, accountErrorMessage } from '../../services/accountAuthService';
import { getApprendreUrl } from '../../services/cloudAuthClient';
import { normalizePhoneInput, isPhoneInputValid } from './login/phone';
import { useAuthNavigation } from './login/useAuthNavigation';
import { useRegistrationCatalog } from './login/useRegistrationCatalog';
import { ProfessorWorkflow } from './login/ProfessorWorkflow';
import { AuthMotionShowcase } from './login/AuthMotionShowcase';
import { TeetshRibbons, TeetshBrandBadge } from './login/TeetshBackdrop';
import { StudentSparkEmblem, TeacherAtelierEmblem } from './login/AuthIcons';

interface LoginViewProps {
  onLogin: (user: UserProfile) => void;
  onLogout?: () => void;
  manifest?: RootManifest | null;
  cachedUser?: UserProfile | null;
  authNotice?: 'session_expired' | null;
  onClearAuthNotice?: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  onLogout,
  manifest: propManifest = null,
  cachedUser,
  authNotice = null,
  onClearAuthNotice,
}) => {
  const route = useAuthNavigation();
  const role = route.role;
  const previewRole = route.screen === 'preview' ? role : null;
  const registrationStarted = route.screen === 'registration' || route.screen === 'connection';
  const openLoginOnStart = route.screen === 'connection';
  const { manifest, failed: catalogFailed, retry: retryCatalog } = useRegistrationCatalog(
    propManifest,
    route.screen === 'registration' && role === 'student',
  );
  const requestInFlight = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneDialCode, setPhoneDialCode] = useState('+212');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [existingUser, setExistingUser] = useState<UserProfile | null>(() => (
    cachedUser !== undefined ? cachedUser : (storageService.loadState().user || null)
  ));
  const [previousCachedUser, setPreviousCachedUser] = useState(cachedUser);
  const [previousAuthNotice, setPreviousAuthNotice] = useState<typeof authNotice>(null);
  const [returningCardDismissed, setReturningCardDismissed] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [mode, setMode] = useState<AuthMode>('lycee');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneLoginError, setPhoneLoginError] = useState<string | null>(null);
  const [isPhoneLogging, setIsPhoneLogging] = useState(false);
  const [landingRole, setLandingRole] = useState<'student' | 'prof'>('student');
  const isPhoneViewport = useIsPhone();
  const isPortrait = useIsPortrait();
  const { lang } = useI18n();
  const brand = getBrandAssets(lang);

  if (previousCachedUser !== cachedUser) {
    setPreviousCachedUser(cachedUser);
    if (cachedUser !== undefined) {
      setExistingUser(cachedUser);
      if (cachedUser) setReturningCardDismissed(false);
    }
  }

  if (previousAuthNotice !== authNotice) {
    setPreviousAuthNotice(authNotice);
    if (authNotice === 'session_expired') {
      setPhoneLoginError('session_expired');
      setReturningCardDismissed(true);
    }
  }

  useEffect(() => {
    if (authNotice === 'session_expired') {
      route.navigate('connection', 'student', 1, true);
      onClearAuthNotice?.();
    }
  }, [authNotice, onClearAuthNotice, route]);

  useEffect(() => {
    if (route.screen === 'registration' && role === 'student' && route.step === 2 && !selectedClassId) {
      route.navigate('registration', 'student', 1, true);
    }
  }, [route, role, selectedClassId]);

  useEffect(() => () => {
    activeControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const canEscapeOnboarding = registrationStarted && !(Boolean(existingUser) && route.screen === 'landing' && !returningCardDismissed);
    const canEscapePreview = previewRole === 'prof';
    if (!canEscapeOnboarding && !canEscapePreview) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (canEscapeOnboarding) {
        setRegistrationError(null);
        setPhoneLoginError(null);
        setReturningCardDismissed(true);
        route.navigate(route.screen === 'registration' && role === 'prof' ? 'preview' : 'landing');
      } else if (canEscapePreview) {
        setRegistrationError(null);
        setPhoneLoginError(null);
        route.navigate('landing', 'student', 1);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [existingUser, previewRole, registrationStarted, returningCardDismissed, role, route]);

  const beginRequest = () => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    requestInFlight.current = true;
    return controller;
  };

  const endRequest = (controller: AbortController) => {
    if (activeControllerRef.current !== controller) return false;
    activeControllerRef.current = null;
    requestInFlight.current = false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestInFlight.current) return;
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const selectedClass = manifest?.classes.find(c => c.id === selectedClassId)
      || COLLEGE_CLASS_OPTIONS.find(c => c.id === selectedClassId);
    if (role === 'student' && !selectedClass) {
      setRegistrationError('class_required');
      return;
    }
    if (firstName.trim().length < 2) {
      setRegistrationError('first_name_invalid');
      return;
    }
    if (lastName.trim().length < 2) {
      setRegistrationError('last_name_invalid');
      return;
    }
    const normalizedPhone = normalizePhoneInput(phone, phoneDialCode);
    if (!isPhoneInputValid(normalizedPhone, phoneDialCode)) {
      setRegistrationError('phone_invalid');
      return;
    }
    if (password.length < 6 || password.length > 128) {
      setRegistrationError('password_invalid');
      return;
    }

    const controller = beginRequest();
    setRegistrationError(null);
    setIsRegistering(true);
    try {
      const user = await authenticateAccount(
        'register',
        {
          name: fullName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: `${phoneDialCode}${normalizedPhone}`,
          classId: role === 'student' ? selectedClassId : '',
          className: role === 'student' ? selectedClass?.title || '' : '',
          password,
          requestedRole: role,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      onLogin(user);
    } catch (error) {
      if (!controller.signal.aborted) setRegistrationError(accountErrorCode(error));
    } finally {
      if (endRequest(controller)) setIsRegistering(false);
    }
  };

  const handlePhoneLogin = async (rawPhone: string, rawPassword: string, dialCode = '+212') => {
    if (requestInFlight.current) return;
    const normalizedPhone = normalizePhoneInput(rawPhone, dialCode);
    if (!isPhoneInputValid(normalizedPhone, dialCode)) {
      setPhoneLoginError('phone_invalid');
      return;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      setPhoneLoginError('password_invalid');
      return;
    }
    const controller = beginRequest();
    setPhoneLoginError(null);
    setIsPhoneLogging(true);
    try {
      const user = await authenticateAccount(
        'login',
        { phone: `${dialCode}${normalizedPhone}`, password: rawPassword },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) onLogin(user);
    } catch (error) {
      if (!controller.signal.aborted) setPhoneLoginError(accountErrorCode(error));
    } finally {
      if (endRequest(controller)) setIsPhoneLogging(false);
    }
  };

  const handleResume = async () => {
    if (!existingUser || requestInFlight.current) return;
    const controller = beginRequest();
    setPhoneLoginError(null);
    setIsPhoneLogging(true);
    try {
      const probe = await accountSessionService.getCurrentUserStatus({ signal: controller.signal });
      if (controller.signal.aborted) return;
      if (probe.status === 'authenticated') {
        onLogin(probe.user);
      } else if (probe.status === 'unauthenticated' || accountSessionService.hasPendingLogout()) {
        // Refus serveur explicite (401) : on ne contourne jamais l'authentification.
        storageService.clear();
        setExistingUser(null);
        setReturningCardDismissed(true);
        route.navigate('connection', existingUser.role === 'prof' || existingUser.requestedRole === 'prof' ? 'prof' : 'student', 1, true);
        setPhoneLoginError('session_expired');
      } else if (existingUser.role === 'prof' || existingUser.requestedRole === 'prof') {
        setPhoneLoginError('unavailable');
      } else {
        // Hors connexion uniquement, le profil élève local reste utilisable sans privilèges professeur.
        onLogin({ ...existingUser, role: 'student' });
      }
    } finally {
      if (endRequest(controller)) setIsPhoneLogging(false);
    }
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setSelectedClassId('');
    setRegistrationError(null);
  };

  const handleDialCodeChange = (nextDial: string) => {
    setPhoneDialCode(nextDial);
    setPhone(current => normalizePhoneInput(current, nextDial));
    setRegistrationError(null);
  };

  const clearErrors = () => {
    setRegistrationError(null);
    setPhoneLoginError(null);
  };

  const handleReset = () => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    requestInFlight.current = false;
    setIsRegistering(false);
    setIsPhoneLogging(false);
    setExistingUser(null);
    setReturningCardDismissed(true);
    setFirstName('');
    setLastName('');
    setPhone('');
    setSelectedClassId('');
    setPassword('');
    setConfirmPassword('');
    clearErrors();
    onClearAuthNotice?.();
    route.navigate('landing', 'student', 1);
    if (onLogout) {
      onLogout();
    } else {
      storageService.clear();
    }
  };

  const openRolePreview = (nextRole: AuthRole) => {
    clearErrors();
    setReturningCardDismissed(true);
    route.navigate('preview', nextRole);
  };
  const openRegistration = (nextRole: AuthRole) => {
    clearErrors();
    setReturningCardDismissed(true);
    route.navigate('registration', nextRole, 1);
  };
  const openConnection = () => {
    clearErrors();
    setReturningCardDismissed(true);
    route.navigate('connection', 'student', 1);
  };
  const returnToLanding = () => {
    clearErrors();
    setReturningCardDismissed(true);
    route.navigate(route.screen === 'registration' && role === 'prof' ? 'preview' : 'landing');
  };
  const closeRolePreview = () => {
    clearErrors();
    route.navigate('landing', 'student', 1);
  };

  const showReturningResume = Boolean(existingUser) && route.screen === 'landing' && !returningCardDismissed;
  const onboardingVisible = registrationStarted || showReturningResume;
  const isConnectionSurface = openLoginOnStart || showReturningResume;
  const isArabic = lang === 'ar';

  const handlePointerSpotlight = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (((event.clientX - rect.left) / rect.width) * 100).toFixed(1);
    const y = (((event.clientY - rect.top) / rect.height) * 100).toFixed(1);
    event.currentTarget.style.setProperty('--mx', `${x}%`);
    event.currentTarget.style.setProperty('--my', `${y}%`);
  };

  return (
    <div
      className={`mp-auth-experience ts-experience ts-split-shell ${onboardingVisible ? 'is-onboarding' : ''} ${previewRole ? 'is-role-preview' : ''}`}
      data-role={role}
      data-login-layout={isPhoneViewport ? (isPortrait ? 'phone-portrait' : 'phone-landscape') : 'wide'}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <div
        className={`ts-split-form-pane ${onboardingVisible ? 'mp-expanded-onboarding ts-onboarding' : 'mp-split-landing ts-landing'}`}
        data-preview-role={!onboardingVisible ? (previewRole || undefined) : undefined}
        data-auth-surface={onboardingVisible ? (isConnectionSurface ? 'connection' : 'registration') : undefined}
        aria-label={onboardingVisible ? (isConnectionSurface ? (isArabic ? 'تسجيل الدخول' : 'Connexion') : (isArabic ? 'إنشاء الحساب' : 'Création du compte')) : undefined}
        dir={isArabic ? 'rtl' : 'ltr'}
      >
        <TeetshRibbons />

        <header className="ts-top-bar">
          <TeetshBrandBadge
            icon={brand.icon}
            alt={brand.alt}
            title={isArabic ? 'تعلّم بذكاء' : 'Apprendre'}
          />
          <div className="ts-top-bar-actions">
            <LanguageSwitcher variant="glass" className="mp-language-control" />
          </div>
        </header>

        <div className="ts-stage">
          {!onboardingVisible && !previewRole && (
            <section
              className="ts-card ts-landing-card"
              aria-labelledby="auth-hero-title"
            >
              <div className="ts-card-intro">
                <p className="ts-editorial-badge">
                  <span className="ts-editorial-badge-dot" aria-hidden="true" />
                  <span>{isArabic ? 'فضاء الدراسة · الثانوي والإعدادي' : 'ESPACE D’ÉTUDE · LYCÉE & COLLÈGE'}</span>
                </p>
                <h1 id="auth-hero-title">
                  {isArabic ? (
                    <>
                      مفهوم واحد، واختبار واحد،{' '}
                      <span className="ts-editorial-accent">وخطوة إضافية.</span>
                    </>
                  ) : (
                    <>
                      Une notion, un quiz,{' '}
                      <span className="ts-editorial-accent">un pas de plus.</span>
                    </>
                  )}
                </h1>
                <p className="ts-hero-subtitle">
                  {landingRole === 'prof'
                    ? (isArabic
                      ? 'حضّر دروسك وتابع تقدّم تلاميذك في فضاء منظم.'
                      : 'Préparez vos classes et suivez la progression de vos élèves.')
                    : (isArabic
                      ? 'ملخصاتك واختباراتك وتمارينك في انتظارك. تابع من حيث توقفت.'
                      : 'Vos fiches, quiz et exercices vous attendent. Reprenez là où vous en étiez.')}
                </p>
              </div>

              {/* Sélecteur de rôle segmenté inspiré de Apprendre — Connexion */}
              <div className="ts-seyes-seg" role="radiogroup" aria-label={isArabic ? 'اختيار الفضاء' : 'Sélection du profil'}>
                <span className="ts-seyes-seg-ind" aria-hidden="true" />
                <input
                  type="radio"
                  name="seyes-role"
                  id="seyes-role-student"
                  value="student"
                  checked={landingRole === 'student'}
                  onChange={() => setLandingRole('student')}
                />
                <label htmlFor="seyes-role-student">
                  {isArabic ? 'تلميذ' : 'Élève'}
                </label>
                <input
                  type="radio"
                  name="seyes-role"
                  id="seyes-role-prof"
                  value="prof"
                  checked={landingRole === 'prof'}
                  onChange={() => setLandingRole('prof')}
                />
                <label htmlFor="seyes-role-prof">
                  {isArabic ? 'أستاذ' : 'Enseignant'}
                </label>
              </div>

              <main className="ts-landing-spaces">
                <section
                  className="ts-action-stack ts-stagger-1"
                  aria-labelledby="student-space-title"
                >
                  <h2 id="student-space-title" className="sr-only">
                    {isArabic ? 'فضاء التلميذ' : 'Espace Élève'}
                  </h2>
                  {landingRole === 'student' ? (
                    <button type="button" onClick={() => openRegistration('student')} className="ts-btn-primary">
                      <StudentSparkEmblem size={18} />
                      <span>{isArabic ? 'أنا تلميذ' : 'Je suis un élève'}</span>
                      <FaIcon icon={isArabic ? faArrowLeft : faArrowRight} size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    <button type="button" onClick={() => openRolePreview('prof')} className="ts-btn-primary">
                      <TeacherAtelierEmblem size={18} />
                      <span>{isArabic ? 'أنا أستاذ' : 'Je suis un prof'}</span>
                      <FaIcon icon={isArabic ? faArrowLeft : faArrowRight} size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={openConnection} className="ts-btn-secondary">
                    <span>{isArabic ? 'تسجيل الدخول' : 'Se connecter'}</span>
                  </button>
                </section>

                <div className="ts-prof-entry ts-stagger-2" aria-labelledby="teacher-space-title">
                  <span id="teacher-space-title" className="sr-only">
                    {isArabic ? 'فضاء الأستاذ' : 'Espace Professeur'}
                  </span>
                  <span className="ts-prof-prefix">
                    {isArabic ? 'أستاذ؟' : 'Enseignant ?'}
                  </span>
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={() => {
                      setLandingRole('prof');
                      openRolePreview('prof');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setLandingRole('prof');
                        openRolePreview('prof');
                      }
                    }}
                    className="ts-prof-label"
                  >
                    <TeacherAtelierEmblem size={16} />
                    <span className="ts-prof-label-text">{isArabic ? 'أنا أستاذ' : 'Je suis un prof'}</span>
                    <FaIcon icon={isArabic ? faArrowLeft : faArrowRight} size={12} className="ts-prof-label-arrow" aria-hidden="true" />
                  </span>
                </div>
              </main>
            </section>
          )}

          {!onboardingVisible && previewRole === 'prof' && (
            <main className="ts-card ts-preview-card ts-spotlight-surface" onPointerMove={handlePointerSpotlight} aria-labelledby="teacher-space-title">
              <div className="mp-role-preview mp-role-preview-teacher">
                <button type="button" onClick={closeRolePreview} className="mp-preview-back" aria-label={isArabic ? 'العودة إلى اختيار الفضاء' : 'Retour au choix'}>
                  <FaIcon icon={isArabic ? faArrowRight : faArrowLeft} size={17} aria-hidden="true" />
                </button>
                <div className="mp-preview-copy">
                  <h2 id="teacher-space-title">{isArabic ? 'حضّر أقل. تابع أفضل.' : 'Préparez moins. Accompagnez mieux.'}</h2>
                  <p>{isArabic
                    ? 'أنشئ مواردك واختباراتك، وانشرها لتلاميذك، وتابع النتائج من لوحة قيادة واحدة واضحة.'
                    : 'Créez vos ressources et vos quiz, diffusez-les à vos élèves et suivez les résultats depuis un tableau de bord unique.'}</p>
                  <div className="mp-preview-benefits">
                    <span><FaIcon icon={faUsers} size={16} aria-hidden="true" />{isArabic ? 'تدبير الأقسام والتلاميذ' : 'Classes et élèves centralisés'}</span>
                    <span><FaIcon icon={faGaugeHigh} size={16} aria-hidden="true" />{isArabic ? 'متابعة النتائج مباشرة' : 'Résultats suivis en temps réel'}</span>
                    <span><FaIcon icon={faShieldHalved} size={16} aria-hidden="true" />{isArabic ? 'فضاء يُفعّل بعد التحقق' : 'Espace activé après vérification'}</span>
                  </div>
                  <button type="button" onClick={() => openRegistration('prof')} className="mp-preview-primary">
                    <span>{isArabic ? 'إنشاء حسابي' : 'Créer mon compte'}</span>
                    <FaIcon icon={isArabic ? faArrowLeft : faArrowRight} size={15} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center justify-center p-[clamp(0.75rem,2vw,1.25rem)]"><ProfessorWorkflow /></div>
              </div>
            </main>
          )}

          {onboardingVisible && (
            <>
              <div
                className={`ts-card ts-auth-card ts-spotlight-surface ${isConnectionSurface || showReturningResume ? 'is-narrow' : 'is-wide'}`}
                onPointerMove={handlePointerSpotlight}
              >
                {role === 'student' && route.screen === 'registration' && route.step === 1 && mode === 'lycee' && !manifest && (
                  <div role="status" aria-live="polite" className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-[clamp(0.75rem,1.8vw,1rem)] text-[clamp(0.84rem,0.8rem_+_0.18vw,0.92rem)] text-slate-700">
                    {catalogFailed
                      ? (isArabic ? 'تعذّر تحميل مستويات الثانوي. يمكنك إعادة المحاولة أو اختيار الإعدادي.' : 'Les classes du lycée sont indisponibles. Réessayez ou choisissez le collège.')
                      : (isArabic ? 'جارٍ تحميل المستويات…' : 'Chargement des classes…')}
                    {catalogFailed && (
                      <button type="button" onClick={retryCatalog} className="ms-2 inline-flex min-h-11 items-center font-semibold text-[#5066dc] underline">
                        {isArabic ? 'إعادة المحاولة' : 'Réessayer'}
                      </button>
                    )}
                  </div>
                )}
                <AuthPanel
                  key={`${route.screen}:${role}`}
                  manifest={manifest}
                  existingUser={showReturningResume ? existingUser : null}
                  firstName={firstName}
                  setFirstName={setFirstName}
                  lastName={lastName}
                  setLastName={setLastName}
                  phone={phone}
                  setPhone={setPhone}
                  phoneDialCode={phoneDialCode}
                  setPhoneDialCode={handleDialCodeChange}
                  selectedClassId={selectedClassId}
                  setSelectedClassId={setSelectedClassId}
                  onSubmit={handleSubmit}
                  onResume={handleResume}
                  onReset={handleReset}
                  registrationError={accountErrorMessage(registrationError, lang)}
                  isRegistering={isRegistering}
                  mode={mode}
                  onModeChange={handleModeChange}
                  onPhoneLogin={handlePhoneLogin}
                  phoneLoginError={accountErrorMessage(phoneLoginError, lang)}
                  onClearPhoneLoginError={() => setPhoneLoginError(null)}
                  isPhoneLogging={isPhoneLogging}
                  role={role}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  initialReturningOpen={openLoginOnStart}
                  onBackToLanding={returnToLanding}
                  onSwitchToRegister={() => openRegistration(role)}
                  onOpenConnection={openConnection}
                  onClearRegistrationError={() => setRegistrationError(null)}
                  studentRegistrationStep={route.step}
                  onStudentStepChange={step => route.navigate('registration', role, step)}
                />
              </div>

              {!showReturningResume && (
                <p className="ts-below-card-link">
                  <span>
                    {isConnectionSurface
                      ? (isArabic ? 'ليس لديك حساب بعد؟' : 'Pas encore de compte ?')
                      : (isArabic ? 'لديك حساب بالفعل؟' : 'Déjà inscrit ?')}
                  </span>
                  <button
                    type="button"
                    onClick={isConnectionSurface ? () => openRegistration(role) : openConnection}
                  >
                    {isConnectionSurface
                      ? (isArabic ? 'إنشاء حساب جديد' : 'Créer un compte')
                      : (isArabic ? 'تسجيل الدخول' : 'Se connecter')}
                  </button>
                </p>
              )}
              <p className="mt-2 text-center text-xs font-medium text-slate-500">
                <a
                  href={getApprendreUrl()}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 py-1 text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-[#4F46E5]"
                >
                  {isArabic ? 'فتح دفتر المراجعة المباشر (Apprendre)' : 'Accéder directement au cahier Apprendre →'}
                </a>
              </p>
            </>
          )}
        </div>
      </div>

      <aside className="ts-split-motion-pane" aria-hidden="true">
        <AuthMotionShowcase previewRole={previewRole || (landingRole === 'prof' ? 'prof' : null)} />
      </aside>
    </div>
  );
};

export default memo(LoginView);
