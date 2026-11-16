/**
 * Cloud Sync Service — MathPlus
 *
 * Synchronise la progression locale (localStorage) avec le cloud (Upstash Redis).
 * - Sauvegarde debounce toutes les 60s + sur événements clés
 * - Chargement au login (merge intelligent local/cloud)
 * - Fonctionne en mode offline (graceful fallback)
 */

import { GlobalState, ChapterProgress, UserProfile } from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const SYNC_DEBOUNCE_MS = 15_000; // 15s entre chaque sync debounce
const PERIODIC_SYNC_MS = 3 * 60_000; // 3 min — sync périodique garantie
const SYNC_KEY = 'mathplus:cloud-last-sync';

// ============================================================================
// MERGE LOGIC
// ============================================================================

/**
 * Fusionne la progression locale et cloud chapitre par chapitre.
 * Stratégie : garder le plus avancé pour chaque dimension.
 */
export function mergeChapterProgress(local: ChapterProgress, cloud: ChapterProgress): ChapterProgress {
  return {
    // Révision : garder le % le plus élevé
    revisionProgress: Math.max(local.revisionProgress || 0, cloud.revisionProgress || 0),
    // Leçon à plusieurs fiches : une clé par fiche, la plus avancée gagne. Sans
    // cette ligne, la progression par fiche disparaissait à chaque connexion.
    revisionProgressBySheet: mergeSheetProgress(local.revisionProgressBySheet, cloud.revisionProgressBySheet),
    lastActiveAt: Math.max(local.lastActiveAt || 0, cloud.lastActiveAt || 0) || undefined,
    lastActiveSection: local.lastActiveSection || cloud.lastActiveSection,
    revealedBlanks: mergeArrays(local.revealedBlanks, cloud.revealedBlanks),
    masteredSkills: mergeArrays(local.masteredSkills, cloud.masteredSkills),
    completedSeances: mergeArrays(local.completedSeances, cloud.completedSeances),

    // Quiz : garder le meilleur score et le plus de tentatives
    quiz: {
      isSubmitted: local.quiz.isSubmitted || cloud.quiz.isSubmitted,
      score: Math.max(local.quiz.score || 0, cloud.quiz.score || 0),
      highScore: Math.max(local.quiz.highScore || 0, cloud.quiz.highScore || 0),
      attempts: Math.max(local.quiz.attempts || 0, cloud.quiz.attempts || 0),
      history: (local.quiz.history?.length || 0) >= (cloud.quiz.history?.length || 0)
        ? local.quiz.history
        : cloud.quiz.history,
      currentQuestionIndex: local.quiz.currentQuestionIndex ?? cloud.quiz.currentQuestionIndex,
      totalQuestions: local.quiz.totalQuestions ?? cloud.quiz.totalQuestions,
      answersSnapshot: local.quiz.answersSnapshot || cloud.quiz.answersSnapshot,
      durationSeconds: local.quiz.durationSeconds ?? cloud.quiz.durationSeconds,
    },

    // Exercices : union des exercices complétés
    exercises: mergeExercises(local.exercises, cloud.exercises),
    exerciseFeedback: { ...cloud.exerciseFeedback, ...local.exerciseFeedback },
    exerciseDurations: { ...cloud.exerciseDurations, ...local.exerciseDurations },

    // Soumission : garder si soumis dans l'un ou l'autre
    isChapterSubmitted: local.isChapterSubmitted || cloud.isChapterSubmitted,
    submittedAt: local.submittedAt || cloud.submittedAt,
  };
}

function mergeSheetProgress(
  a?: Record<string, number>,
  b?: Record<string, number>,
): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const merged: Record<string, number> = { ...(b || {}) };
  for (const [sheet, value] of Object.entries(a || {})) {
    merged[sheet] = Math.max(Number(value) || 0, Number(merged[sheet]) || 0);
  }
  return merged;
}

function mergeArrays<T>(a?: T[], b?: T[]): T[] {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}

function mergeExercises(
  local: ChapterProgress['exercises'],
  cloud: ChapterProgress['exercises']
): ChapterProgress['exercises'] {
  const merged = { ...cloud };
  for (const [id, localEx] of Object.entries(local || {})) {
    const cloudEx = merged[id];
    if (!cloudEx) {
      merged[id] = localEx;
    } else {
      // Garder la version complétée / meilleur mastery
      merged[id] = {
        isCompleted: localEx.isCompleted || cloudEx.isCompleted,
        mastery: pickBetterMastery(localEx.mastery, cloudEx.mastery),
        lastHintIndex: Math.max(localEx.lastHintIndex || 0, cloudEx.lastHintIndex || 0),
      };
    }
  }
  return merged;
}

