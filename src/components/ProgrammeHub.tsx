'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Lock } from 'lucide-react';
import type { HydratedChapter } from '@/lib/content/serverContent';
import type { ClassId } from '@/lib/types';
import { compactSectionLabel, readResumeStore } from '@/lib/resumeStore';
import { computeLocks, getExerciseStats, getLessonPct, getQuizStats } from '@/lib/unlocks';
import { useApp } from './AppProvider';
import { DashboardChrome } from './DashboardChrome';
import { MathHtml } from './MathHtml';
import { RouteViewSync } from './RouteViewSync';

const pc = (n: number) => `${n}\u00a0%`;
const stepStatus = (pct: number): 'd' | 'p' | 'o' => (pct >= 100 ? 'd' : pct > 0 ? 'p' : 'o');
const stepAction = (st: 'd' | 'p' | 'o') => (st === 'd' ? 'Revoir' : st === 'p' ? 'Reprendre' : 'Commencer');
const stepSub = (st: 'd' | 'p' | 'o', pct: number, kind: string) =>
  st === 'd' ? 'Terminé' : st === 'p' ? `${pc(pct)} réalisé` : kind === 'Leçon' ? 'Fiche de cours' : kind === 'Quiz' ? 'Questions QCM' : 'Série guidée';

export function ProgrammeHub({
  classId,
  classTitle,
  chapters,
}: {
  classId: ClassId;
  classTitle: string;
  chapters: HydratedChapter[];
}) {
  const { state, hydrated, showToast } = useApp();

  const computed = useMemo(() => {
    const resume = hydrated ? readResumeStore() : null;
    let totalSum = 0;
    const rows = chapters.map((ch) => {
      const lp = hydrated && ch.revisions.length ? getLessonPct(state.l, ch.id, ch.revisions) : 0;
      const hasQuiz = ch.quizzes.length > 0 || ch.quizCount > 0;
      const qs = hydrated
        ? getQuizStats(state.q, classId, ch.id, ch.quizzes, ch.quizCount)
        : { done: 0, pct: 0, submitted: false };

      const locks = hydrated
        ? computeLocks({
            classId,
            chapterId: ch.id,
            hasLesson: ch.revisions.length > 0,
            hasQuiz,
            hasExercises: ch.exercises.length > 0,
            lessonPct: lp,
            quizPct: qs.pct,
            quizSubmitted: qs.submitted,
          })
        : {
            quizLocked: false,
            exercisesLocked: false,
            quizHint: 'Débloqué dès 10\u00a0% de la leçon',
            exercisesHint: 'Débloqué dès 15\u00a0% du quiz',
          };

      const steps: Array<{
        kind: 'lesson' | 'quiz' | 'exo';
        lbl: string;
        st: 'd' | 'p' | 'o' | 'l';
        pct: number;
        href: string;
        locked: boolean;
        hint: string;
        detail: string;
        isLast: boolean;
      }> = [];
      let ep = 0;
      const lv = hydrated ? state.lastVisited : null;

      if (ch.revisions.length) {
        const activeSheet = resume?.lessonActiveSheet[ch.id];
        const lHref = activeSheet?.href || `/lecon/${encodeURIComponent(ch.id)}`;
        const lRes = resume?.lessons[activeSheet?.scrollKey || ch.id] ?? resume?.lessons[ch.id] ?? null;
        const secShort = compactSectionLabel(lRes?.secTitle);
        const st = stepStatus(lp);
        let detail = stepSub(st, lp, 'Leçon');
        if (lp > 0 && lp < 100 && secShort) detail = `${pc(lp)} · ${secShort}`;
        else if (lp >= 100 && lRes && lRes.pct > 0 && lRes.pct < 97) detail = `Terminé · reprise à ${pc(lRes.pct)}`;
        steps.push({
          kind: 'lesson',
          lbl: 'Leçon',
          st,
          pct: lp,
          href: lHref,
          locked: false,
          hint: '',
          detail,
          isLast: Boolean(lv?.chapterId === ch.id && lv.kind === 'lesson'),
        });
      }
      if (hasQuiz) {
        const chapterKey = `chapter:${classId}:${ch.id}`;
        const activeQuizId = resume?.chapterActiveQuiz[chapterKey];
        const qSessionKey = activeQuizId ? `${chapterKey}:${activeQuizId}` : '';
        const qRes =
          (qSessionKey && resume?.quizzes[qSessionKey]) ||
          (resume && Object.entries(resume.quizzes).find(([k]) => k.startsWith(`${chapterKey}:`))?.[1]) ||
          null;
        const st = stepStatus(qs.pct);
        const qTotal = qRes?.totalQuestions || ch.quizCount || 0;
        let detail = locks.quizLocked ? locks.quizHint : stepSub(st, qs.pct, 'Quiz');
        if (!locks.quizLocked && qRes) {
          if (qRes.phase === 'end') {
            detail = `Terminé${qTotal ? ` · ${qRes.answeredCount ?? 0}/${qTotal} rép.` : ''}`;
          } else if (qRes.idx > 0 || (qRes.answeredCount ?? 0) > 0) {
            detail = `Question ${qRes.idx + 1}${qTotal ? ` / ${qTotal}` : ''} · ${pc(qs.pct)}`;
          }
        }
        const qHref = activeQuizId
          ? `/quiz/${encodeURIComponent(ch.id)}?quiz=${encodeURIComponent(activeQuizId)}`
          : `/quiz/${encodeURIComponent(ch.id)}`;
        steps.push({
          kind: 'quiz',
          lbl: 'Quiz',
          st: locks.quizLocked ? 'l' : st,
          pct: qs.pct,
          href: qHref,
          locked: locks.quizLocked,
          hint: locks.quizHint,
          detail,
          isLast: Boolean(lv?.chapterId === ch.id && lv.kind === 'quiz'),
        });
      }
      if (ch.exercises.length) {
        const exStats = hydrated ? getExerciseStats(state.e, classId, ch.id, ch.exercises.length) : { done: 0, pct: 0 };
        ep = exStats.pct;
        const exoRes = resume?.exercises[`${classId}:${ch.id}`] ?? null;
        const st = stepStatus(ep);
        let detail = locks.exercisesLocked ? locks.exercisesHint : stepSub(st, ep, 'Exercices');
        if (!locks.exercisesLocked && exoRes && (exoRes.index > 0 || (exoRes.doneCount ?? 0) > 0)) {
          detail = `Exercice ${Math.min(ch.exercises.length, exoRes.index + 1)} / ${ch.exercises.length} · ${pc(ep)}`;
        }
        steps.push({
          kind: 'exo',
          lbl: 'Exercices',
          st: locks.exercisesLocked ? 'l' : st,
          pct: ep,
          href: `/exercices/${encodeURIComponent(ch.id)}`,
          locked: locks.exercisesLocked,
          hint: locks.exercisesHint,
          detail,
          isLast: Boolean(lv?.chapterId === ch.id && lv.kind === 'exo'),
        });
      }

      const pct = steps.length ? Math.round(steps.reduce((acc, s) => acc + s.pct, 0) / steps.length) : 0;
      totalSum += pct;
      const meta = [ch.quizCount ? `${ch.quizCount} quiz` : '', ch.exercises.length ? `${ch.exercises.length} exercices` : '']
        .filter(Boolean)
        .join(', ') || 'Disponible';

      return { ch, pct, lp, qs, ep, quizLocked: locks.quizLocked, steps, meta };
    });

    const totalPct = chapters.length ? Math.round(totalSum / chapters.length) : 0;
    return { rows, totalPct };
  }, [chapters, classId, state, hydrated]);

  const [userToggled, setUserToggled] = useState(false);
  const [openChapterId, setOpenChapterId] = useState<string | null>(() => chapters[0]?.id ?? null);

  useEffect(() => {
    if (!hydrated || userToggled) return;
    const lvId = state.lastVisited?.chapterId;
    if (lvId && chapters.some((c) => c.id === lvId)) {
      setOpenChapterId(lvId);
      return;
    }
    const inProgress = computed.rows.find((r) => r.pct > 0 && r.pct < 100);
    if (inProgress) {
      setOpenChapterId(inProgress.ch.id);
    } else if (chapters[0]?.id) {
      setOpenChapterId(chapters[0].id);
    }
  }, [hydrated, userToggled, state.lastVisited?.chapterId, chapters, computed.rows]);

  return (
    <section id="learn">
      <RouteViewSync view="learn" />
      <DashboardChrome activeTab="learn" serverClassTitle={classTitle} />

      <div className="mf-stage-col">
        <div className="sec">
          <h2 tabIndex={-1}>Programme</h2>
          <div className="mf-sec-right">
            <span id="total">{pc(computed.totalPct)} du programme</span>
          </div>
        </div>

        <ol className="path" id="path">
          {computed.rows.map(({ ch, pct, steps, meta }, idx) => {
            const isOpen = ch.id === openChapterId;
            const numStr = String(ch.order != null ? ch.order : idx + 1).padStart(2, '0');
            return (
              <li key={ch.id} className={`ch${isOpen ? ' open' : ''}`} data-ch={ch.id}>
                <span className="node" style={{ '--p': pct } as React.CSSProperties}>
                  <span>{numStr}</span>
                </span>
                <div className="ch-card">
                  <button
                    className="head"
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setUserToggled(true);
                      setOpenChapterId(isOpen ? null : ch.id);
                    }}
                  >
                    <span>
                      <span className="ttl"><MathHtml text={ch.title} /></span>
                      <span className="meta">{meta}</span>
                    </span>
                    <span className="rside">
                      {pc(pct)}
                      <ChevronDown size={16} className="chev" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                  </button>
                  <div className="panel">
                    <div>
                      <ul className="steps">
                        {steps.map((st) => (
                          <li key={st.lbl} className={`stp${st.locked ? ' l locked' : ''}${st.isLast && !st.locked ? ' is-last-step' : ''}`}>
                            <span className={`si ${st.st}`} style={{ '--p': st.pct } as React.CSSProperties}>
                              {st.locked ? <Lock size={13} strokeWidth={2.1} aria-hidden="true" /> : st.st === 'd' ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : null}
                            </span>
                            <div className="tx">
                              <b>
                                {st.lbl}
                                {st.isLast && !st.locked ? <em className="stp-last">Dernier arrêt</em> : null}
                              </b>
                              <small>{st.detail}</small>
                            </div>
                            {st.locked ? (
                              <button
                                type="button"
                                className="btn locked-btn"
                                aria-disabled="true"
                                onClick={() => showToast(st.hint)}
                              >
                                <Lock size={13} strokeWidth={2.1} aria-hidden="true" />
                                <span>Verrouillé</span>
                              </button>
                            ) : (
                              <Link className={`btn${st.isLast ? ' primary' : ''}`} href={st.href} prefetch>
                                {stepAction(st.st as 'd' | 'p' | 'o')}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
