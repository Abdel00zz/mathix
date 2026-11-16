import type { AppView, UserProfile } from '../types';

/**
 * Identifiants canoniques des nœuds d'état du workflow applicatif.
 */
export type WorkflowNodeId =
  | 'booting'
  | 'auth'
  | 'pending_professor'
  | 'prof_console'
  | 'admin_console'
  | 'dashboard'
  | 'session_revision'
  | 'session_exercise'
  | 'session_quiz'
  | 'session_concours'
  | 'session_examen'
  | 'session_ds'
  | 'session_probleme'
  | 'session_referentiel';

export type WorkflowState = WorkflowNodeId;

export type WorkflowNodeKind = 'lifecycle' | 'gate' | 'workspace' | 'session';

/**
 * Voies de concurrence asynchrone gérées par l'application.
 */
export type WorkflowSyncLane =
  | 'session_restore'
  | 'cloud_sync'
  | 'manifest_refresh'
  | 'shared_media_lookup'
  | 'classroom_session';

export interface WorkflowNodeMeta {
  id: WorkflowNodeId;
  kind: WorkflowNodeKind;
  view: AppView;
  requiresAuth: boolean;
  allowedTransitions: readonly WorkflowNodeId[];
  activeThreads: readonly WorkflowSyncLane[];
}

export const WORKFLOW_NODE_IDS: readonly WorkflowNodeId[] = [
  'booting',
  'auth',
  'pending_professor',
  'prof_console',
  'admin_console',
  'dashboard',
  'session_revision',
  'session_exercise',
  'session_quiz',
  'session_concours',
  'session_examen',
  'session_ds',
  'session_probleme',
  'session_referentiel',
] as const;

const SESSION_EXIT_TARGETS: readonly WorkflowNodeId[] = [
  'dashboard',
  'prof_console',
  'auth',
  'pending_professor',
  'admin_console',
];

const WORKSPACE_TO_SESSION_TARGETS: readonly WorkflowNodeId[] = [
  'session_revision',
  'session_exercise',
  'session_quiz',
  'session_concours',
  'session_examen',
  'session_ds',
  'session_probleme',
  'session_referentiel',
];

export const WORKFLOW_NODES: Record<WorkflowNodeId, WorkflowNodeMeta> = {
  booting: {
    id: 'booting',
    kind: 'lifecycle',
    view: 'login',
    requiresAuth: false,
    allowedTransitions: [
      'auth',
      'pending_professor',
      'prof_console',
      'admin_console',
      'dashboard',
      'session_referentiel',
    ],
    activeThreads: ['session_restore', 'manifest_refresh'],
  },
  auth: {
    id: 'auth',
    kind: 'gate',
    view: 'login',
    requiresAuth: false,
    allowedTransitions: [
      'pending_professor',
      'prof_console',
      'dashboard',
      'admin_console',
    ],
    activeThreads: ['session_restore', 'manifest_refresh'],
  },
  pending_professor: {
    id: 'pending_professor',
    kind: 'gate',
    view: 'dashboard',
    requiresAuth: true,
    allowedTransitions: [
      'auth',
      'prof_console',
      'dashboard',
      'admin_console',
    ],
    activeThreads: ['session_restore', 'manifest_refresh'],
  },
  prof_console: {
    id: 'prof_console',
    kind: 'workspace',
    view: 'dashboard',
    requiresAuth: true,
    allowedTransitions: [
      'auth',
      'pending_professor',
      'dashboard',
      'admin_console',
    ],
    activeThreads: ['session_restore', 'cloud_sync', 'manifest_refresh', 'classroom_session'],
  },
  admin_console: {
    id: 'admin_console',
    kind: 'workspace',
    view: 'admin',
    requiresAuth: false,
    allowedTransitions: [
      'auth',
      'pending_professor',
      'prof_console',
      'dashboard',
    ],
    activeThreads: ['session_restore', 'manifest_refresh'],
  },
  dashboard: {
    id: 'dashboard',
    kind: 'workspace',
    view: 'dashboard',
    requiresAuth: true,
    allowedTransitions: [
      'auth',
      'pending_professor',
      'prof_console',
      'admin_console',
      ...WORKSPACE_TO_SESSION_TARGETS,
    ],
    activeThreads: [
      'session_restore',
      'cloud_sync',
      'manifest_refresh',
      'shared_media_lookup',
      'classroom_session',
    ],
  },
  session_revision: {
    id: 'session_revision',
    kind: 'session',
    view: 'revision',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync', 'manifest_refresh'],
  },
  session_exercise: {
    id: 'session_exercise',
    kind: 'session',
    view: 'session',
    requiresAuth: true,
    allowedTransitions: [...SESSION_EXIT_TARGETS, 'session_quiz'],
    activeThreads: ['session_restore', 'cloud_sync', 'manifest_refresh'],
  },
  session_quiz: {
    id: 'session_quiz',
    kind: 'session',
    view: 'quiz',
    requiresAuth: true,
    allowedTransitions: [...SESSION_EXIT_TARGETS, 'session_exercise'],
    activeThreads: ['session_restore', 'cloud_sync', 'manifest_refresh'],
  },
  session_concours: {
    id: 'session_concours',
    kind: 'session',
    view: 'concours-quiz',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync'],
  },
  session_examen: {
    id: 'session_examen',
    kind: 'session',
    view: 'examen-session',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync'],
  },
  session_ds: {
    id: 'session_ds',
    kind: 'session',
    view: 'ds-session',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync'],
  },
  session_probleme: {
    id: 'session_probleme',
    kind: 'session',
    view: 'probleme-view',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync'],
  },
  session_referentiel: {
    id: 'session_referentiel',
    kind: 'session',
    view: 'cadre-referentiel',
    requiresAuth: true,
    allowedTransitions: SESSION_EXIT_TARGETS,
    activeThreads: ['session_restore', 'cloud_sync'],
  },
};

