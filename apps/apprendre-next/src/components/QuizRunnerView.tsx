'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { contentToPlainText } from '@/lib/lesson/leconSearch';
import {
  evaluateAnswer,
  formatComparison,
  isAnswerable,
  normalizeQuestion,
  type NormalizedQuizQuestion,
  type QuizAnswer,
  type QuizDraft,
} from '@/lib/quiz/quizEngine';
import { formatTime } from '@/lib/storage';
import {
  clearQuizResume,
  findFirstUnfinishedIndex,
  getChapterActiveQuiz,
  getQuizResume,
  saveChapterActiveQuiz,
  saveQuizResume,
} from '@/lib/resumeStore';
import { computeLocks, getLessonPct, isEntrySubmitted } from '@/lib/unlocks';
import { useApp } from './AppProvider';
import { MathHtml } from './MathHtml';
import { RouteViewSync } from './RouteViewSync';

function extractCloudScores(entry: unknown): Array<number | null> {
  if (Array.isArray(entry)) {
    return entry.map((v) => (v === 1 || v === 0 || v === -1 ? v : null));
  }
  if (entry && typeof entry === 'object' && Array.isArray((entry as { answers?: unknown[] }).answers)) {
    return ((entry as { answers: unknown[] }).answers).map((v) => (v === 1 || v === 0 || v === -1 ? v : null));
  }
  return [];
}

export interface QuizSerieData {
  id: string;
  title: string;
  basePath: string;
  timePerQuestion: number | null;
  questions: unknown[];
}

