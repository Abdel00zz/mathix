import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mark } from './core';
import { annotationsStore } from '../../../utils/annotationsStore';
import { teacherCanvasSyncService } from '../../../services/teacherCanvasSyncService';

const MAX_HISTORY = 60;

const genMarkId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/** Union append-only par identifiant ; les traits sans id suivent l'horloge (LWW). */
function mergeMarks(local: Mark[], cloud: Mark[], localAt: number, cloudAt: number): Mark[] {
  const localHasIds = local.some(m => m.id);
  if (!localHasIds) return cloudAt >= localAt ? cloud : local;
  const cloudIds = new Set(cloud.map(m => m.id).filter((id): id is string => !!id));
  const merged = [...cloud];
  for (const m of local) {
    if (m.id && !cloudIds.has(m.id)) merged.push(m);
  }
  return merged;
}

interface AnnotationHistory {
  past: Mark[][];
  future: Mark[][];
}

/**
 * Historique de session partagé par zone.
 *
 * La zone ouverte est démontée lorsqu'elle est repliée. Sans ce cache mémoire,
 * les annotations restent présentes mais Annuler/Rétablir repartent à zéro à
 * chaque réouverture. Le cache ne persiste pas entre deux chargements de page :
 * il prolonge uniquement la session d'édition courante.
 */
const historyByDocument = new Map<string, AnnotationHistory>();

const getDocumentHistory = (docKey: string): AnnotationHistory => {
  const existing = historyByDocument.get(docKey);
  if (existing) return existing;
  const created: AnnotationHistory = { past: [], future: [] };
  historyByDocument.set(docKey, created);
  return created;
};

/**
 * État des annotations d'une fiche : liste de marks + historique undo/redo +
 * persistance différée dans la slice locale. La source de vérité en session est
 * ce hook ; le store localStorage est la persistance.
 *
 * Le composant hôte est monté avec `key={docKey}` : chaque fiche obtient une
 * instance fraîche, pas besoin d'effet de rechargement.
 */
export function useAnnotationEngine(docKey: string) {
  const [marks, setMarks] = useState<Mark[]>(() => annotationsStore.getMarks(docKey));
  const [past, setPast] = useState<Mark[][]>(() => getDocumentHistory(docKey).past);
  const [future, setFuture] = useState<Mark[][]>(() => getDocumentHistory(docKey).future);

  // Miroir synchrone pour les fermetures d'event handlers (commit/undo/redo).
  const marksRef = useRef(marks);
  useLayoutEffect(() => {
    marksRef.current = marks;
  }, [marks]);

  const persist = useCallback((next: Mark[]) => {
    annotationsStore.setMarks(docKey, next);
    teacherCanvasSyncService.scheduleSave(docKey, { marks: next, updatedAt: Date.now(), v: 2 });
  }, [docKey]);

  useEffect(() => {
    let active = true;
    void teacherCanvasSyncService.load(docKey).then((cloud) => {
      if (!active || !cloud) return;
      const local = annotationsStore.getDrawing(docKey);
      if (!local || !local.marks.length) {
        marksRef.current = cloud.marks;
        setMarks(cloud.marks);
        annotationsStore.setMarks(docKey, cloud.marks);
        return;
      }
      if (!cloud.marks.length) {
        teacherCanvasSyncService.scheduleSave(docKey, local);
        return;
      }
      const merged = mergeMarks(local.marks, cloud.marks, local.updatedAt, cloud.updatedAt);
      if (merged.length !== local.marks.length) {
        marksRef.current = merged;
        setMarks(merged);
        annotationsStore.setMarks(docKey, merged);
        teacherCanvasSyncService.scheduleSave(docKey, { marks: merged, updatedAt: Date.now(), v: 2 });
      }
    });
    return () => { active = false; };
  }, [docKey]);

  const apply = useCallback(
    (next: Mark[]) => {
      const prev = marksRef.current;
      const history = getDocumentHistory(docKey);
      const appendedPast = [...history.past, prev];
      const nextPast = appendedPast.length > MAX_HISTORY
        ? appendedPast.slice(appendedPast.length - MAX_HISTORY)
        : appendedPast;
      history.past = nextPast;
      history.future = [];
      setPast(nextPast);
      setFuture(history.future);
      marksRef.current = next;
      persist(next);
      setMarks(next);
    },
    [docKey, persist]
  );

  const commit = useCallback((mark: Mark) => apply([...marksRef.current, mark.id ? mark : { ...mark, id: genMarkId() }]), [apply]);
  const setAll = useCallback((next: Mark[]) => apply(next), [apply]);

  const undo = useCallback(() => {
    const history = getDocumentHistory(docKey);
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    // Capturer l'état courant AVANT de réassigner marksRef : les updateurs de
    // setState s'exécutent plus tard et liraient sinon la nouvelle valeur.
    const current = marksRef.current;
    history.future = [...history.future, current];
    history.past = history.past.slice(0, -1);
    setFuture(history.future);
    setPast(history.past);
    marksRef.current = prev;
    persist(prev);
    setMarks(prev);
  }, [docKey, persist]);

  const redo = useCallback(() => {
    const history = getDocumentHistory(docKey);
    if (history.future.length === 0) return;
    const next = history.future[history.future.length - 1];
    const current = marksRef.current;
    history.past = [...history.past, current];
    history.future = history.future.slice(0, -1);
    setPast(history.past);
    setFuture(history.future);
    marksRef.current = next;
    persist(next);
    setMarks(next);
  }, [docKey, persist]);

  const clear = useCallback(() => {
    if (marksRef.current.length === 0) return;
    apply([]);
  }, [apply]);

  // Flush à la fermeture de l'onglet / démontage.
  useEffect(() => {
    const flush = () => annotationsStore.flush();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      annotationsStore.flush();
    };
  }, []);

  return {
    marks,
    commit,
    setMarks: setAll,
    undo,
    redo,
    clear,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    hasContent: marks.length > 0,
  };
}
