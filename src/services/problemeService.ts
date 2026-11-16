// ============================================================================
// PROBLÈME SERVICE — Problèmes mathématiques enrichis (format Révision)
// ============================================================================

import { resolveDataUrl } from './contentOverrides';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ProblemeEntry {
  id: string;
  title: string;          // "Avez-vous les mêmes empreintes qu'un autre ?"
  subtitle?: string;      // "Problème 2.1 — Empreintes digitales"
  theme: string;          // "Dénombrement", "Probabilités"...
  difficulty?: 'facile' | 'moyen' | 'difficile';
  path: string;           // Chemin vers le JSON RevisionSheet
}

interface ProblemeTheme {
  id: string;
  name: string;
  count?: number;
}

export interface ProblemeIndex {
  classId: string;
  title: string;
  themes: ProblemeTheme[];
  problemes: ProblemeEntry[];
}

// ── Cache ───────────────────────────────────────────────────────────────────

const indexCache = new Map<string, { data: ProblemeIndex; ts: number }>();
const CACHE_TTL = 30 * 60_000; // 30 minutes

// ── Service ─────────────────────────────────────────────────────────────────

export const problemeService = {

  /** Check if a class supports Problèmes */
  isSupported(classId: string): boolean {
    return ['tronc-commun-sc', '1ere-bac-sc-math', '2eme-bac-sc-math'].includes(classId);
  },

  /** Load the Problème index for a class */
  async loadIndex(classId: string): Promise<ProblemeIndex> {
    const cached = indexCache.get(classId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    const res = await fetch(await resolveDataUrl(`/data/${classId}/problemes/index.json`));
    if (!res.ok) throw new Error(`Problème index not found for ${classId}`);
    const data: ProblemeIndex = await res.json();
    if (!Array.isArray(data?.problemes)) throw new Error(`Invalid Problème index for ${classId}`);
    indexCache.set(classId, { data, ts: Date.now() });
    return data;
  },

  /** Get problèmes filtered by theme */
  getByTheme(index: ProblemeIndex, themeId: string): ProblemeEntry[] {
    if (themeId === 'all') return index.problemes;
    return index.problemes.filter(p => p.theme === themeId);
  },
};