const MASTERY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, skipped: 0 };
function pickBetterMastery(a: any, b: any): any {
  return (MASTERY_RANK[a] || 0) >= (MASTERY_RANK[b] || 0) ? a : b;
}

export function mergeProgress(
  local: Record<string, ChapterProgress>,
  cloud: Record<string, ChapterProgress>
): Record<string, ChapterProgress> {
  const allKeys = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  const merged: Record<string, ChapterProgress> = {};

  allKeys.forEach(key => {
    const l = local?.[key];
    const c = cloud?.[key];
    if (l && c) {
      merged[key] = mergeChapterProgress(l, c);
    } else {
      merged[key] = l || c;
    }
  });

  return merged;
}

// ============================================================================
// SERVICE
// ============================================================================

type SyncTarget = {
  accountId?: string;
  phone: string;
  classId: string;
};

type SyncContext = {
  generation: number;
  target: SyncTarget;
};

type QueuedSave = {
  state: GlobalState;
  context: SyncContext;
};

type SaveOperation = {
  id: number;
  generation: number;
};

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let periodicInterval: ReturnType<typeof setInterval> | null = null;
let latestStateForPeriodic: QueuedSave | null = null;
let activeTarget: SyncTarget | null = null;
let syncGeneration = 0;
let latestLoadRequestId = 0;
let nextSaveOperationId = 0;
let activeSaveOperation: SaveOperation | null = null;
let pendingForceSave: QueuedSave | null = null;

// File d'attente hors-ligne : si une sauvegarde cloud échoue (réseau coupé),
// on mémorise le dernier état et on le rejoue automatiquement au retour en
// ligne (événement 'online'). Évite de perdre la progression d'un quiz quitté
// alors que la connexion était absente.
let stateAwaitingReconnect: QueuedSave | null = null;
let onlineListener: (() => void) | null = null;

function normalizePhone(phone?: string): string {
  // Conserver le `+` utilisé par les clés de progression historiques ; seules
  // les différences d'espacement ne doivent pas créer une nouvelle cible.
  return (phone || '').replace(/\s/g, '');
}

function targetFromUser(user: UserProfile | null | undefined): SyncTarget | null {
  const phone = normalizePhone(user?.phone);
  const classId = user?.classId?.trim() || '';
  if (!phone || !classId || classId.startsWith('prof-pending:')) return null;
  return {
    accountId: user?.accountId || undefined,
    phone,
    classId,
  };
}

function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

function sameAccount(a: SyncTarget, b: SyncTarget): boolean {
  if (a.accountId && b.accountId) return a.accountId === b.accountId;
  return phoneDigits(a.phone) === phoneDigits(b.phone);
}

function sameTarget(a: SyncTarget, b: SyncTarget): boolean {
  return sameAccount(a, b) && a.phone === b.phone && a.classId === b.classId;
}

function isCurrentContext(context: SyncContext): boolean {
  return context.generation === syncGeneration
    && !!activeTarget
    && sameTarget(activeTarget, context.target);
}

function clearReconnectRetry(): void {
  stateAwaitingReconnect = null;
  if (onlineListener && typeof window !== 'undefined') {
    window.removeEventListener('online', onlineListener);
  }
  onlineListener = null;
}

function clearQueuedWork(): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = null;
  if (periodicInterval) clearInterval(periodicInterval);
  periodicInterval = null;
  latestStateForPeriodic = null;
  pendingForceSave = null;
  activeSaveOperation = null;
  clearReconnectRetry();
}

function switchActiveTarget(nextTarget: SyncTarget | null): void {
  if (!activeTarget && !nextTarget) {
    return;
  }
  if (activeTarget && nextTarget && sameTarget(activeTarget, nextTarget)) {
    // Une session legacy peut recevoir son accountId canonique après `/me`.
    // Enrichir la barrière permet aux comparaisons suivantes d'utiliser l'ID
    // immuable dès que les deux côtés le possèdent.
    if (!activeTarget.accountId && nextTarget.accountId) activeTarget = nextTarget;
    return;
  }

  // Invalide aussi les réponses de chargement et les `finally` des anciennes
  // sauvegardes. Une requête déjà partie conserve son payload/sa cible A, mais
  // elle ne peut plus alimenter une file d'attente de la session B.
  syncGeneration += 1;
  latestLoadRequestId += 1;
  clearQueuedWork();
  activeTarget = nextTarget;
}

