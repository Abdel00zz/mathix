
import React, { useEffect, useMemo, useState, memo } from 'react';
import { ChapterInfo, ChapterProgress, QuizResult } from '../../types';
import {
  faCircleCheck,
  faCircleNotch,
  faCircleQuestion,
  faRotateLeft,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { useQuizLogic } from '../../hooks/useQuizLogic';
import { useSessionActivitySync } from '../../hooks/useSessionActivitySync';
import { useProfessorQuizGame } from '../../hooks/useProfessorQuizGame';
import QuizCore from '../Quiz/QuizCore';
import DashboardBackground from '../UI/DashboardBackground';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';
import TeacherQuizGamePanel from '../Quiz/TeacherQuizGamePanel';
import { useI18n } from '../../i18n/I18nContext';

const CARD_THEMES = [
    {
        background: '#E6EAFA',
        ink: '#1B2244',
        muted: '#4D5C92',
        progress: '#3A5294',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(30,37,72,0.06)',
        hoverBg: '#F3F5FC',
    },
    {
        background: '#FFF0E6',
        ink: '#662D15',
        muted: '#9E4F2E',
        progress: '#FF7F50',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(255, 127, 80, 0.08)',
        hoverBg: '#FFF7F2',
    },
    {
        background: '#F6F3EE',
        ink: '#232D37',
        muted: '#4D5A68',
        progress: '#3A5294',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(35, 45, 55, 0.08)',
        hoverBg: '#FAF8F5',
    },
    {
        background: '#F1EBF7',
        ink: '#3C1B54',
        muted: '#684687',
        progress: '#FF7F50',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(60, 27, 84, 0.06)',
        hoverBg: '#F8F4FD',
    },
];

const getThemeForChapter = (id: string = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CARD_THEMES.length;
  return CARD_THEMES[index];
};

interface QuizSessionViewProps {
  chapter: ChapterInfo;
  classId: string;
  chapterProgress?: ChapterProgress;
  onExit: () => void;
  onHome: () => void;
  onStartExercises: () => void;
  onSubmitScore?: (score: number, total: number, answersSnapshot: Record<string, any>) => void;
  onSaveProgress?: (index: number, history: QuizResult[], totalQuestions: number) => void;
}

const QuizSessionView: React.FC<QuizSessionViewProps> = (props) => {
  const { dir, lang, t } = useI18n();
  const theme = useMemo(() => getThemeForChapter(props.chapter.id), [props.chapter.id]);
  const {
      questions, currentIndex, setCurrentIndex, results, quizState, timeLeft, maxTime,
      isReviewMode, showConfirmModal, currentQuestion, existingResult, isCurrentAnswered, mistakeIds,
      setShowConfirmModal, handleNavigate, handleValidate, confirmSubmit, startReview, retryMistakes,
      handleAnswerChange, restoredAnswer
  } = useQuizLogic(
      props.chapter,
      props.classId,
      props.chapterProgress,
      props.onSaveProgress,
      props.onSubmitScore
  );

  // Jeu de classe (mode professeur) : élèves + évaluation, partagés entre le
  // panneau d'élèves et le volet « Correction » de la zone manuscrite.
  const game = useProfessorQuizGame(props.classId, currentIndex, isCurrentAnswered);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const showLoading = useMinimumLoading(quizState === 'loading');

  // Transmission temps réel vers le PC (tablette prof uniquement) : position de
  // la question courante + réponses validées (pour l'affichage et l'archivage).
  useSessionActivitySync(props.classId, () => ({
    position: {
      type: 'quiz',
      index: currentIndex + 1,
      count: questions.length,
      label: `${results.length}/${questions.length} répondue${results.length > 1 ? 's' : ''}`,
    },
    quiz: {
      history: results,
      answersSnapshot: results.reduce<Record<string, unknown>>(
        (acc, r) => ({ ...acc, [r.questionId]: r.userAnswer }),
        {},
      ),
    },
  }));

  // Calcul des questions manquantes
  const unansweredIndices = useMemo(() => {
      return questions
          .map((q, index) => results.some(r => r.questionId === q.id) ? null : index + 1)
          .filter((idx): idx is number => idx !== null);
  }, [questions, results]);

  const isComplete = unansweredIndices.length === 0;

  // Keyboard support logic
  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (quizState === 'summary' || showConfirmModal) return;
          if ((dir === 'rtl' ? e.key === 'ArrowLeft' : e.key === 'ArrowRight') && isCurrentAnswered) handleNavigate('next');
          else if (dir === 'rtl' ? e.key === 'ArrowRight' : e.key === 'ArrowLeft') handleNavigate('prev');
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [quizState, isCurrentAnswered, handleNavigate, showConfirmModal, dir]);

  const jumpToQuestion = (index: number) => {
      setCurrentIndex(index - 1);
      setShowConfirmModal(false);
  };

  const handleConfirmSubmit = () => {
      setIsTransitioning(true);
      setTimeout(() => {
          confirmSubmit();
          setIsTransitioning(false);
      }, 500); 
  };

  // Determine if Modal should be shown (Confirmation OR Summary)
  const showModal = showConfirmModal || quizState === 'summary';

  if (showLoading) return <LoadingSpinner context="quiz" />;
  if (quizState === 'error') return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-transparent">
          <div className="bg-surface p-[clamp(1.5rem,4vw,2.5rem)] rounded-[2rem] border border-slate-200 shadow-premium-md max-w-md w-full flex flex-col items-center">
              <div className="w-[clamp(4rem,6vw,5rem)] h-[clamp(4rem,6vw,5rem)] bg-slate-100 rounded-full flex items-center justify-center mb-[clamp(1rem,2.4vw,1.5rem)] text-slate-400">
                  <FaIcon icon={faCircleQuestion} size={36} />
              </div>
              <h2 className="text-[clamp(1.5rem,1.3rem_+_1vw,1.95rem)] typo-ui font-semibold text-ink mb-[clamp(0.75rem,1.6vw,1rem)]">
                  Quiz Indisponible
              </h2>
              <p className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1rem)] text-slate-500 mb-4 leading-relaxed typo-ui font-light">
                  Il n'y a pas encore de quiz disponible pour ce chapitre.
              </p>
               <button onClick={props.onExit} className="w-full py-[clamp(0.85rem,1.8vw,1.05rem)] bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-none transition-all typo-mono uppercase tracking-widest text-[clamp(0.8rem,0.76rem_+_0.18vw,0.9rem)] border-2 border-slate-900 shadow-[4px_4px_0_rgba(0,0,0,0.1)]">
                  {t('common.returnToHub')}
              </button>
          </div>
      </div>
  );

    return (
        <div dir={dir} lang={lang} className="quiz-viewport fixed inset-0 w-full overflow-hidden flex flex-col typo-ui text-[#2C3539] select-none bg-transparent">
            <DashboardBackground />
            <div 
              className="absolute inset-x-0 top-0 h-96 pointer-events-none opacity-[0.08]" 
              style={{ backgroundImage: `linear-gradient(180deg, ${theme.progress}, transparent)` }}
            />

            <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full">
                <div className="shrink-0 w-full max-w-[840px] mx-auto px-[clamp(0.875rem,2.4vw,1.5rem)] pt-[clamp(0.45rem,1vw,0.75rem)]">
                    {/* `-ms-6` est logique : le badge dépasse du côté START, donc à
                        gauche en français et à droite en arabe. */}
                    <div className="inline-flex items-center gap-[clamp(0.35rem,0.9vw,0.5rem)] px-2 py-0.5 md:-ms-6">
                        <span className={`typo-ui text-[clamp(0.65rem,0.61rem_+_0.16vw,0.74rem)] font-semibold uppercase text-[#8F867A] ${lang === 'ar' ? 'tracking-normal' : 'tracking-[0.22em]'}`}>
                            {t('common.question')}
                        </span>
                        <span className="text-[clamp(1.05rem,0.98rem_+_0.35vw,1.25rem)] font-semibold text-[#2c2b29] tabular-nums">
                            {String(currentIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1.05rem)] text-[#C5A059]/80">/</span>
                        <span className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1.05rem)] font-medium text-[#9F988D] tabular-nums">
                            {String(questions.length).padStart(2, '0')}
                        </span>
                    </div>
                </div>

                <TeacherQuizGamePanel game={game} />

                <main className="flex-1 min-h-0 overflow-hidden">
                    {currentQuestion ? (
                        <QuizCore
                            question={currentQuestion}
                            currentIndex={currentIndex}
                            totalQuestions={questions.length}
                            result={existingResult}
                            isAnswered={isCurrentAnswered}
                            isReviewMode={isReviewMode}
                            timeLeft={timeLeft}
                            maxTime={maxTime}
                            onValidate={handleValidate}
                            onNavigate={handleNavigate}
                            onAnswerChange={handleAnswerChange}
                            restoredAnswer={restoredAnswer}
                            theme={theme}
                        />
                    ) : (
                        <div className="h-full w-full opacity-50 blur-sm"></div>
                    )}
                </main>
            </div>

        {/* MODALE INTELLIGENTE */}
        {showModal && (
            <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 transition-all duration-500`}>
                {/* Backdrop */}
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-md animate-in fade-in duration-300" />

                <div className={`bg-[#FCFBF9] w-full sm:max-w-md h-[85dvh] sm:h-auto sm:max-h-[90vh] rounded-t-[2rem] sm:rounded-3xl border-t sm:border border-[#DDD7CB] shadow-2xl overflow-hidden flex flex-col backdrop-blur-2xl relative p-[clamp(1.25rem,3.5vw,2.5rem)] text-center transform transition-all animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 ${isTransitioning ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}`}>
                    
                    {/* Crème Carreau Grid Pattern */}
                    <div className="absolute inset-0 opacity-[0.4] pointer-events-none mix-blend-multiply"
                        style={{
                            backgroundImage: `linear-gradient(transparent 23px, #eaddcf 23px, #eaddcf 24px), linear-gradient(90deg, transparent 23px, #eaddcf 23px, #eaddcf 24px)`,
                            backgroundSize: '24px 24px'
                        }}
                    />

                    {/* Mobile Drag Handle */}
                    <div className="w-full flex justify-center pt-3 pb-1 sm:hidden absolute top-0 left-0 z-20">
                        <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                    </div>

                    <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide flex flex-col justify-center pt-4">
                    
                    {quizState === 'summary' ? (
                        // --- SUMMARY VIEW (IN-MODAL) ---
                        (() => {
                            const score = results.filter(r => r.isCorrect).length;
                            const pct = Math.round((score / questions.length) * 100);
                            const hasMistakes = mistakeIds.size > 0;

                            return (
                                <>
                                    <div className="text-[clamp(3rem,2.4rem_+_2.6vw,4rem)] font-signika font-semibold text-slate-800 mb-2 tracking-tight animate-in fade-in slide-in-from-bottom-2">
                                        {pct}%
                                    </div>
                                    <p className="text-slate-600 mb-3 typo-ui font-bold text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] uppercase tracking-widest">Maîtrise du chapitre</p>
                                    
                                    {/* Arabic pedagogical message */}
                                    <p className="font-arabic text-[clamp(1.08rem,1rem_+_0.45vw,1.32rem)] leading-snug text-slate-800 mb-1.5 text-center" dir="rtl">
                                        {pct >= 80 ? 'أحسنت، مستواك ممتاز في هذا الفصل ✨'
                                         : pct >= 50 ? 'فهمك جيد، لكن بعض النقاط تحتاج إلى مراجعة 📝'
                                         : 'لا تقلق، الفهم يأتي مع التكرار والممارسة 💪'}
                                    </p>
                                    
                                    {/* French situational feedback */}
                                    <p className="text-slate-600 text-[clamp(0.8rem,0.76rem_+_0.18vw,0.92rem)] mb-[clamp(1.25rem,3vw,1.75rem)] leading-relaxed typo-ui text-center">
                                        {pct >= 80 ? `Excellent : ${score} bonnes réponses sur ${questions.length}. Vous êtes prêt pour les exercices.`
                                         : pct >= 50 ? `Bon travail : ${score}/${questions.length} bonnes réponses. Corrigez vos erreurs pour progresser.`
                                         : `${score} bonne(s) réponse(s) sur ${questions.length}. Relisez le cours, puis retentez le quiz.`}
                                    </p>
                                    
                                    <div className="learning-summary-actions space-y-3">
                                        {/* Mastery Learning Action */}
                                        {hasMistakes && (
                                            <button 
                                                onClick={retryMistakes}
                                                className="w-full py-[clamp(0.85rem,1.8vw,1.05rem)] bg-amber-50 text-amber-700 border-2 border-amber-200 rounded-none font-bold hover:bg-amber-100 transition-all uppercase tracking-wider text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] typo-mono flex items-center justify-center gap-2 shadow-[3px_3px_0_rgba(217,119,6,0.1)]"
                                            >
                                                <FaIcon icon={faRotateLeft} size={14} /> {t('quiz.retryMistakes', { count: mistakeIds.size })}
                                            </button>
                                        )}

                                        <button onClick={startReview} className="w-full py-[clamp(0.85rem,1.8vw,1.05rem)] border-2 border-slate-200 rounded-none font-bold text-slate-600 hover:bg-slate-50 transition-colors uppercase tracking-wider text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] typo-mono">
                                            {t('quiz.reviewAll')}
                                        </button>
                                        
                                        <button 
                                            onClick={props.onStartExercises} 
                                            className="w-full py-[clamp(0.85rem,1.8vw,1.05rem)] text-white rounded-none font-bold transition-all uppercase tracking-wider text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] typo-mono border-2"
                                            style={{ 
                                                backgroundColor: theme.progress, 
                                                borderColor: theme.progress, 
                                                boxShadow: `4px 4px 0 rgba(30, 37, 72, 0.08)` 
                                            }}
                                        >
                                            {t('quiz.startExercises')}
                                        </button>
                                    </div>
                                </>
                            );
                        })()
                    ) : (
                        // --- CONFIRMATION VIEW ---
                        <>
                            {/* Header Icon */}
                            <div className={`w-[clamp(4rem,6vw,5rem)] h-[clamp(4rem,6vw,5rem)] rounded-full flex items-center justify-center mx-auto mb-[clamp(1rem,2.4vw,1.5rem)] shadow-sm ${isComplete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                {isComplete ? <FaIcon icon={faCircleCheck} size={32} /> : <FaIcon icon={faTriangleExclamation} size={32} />}
                            </div>

                            {/* Content */}
                            <h3 className="text-[clamp(1.5rem,1.3rem_+_1vw,1.95rem)] font-signika font-semibold text-slate-900 mb-3">
                                {isComplete ? "Quiz Terminé" : "Quiz Incomplet"}
                            </h3>
                            
                            {isComplete ? (
                                <div className="mb-[clamp(1.5rem,3.5vw,2.5rem)]">
                                    <p className="font-arabic text-[clamp(1.1rem,1rem_+_0.45vw,1.35rem)] leading-snug text-slate-800 mb-2 text-center" dir="rtl">
                                        أجبتَ على جميع الأسئلة، هل أنتَ مستعدٌ لمعرفة النتيجة ؟
                                    </p>
                                    <p className="text-slate-400 typo-ui leading-relaxed text-[clamp(0.8rem,0.76rem_+_0.18vw,0.92rem)] text-center">
                                        Toutes les questions ont été traitées. Validez pour découvrir votre score.
                                    </p>
                                </div>
                            ) : (
                                <div className="mb-[clamp(1.5rem,3.5vw,2.5rem)]">
                                    <p className="font-arabic text-[clamp(1.04rem,0.96rem_+_0.4vw,1.25rem)] leading-snug text-slate-700 mb-3 text-center" dir="rtl">
                                        لا تتسرع، أكمل الإجابة على كل سؤال للحصول على نتيجة دقيقة
                                    </p>
                                     <p className="text-slate-500 mb-6 typo-ui text-[clamp(0.8rem,0.76rem_+_0.18vw,0.92rem)] text-center">
                                        Il reste <span className="font-bold text-amber-600">{unansweredIndices.length}&nbsp;question{unansweredIndices.length > 1 ? 's' : ''}</span> sans réponse. Sélectionnez un numéro pour y accéder.
                                    </p>
                                    
                                    <div className="flex flex-wrap justify-center gap-3 max-h-40 overflow-y-auto pr-1">
                                        {unansweredIndices.map((idx) => (
                                            <button 
                                                key={idx}
                                                onClick={() => jumpToQuestion(idx)}
                                                className="w-[clamp(2.35rem,2.1rem_+_0.8vw,2.75rem)] h-[clamp(2.35rem,2.1rem_+_0.8vw,2.75rem)] flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-600 font-bold hover:bg-amber-500 hover:text-white hover:border-amber-500 hover:shadow-md transition-all shadow-sm text-[clamp(0.8rem,0.76rem_+_0.16vw,0.9rem)]"
                                            >
                                                {idx}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-[clamp(0.75rem,2vw,1rem)] mt-6">
                                <button 
                                    onClick={() => setShowConfirmModal(false)} 
                                    className="flex-1 py-[clamp(0.85rem,1.8vw,1.05rem)] border-2 border-slate-200 text-slate-600 font-bold rounded-none hover:bg-slate-50 transition-colors uppercase tracking-wider text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] typo-mono"
                                >
                                    {t('common.back')}
                                </button>
                                <button 
                                    onClick={handleConfirmSubmit} 
                                    disabled={isTransitioning}
                                    className={`flex-1 py-[clamp(0.85rem,1.8vw,1.05rem)] text-white font-bold rounded-none shadow-[4px_4px_0_rgba(0,0,0,0.1)] transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] typo-mono hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none border-2`}
                                    style={{
                                        backgroundColor: isComplete ? '#EAEFF8' : theme.progress,
                                        borderColor: isComplete ? '#EAEFF8' : theme.progress,
                                        color: isComplete ? theme.muted : '#FFFFFF',
                                    }}
                                >
                                    {isTransitioning ? <FaIcon icon={faCircleNotch} spin size={16} /> : (isComplete ? <span>{t('common.validate')}</span> : <span>{t('common.finish')}</span>)}
                                </button>
                            </div>
                        </>
                    )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default memo(QuizSessionView);
