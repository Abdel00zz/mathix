
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { QuizQuestion, QuizResult } from '../../types';
import MathRenderer from '../MathRenderer';
import MediaRenderer from '../MediaRenderer';
import { playSound } from '../../utils/soundEngine';
import QuizOptions from './QuizOptions';
import QuizOrderQuestion from './QuizOrderQuestion';
import QuizErrorQuestion from './QuizErrorQuestion';
import InlineCanvasZone from '../Exercise/canvas/InlineCanvasZone';
import QuizCorrectionPanel from './QuizCorrectionPanel';
import { buildQuizCorrection, hasQuizCorrection } from './quizCorrection';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { useIsTabletSurface } from '../../hooks/useProfViewMode';
import { useI18n } from '../../i18n/I18nContext';
import '../../styles/components/quiz-layout.css';

// Chargée à la demande : la barre d'outils du stylet ne concerne que la tablette
// professeur. Elle se démonte d'elle-même dès qu'aucune zone n'est ouverte.
const CanvasFloatingToolbar = lazy(() =>
    import('../Exercise/canvas/FloatingToolbar').then(m => ({ default: m.CanvasFloatingToolbar }))
);

/**
 * Les annales scannées contiennent parfois des retours à la ligne de mise en page
 * et une consigne QCM déjà portée par l'interface. On les neutralise uniquement
 * à l'affichage pour garder un énoncé naturel, continu et lisible.
 */
type PresentationPrompt = {
    lead: string;
    essentialFormula?: string;
    tail: string;
};

const compactPromptText = (text: string) => text.replace(/\s*\r?\n+\s*/g, ' ').trim();

