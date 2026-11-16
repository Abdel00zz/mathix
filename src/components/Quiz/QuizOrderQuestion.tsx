import React from 'react';
import MathRenderer from '../MathRenderer';
import { faArrowDown, faArrowUp, faCircleCheck, faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { useI18n } from '../../i18n/I18nContext';

interface QuizOrderQuestionProps {
    localOrder: any[];
    isAnswered: boolean;
    result: any;
    onMove: (index: number, direction: 'up' | 'down') => void;
    isReviewMode: boolean;
}

const OrderItemBadge: React.FC<{ number: number | string }> = ({ number }) => (
    <div className="
        flex-shrink-0 w-[clamp(2.25rem,2rem_+_0.9vw,3rem)] h-[clamp(2.25rem,2rem_+_0.9vw,3rem)] rounded-lg border
        flex items-center justify-center
        typo-ui font-bold text-[clamp(0.875rem,0.82rem_+_0.28vw,1.125rem)]
        bg-slate-100 border-slate-200 text-slate-500
        transition-all duration-300
    ">
        {number}
    </div>
);

const QuizOrderQuestion: React.FC<QuizOrderQuestionProps> = ({ localOrder, isAnswered, result, onMove, isReviewMode }) => {
    const { dir, t } = useI18n();
    
    const showStatus = isAnswered || isReviewMode;
    const isCorrectOrder = showStatus && result?.isCorrect;

    return (
        <div className="quiz-order-options">
            {localOrder.map((item, idx) => {
                let cardClass = `
                    quiz-order-choice w-full text-left rounded-xl border
                    transition-all duration-300 ease-out
                    flex items-center
                `;

                if (showStatus) {
                    cardClass += isCorrectOrder 
                        ? ' bg-emerald-50/70 border-emerald-300 text-emerald-900' 
                        : ' bg-rose-50/70 border-rose-300 text-rose-900 animate-shake';
                } else {
                    cardClass += ' bg-white border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300';
                }
                
                return (
                    <div key={item.id} className={cardClass}>
                        <OrderItemBadge number={idx + 1} />
                        
                        <div className="quiz-order-text flex-1 typo-ui text-slate-800">
                            <MathRenderer inline content={item.content} fontSize="inherit" />
                        </div>
                        
                        {!showStatus && (
                            <div className="quiz-order-controls text-slate-400">
                                <button 
                                    type="button"
                                    onClick={() => onMove(idx, 'up')} 
                                    disabled={idx === 0} 
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    aria-label={t('common.moveUpItem', { index: idx + 1 })}
                                >
                                    <FaIcon icon={faArrowUp} size={16} />
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => onMove(idx, 'down')} 
                                    disabled={idx === localOrder.length - 1} 
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    aria-label={t('common.moveDownItem', { index: idx + 1 })}
                                >
                                    <FaIcon icon={faArrowDown} size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
             {showStatus && (
                <div dir={dir} className={`mt-[clamp(0.85rem,2vw,1.25rem)] p-[clamp(0.85rem,2vw,1.25rem)] rounded-xl flex items-center justify-center gap-[clamp(0.5rem,1.2vw,0.85rem)] text-[clamp(0.875rem,0.82rem_+_0.22vw,1rem)] font-bold ${isCorrectOrder ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                    {isCorrectOrder ? <FaIcon icon={faCircleCheck} size={18} /> : <FaIcon icon={faCircleXmark} size={18} />}
                    <span>{isCorrectOrder ? t('common.orderCorrect') : t('common.orderIncorrect')}</span>
                </div>
            )}
        </div>
    );
};

export default React.memo(QuizOrderQuestion);