export interface WorkflowSessionAvailability {
  hasChapter?: boolean;
  hasRevision?: boolean;
  hasConcoursConfig?: boolean;
  hasExamen?: boolean;
  hasDs?: boolean;
  hasProbleme?: boolean;
}

export interface WorkflowResolutionInput {
  view: AppView;
  user: UserProfile | null;
  isLoaded?: boolean;
  accountSessionReady?: boolean;
  isBooting?: boolean;
  hasProfessorAccess?: boolean;
  isTabletSurface?: boolean;
  sessionAvailability?: WorkflowSessionAvailability;
}

export type WorkflowFallbackReason =
  | 'booting'
  | 'unauthenticated'
  | 'pending_professor'
  | 'studio_alias'
  | 'missing_session_payload';

export interface WorkflowResolutionResult {
  node: WorkflowNodeId;
  view: AppView;
  meta: WorkflowNodeMeta;
  fallbackApplied: boolean;
  fallbackReason?: WorkflowFallbackReason;
}

export function getWorkflowNodeMeta(node: WorkflowNodeId): WorkflowNodeMeta {
  return WORKFLOW_NODES[node];
}

export function canTransitionWorkflow(from: WorkflowNodeId, to: WorkflowNodeId): boolean {
  if (from === to) return true;
  return WORKFLOW_NODES[from].allowedTransitions.includes(to);
}

type SessionViewName =
  | 'revision'
  | 'session'
  | 'quiz'
  | 'concours-quiz'
  | 'examen-session'
  | 'ds-session'
  | 'probleme-view'
  | 'cadre-referentiel';

const SESSION_VIEW_TO_NODE: Record<SessionViewName, WorkflowNodeId> = {
  revision: 'session_revision',
  session: 'session_exercise',
  quiz: 'session_quiz',
  'concours-quiz': 'session_concours',
  'examen-session': 'session_examen',
  'ds-session': 'session_ds',
  'probleme-view': 'session_probleme',
  'cadre-referentiel': 'session_referentiel',
};

function hasRequiredSessionPayload(
  view: SessionViewName,
  availability?: WorkflowSessionAvailability,
): boolean {
  if (!availability) return true;
  switch (view) {
    case 'revision':
      return Boolean(availability.hasChapter && availability.hasRevision);
    case 'session':
    case 'quiz':
      return Boolean(availability.hasChapter);
    case 'concours-quiz':
      return Boolean(availability.hasConcoursConfig);
    case 'examen-session':
      return Boolean(availability.hasExamen);
    case 'ds-session':
      return Boolean(availability.hasDs);
    case 'probleme-view':
      return Boolean(availability.hasProbleme);
    case 'cadre-referentiel':
      return true;
  }
}

/**
 * Point unique de résolution d'un nœud de workflow et de sa vue affichable.
 * Préserve exactement les règles d'accès de `resolveViewForUser` tout en
 * unifiant le démarrage (`booting`), les surfaces prof/pending et les sessions.
 */
