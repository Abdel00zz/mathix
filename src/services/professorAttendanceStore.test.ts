/**
 * Présence de séance — mécanisme réactif.
 *
 * Vérifie les trois propriétés sur lesquelles repose l'ouverture dynamique de
 * la page « élèves présents » : lecture serveur, publication immédiate après un
 * appel, et resynchronisation dès qu'un changement de séance est annoncé
 * (déclaration faite sur le PC ou depuis les paramètres de la tablette).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPresent = vi.fn<(classId: string) => Promise<string[]>>(async () => ['s1']);

vi.mock('./professorClassroomService', () => ({
  SESSION_UPDATED_EVENT: 'mathplus:session-updated',
  professorClassroomService: { getPresent: (classId: string) => getPresent(classId) },
}));

vi.mock('./professorSessionService', () => ({
  professorSessionService: { isProfessor: () => true },
}));

import { professorAttendanceStore } from './professorAttendanceStore';

const runListeners = new Map<string, Set<() => void>>();
const fakeWindow = {
  addEventListener: (type: string, listener: () => void) => {
    if (!runListeners.has(type)) runListeners.set(type, new Set());
    runListeners.get(type)!.add(listener);
  },
  removeEventListener: (type: string, listener: () => void) => {
    runListeners.get(type)?.delete(listener);
  },
  dispatchEvent: (event: { type: string }) => {
    runListeners.get(event.type)?.forEach(listener => listener());
    return true;
  },
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  getPresent.mockClear();
  getPresent.mockResolvedValue(['s1']);
  runListeners.clear();
  vi.stubGlobal('window', fakeWindow);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('professorAttendanceStore', () => {
  it('publie la présence lue sur le serveur', async () => {
    const seen: number[] = [];
    const unsubscribe = professorAttendanceStore.subscribe(() => seen.push(professorAttendanceStore.getSnapshot().presentIds.length));

    await professorAttendanceStore.refresh('c1');

    expect(getPresent).toHaveBeenCalledWith('c1');
    expect(professorAttendanceStore.getSnapshot()).toMatchObject({ classId: 'c1', presentIds: ['s1'], loaded: true });
    expect(seen).toContain(1);
    unsubscribe();
  });

  it('publie immédiatement un appel enregistré sur cet appareil', () => {
    const unsubscribe = professorAttendanceStore.subscribe(() => {});
    professorAttendanceStore.apply('c1', ['a', 'b']);
    expect(professorAttendanceStore.getSnapshot()).toMatchObject({ presentIds: ['a', 'b'], loaded: true });
    unsubscribe();
  });

  it('se resynchronise quand un appel est annoncé ailleurs', async () => {
    const unsubscribe = professorAttendanceStore.subscribe(() => {});
    await professorAttendanceStore.refresh('c1');
    expect(getPresent).toHaveBeenCalledTimes(1);

    // Même événement que celui émis par `setPresent` (console PC, tablette).
    fakeWindow.dispatchEvent({ type: 'mathplus:session-updated' });
    await flush();

    expect(getPresent).toHaveBeenCalledTimes(2);
    expect(getPresent).toHaveBeenLastCalledWith('c1');
    unsubscribe();
  });

  it('ne garde rien en mémoire quand plus personne n’écoute', () => {
    const unsubscribe = professorAttendanceStore.subscribe(() => {});
    professorAttendanceStore.apply('c1', ['a']);
    unsubscribe();
    expect(professorAttendanceStore.getSnapshot()).toMatchObject({ classId: '', presentIds: [], loaded: false });
    expect(runListeners.get('mathplus:session-updated')?.size ?? 0).toBe(0);
  });
});
