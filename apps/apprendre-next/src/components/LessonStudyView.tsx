'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronsUpDown, List, X } from 'lucide-react';
import { searchIndex } from '@/lib/lesson/leconSearch';
import type { RenderedLessonStudy } from '@/lib/lesson/lessonStudyRenderer';
import { computeRevisionProgress } from '../../../../src/utils/progressUtils';
import {
  getLessonActiveSheet,
  getLessonResume,
  saveLessonActiveSheet,
  saveLessonResume,
} from '@/lib/resumeStore';
import { useApp } from './AppProvider';
import { RouteViewSync } from './RouteViewSync';

export interface LessonSheetTab {
  id: string;
  label: string;
  href: string;
  active: boolean;
}

export interface LessonStudyProps {
  kind: 'lesson' | 'probleme';
  chapterId: string;
  scrollKey: string;
  title: string;
  backHref: string;
  backLabel: string;
  backEndLabel: string;
  hashUrl: string;
  rendered: RenderedLessonStudy;
  sheets: LessonSheetTab[];
}

export function LessonStudyView(props: LessonStudyProps) {
  const router = useRouter();
  const { profile, state, hydrated, saveState, recordLastVisited } = useApp();
  const rootRef = useRef<HTMLElement>(null);
  const focusDlgRef = useRef<HTMLDialogElement>(null);
  const recordedRef = useRef<string>('');
  const restoreDoneRef = useRef<string>('');
  const activeSecRef = useRef<{ secId: string; secTitle: string }>({ secId: '', secTitle: '' });

  const [tocQuery, setTocQuery] = useState('');
  const [runningHead, setRunningHead] = useState('');
  const [focusHtml, setFocusHtml] = useState<string>('');
  const [focusOpen, setFocusOpen] = useState(false);

  const rendered = props.rendered;
  // Preserve interactive DOM classes when context, scroll-spy or dialogs update.
  // A fresh dangerouslySetInnerHTML object would replace every revealed blank.
  const bodyMarkup = useMemo(() => ({ __html: rendered.bodyHtml }), [rendered.bodyHtml]);

  const searchHits = useMemo(() => {
    if (!tocQuery.trim()) return [];
    return searchIndex(rendered.searchIndex, tocQuery.trim(), 30);
  }, [tocQuery, rendered.searchIndex]);

  useEffect(() => {
    if (!hydrated) return;
    if (props.kind === 'lesson' && props.sheets.length > 1) {
      const hasSheetQuery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sheet');
      const savedSheet = getLessonActiveSheet(props.chapterId);
      const activeTab = props.sheets.find((s) => s.active);
      if (!hasSheetQuery && savedSheet && savedSheet.sheetId !== activeTab?.id && props.sheets.some((s) => s.id === savedSheet.sheetId)) {
        router.replace(savedSheet.href);
        return;
      }
      if (activeTab) {
        saveLessonActiveSheet(props.chapterId, { sheetId: activeTab.id, href: activeTab.href, scrollKey: props.scrollKey });
      }
    }
    if (recordedRef.current === props.hashUrl) return;
    recordedRef.current = props.hashUrl;
    recordLastVisited({
      href: props.hashUrl,
      title: props.title,
      kind: props.kind === 'probleme' ? 'probleme' : 'lesson',
      chapterId: props.kind === 'probleme' ? null : props.chapterId,
    });
  }, [hydrated, props.hashUrl, props.title, props.kind, props.chapterId, props.sheets, props.scrollKey, recordLastVisited, router]);

  const readCurrentBlanks = useCallback((): number[] => {
    const container = rootRef.current;
    if (!container) return [];
    const list = Array.from(container.querySelectorAll('.blank, .math-blank, [data-blank="true"]'));
    const openIndices: number[] = [];
    list.forEach((el, idx) => {
      if (el.classList.contains('on') || el.classList.contains('revealed')) openIndices.push(idx);
    });
    return openIndices;
  }, []);

  const persistRevealedProgress = useCallback(() => {
    if (!rendered.blankCount) return;
    const pct = computeRevisionProgress(readCurrentBlanks().length, rendered.blankCount);
    saveState((prev) => {
      const current = typeof prev.l[props.scrollKey] === 'number' ? prev.l[props.scrollKey] as number : 0;
      return pct <= current ? prev : { ...prev, l: { ...prev.l, [props.scrollKey]: pct } };
    });
  }, [rendered.blankCount, readCurrentBlanks, saveState, props.scrollKey]);

  // Restore saved scroll position, reading bar & revealed blanks once hydrated
  useEffect(() => {
    if (!hydrated || restoreDoneRef.current === props.scrollKey) return;
    const savedResume = getLessonResume(props.scrollKey);
    const savedRaw = state.l[props.scrollKey];
    const fallbackPct = typeof savedRaw === 'number' ? savedRaw : typeof savedRaw?.pct === 'number' ? savedRaw.pct : 0;
    const targetPct = savedResume ? savedResume.pct : fallbackPct;

    if (savedResume?.revealedBlanks?.length && rootRef.current) {
      const blanks = rootRef.current.querySelectorAll('.blank, .math-blank, [data-blank="true"]');
      savedResume.revealedBlanks.forEach((idx) => {
        const el = blanks[idx];
        if (el) {
          el.classList.add('on', 'revealed');
          el.setAttribute('aria-expanded', 'true');
        }
      });
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const d = document.documentElement;
        const max = Math.max(0, d.scrollHeight - window.innerHeight);
        if (targetPct > 0 && targetPct < 98 && max > 0) {
          window.scrollTo({ top: (targetPct / 100) * max, left: 0, behavior: 'auto' });
          const rpBar = rootRef.current?.querySelector('.rp i') as HTMLElement | null;
          if (rpBar) rpBar.style.setProperty('--rp', String(Math.min(1, Math.max(0, targetPct / 100))));
        }
        restoreDoneRef.current = props.scrollKey;
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [hydrated, props.scrollKey, state.l]);

  // Save reading position (both up & down) + monotonic mastery pct & running section heading
  useEffect(() => {
    if (!hydrated) return;
    let lastMaxPct = -1;
    let timerId: number | null = null;

    const persistScroll = () => {
      if (restoreDoneRef.current !== props.scrollKey) return;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = Math.min(100, Math.max(0, Math.round((window.scrollY * 100) / max)));
      const rpBar = rootRef.current?.querySelector('.rp i') as HTMLElement | null;
      if (rpBar) rpBar.style.setProperty('--rp', String(Math.min(1, Math.max(0, ratio / 100))));

      const revealedBlanks = readCurrentBlanks();
      // Parent application: revealed answers measure mastery; scrolling only tracks position.
      const targetMaxPct = rendered.blankCount
        ? computeRevisionProgress(revealedBlanks.length, rendered.blankCount)
        : ratio >= 97 ? 100 : Math.min(99, ratio);
      saveLessonResume(props.scrollKey, {
        pct: ratio,
        maxPct: targetMaxPct,
        secId: activeSecRef.current.secId || undefined,
        secTitle: activeSecRef.current.secTitle || undefined,
        revealedBlanks,
      });

      if (targetMaxPct > lastMaxPct) {
        lastMaxPct = targetMaxPct;
        saveState((prev) => {
          const cur = typeof prev.l[props.scrollKey] === 'number' ? (prev.l[props.scrollKey] as number) : 0;
          if (targetMaxPct <= cur) return prev;
          return { ...prev, l: { ...prev.l, [props.scrollKey]: targetMaxPct } };
        });
      }
    };

    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = Math.round((window.scrollY * 100) / max);
      if (ratio >= 10 && lastMaxPct < 10) {
        persistScroll();
        return;
      }
      if (!timerId) {
        timerId = window.setTimeout(() => {
          timerId = null;
          persistScroll();
        }, 250);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persistScroll);
    // Capture an early scroll that happened before hydration/restoration installed listeners.
    let settledRaf = 0;
    const initialRaf = requestAnimationFrame(() => {
      settledRaf = requestAnimationFrame(() => {
        if (window.scrollY > 0) persistScroll();
      });
    });
    return () => {
      persistScroll();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persistScroll);
      cancelAnimationFrame(initialRaf);
      if (settledRaf) cancelAnimationFrame(settledRaf);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [hydrated, props.scrollKey, saveState, readCurrentBlanks, rendered.blankCount]);

  // IntersectionObserver scroll-spy for running header + active section tracking
  useEffect(() => {
    const container = rootRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const secs = Array.from(container.querySelectorAll('section.ls[data-sec-id]'));
    if (!secs.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) {
          const secId = (hit.target as HTMLElement).dataset.secId || '';
          const lht = hit.target.querySelector('.lht');
          const secTitle = lht?.textContent?.trim() || '';
          activeSecRef.current = { secId, secTitle };
          if (secTitle) setRunningHead(secTitle);
        }
      },
      { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.25] }
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [rendered.bodyHtml]);

  useEffect(() => {
    const dlg = focusDlgRef.current;
    if (!dlg) return;
    if (focusOpen && !dlg.open) dlg.showModal();
    else if (!focusOpen && dlg.open) dlg.close();
  }, [focusOpen]);

  const openBlockInFocus = useCallback((blk: Element | null) => {
    if (!blk) return;
    const clone = blk.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    if (clone.tagName === 'DETAILS') clone.setAttribute('open', '');
    clone.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    setFocusHtml(clone.outerHTML);
    setFocusOpen(true);
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      const blank = target.closest('.blank, .math-blank, [data-blank="true"]');
      if (blank) {
        e.stopPropagation();
        const open = !(blank.classList.contains('on') || blank.classList.contains('revealed'));
        blank.classList.toggle('on', open);
        blank.classList.toggle('revealed', open);
        blank.setAttribute('aria-expanded', open ? 'true' : 'false');
        saveLessonResume(props.scrollKey, { revealedBlanks: readCurrentBlanks() });
        persistRevealedProgress();
        return;
      }
      const fx = target.closest('[data-focus]');
      if (fx) {
        e.preventDefault();
        e.stopPropagation();
        openBlockInFocus(fx.closest('.blk'));
        return;
      }
      const allBtn = target.closest('[data-all]');
      if (allBtn) {
        (allBtn.closest('.sol') || rootRef.current)
          ?.querySelectorAll('.blank, .math-blank, [data-blank="true"]')
          .forEach((b) => {
            b.classList.add('on', 'revealed');
            b.setAttribute('aria-expanded', 'true');
          });
        saveLessonResume(props.scrollKey, { revealedBlanks: readCurrentBlanks() });
        persistRevealedProgress();
      }
    },
    [openBlockInFocus, props.scrollKey, readCurrentBlanks, persistRevealedProgress]
  );

  const handleToggleAll = useCallback(() => {
    const container = rootRef.current;
    if (!container) return;
    const list = Array.from(container.querySelectorAll<HTMLDetailsElement>('details.blk'));
    const anyOpen = list.some((d) => d.open);
    list.forEach((d) => {
      d.open = !anyOpen;
    });
  }, []);

  const jumpToTarget = useCallback(
    (blockId?: string, secId?: string) => {
      const container = rootRef.current;
      if (!container) return;
      const toc = container.querySelector('#toc') as (HTMLElement & { hidePopover?: () => void }) | null;
      if (toc?.hidePopover) {
        try { toc.hidePopover(); } catch {}
      }
      const target =
        (blockId && container.querySelector(`#${CSS.escape(blockId)}`)) ||
        (secId && container.querySelector(`#les-${CSS.escape(secId)}`));
      if (!target) return;
      for (let node: HTMLElement | null = target as HTMLElement; node && node !== container; node = node.parentElement) {
        if (node.tagName === 'DETAILS') (node as HTMLDetailsElement).open = true;
      }
      target.scrollIntoView({ behavior: profile.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    },
    [profile.reduceMotion]
  );

  return (
    <section
      ref={rootRef}
      id="les"
      onClick={handleContainerClick}
      onDoubleClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('#focus-overlay-modal, summary, button, a, input, .blank, .math-blank')) return;
        openBlockInFocus(t.closest('.blk'));
      }}
    >
      <RouteViewSync view="les" />
      <div className="rp" aria-hidden="true"><i /></div>

      <div className="top">
        <Link className="back" href={props.backHref}>
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          <span>{props.backLabel}</span>
        </Link>

        {props.sheets.length > 1 ? (
          <nav className="sheet-tabs" aria-label="Fiches du chapitre">
            {props.sheets.map((sh) => (
              <Link
                key={sh.id}
                href={sh.href}
                className={`sheet-tab${sh.active ? ' active' : ''}`}
                aria-current={sh.active ? 'page' : undefined}
              >
                {sh.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <span className="rh" id="rh" aria-hidden="true">{runningHead}</span>

        <span className="cnt">
          <span id="rt">{rendered.readTime}</span>
          <button
            className="ib"
            type="button"
            onClick={handleToggleAll}
            aria-label="Tout déplier ou replier"
            title="Tout déplier / replier"
          >
            <ChevronsUpDown size={16} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            className="ib"
            type="button"
            popoverTarget="toc"
            aria-label="Sommaire et recherche"
            title="Sommaire et recherche"
          >
            <List size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </div>

      <p className="kick" dangerouslySetInnerHTML={{ __html: rendered.kickerHtml }} />
      <h1 className="lt" tabIndex={-1} dangerouslySetInnerHTML={{ __html: rendered.heroHtml }} />
      <div dangerouslySetInnerHTML={bodyMarkup} />

      <p className="end2">
        <Link className="link" href={props.backHref}>{props.backEndLabel}</Link>
      </p>

      <div id="toc" popover="auto">
        <input
          id="tqs"
          type="search"
          placeholder="Rechercher dans la fiche…"
          aria-label="Rechercher dans la fiche"
          autoComplete="off"
          value={tocQuery}
          onChange={(e) => setTocQuery(e.target.value)}
        />
        <p className="ctx">Sommaire</p>
        {tocQuery.trim() ? (
          <div id="toc-results">
            {searchHits.length ? (
              searchHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="toc-hit"
                  onClick={() => jumpToTarget(hit.blockId, hit.sectionId)}
                >
                  <span className="toc-hit-sec">
                    {hit.blockTitle ? `${hit.sectionTitle} · ${hit.blockTitle}` : hit.sectionTitle}
                  </span>
                  <span className="toc-hit-snip">{hit.snippet}</span>
                </button>
              ))
            ) : (
              <p className="toc-empty">Aucun passage trouvé.</p>
            )}
          </div>
        ) : (
          <div id="toc-sections">
            {rendered.tocItems.map((item) => (
              <button key={item.secId} type="button" onClick={() => jumpToTarget(undefined, item.secId)}>
                <b>{item.lbl}</b>
                <span className="toc-sec-ttl" dangerouslySetInnerHTML={{ __html: item.titleHtml }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <dialog
        ref={focusDlgRef}
        id="focus-overlay-modal"
        className="focus-overlay"
        aria-label="Mode focus"
        onClose={() => setFocusOpen(false)}
        onClick={(e) => { if (e.target === focusDlgRef.current) setFocusOpen(false); }}
      >
        <div className="focus-dialog">
          <div className="focus-head">
            <span className="focus-badge">Mode focus</span>
            <button type="button" className="ib" aria-label="Fermer" onClick={() => setFocusOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="focus-body" dangerouslySetInnerHTML={{ __html: focusHtml }} />
        </div>
      </dialog>
    </section>
  );
}
