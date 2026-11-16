'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Calculator, ChevronDown, GitFork, Infinity as InfinityIcon, Shapes, X } from 'lucide-react';
import type { ClassId, OrientationDomainId } from '@/lib/types';
import { getAllOrientationPrograms, getOrientationProgram } from '@/lib/orientation';
import { useApp } from './AppProvider';
import { MathHtml } from './MathHtml';

const DOMAIN_ICON: Record<OrientationDomainId, React.ReactNode> = {
  algebre: <GitFork size={15} strokeWidth={2} aria-hidden="true" />,
  analyse: <Calculator size={15} strokeWidth={2} aria-hidden="true" />,
  geometrie: <Shapes size={15} strokeWidth={2} aria-hidden="true" />,
  probabilites: <InfinityIcon size={15} strokeWidth={2} aria-hidden="true" />,
  statistiques: <BarChart3 size={15} strokeWidth={2} aria-hidden="true" />,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export function OrientationModal() {
  const { profile, activeModal, setActiveModal } = useApp();
  const dlgRef = useRef<HTMLDialogElement>(null);
  const isOpen = activeModal === 'orientation';

  const [selectedCls, setSelectedCls] = useState<ClassId>(profile.cls);
  const [selectedDomain, setSelectedDomain] = useState<OrientationDomainId>('algebre');
  const [openIdx, setOpenIdx] = useState<number>(0);

  const allPrograms = useMemo(() => getAllOrientationPrograms(), []);
  const program = useMemo(() => getOrientationProgram(selectedCls), [selectedCls]);
  const domains = useMemo(() => program?.domains ?? [], [program]);

  useEffect(() => {
    if (isOpen) {
      setSelectedCls(profile.cls);
      setOpenIdx(0);
    }
  }, [isOpen, profile.cls]);

  useEffect(() => {
    if (domains.length && !domains.some((d) => d.id === selectedDomain)) {
      setSelectedDomain(domains[0].id);
      setOpenIdx(0);
    }
  }, [domains, selectedDomain]);

  useEffect(() => {
    const dlg = dlgRef.current;
    if (!dlg) return;
    if (isOpen && !dlg.open) dlg.showModal();
    else if (!isOpen && dlg.open) dlg.close();
  }, [isOpen]);

  const chapters = useMemo(
    () => (program?.chapters ?? []).filter((c) => c.domain === selectedDomain),
    [program, selectedDomain]
  );

  return (
    <dialog
      ref={dlgRef}
      id="orient-dlg"
      aria-label="Orientation et programme officiel"
      onClose={() => { if (isOpen) setActiveModal(null); }}
      onClick={(e) => { if (e.target === dlgRef.current) setActiveModal(null); }}
    >
      <div className="or-shell">
        <header className="or-head">
          <div className="or-title-group">
            <h2 className="or-title">Orientation</h2>
            <span className="or-dot" aria-hidden="true">&bull;</span>
            <label className="or-cls-wrap" title="Consulter le programme d'une autre filière">
              <select
                id="or-cls-select"
                className="or-cls-select"
                aria-label="Filière du programme"
                value={program?.id || selectedCls}
                onChange={(e) => {
                  setSelectedCls(e.target.value as ClassId);
                  setOpenIdx(0);
                }}
              >
                {allPrograms.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="or-close" aria-label="Fermer" onClick={() => setActiveModal(null)}>
            <X size={18} />
          </button>
        </header>

        <div className="or-tabs" role="tablist" aria-label="Domaines mathématiques">
          {domains.map((dom) => {
            const active = dom.id === selectedDomain;
            return (
              <button
                key={dom.id}
                type="button"
                role="tab"
                className={`or-tab${active ? ' is-active' : ''}`}
                aria-selected={active}
                onClick={() => {
                  setSelectedDomain(dom.id);
                  setOpenIdx(0);
                }}
              >
                {DOMAIN_ICON[dom.id]}
                <span>{dom.label}</span>
              </button>
            );
          })}
        </div>

        <div className="or-body" id="orient-list">
          {chapters.map((ch, idx) => {
            const opened = idx === openIdx;
            return (
              <article key={`${program?.id}-${ch.chId}-${idx}`} className={`or-card${opened ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="or-card-head"
                  aria-expanded={opened}
                  onClick={() => setOpenIdx(opened ? -1 : idx)}
                >
                  <span className="or-num">{pad2(idx + 1)}{opened ? '.' : ''}</span>
                  <span className="or-ttl"><MathHtml text={ch.title} /></span>
                  <ChevronDown size={16} className="or-chev" aria-hidden="true" />
                </button>

                {opened ? (
                  <div className="or-inner">
                    <div className="or-sec">
                      <h4 className="or-eyebrow or-eyebrow--pink">Contenus</h4>
                      <ul className="or-items">
                        {ch.contents.map((line, i) => (
                          <li key={i} className="or-row">
                            <span className="or-idx">{pad2(i + 1)}</span>
                            <span className="or-txt"><MathHtml text={line} /></span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <hr className="or-sep" />

                    <div className="or-sec">
                      <h4 className="or-eyebrow or-eyebrow--lilac">Capacités attendues</h4>
                      <ul className="or-items">
                        {ch.capacities.map((line, i) => (
                          <li key={i} className="or-row">
                            <span className="or-arr" aria-hidden="true">&rarr;</span>
                            <span className="or-txt"><MathHtml text={line} /></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
