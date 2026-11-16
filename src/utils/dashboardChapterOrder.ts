import { isPinnedChapter } from '../components/Dashboard/ChapterCard/chapterTheme';
import type { ChapterInfo, ChapterProgress } from '../types';

export interface LastOpenedChapter {
  id: string;
  at: number;
}

export const readLastOpenedChapter = (key: string): LastOpenedChapter | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') {
      return { id: parsed.id, at: Number(parsed.at) || 0 };
    }
    return { id: raw, at: 0 };
  } catch {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { id: raw, at: 0 } : null;
    } catch {
      return null;
    }
  }
};

export function computeActiveChapterIndex(
  chapters: ChapterInfo[],
  globalProgress: Record<string, ChapterProgress>,
  chapterStats: Record<string, { progress?: number } | undefined>,
  lastOpenedChapter: LastOpenedChapter | null,
): number {
  let highestStartedIndex = -1;
  let latestWorkedIndex = -1;
  let latestWorkedAt = 0;

  chapters.forEach((chapter, index) => {
    if ((chapterStats[chapter.id]?.progress || 0) > 0) {
      highestStartedIndex = index;
    }
    const lastActiveAt = globalProgress[chapter.id]?.lastActiveAt || 0;
    if (lastActiveAt > latestWorkedAt) {
      latestWorkedAt = lastActiveAt;
      latestWorkedIndex = index;
    }
  });

  const lastOpenedIndex = lastOpenedChapter
    ? chapters.findIndex(chapter => chapter.id === lastOpenedChapter.id)
    : -1;
  const lastOpenedAt = lastOpenedChapter?.at || 0;

  if (lastOpenedIndex >= 0 && lastOpenedAt >= latestWorkedAt) return lastOpenedIndex;
  if (latestWorkedIndex >= 0) return latestWorkedIndex;
  if (lastOpenedIndex >= 0) return lastOpenedIndex;
  return highestStartedIndex >= 0 ? highestStartedIndex : -1;
}

export function orderChaptersForDashboard(
  chapters: ChapterInfo[],
  activeChapterIndex: number,
  highlightedChapterIds: Set<string>,
  profSession: boolean,
): Array<{ chapter: ChapterInfo; index: number }> {
  const list = chapters.map((chapter, index) => ({ chapter, index }));
  const pinned = list.filter(({ chapter }) => isPinnedChapter(chapter));
  const regular = list.filter(({ chapter }) => !isPinnedChapter(chapter));

  if (profSession && highlightedChapterIds.size > 0) {
    const highlighted = regular.filter(({ chapter }) => highlightedChapterIds.has(chapter.id));
    const rest = regular.filter(({ chapter }) => !highlightedChapterIds.has(chapter.id));
    if (activeChapterIndex >= 0) {
      const activeItem = rest.find(({ index }) => index === activeChapterIndex);
      if (activeItem) {
        const remaining = rest.filter(({ index }) => index !== activeChapterIndex);
        return [...pinned, ...highlighted, activeItem, ...remaining];
      }
    }
    return [...pinned, ...highlighted, ...rest];
  }

  if (activeChapterIndex >= 0) {
    const activeItem = regular.find(({ index }) => index === activeChapterIndex);
    if (activeItem) {
      const remaining = regular.filter(({ index }) => index !== activeChapterIndex);
      return [...pinned, activeItem, ...remaining];
    }
  }

  return [...pinned, ...regular];
}
