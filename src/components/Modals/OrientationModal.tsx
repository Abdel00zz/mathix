

import React, { useState, useEffect, useMemo } from 'react';
import { faChevronDown, faCalculator, faShapes, faInfinity } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import MathRenderer from '../MathRenderer';
import PageShell from '../UI/PageShell';
import SheetModal from '../UI/SheetModal';
import { getOrientationChaptersByClass } from '../../data/orientationContent';
import { useI18n } from '../../i18n/I18nContext';
import { translateClassLabel } from '../../i18n/classLabels';

interface OrientationModalProps {
  isOpen?: boolean;
  onClose: () => void;
  classId: string;
  variant?: 'modal' | 'page';
}

const CLASS_FULL_NAMES: Record<string, string> = {
  'tronc-commun-sc': 'Tronc Commun Scientifique',
  '1ere-bac-sc-ex': '1ère Bac Sciences Expérimentales',
  '1ere-bac-sc-math': '1ère Bac Sciences Mathématiques',
  '2eme-bac-sc-ex': '2ème Bac Sciences Expérimentales',
  '2eme-bac-sc-pc': '2ème Bac Sciences Physiques',
  '2eme-bac-sc-svt': '2ème Bac Sciences de la Vie et de la Terre',
  '2eme-bac-sc-math': '2ème Bac Sciences Mathématiques'
};

