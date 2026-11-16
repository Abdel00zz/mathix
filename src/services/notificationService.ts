/**
 * Notification Service — MathPlus Elite v2
 *
 * Moteur intelligent :
 *  - Algorithme d'Ebbinghaus (courbe de l'oubli) pour les rappels de révision
 *  - Détection de nouveaux contenus JSON (exercices, quiz, chapitres)
 *  - Analyse de tendance (trajectoire ascendante/descendante)
 *  - Analyse de gap révision/quiz (comprend mais n'applique pas)
 *  - Déduplication fingerprint + fenêtre temporelle
 *  - Event bus pour réactivité UI
 *  - Persistance localStorage avec TTL 14j et cleanup automatique
 */

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'achievement'      // Badge, milestone, score parfait
  | 'progress'         // Chapitre/quiz/exercice complété
  | 'reminder'         // Rappel de révision (Ebbinghaus, stratégique)
  | 'update'           // Nouveau contenu JSON (exercices, quiz, chapitres)
  | 'tip'              // Conseil pédagogique (pool rotatif)
  | 'session'          // Session LIVE / correction en direct
  | 'system'           // Système (SW update applied, etc.)
  | 'encouragement';   // Motivation contextuelle basée sur la trajectoire

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  priority: NotificationPriority;
  isRead: boolean;
  isDismissed: boolean;
  fingerprint?: string;
  meta?: {
    chapterId?: string;
    exerciseId?: string;
    actionLabel?: string;
    expiresAt?: number;
    milestone?: string;
    sessionDate?: string;
  };
  seenAt?: number;
}

export interface NotificationFilter {
  types?: NotificationType[];
  unreadOnly?: boolean;
  priorities?: NotificationPriority[];
  since?: number;
  limit?: number;
}

export interface ProgressSnapshot {
  totalChapters: number;
  completedQuizzes: number;
  averageScore: number;
  weakChapterCount: number;
  totalExercisesCompleted: number;
  totalExercises: number;
}

export interface ChapterProgressSlim {
  quiz?: { isSubmitted?: boolean; score?: number; history?: any[] };
  revisionProgress?: number;
  submittedAt?: number;
  isChapterSubmitted?: boolean;
  exerciseFeedback?: Record<string, string>;
}

type Listener = () => void;

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'mathplus:notifications:v3';
const CONTENT_SNAPSHOT_KEY = 'mathplus:content-snapshot:v2';
const MAX_NOTIFICATIONS = 80;
const MAX_ACTIVE_NOTIFICATIONS = 40; // Historique utile dans la page Messages
const NOTIFICATION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 jours

/*
 * Il n'y a volontairement plus de pool de conseils génériques : la boîte de
 * réception ne montre que des messages adossés à la progression réelle de
 * l'élève. La lecture transversale (cours, quiz, exercices, concours,
 * régularité) est produite par `progressDigestService`.
 */

// ============================================================================
// SERVICE
// ============================================================================

// Les mises à jour de contenu sont utiles à l'élève ; seuls les diagnostics
// techniques restent hors de la boîte de réception.
const HIDDEN_UNREAD_TYPES: ReadonlySet<NotificationType> = new Set(['system']);

/** Empreintes des messages génériques retirés, à effacer au chargement. */
const RETIRED_FINGERPRINTS: ReadonlySet<string> = new Set([
  'tip:daily-tip',
  'tip:trend-down',
  'tip:gap-revision-quiz',
  'encouragement:perf-solid',
]);

class NotificationService {
  private notifications: Map<string, Notification> = new Map();
  private listeners: Set<Listener> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private cachedUnreadCount = 0;

  constructor() {
    this.load();
    this.recomputeUnreadCount();
  }

  private recomputeUnreadCount(): void {
    let count = 0;
    this.notifications.forEach(n => {
      if (!n.isRead && !n.isDismissed && !HIDDEN_UNREAD_TYPES.has(n.type)) count++;
    });
    this.cachedUnreadCount = count;
  }

