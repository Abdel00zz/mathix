/**
 * Historique local des sessions de concours (annales, thèmes, simulations).
 *
 * Alimente les statistiques personnelles du hub concours : meilleur score par
 * école, nombre d'essais et record par session, et détection du thème le plus
 * fragile pour orienter l'entraînement.
 *
 * Stockage : localStorage (`mathplus_concours_progress`) + synchronisation
 * cloud best-effort via /api/progress?action=concours.
 */

const STORAGE_KEY = 'mathplus_concours_progress';
const MAX_ATTEMPTS = 60;
/** Minimum de questions vues sur un thème avant de le juger « fragile ». */
const WEAK_THEME_MIN_QUESTIONS = 5;

interface ConcoursThemeScore {
  correct: number;
  total: number;
  pct: number;
}

export interface ConcoursAttempt {
  schoolId: string;
  /** Identifiant de session du catalogue : `annale-2023`, `theme-analyse`, `random-all`. */
  itemId: string;
  label: string;
  pct: number;
  correct: number;
  total: number;
  date: number;
  byTheme?: Record<string, ConcoursThemeScore>;
}

export interface ConcoursProgress {
  totalExams: number;
  bestScores: Record<string, number>;
  lastPlayed: number;
  attempts: ConcoursAttempt[];
}

interface ConcoursItemStats {
  best: number;
  last: number;
  count: number;
}

export interface ConcoursSchoolStats {
  sessions: number;
  best: number;
  last: ConcoursAttempt | null;
  byItem: Record<string, ConcoursItemStats>;
  weakestTheme: { themeId: string; pct: number; total: number } | null;
}

const EMPTY: ConcoursProgress = { totalExams: 0, bestScores: {}, lastPlayed: 0, attempts: [] };

function loadConcoursProgress(): ConcoursProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      totalExams: typeof parsed.totalExams === 'number' ? parsed.totalExams : 0,
      bestScores: parsed.bestScores && typeof parsed.bestScores === 'object' ? parsed.bestScores : {},
      lastPlayed: typeof parsed.lastPlayed === 'number' ? parsed.lastPlayed : 0,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Lecture seule de l'historique concours (bilan de progression, statistiques). */
export function getConcoursProgress(): ConcoursProgress {
  return loadConcoursProgress();
}

export function recordConcoursAttempt(attempt: ConcoursAttempt): ConcoursProgress {
  const progress = loadConcoursProgress();
  progress.totalExams += 1;
  progress.lastPlayed = attempt.date;
  if (attempt.pct > (progress.bestScores[attempt.schoolId] || 0)) {
    progress.bestScores[attempt.schoolId] = attempt.pct;
  }
  progress.attempts = [...progress.attempts, attempt].slice(-MAX_ATTEMPTS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Stockage plein : les stats de la session courante restent en mémoire
  }

  const phone = localStorage.getItem('mathplus:phone');
  const classId = localStorage.getItem('mathplus:class-id');
  if (phone && classId) {
    fetch('/api/progress?action=concours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, classId, concoursProgress: progress }),
    }).catch(() => {});
  }

  return progress;
}

/**
 * Moyennes par thème sur l'historique d'une école.
 * Sert de référence « avant » pour afficher la progression d'un nouvel essai
 * (delta par thème dans la modale de résultats) : à appeler AVANT
 * l'enregistrement de l'essai courant.
 */
export function getThemeAverages(schoolId: string): Record<string, { pct: number; total: number }> {
  const { attempts } = loadConcoursProgress();
  const agg: Record<string, { correct: number; total: number }> = {};
  for (const attempt of attempts) {
    if (attempt.schoolId !== schoolId || !attempt.byTheme) continue;
    for (const [themeId, score] of Object.entries(attempt.byTheme)) {
      const a = agg[themeId] || (agg[themeId] = { correct: 0, total: 0 });
      a.correct += score.correct;
      a.total += score.total;
    }
  }
  const out: Record<string, { pct: number; total: number }> = {};
  for (const [themeId, a] of Object.entries(agg)) {
    if (a.total > 0) out[themeId] = { pct: Math.round((100 * a.correct) / a.total), total: a.total };
  }
  return out;
}

export function getSchoolStats(schoolId: string): ConcoursSchoolStats {
  const { attempts, bestScores } = loadConcoursProgress();
  const mine = attempts.filter(a => a.schoolId === schoolId);

  const byItem: Record<string, ConcoursItemStats> = {};
  const themeAgg: Record<string, { correct: number; total: number }> = {};

  for (const attempt of mine) {
    const item = byItem[attempt.itemId] || (byItem[attempt.itemId] = { best: 0, last: 0, count: 0 });
    item.count += 1;
    item.last = attempt.pct;
    if (attempt.pct > item.best) item.best = attempt.pct;

    if (attempt.byTheme) {
      for (const [themeId, score] of Object.entries(attempt.byTheme)) {
        const agg = themeAgg[themeId] || (themeAgg[themeId] = { correct: 0, total: 0 });
        agg.correct += score.correct;
        agg.total += score.total;
      }
    }
  }

  let weakestTheme: ConcoursSchoolStats['weakestTheme'] = null;
  for (const [themeId, agg] of Object.entries(themeAgg)) {
    if (agg.total < WEAK_THEME_MIN_QUESTIONS) continue;
    const pct = Math.round((100 * agg.correct) / agg.total);
    if (!weakestTheme || pct < weakestTheme.pct) {
      weakestTheme = { themeId, pct, total: agg.total };
    }
  }

  return {
    sessions: mine.length,
    best: bestScores[schoolId] || 0,
    last: mine[mine.length - 1] || null,
    byItem,
    weakestTheme,
  };
}
