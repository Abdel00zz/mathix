import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LessonStudyView, type LessonSheetTab } from '@/components/LessonStudyView';
import { renderLessonStudy } from '@/lib/lesson/lessonStudyRenderer';
import {
  getChapterManifest,
  getClassManifest,
  normalizeClassId,
  parseSafeSlug,
  readDataJson,
} from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function LeconPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ sheet?: string }>;
}) {
  const { chapterId: rawChapterId } = await params;
  const { sheet: requestedSheet } = await searchParams;
  const chapterId = parseSafeSlug(rawChapterId);
  if (!chapterId) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const classMan = await getClassManifest(classId);
  const chapMeta = classMan?.chapters?.find((c) => c.id === chapterId);
  const chapMan = await getChapterManifest(chapMeta?.manifestPath || chapterId, classId);
  if (!chapMeta && !chapMan) notFound();

  const revisions =
    (chapMan?.revisions?.length ? chapMan.revisions : chapMeta?.revisions) ?? [];
  if (!revisions.length) notFound();

  const activeMeta =
    (requestedSheet && revisions.find((s, i) => (s.id || (i === 0 ? 'cours' : `fiche-${i + 1}`)) === requestedSheet)) ||
    revisions[0];
  const sheetData = activeMeta?.path ? await readDataJson<Record<string, unknown>>(activeMeta.path) : null;
  if (!sheetData) notFound();

  const sheetId = activeMeta.id || 'cours';
  const tabs: LessonSheetTab[] =
    revisions.length > 1
      ? revisions.map((r, i) => {
          const sid = r.id || (i === 0 ? 'cours' : `fiche-${i + 1}`);
          return {
            id: sid,
            label: r.label || r.title || `Fiche ${i + 1}`,
            href: `/lecon/${encodeURIComponent(chapterId)}?sheet=${encodeURIComponent(sid)}`,
            active: sid === sheetId,
          };
        })
      : [];

  const headerObj = (sheetData.header || {}) as Record<string, unknown>;
  const title = String(headerObj.title || chapMeta?.title || 'Fiche de révision');
  const kicker = String(chapMeta?.title || headerObj.title || chapterId);
  const basePath = activeMeta.path ? String(activeMeta.path).replace(/[^/]+$/, '') : '';
  const scrollKey = revisions.length > 1 ? `${chapterId}:${sheetId}` : chapterId;
  const hashUrl = `/lecon/${encodeURIComponent(chapterId)}${revisions.length > 1 ? `?sheet=${encodeURIComponent(sheetId)}` : ''}`;

  return (
    <LessonStudyView
      kind="lesson"
      chapterId={chapterId}
      scrollKey={scrollKey}
      title={title}
      backHref="/"
      backLabel="Programme"
      backEndLabel="Retour au programme"
      hashUrl={hashUrl}
      rendered={renderLessonStudy({ kind: 'lesson', title, kicker, basePath, sheet: sheetData })}
      sheets={tabs}
    />
  );
}
