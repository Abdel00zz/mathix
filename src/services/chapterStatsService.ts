import { contentService } from './contentService';
import { getContentOverrideCacheToken } from './contentOverrides';
import { quizService } from './quizService';

// ============================================================================
// TYPES
// ============================================================================

export interface ChapterStatEntry {
  quizCount: number;
  exerciseCount: number;
  hasRevision: boolean;
}

// ============================================================================
// CACHE CONFIG
// ============================================================================

const CACHE_PREFIX = 'mathplus_chstats_v2';

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Provides per-chapter stats (quizCount, exerciseCount, hasRevision) with
 * version-aware caching. Counts quiz questions from the real quiz files when
 * rebuilding the cache, then reuses that cache on later dashboard loads.
 *
 * Cache strategy:
 *   key = `mathplus_chstats_v2_<classId>_<manifestVersion>`
 *   → auto-invalidated when root manifest version bumps (content update)
 *   → stale keys from previous versions are pruned automatically
 */
export const chapterStatsService = {

  /**
   * Fetch chapter stats for a class.
   * Hits localStorage cache first (versioned); derives from classData on miss.
   * Falls back to actual quiz-JSON fetch only for chapters missing quizCount.
   */
  async getStats(classId: string): Promise<Record<string, ChapterStatEntry>> {
    const version = await this._manifestVersion();
    const cacheKey = `${CACHE_PREFIX}_${classId}_${version}`;

    // ── 1. Fast path: versioned localStorage hit ──────────────────────────
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupted entry — proceed to rebuild */ }

    // ── 2. Derive from classData (no quiz-JSON fetch for most chapters) ───
    const classData = await contentService.fetchClassDetails(classId);
    if (!classData) return {};

    const stats: Record<string, ChapterStatEntry> = {};

    // Chapters that need a real quiz-JSON fetch (quizCount absent or 0)
    const needsFetch: typeof classData.chapters = [];
    const resolvedQuizCounts = await Promise.all(
      classData.chapters.map((ch) => this._resolveQuizCount(classId, ch))
    );

    for (const [index, ch] of classData.chapters.entries()) {
      const hasRevision = (ch.revisions?.length ?? 0) > 0;
      const quizCount = resolvedQuizCounts[index] ?? 0;
      const exerciseCount = this._countExercisesFromManifest(ch);

      if (quizCount > 0) {
        stats[ch.id] = { quizCount, exerciseCount, hasRevision };
      } else {
        // Mark for deferred fetch — keeps the happy-path instant
        stats[ch.id] = { quizCount: 0, exerciseCount, hasRevision };
        needsFetch.push(ch);
      }
    }

    // ── 3. Fallback: fetch quiz-JSON only for chapters with missing count ──
    if (needsFetch.length > 0) {
      const fetched = await Promise.all(
        needsFetch.map(async (ch) => {
          try {
            const qs = await quizService.getQuiz(classId, ch.id);
            return { id: ch.id, count: qs?.length || 0 };
          } catch {
            return { id: ch.id, count: 0 };
          }
        })
      );
      for (const { id, count } of fetched) {
        if (stats[id]) stats[id].quizCount = count;
      }
    }

    // ── 4. Persist with version key + prune stale entries ─────────────────
    try {
      localStorage.setItem(cacheKey, JSON.stringify(stats));
      this._pruneStale(classId, version);
    } catch { /* quota exceeded — ignore */ }

    return stats;
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Derive exercise count from chapter manifest exercises array (no fetch). */
  _countExercisesFromManifest(ch: any): number {
    // classData chapters may carry an exercises array (from manifest enrichment)
    if (Array.isArray(ch.exercises)) return ch.exercises.length;
    return 0;
  },

  async _resolveQuizCount(classId: string, ch: any): Promise<number> {
    const declaredCount = Number(ch.quizCount || 0);
    if (declaredCount > 0) return declaredCount;

    const quizRefs = Array.isArray(ch.quizzes) ? ch.quizzes : [];

    if (quizRefs.length > 0) {
      try {
        // L'interface élève ouvre le quiz principal (première référence).
        // Ne pas télécharger tous les quiz secondaires uniquement pour un badge.
        const questions = await quizService.getQuiz(classId, ch.id, quizRefs[0]?.path);
        if (questions.length > 0) return questions.length;
      } catch {
        // Repli sur zéro ci-dessous.
      }
    }

    return 0;
  },

  async _manifestVersion(): Promise<string> {
    let rootVersion = 'v0';
    try {
      const root = await contentService.fetchRootManifest();
      const meta = (root as any).meta;
      // Combine version + lastUpdated for a granular cache key
      if (meta?.version && meta?.lastUpdated) rootVersion = `${meta.version}-${meta.lastUpdated}`;
      else if (meta?.version) rootVersion = meta.version;
    } catch { /* ignore */ }
    return `${rootVersion}-${getContentOverrideCacheToken()}`;
  },

  /** Invalide les statistiques après une publication de catalogue ou de quiz. */
  clearCache(classId?: string): void {
    const prefix = classId ? `${CACHE_PREFIX}_${classId}_` : `${CACHE_PREFIX}_`;
    const toRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) toRemove.push(key);
    }
    toRemove.forEach(key => localStorage.removeItem(key));
  },

  /** Remove localStorage entries from previous manifest versions. */
  _pruneStale(classId: string, currentVersion: string): void {
    const prefix = `${CACHE_PREFIX}_${classId}_`;
    const currentKey = `${prefix}${currentVersion}`;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && key !== currentKey) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  },
};
