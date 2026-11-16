// ============================================================================
// EXAMEN SERVICE — National exams with random exam generation
// ============================================================================

import { resolveDataUrl } from './contentOverrides';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExamenTheme {
  id: string;
  name: string;
}

export interface ExamenIndexEntry {
  id: string;
  title: string;
  type: 'national';
  year: number;
  session?: string;
  region?: string;
  path: string;
  exerciseCount?: number;
}

export interface ExamenIndex {
  classId: string;
  title: string;
  themeDistribution: Record<string, number>;
  themes: ExamenTheme[];
  examens: ExamenIndexEntry[];
}

export type DifficultyLevel = 'facile' | 'moyen' | 'difficile';

const DIFFICULTY_RANK: Record<string, number> = { facile: 1, moyen: 2, difficile: 3 };

export interface ExamenExercise {
  id: string;
  number: number;
  theme: string;
  difficulty: DifficultyLevel;
  points: number;
  topic: string;
  context?: string;
  questions: ExamenQuestion[];
  /** Year of the source examen (propagated from ExamenData when building thematic/random exams) */
  examenYear?: number;
  /** Session of the source examen (propagated from ExamenData when building thematic/random exams) */
  examenSession?: string;
}

interface ExamenQuestion {
  id: string;
  type?: string;
  content: string;
  bareme?: number;
  hint?: string;
  subQuestions?: ExamenSubQuestion[];
}

interface ExamenSubQuestion {
  id: string;
  content: string;
  bareme?: number;
  hint?: string;
  correction?: string;
  subQuestions?: ExamenSubQuestion[];
}

