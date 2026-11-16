

import React, { useMemo, useCallback, memo } from 'react';
import { Exercise, MasteryLevel } from '../../types';
import { parseExercise, numberExercise, ParsedQuestion } from './engine';

// Import modular components
import SessionTimer from './components/SessionTimer';
import ExerciseBadge from './components/ExerciseBadge';
import PrintButton from './components/PrintButton';
import ContextBlock from './components/ContextBlock';
import QuestionRenderer from './components/QuestionRenderer';
import EvaluationBar from './EvaluationBar';
import { printPrepared } from '@/services/printService';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface ExerciseArticleProps {
    exercise: Exercise;
    currentIndex: number;
    activeSubQuestionId: string | null;
    onToggle: (id: string) => void;
    onGlobalFeedback: (mastery: MasteryLevel, duration?: number | null) => void;
    globalFeedback?: MasteryLevel;
    globalDuration?: number | null;
    isPreview?: boolean;
    isLocked?: boolean;
    /** Examen/DS mode: hide per-exercise print button, seamless layout */
    isExamenMode?: boolean;
}

const ExerciseArticle: React.FC<ExerciseArticleProps> = ({
    exercise, currentIndex, activeSubQuestionId, onToggle, onGlobalFeedback, globalFeedback = null, globalDuration, isPreview = false, isLocked = false, isExamenMode = false
}) => {
    const parsedExercise = useMemo(() => parseExercise(exercise), [exercise]);
    const exerciseNumber = String(currentIndex + 1).padStart(2, '0');
    const professorAccess = useProfessorAccess();

    const handlePrint = useCallback(async () => {
        await printPrepared();
    }, []);

    // Numérotation des parties et des questions : la règle vit dans le moteur
    // (`numberExercise`), partagée avec le studio d'édition — le professeur doit
    // lire les mêmes numéros que l'élève.
    const counters = useMemo(() => numberExercise(parsedExercise.questions), [parsedExercise.questions]);

    return (
        <article dir="ltr" lang="fr" className={`animate-in fade-in duration-700 w-full ${professorAccess && !isExamenMode ? 'max-w-none' : 'max-w-7xl'} mx-auto typo-exercise ${isExamenMode ? 'py-0' : 'py-[clamp(0.25rem,0.8vw,0.65rem)]'}`}>
            <div className="bg-white print:bg-white">
                <div className={
                    isExamenMode
                        ? 'px-[clamp(0.6rem,2.2vw,1.6rem)] py-[clamp(0.75rem,1.8vw,1.25rem)] print:p-4'
                        : professorAccess
                            // Mode prof : le conteneur parent porte déjà les marges latérales,
                            // on ne les double pas — la largeur récupérée va au canvas.
                            ? 'px-[clamp(0.5rem,1.2vw,0.9rem)] py-[clamp(0.9rem,2vw,1.35rem)] print:p-4'
                            : 'p-[clamp(0.85rem,2.6vw,2.25rem)] print:p-4'
                }>
                    <header className="relative mb-[clamp(0.75rem,2vw,1.4rem)] select-none print:mb-8">
                        <div className="flex items-center justify-between gap-[clamp(0.75rem,1.8vw,1.25rem)]">
                            <ExerciseBadge number={exerciseNumber} examenYear={isExamenMode ? exercise.examenYear : undefined} examenSession={isExamenMode ? exercise.examenSession : undefined} />
                            {!isExamenMode && (
                                <div className="flex items-center gap-2 print:hidden">
                                    {parsedExercise.sessionDate && <SessionTimer sessionDate={parsedExercise.sessionDate.toISOString()} />}
                                    {/* Version tablette professeur : l'énoncé se projette, il ne
                                        s'imprime pas depuis cet en-tête (la séance a son propre
                                        module d'impression). Côté élève, le bouton reste. */}
                                    {!professorAccess && <PrintButton onClick={handlePrint} />}
                                </div>
                            )}
                        </div>
                    </header>

                    {parsedExercise.context && (
                        <ContextBlock
                            content={parsedExercise.context}
                            media={parsedExercise.media}
                        />
                    )}

                    <div className={professorAccess ? 'space-y-[clamp(0.75rem,1.6vw,1.15rem)]' : 'space-y-[clamp(0.6rem,1.3vw,0.95rem)]'}>
                        {parsedExercise.questions.map((question: ParsedQuestion, idx: number) => (
                            <QuestionRenderer
                                key={question.id}
                                question={question}
                                parsedExercise={parsedExercise}
                                activeSubQuestionId={activeSubQuestionId}
                                onToggle={onToggle}
                                isPreview={isPreview}
                                partCounter={counters[idx].part}
                                questionCounter={counters[idx].question}
                            />
                        ))}
                    </div>

                    {!isPreview && (
                        <div className="mt-[clamp(1.25rem,2.6vw,1.85rem)] pt-[clamp(0.85rem,1.6vw,1.25rem)] animate-in fade-in slide-in-from-bottom-4 duration-700 print:hidden">
                            <div className="w-full max-w-full overflow-visible">
                                <EvaluationBar mastery={globalFeedback} duration={globalDuration} onEvaluate={onGlobalFeedback} variant="exercise" disabled={isLocked} isExamenMode={isExamenMode} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </article>
    );
};

export default memo(ExerciseArticle);