function contextForState(state: GlobalState): SyncContext | null {
  const target = targetFromUser(state.user);
  if (!target) return null;

  // Permet les usages autonomes du service (ex. import de données), tout en
  // refusant qu'un ancien état réactive A lorsqu'une session B est déjà active.
  if (!activeTarget) switchActiveTarget(target);
  if (!activeTarget || !sameTarget(activeTarget, target)) return null;

  return { generation: syncGeneration, target };
}

function armReconnectRetry(queuedSave: QueuedSave): void {
  if (!isCurrentContext(queuedSave.context)) return;
  stateAwaitingReconnect = queuedSave;
  if (onlineListener || typeof window === 'undefined') return;

  onlineListener = () => {
    if (onlineListener) window.removeEventListener('online', onlineListener);
    onlineListener = null;
    const queued = stateAwaitingReconnect;
    stateAwaitingReconnect = null;
    if (queued && isCurrentContext(queued.context)) {
      void cloudSyncService.forceSave(queued.state);
    }
  };
  window.addEventListener('online', onlineListener);
}

/** Read total time spent from localStorage (written by useTimeTracking) */
/**
 * Planning de travail et journal des séances.
 *
 * Ces deux-là vivaient uniquement en localStorage : un changement de téléphone,
 * un vidage de cache ou une réinstallation les perdait sans trace, et le
 * tableau de bord enseignant n'avait aucun moyen de voir l'assiduité réelle.
 * On les joint donc à chaque sauvegarde — le planning est une **configuration**
 * (elle doit revenir à l'identique), le journal est un **relevé** (il se
 * fusionne sans jamais perdre une séance déjà pointée).
 */
function getStudyPayload(): { studyPlan: unknown; studyLog: unknown; studySessions: unknown } {
  const read = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  let studyPlan: unknown = null;
  try {
    // Le planning est rangé dans les réglages de l'application (`mathplus_settings`).
    const rawSettings = localStorage.getItem('mathplus_settings');
    if (rawSettings) studyPlan = JSON.parse(rawSettings)?.studyPlan ?? null;
    if (!studyPlan) {
      const legacy = localStorage.getItem('planet-math:app:v6.0');
      if (legacy) studyPlan = JSON.parse(legacy)?.settings?.studyPlan ?? null;
    }
  } catch {
    /* état illisible : on n'envoie rien plutôt qu'un planning tronqué */
  }

  return {
    studyPlan,
    studyLog: read('mathplus:study-log:v1'),
    studySessions: read('mathplus:study-sessions:v1'),
  };
}

