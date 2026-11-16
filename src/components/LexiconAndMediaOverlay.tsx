'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findLexiconEntry as lookupLexiconEntry, renderTex, type LexiconEntry } from '@/lib/math/mathEngine';
import { isSafeImageSrc, resolveMediaUrl } from '@/lib/math/mediaLexicon';
import { MathHtml } from './MathHtml';

export type { LexiconEntry };

interface PopoverState {
  entry: LexiconEntry;
  trigger: HTMLElement;
  showArabic: boolean;
}

interface LightboxState {
  src: string;
  alt: string;
  caption: string;
}

function findLexiconEntry(idOrTerm: string): LexiconEntry | null {
  const query = idOrTerm.trim();
  return query ? lookupLexiconEntry(query) : null;
}

function resolveSafeMediaSrc(rawSrc: string): string {
  const trimmed = rawSrc.trim();
  if (!isSafeImageSrc(trimmed)) return '';
  return resolveMediaUrl(trimmed);
}

function computePopoverCoords(pop: HTMLElement | null, trigger: HTMLElement): { top: number; left: number } {
  const gap = 8;
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 768;
  const tr = trigger.getBoundingClientRect();
  const pr = pop?.getBoundingClientRect();
  const pw = pr?.width || Math.min(376, vw - 24);
  const ph = pr?.height || 200;

  const left = Math.max(gap, Math.min(tr.left, vw - pw - gap));
  const fitsBelow = tr.bottom + gap + ph <= vh - gap;
  const rawTop = fitsBelow ? tr.bottom + gap : tr.top - ph - gap;
  const top = Math.max(gap, Math.min(rawTop, Math.max(gap, vh - ph - gap)));

  return { top: Math.round(top), left: Math.round(left) };
}

