'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { parseExerciseModel, type ParsedExercise } from '@/lib/exercise/exerciseParser';
import { renderExerciseBody, type FailedExercisePayload } from '@/lib/exercise/exerciseRenderer';
import { formatTime } from '@/lib/storage';
import {
  findFirstUnfinishedIndex,
  getExerciseResume,
  saveExerciseResume,
} from '@/lib/resumeStore';
import { computeLocks, getLessonPct, getQuizStats } from '@/lib/unlocks';
import { useApp } from './AppProvider';
import { MathHtml } from './MathHtml';
import { RouteViewSync } from './RouteViewSync';

const RATING_LABELS = ['À revoir', 'Presque', 'Maîtrisé'];

export interface ExerciseItemData {
  id: string;
  basePath: string;
  path?: string;
  failed?: boolean;
  error?: string;
  raw: Record<string, unknown>;
}

type ParsedSlot = (ParsedExercise & FailedExercisePayload) & { basePath: string };

function safeDataPath(rawPath: string | undefined): string {
  const s = String(rawPath ?? '').trim().replace(/^\/+/, '');
  if (!s || /[\\\u0000-\u001f]/.test(s) || /(^|\/)\.\.(\/|$)/.test(s) || /^[a-z]+:/i.test(s)) return '';
  return s.startsWith('data/') ? `/${s}` : `/data/${s}`;
}