export function QuizRunnerView({
  kind,
  classId,
  chapterId,
  title,
  backHref,
  hashUrl,
  hasLesson,
  quizzes,
  initialQuizId,
}: {
  kind: 'chapter' | 'concours';
  classId: string;
  chapterId: string;
  title: string;
  backHref: string;
  hashUrl: string;
  hasLesson: boolean;
  quizzes: QuizSerieData[];
  initialQuizId?: string;
}) {
  const { profile, state, hydrated, saveState, updateProfile, recordLastVisited, chime, showToast } = useApp();
  const [selectedQuizId, setSelectedQuizId] = useState<string>(
    () => (initialQuizId && quizzes.find((q) => q.id === initialQuizId)?.id) || quizzes[0]?.id || ''
  );
  const pickedInitialRef = useRef(false);
  const restoredSessionRef = useRef('');

  const activeSerie = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId) || quizzes[0] || null,
    [quizzes, selectedQuizId]
  );

  const chapterKey = `${kind}:${classId}:${chapterId}`;
  const sessionKey = activeSerie ? `${chapterKey}:${activeSerie.id}` : '';
  const storeKey = activeSerie
    ? kind === 'concours'
      ? `concours-${chapterId}-${activeSerie.id}`
      : quizzes.length > 1
        ? `${classId}:${chapterId}:${activeSerie.id}`
        : `${classId}:${chapterId}`
    : '';

  const questions = useMemo<NormalizedQuizQuestion[]>(() => {
    if (!activeSerie) return [];
    return activeSerie.questions.map((raw, idx) => normalizeQuestion(raw, idx, activeSerie.basePath));
  }, [activeSerie]);

  const lockState = useMemo(() => {
    if (!hydrated || kind === 'concours') return { quizLocked: false, quizHint: '' };
    const lp = getLessonPct(state.l, chapterId);
    const locks = computeLocks({
      classId,
      chapterId,
      hasLesson,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: lp,
      quizPct: 0,
      quizSubmitted: false,
    });
    return { quizLocked: locks.quizLocked, quizHint: locks.quizHint };
  }, [hydrated, kind, state.l, chapterId, classId, hasLesson]);

  const [phase, setPhase] = useState<'run' | 'end'>('run');
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, QuizDraft>>({});
  const [answers, setAnswers] = useState<Record<number, QuizAnswer>>({});
  const [skippedMap, setSkippedMap] = useState<Record<number, boolean>>({});
  const [reviewQueue, setReviewQueue] = useState<number[] | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [notice, setNotice] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const remainingByIdxRef = useRef<Record<number, number>>({});
  const prevTiersTempsRef = useRef<boolean | null>(null);

  const curQuestionIndex = reviewQueue ? reviewQueue[idx] : idx;
  const totalCount = reviewQueue ? reviewQueue.length : questions.length;
  const currentQ = questions[curQuestionIndex] || null;
  const currentAnswer = answers[curQuestionIndex] || null;
  const currentDraft = useMemo(() => drafts[curQuestionIndex] ?? {}, [drafts, curQuestionIndex]);

  const recordedRef = useRef('');
  useEffect(() => {
    if (!hydrated || lockState.quizLocked || !questions.length) return;
    const effectiveHref =
      quizzes.length > 1 && activeSerie ? `${hashUrl}?quiz=${encodeURIComponent(activeSerie.id)}` : hashUrl;
    if (recordedRef.current === effectiveHref) return;
    recordedRef.current = effectiveHref;
    recordLastVisited({
      href: effectiveHref,
      title: activeSerie?.title || title,
      kind: kind === 'concours' ? 'concours' : 'quiz',
      chapterId: kind === 'concours' ? null : chapterId,
    });
  }, [hydrated, lockState.quizLocked, questions.length, quizzes.length, hashUrl, activeSerie, title, kind, chapterId, recordLastVisited]);

  // Countdown per question
  const baseLimitSec =
    (currentQ && currentQ.timeLimit) ||
    activeSerie?.timePerQuestion ||
    profile.quizTimePerQuestion ||
    120;
  const countdownTotal = profile.tiersTemps ? Math.round(baseLimitSec * 1.33) : baseLimitSec;
  const [secLeft, setSecLeft] = useState(countdownTotal);

  useEffect(() => {
    const savedRem = remainingByIdxRef.current[curQuestionIndex];
    setSecLeft(typeof savedRem === 'number' && savedRem > 0 ? savedRem : countdownTotal);
    setNotice('');
  }, [curQuestionIndex, selectedQuizId, phase, countdownTotal]);

  useEffect(() => {
    if (prevTiersTempsRef.current === null) {
      prevTiersTempsRef.current = profile.tiersTemps;
      return;
    }
    if (prevTiersTempsRef.current === profile.tiersTemps) return;
    prevTiersTempsRef.current = profile.tiersTemps;
    setSecLeft((cur) => {
      const next = profile.tiersTemps ? Math.round(cur * 1.33) : Math.max(1, Math.round(cur / 1.33));
      remainingByIdxRef.current[curQuestionIndex] = next;
      return next;
    });
  }, [profile.tiersTemps, curQuestionIndex]);

  // Restore last active series & quiz session progress once hydrated
  useEffect(() => {
    if (!hydrated || pickedInitialRef.current) return;
    pickedInitialRef.current = true;
    if (!initialQuizId && quizzes.length > 1) {
      const lastSerieId = getChapterActiveQuiz(chapterKey);
      if (lastSerieId && lastSerieId !== selectedQuizId && quizzes.some((q) => q.id === lastSerieId)) {
        setSelectedQuizId(lastSerieId);
      }
    }
  }, [hydrated, initialQuizId, quizzes, chapterKey, selectedQuizId]);

  useEffect(() => {
    if (!hydrated || lockState.quizLocked || !activeSerie || !sessionKey || restoredSessionRef.current === sessionKey) return;
    saveChapterActiveQuiz(chapterKey, activeSerie.id);
    const saved = getQuizResume(sessionKey);
    const cloudEntry = state.q[storeKey] ?? (quizzes.length === 1 ? state.q[chapterId] : undefined);
    const cloudArr = extractCloudScores(cloudEntry);

    const nextAnswers: Record<number, QuizAnswer> = {};
    if (saved?.answers) {
      for (const [k, ans] of Object.entries(saved.answers)) {
        const qi = Number(k);
        if (Number.isInteger(qi) && qi >= 0 && qi < questions.length && ans) nextAnswers[qi] = ans;
      }
    }
    const nextSkipped: Record<number, boolean> = {};
    if (Array.isArray(saved?.skipped)) {
      saved.skipped.forEach((qi) => {
        if (Number.isInteger(qi) && qi >= 0 && qi < questions.length && !nextAnswers[qi]) nextSkipped[qi] = true;
      });
    }
    cloudArr.forEach((score, i) => {
      if (i >= questions.length) return;
      if ((score === 1 || score === 0) && !nextAnswers[i]) {
        nextAnswers[i] = {
          status: 'answered',
          isCorrect: score === 1,
          selectedIndex: score === 1 ? questions[i]?.correctIndex : undefined,
        };
        delete nextSkipped[i];
      } else if (score === -1 && !nextAnswers[i]) {
        nextSkipped[i] = true;
      }
    });

    const nextDrafts: Record<number, QuizDraft> = {};
    if (saved?.drafts) {
      for (const [k, d] of Object.entries(saved.drafts)) {
        const qi = Number(k);
        if (Number.isInteger(qi) && qi >= 0 && qi < questions.length && d) nextDrafts[qi] = d;
      }
    }

    remainingByIdxRef.current = { ...(saved?.remainingByIdx || {}) };
    const cleanReview = Array.isArray(saved?.reviewQueue)
      ? saved.reviewQueue.filter((qi) => Number.isInteger(qi) && qi >= 0 && qi < questions.length)
      : null;
    const validReview = cleanReview && cleanReview.length > 0 ? cleanReview : null;

    let nextPhase: 'run' | 'end' = 'run';
    let nextIdx = 0;
    const queueLen = validReview ? validReview.length : questions.length;
    if (saved?.phase === 'end' && questions.length > 0) {
      nextPhase = 'end';
    } else if (saved && Number.isInteger(saved.idx) && queueLen > 0) {
      nextIdx = Math.max(0, Math.min(queueLen - 1, saved.idx));
    } else if (cloudArr.some((v) => v != null) && questions.length > 0) {
      if (isEntrySubmitted(cloudEntry, questions.length)) {
        nextPhase = 'end';
      } else {
        nextIdx = findFirstUnfinishedIndex(questions.length, (i) => Boolean(nextAnswers[i] || nextSkipped[i]));
      }
    }

    setAnswers(nextAnswers);
    setDrafts(nextDrafts);
    setSkippedMap(nextSkipped);
    setReviewQueue(validReview);
    setElapsedSec(saved?.elapsedSec ?? 0);
    setPhase(nextPhase);
    setIdx(nextIdx);
    const activeQIdx = validReview ? validReview[nextIdx] : nextIdx;
    const activeQ = questions[activeQIdx];
    const baseSec = (activeQ && activeQ.timeLimit) || activeSerie.timePerQuestion || profile.quizTimePerQuestion || 120;
    const defSec = profile.tiersTemps ? Math.round(baseSec * 1.33) : baseSec;
    const restoredSec = remainingByIdxRef.current[activeQIdx];
    setSecLeft(typeof restoredSec === 'number' && restoredSec > 0 ? restoredSec : defSec);
    setNotice('');
    restoredSessionRef.current = sessionKey;

    const answeredCount = Object.values(nextAnswers).filter((a) => a.status === 'answered').length;
    if (nextPhase === 'run' && (nextIdx > 0 || answeredCount > 0)) {
      showToast(`Reprise à la question ${nextIdx + 1} / ${Math.max(1, queueLen)}`);
    }
  }, [
    hydrated,
    lockState.quizLocked,
    activeSerie,
    sessionKey,
    chapterKey,
    storeKey,
    chapterId,
    quizzes.length,
    state.q,
    questions,
    profile.quizTimePerQuestion,
    profile.tiersTemps,
    showToast,
  ]);

  const latestResumeRef = useRef<{
    sessionKey: string;
    selectedQuizId: string;
    phase: 'run' | 'end';
    idx: number;
    answers: Record<number, QuizAnswer>;
    drafts: Record<number, QuizDraft>;
    skippedMap: Record<number, boolean>;
    elapsedSec: number;
    reviewQueue: number[] | null;
    totalQuestions: number;
  } | null>(null);

  const flushResume = useCallback(() => {
    const snap = latestResumeRef.current;
    if (!snap || !snap.sessionKey || restoredSessionRef.current !== snap.sessionKey) return;
    const skipped = Object.entries(snap.skippedMap)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => Number.isInteger(n));
    const answeredCount = Object.values(snap.answers).filter((a) => a.status === 'answered').length;
    saveQuizResume(snap.sessionKey, {
      selectedQuizId: snap.selectedQuizId,
      phase: snap.phase,
      idx: snap.idx,
      answers: snap.answers,
      drafts: snap.drafts,
      skipped,
      remainingByIdx: { ...remainingByIdxRef.current },
      elapsedSec: snap.elapsedSec,
      reviewQueue: snap.reviewQueue,
      totalQuestions: snap.totalQuestions,
      answeredCount,
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !activeSerie || !sessionKey || restoredSessionRef.current !== sessionKey) return;
    latestResumeRef.current = {
      sessionKey,
      selectedQuizId: activeSerie.id,
      phase,
      idx,
      answers,
      drafts,
      skippedMap,
      elapsedSec,
      reviewQueue,
      totalQuestions: questions.length,
    };
    flushResume();
  }, [hydrated, activeSerie, sessionKey, phase, idx, answers, drafts, skippedMap, elapsedSec, reviewQueue, questions.length, flushResume]);

  useEffect(() => {
    const onHide = () => flushResume();
    window.addEventListener('pagehide', onHide);
    return () => {
      flushResume();
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushResume]);

  const resetSession = useCallback(() => {
    if (sessionKey) clearQuizResume(sessionKey);
    remainingByIdxRef.current = {};
    setAnswers({});
    setDrafts({});
    setSkippedMap({});
    setReviewQueue(null);
    setIdx(0);
    setElapsedSec(0);
    setNotice('');
    setPhase('run');
    setSecLeft(countdownTotal);
  }, [sessionKey, countdownTotal]);

  const persistToState = useCallback(
    (nextAnswers: Record<number, QuizAnswer>, finished = false, nextSkipped: Record<number, boolean> = skippedMap) => {
      if (!activeSerie || !storeKey) return;
      const arr = questions.map((_, i) =>
        nextAnswers[i]?.isCorrect ? 1 : nextAnswers[i] ? 0 : nextSkipped[i] ? -1 : null
      );
      saveState((prev) => ({
        ...prev,
        q: {
          ...prev.q,
          [storeKey]: finished ? { answers: arr, isSubmitted: true } : (arr as number[]),
        },
      }));
    },
    [activeSerie, storeKey, questions, skippedMap, saveState]
  );

  const submitQuestion = useCallback(
    (timedOut = false, draftOverride?: QuizDraft) => {
      if (!currentQ || answers[curQuestionIndex]?.status === 'answered') return;
      const effectiveDraft = draftOverride || currentDraft;
      if (!timedOut && !draftOverride && !isAnswerable(currentQ, effectiveDraft)) {
        setNotice('Veuillez choisir ou saisir une réponse avant de valider.');
        return;
      }
      setNotice('');
      remainingByIdxRef.current[curQuestionIndex] = secLeft;
      const evalRes = evaluateAnswer(currentQ, effectiveDraft);
      const ans: QuizAnswer = timedOut ? { ...evalRes, timedOut: true } : evalRes;
      chime(ans.isCorrect ? 'ok' : 'bad');
      const nextMap = { ...answers, [curQuestionIndex]: ans };
      const nextSkip = { ...skippedMap };
      delete nextSkip[curQuestionIndex];
      setAnswers(nextMap);
      setSkippedMap(nextSkip);
      persistToState(nextMap, false, nextSkip);
      requestAnimationFrame(() => {
        feedbackRef.current?.focus({ preventScroll: true });
      });
    },
    [currentQ, answers, curQuestionIndex, currentDraft, secLeft, skippedMap, chime, persistToState]
  );

  useEffect(() => {
    if (lockState.quizLocked || phase !== 'run' || !currentQ || currentAnswer?.status === 'answered') return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setElapsedSec((e) => {
        const nextE = e + 1;
        if (nextE % 5 === 0) queueMicrotask(flushResume);
        return nextE;
      });
      setSecLeft((s) => {
        if (s <= 1) {
          remainingByIdxRef.current[curQuestionIndex] = 0;
          submitQuestion(true);
          return 0;
        }
        const nextS = s - 1;
        remainingByIdxRef.current[curQuestionIndex] = nextS;
        return nextS;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockState.quizLocked, phase, currentQ, currentAnswer?.status, curQuestionIndex, submitQuestion, flushResume]);

  const goPrev = useCallback(() => {
    setNotice('');
    setIdx((prev) => Math.max(0, prev - 1));
  }, []);

  const goNext = useCallback(() => {
    setNotice('');
    if (idx < totalCount - 1) {
      setIdx(idx + 1);
    } else {
      persistToState(answers, true, skippedMap);
      setPhase('end');
    }
  }, [idx, totalCount, persistToState, answers, skippedMap]);

  const skipQuestion = useCallback(() => {
    if (!currentQ || answers[curQuestionIndex]?.status === 'answered') return;
    setNotice('');
    const nextSkip = { ...skippedMap, [curQuestionIndex]: true };
    setSkippedMap(nextSkip);
    persistToState(answers, false, nextSkip);
    if (idx < totalCount - 1) {
      setIdx(idx + 1);
    } else {
      persistToState(answers, true, nextSkip);
      setPhase('end');
    }
  }, [currentQ, answers, curQuestionIndex, skippedMap, persistToState, idx, totalCount]);

  // Keyboard shortcuts
  useEffect(() => {
    if (lockState.quizLocked || phase !== 'run' || !currentQ) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"], .modal.is-open')) return;
      const target = e.target as HTMLElement;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        if (e.key === 'Enter' && target.dataset.quizInput !== undefined) {
          e.preventDefault();
          if (currentAnswer?.status === 'answered') goNext();
          else submitQuestion(false);
        }
        return;
      }
      const key = e.key.toUpperCase();
      const answered = currentAnswer?.status === 'answered';
      if (e.key === 'Enter') {
        e.preventDefault();
        if (answered) goNext();
        else submitQuestion(false);
        return;
      }
      if (e.key === 'ArrowLeft') {
        goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        if (answered) goNext();
        else skipQuestion();
        return;
      }
      if (answered) return;
      if ((currentQ.type === 'mcq' && currentQ.options) || (currentQ.type === 'error' && currentQ.steps)) {
        const listLen = currentQ.type === 'error' ? (currentQ.steps?.length ?? 0) : (currentQ.options?.length ?? 0);
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const pick = letters.indexOf(key) >= 0 ? letters.indexOf(key) : ['1', '2', '3', '4', '5', '6'].indexOf(key);
        if (pick >= 0 && pick < listLen) {
          setNotice('');
          setDrafts((d) => ({ ...d, [curQuestionIndex]: { ...d[curQuestionIndex], selectedIndex: pick } }));
          chime('tick');
        }
      } else if (currentQ.type === 'boolean') {
        if (key === 'V' || key === '1') {
          setNotice('');
          setDrafts((d) => ({ ...d, [curQuestionIndex]: { selectedIndex: 0 } }));
        } else if (key === 'F' || key === '2') {
          setNotice('');
          setDrafts((d) => ({ ...d, [curQuestionIndex]: { selectedIndex: 1 } }));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lockState.quizLocked, phase, currentQ, currentAnswer?.status, curQuestionIndex, submitQuestion, goPrev, goNext, skipQuestion, chime]);

  if (lockState.quizLocked) {
    return (
      <section id="quiz">
        <RouteViewSync view="quiz" />
        <header className="top">
          <Link className="back" href={backHref}>&larr; Retour</Link>
          <span className="top-title">{title}</span>
        </header>
        <section className="end">
          <div className="locked-guard-ic" aria-hidden="true"><Lock size={22} /></div>
          <h2>Quiz verrouillé</h2>
          <p className="xt">Parcourez au moins 10&nbsp;% de la leçon avant de passer au quiz.</p>
          <div className="row">
            <Link className="btn primary" href={`/lecon/${encodeURIComponent(chapterId)}`}>Ouvrir la leçon</Link>
            <Link className="btn ghost" href={backHref}>Programme</Link>
          </div>
        </section>
      </section>
    );
  }

  if (!questions.length || !currentQ) {
    return (
      <section id="quiz">
        <RouteViewSync view="quiz" />
        <header className="top"><Link className="back" href={backHref}>&larr; Retour</Link><span className="top-title">{title}</span></header>
        <section className="end">
          <h2>Aucun quiz disponible</h2>
          <Link className="btn primary" href={backHref}>Retour</Link>
        </section>
      </section>
    );
  }

  if (phase === 'end') {
    const total = questions.length;
    const correctCount = Object.values(answers).filter((a) => a.isCorrect).length;
    const skippedCount = questions.filter((_, i) => !answers[i] || answers[i].status !== 'answered').length;
    const errorIndices = questions.map((_, i) => i).filter((i) => !answers[i] || !answers[i].isCorrect);
    const pct = Math.round((correctCount / Math.max(1, total)) * 100);
    return (
      <section id="quiz">
        <RouteViewSync view="quiz" />
        <header className="top">
          <Link className="back" href={backHref}>&larr; Retour</Link>
          <span className="top-title"><MathHtml text={activeSerie?.title || title} /></span>
        </header>
        <section className="end">
          <div className="ring" style={{ '--p': pct } as React.CSSProperties} role="img" aria-label={`${pct} pour cent de réussite`}><b>{pct}%</b></div>
          <h2 tabIndex={-1}>{correctCount} / {total} bonnes réponses</h2>
          <p className="xt">{skippedCount ? `${skippedCount} question(s) passée(s) · ` : ''}Durée : {formatTime(elapsedSec)}</p>
          <div className="row">
            {errorIndices.length > 0 ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setReviewQueue(errorIndices);
                  setIdx(0);
                  setNotice('');
                  setPhase('run');
                }}
              >
                Revoir les erreurs ({errorIndices.length})
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              onClick={resetSession}
            >
              Recommencer
            </button>
            <Link className="btn ghost" href={backHref}>Retour</Link>
          </div>
        </section>
      </section>
    );
  }

  const pct = totalCount > 0 ? Math.round(((idx + 1) / totalCount) * 100) : 0;
  const answered = currentAnswer?.status === 'answered';
  const selChoice = answered ? (currentAnswer?.selectedIndex ?? -1) : (currentDraft.selectedIndex ?? -1);
  const cmp = answered && currentAnswer ? formatComparison(currentQ, currentAnswer) : null;
  const getChoiceVisual = (i: number) => {
    const isSel = selChoice === i;
    const isOk = i === currentQ.correctIndex;
    return {
      isSel,
      stClass: !answered ? (isSel ? 'is-selected' : '') : isOk ? 'ok' : isSel ? 'bad' : 'dim',
      mark: !answered ? '' : isOk ? '✓' : isSel ? '✗' : '',
      srHint: !answered ? '' : isOk ? 'bonne réponse' : isSel ? 'réponse choisie, incorrecte' : '',
    };
  };

  return (
    <section id="quiz">
      <RouteViewSync view="quiz" />
      <header className="top">
        <Link className="back" href={backHref}>&larr; Retour</Link>
        {quizzes.length > 1 ? (
          <select
            className="quiz-select"
            aria-label="Série"
            value={selectedQuizId}
            onChange={(e) => {
              flushResume();
              restoredSessionRef.current = '';
              setSelectedQuizId(e.target.value);
              setAnswers({});
              setDrafts({});
              setSkippedMap({});
              remainingByIdxRef.current = {};
              setReviewQueue(null);
              setIdx(0);
              setElapsedSec(0);
              setNotice('');
              setPhase('run');
            }}
          >
            {quizzes.map((qz) => (
              <option key={qz.id} value={qz.id}>{contentToPlainText(qz.title)}</option>
            ))}
          </select>
        ) : (
          <span className="top-title"><MathHtml text={activeSerie?.title || title} /></span>
        )}
        <span className="cnt">{idx + 1} / {totalCount}</span>
        <button
          type="button"
          className={`pill quiz-tt-pill${profile.tiersTemps ? ' is-on' : ''}`}
          id="quiz-tiers-temps-badge"
          aria-pressed={profile.tiersTemps}
          title="Tiers-temps (+33%)"
          onClick={() => updateProfile({ tiersTemps: !profile.tiersTemps })}
        >
          +33%
        </button>
        <span className={`cnt${secLeft <= 10 ? ' tm-crit' : secLeft <= 20 ? ' tm-warn' : ''}`} id="tm" role="timer" aria-label="Temps restant">
          {formatTime(secLeft)}
        </span>
      </header>

      <div className="bar" role="progressbar" aria-valuemin={1} aria-valuemax={totalCount} aria-valuenow={idx + 1} aria-label="Progression"><i style={{ width: `${pct}%` }} /></div>

      <section className="quiz-stage">
        {currentQ.category || currentQ.context ? (
          <div className="ctx">
            {[currentQ.category, currentQ.difficulty].filter(Boolean).join(' · ') ? (
              <span>{[currentQ.category, currentQ.difficulty].filter(Boolean).join(' · ')}</span>
            ) : null}
            {currentQ.context ? <p><MathHtml text={currentQ.context} basePath={currentQ.basePath} /></p> : null}
          </div>
        ) : null}

        <div className="qt">
          <MathHtml text={currentQ.prompt} basePath={currentQ.basePath} />
        </div>

        {(currentQ.type === 'mcq' || currentQ.type === 'boolean') && currentQ.options ? (
          <div className={currentQ.type === 'boolean' ? 'opts opts--boolean' : 'opts'} role="group" aria-label="Réponses possibles">
            {currentQ.options.map((opt, i) => {
              const { isSel, stClass, mark, srHint } = getChoiceVisual(i);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`opt ${stClass}`}
                  aria-pressed={isSel}
                  disabled={answered}
                  onClick={() => {
                    setNotice('');
                    setDrafts((d) => ({ ...d, [curQuestionIndex]: { selectedIndex: i } }));
                    chime('tick');
                  }}
                >
                  <b>{opt.label}</b>
                  <span>
                    <MathHtml text={opt.text} basePath={currentQ.basePath} />
                    {srHint ? <span className="sr-only"> ({srHint})</span> : null}
                  </span>
                  {mark ? <em aria-hidden="true">{mark}</em> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {currentQ.type === 'error' && currentQ.steps ? (
          <div className="quiz-error-list" role="group" aria-label="Étapes du raisonnement">
            {currentQ.steps.map((st, i) => {
              const { isSel, stClass, mark, srHint } = getChoiceVisual(i);
              return (
                <button
                  key={st.id}
                  type="button"
                  className={`opt quiz-error-choice ${stClass}`}
                  aria-pressed={isSel}
                  disabled={answered}
                  onClick={() => {
                    setNotice('');
                    setDrafts((d) => ({ ...d, [curQuestionIndex]: { selectedIndex: i } }));
                  }}
                >
                  <b>{`É${i + 1}`}</b>
                  <span>
                    <MathHtml text={st.text} basePath={currentQ.basePath} />
                    {srHint ? <span className="sr-only"> ({srHint})</span> : null}
                  </span>
                  {mark ? <em aria-hidden="true">{mark}</em> : null}
                </button>
              );
            })}
            {answered && currentQ.steps[currentQ.correctIndex ?? 0]?.correction ? (
              <div className="quiz-error-fix">
                <strong>Correction : </strong>
                <MathHtml text={currentQ.steps[currentQ.correctIndex ?? 0].correction} basePath={currentQ.basePath} />
              </div>
            ) : null}
          </div>
        ) : null}

        {currentQ.type === 'input' ? (
          <div className="quiz-input-wrap">
            <input
              type="text"
              className="quiz-input"
              data-quiz-input="true"
              aria-label="Votre réponse"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder={currentQ.placeholder || 'Votre réponse...'}
              value={answered ? (currentAnswer?.text || '') : (currentDraft.text || '')}
              disabled={answered}
              onChange={(e) => {
                setNotice('');
                setDrafts((d) => ({ ...d, [curQuestionIndex]: { text: e.target.value } }));
              }}
            />
          </div>
        ) : null}

        {currentQ.type === 'order' && currentQ.items ? (() => {
          const seq = answered && currentAnswer?.orderItems?.length
            ? currentAnswer.orderItems
            : (currentDraft.orderItems?.length ? currentDraft.orderItems : currentQ.items.map((it) => it.id));
          const byId = Object.fromEntries(currentQ.items.map((it) => [it.id, it]));
          const move = (pos: number, dir: -1 | 1) => {
            const next = seq.slice();
            const tmp = next[pos];
            next[pos] = next[pos + dir];
            next[pos + dir] = tmp;
            setNotice('');
            setDrafts((d) => ({ ...d, [curQuestionIndex]: { orderItems: next } }));
          };
          return (
            <div className="quiz-order-list" role="list">
              {seq.map((id, pos) => {
                const ok = currentQ.correctOrder?.[pos] === id;
                return (
                  <div key={id} role="listitem" className={`opt quiz-order-item${answered ? (ok ? ' ok' : ' bad') : ''}`}>
                    <b>{pos + 1}</b>
                    <span><MathHtml text={byId[id]?.text || ''} basePath={currentQ.basePath} /></span>
                    {answered ? (
                      <em aria-hidden="true">{ok ? '✓' : '✗'}</em>
                    ) : (
                      <span className="quiz-order-controls">
                        <button type="button" className="ib" disabled={pos === 0} onClick={() => move(pos, -1)} aria-label="Monter">&uarr;</button>
                        <button type="button" className="ib" disabled={pos === seq.length - 1} onClick={() => move(pos, 1)} aria-label="Descendre">&darr;</button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })() : null}

        {notice ? <p className="quiz-notice" role="alert">{notice}</p> : null}

        {answered && currentAnswer && cmp ? (
          <div ref={feedbackRef} id="quiz-feedback" tabIndex={-1} className={`why${currentAnswer.isCorrect ? ' okbox' : ''}`} role="status">
            <strong>{currentAnswer.isCorrect ? 'Bonne réponse' : currentAnswer.timedOut ? 'Temps écoulé' : 'Réponse incorrecte'}</strong>
            <p className="quiz-why-cmp">
              <b>Attendu :</b> <MathHtml text={cmp.expectedText} basePath={currentQ.basePath} />
              <br />
              <b>Votre choix :</b>{' '}
              {currentQ.type === 'input' ? cmp.givenText : <MathHtml text={cmp.givenText} basePath={currentQ.basePath} />}
            </p>
            {currentQ.explanation ? (
              <p className="quiz-why-expl"><MathHtml text={currentQ.explanation} basePath={currentQ.basePath} /></p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="act">
        <button type="button" className="btn ghost" disabled={idx === 0} onClick={goPrev}>
          Précédent
        </button>
        <button type="button" className="btn ghost" disabled={answered} onClick={skipQuestion}>
          Passer
        </button>
        {!answered ? (
          <button type="button" className="btn primary" onClick={() => submitQuestion(false)}>
            Valider
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={goNext}>
            {idx < totalCount - 1 ? 'Suivant' : 'Terminer'}
          </button>
        )}
      </div>
    </section>
  );
}
