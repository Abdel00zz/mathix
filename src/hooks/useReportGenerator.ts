import { useCallback } from 'react';
import { UserProfile, ChapterProgress, MasteryLevel } from '../types';
import { apiService } from '../services/apiService';

export const useReportGenerator = () => {
  const downloadReportLocally = (user: UserProfile, chapterId: string, data: any) => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const safeName = user.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.download = `Rapport_${safeName}_${chapterId}_${new Date().toISOString().split('T')[0]}.json`;
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error("Erreur lors du téléchargement local", e);
      return false;
    }
  };

  const generateAndSend = useCallback(async (
    user: UserProfile,
    chapterId: string,
    progress: ChapterProgress,
    currentVersion: string
  ) => {
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(now);

    // 1. Stats Générales
    const quizDuration = progress.quiz.durationSeconds || 0;
    const totalQuizTime = (progress.quiz.history || []).reduce((acc, h) => acc + (h.timeSpent || 0), 0);

    // Temps du quiz uniquement (les autres temps sont gérés par useTimeTracking globalement)
    const quizTimeSeconds = totalQuizTime > 0 ? totalQuizTime : quizDuration;

    const lessonProgress = progress.revisionProgress || 0;
    const quizScorePct = progress.quiz.score;
    const totalQ = progress.quiz.totalQuestions || 10; 
    const correctQ = Math.round((quizScorePct / 100) * totalQ);

    // 2. Détail Quiz
    const quizAnswersDetailed: Record<string, any> = {};
    if (progress.quiz.history && Array.isArray(progress.quiz.history)) {
        progress.quiz.history.forEach((h, index) => {
            const qKey = h.questionId || `q_${index + 1}`;
            quizAnswersDetailed[qKey] = {
                answer: h.userAnswer,
                isCorrect: h.isCorrect,
                timeSpentSeconds: h.timeSpent || 0
            };
        });
    }

    // 3. Détail Leçon
    const revealedBlanksCount = progress.revealedBlanks ? progress.revealedBlanks.length : 0;
    // Liste des IDs des trous révélés pour l'admin
    const revealedBlanksList = progress.revealedBlanks || [];
    
    // 4. Détail Exercices - Feedback + durées
    const exerciseFeedbackData: Record<string, string> = {};
    const exerciseDurationsData: Record<string, number | null> = {};

    Object.entries(progress.exerciseFeedback || {}).forEach(([exerciseId, mastery]) => {
        let feedbackLabel = "Non évalué";
        if (mastery === 'high' || mastery === 'medium') feedbackLabel = "Fait";
        else if (mastery === 'low') feedbackLabel = "Fait";
        else if (mastery === 'skipped') feedbackLabel = "Non fait";
        exerciseFeedbackData[exerciseId] = feedbackLabel;
    });

    // Durées consacrées par exercice
    Object.entries(progress.exerciseDurations || {}).forEach(([exerciseId, duration]) => {
        exerciseDurationsData[exerciseId] = duration;
    });

    // 5. Détail des sous-questions (indices révélés, progression)
    const subQuestionsDetails: Array<{
        id: string;
        isCompleted: boolean;
        hintsRevealed: number;
        mastery: string | null;
    }> = [];

    // Legacy exercisesFeedback pour compatibilité
    const exercisesFeedback: Record<string, string> = {};
    const exercisesDetails: Array<{id: string, mastery: string, hintsUsed: number}> = [];

    /**
     * FIX: Cast Object.entries result to the expected type to avoid 'unknown' state properties
     */
    const exerciseEntries = Object.entries(progress.exercises || {}) as [string, { isCompleted: boolean; mastery: MasteryLevel; lastHintIndex?: number }][];

    exerciseEntries.forEach(([subQId, state]) => {
        // Ajouter aux détails des sous-questions
        subQuestionsDetails.push({
            id: subQId,
            isCompleted: state.isCompleted,
            hintsRevealed: (state.lastHintIndex !== undefined && state.lastHintIndex >= 0) 
                ? state.lastHintIndex + 1 
                : 0,
            mastery: state.mastery || null
        });

        // Legacy format
        const simplifiedId = subQId.split('-').slice(1).join('_'); 
        let feedback = "Non Fait";
        let masteryLabel = "Non défini";

        if (state.isCompleted) {
            if (state.mastery === 'high') { feedback = "Facile"; masteryLabel = "Facile"; }
            else if (state.mastery === 'medium') { feedback = "Moyen"; masteryLabel = "Moyen"; }
            else if (state.mastery === 'low') { feedback = "Difficile"; masteryLabel = "Difficile"; }
            else if (state.mastery === 'skipped') { feedback = "Non traité"; masteryLabel = "Non traité"; }
            else { feedback = "Terminé"; masteryLabel = "Terminé"; }
        }
        exercisesFeedback[simplifiedId] = feedback;

        const hintsUsed = (state.lastHintIndex !== undefined && state.lastHintIndex >= 0) 
            ? state.lastHintIndex + 1 
            : 0;

        if (state.isCompleted) {
            exercisesDetails.push({
                id: simplifiedId,
                mastery: masteryLabel,
                hintsUsed: hintsUsed
            });
        }
    });

    // Compter le total d'indices révélés
    const totalHintsRevealed = subQuestionsDetails.reduce((sum, sq) => sum + sq.hintsRevealed, 0);
    const completedSubQuestions = subQuestionsDetails.filter(sq => sq.isCompleted).length;
    const totalSubQuestions = subQuestionsDetails.length;

    // CONSTRUCTION DU JSON FINAL RICHE
    const reportData = {
      studentName: user.name,
      studentLevel: user.className,
      submissionDate: formattedDate,
      timestamp: Date.now(),
      results: [
        {
          chapter: chapterId,
          version: `v${currentVersion}-${Date.now().toString().slice(-6)}`,
          lesson: {
            completed: 100,
            total: 100,
            percentage: lessonProgress,
            blanksRevealed: revealedBlanksCount,
            revealedBlanksList: revealedBlanksList
          },
          quiz: {
            score: quizScorePct,
            scoreRaw: `${correctQ} / ${totalQ}`,
            durationSeconds: quizTimeSeconds,
            hintsUsed: 0,
            answers: quizAnswersDetailed
          },
          exercises: {
            // Feedback par exercice (Fait / Non fait)
            feedback: exerciseFeedbackData,
            // Durées par exercice (en minutes, null = indéterminé)
            durations: exerciseDurationsData,
            // Détails des sous-questions avec indices révélés
            subQuestions: subQuestionsDetails,
            // Statistiques globales
            stats: {
              totalExercises: Object.keys(exerciseFeedbackData).length,
              totalSubQuestions: totalSubQuestions,
              completedSubQuestions: completedSubQuestions,
              totalHintsRevealed: totalHintsRevealed
            },
            // Legacy: compatibilité avec l'ancien format
            exercisesFeedback: exercisesFeedback,
            exercisesDetails: exercisesDetails
          },
          // Note: Le temps total est maintenant géré par useTimeTracking (affiché dans le dashboard)
          // Ici on n'envoie que le temps du quiz qui est fiable
          quizDurationSeconds: quizTimeSeconds
        }
      ]
    };

    // --- ENVOI ASYNCHRONE ---
    const success = await apiService.sendProgressReport({
        studentName: user.name,
        chapterTitle: chapterId,
        progressData: reportData
    });

    if (!success) {
        downloadReportLocally(user, chapterId, reportData);
    }
  }, []);

  return { generateAndSend };
};