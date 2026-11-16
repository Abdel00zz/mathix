import fs from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import type {
  ChapterManifest,
  ClassId,
  ClassManifest,
  ClassMeta,
  ConcoursSchool,
  ExamenMeta,
  ProblemeMeta,
} from '../types';

export const AVAILABLE_CLASSES: ClassMeta[] = [
  { id: 'tronc-commun-sc', title: 'Tronc Commun Sciences', shortName: 'Tronc Commun' },
  { id: '1ere-bac-sc-ex', title: '1ʳᵉ Bac Sciences Expérimentales', shortName: '1Bac Sc. Ex' },
  { id: '1ere-bac-sc-math', title: '1ʳᵉ Bac Sciences Mathématiques', shortName: '1Bac Sc. Math' },
  { id: '2eme-bac-sc-ex', title: '2ᵉ Bac Sciences Expérimentales', shortName: '2Bac Sc. Ex' },
  { id: '2eme-bac-sc-math', title: '2ᵉ Bac Sciences Mathématiques', shortName: '2Bac Sc. Math' },
];

export const VALID_CLASS_IDS = new Set<string>(AVAILABLE_CLASSES.map((c) => c.id));
export const CONCOURS_SCHOOL_IDS = new Set<string>(['ensa', 'ensam', 'medecine']);

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
const SAFE_DATA_REL_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\.json$/;
const MAX_JSON_CACHE = 250;

export function parseSafeSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let decoded = raw.trim();
  if (!decoded) return null;
  if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded).trim();
    } catch {
      return null;
    }
  }
  return SLUG_RE.test(decoded) ? decoded : null;
}

export function normalizeClassId(raw?: string | null): ClassId {
  const clean = String(raw ?? '').trim();
  if (VALID_CLASS_IDS.has(clean)) return clean as ClassId;
  return '2eme-bac-sc-ex';
}

const dataRoot = path.resolve(process.cwd(), 'public', 'data');

function sanitizeDataRelPath(relPath: unknown): string | null {
  if (typeof relPath !== 'string') return null;
  const trimmed = relPath.trim();
  if (!trimmed || /[\u0000\\:]/.test(trimmed)) return null;
  const clean = trimmed.replace(/^\/+/, '').replace(/^data\//, '');
  if (!clean || !SAFE_DATA_REL_RE.test(clean)) return null;
  const segments = clean.split('/');
  if (segments.some((seg) => !seg || seg === '.' || seg === '..')) return null;
  return clean;
}

const jsonCache = new Map<string, Promise<unknown>>();

function setBoundedJsonCache(key: string, promise: Promise<unknown>): void {
  if (jsonCache.has(key)) jsonCache.delete(key);
  else if (jsonCache.size >= MAX_JSON_CACHE) {
    const oldest = jsonCache.keys().next().value;
    if (oldest !== undefined) jsonCache.delete(oldest);
  }
  jsonCache.set(key, promise);
}

export async function readDataJson<T = unknown>(relPath: string): Promise<T | null> {
  const clean = sanitizeDataRelPath(relPath);
  if (!clean) return null;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && jsonCache.has(clean)) {
    const cached = jsonCache.get(clean)!;
    jsonCache.delete(clean);
    jsonCache.set(clean, cached);
    return (await cached) as T | null;
  }

  const loadPromise = (async () => {
    const file = path.resolve(dataRoot, clean);
    if (!file.startsWith(dataRoot + path.sep)) return null;
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
      return null;
    }
  })();

  if (isProd) {
    const guarded = loadPromise.then(
      (data) => {
        if (data === null) jsonCache.delete(clean);
        return data;
      },
      () => {
        jsonCache.delete(clean);
        return null;
      },
    );
    setBoundedJsonCache(clean, guarded);
    return (await guarded) as T | null;
  }
  return loadPromise;
}

export const getClassManifest = cache(async (rawClassId: string): Promise<ClassManifest | null> => {
  const classId = normalizeClassId(rawClassId);
  return readDataJson<ClassManifest>(`classes/${classId}.json`);
});

export const getChapterManifest = cache(async (manifestPathOrId: string, rawClassId?: string): Promise<ChapterManifest | null> => {
  if (!manifestPathOrId) return null;
  if (manifestPathOrId.endsWith('.json')) {
    return readDataJson<ChapterManifest>(manifestPathOrId);
  }
  const safeId = parseSafeSlug(manifestPathOrId);
  if (!safeId) return null;
  const classId = normalizeClassId(rawClassId);
  return readDataJson<ChapterManifest>(`${classId}/${safeId}/manifest.json`);
});

