import React, { useEffect, useRef, useState } from 'react';
import { faCircleCheck, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { cn } from '../../UI/designSystem';
import { clampPercent } from './useChapterCard';
import { CARD_TIMERS } from './constants';
import { useI18n } from '../../../i18n/I18nContext';

interface ChapterStepProps {
    label: string;
    pct?: number;
    locked: boolean;
    completed?: boolean;
    onClick: () => void;
    onRedo?: () => void;
    primaryActionLabel?: string;
    completedActionLabel?: string;
    hint: string;
    isPrimary?: boolean;
    /** Intitulé long de la fiche, affiché en infobulle native. */
    tooltip?: string;
}

const ChapterStep: React.FC<ChapterStepProps> = ({
    label,
    pct = 0,
    locked,
    completed = false,
    onClick,
    onRedo,
    primaryActionLabel,
    completedActionLabel,
    hint,
    isPrimary = false,
    tooltip,
}) => {
    const { lang } = useI18n();
    const tr = (fr: string, ar: string) => lang === 'ar' ? ar : fr;
    const actualPct = clampPercent(pct);
    const isInProgress = !locked && !completed && actualPct > 0 && actualPct < 100;
    const actionLabel = primaryActionLabel || (isInProgress ? tr('Continuer', 'متابعة') : tr('Commencer', 'بدء'));
    const doneActionLabel = completedActionLabel || tr('Reprendre', 'متابعة');
    const cleanHint = (() => {
        if (!locked || !hint) return '';
        const text = hint.trim();
        const pctMatch = text.match(/(\d+)\s*%/);
        if (pctMatch) {
            const num = pctMatch[1];
            if (text.toLowerCase().includes('leçon') || text.toLowerCase().includes('cours')) {
                return tr(`Compléter ${num}% du cours requis`, `أكمل ${num}% من الدرس المطلوب`);
            }
            if (text.toLowerCase().includes('quiz')) {
                return tr(`Valider ou compléter ${num}% du quiz`, `أتم أو حقق ${num}% من الاختبار`);
            }
        }
        const cleaned = text.replace(/^(verrouillé\s*-\s*|verrouille\s*-\s*)/gi, '');
        return cleaned.toLowerCase() === 'bientôt disponible' ? tr('Bientôt disponible', 'متاح قريباً') : cleaned;
    })();

    const [justUnlocked, setJustUnlocked] = useState(false);
    const [hintVisible, setHintVisible] = useState(false);
    const wasLockedRef = useRef(locked);
    const hintTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    }, []);

    const showLockedHint = () => {
        if (!locked || !cleanHint) return;
        if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
        setHintVisible(true);
        hintTimerRef.current = window.setTimeout(() => {
            setHintVisible(false);
            hintTimerRef.current = null;
        }, 5000);
    };

    useEffect(() => {
        if (wasLockedRef.current && !locked) {
            setJustUnlocked(true);
            const timer = window.setTimeout(() => setJustUnlocked(false), CARD_TIMERS.UNLOCK_ANIM);
            wasLockedRef.current = locked;
            return () => window.clearTimeout(timer);
        }
        wasLockedRef.current = locked;
    }, [locked]);

    const statusText = locked
        ? (hintVisible && cleanHint ? cleanHint : tr('Verrouillé', 'مقفل'))
        : completed
            ? tr('Terminé', 'مكتمل')
            : isInProgress
                ? tr(`${actualPct}% réalisé`, `تم إنجاز ${actualPct}%`)
                : tr('Disponible', 'متاح');

    return (
        <div
            className={cn(
                'dash-step group/step relative flex items-center',
                locked ? 'cursor-help select-none' : 'opacity-100',
                justUnlocked && 'animate-pulse'
            )}
            aria-label={locked ? `${label} ${tr('verrouillé', 'مقفل')}` : label}
            title={tooltip || undefined}
            aria-disabled={locked || undefined}
            onClick={locked ? showLockedHint : undefined}
            onKeyDown={locked ? event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    showLockedHint();
                }
            } : undefined}
            tabIndex={locked ? 0 : undefined}
        >
            <div
                className={cn(
                    'dash-step__icon relative z-10 flex shrink-0 items-center justify-center rounded-xl border transition-[background-color,border-color,color,transform] duration-250 ease-out',
                    completed
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_2px_8px_-2px_var(--accent-soft)]'
                        : isInProgress
                            ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : locked
                                ? 'border-slate-200/90 bg-white text-slate-400'
                                : 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-white text-[var(--accent)] group-hover/step:bg-[var(--accent-soft)]'
                )}
                aria-hidden="true"
            >
                {completed ? (
                    <FaIcon icon={faCircleCheck} size={16} />
                ) : locked ? (
                    <FaIcon icon={faLock} size={14} />
                ) : (
                    <FaIcon icon={faLockOpen} size={14} />
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
                <span className={cn(
                    `${/[A-Za-zÀ-ÿ]/.test(label) ? 'latin-content ' : ''}dash-step__label truncate font-semibold leading-snug tracking-[-0.01em] transition-colors`,
                    locked ? 'text-slate-400' : 'text-slate-900'
                )}>
                    {label}
                </span>
                <span className={cn(
                    'dash-step__status mt-0.5 line-clamp-1 font-medium leading-tight tabular-nums',
                    locked
                        ? (hintVisible ? 'text-[var(--accent)]' : 'text-slate-400')
                        : completed
                            ? 'text-emerald-600'
                            : isInProgress
                                ? 'text-[var(--accent)]'
                                : 'text-slate-500'
                )}>
                    {statusText}
                </span>
            </div>

            {!locked && (
                <div className="ms-1 shrink-0">
                    <button
                        type="button"
                        aria-label={`${completed ? doneActionLabel : actionLabel} ${label}`}
                        onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (completed) {
                                (onRedo || onClick)();
                            } else {
                                onClick();
                            }
                        }}
                        className={cn(
                            'dashboard-button-frame min-h-9 rounded-xl border px-3.5 text-[9.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-200 active:scale-[0.97] sm:px-4 sm:text-[10px]',
                            completed
                                ? 'border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                                : isPrimary
                                    ? 'border-transparent bg-[var(--accent)] text-white shadow-[0_4px_12px_-3px_var(--accent-soft)] hover:brightness-105'
                                    : 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)]'
                        )}
                    >
                        {completed ? doneActionLabel : actionLabel}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ChapterStep;
