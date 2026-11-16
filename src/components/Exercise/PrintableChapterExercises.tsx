/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRINTABLE CHAPTER EXERCISES v8.0 - Academic Print Layout
 * - Border-based badge that prints WITHOUT "background graphics" option.
 * - Centered header with elegant double-rule separator (academic paper style).
 * - Fixed footer: no background color to avoid black band artifacts.
 * - Clean, modern academic aesthetic inspired by recent math publications.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo, memo } from 'react';
import { Exercise, Question, SubQuestion } from '../../types';
import MathRenderer from '../MathRenderer';
import MediaRenderer from '../MediaRenderer';
import StrokeSvg from './canvas/StrokeSvg';
import type { Stroke } from './canvas/types';

export interface PrintHeaderConfig {
    brand: string;
    caption: string;
    classLabel: string;
    yearLabel: string;
    kicker: string;
    title: string;
    frame: 'double' | 'rule' | 'plain';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PrintableChapterExercisesProps {
    className?: string;
    classId?: string;
    chapterTitle: string;
    exercises: Exercise[];
    startIndex?: number;
    showCorrections?: boolean;
    professorName?: string;
    hideTeacherName?: boolean;
    /** Style de la zone de réponse (cadre manuscrit) à l'impression. */
    answerSpaceStyle?: 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
    /** Couleur du papier de la zone de réponse. */
    answerSpaceColor?: 'white' | 'cream' | 'black' | 'green' | 'blue';
    /** Masque l'en-tête (quand un en-tête de séance est déjà affiché). */
    hideHeader?: boolean;
    /** Traits manuscrits (noteKey → strokes) : si fournis, seules les zones
     *  réellement annotées (non vides, ouvertes par le prof) sont affichées. */
    strokes?: Record<string, unknown[]>;
    /** Affiche les zones de réponse (cadres manuscrits). Exclusif à la version
     *  professeur (archive de séance) : l'impression élève n'en montre aucune. */
    showAnswerSpaces?: boolean;
    header?: Partial<PrintHeaderConfig>;
    footer?: { professorName: string; note: string };
    exercisePerPage?: boolean;
}

interface PrintContext {
    showCorrections: boolean;
    answerSpaceStyle: 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
    answerSpaceColor: 'white' | 'cream' | 'black' | 'green' | 'blue';
    strokes?: Record<string, unknown[]>;
    showAnswerSpaces: boolean;
}


interface ExercisePrintStatement {
    topic: string;
    context: string;
    media?: Exercise['media'];
}

const sanitizeText = (value?: string): string => (value || '').replace(/\s+/g, ' ').trim();

const buildExerciseStatement = (exercise: Exercise): ExercisePrintStatement => {
    const topic = sanitizeText(exercise.topic);
    const context = sanitizeText(exercise.context);

    if (topic || context) {
        return { topic, context, media: exercise.media };
    }

    const firstTextBlock = (exercise.questions || []).find((q) => (q.type || '').toLowerCase() === 'text' && sanitizeText(q.content));
    return {
        topic: topic || 'Énoncé',
        context: sanitizeText(firstTextBlock?.content),
        media: exercise.media || firstTextBlock?.media,
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// NUMBERING UTILS (v7.2 Update)
// ═══════════════════════════════════════════════════════════════════════════════

const toAlpha = (n: number): string => String.fromCharCode(96 + n);
const getLabel = (idx: number): string => `${toAlpha(idx + 1)}.`; // Changed from ')' to '.'

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/** Format classId to readable class name for print */
const formatClassLabel = (classId?: string): string => {
    if (!classId) return '';
    return classId
        .replace(/-/g, ' ')
        .replace(/math[ée]matiques?/gi, 'Math')
        .replace(/exp[ée]rimentales?/gi, 'Exp')
        .replace(/sciences?/gi, 'Sciences')
        .replace(/\b(tc|TC)\b/g, 'Tronc Commun')
        .replace(/\b(1ere|1ère)\b/gi, '1ère')
        .replace(/\b(2eme|2ème)\b/gi, '2ème')
        .replace(/\b\w/g, c => c.toUpperCase());
};

const currentYear = new Date().getFullYear();
const schoolYear = new Date().getMonth() >= 8
    ? `${currentYear}/${currentYear + 1}`
    : `${currentYear - 1}/${currentYear}`;

const PrintHeader = memo(({ chapterTitle, classId, config = {} }: { chapterTitle: string; classId?: string; config?: Partial<PrintHeaderConfig> }) => {
    const classLabel = config.classLabel || formatClassLabel(classId);
    const yearLabel = config.yearLabel || `Année scolaire ${schoolYear}`;
    const title = config.title || chapterTitle;
    return (
    <div className="print-sheet-header">
        {/* Top row: brand left, Class name right — Prep class style */}
        <div className="print-sheet-topline">
            {/* Left: Branding */}
            <div className="print-brand-block">
                <h1 className="print-brand typo-ui">
                    {config.brand || 'monProf'}
                </h1>
                <p className="print-brand-caption">
                    {config.caption || 'Excellence en Mathématiques'}
                </p>
            </div>

            {/* Right: Class info */}
            <div className="print-meta-block">
                {classLabel && (
                    <p className="print-class-label">
                        {classLabel}
                    </p>
                )}
                <p className="print-year-label">
                    {yearLabel}
                </p>
            </div>
        </div>

        {/* Centered Framed Chapter Title */}
        <div className="print-title-wrap">
            <div className="print-title-card" data-frame={config.frame || 'double'}>
                <p className="print-title typo-ui">
                    <span className="print-title-kicker">{config.kicker || 'Chapitre'}</span>
                    <MathRenderer inline content={title} fontSize="inherit" className="typo-title-mono" />
                </p>
            </div>
        </div>
    </div>
    );
});


const PrintFooter = memo(({ professorName, note = 'Bon courage' }: { professorName: string; note?: string }) => (
    <div className="print-footer-clean print-sheet-footer">
        <p>
            Pr. {professorName}
        </p>
        <p>
            {note}
        </p>
    </div>
));

const StatementBlock = memo(({ statement }: { statement: ExercisePrintStatement }) => {
    if (!statement.context) return null;

    return (
        <div className="print-statement">
            <div className="print-statement-content">
                <MediaRenderer media={statement.media}>
                    <MathRenderer content={statement.context} fontSize="inherit" />
                </MediaRenderer>
            </div>
        </div>
    );
});

const ExerciseBanner = memo(({ number }: { number: number }) => (
    <div className="print-exercise-banner">
        <span className="print-exercise-badge" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            Exercice {number}
        </span>
    </div>
));

const QuestionNumber = memo(({ number }: { number: string }) => (
    <span className="print-question-number">{number}</span>
));

const SubQuestionLabel = memo(({ label }: { label: string }) => (
    <span className="print-subquestion-label">{label}</span>
));

const PartHeader = memo(({ label, content }: { label: string; content: string }) => (
    <div className="print-part-header">
        <div className="print-part-row">
            <span className="print-part-line" />
            <h3 className="print-part-title font-itim">
                Partie {label.toUpperCase()}
            </h3>
            <span className="print-part-line" />
        </div>
        {content && (
            <div className="print-part-content">
                <MathRenderer inline content={content} fontSize="inherit" />
            </div>
        )}
    </div>
));

const CorrectionBlock = memo(({ content }: { content: string }) => {
    if (!content?.trim()) return null;
    return (
        <div className="print-correction">
            <div>
                <MathRenderer inline content={`\\textbf{Solution :} ${content}`} fontSize="inherit" />
            </div>
        </div>
    );
});

const Content = memo(({ content }: { content: string }) => {
    if (!content?.trim()) return null;
    return (
        <div className="print-content">
            <MathRenderer content={content} fontSize="inherit" />
        </div>
    );
});

/** Cadre de réponse (zone manuscrite) — exclusif au professeur.
 *  `showAnswerSpaces` doit être vrai pour qu'une zone soit rendue. Quand des
 *  traits sont fournis (archive de séance), seules les zones réellement
 *  annotées sont imprimées, l'encre étant dessinée à sa place sur le
 *  quadrillage — plus de récapitulatif séparé. Sans traits, le cadre reste vide
 *  (impression d'un exercice vierge). */
const AnswerBox = memo(({ context, noteKey }: { context: PrintContext; noteKey: string }) => {
    if (!context.showAnswerSpaces) return null;
    if (context.strokes !== undefined) {
        const strokes = context.strokes[noteKey] as Stroke[] | undefined;
        if (!strokes || strokes.length === 0) return null;
        return (
            <div
                className="print-answer-box print-answer-box--annotated"
                data-style={context.answerSpaceStyle}
                data-color={context.answerSpaceColor}
            >
                <StrokeSvg strokes={strokes} width={720} transparent />
            </div>
        );
    }
    return (
        <div
            className="print-answer-box"
            data-style={context.answerSpaceStyle}
            data-color={context.answerSpaceColor}
            aria-hidden="true"
        />
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION RENDERERS (v7.3 Update - Fix for title-less sub-questions)
// ═══════════════════════════════════════════════════════════════════════════════

const SubQuestionItem = memo(({ sq, label, context, exerciseId, questionId }: {
    sq: SubQuestion;
    label: string;
    context: PrintContext;
    exerciseId: string;
    questionId: string;
}) => (
    <div className="print-subquestion-item">
        <table className="print-question-table">
            <tbody>
                <tr>
                    <td className="print-subquestion-label-cell">
                        <SubQuestionLabel label={label} />
                    </td>
                    <td className="print-content-cell">
                       <MediaRenderer media={sq.media}>
                            <Content content={sq.content || ''} />
                        </MediaRenderer>
                    </td>
                </tr>
            </tbody>
        </table>
        {context.showCorrections && sq.correction && (
            <CorrectionBlock content={sq.correction} />
        )}
        <AnswerBox context={context} noteKey={`exercise-sq:${exerciseId}-${questionId}-${sq.id}`} />
    </div>
));

const NestedQuestion = memo(({ question, number, context, exerciseId }: { question: Question; number: number; context: PrintContext; exerciseId: string }) => {
    const content = question.content || '';
    const sqs = question.subQuestions || [];
    const hasTitle = content.trim().length > 0;

    // --- FIX V7.3: Handle questions with sub-questions but no main title ---
    if (!hasTitle && sqs.length > 0) {
        const firstSub = sqs[0];
        const remainingSubs = sqs.slice(1);
        const firstLabel = sqs.length > 1 ? getLabel(0) : '';

        return (
            <div className="print-question-block">
                {/* Render first sub-question on the same line as the main number */}
                <table className="print-question-table">
                    <tbody>
                        <tr>
                            <td className="print-question-number-cell">
                                <QuestionNumber number={`${number}`} />
                            </td>
                            {firstLabel && <td className="print-subquestion-label-cell"><SubQuestionLabel label={firstLabel}/></td>}
                            <td className="print-content-cell">
                                <MediaRenderer media={firstSub.media}>
                                    <Content content={firstSub.content || ''} />
                                </MediaRenderer>
                            </td>
                        </tr>
                    </tbody>
                </table>
                {context.showCorrections && firstSub.correction && (
                    <CorrectionBlock content={firstSub.correction} />
                )}
                {/* La première sous-question est remontée sur la ligne du numéro,
                    mais elle a bien sa propre zone de réponse : sans ce cadre,
                    l'encre écrite dessus sur la tablette serait comptée puis
                    silencieusement absente du PDF. */}
                <AnswerBox context={context} noteKey={`exercise-sq:${exerciseId}-${question.id}-${firstSub.id}`} />

                {/* Render remaining sub-questions indented */}
                <div className="print-subquestions">
                    {remainingSubs.map((sq, idx) => (
                        <SubQuestionItem
                            key={sq.id}
                            sq={sq}
                            label={getLabel(idx + 1)}
                            context={context}
                            exerciseId={exerciseId}
                            questionId={question.id}
                        />
                    ))}
                </div>
            </div>
        );
    }
    
    // --- Standard rendering for questions with a title ---
    return (
        <div className="print-question-block">
            <table className="print-question-table">
                <tbody>
                    <tr>
                        <td className="print-question-number-cell">
                            <QuestionNumber number={`${number}`} />
                        </td>
                        <td className="print-content-cell print-main-question-cell">
                            <MediaRenderer media={question.media}>
                                <Content content={content} />
                            </MediaRenderer>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div className="print-subquestions">
                {sqs.map((sq, idx) => (
                    <SubQuestionItem
                        key={sq.id}
                        sq={sq}
                        label={getLabel(idx)}
                        context={context}
                        exerciseId={exerciseId}
                        questionId={question.id}
                    />
                ))}
            </div>
        </div>
    );
});


const FlatQuestion = memo(({ question, number, context, exerciseId }: { question: Question; number: number; context: PrintContext; exerciseId: string }) => {
    const content = question.content || '';
    const correction = (question as any).correction || '';

    return (
        <div className="print-question-block">
            <table className="print-question-table">
                <tbody>
                    <tr>
                        <td className="print-question-number-cell">
                            <QuestionNumber number={`${number}`} />
                        </td>
                        <td className="print-content-cell">
                            <MediaRenderer media={question.media}>
                                <Content content={content} />
                            </MediaRenderer>
                        </td>
                    </tr>
                </tbody>
            </table>
            {context.showCorrections && correction && (
                <CorrectionBlock content={correction} />
            )}
            <AnswerBox context={context} noteKey={`exercise-sq:${exerciseId}-${question.id}-main`} />
        </div>
    );
});


// ═══════════════════════════════════════════════════════════════════════════════
// CORE RENDERER LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

const QuestionRenderer = memo(({ question, qNumber, partNumber, context, exerciseId }: {
    question: Question;
    qNumber: number;
    partNumber: number;
    context: PrintContext;
    exerciseId: string;
}) => {
    const type = (question.type || 'question').toLowerCase();
    const content = question.content || '';
    const sqs = question.subQuestions || [];

    if (type === 'partie' || type === 'header') {
        // Une « partie » porte souvent ses propres sous-questions (c'est ce que
        // rend l'écran). Ne sortir que l'en-tête ferait disparaître du PDF à la
        // fois leurs énoncés et l'encre écrite dessus sur la tablette.
        return (
            <>
                <PartHeader label={toAlpha(partNumber)} content={content} />
                {sqs.length > 0 && (
                    <div className="print-subquestions">
                        {sqs.map((sq, idx) => (
                            <SubQuestionItem
                                key={sq.id}
                                sq={sq}
                                label={getLabel(idx)}
                                context={context}
                                exerciseId={exerciseId}
                                questionId={question.id}
                            />
                        ))}
                    </div>
                )}
            </>
        );
    }

    if (type === 'text') {
        if (!content.trim()) return null;
        return (
            <div className="print-text-block">
                <MediaRenderer media={question.media}>
                    <MathRenderer content={content} fontSize="inherit" />
                </MediaRenderer>
            </div>
        );
    }
    
    if (!content.trim() && sqs.length === 0) {
        return null;
    }
    
    if (sqs.length > 0) {
        return <NestedQuestion question={question} number={qNumber} context={context} exerciseId={exerciseId} />;
    } else {
        return <FlatQuestion question={question} number={qNumber} context={context} exerciseId={exerciseId} />;
    }
});

const ExerciseRenderer = memo(({ exercise, exerciseNumber, context, exercisePerPage = false }: {
    exercise: Exercise;
    exerciseNumber: number;
    context: PrintContext;
    exercisePerPage?: boolean;
}) => {
    const statement = useMemo(() => buildExerciseStatement(exercise), [exercise]);
    const counters = useMemo(() => {
        return (exercise.questions || []).reduce<{
            qCount: number;
            pCount: number;
            items: Array<{ q: number; p: number }>;
        }>((state, q) => {
            const type = (q.type || 'question').toLowerCase();
            const isPart = type === 'partie' || type === 'header';
            const hasQuestionContent = type === 'question' || !q.type;
            const pCount = isPart ? state.pCount + 1 : state.pCount;
            const qCount = isPart
                ? 0
                : hasQuestionContent && (q.content?.trim() || q.subQuestions?.length)
                    ? state.qCount + 1
                    : state.qCount;

            return {
                qCount,
                pCount,
                items: [...state.items, { q: qCount, p: pCount }],
            };
        }, { qCount: 0, pCount: 0, items: [] }).items;
    }, [exercise.questions]);

    return (
        <div className="print-exercise" data-page-break={exercisePerPage || undefined}>
            <ExerciseBanner number={exerciseNumber} />
            <StatementBlock statement={statement} />

            <div className="print-question-list">
                {(exercise.questions || []).map((q, idx) => (
                    <QuestionRenderer
                        key={q.id}
                        question={q}
                        qNumber={counters[idx].q}
                        partNumber={counters[idx].p}
                        context={context}
                        exerciseId={exercise.id}
                    />
                ))}
            </div>
        </div>
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const PrintableChapterExercises: React.FC<PrintableChapterExercisesProps> = ({
    className = '',
    classId,
    chapterTitle,
    exercises,
    startIndex = 0,
    showCorrections = false,
    professorName = 'Boudouh Abdelmalek',
    hideTeacherName = false,
    answerSpaceStyle = 'grid',
    answerSpaceColor = 'white',
    hideHeader = false,
    strokes,
    showAnswerSpaces = false,
    header,
    footer,
    exercisePerPage = false,
}) => {
    return (
        <div className={`print-document ${className}`}>
            {!hideHeader && <PrintHeader chapterTitle={chapterTitle} classId={classId} config={header} />}

            <div className="print-exercises">
                {exercises.length > 0 ? (
                    exercises.map((ex, idx) => (
                        <ExerciseRenderer
                            key={ex.id}
                            exercise={ex}
                            exerciseNumber={startIndex + idx + 1}
                            context={{ showCorrections, answerSpaceStyle, answerSpaceColor, strokes, showAnswerSpaces }}
                            exercisePerPage={exercisePerPage}
                        />
                    ))
                ) : (
                    <div className="print-empty-state">Aucun exercice à imprimer.</div>
                )}
            </div>

            {!hideTeacherName && <PrintFooter professorName={footer?.professorName || professorName} note={footer?.note} />}
        </div>
    );
};

export default memo(PrintableChapterExercises);
