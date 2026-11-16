import type { ArchivedSessionSummary, ClassStudentProgress, SessionState } from '../../../services/professorClassroomService';

export const STATUS_META: Record<SessionState['status'], { label: string; tone: string; dot: string }> = {
  idle: { label: 'Prête', tone: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  running: { label: 'En cours', tone: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  paused: { label: 'En pause', tone: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  stopped: { label: 'Terminée', tone: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export function relativeTime(timestamp: number): string {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`;
  return `il y a ${Math.floor(diff / 86_400_000)} j`;
}

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

export function shouldStartNewSession(
  currentStatus: SessionState['status'],
  requestedStatus: SessionState['status'],
): boolean {
  return requestedStatus === 'running'
    && (currentStatus === 'idle' || currentStatus === 'stopped');
}

/**
 * Niveau que la tablette du professeur doit afficher.
 *
 * Une séance vivante retient la tablette sur sa propre classe : son archive
 * (présents, chapitre, activité) y est rattachée, et le serveur refuse d'ailleurs
 * de la déplacer. Séance à l'arrêt, c'est la classe pilotée depuis le PC qui
 * gagne, puis la dernière classe de séance connue, puis celle du compte.
 */
export function resolvePilotedClassId(input: {
  status: SessionState['status'];
  sessionClassId: string;
  focusClassId: string;
  accountClassId: string;
}): string {
  const { status, sessionClassId, focusClassId, accountClassId } = input;
  const sessionIsLive = status === 'running' || status === 'paused';
  if (sessionIsLive && sessionClassId) return sessionClassId;
  return focusClassId || sessionClassId || accountClassId;
}

export function toLocalInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function nextFullHour(): number {
  const date = new Date(); date.setMinutes(0, 0, 0); return date.getTime() + 3_600_000;
}

export function formatSlot(timestamp: number): string {
  return new Date(timestamp).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp); const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (target === start) return "Aujourd'hui";
  if (target === start - 86_400_000) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function formatDuration(startedAt: number, endedAt: number): string {
  const minutes = Math.max(0, Math.round((endedAt - startedAt) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function sortSessionArchives(entries: ArchivedSessionSummary[]): ArchivedSessionSummary[] {
  return [...entries].sort((a, b) => b.startedAt - a.startedAt);
}

export function countPresentStudents(students: ClassStudentProgress[], presentIds: Set<string>): number {
  return students.filter(student => presentIds.has(student.accountId)).length;
}

/**
 * Ordre alphabétique stable pour la liste d'appel.
 *
 * L'ordre ne dépend volontairement pas des présences : pendant l'appel, cocher
 * un élève ne doit jamais déplacer sa ligne sous le curseur du professeur.
 */
export function sortStudentsByName(students: ClassStudentProgress[]): ClassStudentProgress[] {
  return [...students].sort((first, second) => first.name.localeCompare(second.name, 'fr'));
}

export function sessionActivitySummary(session: SessionState) {
  const activity = session.activity;
  const position = activity?.position;
  const activityTypeLabel = position
    ? (position.type === 'exercise' ? 'Exercices' : position.type === 'quiz' ? 'Quiz' : 'Révision')
    : '—';
  const annotatedZones = activity ? Object.keys(activity.strokes || {}).length : 0;
  const quizAnsweredCount = activity?.quiz?.history?.length ?? 0;
  const revisionParagraph = activity?.revision?.paragraph
    || (position?.type === 'revision' ? (position.label || '') : '')
    || '—';
  const positionLabel = !position ? '—'
    : position.type === 'exercise' ? `Exercice ${position.index ?? '?'}/${position.count ?? '?'}`
    : position.type === 'quiz' ? `Question ${position.index ?? '?'}/${position.count ?? '?'}`
    : revisionParagraph !== '—' ? `Paragraphe : ${revisionParagraph}`
    : 'Révision en cours';
  const hasActivity = Boolean(activity?.exerciseIds?.length || quizAnsweredCount || annotatedZones);
  const activityCountsLabel = hasActivity
    ? `${activity?.exerciseIds?.length ?? 0} exercice(s) ouvert(s) · ${quizAnsweredCount} question(s) quiz · ${annotatedZones} zone(s) annotée(s)`
    : '—';

  return { position, activityTypeLabel, positionLabel, activityCountsLabel };
}
