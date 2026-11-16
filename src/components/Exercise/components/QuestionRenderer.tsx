
import React, { memo } from 'react';
import { ParsedQuestion, ParsedExercise, ParsedSubQuestion } from '../engine';
import RichText from './RichText';
import HintPanel from './HintPanel';
import PartHeader from './PartHeader';
import TextBlock from './TextBlock';
import QuestionNumber from './QuestionNumber';
import SubQuestionLabel from './SubQuestionLabel';
import HintButton from './HintButton';
import MediaRenderer from '../../MediaRenderer';
import InlineCanvasZone from '../canvas/InlineCanvasZone';
import { useProfessorAccess } from '../../../hooks/useProfessorAccess';

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Compteur 1-based vers label alphabétique : 1 → A, 2 → B, 27 → AA. */
const toAlpha = (num: number): string => {
    let s = '';
    let n = num;
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s || 'A';
};

/**
 * BaselineAnchor: wraps a fixed-size badge so it participates in the
 * first-baseline alignment of the grid row.
 */
const BaselineAnchor = memo(({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center leading-relaxed align-baseline" style={{ lineHeight: 'inherit' }}>
        <span aria-hidden className="invisible w-0 text-[clamp(1.14rem,1.08rem_+_0.26vw,1.28rem)] typo-ui">&hairsp;</span>
        {children}
    </span>
));

const SubQuestionRow = memo(({
    label,
    number,
    subQuestion,
    isActive,
    isBlurred,
    onToggle
}: {
    label: string;
    number?: string;
    subQuestion: ParsedSubQuestion;
    isActive: boolean;
    isBlurred: boolean;
    onToggle: () => void;
}) => {
    const professorAccess = useProfessorAccess();
    const gridCols = number ? 'grid-cols-[auto_auto_1fr_auto]' : 'grid-cols-[auto_1fr_auto]';
    const marginLeft = number ? '' : 'ml-[clamp(0.85rem,3vw,3rem)]';

    return (
        <div className={`transition-all duration-500 ease-out ${isBlurred ? 'opacity-40 blur-[0.5px] pointer-events-none' : 'opacity-100'}`}>
            <div className={`grid ${gridCols} gap-[clamp(0.375rem,0.9vw,0.625rem)] items-first-baseline py-[clamp(0.2rem,0.6vw,0.45rem)] ${marginLeft} [&_.katex-display]:!my-1`} style={{ alignItems: 'baseline' }}>
                {number && (
                    <BaselineAnchor>
                        <QuestionNumber number={number} />
                    </BaselineAnchor>
                )}
                <BaselineAnchor>
                    {label ? <SubQuestionLabel label={label} isActive={isActive} /> : (number ? null : <div className="w-[clamp(1.5rem,3vw,2rem)]" />)}
                </BaselineAnchor>
                <div className={`text-[clamp(0.98rem,0.93rem_+_0.22vw,1.12rem)] typo-exercise leading-[1.55] tracking-normal min-w-0 w-full [&_.katex]:text-[1em] [&_.katex]:tracking-normal ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
                    <MediaRenderer media={subQuestion.media} variant="exercise">
                        <RichText content={subQuestion.content} />
                    </MediaRenderer>
                </div>
                <BaselineAnchor>
                    <span className="inline-flex items-center gap-1.5">
                        {subQuestion.bareme != null && (
                            <span className="shrink-0 inline-flex items-center justify-center h-[clamp(1.35rem,1.25rem_+_0.4vw,1.6rem)] px-[clamp(0.35rem,0.7vw,0.5rem)] bg-transparent border border-slate-300/60 rounded text-slate-500 typo-exercise font-normal text-[clamp(0.68rem,0.64rem_+_0.15vw,0.76rem)] tracking-tight tabular-nums">
                                {subQuestion.bareme}<span className="text-[clamp(0.55rem,0.52rem_+_0.12vw,0.62rem)] ml-0.5 opacity-70">pt</span>
                            </span>
                        )}
                        {!professorAccess && (
                            <HintButton isActive={isActive} onClick={onToggle} hasHint={subQuestion.hasHint} />
                        )}
                    </span>
                </BaselineAnchor>
            </div>

            {/* Mode Professeur Tablette : Cadre de réponse unifié (Canvas + Onglets Aide et X fusionnés) */}
            {professorAccess && (
                <div className="print:hidden">
                    <InlineCanvasZone
                        noteKey={`exercise-sq:${subQuestion.uniqueId}`}
                        hint={subQuestion.hint}
                        hasHint={subQuestion.hasHint}
                        isHintActive={isActive}
                        onHintToggle={onToggle}
                    />
                </div>
            )}

            {/* Mode Élève : Panneau d'indice propre sous l'énoncé sans aucun canevas */}
            {!professorAccess && (
                <div className="print:hidden">
                    <HintPanel hint={subQuestion.hint} isOpen={isActive} />
                </div>
            )}
        </div>
    );
});


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDERER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface QuestionRendererProps {
    question: ParsedQuestion;
    parsedExercise: ParsedExercise;
    activeSubQuestionId: string | null;
    onToggle: (id: string) => void;
    isPreview?: boolean;
    partCounter: number;
    questionCounter: number;
}

const QuestionRenderer = memo<QuestionRendererProps>(({
    question, parsedExercise, activeSubQuestionId, onToggle, isPreview, partCounter, questionCounter
}) => {
    const professorAccess = useProfessorAccess();
    const activeIndex = activeSubQuestionId ? parsedExercise.flatSubQuestionIds.indexOf(activeSubQuestionId) : -1;

    // --- CASE 1: PARTIE / HEADER ---
    if (question.type === 'partie') {
        return (
            <div className="mb-[clamp(1rem,2.2vw,1.65rem)] animate-in fade-in duration-500">
                <PartHeader partLabel={toAlpha(partCounter)} content={question.content} />
                <div className="space-y-[clamp(0.375rem,0.8vw,0.625rem)]">
                    {question.subQuestions.map((sq, idx) => {
                        const myIndex = parsedExercise.flatSubQuestionIds.indexOf(sq.uniqueId);
                        const isFuture = !isPreview && activeIndex !== -1 && myIndex > activeIndex;
                        return (
                            <SubQuestionRow
                                key={sq.uniqueId}
                                label={String.fromCharCode(97 + idx)}
                                subQuestion={sq}
                                isActive={activeSubQuestionId === sq.uniqueId}
                                isBlurred={isFuture}
                                onToggle={() => onToggle(sq.uniqueId)}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // --- CASE 2: TEXT BLOCK ---
    if (question.type === 'text') {
        return <TextBlock content={question.content} media={question.media} />;
    }

    // --- CASE 3: No renderable content ---
    if (question.subQuestions.length === 0 && !question.content) {
        return null;
    }

    const qNumber = String(questionCounter);
    const hasMainContent = !!question.content.trim();
    // A "flat" question carries its whole statement on a single sub-question.
    const isFlat = !hasMainContent && question.subQuestions.length === 1;

    // --- CASE 4: QUESTION (Flat or Nested) ---
    return (
        <section className="relative group mb-[clamp(0.75rem,1.6vw,1.15rem)] animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${questionCounter * 50}ms` }}>
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] gap-x-[clamp(0.375rem,0.9vw,0.625rem)]">

                {/* Header row — statement of a question that introduces sub-questions */}
                {hasMainContent && (
                    <>
                        <div className="py-[clamp(0.2rem,0.6vw,0.45rem)]" style={{ alignSelf: 'baseline' }}>
                            <BaselineAnchor>
                                <QuestionNumber number={qNumber} />
                            </BaselineAnchor>
                        </div>
                        <div
                            className="py-[clamp(0.2rem,0.6vw,0.45rem)] min-w-0 [&_.katex-display]:!my-1"
                            style={{ gridColumn: '2 / 4', alignSelf: 'baseline' }}
                        >
                            <div className="text-[clamp(0.98rem,0.93rem_+_0.22vw,1.12rem)] typo-exercise text-slate-900 font-medium leading-[1.55] tracking-normal min-w-0 w-full [&_.katex]:text-[1em] [&_.katex]:tracking-normal">
                                <MediaRenderer media={question.media} variant="exercise">
                                    <RichText content={question.content} />
                                </MediaRenderer>
                            </div>
                        </div>
                        <div aria-hidden />
                    </>
                )}

                {question.subQuestions.map((sq, idx) => {
                    const myIndex = parsedExercise.flatSubQuestionIds.indexOf(sq.uniqueId);
                    const isFuture = !isPreview && activeIndex !== -1 && myIndex > activeIndex;
                    const isActive = activeSubQuestionId === sq.uniqueId;
                    const blurCls = `transition-all duration-500 ease-out ${isFuture ? 'opacity-40 blur-[0.5px] pointer-events-none' : 'opacity-100'}`;
                    // The number belongs to the first row only when no header row rendered it.
                    const showNumber = !hasMainContent && idx === 0;

                    return (
                        <React.Fragment key={sq.uniqueId}>
                            {/* Col 1 — question number */}
                            <div className={`py-[clamp(0.2rem,0.6vw,0.45rem)] ${blurCls}`} style={{ alignSelf: 'baseline' }}>
                                {showNumber && (
                                    <BaselineAnchor>
                                        <QuestionNumber number={qNumber} />
                                    </BaselineAnchor>
                                )}
                            </div>

                            {/* Col 2 — sub-question label a. b. c.
                                Question « plate » : la cellule est OMISE (pas seulement vide) —
                                une cellule vide occuperait la colonne 2 et repousserait l'énoncé
                                (qui s'étend sur les colonnes 2-3) sur la ligne suivante, laissant
                                le numéro de question désaligné sur la ligne du dessus. */}
                            {!isFlat && (
                                <div className={`py-[clamp(0.2rem,0.6vw,0.45rem)] ${blurCls}`} style={{ alignSelf: 'baseline' }}>
                                    <BaselineAnchor>
                                        <SubQuestionLabel label={String.fromCharCode(97 + idx)} isActive={isActive} />
                                    </BaselineAnchor>
                                </div>
                            )}

                            {/* Col 3 — statement */}
                            <div
                                className={`py-[clamp(0.2rem,0.6vw,0.45rem)] min-w-0 [&_.katex-display]:!my-1 ${blurCls}`}
                                style={{ alignSelf: 'baseline', ...(isFlat ? { gridColumn: '2 / 4' } : null) }}
                            >
                                <div className={`text-[clamp(0.98rem,0.93rem_+_0.22vw,1.12rem)] typo-exercise leading-[1.55] tracking-normal min-w-0 w-full [&_.katex]:text-[1em] [&_.katex]:tracking-normal ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
                                    <MediaRenderer media={sq.media} variant="exercise">
                                        <RichText content={sq.content} />
                                    </MediaRenderer>
                                </div>
                            </div>

                            {/* Col 4 — bareme + hint button */}
                            <div className={`py-[clamp(0.2rem,0.6vw,0.45rem)] ${blurCls}`} style={{ alignSelf: 'baseline' }}>
                                <BaselineAnchor>
                                    <span className="inline-flex items-center gap-1.5">
                                        {sq.bareme != null && (
                                            <span className="shrink-0 inline-flex items-center justify-center h-[clamp(1.35rem,1.25rem_+_0.4vw,1.6rem)] px-[clamp(0.35rem,0.7vw,0.5rem)] bg-transparent border border-slate-300/60 rounded text-slate-400 typo-ui font-light text-[clamp(0.7rem,0.66rem_+_0.15vw,0.78rem)] tracking-tight tabular-nums">
                                                {sq.bareme}<span className="text-[clamp(0.55rem,0.52rem_+_0.12vw,0.62rem)] ml-0.5 opacity-70">pt</span>
                                            </span>
                                        )}
                                        {!professorAccess && (
                                            <HintButton isActive={isActive} onClick={() => onToggle(sq.uniqueId)} hasHint={sq.hasHint} />
                                        )}
                                    </span>
                                </BaselineAnchor>
                            </div>

                            {/* Mode Professeur Tablette : Cadre de réponse unifié (Canvas avec quadrillage + Onglets Aide et X fusionnés) */}
                            {professorAccess && (
                                <div style={{ gridColumn: '1 / -1' }} className={blurCls}>
                                    <InlineCanvasZone
                                        noteKey={`exercise-sq:${sq.uniqueId}`}
                                        hint={sq.hint}
                                        hasHint={sq.hasHint}
                                        isHintActive={isActive}
                                        onHintToggle={() => onToggle(sq.uniqueId)}
                                    />
                                </div>
                            )}

                            {/* Mode Élève : Panneau d'indice propre sous l'énoncé sans aucun canevas */}
                            {!professorAccess && (
                                <div style={{ gridColumn: '1 / -1' }} className={blurCls}>
                                    <HintPanel hint={sq.hint} isOpen={isActive} />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </section>
    );
});

export default QuestionRenderer;