  // ---------- PERSISTENCE ----------

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let restoredInbox = false;
      if (raw) {
        const arr: Notification[] = JSON.parse(raw);
        arr.forEach(n => {
          // Purge des anciens messages génériques (conseil du jour, motivation,
          // analyses désormais fondues dans le bilan de progression).
          if (n.fingerprint && RETIRED_FINGERPRINTS.has(n.fingerprint)) {
            restoredInbox = true;
            return;
          }
          // Avant cette version, les messages sortant du top 5 étaient
          // automatiquement masqués. Il n'existe pas de suppression manuelle
          // dans l'interface : on rétablit donc cet historique récent.
          const restored = n.isDismissed ? { ...n, isDismissed: false } : n;
          restoredInbox ||= n.isDismissed;
          this.notifications.set(restored.id, restored);
        });
      }
      this.cleanup();
      if (restoredInbox) this.scheduleSave();
    } catch {
      // Silent
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.notifications.values())));
      } catch { /* quota exceeded — silent */ }
    }, 300);
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    this.notifications.forEach((n, id) => {
      if (n.meta?.expiresAt && n.meta.expiresAt < now) toDelete.push(id);
      else if (now - n.timestamp > NOTIFICATION_TTL_MS) toDelete.push(id);
    });
    toDelete.forEach(id => this.notifications.delete(id));

    // Cap at MAX
    if (this.notifications.size > MAX_NOTIFICATIONS) {
      const sorted = Array.from(this.notifications.values())
        .filter(n => n.isRead)
        .sort((a, b) => a.timestamp - b.timestamp);
      const excess = this.notifications.size - MAX_NOTIFICATIONS;
      sorted.slice(0, excess).forEach(n => this.notifications.delete(n.id));
    }

    if (toDelete.length > 0) {
      this.recomputeUnreadCount();
      this.scheduleSave();
    }
  }

  // ---------- ID & DEDUP ----------

  private makeId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private fingerprint(type: NotificationType, key?: string): string {
    return `${type}:${key || 'global'}`;
  }

  private findByFingerprint(fp: string, maxAgeMs: number): Notification | null {
    const now = Date.now();
    for (const n of this.notifications.values()) {
      if (n.fingerprint === fp && (now - n.timestamp) < maxAgeMs) return n;
    }
    return null;
  }

  // ---------- CREATE ----------

  create(
    type: NotificationType,
    title: string,
    message: string,
    opts: {
      priority?: NotificationPriority;
      meta?: Notification['meta'];
      dedupKey?: string;
      dedupWindowMs?: number;
    } = {}
  ): Notification | null {
    const fp = this.fingerprint(type, opts.dedupKey);
    const dedupWindow = opts.dedupWindowMs ?? 4 * 60 * 60 * 1000; // 4h default

    // Dedup: don't create if a similar one exists recently
    const existing = this.findByFingerprint(fp, dedupWindow);
    if (existing) return null;

    const n: Notification = {
      id: this.makeId(),
      type,
      title,
      message,
      timestamp: Date.now(),
      priority: opts.priority || 'normal',
      isRead: false,
      isDismissed: false,
      fingerprint: fp,
      meta: opts.meta,
    };

    this.notifications.set(n.id, n);
    if (!HIDDEN_UNREAD_TYPES.has(n.type)) this.cachedUnreadCount++;
    this.scheduleSave();
    this.emit();
    return n;
  }

  // ---------- READ ----------

  getAll(filter?: NotificationFilter): Notification[] {
    let results = Array.from(this.notifications.values()).filter(n => !n.isDismissed);

    if (filter?.types) results = results.filter(n => filter.types!.includes(n.type));
    if (filter?.unreadOnly) results = results.filter(n => !n.isRead);
    if (filter?.priorities) results = results.filter(n => filter.priorities!.includes(n.priority));
    if (filter?.since) results = results.filter(n => n.timestamp >= filter.since!);

    const pOrder: Record<NotificationPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    results.sort((a, b) => {
      const pd = pOrder[a.priority] - pOrder[b.priority];
      return pd !== 0 ? pd : b.timestamp - a.timestamp;
    });

    if (filter?.limit) results = results.slice(0, filter.limit);
    return results;
  }

  getUnreadCount(): number {
    return this.cachedUnreadCount;
  }

  // ---------- ACTIONS ----------

  markAsRead(id: string): void {
    const n = this.notifications.get(id);
    if (n && !n.isRead) {
      n.isRead = true;
      n.seenAt = Date.now();
      if (!n.isDismissed && !HIDDEN_UNREAD_TYPES.has(n.type)) {
        this.cachedUnreadCount = Math.max(0, this.cachedUnreadCount - 1);
      }
      this.scheduleSave();
      this.emit();
    }
  }

  markAllAsRead(): void {
    let changed = false;
    const now = Date.now();
    this.notifications.forEach(n => {
      if (!n.isRead) { n.isRead = true; n.seenAt = now; changed = true; }
    });
    if (changed) {
      this.cachedUnreadCount = 0;
      this.scheduleSave();
      this.emit();
    }
  }

  dismiss(id: string): void {
    const n = this.notifications.get(id);
    if (n && !n.isDismissed) {
      n.isDismissed = true;
      if (!n.isRead && !HIDDEN_UNREAD_TYPES.has(n.type)) {
        this.cachedUnreadCount = Math.max(0, this.cachedUnreadCount - 1);
      }
      this.scheduleSave();
      this.emit();
    }
  }

  clear(): void {
    this.notifications.clear();
    this.cachedUnreadCount = 0;
    this.scheduleSave();
    this.emit();
  }

  // ---------- TRIM ACTIVE ----------

  /**
   * Keep only the top MAX_ACTIVE_NOTIFICATIONS non-dismissed notifications.
   * Older, lower-priority ones get auto-dismissed to keep the feed lean.
   */
  private trimActive(): void {
    const active = Array.from(this.notifications.values()).filter(n => !n.isDismissed);
    if (active.length <= MAX_ACTIVE_NOTIFICATIONS) return;

    const pOrder: Record<NotificationPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    active.sort((a, b) => {
      const pd = pOrder[a.priority] - pOrder[b.priority];
      return pd !== 0 ? pd : b.timestamp - a.timestamp;
    });

    // Dismiss everything beyond the top N
    active.slice(MAX_ACTIVE_NOTIFICATIONS).forEach(n => {
      n.isDismissed = true;
    });
    this.recomputeUnreadCount();
    this.scheduleSave();
  }

  // ---------- EVENT BUS ----------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach(fn => { try { fn(); } catch { /* silent */ } });
  }

  // ========================================================================
  // SMART GENERATORS — Intelligence pédagogique avancée
  // ========================================================================

  /**
   * Analyse la progression globale avec trend analysis et gap detection.
   * Toutes les notifications utilisent des données réelles (noms, scores, dates).
   */
  generateFromProgress(
    snapshot: ProgressSnapshot,
    globalProgress?: Record<string, ChapterProgressSlim>,
    chapterMap?: Record<string, string>
  ): void {
    const { totalChapters, completedQuizzes, averageScore, totalExercisesCompleted, totalExercises } = snapshot;
    if (totalChapters === 0) return;

    const name = (id: string) => chapterMap?.[id] || id;

    /*
     * L'analyse de tendance et le gap révision/quiz vivent désormais dans le
     * bilan de progression (`progressDigestService`), qui les restitue avec
     * les autres axes plutôt qu'en messages isolés. On ne garde ici que les
     * événements ponctuels et actionnables.
     */
    if (globalProgress) {
      // ── PRÊTS À SOUMETTRE ────────────────────────────────────────────────
      const readyEntries = Object.entries(globalProgress).filter(
        ([, p]) => p.quiz?.isSubmitted && Object.keys(p.exerciseFeedback || {}).length > 0 && !p.isChapterSubmitted
      );
      if (readyEntries.length > 0) {
        const readyNames = readyEntries.slice(0, 2).map(([id]) => name(id)).join(', ');
        const more = readyEntries.length > 2 ? ` et ${readyEntries.length - 2} autre${readyEntries.length - 2 > 1 ? 's' : ''}` : '';
        this.create('reminder', 'Chapitres prêts à soumettre',
          `${readyNames}${more}. Quiz validé et exercices terminés. Soumettez pour valider.`,
          { priority: 'normal', dedupKey: 'ready-to-submit', dedupWindowMs: 12 * 60 * 60 * 1000 }
        );
      }
    }

    // ── MILESTONES ──────────────────────────────────────────────────────────
    const percent = Math.round((completedQuizzes / totalChapters) * 100);
    const milestones: Array<{ threshold: number; title: string; message: string; priority: NotificationPriority; key: string }> = [
      {
        threshold: 100, key: 'milestone-100', priority: 'urgent',
        title: 'Programme conquis',
        message: `${totalChapters}/${totalChapters} chapitres maîtrisés, moyenne ${Math.round(averageScore)}%. Programme complet.`
      },
      {
        threshold: 75, key: 'milestone-75', priority: 'high',
        title: 'Excellence en vue',
        message: `${completedQuizzes}/${totalChapters} chapitres (${percent}%), moyenne ${Math.round(averageScore)}%. Dernier quart du programme.`
      },
      {
        threshold: 50, key: 'milestone-50', priority: 'normal',
        title: 'Mi-parcours franchi',
        message: `${completedQuizzes}/${totalChapters} chapitres, moyenne ${Math.round(averageScore)}%. La moitié du programme est acquise.`
      },
      {
        threshold: 25, key: 'milestone-25', priority: 'normal',
        title: 'Dynamique enclenchée',
        message: `${completedQuizzes}/${totalChapters} chapitres complétés. Les fondations sont posées.`
      },
    ];

    const reached = milestones.find(m => percent >= m.threshold);
    if (reached) {
      this.create('achievement', reached.title, reached.message,
        { priority: reached.priority, dedupKey: reached.key, dedupWindowMs: 7 * 24 * 60 * 60 * 1000 }
      );
    }

    // ── SCORE PERFORMANCE ──────────────────────────────────────────────────
    // Seul le palier d'excellence subsiste : le reste relevait de la
    // motivation générique, que le bilan chiffré remplace avantageusement.
    if (averageScore >= 87 && completedQuizzes >= 3) {
      this.create('achievement', 'Niveau d\'excellence atteint',
        `${Math.round(averageScore)}% de moyenne sur ${completedQuizzes} quiz. Constance remarquable dans la haute performance.`,
        { priority: 'high', dedupKey: 'perf-elite', dedupWindowMs: 12 * 60 * 60 * 1000 }
      );
    }

    // ── CHAPITRES FAIBLES (nommés) ─────────────────────────────────────────
    // Removed: Quiz < 60% : plus de notification (le score est déjà visible dans le hub)

    // ── MAÎTRISE EXERCICES ─────────────────────────────────────────────────
    if (totalExercises > 0 && totalExercisesCompleted > 0) {
      const exPct = Math.round((totalExercisesCompleted / totalExercises) * 100);
      if (exPct >= 80) {
        this.create('achievement', 'Maîtrise pratique exemplaire',
          `${totalExercisesCompleted}/${totalExercises} exercices (${exPct}%). La pratique régulière forge le réflexe mathématique.`,
          { priority: 'high', dedupKey: 'ex-mastery-80', dedupWindowMs: 24 * 60 * 60 * 1000 }
        );
      }
    }

    // ── DÉBUTANT ───────────────────────────────────────────────────────────
    if (completedQuizzes === 0 && totalExercisesCompleted === 0) {
      // Silent onboarding: do not generate welcome notifications on first session
      const hasOnboarded = localStorage.getItem('mathplus:notif-onboarded');
      if (!hasOnboarded) {
        localStorage.setItem('mathplus:notif-onboarded', 'true');
        return; // Skip generating notifications for the very first session
      }
    }

    // Keep a concise but useful inbox history.
    this.trimActive();
  }

  /**
   * Algorithme d'Ebbinghaus — Courbe de l'oubli personnalisée par chapitre.
   * R(t) = e^(-t/S) — S dépend du score obtenu au quiz.
   * Les notifications incluent le nom du chapitre, le score et les jours écoulés.
   */
  generateRetentionReminders(
    globalProgress: Record<string, ChapterProgressSlim>,
    chapterMap?: Record<string, string>
  ): void {
    const now = Date.now();
    const DAY_MS = 86_400_000;
    const name = (id: string) => chapterMap?.[id] || id;

    let remindersGenerated = 0;

    Object.entries(globalProgress).forEach(([chapterId, progress]) => {
      if (remindersGenerated >= 2) return; // Limit to 2 reminders max per session
      if (!progress.quiz?.isSubmitted) return;
      const lastStudied = progress.submittedAt;
      if (!lastStudied) return;

      const daysSince = (now - lastStudied) / DAY_MS;
      if (daysSince < 1) return;

      const score = progress.quiz?.score || 0;
      const chapterTitle = name(chapterId);

      // Stabilité mémorielle selon la maîtrise (jours)
      const stability = score >= 90 ? 28 : score >= 75 ? 21 : score >= 60 ? 14 : score >= 45 ? 7 : 4;

      // R(t) = e^(-t/S)
      const retention = Math.exp(-daysSince / stability);
      const retentionPct = Math.round(retention * 100);
      const optimalDay = stability * Math.LN2; // point 50% de rétention

      if (retention < 0.55 && daysSince >= optimalDay) {
        const urgency: NotificationPriority = retention < 0.30 ? 'high' : 'normal';
        const daysStr = Math.round(daysSince) === 1 ? '1 jour' : `${Math.round(daysSince)} jours`;
        const msgs = [
          `${chapterTitle} · ${score}%, il y a ${daysStr}. Rétention estimée : ${retentionPct}%.`,
          `${chapterTitle} · ${daysStr} sans révision. Moment optimal pour consolider.`,
          `${chapterTitle} · Rétention : ${retentionPct}%. Une révision rapide s'impose.`,
        ];
        const msgIdx = Math.floor(daysSince / stability) % msgs.length;

        this.create('reminder', `Révision : ${chapterTitle}`,
          msgs[msgIdx],
          { priority: urgency, dedupKey: `ebbinghaus-${chapterId}`, dedupWindowMs: 24 * 60 * 60 * 1000, meta: { chapterId } }
        );
        remindersGenerated++;
      }
    });

    this.trimActive();
  }

  /**
   * Détection de nouveaux contenus dans la base JSON.
   * Compare exercices/quiz par chapitre contre un snapshot localStorage.
   * Génère des notifications ciblées si du nouveau contenu est détecté.
   */
  generateFromContentChanges(
    exercises: Array<{ id: string; chapterId: string; topic?: string }>,
    quizCounts: Record<string, number>,
    globalProgress: Record<string, ChapterProgressSlim>,
    chapterMap?: Record<string, string>
  ): void {
    // Agréger par chapitre + extraire le nom lisible depuis topic ou chapterMap
    const exByChapter: Record<string, number> = {};
    const chapterNameFromTopic: Record<string, string> = {};
    exercises.forEach(ex => {
      exByChapter[ex.chapterId] = (exByChapter[ex.chapterId] || 0) + 1;
      if (ex.topic && !chapterNameFromTopic[ex.chapterId]) {
        // topic format: "Section - Chapitre" → prend la partie après le dernier " - "
        const parts = ex.topic.split(' - ');
        chapterNameFromTopic[ex.chapterId] = parts[parts.length - 1] || ex.topic;
      }
    });
    const resolveChapterName = (id: string) =>
      chapterMap?.[id] || chapterNameFromTopic[id] || id;

    const current = { exercises: exByChapter, quiz: quizCounts };

    let prev: typeof current | null = null;
    try {
      const raw = localStorage.getItem(CONTENT_SNAPSHOT_KEY);
      if (raw) prev = JSON.parse(raw);
    } catch { /* silent */ }

    if (prev) {
      // ── Nouveaux chapitres entiers ──────────────────────────────────────
      const brandNew = Object.keys(exByChapter).filter(id => !prev!.exercises[id] && exByChapter[id] > 0);
      if (brandNew.length > 0) {
        const n = brandNew.length;
        const brandNewNames = brandNew.slice(0, 2).map(resolveChapterName).join(', ');
        const moreStr = n > 2 ? ` +${n - 2}` : '';
        this.create('update',
          `${n > 1 ? n + ' nouveaux chapitres' : 'Nouveau chapitre'} disponible${n > 1 ? 's' : ''}`,
          `${brandNewNames}${moreStr}, ${n > 1 ? 'ajoutés' : 'ajouté'} au programme. Explorez dès maintenant.`,
          { priority: 'high', dedupKey: `new-chapters-v${Object.keys(exByChapter).length}`, dedupWindowMs: 7 * 24 * 60 * 60 * 1000 }
        );
      }

      // ── Nouveaux exercices dans chapitres existants ─────────────────────
      let totalNewExercises = 0;
      const newExercisesChapters: string[] = [];
      
      Object.entries(exByChapter).forEach(([chapterId, count]) => {
        const prevCount = prev!.exercises[chapterId] || 0;
        if (prevCount > 0 && count > prevCount) {
          totalNewExercises += (count - prevCount);
          newExercisesChapters.push(resolveChapterName(chapterId));
        }
      });

      if (totalNewExercises > 0) {
        const chapterList = newExercisesChapters.slice(0, 2).join(', ');
        const more = newExercisesChapters.length > 2 ? ` et ${newExercisesChapters.length - 2} autre(s)` : '';
        this.create('update',
          'Nouveau contenu disponible',
          `${totalNewExercises} exercice(s) ajouté(s) dans ${chapterList}${more}.`,
          { priority: 'normal', dedupKey: `new-ex-aggregated-${totalNewExercises}`, dedupWindowMs: 7 * 24 * 60 * 60 * 1000 }
        );
      }

      // ── Nouvelles questions de quiz ─────────────────────────────────────
      let totalNewQuizQuestions = 0;
      const newQuizChapters: string[] = [];

      Object.entries(quizCounts).forEach(([chapterId, count]) => {
        const prevCount = prev!.quiz[chapterId] || 0;
        if (prevCount > 0 && count > prevCount) {
          totalNewQuizQuestions += (count - prevCount);
          newQuizChapters.push(resolveChapterName(chapterId));
        }
      });

      if (totalNewQuizQuestions > 0) {
        const chapterList = newQuizChapters.slice(0, 2).join(', ');
        const more = newQuizChapters.length > 2 ? ` et ${newQuizChapters.length - 2} autre(s)` : '';
        this.create('update',
          'Quiz enrichis',
          `${totalNewQuizQuestions} question(s) ajoutée(s) dans ${chapterList}${more}.`,
          { priority: 'normal', dedupKey: `new-quiz-aggregated-${totalNewQuizQuestions}`, dedupWindowMs: 7 * 24 * 60 * 60 * 1000 }
        );
      }
    }

    // Mettre à jour le snapshot
    try {
      localStorage.setItem(CONTENT_SNAPSHOT_KEY, JSON.stringify(current));
    } catch { /* quota — silent */ }

    this.trimActive();
  }

  // ---------- QUIZ EVENT ----------

  onQuizCompleted(chapterId: string, score: number, total: number): void {
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    if (percent === 100) {
      this.create('achievement', 'Score Parfait',
        `${score}/${total}. Score parfait, maîtrise totale du chapitre.`,
        { priority: 'urgent', dedupKey: `quiz-${chapterId}`, meta: { chapterId } }
      );
    } else if (percent >= 80) {
      this.create('achievement', 'Excellent résultat',
        `${score}/${total} (${percent}%). Concentrez la prochaine révision sur les erreurs restantes.`,
        { priority: 'high', dedupKey: `quiz-${chapterId}`, meta: { chapterId } }
      );
    } else if (percent >= 60) {
      this.create('progress', 'Résultat solide',
        `${score}/${total} (${percent}%). Identifiez les 2-3 questions manquées et révisez leur concept clé.`,
        { priority: 'normal', dedupKey: `quiz-${chapterId}`, meta: { chapterId } }
      );
    } else {
      this.create('tip', 'Révision recommandée',
        `${score}/${total} (${percent}%). Relisez le cours, identifiez les concepts clés et retentez.`,
        { priority: 'normal', dedupKey: `quiz-${chapterId}`, meta: { chapterId, actionLabel: 'Réviser le cours' } }
      );
    }
  }

  // ---------- SYSTEM ----------

  notifyUpdate(version: string, type: 'app' | 'content'): void {
    this.create('update',
      type === 'app' ? 'Nouvelle version disponible' : 'Contenu mis à jour',
      type === 'app'
        ? `Version ${version} disponible. Rechargez pour en profiter.`
        : 'Contenu mis à jour. Explorez les nouveautés.',
      { priority: 'high', dedupKey: `update-${version}`, meta: { actionLabel: 'Rafraîchir' } }
    );
  }
}

// Export singleton
export const notificationService = new NotificationService();
