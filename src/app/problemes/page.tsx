import React from 'react';
import { cookies } from 'next/headers';
import { LibraryHub, type LibraryRowItem } from '@/components/LibraryHub';
import { getProblemesIndex, normalizeClassId } from '@/lib/content/serverContent';
import { CLASS_COOKIE, CLASS_LABELS } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function ProblemesPage() {
  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);
  const classLabel = CLASS_LABELS[classId] || classId;
  const { problemes, themes } = await getProblemesIndex(classId);

  const themeMap = Object.fromEntries(themes.map((t) => [t.id, t.name]));
  const chips: Array<[string, string]> = [
    ['all', 'Tous'],
    ...[...new Set(problemes.map((p) => p.theme).filter(Boolean))].map(
      (id) => [id!, themeMap[id!] || id!] as [string, string]
    ),
  ];

  const rows: LibraryRowItem[] = problemes.map((pb) => ({
    id: pb.id,
    href: `/probleme/${encodeURIComponent(pb.id)}`,
    title: pb.title || pb.id,
    tag: pb.difficulty || '',
    amber: /avanc|diffic/i.test(pb.difficulty || ''),
    meta: (pb.theme && themeMap[pb.theme]) || pb.theme || 'Problème',
    keys: [pb.theme || ''],
    stateKind: 'l',
    stateKeys: [`prob:${pb.id}`, `probleme-${pb.id}`, pb.id],
    totalCount: 100,
  }));

  return (
    <LibraryHub
      tabId="problemes"
      classLabel={classLabel}
      title="Problèmes"
      subtitle={`Problèmes de synthèse — ${classLabel}`}
      chips={chips}
      rows={rows}
    />
  );
}