export function ExerciseRunnerView({
  kind,
  classId,
  chapterId,
  title,
  subtitle,
  year,
  session,
  duration,
  totalPoints,
  coefficient,
  backHref,
  hashUrl,
  hasLesson,
  hasQuiz,
  quizCount,
  quizzes,
  exercises,
  initialMode,
}: {
  kind: 'chapter' | 'national';
  classId: string;
  chapterId: string;
  title: string;
  subtitle?: string;
  year?: number;
  session?: string;
  duration?: number;
  totalPoints?: number;
  coefficient?: number;
  backHref: string;
  hashUrl: string;
  hasLesson: boolean;
  hasQuiz: boolean;
  quizCount: number;
  quizzes: Array<{ id?: string; questionsCount?: number }>;
  exercises: ExerciseItemData[];
  initialMode?: 'pas' | 'examen';
}) {
  const { state, hydrated, saveState, recordLastVisited, chime, showToast } = useApp();
  const [mode, setMode] = useState<'pas' | 'examen'>(initialMode || (kind === 'national' ? 'examen' : 'pas'));
  const [idx, setIdx] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [openHints, setOpenHints] = useState<Set<string>>(() => new Set());
  const [retriedItems, setRetriedItems] = useState<Record<number, ExerciseItemData>>({});
  const [ratingDlgOpen, setRatingDlgOpen] = useState(false);
  const [dialogElapsed, setDialogElapsed] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<0 | 1 | 2>(1);
  const ratingRef = useRef<HTMLDialogElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const recordedRef = useRef('');
  const restoredKeyRef = useRef('');
  const openSolutionsRef = useRef<Set<string>>(new Set());
  const elapsedRef = useRef(0);
  const entryAtRef = useRef(0);
  const spentRef = useRef<Record<number, number>>({});

  const lockState = useMemo(() => {
    if (!hydrated || kind === 'national') return { locked: false, hint: '' };
    const lp = getLessonPct(state.l, chapterId);
    const qs = getQuizStats(state.q, classId, chapterId, quizzes, quizCount);
    const locks = computeLocks({
      classId,
      chapterId,
      hasLesson,
      hasQuiz,
      hasExercises: true,
      lessonPct: lp,
      quizPct: qs.pct,
      quizSubmitted: qs.submitted,
    });
    return { locked: locks.exercisesLocked, hint: locks.exercisesHint };
  }, [hydrated, kind, state.l, state.q, chapterId, classId, quizzes, quizCount, hasLesson, hasQuiz]);

  const effectiveExercises = useMemo(
    () => exercises.map((ex, i) => retriedItems[i] ?? ex),
    [exercises, retriedItems]
  );

  const parsedExercises = useMemo<ParsedSlot[]>(() => {
    return effectiveExercises.map((ex, i) => {
      if (ex.failed) {
        return {
          ...parseExerciseModel({ id: ex.id, number: i + 1, questions: [] }, { basePath: ex.basePath }),
          failed: true,
          error: ex.error || 'Chargement impossible.',
          basePath: ex.basePath,
        };
      }
      try {
        return {
          ...parseExerciseModel({ ...ex.raw, number: (ex.raw.number as number) || i + 1 }, { basePath: ex.basePath }),
          basePath: ex.basePath,
        };
      } catch {
        return {
          ...parseExerciseModel({ id: ex.id, number: i + 1, questions: [] }, { basePath: ex.basePath }),
          failed: true,
          error: 'Format d’exercice invalide.',
          basePath: ex.basePath,
        };
      }
    });
  }, [effectiveExercises]);

  const storeKey = kind === 'national' ? `examen-${chapterId}` : `${classId}:${chapterId}`;
  const rawStoredEntry = state.e[storeKey] ?? state.e[chapterId];

  const getRatingFor = useCallback(
    (exId: string, i: number): number | undefined => {
      if (!rawStoredEntry) return undefined;
      if (Array.isArray(rawStoredEntry)) {
        const val = rawStoredEntry[i];
        return val === 0 || val === 1 || val === 2 ? val : undefined;
      }
      const rec = rawStoredEntry as Record<string, number>;
      const val = rec[exId] ?? rec[String(i)];
      return val === 0 || val === 1 || val === 2 ? val : undefined;
    },
    [rawStoredEntry]
  );

  useEffect(() => {
    if (!hydrated || lockState.locked || !parsedExercises.length || recordedRef.current === hashUrl) return;
    recordedRef.current = hashUrl;
    recordLastVisited({
      href: hashUrl,
      title,
      kind: kind === 'national' ? 'national' : 'exo',
      chapterId: kind === 'national' ? null : chapterId,
    });
  }, [hydrated, lockState.locked, parsedExercises.length, hashUrl, title, kind, chapterId, recordLastVisited]);

  // Restore saved exercise session (index, mode, ratings/revealed, open hints & solutions, timers) once hydrated
  useEffect(() => {
    if (!hydrated || lockState.locked || !parsedExercises.length || restoredKeyRef.current === storeKey) return;
    const saved = getExerciseResume(storeKey);
    const nextRevealed: Record<number, boolean> = {};
    let ratedCount = 0;
    parsedExercises.forEach((ex, i) => {
      if (getRatingFor(ex.id, i) != null) {
        nextRevealed[i] = true;
        ratedCount++;
      }
    });
    if (Array.isArray(saved?.revealed)) {
      saved.revealed.forEach((ri) => {
        if (Number.isInteger(ri) && ri >= 0 && ri < parsedExercises.length) nextRevealed[ri] = true;
      });
    }

    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const reqExId = sp?.get('ex') || sp?.get('exerciseId') || '';
    const reqIdxStr = sp?.get('index');
    const reqMode = sp?.get('mode');

    const targetMode: 'pas' | 'examen' =
      reqMode === 'pas' || reqMode === 'examen'
        ? reqMode
        : saved?.mode === 'pas' || saved?.mode === 'examen'
          ? saved.mode
          : initialMode || (kind === 'national' ? 'examen' : 'pas');

    let targetIdx = 0;
    if (reqExId) {
      const found = parsedExercises.findIndex((ex) => ex.id === reqExId);
      if (found >= 0) targetIdx = found;
    } else if (reqIdxStr !== null && reqIdxStr !== '' && Number.isInteger(Number(reqIdxStr))) {
      targetIdx = Math.max(0, Math.min(parsedExercises.length - 1, Number(reqIdxStr)));
    } else if (saved && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < parsedExercises.length) {
      targetIdx = saved.index;
    } else if (ratedCount > 0) {
      targetIdx = findFirstUnfinishedIndex(parsedExercises.length, (i) => getRatingFor(parsedExercises[i].id, i) != null);
    }

    openSolutionsRef.current = new Set(Array.isArray(saved?.openSolutions) ? saved.openSolutions : []);
    spentRef.current = { ...(saved?.spent || {}) };
    elapsedRef.current = Math.max(0, Number(saved?.elapsedSec) || 0);
    entryAtRef.current = elapsedRef.current;

    setRevealed(nextRevealed);
    setOpenHints(new Set(Array.isArray(saved?.openHints) ? saved.openHints : []));
    setElapsedSec(elapsedRef.current);
    setMode(targetMode);
    setIdx(targetIdx);
    restoredKeyRef.current = storeKey;

    if (targetMode === 'pas' && (targetIdx > 0 || ratedCount > 0)) {
      showToast(`Reprise à l’exercice ${targetIdx + 1} / ${parsedExercises.length}`);
    }
  }, [hydrated, lockState.locked, parsedExercises, storeKey, getRatingFor, initialMode, kind, showToast]);

  const latestSnapRef = useRef<{
    storeKey: string;
    index: number;
    mode: 'pas' | 'examen';
    openHints: string[];
    revealed: number[];
    totalExercises: number;
    doneCount: number;
  } | null>(null);

  const flushResume = useCallback(() => {
    const s = latestSnapRef.current;
    if (!s || !s.storeKey || restoredKeyRef.current !== s.storeKey) return;
    const curElapsed = elapsedRef.current;
    const nextSpent = { ...spentRef.current };
    if (s.mode === 'pas') {
      nextSpent[s.index] = (nextSpent[s.index] || 0) + Math.max(0, curElapsed - entryAtRef.current);
      entryAtRef.current = curElapsed;
      spentRef.current = nextSpent;
    }
    saveExerciseResume(s.storeKey, {
      index: s.index,
      mode: s.mode,
      openHints: s.openHints,
      openSolutions: Array.from(openSolutionsRef.current),
      revealed: s.revealed,
      elapsedSec: curElapsed,
      spent: nextSpent,
      totalExercises: s.totalExercises,
      doneCount: s.doneCount,
    });
  }, []);

  useEffect(() => {
    if (!hydrated || lockState.locked || !parsedExercises.length || restoredKeyRef.current !== storeKey) return;
    const doneCount = parsedExercises.filter((ex, i) => getRatingFor(ex.id, i) != null).length;
    const revIndices = Object.entries(revealed)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => Number.isInteger(n));
    latestSnapRef.current = {
      storeKey,
      index: idx,
      mode,
      openHints: Array.from(openHints),
      revealed: revIndices,
      totalExercises: parsedExercises.length,
      doneCount,
    };
    saveExerciseResume(storeKey, {
      index: idx,
      mode,
      openHints: Array.from(openHints),
      openSolutions: Array.from(openSolutionsRef.current),
      revealed: revIndices,
      elapsedSec: elapsedRef.current,
      spent: { ...spentRef.current },
      totalExercises: parsedExercises.length,
      doneCount,
    });
  }, [hydrated, lockState.locked, storeKey, idx, mode, openHints, revealed, parsedExercises, getRatingFor]);

  useEffect(() => {
    const onHide = () => flushResume();
    window.addEventListener('pagehide', onHide);
    return () => {
      flushResume();
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushResume]);

  // Restore & track opened <details class="sol"> panels across exercises
  useEffect(() => {
    const root = rootRef.current;
    if (!root || restoredKeyRef.current !== storeKey) return;
    const syncDetailsKeys = () => {
      const scopeSelector = mode === 'examen' ? '.exo-sheet-item' : '.exo-stage';
      root.querySelectorAll(scopeSelector).forEach((scopeEl, scopePos) => {
        const exNum = mode === 'examen' ? scopePos : idx;
        scopeEl.querySelectorAll<HTMLDetailsElement>('details.sol').forEach((det, pos) => {
          const solKey = `ex-${exNum}-sol-${pos}`;
          det.dataset.solKey = solKey;
          if (openSolutionsRef.current.has(solKey) && !det.open) det.open = true;
        });
      });
    };
    const raf = requestAnimationFrame(syncDetailsKeys);
    const onToggle = (ev: Event) => {
      const det = ev.target as HTMLDetailsElement | null;
      if (!det || det.tagName !== 'DETAILS' || !det.classList.contains('sol')) return;
      const key = det.dataset.solKey;
      if (!key) return;
      if (det.open) openSolutionsRef.current.add(key);
      else openSolutionsRef.current.delete(key);
      flushResume();
    };
    root.addEventListener('toggle', onToggle, true);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('toggle', onToggle, true);
    };
  }, [storeKey, mode, idx, parsedExercises.length, flushResume]);

  // Drift-free monotonic stopwatch pausing automatically while tab is hidden
  useEffect(() => {
    if (lockState.locked || !parsedExercises.length) return;
    let accMs = elapsedRef.current * 1000;
    let lastTs = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) accMs += now - lastTs;
      lastTs = now;
      const nextSec = Math.floor(accMs / 1000);
      if (nextSec !== elapsedRef.current) {
        elapsedRef.current = nextSec;
        setElapsedSec(nextSec);
        if (nextSec % 5 === 0) flushResume();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [lockState.locked, parsedExercises.length, flushResume]);

  useEffect(() => {
    const dlg = ratingRef.current;
    if (!dlg) return;
    if (ratingDlgOpen && !dlg.open) dlg.showModal();
    else if (!ratingDlgOpen && dlg.open) dlg.close();
  }, [ratingDlgOpen]);

  const goTo = useCallback(
    (nextRaw: number, focusMode: 'stage' | 'pill' = 'stage') => {
      if (!parsedExercises.length) return;
      const next = Math.max(0, Math.min(parsedExercises.length - 1, nextRaw));
      if (next === idx) return;
      const curElapsed = elapsedRef.current;
      spentRef.current[idx] = (spentRef.current[idx] || 0) + Math.max(0, curElapsed - entryAtRef.current);
      entryAtRef.current = curElapsed;
      setIdx(next);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      requestAnimationFrame(() => {
        if (focusMode === 'stage') stageRef.current?.focus({ preventScroll: true });
      });
    },
    [idx, parsedExercises.length]
  );

  // Keyboard navigation Left/Right in step-by-step mode outside inputs/dialogs
  useEffect(() => {
    if (lockState.locked || mode !== 'pas') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]:not([hidden]), dialog[open], .modal.is-open')) return;
      goTo(idx + (e.key === 'ArrowRight' ? 1 : -1), 'stage');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lockState.locked, mode, idx, goTo]);

  const retryExercise = useCallback(
    async (retryIdx: number) => {
      const slot = effectiveExercises[retryIdx];
      const url = safeDataPath(slot?.path);
      if (!slot || !url) return;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') throw new Error('Format vide');
        setRetriedItems((prev) => ({
          ...prev,
          [retryIdx]: {
            id: slot.id || String(data.id || `ex-${retryIdx + 1}`),
            basePath: slot.basePath,
            path: slot.path,
            raw: data,
          },
        }));
      } catch {
        setRetriedItems((prev) => ({
          ...prev,
          [retryIdx]: { ...slot, failed: true, error: 'Toujours indisponible (réseau).' },
        }));
      }
    },
    [effectiveExercises]
  );

  const handleStageClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const retryBtn = target.closest('[data-a="retry"]') as HTMLElement | null;
    if (retryBtn) {
      const retryIdx = Number(retryBtn.getAttribute('data-retry'));
      if (Number.isInteger(retryIdx)) void retryExercise(retryIdx);
      return;
    }
    const btn = target.closest('[data-hint-toggle]') as HTMLElement | null;
    if (!btn) return;
    const hintId = btn.getAttribute('data-hint-toggle');
    if (!hintId) return;
    setOpenHints((prev) => {
      const next = new Set(prev);
      if (next.has(hintId)) next.delete(hintId);
      else next.add(hintId);
      return next;
    });
  };

  const openValidateDialog = () => {
    const active = parsedExercises[idx];
    if (!active || active.failed) return;
    const perExSec = (spentRef.current[idx] || 0) + Math.max(0, elapsedRef.current - entryAtRef.current);
    setDialogElapsed(perExSec);
    const existing = getRatingFor(active.id, idx);
    if (existing === 0 || existing === 1 || existing === 2) setSelectedLevel(existing);
    setRatingDlgOpen(true);
  };

  const confirmRating = () => {
    const ex = parsedExercises[idx];
    if (!ex || ex.failed) return;
    chime('ok');
    setRevealed((r) => ({ ...r, [idx]: true }));
    saveState((prev) => {
      const existing = prev.e[storeKey];
      if (Array.isArray(existing)) {
        const nextArr = existing.slice();
        nextArr[idx] = selectedLevel;
        return { ...prev, e: { ...prev.e, [storeKey]: nextArr } };
      }
      return {
        ...prev,
        e: {
          ...prev.e,
          [storeKey]: { ...(existing as Record<string, number> | undefined), [ex.id || idx]: selectedLevel },
        },
      };
    });
    setRatingDlgOpen(false);
  };

  if (lockState.locked) {
    return (
      <section id="exo">
        <RouteViewSync view="exo" />
        <header className="top">
          <Link className="back" href={backHref}>&larr; Retour</Link>
          <span className="top-title">{title}</span>
        </header>
        <section className="end">
          <div className="locked-guard-ic" aria-hidden="true"><Lock size={22} /></div>
          <h2>Exercices verrouillés</h2>
          <p className="xt">
            Complétez d’abord la leçon (au moins 10&nbsp;%) et commencez le quiz (au moins 15&nbsp;%) pour débloquer les exercices d’entraînement.
          </p>
          <div className="row">
            <Link className="btn primary" href={`/quiz/${encodeURIComponent(chapterId)}`}>Ouvrir le quiz</Link>
            <Link className="btn ghost" href={backHref}>Programme</Link>
          </div>
        </section>
      </section>
    );
  }

  if (!parsedExercises.length) {
    return (
      <section id="exo">
        <RouteViewSync view="exo" />
        <header className="top"><Link className="back" href={backHref}>&larr; Retour</Link><span className="top-title">{title}</span></header>
        <section className="end">
          <h2>Aucun exercice disponible</h2>
          <Link className="btn primary" href={backHref}>Retour</Link>
        </section>
      </section>
    );
  }

  const activeParsed = parsedExercises[idx];
  const isExam = mode === 'examen';
  const activeRating = activeParsed ? getRatingFor(activeParsed.id, idx) : undefined;
  const activeFailed = Boolean(activeParsed?.failed);

  return (
    <section ref={rootRef} id="exo" onClick={handleStageClick}>
      <RouteViewSync view="exo" />
      <header className="top">
        <Link className="back" href={backHref}>&larr; Retour</Link>
        <span className="top-title"><MathHtml text={title} /></span>
        <span className="cnt">{isExam ? `${parsedExercises.length} ex.` : `${idx + 1} / ${parsedExercises.length}`}</span>
        <span className="cnt" id="tm" role="timer" aria-label="Temps écoulé">{formatTime(elapsedSec)}</span>
        <button
          type="button"
          className={`pill${isExam ? ' is-on' : ''}`}
          aria-pressed={isExam}
          onClick={() => setMode(isExam ? 'pas' : 'examen')}
        >
          {isExam ? 'Pas à pas' : 'Feuille d’examen'}
        </button>
        <button type="button" className="pill" data-action-print onClick={() => window.print()}>Imprimer</button>
      </header>

      {isExam ? (
        <>
          <div className="print-doc-header">
            <h1><MathHtml text={title} /></h1>
            <p>
              {[
                subtitle,
                year ? `Session ${year}${session ? ` (${session})` : ''}` : '',
                duration ? `${duration} min` : '',
                totalPoints ? `${totalPoints} pts` : '',
                coefficient ? `Coeff. ${coefficient}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="exo-sheet">
            {parsedExercises.map((ex, i) => {
              const bodyHtml = renderExerciseBody(ex, {
                index: i,
                basePath: ex.basePath,
                showSol: true,
                openSol: Boolean(revealed[i]),
                openHints,
                keyPrefix: `e${i}`,
              });
              return (
                <section key={`${ex.id}-${i}`} className="exo-sheet-item">
                  <h2 className="exo-sheet-title">
                    Exercice {ex.number || i + 1}
                    {ex.points ? <span className="exo-bareme">{ex.points} pts</span> : null}
                  </h2>
                  <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="exo-pills" id="exercise-pills" role="group" aria-label="Exercices">
            {parsedExercises.map((ex, i) => {
              const rating = getRatingFor(ex.id, i);
              const isActive = i === idx;
              const isFailed = Boolean(ex.failed);
              const stateText = isFailed
                ? ', indisponible'
                : rating != null && RATING_LABELS[rating]
                  ? `, ${RATING_LABELS[rating].toLowerCase()}`
                  : '';
              return (
                <button
                  key={`${ex.id}-${i}`}
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`Exercice ${i + 1}${stateText}`}
                  className={`exo-pill${isActive ? ' is-active' : ''}${rating != null ? ` is-rated-${rating}` : ''}${isFailed ? ' is-failed' : ''}`}
                  onClick={() => goTo(i, 'pill')}
                >
                  Ex. {i + 1}
                </button>
              );
            })}
          </div>

          <section
            ref={stageRef}
            tabIndex={-1}
            className="exo-stage"
            dangerouslySetInnerHTML={{
              __html: renderExerciseBody(activeParsed, {
                index: idx,
                basePath: activeParsed.basePath,
                showSol: Boolean(revealed[idx]),
                openSol: Boolean(revealed[idx]),
                openHints,
                keyPrefix: `e${idx}`,
              }),
            }}
          />

          <div className="act">
            <button type="button" className="btn ghost" disabled={idx <= 0} onClick={() => goTo(idx - 1, 'stage')}>
              Précédent
            </button>
            {activeRating != null ? (
              <span className={`cnt exo-rating-tag is-rated-${activeRating}`} data-rating={activeRating}>
                {RATING_LABELS[activeRating]}
              </span>
            ) : null}
            <button type="button" className="btn primary" disabled={activeFailed} onClick={openValidateDialog}>
              Valider l’exercice
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={idx >= parsedExercises.length - 1}
              onClick={() => goTo(idx + 1, 'stage')}
            >
              Suivant
            </button>
          </div>
        </>
      )}

      <dialog
        ref={ratingRef}
        id="dlg"
        onClose={() => setRatingDlgOpen(false)}
        onClick={(e) => { if (e.target === ratingRef.current) setRatingDlgOpen(false); }}
      >
        <div>
          <h2>Exercice terminé ?</h2>
          <p id="dt">Temps passé : {formatTime(dialogElapsed)}</p>
          <p style={{ marginBottom: 8 }}>Comment l’avez-vous trouvé ?</p>
          <div className="chips">
            {([
              [0, 'Difficile'],
              [1, 'Correct'],
              [2, 'Facile'],
            ] as Array<[0 | 1 | 2, string]>).map(([val, lbl]) => (
              <label key={val}>
                <input
                  type="radio"
                  name="lv"
                  value={val}
                  checked={selectedLevel === val}
                  onChange={() => setSelectedLevel(val)}
                />
                {lbl}
              </label>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => setRatingDlgOpen(false)}>Annuler</button>
            <button type="button" className="btn primary" onClick={confirmRating}>Enregistrer</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
