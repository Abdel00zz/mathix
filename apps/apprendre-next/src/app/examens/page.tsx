import React from 'react';
import { cookies } from 'next/headers';
import { LibraryHub, type LibraryRowItem } from '@/components/LibraryHub';
import { getExamensIndex, normalizeClassId } from '@/lib/content/serverContent';
import { CLASS_COOKIE, CLASS_LABELS } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ExamensPage() {
  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);
  const classLabel = CLASS_LABELS[classId] || classId;
  const { examens } = await getExamensIndex(classId);

  const years = [...new Set(examens.map((x) => String(x.year || '')).filter(Boolean))].sort(
    (a, b) => Number(b) - Number(a)
  );
  const chips: Array<[string, string]> = [
    ['all', 'Tous'],
    ['s:normale', 'Normale'],
    ['s:rattrapage', 'Rattrapage'],
    ...years.map((y) => [`y:${y}`, y] as [string, string]),
  ];

  const rows: LibraryRowItem[] = examens.map((ex) => {
    const rattr = /rattrapage/i.test(String(ex.session || ''));
    const cnt = ex.exerciseCount || 4;
    return {
      id: ex.id,
      href: `/examen/${encodeURIComponent(ex.id)}`,
      title: ex.title || `Examen ${ex.year || ''}`,
      tag: rattr ? 'Rattrapage' : 'Normale',
      amber: rattr,
      meta: `${cnt} ex.`,
      keys: [`y:${String(ex.year || '')}`, `s:${rattr ? 'rattrapage' : 'normale'}`],
      stateKind: 'e',
      stateKeys: [`examen-${ex.id}`, ex.id],
      totalCount: cnt,
    };
  });

  return (
    <LibraryHub
      tabId="examens"
      classLabel={classLabel}
      title="Examens Nationaux"
      subtitle={`Sujets corrigés — ${classLabel}`}
      chips={chips}
      rows={rows}
    />
  );
}