const OrientationModal: React.FC<OrientationModalProps> = ({ isOpen, onClose, classId, variant = 'page' }) => {
  const { lang, dir } = useI18n();
  const [activeTab, setActiveTab] = useState<string>('');
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  const className = translateClassLabel(classId, CLASS_FULL_NAMES[classId] || classId.replace(/-/g, ' '), lang);

  const chapters = useMemo(() => {
    return getOrientationChaptersByClass(classId);
  }, [classId]);

  const sections = useMemo(() => {
    return Array.from(new Set(chapters.map(c => c.section))).sort();
  }, [chapters]);

  useEffect(() => {
    if (sections.length > 0 && (!activeTab || !sections.includes(activeTab))) {
      setTimeout(() => setActiveTab(sections[0]), 0);
    }
  }, [sections, activeTab]);

  if (variant === 'modal' && !isOpen) return null;

  const activeChapters = chapters.filter(c => c.section === activeTab);

  const sectionTabs = (
    <div dir="ltr" lang="fr" className="orientation-french-content app-page__rail gap-1.5 sm:gap-2">
      {sections.map((section) => {
        const isActive = activeTab === section;
        let icon = faInfinity;
        if (section.toLowerCase().includes('algèbre') || section.toLowerCase().includes('géométrie')) icon = faShapes;
        else if (section.toLowerCase().includes('analyse')) icon = faCalculator;

        return (
          <button
            type="button"
            key={section}
            onClick={() => { setActiveTab(section); setExpandedItem(null); }}
            aria-pressed={isActive}
            className={`app-tap typo-ui modal-t-label flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-semibold tracking-wide whitespace-nowrap transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--modal-accent)] sm:px-5 ${isActive
              ? 'bg-slate-900 text-white shadow-sm'
              : 'border border-slate-200/80 bg-white/90 text-slate-600 hover:border-[var(--modal-accent-border)] hover:bg-[var(--modal-accent-soft)] hover:text-slate-900'
              }`}
          >
            <FaIcon icon={icon} size={14} className={isActive ? 'opacity-100 text-white' : 'opacity-75 text-slate-500'} aria-hidden="true" />
            <span>{section}</span>
          </button>
        );
      })}
    </div>
  );

  const content = (
    <PageShell
      title={lang === 'ar' ? 'التوجيه' : 'Orientation'}
      subtitle={className}
      onClose={onClose}
      toolbar={sectionTabs}
      dir={dir}
      contentMaxWidth={1024}
      contentClassName="!px-3 sm:!px-8"
    >
          <div dir="ltr" lang="fr" className="orientation-french-content space-y-2.5 sm:space-y-3">
          {activeChapters.map((item, idx) => {
            const isExpanded = expandedItem === item.id;
            return (
              <div
                key={item.id}
                className={`modal-card modal-card--interactive overflow-hidden mb-2.5 transition-all ${isExpanded ? 'modal-card--active' : ''}`}
              >
                <button
                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                  aria-expanded={isExpanded}
                  className="app-tap w-full flex items-center justify-between px-4 py-3.5 text-left gap-3.5 group/item sm:gap-5 sm:px-6 sm:py-4.5"
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0 sm:gap-5">
                    <span className={`modal-t-label flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold tabular-nums transition-all duration-200 ${isExpanded
                      ? 'bg-[var(--modal-accent)] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 group-hover/item:bg-slate-200 group-hover/item:text-slate-800'
                    }`}>{String(idx + 1).padStart(2, '0')}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`modal-t-lead font-bold leading-snug block transition-colors duration-200 ${isExpanded ? 'text-slate-900' : 'text-slate-700 group-hover/item:text-slate-900'}`}>
                        <MathRenderer inline content={item.title} fontSize="inherit" className="typo-title-mono" />
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-all duration-300 ${isExpanded
                    ? 'rotate-180 bg-white text-[var(--modal-accent-deep)] shadow-sm'
                    : 'text-slate-400 group-hover/item:bg-[var(--modal-accent-soft)] group-hover/item:text-[var(--modal-accent)]'
                  }`}>
                    <FaIcon icon={faChevronDown} size={14} aria-hidden="true" />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-5 pt-1 animate-in fade-in duration-200 sm:px-6 sm:pb-7">
                    <div className="rounded-2xl border border-slate-200/60 bg-slate-50/50 p-4 sm:p-5">

                      {/* ── Contenus ── */}
                      <div>
                        <p className="modal-t-micro mb-2.5 font-bold uppercase tracking-wider text-[var(--modal-accent)] sm:mb-3">Contenus</p>
                        <ul className="space-y-2 sm:space-y-2.5">
                          {item.contents.map((c, i) => (
                            <li key={i} className="modal-t-body flex gap-2.5 text-slate-700 sm:gap-3.5" style={{ alignItems: 'baseline', lineHeight: '1.7' }}>
                              <span className="modal-t-micro shrink-0 font-bold text-slate-400 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                              <span className="flex-1 min-w-0 font-medium overflow-x-auto" style={{ lineHeight: '1.7' }}>
                                <MathRenderer inline content={c} fontSize="inherit" />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* ── Capacités ── */}
                      <div className="mt-5 pt-4 border-t border-slate-200/50 sm:mt-6 sm:pt-5">
                        <p className="modal-t-micro mb-2.5 font-bold uppercase tracking-wider text-[var(--modal-lilac)] sm:mb-3">Capacités attendues</p>
                        <ul className="space-y-2 sm:space-y-2.5">
                          {item.capacities.map((c, i) => (
                            <li key={i} className="modal-t-body flex gap-2.5 text-slate-700 sm:gap-3.5" style={{ lineHeight: '1.7' }}>
                              <span
                                className="shrink-0 self-start text-[var(--modal-lilac)]"
                                style={{ marginTop: '0.35em', fontSize: '13px', lineHeight: 1 }}
                              >→</span>
                              <span className="flex-1 min-w-0 font-medium overflow-x-auto" style={{ lineHeight: '1.7' }}>
                                <MathRenderer inline content={c} fontSize="inherit" />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {activeChapters.length === 0 && (
            <div className="text-center text-slate-400 py-10 text-sm">
              Aucun contenu disponible pour cette section.
            </div>
          )}
        </div>
    </PageShell>
  );

  if (variant === 'modal') {
    return (
      <SheetModal open label="Orientation" onClose={onClose} desktopMaxWidth="48rem">
        {content}
      </SheetModal>
    );
  }

  return content;
};

export default OrientationModal;
