import { describe, expect, it, vi } from 'vitest';
import {
  AsyncThreadCoordinator,
  WORKFLOW_NODE_IDS,
  WORKFLOW_NODES,
  canTransitionWorkflow,
  getWorkflowNodeMeta,
  resolveWorkflowNode,
  type WorkflowNodeId,
} from './appWorkflow';
import type { UserProfile } from '../types';

const student = { name: 'Amine', classId: '2eme-bac-sc-math', role: 'student' } as UserProfile;
const professor = { name: 'Mme Alaoui', classId: '2eme-bac-sc-math', role: 'prof' } as UserProfile;
const pendingProfessor = {
  name: 'M. Karim',
  classId: 'prof-pending:1',
  role: 'student',
  requestedRole: 'prof',
} as UserProfile;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('appWorkflow metadata & state machine', () => {
  it('déclare des métadonnées cohérentes pour les 14 nœuds du workflow', () => {
    const expectedNodes: WorkflowNodeId[] = [
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
    ];

    expect(WORKFLOW_NODE_IDS).toEqual(expectedNodes);
    for (const id of expectedNodes) {
      const meta = getWorkflowNodeMeta(id);
      expect(meta).toBe(WORKFLOW_NODES[id]);
      expect(meta.id).toBe(id);
      expect(meta.allowedTransitions.length).toBeGreaterThan(0);
      expect(meta.activeThreads.length).toBeGreaterThan(0);
    }
  });

  it('résout booting tant que le chargement initial ou la session compte n’est pas prêt', () => {
    expect(resolveWorkflowNode({ view: 'dashboard', user: student, isLoaded: false })).toMatchObject({
      node: 'booting',
      fallbackReason: 'booting',
    });
    expect(resolveWorkflowNode({ view: 'dashboard', user: student, accountSessionReady: false })).toMatchObject({
      node: 'booting',
      fallbackReason: 'booting',
    });
    expect(resolveWorkflowNode({ view: 'admin', user: null, isBooting: true })).toMatchObject({
      node: 'booting',
      fallbackReason: 'booting',
    });
  });

  it('résout auth et admin_console sans compte vérifié', () => {
    expect(resolveWorkflowNode({ view: 'login', user: null })).toMatchObject({
      node: 'auth',
      view: 'login',
      fallbackApplied: false,
    });
    expect(resolveWorkflowNode({ view: 'dashboard', user: null })).toMatchObject({
      node: 'auth',
      view: 'login',
      fallbackApplied: true,
      fallbackReason: 'unauthenticated',
    });
    expect(resolveWorkflowNode({ view: 'admin', user: null })).toMatchObject({
      node: 'admin_console',
      view: 'admin',
      fallbackApplied: false,
    });
  });

  it('confine un professeur en attente sur pending_professor sauf pour admin_console', () => {
    expect(resolveWorkflowNode({ view: 'dashboard', user: pendingProfessor })).toMatchObject({
      node: 'pending_professor',
      view: 'dashboard',
      fallbackApplied: false,
    });
    expect(resolveWorkflowNode({ view: 'quiz', user: pendingProfessor })).toMatchObject({
      node: 'pending_professor',
      view: 'dashboard',
      fallbackApplied: true,
      fallbackReason: 'pending_professor',
    });
    expect(resolveWorkflowNode({ view: 'admin', user: pendingProfessor })).toMatchObject({
      node: 'admin_console',
      view: 'admin',
      fallbackApplied: false,
    });
  });

  it('arbitre prof_console vs dashboard selon la surface et les droits professeur', () => {
    expect(resolveWorkflowNode({ view: 'dashboard', user: professor })).toMatchObject({
      node: 'prof_console',
      view: 'dashboard',
      fallbackApplied: false,
    });
    expect(resolveWorkflowNode({ view: 'dashboard', user: professor, isTabletSurface: true })).toMatchObject({
      node: 'dashboard',
      view: 'dashboard',
      fallbackApplied: false,
    });
    expect(resolveWorkflowNode({ view: 'dashboard', user: professor, hasProfessorAccess: false })).toMatchObject({
      node: 'dashboard',
      view: 'dashboard',
      fallbackApplied: false,
    });
    expect(resolveWorkflowNode({ view: 'studio', user: professor })).toMatchObject({
      node: 'prof_console',
      view: 'dashboard',
      fallbackApplied: true,
      fallbackReason: 'studio_alias',
    });
    expect(resolveWorkflowNode({ view: 'studio', user: student })).toMatchObject({
      node: 'dashboard',
      view: 'dashboard',
      fallbackApplied: true,
      fallbackReason: 'studio_alias',
    });
  });

  it('résout les 8 nœuds de session et applique un fallback si le payload requis manque', () => {
    expect(resolveWorkflowNode({
      view: 'revision',
      user: student,
      sessionAvailability: { hasChapter: true, hasRevision: true },
    })).toMatchObject({ node: 'session_revision', view: 'revision', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'session',
      user: student,
      sessionAvailability: { hasChapter: true },
    })).toMatchObject({ node: 'session_exercise', view: 'session', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'quiz',
      user: student,
      sessionAvailability: { hasChapter: true },
    })).toMatchObject({ node: 'session_quiz', view: 'quiz', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'concours-quiz',
      user: student,
      sessionAvailability: { hasConcoursConfig: true },
    })).toMatchObject({ node: 'session_concours', view: 'concours-quiz', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'examen-session',
      user: student,
      sessionAvailability: { hasExamen: true },
    })).toMatchObject({ node: 'session_examen', view: 'examen-session', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'ds-session',
      user: student,
      sessionAvailability: { hasDs: true },
    })).toMatchObject({ node: 'session_ds', view: 'ds-session', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'probleme-view',
      user: student,
      sessionAvailability: { hasProbleme: true },
    })).toMatchObject({ node: 'session_probleme', view: 'probleme-view', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'cadre-referentiel',
      user: student,
      sessionAvailability: {},
    })).toMatchObject({ node: 'session_referentiel', view: 'cadre-referentiel', fallbackApplied: false });

    expect(resolveWorkflowNode({
      view: 'revision',
      user: student,
      sessionAvailability: { hasChapter: true, hasRevision: false },
    })).toMatchObject({
      node: 'dashboard',
      view: 'dashboard',
      fallbackApplied: true,
      fallbackReason: 'missing_session_payload',
    });

    expect(resolveWorkflowNode({
      view: 'concours-quiz',
      user: professor,
      sessionAvailability: { hasConcoursConfig: false },
    })).toMatchObject({
      node: 'prof_console',
      view: 'dashboard',
      fallbackApplied: true,
      fallbackReason: 'missing_session_payload',
    });
  });

  it('valide les transitions autorisées et rejette les transitions illégales', () => {
    expect(canTransitionWorkflow('dashboard', 'dashboard')).toBe(true);
    expect(canTransitionWorkflow('booting', 'auth')).toBe(true);
    expect(canTransitionWorkflow('booting', 'dashboard')).toBe(true);
    expect(canTransitionWorkflow('auth', 'dashboard')).toBe(true);
    expect(canTransitionWorkflow('auth', 'pending_professor')).toBe(true);
    expect(canTransitionWorkflow('pending_professor', 'prof_console')).toBe(true);
    expect(canTransitionWorkflow('dashboard', 'session_quiz')).toBe(true);
    expect(canTransitionWorkflow('session_quiz', 'session_exercise')).toBe(true);
    expect(canTransitionWorkflow('session_exercise', 'dashboard')).toBe(true);
    expect(canTransitionWorkflow('session_revision', 'auth')).toBe(true);

    expect(canTransitionWorkflow('auth', 'session_quiz')).toBe(false);
    expect(canTransitionWorkflow('pending_professor', 'session_exercise')).toBe(false);
    expect(canTransitionWorkflow('booting', 'session_quiz')).toBe(false);
    expect(canTransitionWorkflow('session_concours', 'session_examen')).toBe(false);
    expect(canTransitionWorkflow('dashboard', 'booting')).toBe(false);
  });
});

