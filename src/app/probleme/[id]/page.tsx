import React from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LessonStudyView } from '@/components/LessonStudyView';
import { renderLessonStudy } from '@/lib/lesson/lessonStudyRenderer';
import { getProblemesIndex, normalizeClassId, parseSafeSlug, readDataJson } from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function normalizeProblemToSheet(prob: Record<string, unknown>, fallbackId: string): Record<string, unknown> {
  if (Array.isArray(prob.sections)) return prob;
  const blocks: Array<Record<string, unknown>> = [];
  if (prob.statement || prob.enonce || prob.content) {
    blocks.push({
      type: 'problem',
      title: prob.title || 'Énoncé',
      difficulty: prob.difficulty,
      content: prob.statement || prob.enonce || prob.content,
      media: prob.media,
    });
  }
  if (Array.isArray(prob.hints)) {
    prob.hints.forEach((h, i) => blocks.push({ type: 'hint', title: `Indice ${i + 1}`, content: h }));
  } else if (prob.hint || prob.indice) {
    blocks.push({ type: 'hint', title: 'Indice', content: prob.hint || prob.indice });
  }
  if (prob.solution || prob.correction) {
    blocks.push({ type: 'solution', title: 'Solution rédigée', content: prob.solution || prob.correction });
  }
  if (Array.isArray(prob.blocks)) {
    blocks.push(...(prob.blocks as Array<Record<string, unknown>>));
  }
  return {
    header: {
      title: prob.title || `Problème ${fallbackId}`,
      subtitle: prob.subtitle || prob.theme || '',
      context: prob.context || prob.source || '',
    },
    lexique: prob.lexique || [],
    sections: [{ id: 'probleme-main', title: prob.sectionTitle || 'Sujet & résolution', blocks }],
  };
}

export default async function ProblemePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const probId = parseSafeSlug(rawId);
  if (!probId) notFound();

  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);

  const { problemes } = await getProblemesIndex(classId);
  const meta = problemes.find((p) => p.id === probId);
  if (problemes.length > 0 && !meta) notFound();
  const probPath = meta?.path || `${classId}/problemes/${probId}.json`;
  const probData = await readDataJson<Record<string, unknown>>(probPath);
  if (!probData) notFound();

  const sheet = normalizeProblemToSheet(probData, probId);

  const headerObj = (sheet.header || {}) as Record<string, unknown>;
  const title = String(headerObj.title || meta?.title || `Problème ${probId}`);
  const kicker = String(probData.source || probData.theme || meta?.theme || 'Problème de synthèse');

  return (
    <LessonStudyView
      kind="probleme"
      chapterId={probId}
      scrollKey={`prob:${probId}`}
      title={title}
      backHref="/problemes"
      backLabel="Problèmes"
      backEndLabel="Retour aux problèmes"
      hashUrl={`/probleme/${encodeURIComponent(probId)}`}
      rendered={renderLessonStudy({ kind: 'probleme', title, kicker, basePath: `${classId}/problemes/`, sheet })}
      sheets={[]}
    />
  );
}