export interface ExamenData {
  id: string;
  title: string;
  type: 'national';
  year: number;
  session?: string;
  region?: string;
  classId: string;
  duration: number; // minutes
  coefficient?: number;
  totalPoints: number;
  exercises: ExamenExercise[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ── Cache ───────────────────────────────────────────────────────────────────

const indexCache = new Map<string, { data: ExamenIndex; ts: number }>();
const examenCache = new Map<string, { data: ExamenData; ts: number }>();
const CACHE_TTL = 30 * 60_000; // 30 minutes

// ── ExamenExercise → Exercise converter ─────────────────────────────────────

import { Exercise, SubQuestion } from '../types';

function convertSubQuestions(sqs?: ExamenSubQuestion[]): SubQuestion[] | undefined {
  if (!sqs || sqs.length === 0) return undefined;
  return sqs.map(sq => ({
    id: sq.id,
    content: sq.content,
    hint: sq.hint,
    correction: sq.correction,
    bareme: sq.bareme,
    subQuestions: convertSubQuestions(sq.subQuestions),
  }));
}

/** Convert ExamenData exercises to the Exercise[] type used by ExerciseSessionView */
export function toExercises(examen: ExamenData): Exercise[] {
  return examen.exercises.map(ex => ({
    id: ex.id,
    chapterId: examen.id,
    topic: ex.topic,
    context: ex.context,
    examenYear: ex.examenYear ?? examen.year,
    examenSession: ex.examenSession ?? (examen.session
      ? (examen.session.toLowerCase() === 'rattrapage' ? 'Rattrapage' : 'Normale')
      : 'Normale'),
    questions: ex.questions.map(q => ({
      id: q.id,
      type: q.type,
      content: q.content,
      hint: q.hint,
      subQuestions: convertSubQuestions(q.subQuestions),
    })),
  }));
}

// ── Service ─────────────────────────────────────────────────────────────────

export const examenService = {

  /** Check if a class supports examens */
  isSupported(classId: string): boolean {
    return classId === '2eme-bac-sc-ex' || classId === '2eme-bac-sc-math';
  },

  /** Load the examen index for a class */
  async loadIndex(classId: string): Promise<ExamenIndex> {
    const cached = indexCache.get(classId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    const res = await fetch(await resolveDataUrl(`/data/${classId}/examen/index.json`));
    if (!res.ok) throw new Error(`Examen index not found for ${classId}`);
    const data: ExamenIndex = await res.json();
    if (!Array.isArray(data?.examens)) throw new Error(`Invalid examen index for ${classId}`);
    indexCache.set(classId, { data, ts: Date.now() });
    return data;
  },

  /** Load a specific examen by path */
  async loadExamen(path: string): Promise<ExamenData> {
    const cached = examenCache.get(path);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    const fullPath = `/${path.replace(/^\//, '')}`;
    const res = await fetch(await resolveDataUrl(fullPath));
    if (!res.ok) throw new Error(`Examen not found: ${path}`);
    const data: ExamenData = await res.json();
    if (!Array.isArray(data?.exercises)) throw new Error(`Invalid examen data: ${path}`);
    examenCache.set(path, { data, ts: Date.now() });
    return data;
  },

  /** Load all examens for a class (all paths in parallel) */
  async loadAllExamens(classId: string): Promise<ExamenData[]> {
    const index = await this.loadIndex(classId);
    const results = await Promise.all(
      index.examens.map(e => this.loadExamen(e.path).catch(() => null))
    );
    return results.filter(Boolean) as ExamenData[];
  },

  /** Get all exercises from all examens, tagged with source */
  async getAllExercises(classId: string): Promise<(ExamenExercise & { sourceExamenId: string; sourceType: string })[]> {
    const examens = await this.loadAllExamens(classId);
    const all: (ExamenExercise & { sourceExamenId: string; sourceType: string })[] = [];
    for (const ex of examens) {
      for (const exercise of ex.exercises) {
        all.push({ ...exercise, sourceExamenId: ex.id, sourceType: ex.type,
          examenYear: ex.year,
          examenSession: ex.session?.toLowerCase() === 'rattrapage' ? 'Rattrapage' : 'Normale',
        });
      }
    }
    return all;
  },

  /** Get exercises filtered by theme */
  async getExercisesByTheme(classId: string, themeId: string): Promise<(ExamenExercise & { sourceExamenId: string })[]> {
    const all = await this.getAllExercises(classId);
    return all.filter(e => e.theme === themeId);
  },

  /** Get available years */
  async getYears(classId: string): Promise<number[]> {
    const index = await this.loadIndex(classId);
    const yearSet = new Set<number>();
    for (const e of index.examens) yearSet.add(e.year);
    return Array.from(yearSet).sort((a, b) => b - a);
  },

  /** Get examens grouped by type */
  async getExamensByType(classId: string): Promise<{ national: ExamenIndexEntry[] }> {
    const index = await this.loadIndex(classId);
    return {
      national: index.examens.filter(e => e.type === 'national'),
    };
  },

  /** Get theme stats across all examens */
  async getThemeStats(classId: string): Promise<Record<string, { count: number; avgDifficulty: number; distribution: Record<DifficultyLevel, number> }>> {
    const all = await this.getAllExercises(classId);
    const stats: Record<string, { count: number; totalRank: number; distribution: Record<string, number> }> = {};
    for (const ex of all) {
      if (!stats[ex.theme]) stats[ex.theme] = { count: 0, totalRank: 0, distribution: { facile: 0, moyen: 0, difficile: 0 } };
      stats[ex.theme].count++;
      stats[ex.theme].totalRank += DIFFICULTY_RANK[ex.difficulty] || 2;
      stats[ex.theme].distribution[ex.difficulty] = (stats[ex.theme].distribution[ex.difficulty] || 0) + 1;
    }
    const result: Record<string, { count: number; avgDifficulty: number; distribution: Record<DifficultyLevel, number> }> = {};
    for (const [k, v] of Object.entries(stats)) {
      result[k] = {
        count: v.count,
        avgDifficulty: Math.round((v.totalRank / v.count) * 10) / 10,
        distribution: v.distribution as Record<DifficultyLevel, number>,
      };
    }
    return result;
  },

  /**
   * Build a random exam by selecting exercises according to the class's theme distribution.
   * For 2eme bac sc exp: 1 analyse + 1 probabilités + 1 nombres complexes + 1 géométrie espace
   * For 2eme bac sc math: 1 analyse + 1 probabilités + 1 nombres complexes + 1 géométrie espace + 1 arithmétique
   * Difficulty filter is optional (facile/moyen/difficile): prioritizes matching exercises.
   */
  async buildRandomExam(classId: string, difficulty?: DifficultyLevel): Promise<ExamenData> {
    const index = await this.loadIndex(classId);
    const allExercises = await this.getAllExercises(classId);

    const distribution = index.themeDistribution;
    type TaggedExercise = ExamenExercise & { sourceExamenId: string; sourceType: string };
    const selected: TaggedExercise[] = [];

    // For each theme in the distribution, pick the required number of exercises
    for (const [theme, count] of Object.entries(distribution)) {
      let pool = allExercises.filter(e => e.theme === theme);

      if (pool.length === 0) continue;

      // Sort by distance to target difficulty if specified
      if (difficulty) {
        const targetRank = DIFFICULTY_RANK[difficulty] || 2;
        pool.sort((a, b) =>
          Math.abs((DIFFICULTY_RANK[a.difficulty] || 2) - targetRank) -
          Math.abs((DIFFICULTY_RANK[b.difficulty] || 2) - targetRank)
        );
      } else {
        pool = shuffle(pool);
      }

      // Pick 'count' exercises, ensuring variety (different source examens when possible)
      const usedSources = new Set<string>();
      const picked: typeof pool = [];

      for (const ex of pool) {
        if (picked.length >= count) break;
        if (!usedSources.has(ex.sourceExamenId)) {
          picked.push(ex);
          usedSources.add(ex.sourceExamenId);
        }
      }

      // If not enough unique sources, fill from remaining
      if (picked.length < count) {
        for (const ex of pool) {
          if (picked.length >= count) break;
          if (!picked.some(p => p.id === ex.id)) {
            picked.push(ex);
          }
        }
      }

      selected.push(...picked);
    }

    if (selected.length === 0) {
      throw new Error('Aucun exercice disponible pour générer un examen aléatoire');
    }

    // Renumber exercises and clean service fields
    const cleanExercises: ExamenExercise[] = selected.map((ex, i) => {
      const { sourceExamenId: _sourceExamenId, sourceType: _sourceType, ...rest } = ex;
      return { ...rest, number: i + 1 };
    });

    const diffLabel = difficulty ? { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' }[difficulty] : '';

    return {
      id: `random-${Date.now()}`,
      title: `Examen Aléatoire${diffLabel ? ` — ${diffLabel}` : ''}`,
      type: 'national',
      year: new Date().getFullYear(),
      classId,
      duration: classId === '2eme-bac-sc-math' ? 240 : 180,
      totalPoints: cleanExercises.reduce((s, e) => s + e.points, 0),
      exercises: cleanExercises,
    };
  },
};
