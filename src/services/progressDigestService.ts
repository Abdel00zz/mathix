/**
 * Bilan de progression multi-axes — MathPlus
 *
 * Remplace les conseils génériques par une lecture chiffrée de ce que l'élève
 * a réellement fait, sur tous les axes du programme : cours, quiz, exercices,
 * concours, régularité et temps de travail.
 *
 * Deux principes :
 *  - **Aucun texte creux.** Chaque ligne cite un nombre issu de la
 *    progression réelle ; s'il n'y a rien à dire sur un axe, la ligne saute.
 *  - **Le delta prime.** On compare au dernier bilan émis : « +3 exercices,
 *    +6 pts de moyenne » informe, « 42 exercices » ne dit rien de l'effort
 *    fourni depuis la veille.
 *
 * La cadence (12 h / 24 h / 3 jours) vient des préférences de l'élève.
 */

import { ChapterProgress, NotificationPrefs } from '../types';
import { notificationService } from './notificationService';
import { minutesThisWeek } from './studyPlanService';

const SNAPSHOT_KEY = 'mathplus:digest-snapshot:v1';
const HOUR_MS = 3_600_000;

export interface DigestSnapshot {
  at: number;
  quizSubmitted: number;
  averageScore: number;
  exercisesDone: number;
  chaptersRevised: number;
  chaptersSubmitted: number;
  concoursSessions: number;
  studyMinutes: number;
}

export interface DigestInput {
  globalProgress: Record<string, ChapterProgress>;
  chapterTitles: Record<string, string>;
  totalChapters: number;
  totalExercises: number;
  concoursSessions?: number;
  weeklyGoalMin?: number;
}

const readSnapshot = (): DigestSnapshot | null => {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as DigestSnapshot) : null;
  } catch {
    return null;
  }
};

const writeSnapshot = (snapshot: DigestSnapshot): void => {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota — silencieux */
  }
};

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Photographie chiffrée de la progression, tous axes confondus. */
export function computeSnapshot(input: DigestInput): DigestSnapshot {
  const entries = Object.entries(input.globalProgress);
  const submitted = entries.filter(([, p]) => p.quiz?.isSubmitted);
  const averageScore = submitted.length > 0
    ? submitted.reduce((sum, [, p]) => sum + (p.quiz?.score || 0), 0) / submitted.length
    : 0;

  return {
    at: Date.now(),
    quizSubmitted: submitted.length,
    averageScore: Math.round(averageScore),
    exercisesDone: entries.reduce((sum, [, p]) => sum + Object.keys(p.exerciseFeedback || {}).length, 0),
    chaptersRevised: entries.filter(([, p]) => (p.revisionProgress || 0) >= 80).length,
    chaptersSubmitted: entries.filter(([, p]) => p.isChapterSubmitted).length,
    concoursSessions: input.concoursSessions || 0,
    studyMinutes: minutesThisWeek(),
  };
}

/**
 * Construit le texte du bilan. Renvoie `null` quand aucun axe n'a bougé et
 * qu'il n'y a donc rien à annoncer — mieux vaut le silence qu'un message vide.
 */
