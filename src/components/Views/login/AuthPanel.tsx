import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, RootManifest } from '../../../types';
import {
    faRightFromBracket,
    faCircleCheck,
    faArrowLeft,
    faArrowRight,
    faUser,
    faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { formatClassName } from '../../../utils/textProcessor';
import { COLLEGE_CLASS_OPTIONS } from '../../../constants/collegeClasses';
import { useI18n } from '../../../i18n/I18nContext';
import { ClassSelector } from './ClassSelector';
import { isPhoneInputValid, normalizePhoneInput } from './phone';
import { PasswordInput, PhoneInput } from './AuthInputs';
import { LevelCapIcon, LevelRootIcon } from './AuthIcons';

export type AuthMode = 'lycee' | 'college';
export type AuthRole = 'student' | 'prof';

const COLLEGE_CLASS_IDS = new Set(COLLEGE_CLASS_OPTIONS.map(cls => cls.id));

const ModeToggle: React.FC<{ mode: AuthMode; onChange: (mode: AuthMode) => void; label: string }> = ({ mode, onChange, label }) => {
    const { t } = useI18n();
    return (
        <fieldset className="grid w-full grid-cols-2 gap-3 border-0 p-0">
            <legend className="sr-only">{label}</legend>
            {([
                ['lycee', t('login.lycee'), LevelCapIcon],
                ['college', t('login.college'), LevelRootIcon],
            ] as const).map(([value, text, Icon]) => {
                const selected = mode === value;
                return (
                    <button key={value} type="button" onClick={() => onChange(value)} aria-pressed={selected} className={`login-level-card ${selected ? 'is-selected' : ''}`}>
                        <Icon size={17} />
                        <strong>{text}</strong>
                    </button>
                );
            })}
        </fieldset>
    );
};

const TeetshCardTopbar: React.FC<{
    onBack?: () => void;
    arabic: boolean;
}> = ({ onBack, arabic }) => {
    if (!onBack) return null;
    return (
        <div className="ts-card-topbar">
            <button
                type="button"
                onClick={onBack}
                className="ts-card-back"
                aria-label={arabic ? 'رجوع' : 'Retour'}
            >
                <FaIcon icon={arabic ? faArrowRight : faArrowLeft} size={15} aria-hidden="true" />
                <span>{arabic ? 'رجوع' : 'Retour'}</span>
            </button>
        </div>
    );
};

const ReturningUserSection: React.FC<{
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onPhoneLogin?: (phone: string, password: string, dialCode: string) => void;
    phoneLoginError?: string | null;
    onClearPhoneLoginError?: () => void;
    isPhoneLogging?: boolean;
    showRegistrationBack?: boolean;
    onBackToLanding?: () => void;
}> = ({ expanded, onExpandedChange, onPhoneLogin, phoneLoginError, onClearPhoneLoginError, isPhoneLogging, showRegistrationBack = false, onBackToLanding }) => {
    const { t, lang } = useI18n();
    const [loginPhone, setLoginPhone] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginDialCode, setLoginDialCode] = useState('+212');
    const isPhoneValid = isPhoneInputValid(loginPhone, loginDialCode);
    const isPasswordValid = loginPassword.length >= 6 && loginPassword.length <= 128;
    const canLogin = isPhoneValid && isPasswordValid && !isPhoneLogging;

    if (!expanded) return null;

    const handleClose = () => {
        if (showRegistrationBack) {
            onExpandedChange(false);
        } else {
            onBackToLanding?.();
        }
    };

    return (
        <div className="login-returning-interface ts-auth-shell">
          <div className="login-returning-grid" aria-hidden="true" />
          <div className="login-returning-content">
            <TeetshCardTopbar
              onBack={onBackToLanding ? handleClose : undefined}
              arabic={lang === 'ar'}
            />

            <div className="login-returning-heading">
                <h2>{t('login.reconnect')}</h2>
            </div>
            <form className="login-returning-form" noValidate onSubmit={event => {
                event.preventDefault();
                if (!isPhoneLogging) onPhoneLogin?.(loginPhone, loginPassword, loginDialCode);
            }}>
            <div className="auth-field">
                <label htmlFor="returning-phone-input" className="auth-field-label">{t('login.phone')}</label>
                <PhoneInput
                    id="returning-phone-input"
                    value={loginPhone}
                    onChange={(val) => { setLoginPhone(val); onClearPhoneLoginError?.(); }}
                    dialCode={loginDialCode}
                    onDialCodeChange={(dial) => {
                        setLoginDialCode(dial);
                        setLoginPhone(current => normalizePhoneInput(current, dial));
                        onClearPhoneLoginError?.();
                    }}
                    invalid={Boolean(phoneLoginError) || (loginPhone.length > 0 && !isPhoneValid)}
                    describedBy={phoneLoginError ? 'returning-login-error' : undefined}
                    autoFocus
                />
            </div>
            <div className="auth-field">
                <label htmlFor="returning-password-input" className="auth-field-label">{t('login.password')}</label>
                <PasswordInput
                    id="returning-password-input"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(val) => { setLoginPassword(val); onClearPhoneLoginError?.(); }}
                    placeholder={t('login.password')}
                    invalid={Boolean(phoneLoginError)}
                    describedBy={phoneLoginError ? 'returning-login-error' : undefined}
                />
            </div>
            {phoneLoginError && (
                <p id="returning-login-error" role="alert" aria-live="assertive" className="text-sm text-red-600 font-medium text-center animate-in fade-in duration-200">
                    {phoneLoginError}
                </p>
            )}
            <button
                type="submit"
                disabled={!canLogin}
                className={`login-returning-submit ${canLogin ? 'is-enabled' : ''}`}
            >
                {isPhoneLogging ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                ) : (
                    t('login.reconnectButton')
                )}
            </button>
            </form>

          </div>
        </div>
    );
};

