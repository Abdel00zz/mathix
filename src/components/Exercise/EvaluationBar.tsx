import React, { useState, useCallback, memo, useRef, useEffect } from 'react';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { MasteryLevel } from '../../types';
import { faCheck, faStopwatch, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import Tooltip from '../UI/Tooltip';
import { useI18n } from '../../i18n/I18nContext';

interface EvaluationBarProps {
    mastery: MasteryLevel;
    duration?: number | null;
    onEvaluate: (level: MasteryLevel, duration?: number | null) => void;
    variant?: 'subQuestion' | 'exercise';
    disabled?: boolean;
    isExamenMode?: boolean;
}

function formatDuration(d: number | null | undefined): string {
    if (d === null || d === undefined) return 'Temps indéterminé';
    if (d < 60) return `${d}min`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}min` : `${h}h`;
}

const MOTIVATION_MESSAGES = [
    'Chaque effort vous rapproche du sommet !',
    'La régularité fait la différence.',
    'Bien joué, continuez sur cette lancée !',
    "L'excellence est un processus, pas un accident.",
    'Un pas de plus vers la maîtrise.',
];

function getMotivation(duration: number | null | undefined): string {
    if (duration === null || duration === undefined) return 'Bien joué, continuez sur cette lancée !';
    const idx = duration % MOTIVATION_MESSAGES.length;
    return MOTIVATION_MESSAGES[idx];
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const EvaluationBar: React.FC<EvaluationBarProps> = ({
    mastery,
    duration,
    onEvaluate,
    variant = 'subQuestion',
    disabled = false,
    isExamenMode = false,
}) => {
    const { t } = useI18n();
    const [isEntering, setIsEntering] = useState(false);
    const [hours, setHours] = useState('');
    const [minutes, setMinutes] = useState('');
    const hoursRef = useRef<HTMLInputElement>(null);
    const minutesRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const professorAccess = useProfessorAccess();

    const isDone = mastery === 'high' || mastery === 'medium' || (mastery as string) === 'done';
    const isSkipped = mastery === 'skipped';
    const hasEvaluated = isDone || isSkipped;

    const total = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    const canConfirm = total > 0;
    const bothEmpty = hours === '' && minutes === '';
    const confirmBlockReason = bothEmpty
        ? 'Saisir une durée avant de valider'
        : 'Durée invalide — ex : 1h 30min';

    const openEntry = useCallback(() => {
        if (disabled) return;
        setIsEntering(true);
    }, [disabled]);

    const cancel = useCallback(() => {
        setIsEntering(false);
        setHours('');
        setMinutes('');
    }, []);

    const confirm = useCallback(() => {
        onEvaluate('high' as MasteryLevel, total > 0 ? total : null);
        setIsEntering(false);
        setHours('');
        setMinutes('');
    }, [onEvaluate, total]);

    useEffect(() => {
        if (!isEntering) return;
        const focusTimer = setTimeout(() => hoursRef.current?.focus(), 30);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter' && canConfirm) confirm();
        };
        const onClickOut = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) cancel();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onClickOut);
        return () => {
            clearTimeout(focusTimer);
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onClickOut);
        };
    }, [isEntering, canConfirm, cancel, confirm]);

    const skipTime = useCallback(() => {
        onEvaluate('high' as MasteryLevel, null);
        setIsEntering(false);
    }, [onEvaluate]);

    const handleSkipped = useCallback(() => {
        if (disabled) return;
        onEvaluate('skipped' as MasteryLevel, 0);
    }, [disabled, onEvaluate]);

    const onHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 2);
        setHours(val === '' ? '' : String(clamp(parseInt(val, 10), 0, 23)));
        if (val.length === 2) minutesRef.current?.focus();
    };
    const onMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 2);
        setMinutes(val === '' ? '' : String(clamp(parseInt(val, 10), 0, 59)));
    };

    // En mode professeur (tablette), l'évaluation de la progression est masquée :
    // l'enseignant anime la séance, il ne valide pas son propre exercice.
    if (professorAccess) return null;

    // ── Already evaluated: result banner ──
    if (hasEvaluated && !disabled && isDone) {
        const motivation = getMotivation(duration);
        const hasDuration = duration !== undefined && duration !== null;
        return (
            <div className={`w-full animate-in fade-in duration-300 ${variant === 'subQuestion' ? 'mt-6' : ''}`}>
                <div className="pt-2 pb-4 animate-in slide-in-from-bottom-2 duration-700">
                    <div className="flex items-center justify-between flex-wrap gap-y-2">
                        <div className="flex items-center gap-2">
                            <FaIcon icon={faStopwatch} size={15} className="text-[#c5a059]" />
                            <p className="text-[14px] tracking-tight text-[#c5a059]">
                                {hasDuration
                                    ? <>Exercice travaillé en <span className="font-bold">{formatDuration(duration)}</span></>
                                    : <span className="font-semibold">Exercice validé</span>}
                            </p>
                        </div>
                        <p className="text-[13px] text-[#a8a39a] italic tracking-tight">{motivation}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Locked state ──
    if (disabled && hasEvaluated && isDone) {
        const hasDuration = duration !== undefined && duration !== null;
        return (
            <div className={`w-full ${variant === 'subQuestion' ? 'mt-6' : ''}`}>
                <div className="pt-2 pb-4">
                    <div className="flex items-center justify-between flex-wrap gap-y-2">
                        <div className="flex items-center gap-2">
                            <FaIcon icon={faStopwatch} size={15} className="text-[#c5a059]/60" />
                            <p className="text-[14px] tracking-tight text-[#c5a059]/70">
                                {hasDuration
                                    ? <>Exercice travaillé en <span className="font-bold">{formatDuration(duration)}</span></>
                                    : <span className="font-semibold">Exercice validé</span>}
                            </p>
                        </div>
                        <p className="text-[13px] text-[#a8a39a] italic tracking-tight">Bien joué !</p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Not yet evaluated ──
    return (
        <div ref={wrapRef} className={`w-full animate-in fade-in slide-in-from-bottom-2 duration-500 ${variant === 'subQuestion' ? 'mt-6' : ''}`}>
            <div className="w-full bg-transparent pb-4">
                <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${isExamenMode ? 'sm:justify-end' : 'sm:justify-between'}`}>
                    {!isExamenMode && (
                        <div className="min-w-0 order-2 sm:order-1">
                            <p
                                key={isEntering ? 'entering' : 'idle'}
                                className="text-[12.5px] typo-ui tracking-tight text-[#a8a39a] transition-all duration-300 animate-in fade-in slide-in-from-left-1"
                            >
                                {isEntering ? (
                                    <>
                                        <span className="text-[#c5a059] font-medium">Indiquez la durée</span> consacrée à cet exercice puis validez
                                    </>
                                ) : (
                                    <>Validez pour enregistrer votre progression.</>
                                )}
                            </p>
                        </div>
                    )}

                    <div className={`flex items-center gap-2.5 w-full sm:w-auto min-w-0 ${isExamenMode ? '' : 'order-1 sm:order-2'}`}>
                        {!isEntering ? (
                            <>
                                <button
                                    type="button"
                                    onClick={openEntry}
                                    disabled={disabled}
                                    className="flex-1 min-w-0 sm:flex-none flex items-center justify-center text-white px-7 sm:px-9 py-2.5 sm:py-3 rounded-none font-black uppercase text-[0.72rem] sm:text-[0.74rem] tracking-[1.2px] transition-all hover:scale-[1.01] active:scale-[0.98] shadow-[0_6px_20px_-4px_rgba(232,82,26,0.32)] disabled:opacity-45 disabled:cursor-not-allowed truncate animate-in fade-in duration-300 pointer-events-auto cursor-pointer bg-[#E8521A] hover:bg-[#D04415] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8521A] focus-visible:ring-offset-2"
                                >
                                    {t('common.validate')} {t('common.exercise').toLowerCase()}
                                </button>
                                {!isExamenMode && (
                                    <button
                                        type="button"
                                        onClick={handleSkipped}
                                        disabled={disabled}
                                        className="flex-1 min-w-0 sm:flex-none flex items-center justify-center bg-white border-[3.5px] border-white ring-1 ring-slate-200 rounded-none px-5 py-3 text-[11px] sm:text-[12px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-slate-800 transition-all hover:bg-slate-50/60 hover:scale-[1.01] active:scale-[0.98] shadow-[0_6px_16px_rgba(30,37,72,0.03)] disabled:opacity-40 disabled:cursor-not-allowed truncate pointer-events-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                                    >
                                        {t('common.skip')}
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="flex items-center bg-white border-[3.5px] border-white ring-1 ring-[#c5a059]/40 shadow-[0_6px_20px_rgba(197,160,89,0.14)] rounded-none py-0.5 pl-3.5 pr-1">
                                    <FaIcon icon={faStopwatch} size={14} className="text-[#c5a059] mr-2 shrink-0 animate-pulse" />
                                    <input
                                        ref={hoursRef}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={2}
                                        placeholder="00"
                                        value={hours}
                                        onChange={onHoursChange}
                                        aria-label="Heures"
                                        className="w-[1.8rem] py-1 text-center typo-ui text-[14px] font-bold text-[#1a1510] outline-none placeholder:text-slate-300 bg-transparent"
                                    />
                                    <span className="text-[14px] font-extrabold text-[#c5a059]/60 select-none">:</span>
                                    <input
                                        ref={minutesRef}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={2}
                                        placeholder="00"
                                        value={minutes}
                                        onChange={onMinutesChange}
                                        aria-label="Minutes"
                                        className="w-[1.8rem] py-1 text-center typo-ui text-[14px] font-bold text-[#1a1510] outline-none placeholder:text-slate-300 bg-transparent"
                                    />
                                    <Tooltip content={confirmBlockReason} disabled={canConfirm}>
                                        <button
                                            type="button"
                                            onClick={confirm}
                                            disabled={!canConfirm}
                                            aria-label={t('common.validate')}
                                            className="ml-2 flex items-center justify-center w-8 h-8 rounded-none bg-[#E8521A] text-white transition-all hover:bg-[#D04415] active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8521A]"
                                        >
                                            <FaIcon icon={faCheck} size={14} />
                                        </button>
                                    </Tooltip>
                                </div>
                                <button
                                    type="button"
                                    onClick={skipTime}
                                    title={t('common.validate')}
                                    aria-label={t('common.validate')}
                                    className="flex items-center justify-center w-10 h-10 bg-white border-[3.5px] border-white ring-1 ring-slate-200 text-slate-400 hover:text-[#c5a059] rounded-none shadow-[0_4px_12px_rgba(30,37,72,0.03)] hover:shadow-[0_6px_16px_rgba(30,37,72,0.06)] transition-all cursor-pointer hover:border-transparent active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
                                >
                                    <FaIcon icon={faXmark} size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default memo(EvaluationBar);
