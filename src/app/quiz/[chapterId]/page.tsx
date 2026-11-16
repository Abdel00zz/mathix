import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { QuizRunnerView, type QuizSerieData } from '@/components/QuizRunnerView';
import {
  getChapterManifest,
  getClassManifest,
  normalizeClassId,
  parseSafeSlug,
  readDataJson,
} from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ quiz?: string }>;
}) {
  const { chapterId: rawChapterId } = await params;
  const { quiz: initialQuizId } = await searchParams;
  const chapterId = parseSafeSlug(rawChapterId);
  if (!chapterId) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const classMan = await getClassManifest(classId);
  const chapMeta = classMan?.chapters?.find((c) => c.id === chapterId);
  const chapMan = await getChapterManifest(chapMeta?.manifestPath || chapterId, classId);
  if (!chapMeta && !chapMan) notFound();

  const revisions = (chapMan?.revisions?.length ? chapMan.revisions : chapMeta?.revisions) ?? [];
  const rawQuizzes = (chapMan?.quizzes?.length ? chapMan.quizzes : chapMeta?.quizzes) ?? [];

  const hydrated = await Promise.all(
    rawQuizzes
      .filter((q) => Boolean(q.path))
      .map(async (q, i): Promise<QuizSerieData | null> => {
        const data = await readDataJson<{ title?: string; timePerQuestion?: number; questions?: unknown[] }>(q.path!);
        const questions = Array.isArray(data?.questions) ? data.questions : [];
        if (!questions.length) return null;
        return {
          id: q.id || `quiz-${i + 1}`,
          title: data?.title || q.title || 'Quiz du chapitre',
          basePath: q.path!.replace(/[^/]+$/, ''),
          timePerQuestion: data?.timePerQuestion ?? null,
          questions,
        };
      })
  );

  const quizzes = hydrated.filter((x): x is QuizSerieData => Boolean(x));

  return (
    <QuizRunnerView
      kind="chapter"
      classId={classId}
      chapterId={chapterId}
      title={chapMeta?.title || chapterId}
      backHref="/"
      hashUrl={`/quiz/${encodeURIComponent(chapterId)}`}
      hasLesson={revisions.length > 0}
      quizzes={quizzes}
      initialQuizId={initialQuizId}
    />
  );
}
