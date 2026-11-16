// Service d'accès à la console d'administration (secret x-admin-secret).
// Le secret est conservé en sessionStorage (survit au F5, effacé à la fermeture).

import {
  EMPTY_TREE,
  type CandidateTree,
  type Proposal,
  type SyncProfIdentity,
  type SyncSummary,
  type ThreadMessage,
} from './contentSyncTypes';
import { resolveDataUrl } from './contentOverrides';

const SECRET_KEY = 'mathplus_admin_secret';

export interface AdminUser {
  accountId: string;
  name: string;
  firstName: string;
  lastName: string;
  phone: string;
  classId: string;
  className: string;
  mode: 'scolaire' | 'concours';
  schoolName: string;
  registeredAt: number;
  lastActive: number;
  roleUpdatedAt: number | null;
  profId: string;
  profClasses?: string[];
  profClassScope?: 'all' | 'selected' | 'none';
  role: 'prof' | 'student';
  /** Rôle demandé à l'inscription ; `prof` + rôle étudiant = demande en attente. */
  requestedRole: 'prof' | 'student';
  /** false → le compte utilise encore le mot de passe par défaut (000000000). */
  passwordSet?: boolean;
}

export interface AdminClassEntry { id: string; title: string; path: string }

/**
 * Clé d'un relevé côté API : `classe:téléphone`, espaces retirés.
 * Le serveur renvoie exactement cette clé — la calculer ici évite qu'un
 * affichage se croie vide alors que la donnée est bien arrivée.
 */
export function progressUid(classId: string, phone: string): string {
  return `${classId}:${(phone || '').replace(/\s/g, '')}`;
}

export interface ProgressSummary {
  found: boolean;
  totalTimeSpent?: number;
  lastActive?: number;
  chaptersStarted?: number;
  quizDone?: number;
  quizInProgress?: number;
  avgRevision?: number;
  exercisesDone?: number;
  chaptersSubmitted?: number;
}

export interface StudentQuizAnswer { qId: string; correct: boolean; userAnswer: unknown; timeSpent: number | null }

/** Détail d'un chapitre tel qu'enregistré côté élève (relevé cloud). */
export interface StudentChapterProgress {
  chapter: string;
  scopedKey: string;
  revisionProgress: number;
  revisionBySheet: Record<string, number>;
  blanksRevealed: number;
  masteredSkills: number;
  completedSeances: number[];
  lastActiveAt: number | null;
  lastActiveSection: string | null;
  quizSubmitted: boolean;
  quizScore: number;
  quizHighScore: number;
  quizAttempts: number;
  quizTotal: number;
  quizAnswered: number;
  quizCorrect: number;
  quizProgressPct: number;
  quizCurrentIndex: number;
  quizDuration: number | null;
  quizHistory: StudentQuizAnswer[];
  subQuestionsTotal: number;
  subQuestionsCompleted: number;
  exercisesFeedbackCount: number;
  feedbackDetails: Record<string, string>;
  feedbackSummary: { done: number; skipped: number };
  exerciseDurations: Record<string, number | null>;
  submitted: boolean;
  submittedAt: number | null;
}

export interface StudentPlanningSummary {
  enabled: boolean;
  activeDays: number;
  sessionsPerWeek: number;
  plannedWeeklyMin: number;
  doneWeeklyMin: number;
  adherencePct: number | null;
  sessionsPointed: number;
  sessionsMissed: number;
  daysLogged: number;
  slots: Array<{ day: number; start: string; durationMin: number; focus: string | null }>;
}

export interface StudentProgressDetail {
  classId: string;
  totalTimeSpent: number;
  lastActive: number;
  updatedAt: number;
  chaptersCount: number;
  chapters: StudentChapterProgress[];
  lastChapter: { chapter: string; at: number; section: string | null } | null;
  planning: StudentPlanningSummary | null;
}