export function LexiconAndMediaOverlay() {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 16, left: 16 });
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const popRef = useRef<HTMLElement>(null);
  const lightboxRef = useRef<HTMLDialogElement>(null);
  const popoverRef = useRef<PopoverState | null>(null);
  const lightboxStateRef = useRef<LightboxState | null>(null);

  popoverRef.current = popover;
  lightboxStateRef.current = lightbox;

  const closePopover = useCallback((restoreFocus = false) => {
    const activeTrigger = popoverRef.current?.trigger;
    setPopover(null);
    if (restoreFocus && activeTrigger && activeTrigger.isConnected) {
      activeTrigger.focus({ preventScroll: true });
    }
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  const openLightboxFromEl = useCallback((zoomEl: HTMLElement) => {
    const innerImg = zoomEl.querySelector('img');
    const rawSrc =
      zoomEl.getAttribute('data-media-src') ||
      innerImg?.getAttribute('src') ||
      '';
    const safeSrc = resolveSafeMediaSrc(rawSrc);
    if (!safeSrc) return;

    const alt =
      zoomEl.getAttribute('data-media-alt') ||
      innerImg?.getAttribute('alt') ||
      'Illustration mathématique';
    const caption = zoomEl.getAttribute('data-media-caption') || '';

    setPopover(null);
    setLightbox({ src: safeSrc, alt, caption });
  }, []);

  // Single document click & Escape listener (capture phase so vendor bubble listeners don't mutate React DOM)
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      const raw = ev.target;
      const target =
        raw instanceof Element
          ? raw
          : raw instanceof Node
            ? raw.parentElement
            : null;
      if (!target) return;

      if (target.closest('#mf-lexicon-popover')) {
        if (target.closest('.mf-lexicon-lang-toggle')) {
          ev.stopPropagation();
          setPopover((prev) => (prev ? { ...prev, showArabic: !prev.showArabic } : prev));
          return;
        }
        if (target.closest('.lx-x')) {
          ev.stopPropagation();
          closePopover(true);
          return;
        }
        return;
      }

      if (target.closest('#mf-media-lightbox')) {
        if (target.closest('[data-lightbox-close]')) {
          ev.stopPropagation();
          closeLightbox();
        }
        return;
      }

      const lexTrigger = target.closest<HTMLElement>(
        '[data-lexicon-term], .lx, .mathflow-lexicon-term'
      );
      if (lexTrigger) {
        ev.stopPropagation();
        const termQuery =
          lexTrigger.getAttribute('data-lexicon-term') ||
          lexTrigger.textContent?.trim() ||
          '';
        const entry = findLexiconEntry(termQuery);
        if (!entry) {
          closePopover(false);
          return;
        }
        setCoords(computePopoverCoords(null, lexTrigger));
        setPopover((prev) => {
          if (prev?.trigger === lexTrigger) return null;
          return { entry, trigger: lexTrigger, showArabic: false };
        });
        return;
      }

      const zoomEl = target.closest<HTMLElement>('[data-media-zoom]');
      if (zoomEl) {
        ev.stopPropagation();
        openLightboxFromEl(zoomEl);
        return;
      }

      if (popoverRef.current) {
        closePopover(false);
      }
    };

    const onDocKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (lightboxStateRef.current || lightboxRef.current?.open) {
          ev.stopPropagation();
          closeLightbox();
          return;
        }
        if (popoverRef.current) {
          ev.preventDefault();
          ev.stopPropagation();
          closePopover(true);
          return;
        }
        return;
      }

      if (ev.key === 'Enter' || ev.key === ' ') {
        const target = ev.target instanceof HTMLElement ? ev.target : null;
        if (!target || target.tagName === 'BUTTON') return;
        const zoomEl = target.closest<HTMLElement>('[data-media-zoom]');
        if (zoomEl) {
          ev.preventDefault();
          ev.stopPropagation();
          openLightboxFromEl(zoomEl);
        }
      }
    };

    document.addEventListener('click', onDocClick, { capture: true });
    document.addEventListener('keydown', onDocKeyDown, { capture: true });
    return () => {
      document.removeEventListener('click', onDocClick, { capture: true });
      document.removeEventListener('keydown', onDocKeyDown, { capture: true });
    };
  }, [closeLightbox, closePopover, openLightboxFromEl]);

  // Keep aria-expanded synced on the active lexicon trigger
  useEffect(() => {
    const trigger = popover?.trigger;
    if (!trigger) return;
    trigger.setAttribute('aria-expanded', 'true');
    return () => {
      trigger.setAttribute('aria-expanded', 'false');
    };
  }, [popover?.trigger]);

  // Position popover & keep it anchored on scroll/resize
  useEffect(() => {
    const popEl = popRef.current;
    const trigger = popover?.trigger;
    if (!popEl || !trigger) return;

    const updatePosition = () => {
      if (!trigger.isConnected) {
        setPopover(null);
        return;
      }
      const r = trigger.getBoundingClientRect();
      const vh = window.innerHeight || 900;
      if (r.bottom < 0 || r.top > vh) {
        setPopover(null);
        return;
      }
      setCoords(computePopoverCoords(popEl, trigger));
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [popover]);

  // Sync native <dialog id="mf-media-lightbox"> open state
  useEffect(() => {
    const dlg = lightboxRef.current;
    if (!dlg) return;
    if (lightbox && !dlg.open) {
      dlg.showModal();
    } else if (!lightbox && dlg.open) {
      dlg.close();
    }
  }, [lightbox]);

  const formulaHtml = useMemo(() => {
    const formula = popover?.entry.formula?.trim();
    return formula ? renderTex(formula, true) : '';
  }, [popover?.entry.formula]);

  const hasArabicDef = Boolean(popover?.entry.definitionAr?.trim());

  return (
    <>
      {popover ? (
        <aside
          ref={popRef}
          id="mf-lexicon-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby="mf-lx-title"
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
        >
          <div className="lx-top">
            <div>
              {popover.entry.category ? (
                <span className="lx-cat">{popover.entry.category}</span>
              ) : null}
              <h3 id="mf-lx-title" className="lx-fr">
                {popover.entry.term}
              </h3>
            </div>
            <div className="lx-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {hasArabicDef ? (
                <button
                  type="button"
                  className={`mf-lexicon-lang-toggle${popover.showArabic ? ' is-ar' : ''}`}
                  aria-pressed={popover.showArabic}
                  title={popover.showArabic ? 'Afficher la définition en français' : 'Afficher la définition en arabe'}
                >
                  {popover.showArabic ? 'FR' : 'AR'}
                </button>
              ) : null}
              <button
                type="button"
                className="lx-x"
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>
          </div>

          {popover.entry.termAr ? (
            <div className="lx-ar" lang="ar" dir="rtl">
              {popover.entry.termAr}
            </div>
          ) : null}

          {popover.showArabic && popover.entry.definitionAr ? (
            <div className="lx-defar" lang="ar" dir="rtl" style={{ color: 'var(--ink)' }}>
              <MathHtml text={popover.entry.definitionAr} />
            </div>
          ) : popover.entry.definition ? (
            <div className="lx-def">
              <MathHtml text={popover.entry.definition} />
            </div>
          ) : null}

          {popover.entry.formula ? (
            <div className="lx-fm">
              {formulaHtml ? (
                <MathHtml rawHtml={formulaHtml} />
              ) : (
                <MathHtml text={`$$${popover.entry.formula}$$`} />
              )}
            </div>
          ) : null}
        </aside>
      ) : null}

      <dialog
        ref={lightboxRef}
        id="mf-media-lightbox"
        aria-labelledby="mf-lb-title"
        onClose={closeLightbox}
        onCancel={closeLightbox}
        onClick={(ev) => {
          if (ev.target === lightboxRef.current) {
            closeLightbox();
          }
        }}
      >
        {lightbox ? (
          <>
            <div className="lx-top">
              <span id="mf-lb-title" className="lx-fr">
                {lightbox.alt || 'Illustration'}
              </span>
              <button
                type="button"
                className="lx-x"
                data-lightbox-close="true"
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>
            {/* Dynamic figure URL from lesson/exercise JSON rendered inside native lightbox */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.src} alt={lightbox.alt} />
            {lightbox.caption ? (
              <MathHtml
                as="p"
                className="media-figure-caption"
                text={lightbox.caption}
              />
            ) : null}
          </>
        ) : null}
      </dialog>
    </>
  );
}

export default LexiconAndMediaOverlay;