function getTotalTimeSpent(state: GlobalState): number {
  try {
    // La clé doit venir de l'état capturé avec la sauvegarde. Relire le profil
    // courant depuis localStorage ici pourrait joindre le temps de B au payload A.
    const uid = state.user?.uniqueId || state.user?.name;
    if (uid) {
      const stored = localStorage.getItem(`mathplus_total_time_spent_${uid}`);
      if (stored) {
        const val = parseInt(stored, 10);
        if (val > 0) return val;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export const cloudSyncService = {
  /**
   * Définit explicitement le compte autorisé à utiliser la file de sync.
   * Tout changement de compte (ou de cible téléphone/classe) invalide les
   * chargements en vol et purge debounce, périodique, pending et retry offline.
   */
  setActiveAccount(user: UserProfile | null): void {
    switchActiveTarget(targetFromUser(user));
  },

  /**
   * Charge la progression depuis le cloud et fusionne avec le local.
   * Appelé au login. Retourne l'état fusionné ou null si pas de cloud.
   */
  async loadAndMerge(localState: GlobalState): Promise<GlobalState | null> {
    const context = contextForState(localState);
    if (!context) return null;
    const requestId = ++latestLoadRequestId;

    try {
      const res = await fetch('/api/progress?action=load', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: context.target.phone,
          classId: context.target.classId,
        }),
      });

      if (!res.ok || !isCurrentContext(context) || requestId !== latestLoadRequestId) return null;
      const data = await res.json();
      if (!data.found || !isCurrentContext(context) || requestId !== latestLoadRequestId) return null;

      // Merge cloud + local
      const mergedProgress = mergeProgress(localState.progress, data.progress || {});

      // Dernière barrière juste avant les effets locaux et la remise du résultat
      // à React : une réponse A arrivée après le login B est silencieusement jetée.
      if (!isCurrentContext(context) || requestId !== latestLoadRequestId) return null;
      localStorage.setItem(SYNC_KEY, String(Date.now()));

      console.info('[CloudSync] Loaded & merged from cloud', {
        localChapters: Object.keys(localState.progress).length,
        cloudChapters: Object.keys(data.progress || {}).length,
        mergedChapters: Object.keys(mergedProgress).length,
      });

      return {
        ...localState,
        progress: mergedProgress,
      };
    } catch (err) {
      console.warn('[CloudSync] Load failed (offline?)', err);
      return null;
    }
  },

  /**
   * Sauvegarde la progression vers le cloud.
   * Debounce 15s pour économiser les commands Redis.
   * Stocke aussi l'état pour le sync périodique.
   */
  scheduleSave(state: GlobalState): void {
    const context = contextForState(state);
    if (!context) return;
    const queuedSave: QueuedSave = { state, context };

    latestStateForPeriodic = queuedSave;

    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = null;
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      if (isCurrentContext(context)) void this.forceSave(state);
    }, SYNC_DEBOUNCE_MS);

    // Lancer le sync périodique si pas encore actif
    if (!periodicInterval) this.startPeriodicSync();
  },

  /**
   * Démarre un sync périodique toutes les PERIODIC_SYNC_MS.
   * Garanti que même sans changements d'état fréquents,
   * la progression atteint le cloud régulièrement.
   */
  startPeriodicSync(): void {
    if (periodicInterval) return;
    periodicInterval = setInterval(() => {
      const queued = latestStateForPeriodic;
      if (queued && isCurrentContext(queued.context) && !activeSaveOperation) {
        void this.forceSave(queued.state);
      }
    }, PERIODIC_SYNC_MS);
  },

  /** Arrête le sync périodique (appelé au logout) */
  stopPeriodicSync(): void {
    if (periodicInterval) {
      clearInterval(periodicInterval);
      periodicInterval = null;
    }
    latestStateForPeriodic = null;
  },

  /**
   * Force une sauvegarde immédiate vers le cloud.
   * Appelé sur événements importants : fin quiz, fin exercice, soumission chapitre.
   */
  async forceSave(state: GlobalState): Promise<boolean> {
    const context = contextForState(state);
    if (!context) return false;
    const queuedSave: QueuedSave = { state, context };

    // Une seule sauvegarde à la fois pour la génération active. Le pending
    // contient sa propre identité, jamais une simple référence à l'état global.
    if (activeSaveOperation?.generation === context.generation) {
      pendingForceSave = queuedSave;
      return false;
    }

    const operation: SaveOperation = {
      id: ++nextSaveOperationId,
      generation: context.generation,
    };
    activeSaveOperation = operation;

    try {
      const res = await fetch('/api/progress?action=save', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: context.target.phone,
          classId: context.target.classId,
          progress: state.progress,
          totalTimeSpent: getTotalTimeSpent(state),
          ...getStudyPayload(),
          lastActive: Date.now(),
        }),
      });

      if (res.ok) {
        if (isCurrentContext(context)) {
          clearReconnectRetry();
          localStorage.setItem(SYNC_KEY, String(Date.now()));
        }
        return true;
      }
      // Ne pas rejouer indéfiniment une erreur d'authentification ou de payload rejeté.
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        clearReconnectRetry();
        return false;
      }
      // Échec serveur transitoire : on programme un rejeu au retour en ligne.
      armReconnectRetry(queuedSave);
      return false;
    } catch {
      // Échec réseau (hors-ligne) : rejeu garanti dès la reconnexion.
      armReconnectRetry(queuedSave);
      return false;
    } finally {
      // Un ancien `finally` A ne doit jamais effacer/vider l'opération B qui a
      // pu commencer après un changement de génération.
      if (activeSaveOperation === operation) {
        activeSaveOperation = null;

        // Flush queued save with latest state
        if (pendingForceSave && isCurrentContext(pendingForceSave.context)) {
          const queued = pendingForceSave;
          pendingForceSave = null;
          void this.forceSave(queued.state);
        } else {
          pendingForceSave = null;
        }
      }
    }
  },

  /**
   * Sauvegarde via sendBeacon (survit au beforeunload / fermeture d'onglet).
   * Utilisé uniquement dans beforeunload car fetch() est annulé par les navigateurs.
   */
  beaconSave(state: GlobalState): void {
    const context = contextForState(state);
    if (!context) return;

    const payload = JSON.stringify({
      phone: context.target.phone,
      classId: context.target.classId,
      progress: state.progress,
      totalTimeSpent: getTotalTimeSpent(state),
      ...getStudyPayload(),
      lastActive: Date.now(),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/progress?action=save', new Blob([payload], { type: 'application/json' }));
    }
  },

  /** Dernière synchronisation réussie */
  getLastSyncTime(): number {
    return parseInt(localStorage.getItem(SYNC_KEY) || '0', 10);
  },

  /** Vérifie si le sync cloud est disponible (phone + classId présents) */
  isAvailable(): boolean {
    return !!activeTarget;
  },
};