const getPresentationPrompt = (prompt: string): PresentationPrompt => {
    const withoutRedundantInstruction = prompt
        .replace(/\s+(?:Choisir|Choisissez|Sélectionner) l[’']unique proposition correcte\.?\s*$/iu, '')
        .trim();
    // Une formule seule entre deux retours source est une formule essentielle.
    // Elle reste en LaTeX inline, mais reçoit un emplacement centré sans fond.
    const isolatedFormula = withoutRedundantInstruction.match(/^([\s\S]*?)\r?\n+\s*\$([^$\r\n]+)\$\s*\r?\n+([\s\S]*)$/);

    if (isolatedFormula) {
        return {
            lead: compactPromptText(isolatedFormula[1]),
            essentialFormula: isolatedFormula[2].trim(),
            tail: compactPromptText(isolatedFormula[3]),
        };
    }

    return { lead: compactPromptText(withoutRedundantInstruction), tail: '' };
};

// ═══════════════════════════════════════════════════════════════════════
// MESSAGES DE MOTIVATION (Style Minimaliste - 2/3 mots max)
// ═══════════════════════════════════════════════════════════════════════

const CORRECT_PHRASES = [
    (letter: string) => `Voici pourquoi le choix ${letter} est correct :`,
    (letter: string) => `Le choix ${letter} est la bonne piste.`,
    (letter: string) => `Bravo, le choix ${letter} était bien le bon.`,
    (letter: string) => `La réponse ${letter} se justifie ainsi :`,
    (letter: string) => `Le choix ${letter} s'impose naturellement.`,
    (letter: string) => `Bien joué. Le choix ${letter}, voici pourquoi :`,
];

const INCORRECT_PHRASES = [
    (letter: string) => `La réponse correcte est le choix ${letter}. Explication :`,
    (letter: string) => `La bonne réponse était le choix ${letter}. Voici pourquoi :`,
    (letter: string) => `C'est le choix ${letter} qu'il fallait retenir :`,
    (letter: string) => `Le choix ${letter} était le bon. Voici le raisonnement :`,
    (letter: string) => `Il fallait opter pour le choix ${letter}. Explication :`,
    (letter: string) => `La réponse correcte est le choix ${letter}. Voyons pourquoi :`,
];

/** Detect the correct answer letter from a mcq question */
const getCorrectLetter = (question: QuizQuestion): string => {
    if (question.type === 'mcq') {
        const options = (question as any).options || [];
        const correctIdx = options.findIndex((o: any) => o.isCorrect);
        if (correctIdx >= 0) return String.fromCharCode(65 + correctIdx);
    }
    return '?';
};

// ═══════════════════════════════════════════════════════════════════════
// MODERN GRID BACKGROUND (Carreaux Mathématiques)
// ═══════════════════════════════════════════════════════════════════════

// --- TIMER DISPLAY (Box moderne avec chiffres colorés) ---
const TimerDisplay: React.FC<{ timeLeft: number; maxTime: number }> = ({ timeLeft, maxTime }) => {
    const ratio = maxTime > 0 ? timeLeft / maxTime : 0;
    const isCritical = ratio <= 0.2;

    const isTiersTemps = React.useMemo(() => {
        try {
            const raw = localStorage.getItem('mathplus_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                return !!parsed.tiersTemps;
            }
        } catch {
            // ignore error
        }
        return false;
    }, []);

    return (
        <div className={`quiz-timer absolute bg-[#F7F6F3] border border-[#9A8462] rounded-full flex items-center gap-1.5 shadow-[0_4px_12px_rgba(154,132,98,0.1)] z-20 ${isCritical ? 'animate-pulse border-red-400 text-red-500' : 'text-[#2C3539]'}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span className="font-sans text-[clamp(0.75rem,0.72rem_+_0.18vw,0.88rem)] font-semibold tracking-[0.05em] flex items-center gap-1">
                {timeLeft} s
                {isTiersTemps && (
                    <span className="text-[clamp(0.6rem,0.56rem_+_0.12vw,0.68rem)] font-extrabold text-amber-700 bg-amber-100/50 px-1 py-0.5 rounded border border-amber-200/40 select-none ml-1">1/3</span>
                )}
            </span>
        </div>
    );
};

interface QuizCoreProps {
    question: QuizQuestion;
    currentIndex: number;
    totalQuestions: number;
    result?: QuizResult;
    isAnswered: boolean;
    isReviewMode: boolean;
    timeLeft: number;
    maxTime: number;
    onValidate: (answer: any) => void;
    onNavigate: (dir: 'prev' | 'next') => void;
    onAnswerChange?: (answer: any) => void;
    restoredAnswer?: { questionId: string; answer: any } | null;
    theme?: any;
}

const QuizCore: React.FC<QuizCoreProps> = ({
    question, currentIndex, totalQuestions, result, isAnswered, isReviewMode, timeLeft, maxTime, onValidate, onNavigate, onAnswerChange, restoredAnswer, theme
}) => {
    const { dir, lang, t } = useI18n();
    // Le contenu du quiz est en français et reste en lecture LTR. Les contrôles
    // traduits (barre d'actions, libellés) suivent la langue de l'interface :
    // en arabe la barre se reflète et les libellés s'orientent de droite à gauche.
    const uiTracking = lang === 'ar' ? 'tracking-normal' : 'tracking-[1px]';
    const uiTrackingTight = lang === 'ar' ? 'tracking-normal' : 'tracking-[1.2px]';
    const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
    const [localOrder, setLocalOrder] = useState<any[]>([]);
    // La reprise ne s'applique qu'une fois (au chargement), pas lors d'une
    // navigation interne ultérieure vers la même question.
    const restoreAppliedRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Une nouvelle question repart de l'énoncé ; la correction conserve la
    // position de lecture. Les actions ne font pas partie de cette zone.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [question.id, currentIndex]);

    // ── Mode professeur tablette : zone manuscrite de discussion ──────────────
    const professorAccess = useProfessorAccess();
    const isTabletSurface = useIsTabletSurface();
    const [canvasOpen, setCanvasOpen] = useState(false);
    const [correctionOpen, setCorrectionOpen] = useState(false);
    const canvasAnchorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setTimeout(() => {
            let restored: any = null;
            if (!restoreAppliedRef.current && restoredAnswer && restoredAnswer.questionId === question.id) {
                restored = restoredAnswer.answer;
                restoreAppliedRef.current = true;
            }
            setSelectedAnswer(restored ?? null);
            if (question.type === 'order') {
                setLocalOrder((question as any).items || []);
            }
        }, 0);
    }, [question, restoredAnswer]);

    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (isAnswered || isReviewMode) return;
            if (e.key === 'Enter') {
                if (selectedAnswer !== null) onValidate(selectedAnswer);
                if (question.type === 'order') onValidate(localOrder.map(i => i.id));
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [question, isAnswered, isReviewMode, selectedAnswer, localOrder, onValidate]);

    /**
     * Cycle de vie de la zone manuscrite : elle s'ouvre à l'instant précis où la
     * question passe à « corrigée » — clic sur Valider, touche Entrée ou fin du
     * minuteur, les trois chemins convergent ici — et se referme au changement de
     * question.
     *
     * On compare à l'état précédent au lieu de simplement lire `isAnswered` :
     * sinon un retour sur une question déjà corrigée rouvrirait la zone, alors que
     * la règle est « une question, une ouverture ». Le prof la rappelle au besoin
     * par le déclencheur « … », ses traits étant conservés.
     */
    const previousStateRef = useRef({ id: question.id, answered: isAnswered });
    useEffect(() => {
        const previous = previousStateRef.current;
        previousStateRef.current = { id: question.id, answered: isAnswered };

        if (previous.id !== question.id) {
            setCanvasOpen(false);
            setCorrectionOpen(false);
            return;
        }
        if (professorAccess && isAnswered && !previous.answered) setCanvasOpen(true);
    }, [question.id, isAnswered, professorAccess]);

    // Sur tablette la zone naît sous la ligne de flottaison, après les
    // propositions : on l'amène au centre pour que le stylet n'ait pas à la
    // chercher.
    useEffect(() => {
        if (!canvasOpen) return;
        const frame = requestAnimationFrame(() => {
            canvasAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return () => cancelAnimationFrame(frame);
    }, [canvasOpen]);

    const handleOptionClick = (val: any) => {
        if (!isAnswered && !isReviewMode) {
            playSound('click');
            setSelectedAnswer(val);
            onAnswerChange?.(val);
        }
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        if (isAnswered || isReviewMode) return;
        const newOrder = [...localOrder];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (targetIndex >= 0 && targetIndex < newOrder.length) {
            [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
            setLocalOrder(newOrder);
            playSound('click');
        }
    };

    const isCorrect = result?.isCorrect;
    const presentationPrompt = getPresentationPrompt(question.prompt);
    const isCorrected = isAnswered || isReviewMode;

    // Correction destinée au volet « Aide » de la zone manuscrite : elle ne se
    // dévoile qu'à la demande du professeur, une fois la discussion lancée.
    const correction = useMemo(() => buildQuizCorrection(question, result), [question, result]);
    const hasCorrection = hasQuizCorrection(correction);

    // Sélection intelligente du message avec détection de la bonne réponse
    const motivationalMessage = useMemo(() => {
        if (!isAnswered && !isReviewMode) return null;
        const letter = getCorrectLetter(question);
        const collection = isCorrect ? CORRECT_PHRASES : INCORRECT_PHRASES;
        const seed = (currentIndex + (isCorrect ? 1 : 0)) % collection.length;
        return collection[seed](letter);
    }, [isAnswered, isReviewMode, isCorrect, currentIndex, question]);

    return (
        <div dir="ltr" lang="fr" className="quiz-core-shell" data-professor={professorAccess || undefined}>
            <div ref={scrollRef} className="quiz-scroll-region" role="region" aria-label={t('common.question')} tabIndex={0}>
            <div className={`quiz-content ${professorAccess && isTabletSurface ? 'quiz-prof-tablet-content' : ''}`}>
            
            {/* --- QUESTION CARD (Strict & Clean) --- */}
            <div className="quiz-question-card w-full relative flex flex-col justify-center rounded-[clamp(1rem,2vw,1.5rem)] bg-[#FFFFFF] border border-slate-100 shadow-[0_10px_36px_-14px_rgba(30,37,72,0.12)] group">
                
                <TimerDisplay timeLeft={timeLeft} maxTime={maxTime} />
                <div className="quiz-question-body relative z-10 w-full text-slate-800">
                    <MediaRenderer media={question.media || (question.image ? { src: question.image, position: 'bottom' } : undefined)}>
                    <div className="quiz-question-text mx-auto max-w-[760px] typo-ui font-normal tracking-[-0.01em] text-left text-pretty [&_.katex]:text-[1.08em] [&_.katex]:tracking-normal">
                        {question.groupPrompt && (
                            <div className="quiz-group-prompt border-l-2 border-slate-200 pl-3 text-[0.96em] text-slate-600">
                                <MathRenderer inline content={question.groupPrompt} fontSize="inherit" />
                            </div>
                        )}
                        {presentationPrompt.lead && (
                            <MathRenderer inline content={presentationPrompt.lead} fontSize="inherit" />
                        )}
                        {presentationPrompt.essentialFormula && (
                            <div className="quiz-essential-formula text-center text-[1.12em] [&_.katex]:text-[1em]">
                                <MathRenderer inline content={`$${presentationPrompt.essentialFormula}$`} fontSize="inherit" />
                            </div>
                        )}
                        {presentationPrompt.tail && (
                            <MathRenderer inline content={presentationPrompt.tail} fontSize="inherit" />
                        )}
                    </div>
                    </MediaRenderer>
                    {question.type === 'error' && (question as any).context && (
                        <div className="mt-3 inline-block px-[clamp(0.75rem,1.8vw,1rem)] py-[clamp(0.45rem,1vw,0.65rem)] bg-slate-50 border border-slate-100 text-[clamp(0.84rem,0.8rem_+_0.18vw,0.95rem)] text-slate-500 font-sans tracking-wide rounded-lg">
                             {(question as any).context}
                        </div>
                    )}
                </div>
            </div>

            {/* --- OPTIONS --- */}
            <QuizOptions 
                question={question} 
                selectedAnswer={selectedAnswer} 
                isAnswered={isAnswered} 
                isReviewMode={isReviewMode} 
                result={result} 
                onSelect={handleOptionClick} 
                theme={theme}
            />

            {question.type === 'order' && (
                <QuizOrderQuestion 
                    localOrder={localOrder} 
                    isAnswered={isAnswered} 
                    result={result} 
                    onMove={moveItem} 
                    isReviewMode={isReviewMode} 
                />
            )}

            {question.type === 'error' && (
                <QuizErrorQuestion 
                    question={question} 
                    selectedAnswer={selectedAnswer} 
                    isAnswered={isAnswered} 
                    result={result} 
                    isReviewMode={isReviewMode} 
                    onSelect={handleOptionClick} 
                />
            )}

            {/* ── ZONE MANUSCRITE DE DISCUSSION (tablette professeur) ──
                Même cadre, mêmes règles que la fiche d'exercice. Elle s'ouvre au
                moment de la validation pour reprendre au stylet le raisonnement
                de la classe ; l'onglet « Aide » garde la correction sous le coude
                et ne la dévoile que sur un geste du professeur. */}
            {professorAccess && isCorrected && (
                <div ref={canvasAnchorRef} className="w-full mb-[clamp(1rem,2.4vw,1.75rem)] print:hidden">
                    <InlineCanvasZone
                        noteKey={`quiz-q:${question.id}`}
                        hasHint={hasCorrection}
                        hintLabel={t('common.correction')}
                        hintContent={hasCorrection ? <QuizCorrectionPanel digest={correction} /> : undefined}
                        isHintActive={correctionOpen}
                        onHintToggle={() => setCorrectionOpen(prev => !prev)}
                        isOpenControlled={canvasOpen}
                        onOpenChange={setCanvasOpen}
                    />
                </div>
            )}

            {/* --- FEEDBACK AREA (Premium Minimalist & Innovative) ---
                Mode élève uniquement : sur la tablette du professeur, cette
                explication vit dans l'onglet « Aide » de la zone manuscrite. */}
            {!professorAccess && isCorrected && (
                <div 
                    className="quiz-feedback w-full rounded-2xl border border-slate-200 bg-[#fcfbfa]/90 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.01)] animate-in fade-in slide-in-from-bottom-2 duration-500"
                >
                    <div className="mb-1.5">
                        <h3 className={`font-sans font-bold text-[clamp(0.78rem,0.74rem_+_0.18vw,0.9rem)] tracking-wide uppercase ${
                            isCorrect ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                            {motivationalMessage}
                        </h3>
                    </div>
                    <div className="quiz-feedback-text text-slate-600 font-sans">
                        <MathRenderer content={question.explanation} fontSize="inherit" />
                    </div>
                </div>
            )}
            {/* --- FOOTER ACTION BAR (Clean) ---
                La barre porte `dir` : en arabe « Précédent » passe à droite et
                l'action principale à gauche, sans retourner le contenu français
                affiché au-dessus. */}
            <div dir={dir} className="quiz-actions">
            <div className="quiz-actions-inner">
                 {/* Left side: Navigation — only if not first question */}
                 <div>
                    {currentIndex > 0 && (
                        <button
                            onClick={() => onNavigate('prev')}
                            className={`quiz-action-secondary bg-transparent text-[#616A70] hover:text-[#2C3539] border-none font-sans font-semibold uppercase ${uiTracking} transition-colors`}
                        >
                            {t('common.previous')}
                        </button>
                    )}
                 </div>

                 {/* Right side: Action buttons */}
                 <div className="quiz-actions-primary">
                     {(!isAnswered && !isReviewMode) && selectedAnswer === null && question.type !== 'order' && (
                         <button
                            onClick={() => onNavigate('next')}
                            className={`quiz-action-secondary bg-transparent text-[#616A70] hover:text-[#2C3539] border-none font-sans font-semibold uppercase ${uiTracking} transition-colors`}
                        >
                            {t('common.skip')}
                        </button>
                     )}

                     {(!isAnswered && !isReviewMode) && (
                        <button 
                            onClick={() => {
                                if (selectedAnswer !== null) onValidate(selectedAnswer);
                                else if (question.type === 'order') onValidate(localOrder.map(i => i.id));
                            }}
                            disabled={selectedAnswer === null && question.type !== 'order'}
                            className={`quiz-action-main text-white border-[3.5px] border-white ring-1 ring-slate-200/60 active:scale-[0.98] font-sans font-black uppercase ${uiTrackingTight} rounded-full transition-colors disabled:opacity-45 cursor-pointer shadow-[0_6px_20px_-4px_rgba(30,37,72,0.12)] bg-[#1A2530]`}
                            style={theme?.progress ? { backgroundColor: theme.progress } : undefined}
                        >
                            {t('common.validate')}
                        </button>
                     )}

                     {(isAnswered || isReviewMode) && (
                        <button
                            onClick={() => onNavigate('next')}
                            className={`quiz-action-main text-white border-[3.5px] border-white ring-1 ring-slate-200/60 active:scale-[0.98] font-sans font-black uppercase ${uiTrackingTight} rounded-full transition-colors cursor-pointer shadow-[0_6px_20px_-4px_rgba(30,37,72,0.12)] bg-[#1A2530]`}
                            style={theme?.progress ? { backgroundColor: theme.progress } : undefined}
                        >
                            {currentIndex < totalQuestions - 1 ? t('common.next') : t('common.finish')}
                        </button>
                     )}
                 </div>
            </div>
            </div>
            </div>
            </div>

            {/* Barre d'outils du stylet, montée une seule fois pour la question
                affichée. Elle s'efface d'elle-même tant qu'aucune zone n'est
                ouverte : invisible pour l'élève comme pour le prof avant Valider. */}
            {professorAccess && (
                <Suspense fallback={null}>
                    <CanvasFloatingToolbar />
                </Suspense>
            )}

        </div>
    );
};

export default React.memo(QuizCore);