export const AuthPanel: React.FC<{
    manifest: RootManifest | null;
    existingUser: UserProfile | null;
    firstName: string;
    setFirstName: (val: string) => void;
    lastName: string;
    setLastName: (val: string) => void;
    phone: string;
    setPhone: (val: string) => void;
    phoneDialCode: string;
    setPhoneDialCode: (dial: string) => void;
    selectedClassId: string;
    setSelectedClassId: (val: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onResume: () => void;
    onReset: () => void;
    registrationError?: string | null;
    isRegistering?: boolean;
    mode: AuthMode;
    onModeChange: (mode: AuthMode) => void;
    onPhoneLogin?: (phone: string, password: string, dialCode: string) => void;
    phoneLoginError?: string | null;
    onClearPhoneLoginError?: () => void;
    isPhoneLogging?: boolean;
    role: AuthRole;
    password: string;
    setPassword: (val: string) => void;
    confirmPassword?: string;
    setConfirmPassword?: (val: string) => void;
    initialReturningOpen?: boolean;
    onOpenConnection?: () => void;
    onClearRegistrationError: () => void;
    studentRegistrationStep: 1 | 2;
    onStudentStepChange: (step: 1 | 2) => void;
    onBackToLanding?: () => void;
    onSwitchToRegister?: () => void;
}> = ({
    manifest, existingUser, firstName, setFirstName, lastName, setLastName, phone, setPhone, phoneDialCode, setPhoneDialCode, selectedClassId, setSelectedClassId, onSubmit, onResume, onReset, registrationError, isRegistering, mode, onModeChange, onPhoneLogin, phoneLoginError, onClearPhoneLoginError, isPhoneLogging, role, password, setPassword, confirmPassword: controlledConfirm, setConfirmPassword: setControlledConfirm, initialReturningOpen = false, onBackToLanding, onClearRegistrationError, studentRegistrationStep, onStudentStepChange
}) => {
    const localError = registrationError;
    const clearError = onClearRegistrationError;
    const { t, lang } = useI18n();
    const [uncontrolledConfirm, setUncontrolledConfirm] = useState('');
    const confirmPassword = controlledConfirm ?? uncontrolledConfirm;
    const setConfirmPassword = setControlledConfirm ?? setUncontrolledConfirm;
    const studentFormTopRef = useRef<HTMLDivElement>(null);
    const studentFirstNameRef = useRef<HTMLInputElement>(null);
    const previousStudentStepRef = useRef(studentRegistrationStep);
    const showStudentRegistrationStep = onStudentStepChange;

    useEffect(() => {
        const previousStep = previousStudentStepRef.current;
        previousStudentStepRef.current = studentRegistrationStep;
        if (previousStep === studentRegistrationStep || role !== 'student') return;

        const frameId = requestAnimationFrame(() => {
            studentFormTopRef.current?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start',
            });
            if (studentRegistrationStep === 2 && studentFirstNameRef.current) {
                studentFirstNameRef.current.focus({ preventScroll: true });
            } else {
                studentFormTopRef.current?.focus({ preventScroll: true });
            }
        });

        return () => cancelAnimationFrame(frameId);
    }, [role, studentRegistrationStep]);

    if (existingUser) {
        const isConcours = existingUser.mode === 'concours';
        return (
            <div className="mx-auto flex h-full w-full max-w-sm flex-col items-center justify-center">
                <div className="group relative mb-3 cursor-default sm:mb-4">
                    <div className={`typo-ui flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black text-white shadow-lg sm:h-20 sm:w-20 sm:text-3xl ${isConcours ? 'bg-[#C5A059]' : 'bg-[#1E2548]'}`}>
                        {existingUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white bg-[#28E1A5] shadow-sm">
                        <FaIcon icon={faCircleCheck} size={12} className="text-white" aria-hidden="true" />
                    </div>
                </div>

                <div className="mb-4 space-y-1.5 text-center sm:mb-5">
                    <h2 className="typo-ui text-xl font-bold text-slate-900 sm:text-2xl">
                        {existingUser.name}
                    </h2>
                    <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ${isConcours ? 'bg-[#FFF6E1] text-[#9A6A12]' : 'bg-[#E6EAFA] text-[#1E2548]'}`}>
                        {isConcours ? (lang === 'ar' ? 'مسار المباريات' : 'Mode Concours') : formatClassName(existingUser.className)}
                    </div>
                </div>

                <div className="w-full space-y-2">
                    <button
                        type="button"
                        onClick={onResume}
                        disabled={isPhoneLogging}
                        className="typo-ui flex min-h-12 w-full items-center justify-center rounded-xl bg-[#5066dc] text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(80,102,220,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4054c7]"
                    >
                        {isPhoneLogging ? (lang === 'ar' ? 'جارٍ التحقق…' : 'Vérification…') : existingUser.role === 'prof' ? (lang === 'ar' ? 'فتح فضاء الأستاذ' : 'Ouvrir mon espace professeur') : t('login.continueLearning')}
                    </button>

                    <button
                        type="button"
                        onClick={onReset}
                        disabled={isPhoneLogging}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-[#505766] transition-colors duration-200 hover:bg-white/60 hover:text-[#1E2548]"
                    >
                        <FaIcon icon={faRightFromBracket} size={15} aria-hidden="true" />
                        <span>{t('login.changeAccount')}</span>
                    </button>
                    {phoneLoginError && <p role="alert" aria-live="assertive" className="text-center text-sm text-red-600">{phoneLoginError}</p>}
                </div>
            </div>
        );
    }

    const isLycee = mode === 'lycee';
    const availableClasses = isLycee
        ? (manifest?.classes ?? []).filter(cls => !COLLEGE_CLASS_IDS.has(cls.id))
        : COLLEGE_CLASS_OPTIONS;
    const isPhoneValid = isPhoneInputValid(phone, phoneDialCode);
    const isFirstNameValid = firstName.trim().length >= 2;
    const isLastNameValid = lastName.trim().length >= 2;
    const hasValidClass = availableClasses.some(cls => cls.id === selectedClassId);
    const isPasswordValid = password.length >= 6 && password.length <= 128;
    const isConfirmValid = confirmPassword.length > 0 && confirmPassword === password;
    const isValid = isFirstNameValid && isLastNameValid && hasValidClass && isPhoneValid && isPasswordValid;

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isRegistering || !isFirstNameValid || !isLastNameValid || !isPhoneValid || !isPasswordValid || confirmPassword !== password) return;
        if (role === 'student' && !hasValidClass) return;
        onSubmit(e);
    };

    if (initialReturningOpen) {
        return (
            <div className="login-returning-page">
                <ReturningUserSection
                    expanded
                    onExpandedChange={() => onBackToLanding?.()}
                    onPhoneLogin={onPhoneLogin}
                    phoneLoginError={phoneLoginError}
                    onClearPhoneLoginError={onClearPhoneLoginError}
                    isPhoneLogging={isPhoneLogging}
                    showRegistrationBack={false}
                    onBackToLanding={onBackToLanding}
                />
            </div>
        );
    }

    if (role === 'prof') {
        const identityValid = isFirstNameValid && isLastNameValid && isPhoneValid;
        const securityValid = isPasswordValid && isConfirmValid;
        return (
            <div className="login-journey-auth ts-auth-shell">
                <TeetshCardTopbar
                    onBack={onBackToLanding}
                    arabic={lang === 'ar'}
                />
                <div className="login-journey-heading">
                    <h1>{lang === 'ar' ? 'إنشاء حساب أستاذ' : 'Créer mon compte professeur'}</h1>
                </div>
                <form onSubmit={handleFormSubmit} className="login-journey-form" noValidate>
                    <section className="login-journey-step login-prof-registration-step">
                        <div className="login-journey-names">
                            <div>
                                <label htmlFor="prof-first-name">{t('login.firstName')}</label>
                                <div className="ts-name-input-wrap">
                                    <FaIcon icon={faUser} size={14} className="ts-name-input-icon" aria-hidden="true" />
                                    <input id="prof-first-name" autoFocus type="text" value={firstName} onChange={event => { setFirstName(event.target.value); clearError(); }} placeholder={t('login.firstNamePlaceholder')} autoComplete="given-name" aria-invalid={firstName.length > 0 && !isFirstNameValid ? true : undefined} className={firstName.length > 0 && !isFirstNameValid ? 'is-invalid' : ''} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="prof-last-name">{t('login.lastName')}</label>
                                <div className="ts-name-input-wrap">
                                    <FaIcon icon={faUser} size={14} className="ts-name-input-icon" aria-hidden="true" />
                                    <input id="prof-last-name" type="text" value={lastName} onChange={event => { setLastName(event.target.value); clearError(); }} placeholder={t('login.lastNamePlaceholder')} autoComplete="family-name" aria-invalid={lastName.length > 0 && !isLastNameValid ? true : undefined} className={lastName.length > 0 && !isLastNameValid ? 'is-invalid' : ''} />
                                </div>
                            </div>
                        </div>
                        <div className="login-journey-phone">
                            <label htmlFor="prof-phone-input">{t('login.phone')}</label>
                            <PhoneInput id="prof-phone-input" value={phone} onChange={value => { setPhone(value); clearError(); }} dialCode={phoneDialCode} onDialCodeChange={dial => { setPhoneDialCode(dial); clearError(); }} invalid={phone.length > 0 && !isPhoneValid} describedBy={localError ? 'prof-reg-error' : undefined} />
                        </div>
                        <div className="login-journey-security">
                            <div>
                                <label htmlFor="prof-password-input">{t('login.password')}</label>
                                <PasswordInput id="prof-password-input" value={password} onChange={value => { setPassword(value); clearError(); }} placeholder={t('login.passwordPlaceholder')} invalid={password.length > 0 && !isPasswordValid} describedBy="prof-password-rules" />
                            </div>
                            <div>
                                <label htmlFor="prof-confirm-password-input">{lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirmer le mot de passe'}</label>
                                <PasswordInput id="prof-confirm-password-input" value={confirmPassword} onChange={(val) => { setConfirmPassword(val); clearError(); }} placeholder={lang === 'ar' ? 'أعد كتابة كلمة المرور' : 'Retapez le mot de passe'} invalid={confirmPassword.length > 0 && !isConfirmValid} describedBy="prof-password-rules" />
                            </div>
                            <div id="prof-password-rules" className="login-journey-rules">
                                <span className={isPasswordValid ? 'is-valid' : ''}>{isPasswordValid && <FaIcon icon={faCheck} size={11} className="me-1" aria-hidden="true" />}{lang === 'ar' ? 'ستة أحرف على الأقل' : '6 caractères minimum'}</span>
                                <span className={isConfirmValid ? 'is-valid' : ''}>{isConfirmValid && <FaIcon icon={faCheck} size={11} className="me-1" aria-hidden="true" />}{lang === 'ar' ? 'كلمتا المرور متطابقتان' : 'Les deux mots de passe correspondent'}</span>
                            </div>
                        </div>
                        {localError && <p id="prof-reg-error" role="alert" aria-live="assertive" className="login-journey-error">{localError}</p>}
                    </section>
                    <div className="login-journey-actions"><button type="submit" disabled={!identityValid || !securityValid || isRegistering} className="is-primary">{isRegistering ? t('login.submitting') : (lang === 'ar' ? 'إرسال طلب التفعيل' : 'Envoyer ma demande')}</button></div>
                </form>
            </div>
        );
    }

    if (role === 'student') {
        const securityValid = isPasswordValid && isConfirmValid;
        const handleStudentSubmit = (event: React.FormEvent) => {
            event.preventDefault();
            if (studentRegistrationStep === 1) {
                if (hasValidClass) showStudentRegistrationStep(2);
                return;
            }
            handleFormSubmit(event);
        };

        return (
            <div className="login-journey-auth ts-auth-shell">
                <TeetshCardTopbar
                    onBack={onBackToLanding}
                    arabic={lang === 'ar'}
                />
                <div ref={studentFormTopRef} tabIndex={-1} className="login-journey-heading login-student-heading outline-none">
                    <h1>{lang === 'ar' ? 'إنشاء حساب تلميذ' : 'Créer mon compte élève'}</h1>
                    <div
                        className="login-student-progress"
                        role="progressbar"
                        aria-label={lang === 'ar' ? 'تقدم التسجيل' : 'Progression de l’inscription'}
                        aria-valuemin={1}
                        aria-valuemax={2}
                        aria-valuenow={studentRegistrationStep}
                        aria-valuetext={lang === 'ar' ? `الخطوة ${studentRegistrationStep} من 2` : `Étape ${studentRegistrationStep} sur 2`}
                    >
                        <i className="is-active" aria-hidden="true" />
                        <i className={studentRegistrationStep === 2 ? 'is-active' : ''} aria-hidden="true" />
                    </div>
                </div>

                <form onSubmit={handleStudentSubmit} className="login-journey-form" noValidate>
                  {studentRegistrationStep === 1 ? (
                    <section className="login-journey-step login-student-registration-step login-student-class-step ts-step-stage" key="student-class">
                        <div className="login-journey-fields login-student-path">
                          <div>
                            <p className="login-field-label">{lang === 'ar' ? 'السلك الدراسي' : 'Niveau d’études'}</p>
                            <ModeToggle mode={mode} onChange={onModeChange} label={lang === 'ar' ? 'السلك الدراسي' : 'Niveau d’études'} />
                          </div>
                          <div>
                            <p className="login-field-label">{t('login.classLabel')}</p>
                            <div className="login-class-selector">
                                <ClassSelector
                                    classes={availableClasses}
                                    selectedClassId={selectedClassId}
                                    onChange={(id) => { setSelectedClassId(id); clearError(); }}
                                />
                            </div>
                          </div>
                        </div>
                    </section>
                  ) : (
                    <section className="login-journey-step login-student-registration-step login-student-details-step ts-step-stage" key="student-details">
                        <div className="login-journey-names">
                          <div>
                            <label htmlFor="student-first-name">{t('login.firstName')}</label>
                            <div className="ts-name-input-wrap">
                              <FaIcon icon={faUser} size={14} className="ts-name-input-icon" aria-hidden="true" />
                              <input
                                  ref={studentFirstNameRef}
                                  id="student-first-name"
                                  type="text"
                                  value={firstName}
                                  onChange={(event) => { setFirstName(event.target.value); clearError(); }}
                                  placeholder={t('login.firstNamePlaceholder')}
                                  autoComplete="given-name"
                                  aria-invalid={firstName.length > 0 && !isFirstNameValid ? true : undefined}
                                  className={firstName.length > 0 && !isFirstNameValid ? 'is-invalid' : ''}
                              />
                            </div>
                          </div>
                          <div>
                            <label htmlFor="student-last-name">{t('login.lastName')}</label>
                            <div className="ts-name-input-wrap">
                              <FaIcon icon={faUser} size={14} className="ts-name-input-icon" aria-hidden="true" />
                              <input
                                  id="student-last-name"
                                  type="text"
                                  value={lastName}
                                  onChange={(event) => { setLastName(event.target.value); clearError(); }}
                                  placeholder={t('login.lastNamePlaceholder')}
                                  autoComplete="family-name"
                                  aria-invalid={lastName.length > 0 && !isLastNameValid ? true : undefined}
                                  className={lastName.length > 0 && !isLastNameValid ? 'is-invalid' : ''}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="login-journey-phone">
                            <label htmlFor="student-phone-input">{t('login.phone')}</label>
                            <PhoneInput
                                id="student-phone-input"
                                value={phone}
                                onChange={(value) => { setPhone(value); clearError(); }}
                                dialCode={phoneDialCode}
                                onDialCodeChange={(dial) => { setPhoneDialCode(dial); clearError(); }}
                                invalid={phone.length > 0 && !isPhoneValid}
                                describedBy={localError ? 'student-reg-error' : undefined}
                            />
                        </div>
                        <div className="login-journey-security">
                          <div>
                            <label htmlFor="student-password-input">{t('login.password')}</label>
                            <PasswordInput id="student-password-input" value={password} onChange={(value) => { setPassword(value); clearError(); }} placeholder={t('login.passwordPlaceholder')} invalid={password.length > 0 && !isPasswordValid} describedBy="student-password-rules" />
                          </div>
                          <div>
                            <label htmlFor="student-confirm-password-input">{lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirmer le mot de passe'}</label>
                            <PasswordInput id="student-confirm-password-input" value={confirmPassword} onChange={(val) => { setConfirmPassword(val); clearError(); }} placeholder={lang === 'ar' ? 'أعد كتابة كلمة المرور' : 'Retapez le mot de passe'} invalid={confirmPassword.length > 0 && !isConfirmValid} describedBy="student-password-rules" />
                          </div>
                          <div id="student-password-rules" className="login-journey-rules">
                            <span className={isPasswordValid ? 'is-valid' : ''}>{isPasswordValid && <FaIcon icon={faCheck} size={11} className="me-1" aria-hidden="true" />}{lang === 'ar' ? 'ستة أحرف على الأقل' : '6 caractères minimum'}</span>
                            <span className={isConfirmValid ? 'is-valid' : ''}>{isConfirmValid && <FaIcon icon={faCheck} size={11} className="me-1" aria-hidden="true" />}{lang === 'ar' ? 'كلمتا المرور متطابقتان' : 'Les deux mots de passe correspondent'}</span>
                          </div>
                        </div>
                        {localError && <p id="student-reg-error" role="alert" aria-live="assertive" className="login-journey-error">{localError}</p>}
                    </section>
                  )}

                    <div className="login-journey-actions">
                      {studentRegistrationStep === 1 ? (
                        <button type="submit" disabled={!hasValidClass} className="is-primary">
                          {lang === 'ar' ? 'متابعة' : 'Continuer'}
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={(event) => { event.preventDefault(); showStudentRegistrationStep(1); }} className="is-secondary">
                            {lang === 'ar' ? 'العودة إلى اختيار القسم' : 'Revenir au choix de classe'}
                          </button>
                          <button type="submit" disabled={!securityValid || !isValid || isRegistering} className="is-primary">
                            {isRegistering ? t('login.submitting') : t('login.submit')}
                          </button>
                        </>
                      )}
                    </div>
                </form>

            </div>
        );
    }

    return null;
};
