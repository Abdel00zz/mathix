import type { SessionState } from './professorClassroomService';

export interface SessionStateUpdate {
  status?: SessionState['status'];
  chapterId?: string;
  chapterTitle?: string;
  /** À fournir uniquement lors d’un choix explicite de classe. */
  classId?: string;
}

/**
 * Sérialise une mutation de séance sans compléter implicitement sa classe.
 * Les commandes Pause/Reprendre/Arrêter transmettent ainsi le seul statut.
 */
export function serializeSessionStateUpdate(update: SessionStateUpdate): string {
  const body: SessionStateUpdate = {};
  if (update.status !== undefined) body.status = update.status;
  if (update.chapterId !== undefined) body.chapterId = update.chapterId;
  if (update.chapterTitle !== undefined) body.chapterTitle = update.chapterTitle;
  if (update.classId !== undefined) body.classId = update.classId;
  return JSON.stringify(body);
}

/** Démarre explicitement une nouvelle séance dans la classe choisie. */
export function serializeSessionStart(classId: string): string {
  return serializeSessionStateUpdate({ status: 'running', classId });
}

/**
 * Publie la classe pilotée depuis la console PC.
 *
 * Le corps ne porte que la classe : l'action `session-focus` n'écrit jamais le
 * record de séance, elle ne peut donc ni entrer en conflit avec une séance en
 * cours ni réinitialiser son chapitre.
 */
export function serializeSessionFocus(classId: string): string {
  return JSON.stringify({ classId });
}

/** La lecture cible toujours la séance active stockée côté professeur. */
export function serializeSessionStateRead(): string {
  return '{}';
}