export function buildDigestBody(
  current: DigestSnapshot,
  previous: DigestSnapshot | null,
  input: DigestInput
): { title: string; body: string; priority: 'low' | 'normal' | 'high' } | null {
  const lines: string[] = [];
  const d = (key: keyof DigestSnapshot) =>
    previous ? (current[key] as number) - (previous[key] as number) : 0;

  const dQuiz = d('quizSubmitted');
  const dEx = d('exercisesDone');
  const dRev = d('chaptersRevised');
  const dSubmitted = d('chaptersSubmitted');
  const dConcours = d('concoursSessions');
  const dScore = previous ? current.averageScore - previous.averageScore : 0;

  // ── Axe cours ──
  if (dRev > 0) {
    lines.push(`Cours : ${dRev} chapitre${dRev > 1 ? 's' : ''} de plus révisé${dRev > 1 ? 's' : ''} (${current.chaptersRevised}/${input.totalChapters}).`);
  } else if (!previous && current.chaptersRevised > 0) {
    lines.push(`Cours : ${current.chaptersRevised}/${input.totalChapters} chapitres révisés.`);
  }

  // ── Axe quiz ──
  if (dQuiz > 0) {
    const trend = dScore !== 0 ? `, moyenne ${current.averageScore}% (${signed(dScore)} pts)` : `, moyenne ${current.averageScore}%`;
    lines.push(`Quiz : ${dQuiz} validé${dQuiz > 1 ? 's' : ''}${trend}.`);
  } else if (previous && dScore !== 0) {
    lines.push(`Quiz : moyenne ${current.averageScore}% (${signed(dScore)} pts).`);
  } else if (!previous && current.quizSubmitted > 0) {
    lines.push(`Quiz : ${current.quizSubmitted}/${input.totalChapters}, moyenne ${current.averageScore}%.`);
  }

  // ── Axe exercices ──
  if (dEx > 0) {
    const pct = input.totalExercises > 0 ? Math.round((current.exercisesDone / input.totalExercises) * 100) : 0;
    lines.push(`Exercices : ${dEx} traité${dEx > 1 ? 's' : ''} (${current.exercisesDone}/${input.totalExercises}, ${pct}%).`);
  }

  // ── Axe concours ──
  if (dConcours > 0) {
    lines.push(`Concours : ${dConcours} session${dConcours > 1 ? 's' : ''} d'entraînement de plus (${current.concoursSessions} au total).`);
  }

  // ── Axe validation ──
  if (dSubmitted > 0) {
    lines.push(`Chapitres soumis : ${signed(dSubmitted)} (${current.chaptersSubmitted}/${input.totalChapters}).`);
  }

  // ── Axe temps / objectif ──
  const goal = input.weeklyGoalMin || 0;
  if (goal > 0) {
    const pct = Math.min(100, Math.round((current.studyMinutes / goal) * 100));
    lines.push(`Objectif hebdomadaire : ${current.studyMinutes}/${goal} min (${pct}%).`);
  }

  // ── Points d'attention : chapitres lus mais mal évalués ──
  const fragile = Object.entries(input.globalProgress)
    .filter(([, p]) => p.quiz?.isSubmitted && (p.quiz?.score || 0) < 60)
    .map(([id]) => input.chapterTitles[id] || id);
  if (fragile.length > 0) {
    const shown = fragile.slice(0, 2).join(', ');
    const more = fragile.length > 2 ? ` +${fragile.length - 2}` : '';
    lines.push(`À reprendre : ${shown}${more} (quiz sous 60%).`);
  }

  if (lines.length === 0) return null;

  const moved = dQuiz + dEx + dRev + dConcours > 0;
  const title = !previous
    ? 'Votre point de départ'
    : moved
      ? 'Bilan de progression'
      : 'Bilan : aucune activité';

  if (!moved && previous) {
    lines.unshift('Rien de nouveau depuis le dernier bilan. Une séance courte vaut mieux qu\'une semaine blanche.');
  }

  return {
    title,
    body: lines.join('\n'),
    priority: fragile.length > 0 || !moved ? 'normal' : 'high',
  };
}

/**
 * Émet le bilan si la cadence est échue.
 * Renvoie `true` si un bilan a été émis.
 */
export function runDigest(input: DigestInput, prefs: NotificationPrefs, force = false): boolean {
  if (!prefs.enabled || !prefs.categories.digest) return false;

  const previous = readSnapshot();
  const dueAt = previous ? previous.at + prefs.digestHours * HOUR_MS : 0;
  if (!force && previous && Date.now() < dueAt) {
    return false;
  }

  const current = computeSnapshot(input);
  const digest = buildDigestBody(current, previous, input);
  writeSnapshot(current);

  if (!digest) return false;

  notificationService.create('progress', digest.title, digest.body, {
    priority: digest.priority,
    dedupKey: 'progress-digest',
    dedupWindowMs: prefs.digestHours * HOUR_MS,
  });
  return true;
}

/** Date du dernier bilan émis, pour l'affichage dans les paramètres. */
export function lastDigestAt(): number | null {
  return readSnapshot()?.at ?? null;
}