describe('AsyncThreadCoordinator', () => {
  it('exécute une tâche nommée et suit son cycle de vie', async () => {
    const coordinator = new AsyncThreadCoordinator();
    const deferred = createDeferred<string>();

    const runPromise = coordinator.run('manifest_refresh', async ({ signal, isCurrent }) => {
      expect(signal.aborted).toBe(false);
      expect(isCurrent()).toBe(true);
      return deferred.promise;
    });

    expect(coordinator.isRunning('manifest_refresh')).toBe(true);
    expect(coordinator.getActiveThreads()).toEqual(['manifest_refresh']);
    expect(coordinator.getGeneration('manifest_refresh')).toBe(1);

    deferred.resolve('v2');
    await expect(runPromise).resolves.toEqual({ status: 'completed', value: 'v2' });
    expect(coordinator.isRunning('manifest_refresh')).toBe(false);
    expect(coordinator.getActiveThreads()).toEqual([]);
  });

  it('supplante la tâche précédente en mode supersede et ignore sa réponse tardive', async () => {
    const coordinator = new AsyncThreadCoordinator();
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    let firstSignal!: AbortSignal;
    let firstIsCurrent!: () => boolean;

    const p1 = coordinator.run('manifest_refresh', async ({ signal, isCurrent }) => {
      firstSignal = signal;
      firstIsCurrent = isCurrent;
      return first.promise;
    }, { mode: 'supersede' });

    const p2 = coordinator.run('manifest_refresh', async ({ signal, isCurrent }) => {
      expect(signal.aborted).toBe(false);
      expect(isCurrent()).toBe(true);
      return second.promise;
    }, { mode: 'supersede' });

    expect(firstSignal.aborted).toBe(true);
    expect(firstIsCurrent()).toBe(false);
    expect(coordinator.getGeneration('manifest_refresh')).toBe(2);

    first.resolve('stale');
    second.resolve('fresh');

    await expect(p1).resolves.toEqual({ status: 'cancelled' });
    await expect(p2).resolves.toEqual({ status: 'completed', value: 'fresh' });
    expect(coordinator.isRunning('manifest_refresh')).toBe(false);
  });

  it('déduplique les appels concurrents en mode dedupe', async () => {
    const coordinator = new AsyncThreadCoordinator();
    const deferred = createDeferred<number>();
    const task = vi.fn(async () => deferred.promise);

    const p1 = coordinator.run('session_restore', task, { mode: 'dedupe' });
    const p2 = coordinator.run('session_restore', task, { mode: 'dedupe' });

    expect(task).toHaveBeenCalledTimes(1);
    deferred.resolve(42);

    await expect(p1).resolves.toEqual({ status: 'completed', value: 42 });
    await expect(p2).resolves.toEqual({ status: 'completed', value: 42 });
  });

  it('annule proprement une tâche via cancel et cancelAll tout en restant réutilisable', async () => {
    const coordinator = new AsyncThreadCoordinator();
    const deferred1 = createDeferred<string>();
    const deferred2 = createDeferred<string>();
    let signal1!: AbortSignal;
    let signal2!: AbortSignal;

    const p1 = coordinator.run('session_restore', async ({ signal }) => {
      signal1 = signal;
      return deferred1.promise;
    });
    const p2 = coordinator.run('cloud_sync', async ({ signal }) => {
      signal2 = signal;
      return deferred2.promise;
    });

    expect(coordinator.cancel('session_restore')).toBe(true);
    expect(coordinator.cancel('session_restore')).toBe(false);
    expect(signal1.aborted).toBe(true);
    expect(signal2.aborted).toBe(false);

    coordinator.cancelAll();
    expect(signal2.aborted).toBe(true);
    expect(coordinator.getActiveThreads()).toEqual([]);

    deferred1.reject(new DOMException('Aborted', 'AbortError'));
    deferred2.resolve('late');

    await expect(p1).resolves.toEqual({ status: 'cancelled' });
    await expect(p2).resolves.toEqual({ status: 'cancelled' });

    const p3 = coordinator.run('session_restore', async () => 'recovered');
    await expect(p3).resolves.toEqual({ status: 'completed', value: 'recovered' });
  });

  it('propage les vraies erreurs lorsqu’un fil n’a pas été annulé', async () => {
    const coordinator = new AsyncThreadCoordinator();
    await expect(
      coordinator.run('cloud_sync', async () => {
        throw new Error('network_down');
      }),
    ).rejects.toThrow('network_down');
    expect(coordinator.isRunning('cloud_sync')).toBe(false);
  });
});
