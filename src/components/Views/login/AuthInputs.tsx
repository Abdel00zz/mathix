import React, { useState, useCallback, useEffect, useId, useRef } from 'react';
import { faPhone, faEye, faEyeSlash, faLock, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { useI18n } from '../../../i18n/I18nContext';
import { PHONE_COUNTRIES, type PhoneCountry, normalizePhoneInput } from './phone';

interface PasswordInputProps {
    id?: string;
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    autoComplete?: 'new-password' | 'current-password';
    invalid?: boolean;
    describedBy?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
    id,
    value,
    onChange,
    placeholder,
    autoComplete = 'new-password',
    invalid,
    describedBy,
}) => {
    const { t, lang } = useI18n();
    const [visible, setVisible] = useState(false);
    return (
        <div className="login-input login-password-input relative flex min-h-11 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white/80 shadow-[0_10px_22px_-22px_rgba(30,37,72,0.5)] transition-all duration-200 hover:bg-white focus-within:border-indigo-400 focus-within:bg-white">
            <div className="login-password-leading typo-ui flex shrink-0 select-none items-center border-e border-[#D8DEEA]/80 bg-[#E6EAFA]/75 px-3 text-[#7682A4]" aria-hidden="true">
                <FaIcon icon={faLock} size={15} />
            </div>
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder || t('login.password')}
                aria-label={id ? undefined : (placeholder || t('login.password'))}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                name={autoComplete === 'current-password' ? 'password' : undefined}
                maxLength={128}
                autoComplete={autoComplete}
                className="typo-ui h-full min-h-11 w-full bg-transparent ps-3 pe-11 text-[16px] font-semibold tracking-wide text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-[14px]"
            />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="login-password-toggle absolute inset-y-0 end-0 flex min-h-11 min-w-11 items-center justify-center px-2 text-slate-500 transition-colors hover:text-indigo-700"
                aria-pressed={visible}
                aria-label={visible ? (lang === 'ar' ? 'إخفاء كلمة المرور' : 'Masquer le mot de passe') : (lang === 'ar' ? 'إظهار كلمة المرور' : 'Afficher le mot de passe')}
            >
                <FaIcon icon={visible ? faEyeSlash : faEye} size={16} aria-hidden="true" />
            </button>
        </div>
    );
};

const DialCodePicker: React.FC<{ dialCode: string; onChange: (dial: string) => void }> = ({ dialCode, onChange }) => {
    const { lang } = useI18n();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const listboxId = useId();
    const country = PHONE_COUNTRIES.find(item => item.dial === dialCode) || PHONE_COUNTRIES[0];
    const selectedIndex = Math.max(0, PHONE_COUNTRIES.findIndex(item => item.dial === country.dial));

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const id = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
        return () => cancelAnimationFrame(id);
    }, [open, selectedIndex]);

    const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            optionRefs.current[(idx + 1) % PHONE_COUNTRIES.length]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            optionRefs.current[(idx - 1 + PHONE_COUNTRIES.length) % PHONE_COUNTRIES.length]?.focus();
        } else if (event.key === 'Home') {
            event.preventDefault();
            optionRefs.current[0]?.focus();
        } else if (event.key === 'End') {
            event.preventDefault();
            optionRefs.current[PHONE_COUNTRIES.length - 1]?.focus();
        }
    };

    return (
        <div className="login-dial-picker relative shrink-0" ref={ref}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(value => !value)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !open) {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="login-dial-trigger"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={open ? listboxId : undefined}
                aria-label={lang === 'ar' ? `اختيار رمز البلد (${country.ar} ${country.dial})` : `Choisir l’indicatif téléphonique (${country.name} ${country.dial})`}
            >
                <span>{country.dial}</span>
                <FaIcon icon={faChevronDown} size={11} className={`text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
                <div
                    id={listboxId}
                    role="listbox"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    aria-label={lang === 'ar' ? 'رموز البلدان' : 'Indicatifs téléphoniques'}
                    className="login-dial-menu absolute left-0 top-full z-[70] mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_45px_-18px_rgba(15,23,42,0.35)]"
                >
                    {PHONE_COUNTRIES.map((item, idx) => {
                        const isSelected = item.dial === country.dial;
                        return (
                            <button
                                key={item.dial}
                                ref={el => { optionRefs.current[idx] = el; }}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onKeyDown={(e) => handleOptionKeyDown(e, idx)}
                                onClick={() => {
                                    onChange(item.dial);
                                    setOpen(false);
                                    triggerRef.current?.focus();
                                }}
                                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-start text-xs font-semibold transition ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                <span className="min-w-0 flex-1 truncate">{lang === 'ar' ? item.ar : item.name}</span>
                                <span className="login-dial-value" dir="ltr">{item.dial}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

interface PhoneInputProps {
    id?: string;
    value: string;
    onChange: (val: string) => void;
    dialCode: string;
    onDialCodeChange: (dial: string) => void;
    invalid?: boolean;
    describedBy?: string;
    autoFocus?: boolean;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
    id,
    value,
    onChange,
    dialCode,
    onDialCodeChange,
    invalid,
    describedBy,
    autoFocus = false,
}) => {
    const { t, lang } = useI18n();
    const country: PhoneCountry = PHONE_COUNTRIES.find(item => item.dial === dialCode) || PHONE_COUNTRIES[0];
    const formatPhone = useCallback((raw: string) => {
        return raw.match(/.{1,3}/g)?.join(' ') || '';
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = normalizePhoneInput(e.target.value, dialCode);
        onChange(raw);
    };

    return (
        <div dir="ltr" className="login-input login-phone-input relative flex min-h-11 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white/80 shadow-[0_10px_22px_-22px_rgba(30,37,72,0.5)] transition-all duration-200 hover:bg-white focus-within:border-indigo-400 focus-within:bg-white">
            <DialCodePicker dialCode={dialCode} onChange={onDialCodeChange} />
            <input
                id={id}
                type="tel"
                inputMode="numeric"
                value={formatPhone(value)}
                onChange={handleChange}
                placeholder={country.dial === '+212' ? '6XX XXX XXX' : (lang === 'ar' ? 'رقم الهاتف' : 'Votre numéro')}
                aria-label={id ? undefined : t('login.phone')}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                autoComplete="tel-national"
                autoFocus={autoFocus}
                name="phone"
                className="typo-ui h-full min-h-11 w-full bg-transparent px-3 pr-9 text-[16px] font-semibold tracking-wide text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-[14px]"
            />
            <div className="login-phone-icon pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#7682A4]" aria-hidden="true">
                <FaIcon icon={faPhone} size={15} />
            </div>
        </div>
    );
};
