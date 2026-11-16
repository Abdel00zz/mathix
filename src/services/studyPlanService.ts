/**
 * Planning de travail hebdomadaire — MathPlus
 *
 * L'élève déclare ses créneaux (jour, heure de début, durée) ; le service en
 * déduit les échéances de notification des 7 prochains jours. Le journal de
 * travail (minutes réellement travaillées) alimente les bilans hebdomadaires.
 */

import { StudyPlan, StudySlot } from '../types';
import { DEFAULT_STUDY_PLAN } from '../utils/constants';

const LOG_KEY = 'mathplus:study-log:v1';
const LAST_TOTAL_KEY = 'mathplus:study-log:last-total';
const DAY_MS = 86_400_000;

/** Une séance effectuée, indexée par jour ISO (`2026-07-30`). */
interface StudyLogEntry {
  date: string;
  minutes: number;
}

const toIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Identifiant stable d'un créneau — jour + heure suffisent à le distinguer. */
const slotKey = (day: number, start: string) => `sl-${day}-${start.replace(':', '')}`;

/**
 * Complète un planning enregistré.
 *
 * Un jour peut porter **plusieurs créneaux** (matin et soir). On conserve donc
 * la liste telle quelle plutôt que de la réduire à sept entrées, en garantissant
 * seulement trois choses : chaque jour de la semaine existe au moins une fois
 * (pour que l'interface puisse l'activer), chaque créneau a un identifiant
 * stable, et l'ordre de lecture suit le calendrier.
 */
export function normalizePlan(plan?: Partial<StudyPlan> | null): StudyPlan {
  const base = DEFAULT_STUDY_PLAN as unknown as StudyPlan;
  const source = plan?.slots?.length ? plan.slots : base.slots;

  const seen = new Set<string>();
  const slots: StudySlot[] = [];
  for (const s of source) {
    const day = Number(s.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const start = typeof s.start === 'string' && /^\d{1,2}:\d{2}$/.test(s.start) ? s.start : '18:00';
    const key = slotKey(day, start);
    // Deux créneaux au même jour et à la même heure sont un doublon, pas une
    // seconde séance : on garde le premier.
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({
      id: key,
      day,
      enabled: s.enabled ?? true,
      start,
      durationMin: Math.min(300, Math.max(15, Number(s.durationMin) || 60)),
      focus: s.focus,
    });
  }

  // Chaque jour doit exister, même vide : sans cela l'en-tête du calendrier
  // n'aurait rien à activer pour un jour jamais renseigné.
  for (let day = 0; day < 7; day++) {
    if (slots.some(s => s.day === day)) continue;
    const fallback = base.slots.find(s => s.day === day);
    const start = fallback?.start ?? '18:00';
    slots.push({
      id: slotKey(day, start),
      day,
      enabled: false,
      start,
      durationMin: fallback?.durationMin ?? 60,
    });
  }

  slots.sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start));

  return {
    enabled: plan?.enabled ?? base.enabled,
    slots,
    weeklyGoalMin: plan?.weeklyGoalMin ?? base.weeklyGoalMin,
  };
}

// ---------- JOURNAL DES SÉANCES ----------

function readStudyLog(): StudyLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as StudyLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Ajoute des minutes travaillées au jour courant (cumulatif). */
function logStudyMinutes(minutes: number, when: Date = new Date()): void {
  if (minutes <= 0) return;
  const day = toIsoDay(when);
  const log = readStudyLog();
  const existing = log.find(e => e.date === day);
  if (existing) existing.minutes += minutes;
  else log.push({ date: day, minutes });

  // 90 jours d'historique suffisent aux bilans hebdomadaires.
  const cutoff = toIsoDay(new Date(Date.now() - 90 * DAY_MS));
  const trimmed = log.filter(e => e.date >= cutoff);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota — silencieux */
  }
}

/**
 * Alimente le journal à partir du compteur de temps cumulé de l'application.
 *
 * On ne stocke que la part déjà convertie en minutes : les secondes restantes
 * sont reportées à l'appel suivant, sinon un aller-retour toutes les 50 s
 * ferait disparaître tout le temps passé.
 */
export function syncStudyMinutesFromTotal(totalSeconds: number): void {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return;
  const raw = localStorage.getItem(LAST_TOTAL_KEY);
  const previous = raw === null ? null : Number(raw);

  if (previous === null || !Number.isFinite(previous) || previous > totalSeconds) {
    // Première mesure (ou compteur réinitialisé) : on cale la référence sans
    // attribuer rétroactivement des heures au jour courant.
    try { localStorage.setItem(LAST_TOTAL_KEY, String(totalSeconds)); } catch { /* quota */ }
    return;
  }

  const minutes = Math.floor((totalSeconds - previous) / 60);
  if (minutes <= 0) return;
  logStudyMinutes(minutes);
  try { localStorage.setItem(LAST_TOTAL_KEY, String(previous + minutes * 60)); } catch { /* quota */ }
}

/** Minutes travaillées depuis lundi 00:00. */
export function minutesThisWeek(now: Date = new Date()): number {
  const dayOfWeek = (now.getDay() + 6) % 7; // lundi = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const mondayIso = toIsoDay(monday);
  return readStudyLog()
    .filter(e => e.date >= mondayIso)
    .reduce((sum, e) => sum + e.minutes, 0);
}
