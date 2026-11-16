import { professorSessionService } from './professorSessionService';
import {
  serializeSessionFocus,
  serializeSessionStateRead,
  serializeSessionStart,
  serializeSessionStateUpdate,
  type SessionStateUpdate,
} from './professorClassroomPayloads';

interface ClassroomStudent { id: string; name: string }
export interface ClassroomRoster { title: string; students: ClassroomStudent[]; version: number; updatedAt?: number }
export interface ClassroomLiveState {
  currentStudentIndex: number;
  questionIndex: number;
  roundId: number;
  answeredIds: string[];
  /** Statut de réponse par élève : correct (vert) / incorrect (rouge). */
  answerStatus?: Record<string, 'correct' | 'incorrect'>;
  version: number;
  updatedAt?: number;
}
export interface ProfessorClassroom { roster: ClassroomRoster; live: ClassroomLiveState }
export type ClassroomLoadResult = { unchanged: true } | (ProfessorClassroom & { unchanged: false });
export type LiveLoadResult = { unchanged: true } | (ClassroomLiveState & { unchanged: false });
export interface ClassChapterProgress {
  chapterId: string;
  revisionProgress: number;
  quizSubmitted: boolean;
  quizScore: number;
  exercisesDone: number;
}

export interface ClassStudentProgress {
  accountId: string;
  name: string;
  phone: string;
  progress: {
    chaptersStarted: number;
    quizDone: number;
    revisionAvg: number;
    exercisesDone: number;
    /** Moyenne des scores de quiz soumis (0-100). */
    quizScoreAvg: number;
    /** Dernière activité enregistrée (timestamp ms). */
    lastActive: number;
    /** Progression détaillée, chapitre par chapitre. */
    chapters: ClassChapterProgress[];
  };
}

/** Image partagée par le professeur à un élève (visible par toute la classe). */
export interface SharedImage {
  id: string;
  studentAccountId: string;
  studentName: string;
  /** Classe de l'élève ciblé — l'image est scopée à ce niveau. */
  classId?: string;
  caption: string;
  dataUri: string;
  createdAt: number;
}

/** Position temps réel de l'activité de séance (tablette → PC). */
interface SessionActivityPosition {
  type: 'exercise' | 'quiz' | 'revision';
  /** Position courante (numéro d'exercice / de question). */
  index?: number;
  count?: number;
  /** Libellé libre (ex. nom de paragraphe de révision). */
  label?: string;
}

/** Activité capturée pendant la séance (tablette → PC, pour affichage + archivage). */
export interface SessionActivity {
  exerciseIds?: string[];
  strokes?: Record<string, unknown[]>;
  /** Position temps réel (exercice N, question N, paragraphe de révision). */
  position?: SessionActivityPosition;
  /** Réponses de quiz transmises par la tablette (pour l'archivage). */
  quiz?: {
    history: Array<{ questionId: string; isCorrect: boolean; userAnswer: unknown }>;
    answersSnapshot: Record<string, unknown>;
  };
  /** Paragraphe / section de révision consulté. */
  revision?: { section?: string; paragraph?: string };
}

/** État partagé de la séance, pilotée depuis la tablette et observée sur le PC. */
export interface SessionState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  chapterId?: string;
  chapterTitle?: string;
  /** Niveau/classe actif(ve) choisi(e) par le prof pour cette séance. */
  classId?: string;
  /**
   * Classe pilotée depuis la console PC. Décorée à la lecture par
   * `getSessionState()` — jamais persistée dans le record de séance, pour que
   * publier un niveau ne touche ni au chapitre ni à l'activité en cours.
   */
  focusClassId?: string;
  /** Programmation d'une séance à venir (timestamp ms) + lien de visio. */
  scheduledAt?: number | null;
  meetLink?: string;
  startedAt?: number | null;
  updatedAt?: number;
  /** Activité capturée pendant la séance (exercices ouverts + traits manuscrits). */
  activity?: SessionActivity;
  /** Chronologie des actions de séance (PC + tablette) : planification, début, fin, présents… */
  history?: Array<{ at: number; type: string; label: string }>;
}

export interface ArchivedSessionSummary {
  id: string;
  classId: string;
  chapterTitle: string;
  startedAt: number;
  endedAt: number;
  exercisesCount: number;
  annotatedZones: number;
  quizAnswered: number;
  presentCount: number;
}

export type ArchivedSession = SessionState & ArchivedSessionSummary & {
  chapterId?: string;
  presentNames: string[];
  status: 'stopped';
};

const emptyClassroom = (): ProfessorClassroom => ({
  roster: { title: '', students: [], version: 0 },
  live: { currentStudentIndex: 0, questionIndex: 0, roundId: 1, answeredIds: [], version: 0 },
});

const liveQueues = new Map<string, Promise<ClassroomLiveState | null>>();

export const SESSION_UPDATED_EVENT = 'mathplus:session-updated';
function notifySessionChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

