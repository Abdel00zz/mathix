import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ExerciseRunnerView, type ExerciseItemData } from '@/components/ExerciseRunnerView';
import { getExamensIndex, normalizeClassId, parseSafeSlug, readDataJson } from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ExamenNationalPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId: rawExamId } = await params;
  const examId = parseSafeSlug(rawExamId);
  if (!examId) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const { examens } = await getExamensIndex(classId);
  const meta = examens.find((x) => x.id === examId);
  if (examens.length > 0 && !meta) notFound();
  const examPath = meta?.path || `${classId}/examen/${examId}.json`;
  const examData = await readDataJson<Record<string, unknown>>(examPath);
  if (!examData) notFound();

  const rawExercises = Array.isArray(examData.exercises) ? (examData.exercises as Array<Record<string, unknown>>) : [];
  const exercises: ExerciseItemData[] = rawExercises.map((raw, i) => ({
    id: String(raw.id || `ex-${i + 1}`),
    basePath: `${classId}/examen/`,
    raw,
  }));

  return (
    <ExerciseRunnerView
      kind="national"
      classId={classId}
      chapterId={examId}
      title={String(examData.title || meta?.title || `Examen ${examId}`)}
      subtitle={String(examData.subtitle || '')}
      year={(examData.year as number | undefined) || meta?.year}
      session={String(examData.session || meta?.session || '')}
      duration={(examData.duration as number | undefined) || meta?.duration}
      totalPoints={(examData.totalPoints as number | undefined) || meta?.totalPoints}
      coefficient={(examData.coefficient as number | undefined) || meta?.coefficient}
      backHref="/examens"
      hashUrl={`/examen/${encodeURIComponent(examId)}`}
      hasLesson={false}
      hasQuiz={false}
      quizCount={0}
      quizzes={[]}
      exercises={exercises}
      initialMode="examen"
    />
  );
}
