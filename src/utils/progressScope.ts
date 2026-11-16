import { ChapterProgress } from '../types';

/** Prefix chapter key with classId for multi-class isolation */
export const scopeKey = (classId: string, chapterId: string) => `${classId}_${chapterId}`;

/** Read one chapter only when both its class and id are explicit. */
export const getScopedChapterProgress = (
  progress: Record<string, ChapterProgress>,
  classId: string | undefined,
  chapterId: string,
): ChapterProgress | undefined => {
  const normalizedClassId = classId?.trim();
  if (!normalizedClassId || !chapterId) return undefined;
  return progress[scopeKey(normalizedClassId, chapterId)];
};

/** Re-scope all progress keys from one class to another */
export const rescopeProgress = (
  progress: Record<string, ChapterProgress>,
  oldClassId: string,
  newClassId: string
): Record<string, ChapterProgress> => {
  const result: Record<string, ChapterProgress> = {};
  const oldPrefix = `${oldClassId}_`;
  for (const [key, value] of Object.entries(progress)) {
    if (key.startsWith(oldPrefix)) {
      result[`${newClassId}_${key.slice(oldPrefix.length)}`] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
};

/** Strip classId prefix to expose normal chapter keys to consumers */
export const unscopeProgress = (progress: Record<string, ChapterProgress>, classId: string): Record<string, ChapterProgress> => {
  const prefix = `${classId}_`;
  const result: Record<string, ChapterProgress> = {};
  for (const key of Object.keys(progress)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = progress[key];
    }
  }
  return result;
};
