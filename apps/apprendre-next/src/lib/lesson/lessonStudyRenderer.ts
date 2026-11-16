import { computeReadTime, renderHeroTitleHtml, renderIntroHtml, renderMathText, renderSectionHtml } from './leconRenderer';
import { buildSearchIndex, contentToPlainText } from './leconSearch';

/** Render once on the server; hydration receives the result, never the raw lesson. */
export function renderLessonStudy(input: {
  kind: 'lesson' | 'probleme';
  title: string;
  kicker: string;
  basePath: string;
  sheet: Record<string, unknown>;
}) {
  const sheet = input.kind === 'probleme' ? { kind: 'probleme', ...input.sheet } : input.sheet;
  const rawSections = Array.isArray(sheet.sections) ? (sheet.sections as Array<Record<string, unknown>>) : [];
  const intro = renderIntroHtml(sheet, rawSections, input.basePath);
  const counters: Record<string, number> = {};
  const sectionsHtml = intro.bodySections
    .map((s, idx) => renderSectionHtml(s, idx, counters, true, input.basePath, 'alpha'))
    .join('');
  const tocItems = intro.bodySections.map((s, idx) => {
    const section = (s || {}) as Record<string, unknown>;
    return {
      secId: String(section.id != null ? section.id : `sec-${idx}`),
      lbl: String.fromCharCode(65 + (idx % 26)) + '.',
      titleHtml: renderMathText(section.title || 'Section', true, input.basePath),
      plainTitle: contentToPlainText(String(section.title || 'Section')),
    };
  });
  const bodyHtml = intro.markup + sectionsHtml;
  return {
    bodyHtml,
    blankCount: (bodyHtml.match(/data-blank="true"/g) || []).length,
    tocItems,
    heroHtml: renderHeroTitleHtml(input.title, input.basePath),
    kickerHtml: renderMathText(input.kicker, true, input.basePath),
    readTime: computeReadTime(`${input.title}\n${contentToPlainText(JSON.stringify(rawSections))}`),
    searchIndex: buildSearchIndex(intro.bodySections),
  };
}

export type RenderedLessonStudy = ReturnType<typeof renderLessonStudy>;
