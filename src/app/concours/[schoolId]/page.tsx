import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { QuizRunnerView, type QuizSerieData } from '@/components/QuizRunnerView';
import {
  CONCOURS_SCHOOL_IDS,
  normalizeClassId,
  parseSafeSlug,
  readDataJson,
} from '@/lib/content/serverContent';
import type { ConcoursSchool } from '@/lib/types';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ConcoursQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ quiz?: string; annale?: string }>;
}) {
  const { schoolId: rawSchoolId } = await params;
  const { quiz, annale } = await searchParams;
  const schoolId = parseSafeSlug(rawSchoolId);
  if (!schoolId || !CONCOURS_SCHOOL_IDS.has(schoolId)) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const man = await readDataJson<ConcoursSchool & { annales?: Array<{ id?: string; title?: string; path?: string; year?: number }> }>(
    `concours/${schoolId}/manifest.json`
  );
  if (!man) notFound();

  const entries: Array<{ id: string; title: string; path: string }> = [];
  for (const q of man.quizzes ?? []) {
    if (q.path) entries.push({ id: q.id || q.path, title: q.title || 'Quiz concours', path: q.path });
  }
  for (const a of man.annales ?? []) {
    if (a.path) {
      const aid = a.id || a.path.split('/').pop()?.replace(/\.json$/i, '') || String(a.year || 'annale');
      entries.push({ id: aid, title: a.title || `Annale ${a.year || ''}`, path: a.path });
    }
  }

  const hydrated = await Promise.all(
    entries.map(async (item): Promise<QuizSerieData | null> => {
      const relPath = item.path.startsWith('data/') || item.path.startsWith('concours/')
        ? item.path
        : `concours/${schoolId}/${item.path.replace(/^\.\//, '')}`;
      const data = await readDataJson<{ title?: string; timePerQuestion?: number; questions?: unknown[] }>(relPath);
      const questions = Array.isArray(data?.questions) ? data.questions : [];
      if (!questions.length) return null;
      return {
        id: item.id,
        title: data?.title || item.title,
        basePath: relPath.replace(/[^/]+$/, ''),
        timePerQuestion: data?.timePerQuestion ?? man.timePerQuestion ?? 60,
        questions,
      };
    })
  );

  const quizzes = hydrated.filter((x): x is QuizSerieData => Boolean(x));
  const initialId = quiz || annale;

  return (
    <QuizRunnerView
      kind="concours"
      classId={classId}
      chapterId={schoolId}
      title={man.title || man.name || `Prépa ${schoolId.toUpperCase()}`}
      backHref="/prepa"
      hashUrl={`/concours/${encodeURIComponent(schoolId)}`}
      hasLesson={false}
      quizzes={quizzes}
      initialQuizId={initialId}
    />
  );
}
