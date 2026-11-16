import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ExerciseRunnerView, type ExerciseItemData } from '@/components/ExerciseRunnerView';
import {
  getChapterManifest,
  getClassManifest,
  normalizeClassId,
  parseSafeSlug,
  readDataJson,
} from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ExercicesPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId: rawChapterId } = await params;
  const chapterId = parseSafeSlug(rawChapterId);
  if (!chapterId) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const classMan = await getClassManifest(classId);
  const chapMeta = classMan?.chapters?.find((c) => c.id === chapterId);
  const chapMan = await getChapterManifest(chapMeta?.manifestPath || chapterId, classId);
  if (!chapMeta && !chapMan) notFound();

  const revisions = (chapMan?.revisions?.length ? chapMan.revisions : chapMeta?.revisions) ?? [];
  const quizzes = (chapMan?.quizzes?.length ? chapMan.quizzes : chapMeta?.quizzes) ?? [];
  const rawExs = (chapMan?.exercises?.length ? chapMan.exercises : chapMeta?.exercises) ?? [];
  const quizCount = chapMan?.quizCount || chapMeta?.quizCount || (quizzes.length ? 10 : 0);

  const exercises: ExerciseItemData[] = await Promise.all(
    rawExs
      .filter((e) => Boolean(e.path))
      .map(async (e, i): Promise<ExerciseItemData> => {
        const pathStr = e.path!;
        const fallbackId = e.id || `ex-${i + 1}`;
        const basePath = pathStr.replace(/[^/]+$/, '');
        try {
          const raw = await readDataJson<Record<string, unknown>>(pathStr);
          if (!raw) {
            return { id: fallbackId, basePath, path: pathStr, failed: true, error: 'Fichier introuvable.', raw: {} };
          }
          return {
            id: e.id || String(raw.id || fallbackId),
            basePath,
            path: pathStr,
            raw,
          };
        } catch {
          return { id: fallbackId, basePath, path: pathStr, failed: true, error: 'Chargement impossible.', raw: {} };
        }
      })
  );

  return (
    <ExerciseRunnerView
      kind="chapter"
      classId={classId}
      chapterId={chapterId}
      title={chapMeta?.title || chapterId}
      backHref="/"
      hashUrl={`/exercices/${encodeURIComponent(chapterId)}`}
      hasLesson={revisions.length > 0}
      hasQuiz={quizzes.length > 0 || quizCount > 0}
      quizCount={quizCount}
      quizzes={quizzes}
      exercises={exercises}
    />
  );
}
