import React from 'react';
import { cookies } from 'next/headers';
import { LibraryHub, type LibraryRowItem } from '@/components/LibraryHub';
import { getConcoursIndex, normalizeClassId } from '@/lib/content/serverContent';
import { CLASS_COOKIE, CLASS_LABELS } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function PrepaPage() {
  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);
  const classLabel = CLASS_LABELS[classId] || classId;
  const schools = await getConcoursIndex();

  const chips: Array<[string, string]> = [
    ['all', 'Tous'],
    ['ensa', 'ENSA'],
    ['ensam', 'ENSAM'],
    ['medecine', 'Médecine'],
  ];

  const rows: LibraryRowItem[] = [];
  for (const sc of schools) {
    const sid = sc.id || '';
    const sname = sc.name || sid.toUpperCase();
    for (const qz of sc.quizzes ?? []) {
      const qid = qz.id || '';
      rows.push({
        id: `${sid}-qz-${qid}`,
        href: `/concours/${encodeURIComponent(sid)}?quiz=${encodeURIComponent(qid)}`,
        title: `${sname} — ${qz.title || 'Quiz'}`,
        tag: 'Quiz',
        amber: false,
        meta: `${sc.timePerQuestion || 45}s/qst`,
        keys: [sid],
        stateKind: 'q',
        stateKeys: [`concours-${sid}-${qid}`, qid],
        totalCount: qz.questionsCount || sc.questionsPerExam || 10,
      });
    }
    for (const an of sc.annales ?? []) {
      const aid = an.id || (an.path ? an.path.split('/').pop()?.replace(/\.json$/i, '') || '' : String(an.year || ''));
      const tot = an.questionsCount || sc.questionsPerExam || 20;
      rows.push({
        id: `${sid}-an-${aid}`,
        href: `/concours/${encodeURIComponent(sid)}?annale=${encodeURIComponent(aid)}`,
        title: `${sname} — ${an.title || `Session ${an.year || aid}`}`,
        tag: 'Annale',
        amber: true,
        meta: `${tot} qst`,
        keys: [sid],
        stateKind: 'q',
        stateKeys: [`concours-${sid}-${aid}`, aid],
        totalCount: tot,
      });
    }
  }

  return (
    <LibraryHub
      tabId="prepa"
      classLabel={classLabel}
      title="Prépa Concours"
      subtitle="Quiz thématiques et annales — ENSA, ENSAM, Médecine"
      chips={chips}
      rows={rows}
    />
  );
}