export function resolveWorkflowNode(input: WorkflowResolutionInput): WorkflowResolutionResult {
  const isBooting = input.isBooting ?? (input.isLoaded === false || input.accountSessionReady === false);
  if (isBooting) {
    return {
      node: 'booting',
      view: 'login',
      meta: WORKFLOW_NODES.booting,
      fallbackApplied: false,
      fallbackReason: 'booting',
    };
  }

  if (input.view === 'admin') {
    return {
      node: 'admin_console',
      view: 'admin',
      meta: WORKFLOW_NODES.admin_console,
      fallbackApplied: false,
    };
  }

  if (!input.user) {
    const redirected = input.view !== 'login';
    return {
      node: 'auth',
      view: 'login',
      meta: WORKFLOW_NODES.auth,
      fallbackApplied: redirected,
      fallbackReason: redirected ? 'unauthenticated' : undefined,
    };
  }

  const isPendingProfessor = input.user.requestedRole === 'prof' && input.user.role !== 'prof';
  if (isPendingProfessor) {
    const confined = input.view !== 'dashboard';
    return {
      node: 'pending_professor',
      view: 'dashboard',
      meta: WORKFLOW_NODES.pending_professor,
      fallbackApplied: confined,
      fallbackReason: confined ? 'pending_professor' : undefined,
    };
  }

  const isProfessor = input.user.role === 'prof' && (input.hasProfessorAccess ?? true);
  const profConsoleActive = isProfessor && !(input.isTabletSurface ?? false);
  const workspaceNode: WorkflowNodeId = profConsoleActive ? 'prof_console' : 'dashboard';

  if (input.view === 'login' || input.view === 'studio') {
    return {
      node: workspaceNode,
      view: 'dashboard',
      meta: WORKFLOW_NODES[workspaceNode],
      fallbackApplied: true,
      fallbackReason: input.view === 'studio' ? 'studio_alias' : undefined,
    };
  }

  if (input.view === 'dashboard') {
    return {
      node: workspaceNode,
      view: 'dashboard',
      meta: WORKFLOW_NODES[workspaceNode],
      fallbackApplied: false,
    };
  }

  const sessionNode = SESSION_VIEW_TO_NODE[input.view];
  if (!hasRequiredSessionPayload(input.view, input.sessionAvailability)) {
    return {
      node: workspaceNode,
      view: 'dashboard',
      meta: WORKFLOW_NODES[workspaceNode],
      fallbackApplied: true,
      fallbackReason: 'missing_session_payload',
    };
  }

  return {
    node: sessionNode,
    view: input.view,
    meta: WORKFLOW_NODES[sessionNode],
    fallbackApplied: false,
  };
}

export type AsyncThreadKey = WorkflowSyncLane | (string & {});

export type AsyncThreadMode = 'supersede' | 'dedupe';

export interface AsyncThreadContext {
  signal: AbortSignal;
  generation: number;
  isCurrent: () => boolean;
}

export interface AsyncThreadRunOptions {
  mode?: AsyncThreadMode;
}

export type AsyncThreadResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' };

interface ActiveThreadEntry {
  controller: AbortController;
  generation: number;
  promise: Promise<AsyncThreadResult<unknown>>;
}

/**
 * Coordinateur léger de fils asynchrones nommés.
 * Permet de dédupliquer ou de supplanter proprement les tâches réseau
 * (restauration de session, synchro cloud, rafraîchissement de manifeste)
 * avec annulation via AbortController et jeton de génération.
 */
export class AsyncThreadCoordinator {
  private readonly active = new Map<string, ActiveThreadEntry>();
  private readonly generations = new Map<string, number>();

  getGeneration(name: AsyncThreadKey): number {
    return this.generations.get(name) ?? 0;
  }

  isRunning(name: AsyncThreadKey): boolean {
    const entry = this.active.get(name);
    return Boolean(entry && !entry.controller.signal.aborted);
  }

  getActiveThreads(): AsyncThreadKey[] {
    return Array.from(this.active.keys());
  }

  cancel(name: AsyncThreadKey): boolean {
    const entry = this.active.get(name);
    if (!entry) return false;
    this.active.delete(name);
    entry.controller.abort();
    return true;
  }

  cancelAll(): void {
    const entries = Array.from(this.active.values());
    this.active.clear();
    for (const entry of entries) {
      entry.controller.abort();
    }
  }

  run<T>(
    name: AsyncThreadKey,
    task: (ctx: AsyncThreadContext) => Promise<T>,
    options: AsyncThreadRunOptions = {},
  ): Promise<AsyncThreadResult<T>> {
    const mode = options.mode ?? 'supersede';
    const existing = this.active.get(name);
    if (mode === 'dedupe' && existing && !existing.controller.signal.aborted) {
      return existing.promise as Promise<AsyncThreadResult<T>>;
    }

    if (existing) {
      this.active.delete(name);
      existing.controller.abort();
    }

    const generation = (this.generations.get(name) ?? 0) + 1;
    this.generations.set(name, generation);

    const controller = new AbortController();
    const entry: ActiveThreadEntry = {
      controller,
      generation,
      promise: Promise.resolve({ status: 'cancelled' }),
    };
    this.active.set(name, entry);

    const isCurrent = () => (
      !controller.signal.aborted
      && this.generations.get(name) === generation
      && this.active.get(name) === entry
    );

    const promise = (async (): Promise<AsyncThreadResult<T>> => {
      try {
        const value = await task({
          signal: controller.signal,
          generation,
          isCurrent,
        });
        if (!isCurrent()) return { status: 'cancelled' };
        return { status: 'completed', value };
      } catch (error) {
        if (!isCurrent()) {
          return { status: 'cancelled' };
        }
        throw error;
      } finally {
        if (this.active.get(name) === entry) {
          this.active.delete(name);
        }
      }
    })();

    entry.promise = promise as Promise<AsyncThreadResult<unknown>>;

    return promise;
  }
}
