import { DsDevoirData } from './dsService';
import { resolveDataUrl } from './contentOverrides';

type OlympiadBadge = 'national' | 'international';

export interface OlympiadItemEntry {
  id: string;
  year: number;
  title: string;
  badge: OlympiadBadge;
  source: string;
  duration: number;
  totalPoints: number;
  exerciseCount?: number;
  path: string;
}

export interface OlympiadManifest {
  classId: string;
  title: string;
  gradeLevel: string;
  years: number[];
  items: OlympiadItemEntry[];
}

interface OlympiadExercise {
  id: string;
  number: number;
  theme: string;
  points: number;
  topic: string;
  context?: string;
  questions: Array<{
    id: string;
    content: string;
    subQuestions?: Array<{ id: string; content: string; hint?: string; correction?: string }>;
  }>;
}

interface OlympiadPaper {
  id: string;
  title: string;
  year: number;
  classId: string;
  gradeLevel: string;
  badge: OlympiadBadge;
  source: string;
  duration: number;
  totalPoints: number;
  exercises: OlympiadExercise[];
}

const CACHE_TTL = 30 * 60_000;
const manifestCache = new Map<string, { data: OlympiadManifest; ts: number }>();
const paperCache = new Map<string, { data: OlympiadPaper; ts: number }>();

const olympiadDataPath: Record<string, string> = {
  '1ere-bac-sc-math': '1er-bac-sc-math',
  'tronc-commun-sc': 'tronc-commun-sc',
};

function resolveBasePath(classId: string) {
  return olympiadDataPath[classId] || classId;
}

function toDsShape(paper: OlympiadPaper): DsDevoirData {
  return {
    id: paper.id,
    title: paper.title,
    number: paper.year,
    version: paper.badge,
    semestre: 1,
    classId: paper.classId,
    duration: paper.duration,
    totalPoints: paper.totalPoints,
    exercises: paper.exercises,
  };
}

export const olympiadService = {
  isSupported(classId: string): boolean {
    return ['1ere-bac-sc-math', 'tronc-commun-sc'].includes(classId);
  },

  async loadManifest(classId: string): Promise<OlympiadManifest> {
    const key = `${classId}:manifest`;
    const cached = manifestCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const basePath = resolveBasePath(classId);
    const res = await fetch(await resolveDataUrl(`/data/${basePath}/olympiad/manifest.json`));
    if (!res.ok) throw new Error(`Olympiad manifest not found for ${classId}`);
    const data: OlympiadManifest = await res.json();
    if (!Array.isArray(data?.items)) throw new Error(`Invalid olympiad manifest for ${classId}`);
    manifestCache.set(key, { data, ts: Date.now() });
    return data;
  },

  async loadPaper(path: string): Promise<OlympiadPaper> {
    const cached = paperCache.get(path);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const fullPath = `/${path.replace(/^\//, '')}`;
    const res = await fetch(await resolveDataUrl(fullPath));
    if (!res.ok) throw new Error(`Olympiad paper not found: ${path}`);
    const data: OlympiadPaper = await res.json();
    if (!Array.isArray(data?.exercises)) throw new Error(`Invalid olympiad paper: ${path}`);
    paperCache.set(path, { data, ts: Date.now() });
    return data;
  },

  async loadAsSession(path: string): Promise<DsDevoirData> {
    const paper = await this.loadPaper(path);
    return toDsShape(paper);
  },
};
