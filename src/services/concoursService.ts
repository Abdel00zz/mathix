import { QuizQuestion } from '../types';
import { quizService } from './quizService';
import { resolveDataUrl } from './contentOverrides';
import { Rng, mulberry32 } from '../utils/prng';

// ============================================================================
// TYPES
// ============================================================================

interface SchoolAnnale {
  year: string;
  path: string;
  /** Nombre de questions (précalculé dans schools.json) — évite de télécharger
   *  le fichier juste pour afficher un compteur. */
  count?: number;
}

interface FallbackQuizPath {
  themeId: string;
  path: string;
}

interface SchoolTheme {
  id: string;
  name: string;
}

export interface School {
  id: string;
  name: string;
  fullName: string;
  color: string;
  icon: string;
  themes: SchoolTheme[];
  annales: SchoolAnnale[];
  fallbackQuizPaths?: FallbackQuizPath[];
  questionsPerExam: number;
  timePerQuestion: number;
  description: string;
  /** Comptages précalculés (schools.json) pour un rendu instantané du catalogue,
   *  sans télécharger les fichiers de questions. */
  themeCounts?: Record<string, number>;
  totalQuestions?: number;
}

export interface SchoolsData {
  schools: School[];
  sourceClass: string;
}

export interface ConcoursQuizConfig {
  schoolId: string;
  year?: string | null;
  themeId?: string | null;
  questionCount: number;
  timePerQuestion: number;
  /** Graine du tirage : un même seed reproduit exactement le même examen
   *  (questions, ordre, options) — support de la reprise de session. */
  seed?: number;
}

export interface TaggedQuestion extends QuizQuestion {
  sourceTheme: string;
  sourceYear?: string;
  theme?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Fisher-Yates shuffle — pure, returns new array */
function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Shuffle option order within each question (prevents positional bias) */
function shuffleOptions<T extends { options?: { id: string; text: string; isCorrect: boolean }[] }>(questions: T[], rng: Rng = Math.random): T[] {
  return questions.map(q => ({
    ...q,
    options: q.options ? shuffle(q.options, rng) : q.options,
  }));
}

/** Stratified sampling: pick questions evenly across themes, then fill remainder randomly */
function stratifiedSample(pool: TaggedQuestion[], count: number, rng: Rng = Math.random): TaggedQuestion[] {
  if (pool.length <= count) return shuffle(pool, rng);

  // Group by theme
  const byTheme = new Map<string, TaggedQuestion[]>();
  for (const q of pool) {
    const key = q.theme || q.sourceTheme || 'general';
    if (!byTheme.has(key)) byTheme.set(key, []);
    byTheme.get(key)!.push(q);
  }

  // Shuffle within each theme
  for (const [key, qs] of byTheme) {
    byTheme.set(key, shuffle(qs, rng));
  }

  const themes = [...byTheme.keys()];
  const perTheme = Math.floor(count / themes.length);
  const selected: TaggedQuestion[] = [];
  const used = new Set<string>();

  // Phase 1: take equal share from each theme
  for (const theme of themes) {
    const qs = byTheme.get(theme)!;
    const take = Math.min(perTheme, qs.length);
    for (let i = 0; i < take; i++) {
      selected.push(qs[i]);
      used.add(qs[i].id);
    }
  }

  // Phase 2: fill remaining slots from leftover pool (shuffled)
  if (selected.length < count) {
    const remaining = shuffle(pool.filter(q => !used.has(q.id)), rng);
    for (const q of remaining) {
      if (selected.length >= count) break;
      selected.push(q);
    }
  }

  return shuffle(selected, rng); // final shuffle to mix themes
}

// ============================================================================
// CACHE
// ============================================================================

let schoolsCache: SchoolsData | null = null;
const pathCache = new Map<string, QuizQuestion[]>();
const allQuestionsCache = new Map<string, TaggedQuestion[]>();

// ============================================================================
// SERVICE
// ============================================================================

export const concoursService = {
  async loadSchools(): Promise<SchoolsData> {
    if (schoolsCache) return schoolsCache;
    const res = await fetch(await resolveDataUrl('/data/concours/schools.json'));
    if (!res.ok) throw new Error('Failed to load schools data');
    const raw: SchoolsData = await res.json();
    for (const s of raw.schools) {
      s.annales = s.annales || [];
    }
    schoolsCache = raw;
    return schoolsCache;
  },

  async getSchool(schoolId: string): Promise<School | null> {
    const data = await this.loadSchools();
    return data.schools.find(s => s.id === schoolId) || null;
  },

  /** Load and parse questions from a JSON path (cached).
   *  Preserves `theme` and `category` from raw JSON onto parsed questions. */
  async loadQuizFromPath(path: string): Promise<QuizQuestion[]> {
    if (pathCache.has(path)) return pathCache.get(path)!;
    try {
      const fullPath = `/${path.replace(/^\//, '')}`;
      const res = await fetch(await resolveDataUrl(fullPath));
      if (!res.ok) { pathCache.set(path, []); return []; }
      const data = await res.json();
      const rawQuestions = data.questions || [];
      if (rawQuestions.length === 0) { pathCache.set(path, []); return []; }
      const parsed = rawQuestions
        .map((q: any) => {
          const p = quizService.parseQuestion(q);
          if (p && q.theme) (p as any).theme = q.theme;
          return p;
        })
        .filter(Boolean) as QuizQuestion[];
      pathCache.set(path, parsed);
      return parsed;
    } catch {
      pathCache.set(path, []);
      return [];
    }
  },

  /** Load ALL questions for a school: annales first, fallbackQuizPaths second. Cached.
   *  Annales are fetched in parallel for faster loading. */
  async loadAllQuestions(schoolId: string): Promise<TaggedQuestion[]> {
    if (allQuestionsCache.has(schoolId)) return allQuestionsCache.get(schoolId)!;

    const school = await this.getSchool(schoolId);
    if (!school) return [];

    const all: TaggedQuestion[] = [];
    const seenIds = new Set<string>();

    const addQ = (q: QuizQuestion, year?: string, fallbackTheme?: string) => {
      if (seenIds.has(q.id)) return;
      seenIds.add(q.id);
      const theme = (q as any).theme || fallbackTheme;
      all.push({
        ...q,
        sourceTheme: theme || 'general',
        sourceYear: year,
        theme,
      });
    };

    // 1. Primary: annales (year-based files) — loaded in parallel
    const annaleResults = await Promise.all(
      school.annales.map(async (annale) => ({
        year: annale.year,
        questions: await this.loadQuizFromPath(annale.path),
      }))
    );
    for (const { year, questions } of annaleResults) {
      questions.forEach(q => addQ(q, year));
    }

    // 2. Supplement: manifest/fallback quiz paths (add unique questions not already in annales)
    if (school.fallbackQuizPaths) {
      for (const fb of school.fallbackQuizPaths) {
        const questions = await this.loadQuizFromPath(fb.path);
        questions.forEach(q => addQ(q, undefined, fb.themeId));
      }
    }

    // 3. Load manifest quizzes if they exist (additional theme-quiz questions)
    try {
      const manifestPath = `data/concours/${school.id}/manifest.json`;
      const manifestRes = await fetch(await resolveDataUrl(`/${manifestPath}`));
      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        if (manifest.quizzes) {
          for (const quiz of manifest.quizzes) {
            const questions = await this.loadQuizFromPath(quiz.path);
            questions.forEach((q: QuizQuestion) => addQ(q, undefined, quiz.theme));
          }
        }
      }
    } catch { /* manifest optional */ }

    allQuestionsCache.set(schoolId, all);
    return all;
  },

