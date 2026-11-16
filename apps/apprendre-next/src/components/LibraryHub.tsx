'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { readResumeStore } from '@/lib/resumeStore';
import { countDone, getLessonPct } from '@/lib/unlocks';
import { useApp } from './AppProvider';
import { DashboardChrome } from './DashboardChrome';
import { MathHtml } from './MathHtml';
import { RouteViewSync } from './RouteViewSync';

export interface LibraryRowItem {
  id: string;
  href: string;
  title: string;
  tag?: string;
  amber?: boolean;
  meta: string;
  keys: string[];
  stateKind: 'e' | 'l' | 'q';
  stateKeys: string[];
  totalCount: number;
}

export function LibraryHub({
  tabId,
  classLabel,
  title,
  subtitle,
  chips,
  rows,
}: {
  tabId: 'examens' | 'problemes' | 'prepa';
  classLabel: string;
  title: string;
  subtitle: string;
  chips: Array<[string, string]>;
  rows: LibraryRowItem[];
}) {
  const { state, hydrated } = useApp();
  const [filter, setFilter] = useState<string>('all');

  const visibleRows = useMemo(
    () => rows.filter((r) => filter === 'all' || r.keys.includes(filter)),
    [rows, filter]
  );
  const resumeStore = hydrated ? readResumeStore() : null;

  return (
    <section id="lib">
      <RouteViewSync view="lib" />
      <DashboardChrome activeTab={tabId} serverClassTitle={classLabel} />

      <div className="mf-stage-col">
        <h1 tabIndex={-1}>{title}</h1>
        <p className="sub">{subtitle}</p>

        <div className="chips2" role="group" aria-label="Filtrer">
          {chips.map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              className="chip"
              aria-pressed={val === filter}
              onClick={() => setFilter(val)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <ul className="lst">
          {visibleRows.length ? (
            visibleRows.map((row) => {
              let pct = 0;
              let resumeMeta = '';
              if (hydrated) {
                if (row.stateKind === 'l') {
                  for (const k of row.stateKeys) {
                    const p = getLessonPct(state.l, k);
                    if (p > pct) {
                      pct = p;
                      break;
                    }
                  }
                  const lRes = resumeStore?.lessons[`prob:${row.id}`] ?? resumeStore?.lessons[row.stateKeys[0] || ''];
                  if (lRes && lRes.pct > 0 && lRes.pct < 97) resumeMeta = ` · Reprise ${lRes.pct}\u00a0%`;
                } else {
                  const map = row.stateKind === 'e' ? state.e : state.q;
                  let done = 0;
                  for (const k of row.stateKeys) {
                    if (map[k]) {
                      done = countDone(map[k]);
                      break;
                    }
                  }
                  pct = Math.min(100, Math.round((done * 100) / Math.max(1, row.totalCount)));
                  if (row.stateKind === 'e' && resumeStore) {
                    const eRes = resumeStore.exercises[`examen-${row.id}`] ?? resumeStore.exercises[row.stateKeys[0] || ''];
                    if (eRes && (eRes.index > 0 || (eRes.doneCount ?? 0) > 0)) {
                      resumeMeta = ` · Ex. ${eRes.index + 1}/${Math.max(1, row.totalCount)}`;
                    }
                  } else if (row.stateKind === 'q' && resumeStore) {
                    const qHit = Object.entries(resumeStore.quizzes).find(([k]) => k.includes(`:${row.id}:`));
                    if (qHit && qHit[1] && (qHit[1].idx > 0 || (qHit[1].answeredCount ?? 0) > 0)) {
                      resumeMeta = ` · Q. ${qHit[1].idx + 1}/${Math.max(1, qHit[1].totalQuestions || row.totalCount)}`;
                    }
                  }
                }
              }

              return (
                <li key={row.id}>
                  <Link className="it" href={row.href} prefetch>
                    <span className="rt2">
                      <MathHtml text={row.title} />
                      {row.tag ? <em className={`tg${row.amber ? ' am' : ''}`}>{row.tag}</em> : null}
                    </span>
                    <span className="mt">{row.meta}{resumeMeta}</span>
                    <ChevronRight size={16} className="chev" aria-hidden="true" />
                    <span className="pb"><i style={{ width: `${pct}%` }} /></span>
                  </Link>
                </li>
              );
            })
          ) : (
            <li>
              <div className="it off">
                <span className="rt2">Aucun élément disponible pour cette filière</span>
                <span className="mt">&mdash;</span>
                <span />
              </div>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