async function sendLiveUpdate(
  classId: string,
  live: Partial<ClassroomLiveState> & { reset?: boolean },
): Promise<ClassroomLiveState | null> {
  const res = await fetch('/api/professor?action=live-update', {
    method: 'POST',
    headers: professorSessionService.headers(),
    body: JSON.stringify({ classId, live }),
  });
  if (!res.ok) throw new Error('Synchronisation de la séance impossible');
  return (await res.json()).live || null;
}

export const professorClassroomService = {
  async listArchivedSessions(): Promise<ArchivedSessionSummary[]> {
    if (!professorSessionService.isProfessor()) return [];
    const res = await fetch('/api/professor?action=session-archive-list', { method: 'POST', headers: professorSessionService.headers(), body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Historique des séances indisponible');
    return Array.isArray(data.archives) ? data.archives : [];
  },

  async getArchivedSession(id: string): Promise<ArchivedSession> {
    const res = await fetch('/api/professor?action=session-archive-get', { method: 'POST', headers: professorSessionService.headers(), body: JSON.stringify({ id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Séance archivée indisponible');
    return data.archive as ArchivedSession;
  },
  async load(
    classId: string,
    sinceRoster = 0,
    sinceLive = 0,
    signal?: AbortSignal,
  ): Promise<ClassroomLoadResult> {
    if (!professorSessionService.isProfessor()) return { ...emptyClassroom(), unchanged: false as const };
    const res = await fetch('/api/professor?action=classroom-load', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, sinceRoster, sinceLive }),
      cache: 'no-store',
      signal,
    });
    if (!res.ok) throw new Error('Classe live indisponible');
    const data = await res.json();
    return data.unchanged ? { unchanged: true as const } : { ...data, unchanged: false as const };
  },

  async loadLive(classId: string, since = 0, signal?: AbortSignal): Promise<LiveLoadResult> {
    if (!professorSessionService.isProfessor()) return { ...emptyClassroom().live, unchanged: false as const };
    const res = await fetch('/api/professor?action=live-load', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, since }),
      cache: 'no-store',
      signal,
    });
    if (!res.ok) throw new Error('Séance live indisponible');
    const data = await res.json();
    return data.unchanged ? { unchanged: true as const } : { ...data.live, unchanged: false as const };
  },

  async updateLive(
    classId: string,
    live: Partial<ClassroomLiveState> & { reset?: boolean },
  ): Promise<ClassroomLiveState | null> {
    if (!professorSessionService.isProfessor()) return null;
    const previous = liveQueues.get(classId) || Promise.resolve(null);
    const next = previous.catch(() => null).then(() => sendLiveUpdate(classId, live));
    liveQueues.set(classId, next);
    void next.finally(() => {
      if (liveQueues.get(classId) === next) liveQueues.delete(classId);
    }).catch(() => undefined);
    return next;
  },

  async saveRoster(classId: string, roster: ClassroomRoster): Promise<ClassroomRoster> {
    const res = await fetch('/api/professor?action=roster-save', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, roster }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data?.error || 'Enregistrement impossible') as Error & { code?: string; roster?: ClassroomRoster };
      error.code = data?.error;
      error.roster = data?.roster;
      throw error;
    }
    return data.roster as ClassroomRoster;
  },

  async fetchClassStudents(classId: string): Promise<ClassStudentProgress[]> {
    const res = await fetch('/api/professor?action=class-students', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Chargement des élèves impossible');
    return data.students || [];
  },

  /** Marque la réponse d'un élève : correct / incorrect / neutre (statut retiré). */
  async setAnswerStatus(classId: string, studentId: string, status: 'correct' | 'incorrect' | null): Promise<void> {
    if (!professorSessionService.isProfessor()) return;
    const res = await fetch('/api/professor?action=answer-status', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, studentId, status }),
    });
    if (!res.ok) throw new Error('Mise à jour du statut impossible');
  },

  /** Déclare les élèves présents pour la séance (identifiants de compte). */
  async setPresent(classId: string, studentIds: string[]): Promise<void> {
    if (!professorSessionService.isProfessor()) return;
    const res = await fetch('/api/professor?action=present-set', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, studentIds }),
    });
    if (!res.ok) throw new Error('Déclaration des présents impossible');
    // Un appel modifie la séance : les vues abonnées (tableau de bord, page de
    // séance, compteurs) se resynchronisent sans rechargement.
    notifySessionChanged();
  },

  /** Élèves déclarés présents pour la séance en cours. */
  async getPresent(classId: string): Promise<string[]> {
    if (!professorSessionService.isProfessor()) return [];
    const res = await fetch('/api/professor?action=present-get', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Lecture des présents impossible');
    return data.presentIds || [];
  },

  /** Pilote la séance ; la classe n’est envoyée que lorsqu’elle est explicitement fournie. */
  async setSessionState(state: SessionStateUpdate): Promise<SessionState> {
    if (!professorSessionService.isProfessor()) return { status: 'idle' };
    const res = await fetch('/api/professor?action=session-set', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: serializeSessionStateUpdate(state),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Mise à jour de la séance impossible');
    notifySessionChanged();
    return data.session || { status: 'idle' };
  },

  /** Démarre une nouvelle séance dans la classe explicitement choisie. */
  async startSession(classId: string): Promise<SessionState> {
    if (!professorSessionService.isProfessor()) return { status: 'idle' };
    const res = await fetch('/api/professor?action=session-set', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: serializeSessionStart(classId),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Démarrage de la séance impossible');
    notifySessionChanged();
    return data.session || { status: 'idle' };
  },

  /**
   * Programme une séance à venir : les élèves liés recevront une notification
   * à l'heure précise (avec le lien de visio éventuel).
   */
  async scheduleSession(classId: string, input: { scheduledAt: number; meetLink?: string; chapterTitle?: string }): Promise<SessionState> {
    if (!professorSessionService.isProfessor()) return { status: 'idle' };
    const res = await fetch('/api/professor?action=session-schedule', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, ...input }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Programmation de la séance impossible');
    notifySessionChanged();
    return data.session || { status: 'idle' };
  },

  /**
   * Envoie une notification immédiate aux élèves liés au professeur
   * (tous, ou uniquement les absents).
   */
  async notifyStudents(classId: string, input: { title: string; body: string; url?: string; absentOnly?: boolean; priority?: string }): Promise<{ sent: number; failed: number }> {
    if (!professorSessionService.isProfessor()) return { sent: 0, failed: 0 };
    const res = await fetch('/api/professor?action=session-notify', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, ...input }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Envoi de la notification impossible');
    return { sent: Number(data.sent) || 0, failed: Number(data.failed) || 0 };
  },

  /**
   * Enregistre l'activité de la séance en cours (exercices ouverts + traits
   * manuscrits), écrite par la tablette et lue par le PC pour l'archivage.
   */
  async recordSessionActivity(classId: string, input: SessionActivity, options: { startedAt?: number | null; keepalive?: boolean } = {}): Promise<SessionState> {
    if (!professorSessionService.isProfessor()) return { status: 'idle' };
    const res = await fetch('/api/professor?action=session-activity', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId, ...input, startedAt: options.startedAt }),
      keepalive: options.keepalive,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || "Enregistrement de l'activité impossible"), { status: res.status, code: data?.error });
    return data.session || { status: 'idle' };
  },

  /** État actif de la séance, sans imposer la classe du profil ou du workspace. */
  async getSessionState(options: { summary?: boolean; signal?: AbortSignal } = {}): Promise<SessionState> {
    if (!professorSessionService.isProfessor()) return { status: 'idle' };
    const res = await fetch('/api/professor?action=session-get', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: options.summary ? JSON.stringify({ summary: true }) : serializeSessionStateRead(),
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Lecture de la séance impossible');
    // La classe pilotée arrive dans la même réponse : suivre le PC ne coûte
    // aucune requête supplémentaire à la tablette.
    return { ...(data.session || { status: 'idle' }), focusClassId: data.focus?.classId || '' };
  },

  /**
   * Publie la classe pilotée depuis la console PC. La tablette du professeur la
   * suit au cycle de polling suivant, sans toucher à une séance en cours.
   */
  async setFocusClass(classId: string): Promise<string> {
    if (!professorSessionService.isProfessor() || !classId) return '';
    const res = await fetch('/api/professor?action=session-focus', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: serializeSessionFocus(classId),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Changement de niveau impossible');
    notifySessionChanged();
    return data.focus?.classId || '';
  },

  /** Partage une image (PNG/JPEG) à un élève nommé depuis le PC prof. */
  async saveSharedImage(input: { classId: string; studentAccountId: string; studentName: string; caption?: string; dataUri: string }): Promise<SharedImage> {
    const res = await fetch('/api/professor?action=shared-save', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.image) throw new Error(data?.error || 'Partage de l\'image impossible');
    return data.image as SharedImage;
  },

  /** Liste des images partagées par le professeur, scopée à une classe. */
  async listSharedImages(classId?: string): Promise<SharedImage[]> {
    const res = await fetch('/api/professor?action=shared-list', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ classId: classId || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Lecture des partages impossible');
    return (Array.isArray(data.images) ? data.images : []) as SharedImage[];
  },

  /** Supprime une image partagée (PC prof). */
  async deleteSharedImage(id: string): Promise<void> {
    const res = await fetch('/api/professor?action=shared-delete', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Suppression de l\'image impossible');
  },

  /** Lecture élève : images partagées par son professeur. */
  async listStudentSharedImages(): Promise<SharedImage[]> {
    const res = await fetch('/api/professor?action=shared-list-student', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Lecture des partages impossible');
    return (Array.isArray(data.images) ? data.images : []) as SharedImage[];
  },
};
