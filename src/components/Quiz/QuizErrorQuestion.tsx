import React from 'react';
import MathRenderer from '../MathRenderer';
import { QuizQuestion } from '../../types';
import { ChoiceNumberBadge, ChoiceStatusMarker } from './QuizOptions';
import { getChoiceFeedbackState } from './choiceFeedback';
import { useI18n } from '../../i18n/I18nContext';

const QuizErrorQuestion: React.FC<{
    question: QuizQuestion;
    selectedAnswer: any;
    isAnswered: boolean;
    result: any;
    isReviewMode: boolean;
    onSelect: (val: any) => void;
}> = ({ question, selectedAnswer, isAnswered, result, isReviewMode, onSelect }) => {
    const { dir, lang, t } = useI18n();
    if (question.type !== 'error') return null;

    // Les étapes du raisonnement sont en français : elles restent LTR. Seuls les
    // libellés traduits suivent la langue de l'interface.
    const trackClass = lang === 'ar' ? 'tracking-normal' : 'tracking-[0.15em]';

    return (
        <div className="quiz-error-options">
            <p dir={dir} className={`text-center text-[clamp(0.65rem,0.6rem_+_0.2vw,0.78rem)] text-slate-500 font-bold uppercase ${trackClass} typo-ui`}>
                {t('common.chooseErrorStep')}
            </p>
            {(question as any).steps.map((step: any, idx: number) => {
                const userAns = isAnswered ? result?.userAnswer : selectedAnswer;
                const isSelected = userAns === step.id;
                const isThisError = Boolean(step.isError);
                const showStatus = isAnswered || isReviewMode;
                const feedbackState = getChoiceFeedbackState(showStatus, isThisError, isSelected);
                const isCorrectChoice = feedbackState === 'correct';
                const isSelectedIncorrect = feedbackState === 'selected-incorrect';

                let cardClass = `
                    quiz-error-choice w-full text-center rounded-xl border
                    transition-all duration-300 ease-out
                    relative overflow-visible group
                    flex items-center justify-center
                    active:scale-[0.98]
                `;
                let textColor = '';
                let animationClass = "";

                if (showStatus) {
                    if (isCorrectChoice) {
                        cardClass += ` bg-[#F0F7F1] border-[#5F9468] shadow-[0_6px_20px_rgba(95,148,104,0.14)]`;
                        textColor = 'text-emerald-900';
                    } else if (isSelectedIncorrect) {
                        cardClass += ` bg-[#FDEDEC] border-[#C85650] ring-2 ring-[#C85650]/15 shadow-[0_6px_20px_rgba(200,86,80,0.15)]`;
                        textColor = 'text-rose-900';
                        animationClass = "animate-shake";
                    } else {
                        cardClass += ` bg-[#FFF8F7] border-[#E1AAA5] shadow-[0_2px_10px_rgba(200,86,80,0.05)] cursor-default`;
                        textColor = 'text-[#743E3B]';
                    }
                } else {
                    if (isSelected) {
                        cardClass += ` bg-pistachio-50/80 border-pistachio-400 shadow-lg shadow-pistachio-500/10 scale-[1.02]`;
                        textColor = 'text-pistachio-900';
                    } else {
                        cardClass += ` bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50 hover:shadow-md cursor-pointer`;
                        textColor = 'text-slate-800';
                    }
                }

                return (
                    <button
                        key={step.id}
                        onClick={() => !showStatus && onSelect(step.id)}
                        disabled={showStatus}
                        aria-pressed={!showStatus ? isSelected : undefined}
                        aria-label={showStatus
                            ? `${step.text} : ${isCorrectChoice ? t('common.correctAnswer') : isSelectedIncorrect ? `${t('common.yourChoice')} : ${t('common.incorrectAnswer')}` : t('common.incorrectAnswer')}`
                            : step.text}
                        className={`${cardClass} ${animationClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-400`}
                    >
                        <ChoiceNumberBadge
                            number={idx + 1}
                            isSelected={isSelected}
                            isCorrect={isCorrectChoice}
                            isWrong={showStatus && !isThisError}
                            showStatus={showStatus}
                        />

                        <div className="min-w-0 flex-1 flex flex-col items-center justify-center gap-2">
                            <div className={`quiz-choice-text typo-ui font-medium tracking-tight ${textColor}`}>
                                <MathRenderer content={step.text} fontSize="inherit" />
                            </div>
                            {showStatus && isCorrectChoice && step.correction && (
                                <div dir={dir} className="mt-[clamp(0.45rem,1vw,0.7rem)] pt-[clamp(0.6rem,1.4vw,0.9rem)] border-t border-emerald-200/60 text-[clamp(0.84rem,0.8rem_+_0.2vw,0.96rem)] typo-ui text-emerald-800 animate-in fade-in duration-500 text-center">
                                    <span className="font-bold">{t('common.correction')} : </span>
                                    <MathRenderer inline content={step.correction} />
                                </div>
                            )}
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
};

export default React.memo(QuizErrorQuestion);
