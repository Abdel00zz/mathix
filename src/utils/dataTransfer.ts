import { UserProfile, ChapterProgress, MasteryLevel, AppSettings } from '../types';
import { storageService } from '../services/storageService';
import { cloudSyncService } from '../services/cloudSyncService';
import { scopeKey } from './progressScope';

const MASTERY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, skipped: 0 };
const pickBetter = (a: any, b: any) => (MASTERY_RANK[a] || 0) >= (MASTERY_RANK[b] || 0) ? a : b;
const mergeArrays = (a?: string[], b?: string[]): string[] => Array.from(new Set([...(a || []), ...(b || [])]));

export function exportProgressData(
  user: UserProfile,
  globalProgress: Record<string, ChapterProgress>,
  currentSettings: AppSettings
) {
  const timeKey = `mathplus_total_time_spent_${user.uniqueId || user.name}`;
  const totalTimeSpent = parseInt(localStorage.getItem(timeKey) || '0', 10);

  const dataStr = JSON.stringify({
    version: "6.0",
    timestamp: Date.now(),
    user,
    progress: globalProgress,
    totalTimeSpent,
    settings: currentSettings
  }, null, 2);

  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `monProf_Backup_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importProgressData(
  file: File,
  user: UserProfile,
  globalProgress: Record<string, ChapterProgress>,
  onApplySettings: (settings: AppSettings) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.progress || !json.user) {
          reject(new Error("Format de fichier invalide"));
          return;
        }

        const imported = json.progress as Record<string, ChapterProgress>;
        const merged: Record<string, ChapterProgress> = { ...globalProgress };

        for (const [chId, imp] of Object.entries(imported)) {
          const cur = merged[chId];
          if (!cur) { merged[chId] = imp; continue; }

          const revisionProgress = Math.max(cur.revisionProgress || 0, imp.revisionProgress || 0);
          const revealedBlanks = mergeArrays(cur.revealedBlanks, imp.revealedBlanks);
          const masteredSkills = mergeArrays(cur.masteredSkills, imp.masteredSkills);

          const curQuiz = cur.quiz || {} as any;
          const impQuiz = imp.quiz || {} as any;
          const quiz = {
            isSubmitted: curQuiz.isSubmitted || impQuiz.isSubmitted,
            score: Math.max(curQuiz.score || 0, impQuiz.score || 0),
            highScore: Math.max(curQuiz.highScore || 0, impQuiz.highScore || 0),
            attempts: Math.max(curQuiz.attempts || 0, impQuiz.attempts || 0),
            history: (curQuiz.history?.length || 0) >= (impQuiz.history?.length || 0) ? curQuiz.history : impQuiz.history,
            currentQuestionIndex: curQuiz.currentQuestionIndex ?? impQuiz.currentQuestionIndex ?? 0,
            totalQuestions: curQuiz.totalQuestions ?? impQuiz.totalQuestions,
            answersSnapshot: curQuiz.answersSnapshot || impQuiz.answersSnapshot || {},
            durationSeconds: curQuiz.durationSeconds ?? impQuiz.durationSeconds,
          };

          const mergedExercises: Record<string, any> = { ...(cur.exercises || {}) };
          for (const [exId, impEx] of Object.entries(imp.exercises || {}) as any[]) {
            const curEx = mergedExercises[exId];
            if (!curEx) { mergedExercises[exId] = impEx; }
            else {
              mergedExercises[exId] = {
                isCompleted: curEx.isCompleted || impEx.isCompleted,
                mastery: pickBetter(curEx.mastery, impEx.mastery),
                lastHintIndex: Math.max(curEx.lastHintIndex || 0, impEx.lastHintIndex || 0),
              };
            }
          }

          const exerciseFeedback = { ...(cur.exerciseFeedback || {}), ...(imp.exerciseFeedback || {}) };
          for (const [fbId, curFb] of Object.entries(cur.exerciseFeedback || {})) {
            const impFb = (imp.exerciseFeedback || {})[fbId];
            if (impFb) exerciseFeedback[fbId] = pickBetter(curFb, impFb) as MasteryLevel;
          }
          const exerciseDurations = { ...(cur.exerciseDurations || {}), ...(imp.exerciseDurations || {}) };

          merged[chId] = {
            revisionProgress,
            lastActiveAt: Math.max(cur.lastActiveAt || 0, imp.lastActiveAt || 0) || undefined,
            lastActiveSection: cur.lastActiveSection || imp.lastActiveSection,
            revealedBlanks,
            masteredSkills,
            quiz,
            exercises: mergedExercises,
            exerciseFeedback,
            exerciseDurations,
            isChapterSubmitted: cur.isChapterSubmitted || imp.isChapterSubmitted,
            submittedAt: cur.submittedAt || imp.submittedAt,
          };
        }

        if (json.totalTimeSpent) {
          const timeKey = `mathplus_total_time_spent_${user.uniqueId || user.name}`;
          const currentTime = parseInt(localStorage.getItem(timeKey) || '0', 10);
          localStorage.setItem(timeKey, Math.max(currentTime, json.totalTimeSpent).toString());
        }

        // `globalProgress` est exposé sans préfixe à l'interface. Avant de
        // persister l'import, on rétablit les clés internes scopées afin que
        // deux classes ayant un chapitre homonyme restent parfaitement isolées.
        const classId = user.classId;
        const persistedProgress: Record<string, ChapterProgress> = classId
          ? Object.fromEntries(
              Object.entries(merged).map(([chapterId, progress]) => [
                scopeKey(classId, chapterId),
                progress,
              ])
            )
          : merged;

        const mergedState = {
          version: json.version || '6.0',
          // Un fichier de sauvegarde ne doit pas pouvoir changer l'identité
          // ou les privilèges de la session qui a lancé l'import.
          user,
          isSessionActive: true,
          progress: persistedProgress,
          lastActive: Date.now()
        };

        storageService.forceSave(mergedState);
        if (json.settings) onApplySettings(json.settings);

        try { await cloudSyncService.forceSave(mergedState); }
        catch { console.warn('[Import] Cloud sync échoué, données locales sauvegardées'); }

        alert("Données importées et fusionnées avec succès. L'application va redémarrer.");
        window.location.reload();
        resolve();
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("Erreur de lecture"));
    reader.readAsText(file);
  });
}
