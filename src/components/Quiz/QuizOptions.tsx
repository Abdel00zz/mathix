
import React from 'react';
import MathRenderer from '../MathRenderer';
import { faCircleCheck as faCircleCheckRegular, faCircleXmark as faCircleXmarkRegular } from '@fortawesome/free-regular-svg-icons';
import { faCircleCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { QuizQuestion } from '../../types';
import { getChoiceFeedbackState } from './choiceFeedback';
import { useOptionalI18n } from '../../i18n/I18nContext';

interface QuizOptionsProps {
    question: QuizQuestion;
    selectedAnswer: any;
    isAnswered: boolean;
    isReviewMode: boolean;
    result: any;
    onSelect: (val: any) => void;
    theme?: any;
}

// ============================================================================
// CHOICE NUMBER BADGE — Sharp, bold, visible
// ============================================================================
export const ChoiceNumberBadge: React.FC<{
    number: string | number;
    isSelected: boolean;
    isCorrect: boolean;
    isWrong: boolean;
    showStatus: boolean;
    themeColor?: string;
}> = ({ number, isSelected, isCorrect, isWrong, showStatus, themeColor }) => {

    let baseClass = `
        flex items-center justify-center flex-shrink-0
        typo-ui text-[clamp(0.75rem,0.7rem_+_0.2vw,0.88rem)] font-semibold transition-all duration-200
        w-[clamp(1.9rem,1.7rem_+_0.8vw,2.4rem)] h-[clamp(1.9rem,1.7rem_+_0.8vw,2.4rem)] rounded-full border border-current/10 shadow-sm
    `;

    if (showStatus) {
        if (isCorrect) {
            baseClass += ` bg-[#8BB090] text-white`;
        } else if (isWrong) {
            baseClass += ` bg-[#D68D8D] text-white`;
        } else {
            baseClass += ` bg-[#F7F6F3] text-[#828A90]`;
        }
    } else if (isSelected) {
        baseClass += ` text-white`;
    } else {
        baseClass += ` bg-[#F7F6F3] text-[#828A90] group-hover:bg-[#1A2530] group-hover:text-white`;
    }

    return (
        <div 
            className={baseClass} 
            style={!showStatus && isSelected ? { backgroundColor: themeColor || '#1A2530' } : undefined}
        >
            {number}
        </div>
    );
};

/** Repère visuel de correction, lisible sans dépendre uniquement de la couleur. */
export const ChoiceStatusMarker: React.FC<{
    isCorrect: boolean;
    isSelectedIncorrect: boolean;
}> = ({ isCorrect, isSelectedIncorrect }) => {
    const { dir, lang, t } = useOptionalI18n();
    // Pastille de lettre et texte du choix restent à GAUCHE en toutes langues :
    // le contenu du quiz (énoncé, choix, explication) est en français et se lit
    // de gauche à droite. L'annotation de correction occupe donc le coin droit.
    const positionClass = 'right-3';
    // L'arabe ne se letter-space pas : les lettres liées se détacheraient.
    const trackClass = lang === 'ar' ? 'tracking-normal' : 'tracking-[0.08em]';
    if (isCorrect) {
        return (
            <div dir={dir} className={`absolute -top-3 ${positionClass} z-20 inline-flex items-center gap-1 rounded-full border border-[#6FA277] bg-[#5F9468] px-[clamp(0.5rem,1.1vw,0.75rem)] py-[clamp(0.2rem,0.5vw,0.3rem)] text-[clamp(0.62rem,0.58rem_+_0.16vw,0.72rem)] font-bold uppercase ${trackClass} text-white shadow-[0_4px_12px_rgba(95,148,104,0.28)] animate-in zoom-in-50 duration-300`}>
                <FaIcon icon={faCircleCheck} size={13} aria-hidden="true" />
                <span>{t('common.correctAnswer')}</span>
            </div>
        );
    }

    if (isSelectedIncorrect) {
        return (
            <div dir={dir} className={`absolute -top-3 ${positionClass} z-20 inline-flex items-center gap-1 rounded-full border border-[#D87872] bg-[#C85650] px-[clamp(0.5rem,1.1vw,0.75rem)] py-[clamp(0.2rem,0.5vw,0.3rem)] text-[clamp(0.62rem,0.58rem_+_0.16vw,0.72rem)] font-bold uppercase ${trackClass} text-white shadow-[0_4px_12px_rgba(200,86,80,0.28)] animate-in zoom-in-50 duration-300`}>
                <FaIcon icon={faXmark} size={13} aria-hidden="true" />
                <span>{t('common.yourChoice')}</span>
            </div>
        );
    }

    return (
        <div dir={dir} className={`absolute -top-[10px] -right-[10px] z-20 flex h-[clamp(1.4rem,1.25rem_+_0.5vw,1.75rem)] w-[clamp(1.4rem,1.25rem_+_0.5vw,1.75rem)] items-center justify-center rounded-full border border-[#E0A29D] bg-[#D68D8D] text-white shadow-[0_4px_12px_rgba(214,141,141,0.25)] animate-in zoom-in-50 duration-300`} aria-label={t('common.incorrectAnswer')}>
            <FaIcon icon={faXmark} size={13} />
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const QuizOptions: React.FC<QuizOptionsProps> = ({ question, selectedAnswer, isAnswered, isReviewMode, result, onSelect, theme }) => {
    const { dir, t } = useOptionalI18n();
    const themeColor = theme?.progress || '#1A2530';

    if (question.type === 'mcq') {
        const options = (question as any).options || [];
        return (
            <div className="quiz-options w-full grid grid-cols-1">
                {options.map((opt: any, idx: number) => {
                    const userAns = isAnswered ? result?.userAnswer : selectedAnswer;
                    const isSelected = userAns === opt.id;
                    const isOptCorrect = Boolean(opt.isCorrect);
                    const showStatus = isAnswered || isReviewMode;
                    const feedbackState = getChoiceFeedbackState(showStatus, isOptCorrect, isSelected);
                    const isCorrectChoice = feedbackState === 'correct';
                    const isSelectedIncorrect = feedbackState === 'selected-incorrect';
                    let cardClass = `
                        quiz-choice w-full text-left border
                        rounded-2xl
                        transition-all duration-300 ease-out
                        relative overflow-visible group
                        flex items-center justify-start
                        active:scale-[0.99]
                    `;
                    let textColor = '';
                    let animationClass = "";

                    if (showStatus) {
                        if (isCorrectChoice) {
                            cardClass += ` bg-[#F0F7F1] border-[#5F9468] shadow-[0_6px_20px_rgba(95,148,104,0.14)] z-10`;
                            textColor = 'text-[#2A5A32] font-semibold';
                        } else if (isSelectedIncorrect) {
                            cardClass += ` bg-[#FDEDEC] border-[#C85650] ring-2 ring-[#C85650]/15 shadow-[0_6px_20px_rgba(200,86,80,0.15)]`;
                            textColor = 'text-[#902C2C] font-semibold';
                            animationClass = "animate-shake";
                        } else {
                            cardClass += ` bg-[#FFF8F7] border-[#E1AAA5] shadow-[0_2px_10px_rgba(200,86,80,0.05)] cursor-default`;
                            textColor = 'text-[#743E3B] font-medium';
                        }
                    } else {
                        if (isSelected) {
                            cardClass += ` bg-[#FFFFFF] shadow-[0_8px_24px_rgba(30,37,72,0.05)] border-slate-900`;
                            textColor = 'text-slate-900 font-medium';
                        } else {
                            cardClass += ` bg-[#FFFFFF] border-[#E4E5E7] hover:border-[var(--hover-color)] cursor-pointer hover:shadow-[0_12px_32px_rgba(0,0,0,0.03)] hover:-translate-y-0.5`;
                            textColor = 'text-slate-700';
                        }
                    }

                    return (
                        <button
                            key={opt.id}
                            onClick={() => onSelect(opt.id)}
                            disabled={showStatus}
                            aria-pressed={!showStatus ? isSelected : undefined}
                            aria-label={showStatus
                                ? `${opt.text} : ${isCorrectChoice ? t('common.correctAnswer') : isSelectedIncorrect ? `${t('common.yourChoice')} : ${t('common.incorrectAnswer')}` : t('common.incorrectAnswer')}`
                                : opt.text}
                            className={`${cardClass} ${animationClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`}
                            style={{ 
                                ...(!showStatus && isSelected ? { 
                                    borderColor: themeColor,
                                    backgroundColor: `${themeColor}04`
                                } : {}),
                                '--hover-color': themeColor 
                            } as React.CSSProperties}
                        >
                            {/* Badge de lettre et texte du choix : TOUJOURS à gauche.
                                L'énoncé et les propositions sont en français ; la
                                langue de l'interface ne doit pas les retourner. */}
                            <div className="quiz-choice-letter shrink-0">
                                <ChoiceNumberBadge
                                    number={String.fromCharCode(65 + idx)}
                                    isSelected={isSelected}
                                    isCorrect={isCorrectChoice}
                                    isWrong={showStatus && !isOptCorrect}
                                    showStatus={showStatus}
                                    themeColor={themeColor}
                                />
                            </div>

                            <div className={`quiz-choice-text min-w-0 flex-1 text-left typo-ui tracking-[-0.005em] relative z-10 transition-colors [&_.katex]:text-[1.08em] [&_.katex]:tracking-normal ${textColor}`}>
                                <MathRenderer inline content={opt.text} fontSize="inherit" />
                            </div>

                            {showStatus && (
                                <ChoiceStatusMarker
                                    isCorrect={isCorrectChoice}
                                    isSelectedIncorrect={isSelectedIncorrect}
                                />
                            )}

                        </button>
                    );
                })}
            </div>
        );
    }

    if (question.type === 'boolean' || (question as any).type === 'true-false') {
        const boolOptions = [
            {val: true, label: t('common.true'), icon: faCircleCheckRegular},
            {val: false, label: t('common.false'), icon: faCircleXmarkRegular}
        ];
        return (
            <div className="quiz-options quiz-options-boolean w-full grid grid-cols-2">
                {boolOptions.map((item) => {
                     const userAns = isAnswered ? result?.userAnswer : selectedAnswer;
                     const isSelected = userAns === item.val;
                     const isTrue = (question as any).isTrue;
                     const isThisCorrect = item.val === isTrue;
                     const showStatus = isAnswered || isReviewMode;
                     const feedbackState = getChoiceFeedbackState(showStatus, isThisCorrect, isSelected);
                     const isCorrectChoice = feedbackState === 'correct';
                     const isSelectedIncorrect = feedbackState === 'selected-incorrect';

                     let cardClass = `
                        quiz-boolean-choice w-full text-center border
                        rounded-[clamp(0.875rem,1.6vw,1.25rem)]
                        transition-all duration-300 ease-out
                        relative overflow-visible group
                        flex flex-col items-center justify-center
                        active:scale-[0.98]
                     `;
                     let textColor = 'text-slate-700';
                     let iconColor = 'text-slate-400 group-hover:text-slate-600';
                     let animationClass = "";

                     if (showStatus) {
                        if (isCorrectChoice) {
                            cardClass += ` bg-[#F0F7F1] border-[#5F9468] shadow-[0_6px_20px_rgba(95,148,104,0.14)] z-10`;
                            textColor = 'text-[#2A5A32] font-semibold';
                            iconColor = 'text-[#5F9468]';
                        } else if (isSelectedIncorrect) {
                            cardClass += ` bg-[#FDEDEC] border-[#C85650] ring-2 ring-[#C85650]/15 shadow-[0_6px_20px_rgba(200,86,80,0.15)]`;
                            textColor = 'text-[#902C2C] font-semibold';
                            iconColor = 'text-[#C85650]';
                            animationClass = "animate-shake";
                        } else {
                            cardClass += ` bg-[#FFF8F7] border-[#E1AAA5] shadow-[0_2px_10px_rgba(200,86,80,0.05)] cursor-default`;
                            textColor = 'text-[#743E3B] font-medium';
                            iconColor = 'text-[#B96E69]';
                        }
                     } else {
                        if (isSelected) {
                            cardClass += ` bg-[#FFFFFF] shadow-[0_8px_24px_rgba(30,37,72,0.05)] border-slate-900`;
                            textColor = 'text-slate-900 font-medium';
                            iconColor = 'text-slate-900';
                        } else {
                            cardClass += ` bg-[#FFFFFF] border-[#E4E5E7] hover:border-[var(--hover-color)] cursor-pointer hover:shadow-[0_12px_32px_rgba(0,0,0,0.03)] hover:-translate-y-0.5`;
                        }
                     }

                     return (
                        <button
                            key={String(item.val)}
                            onClick={() => onSelect(item.val)}
                            disabled={showStatus}
                            aria-pressed={!showStatus ? isSelected : undefined}
                            aria-label={showStatus
                                ? `${item.label} : ${isCorrectChoice ? t('common.correctAnswer') : isSelectedIncorrect ? `${t('common.yourChoice')} : ${t('common.incorrectAnswer')}` : t('common.incorrectAnswer')}`
                                : item.label}
                            className={`${cardClass} ${animationClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`}
                            style={{ 
                                ...(!showStatus && isSelected ? { 
                                    borderColor: themeColor,
                                    backgroundColor: `${themeColor}04`
                                } : {}),
                                '--hover-color': themeColor 
                            } as React.CSSProperties}
                        >
                            <FaIcon
                                icon={item.icon}
                                className={`w-[clamp(1.65rem,1.45rem_+_0.75vw,2.15rem)] h-[clamp(1.65rem,1.45rem_+_0.75vw,2.15rem)] transition-all duration-300 ${iconColor}`}
                            />
                            <div dir={dir} className={`w-full typo-ui text-[clamp(1.06rem,1rem_+_0.35vw,1.28rem)] leading-tight text-center relative z-10 transition-colors ${textColor}`}>
                                {item.label}
                            </div>
                            {showStatus && (
                                <ChoiceStatusMarker
                                    isCorrect={isCorrectChoice}
                                    isSelectedIncorrect={isSelectedIncorrect}
                                />
                            )}
                        </button>
                     );
                })}
            </div>
        );
    }

    return null;
};

export default React.memo(QuizOptions);