export interface StudentConcoursSummary {
  totalExams: number;
  bestScores: Record<string, number>;
  lastPlayed: number;
  updatedAt: number;
}

/** Chapitre tel que déclaré dans le manifeste de la classe (titre, étapes). */
export interface ClassChapterEntry {
  id: string;
  title: string;
  section?: string;
  quizCount?: number;
  revisions?: Array<{ id?: string; title?: string; path: string }>;
  exercises?: Array<{ id: string; path: string }>;
  quizzes?: Array<{ id: string; path: string }>;
}

/** Étape d'une fiche de cours, pour nommer la dernière section lue. */
export interface RevisionSectionEntry { id: string; title: string }

function secret(): string {
  try { return sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
}

function headers(): Record<string, string> {
  return { 'x-admin-secret': secret(), 'Content-Type': 'application/json' };
}

export const adminService = {
  isAuthenticated(): boolean {
    return secret().length > 0;
  },
  login(value: string): void {
    sessionStorage.setItem(SECRET_KEY, value.trim());
  },
  logout(): void {
    sessionStorage.removeItem(SECRET_KEY);
  },

  /** Secret transmis au client de contenu uniquement pendant la vue admin. */
  contentSessionSecret(): string {
    return secret();
  },

  async fetchUsers(): Promise<AdminUser[]> {
    const res = await fetch('/api/users?action=list', { headers: headers(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Chargement des utilisateurs impossible');
    return data.users || [];
  },

  async setRole(accountId: string, role: 'prof' | 'student'): Promise<void> {
    const res = await fetch('/api/users?action=role-set', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Modification du rôle impossible');
  },

  /** Réinitialise le mot de passe d'un compte (réservé à l'admin). */
  async setPassword(accountId: string, newPassword: string): Promise<void> {
    const res = await fetch('/api/users?action=admin-set-password', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Modification du mot de passe impossible');
  },

  async setClass(accountId: string, classId: string): Promise<void> {
    const res = await fetch('/api/users?action=set-class', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, classId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Changement de classe impossible');
  },

  /** Définit les classes autorisées d'un professeur (cases à cocher). */
  async setProfClasses(
    accountId: string,
    classIds: string[],
    scope?: 'all' | 'selected' | 'none',
  ): Promise<void> {
    const res = await fetch('/api/users?action=set-prof-classes', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, classIds, scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Mise à jour des classes autorisées impossible');
  },

  async setProf(accountId: string, profId: string): Promise<void> {
    const res = await fetch('/api/users?action=set-prof', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, profId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Association au professeur impossible');
  },

  async deleteUser(accountId: string): Promise<void> {
    const res = await fetch('/api/users?action=delete', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Suppression impossible');
  },

  async fetchClasses(): Promise<AdminClassEntry[]> {
    try {
      const res = await fetch('/data/manifest.json', { cache: 'no-store' });
      const data = await res.json();
      return Array.isArray(data?.classes) ? data.classes : [];
    } catch { return []; }
  },

  async fetchProgressSummary(students: { phone: string; classId: string }[]): Promise<Record<string, ProgressSummary>> {
    if (!students.length) return {};
    const res = await fetch('/api/progress?action=summary', {
      method: 'POST', headers: headers(), body: JSON.stringify({ students }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Chargement de la progression impossible');
    return data.summaries || {};
  },

  /**
   * Vue détaillée d'un élève : chapitres, révision, quiz, exercices, planning.
   * `null` quand le compte n'a encore rien écrit dans le cloud.
   */
  async fetchStudentProgress(phone: string, classId: string): Promise<StudentProgressDetail | null> {
    if (!phone || !classId) return null;
    const res = await fetch(
      `/api/progress?action=view&phone=${encodeURIComponent(phone)}&classId=${encodeURIComponent(classId)}`,
      { headers: headers(), cache: 'no-store' },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Lecture de la progression impossible');
    if (!data.found) return null;
    return {
      classId: data.classId || classId,
      totalTimeSpent: data.totalTimeSpent || 0,
      lastActive: data.lastActive || 0,
      updatedAt: data.updatedAt || 0,
      chaptersCount: data.chaptersCount || 0,
      chapters: Array.isArray(data.chapters) ? data.chapters : [],
      lastChapter: data.lastChapter || null,
      planning: data.planning || null,
    };
  },

  /** Bilan concours d'un élève (essais blancs, meilleurs scores). */
  async fetchStudentConcours(phone: string, classId: string): Promise<StudentConcoursSummary | null> {
    if (!phone || !classId) return null;
    const res = await fetch(
      `/api/progress?action=concours&phone=${encodeURIComponent(phone)}&classId=${encodeURIComponent(classId)}`,
      { headers: headers(), cache: 'no-store' },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.found) return null;
    return {
      totalExams: data.totalExams || 0,
      bestScores: data.bestScores || {},
      lastPlayed: data.lastPlayed || 0,
      updatedAt: data.updatedAt || 0,
    };
  },

  /** Chapitres déclarés par le manifeste de la classe (titres, étapes, exercices). */
  async fetchClassChapters(classId: string): Promise<ClassChapterEntry[]> {
    if (!classId) return [];
    try {
      const url = await resolveDataUrl(`data/classes/${classId}.json`);
      const res = await fetch(url.startsWith('/') || url.startsWith('http') ? url : `/${url}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
      return chapters.map((chapter: any) => ({
        id: String(chapter.id || ''),
        title: String(chapter.title || chapter.id || ''),
        section: chapter.section,
        quizCount: chapter.quizCount,
        revisions: chapter.revisions,
        exercises: chapter.exercises,
        quizzes: chapter.quizzes,
      }));
    } catch { return []; }
  },

  /**
   * Titre et étapes d'une fiche de cours. Les manifestes de classe ne
   * déclarent pas toujours le titre d'une fiche, ni le libellé des étapes :
   * « calculer_limite » ou « fiche_continuite_cours » ne se lisent pas.
   */
  async fetchRevisionSheet(path: string): Promise<{ title: string; sections: RevisionSectionEntry[] }> {
    const empty = { title: '', sections: [] as RevisionSectionEntry[] };
    if (!path) return empty;
    try {
      const url = await resolveDataUrl(path.replace(/^\//, ''));
      const res = await fetch(url.startsWith('/') || url.startsWith('http') ? url : `/${url}`, { cache: 'no-store' });
      if (!res.ok) return empty;
      const data = await res.json();
      const sections = Array.isArray(data?.sections) ? data.sections : [];
      return {
        title: String(data?.header?.title || ''),
        sections: sections.map((section: any, index: number) => ({
          id: String(section.id || `section-${index + 1}`),
          title: String(section.title || `Étape ${index + 1}`),
        })),
      };
    } catch { return empty; }
  },

  // ── Notifications / Historique ───────────────────────────────────────────

  async sendNotification(input: { title: string; body: string; url?: string; targetClass?: string; targetStudent?: string; priority?: string }): Promise<void> {
    const res = await fetch('/api/push?action=send', {
      method: 'POST', headers: headers(), body: JSON.stringify({ ...input, priority: input.priority || 'high' }),
    });
    if (!res.ok) throw new Error('Envoi échoué');
  },

  async fetchHistory(limit = 50): Promise<any[]> {
    const res = await fetch('/api/push?action=history', {
      method: 'POST', headers: headers(), body: JSON.stringify({ limit }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  },

  // ── Pilotage de chapitre ─────────────────────────────────────────────────

  async fetchPilot(classId: string): Promise<any | null> {
    const res = await fetch('/api/push?action=pilot-get', {
      method: 'POST', headers: headers(), body: JSON.stringify({ classId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pilot || null;
  },

  async setPilot(classId: string, pilot: any): Promise<any> {
    const res = await fetch('/api/push?action=pilot-set', {
      method: 'POST', headers: headers(), body: JSON.stringify({ classId, pilot }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Enregistrement du pilotage impossible');
    return data.pilot;
  },

  async deletePilot(classId: string): Promise<boolean> {
    const res = await fetch('/api/push?action=pilot-delete', {
      method: 'POST', headers: headers(), body: JSON.stringify({ classId }),
    });
    return res.ok;
  },

  async fetchChapterMonitor(students: { phone: string; classId: string }[], chapterId: string): Promise<Record<string, any>> {
    const res = await fetch('/api/progress?action=chapter-monitor', {
      method: 'POST', headers: headers(), body: JSON.stringify({ students, chapterId }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.monitor || {};
  },

  // ── Livraison de contenu à un professeur ─────────────────────────────────
  // Depuis l'activation de son badge, le professeur ne reçoit plus l'officiel
  // automatiquement. Ces actions sont le canal explicite qui le remplace.

  /** Arbre de ce qui est livrable à ce professeur (classe → chapitre → type). */
  async previewProfPush(accountId: string): Promise<{ tree: CandidateTree; prof: SyncProfIdentity }> {
    const res = await fetch(`/api/content?action=push-preview&accountId=${encodeURIComponent(accountId)}`, {
      headers: headers(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Contenu livrable indisponible');
    return { tree: data.tree || EMPTY_TREE, prof: data.prof };
  },

  /** Envoie la proposition. Titre et message vides → texte par défaut du serveur. */
  async sendProfPush(input: { accountId: string; paths: string[]; title?: string; message?: string }): Promise<Proposal> {
    const res = await fetch('/api/content?action=push-send', {
      method: 'POST', headers: headers(), body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Envoi de la proposition impossible');
    return data.proposal;
  },

  async listProfPushes(accountId: string): Promise<{ proposals: Proposal[]; prof: SyncProfIdentity }> {
    const res = await fetch(`/api/content?action=push-list&accountId=${encodeURIComponent(accountId)}`, {
      headers: headers(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Historique des envois indisponible');
    return { proposals: data.proposals || [], prof: data.prof };
  },

  /** Retire une proposition encore en attente. Une décidée reste à l'historique. */
  async cancelProfPush(accountId: string, id: string): Promise<void> {
    const res = await fetch('/api/content?action=push-cancel', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Annulation impossible');
  },

  /** Pastilles de toute la table en une seule lecture. */
  async syncOverview(accountIds: string[]): Promise<Record<string, SyncSummary>> {
    if (!accountIds.length) return {};
    const res = await fetch('/api/content?action=sync-overview', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountIds }),
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return data.summaries || {};
  },

  /** Sauvegarde du contenu propre au professeur, sans rien de l'officiel. */
  async exportProfContent(accountId: string): Promise<{ files: Record<string, unknown>; exportedAt: number; prof: SyncProfIdentity }> {
    const res = await fetch(`/api/content?action=prof-export&accountId=${encodeURIComponent(accountId)}`, {
      headers: headers(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Export impossible');
    return { files: data.files || {}, exportedAt: data.exportedAt || Date.now(), prof: data.prof };
  },

  async sendAdminMessage(accountId: string, body: string): Promise<ThreadMessage> {
    const res = await fetch('/api/content?action=admin-message', {
      method: 'POST', headers: headers(), body: JSON.stringify({ accountId, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.message) throw new Error(data.error || 'Envoi du message impossible');
    return data.message;
  },

  /** Lit le fil. L'ouverture vaut accusé de lecture côté admin. */
  async fetchProfThread(accountId: string): Promise<ThreadMessage[]> {
    const res = await fetch(`/api/content?action=admin-thread&accountId=${encodeURIComponent(accountId)}`, {
      headers: headers(), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Fil de discussion indisponible');
    return data.messages || [];
  },
};