export interface HydratedChapter {
  id: string;
  title: string;
  order: number;
  manifestPath?: string;
  quizCount: number;
  revisions: Array<{ id: string; title?: string; label?: string; path: string }>;
  quizzes: Array<{ id: string; title?: string; path: string; questionsCount?: number }>;
  exercises: Array<{ id: string; path: string }>;
}

export const getHydratedProgramme = cache(async (rawClassId: string): Promise<{
  classId: ClassId;
  classTitle: string;
  chapters: HydratedChapter[];
}> => {
  const classId = normalizeClassId(rawClassId);
  const meta = AVAILABLE_CLASSES.find((c) => c.id === classId);
  const man = await getClassManifest(classId);
  const chapters = man?.chapters ?? [];

  const subManifests = await Promise.all(
    chapters.map((ch) => (ch.manifestPath ? getChapterManifest(ch.manifestPath) : Promise.resolve(null)))
  );

  const hydrated: HydratedChapter[] = chapters.map((ch, idx) => {
    const sub = subManifests[idx];
    const revsRaw = (sub?.revisions?.length ? sub.revisions : ch.revisions) ?? [];
    const qzRaw = (sub?.quizzes?.length ? sub.quizzes : ch.quizzes) ?? [];
    const exRaw = (sub?.exercises?.length ? sub.exercises : ch.exercises) ?? [];
    const quizCount = sub?.quizCount || ch.quizCount || (qzRaw.length ? 10 : 0);

    return {
      id: ch.id,
      title: ch.title,
      order: ch.order != null ? ch.order : idx + 1,
      manifestPath: ch.manifestPath,
      quizCount,
      revisions: revsRaw.filter((r) => Boolean(r.path)).map((r, rIdx) => ({
        id: r.id || (rIdx === 0 ? 'cours' : `fiche-${rIdx + 1}`),
        title: r.title,
        label: r.label || r.title || (rIdx === 0 ? 'Cours' : `Fiche ${rIdx + 1}`),
        path: r.path!,
      })),
      quizzes: qzRaw.filter((q) => Boolean(q.path)).map((q, qIdx) => ({
        id: q.id || `quiz-${qIdx + 1}`,
        title: q.title,
        path: q.path!,
        questionsCount: q.questionsCount,
      })),
      exercises: exRaw.filter((e) => Boolean(e.path)).map((e, eIdx) => ({
        id: e.id || `ex-${eIdx + 1}`,
        path: e.path!,
      })),
    };
  });

  return {
    classId,
    classTitle: man?.className || man?.title || meta?.title || classId,
    chapters: hydrated,
  };
});

export const getExamensIndex = cache(async (rawClassId: string): Promise<{ examens: ExamenMeta[] }> => {
  const classId = normalizeClassId(rawClassId);
  const raw = await readDataJson<{ examens?: ExamenMeta[] } | ExamenMeta[]>(`${classId}/examen/index.json`);
  const list = Array.isArray(raw) ? raw : raw?.examens ?? [];
  return { examens: list };
});

export const getProblemesIndex = cache(async (rawClassId: string): Promise<{
  problemes: ProblemeMeta[];
  themes: Array<{ id: string; name: string }>;
}> => {
  const classId = normalizeClassId(rawClassId);
  const raw = await readDataJson<{ problemes?: ProblemeMeta[]; themes?: Array<{ id: string; name: string }> } | ProblemeMeta[]>(
    `${classId}/problemes/index.json`
  );
  if (Array.isArray(raw)) return { problemes: raw, themes: [] };
  return { problemes: raw?.problemes ?? [], themes: raw?.themes ?? [] };
});

export const getConcoursIndex = cache(async (): Promise<ConcoursSchool[]> => {
  const master = await readDataJson<{ concours?: Array<{ id: string; manifestPath?: string }> }>('manifest.json');
  const refs = master?.concours ?? [
    { id: 'ensa', manifestPath: 'data/concours/ensa/manifest.json' },
    { id: 'ensam', manifestPath: 'data/concours/ensam/manifest.json' },
    { id: 'medecine', manifestPath: 'data/concours/medecine/manifest.json' },
  ];
  const manifests = await Promise.all(
    refs.map((c) => readDataJson<ConcoursSchool>(c.manifestPath || `concours/${c.id}/manifest.json`))
  );
  return manifests.filter((m): m is ConcoursSchool => Boolean(m));
});
