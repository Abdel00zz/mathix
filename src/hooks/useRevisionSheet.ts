
import { useState, useEffect } from 'react';
import { RevisionSheet } from '../types';
import { contentService, ContentError } from '../services/contentService';

const resolveContentPath = (path: string) => {
  if (!path) return path;
  if (/^(https?:)?\/\//.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

export const useRevisionSheet = (path: string) => {
  const [sheet, setSheet] = useState<RevisionSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const coursePath = resolveContentPath(path);

      const loadSheet = async (targetPath: string) => {
        try {
          return await contentService.fetchRevisionSheet(targetPath);
        } catch (initialError) {
          console.warn('[useRevisionSheet] Cached load failed, retrying fresh fetch for', targetPath, initialError);
          return contentService.fetchRevisionSheet(targetPath, true);
        }
      };

      try {
        setLoading(true);
        setError(null);
        const courseData: RevisionSheet = await loadSheet(coursePath);

        setSheet(courseData);
      } catch (e: any) {
        const message = e instanceof ContentError
          ? `${e.message} (${e.filePath})`
          : (e?.message || 'Document de cours indisponible');
        setSheet(null);
        setError(`${message}${coursePath ? `\nChemin demandé : ${coursePath}` : ''}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [path]);

  return { sheet, loading, error };
};