  /** Build a concours exam: by year, by theme, or random (all).
   *  - Options within each question are shuffled to prevent positional bias.
   *  - Random mode uses stratified sampling for balanced theme representation.
   *  - Avec `config.seed`, le tirage est déterministe (reprise de session). */
  async buildExam(config: ConcoursQuizConfig): Promise<TaggedQuestion[]> {
    const rng: Rng = config.seed !== undefined ? mulberry32(config.seed) : Math.random;
    let pool: TaggedQuestion[];

    if (config.year) {
      const school = await this.getSchool(config.schoolId);
      if (!school) return [];
      const annale = school.annales.find(a => a.year === config.year);
      if (!annale) return [];
      const questions = await this.loadQuizFromPath(annale.path);
      pool = questions.map(q => ({
        ...q,
        sourceTheme: (q as any).theme || 'general',
        sourceYear: config.year!,
        theme: (q as any).theme,
      }));
    } else if (config.themeId) {
      const all = await this.loadAllQuestions(config.schoolId);
      pool = all.filter(q => q.theme === config.themeId || q.sourceTheme === config.themeId);
    } else {
      pool = await this.loadAllQuestions(config.schoolId);
    }

    // Use stratified sampling for random/full modes, simple shuffle for year/theme
    const selected = (!config.year && !config.themeId)
      ? stratifiedSample(pool, config.questionCount, rng)
      : shuffle(pool, rng).slice(0, config.questionCount);

    // Shuffle options within each question to prevent positional bias
    return shuffleOptions(selected, rng);
  },

  /** Compute per-theme breakdown from exam results */
  computeBreakdown(
    questions: TaggedQuestion[],
    results: Record<string, boolean>
  ): {
    byTheme: Record<string, { total: number; correct: number; pct: number }>;
    overall: { total: number; correct: number; pct: number };
  } {
    const byTheme: Record<string, { total: number; correct: number }> = {};
    let totalCorrect = 0;

    for (const q of questions) {
      const key = q.theme || q.sourceTheme || 'general';
      const isCorrect = results[q.id] || false;
      if (isCorrect) totalCorrect++;

      if (!byTheme[key]) byTheme[key] = { total: 0, correct: 0 };
      byTheme[key].total++;
      if (isCorrect) byTheme[key].correct++;
    }

    const withPct: Record<string, { total: number; correct: number; pct: number }> = {};
    for (const [k, v] of Object.entries(byTheme)) {
      withPct[k] = { ...v, pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0 };
    }

    return {
      byTheme: withPct,
      overall: {
        total: questions.length,
        correct: totalCorrect,
        pct: questions.length > 0 ? Math.round((totalCorrect / questions.length) * 100) : 0,
      },
    };
  },
};
