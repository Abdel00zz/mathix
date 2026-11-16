import { useEffect, useState } from 'react';
import { AppSettings, ChapterInfo, ChapterProgress, Exercise } from '../types';
import { contentService } from '../services/contentService';
import { chapterStatsService } from '../services/chapterStatsService';
import { STORAGE_KEYS } from '../utils/constants';
import { resolveNotificationPrefs } from '../utils/notificationPrefs';

// « Mise à niveau » est le point d'entrée pédagogique du programme : il reste
// avant tout autre chapitre, même si une édition de catalogue oublie `pinned`.
const isAnchorChapter = (chapter: ChapterInfo) => chapter.id === 'mise-a-niveau' || chapter.pinned === true;

export function useDashboardData(
  classId: string,
  globalProgress: Record<string, ChapterProgress>,
  settings?: AppSettings,
  contentRevision = 0,
) {
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [allClassExercises, setAllClassExercises] = useState<Exercise[]>(() => {
    try {
      const cached = localStorage.getItem(`${STORAGE_KEYS.DASHBOARD_CACHE}-${classId}`);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return [];
  });
  // En chargement tant que la classe demandée n'a pas livré son contenu.
  // Dérivé (pas de setState dans l'effet) : au changement de niveau (séance
  // pilotée depuis le PC), la tablette repasse naturellement en chargement.
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const isLoadingContent = loadedClassId !== classId;

  const is2bac = ['2eme-bac-sc-ex', '2eme-bac-sc-math'].includes(classId);
  const hasOlympiad = ['tronc-commun-sc', '1ere-bac-sc-math'].includes(classId);

  useEffect(() => {
    let active = true;
    const initData = async () => {
      try {
        const classData = await contentService.fetchClassDetails(classId);
        if (!active || !classData) return;

        setChapters(
          classData.chapters
            .map(ch => ({ ...ch, classId }))
            // Les chapitres épinglés (ex. « Mise à niveau ») restent en tête,
            // quel que soit l'ordre dans le JSON ou un éventuel réordonnancement.
            .sort((a, b) => Number(isAnchorChapter(b)) - Number(isAnchorChapter(a)))
        );

        const [classExercises, stats] = await Promise.all([
          contentService.loadExercisesByClass(classId),
          chapterStatsService.getStats(classId),
        ]);
        if (!active) return;

        setAllClassExercises(classExercises);

        if (Object.keys(stats).length > 0) {
          setChapters(prev => prev.map(ch => ({
            ...ch,
            // Le cache de statistiques peut dater d'avant la publication d'un
            // quiz. Une valeur locale à 0 ne doit donc jamais masquer le
            // nombre déclaré dans le catalogue fraîchement chargé.
            quizCount: Math.max(stats[ch.id]?.quizCount ?? 0, ch.quizCount ?? 0),
          })));
        }
      } catch { /* ignore */ } finally {
        if (active) setLoadedClassId(classId);
      }
    };
    initData();
    return () => { active = false; };
  }, [classId, contentRevision]);

  // ── Notifications (once per session, deferred to not block first paint) ──
  useEffect(() => {
    if (chapters.length === 0 || allClassExercises.length === 0) return;
    if (sessionStorage.getItem('mathplus:notif-generated-session')) return;
    sessionStorage.setItem('mathplus:notif-generated-session', 'true');

    const prefs = resolveNotificationPrefs(settings);
    if (!prefs.enabled) return;

    const runNotifications = () => {
      Promise.all([
        import('../services/notificationService'),
        import('../services/progressDigestService'),
        import('../services/concoursProgress'),
      ]).then(([{ notificationService }, digest, concours]) => {
        const chapterNameMap: Record<string, string> = {};
        chapters.forEach(ch => { chapterNameMap[ch.id] = ch.title; });

        const progressEntries = Object.entries(globalProgress);
        const submittedEntries = progressEntries.filter(([, p]) => p.quiz?.isSubmitted);
        const averageScore = submittedEntries.length > 0
          ? submittedEntries.reduce((sum, [, p]) => sum + (p.quiz?.score || 0), 0) / submittedEntries.length
          : 0;
        const weakChapterCount = submittedEntries.filter(([, p]) => (p.quiz?.score || 0) < 60).length;

        const totalQuizSubmitted = submittedEntries.length;
        const totalExercisesWithFeedback = progressEntries.reduce((sum, [, p]) => sum + Object.keys(p.exerciseFeedback || {}).length, 0);
        const totalExercises = allClassExercises.length;

        notificationService.generateFromProgress({
          totalChapters: chapters.length,
          completedQuizzes: totalQuizSubmitted,
          averageScore,
          weakChapterCount,
          totalExercisesCompleted: totalExercisesWithFeedback,
          totalExercises,
        }, globalProgress, chapterNameMap);

        if (prefs.categories.revision && Object.keys(globalProgress).length > 0) {
          notificationService.generateRetentionReminders(globalProgress, chapterNameMap);
        }

        if (prefs.categories.content) {
          const quizCounts: Record<string, number> = {};
          chapters.forEach(ch => { quizCounts[ch.id] = ch.quizCount || 0; });
          notificationService.generateFromContentChanges(
            allClassExercises.map(ex => ({ id: ex.id, chapterId: ex.chapterId, topic: ex.topic })),
            quizCounts, globalProgress, chapterNameMap
          );
        }

        // ── Bilan de progression multi-axes (cadence choisie par l'élève) ──
        digest.runDigest({
          globalProgress,
          chapterTitles: chapterNameMap,
          totalChapters: chapters.length,
          totalExercises,
          concoursSessions: concours.getConcoursProgress().totalExams,
          weeklyGoalMin: settings?.studyPlan?.weeklyGoalMin,
        }, prefs);
      });
    };

    // Defer to after the browser is idle (or fallback to 2s timeout)
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(runNotifications, { timeout: 5000 });
    } else {
      setTimeout(runNotifications, 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length, allClassExercises.length]);

  return { chapters, allClassExercises, isLoadingContent, is2bac, hasOlympiad };
}
