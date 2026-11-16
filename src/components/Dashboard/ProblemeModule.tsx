import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile } from '../../types';
import { problemeService, ProblemeIndex, ProblemeEntry } from '../../services/problemeService';
import { faBookOpen, faStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { cn, ui } from '../UI/designSystem';
import { DashboardRow, EmptyState, InlineAlert, LoadingState, ModuleHeader, SegmentControl } from './DashboardModulePrimitives';
import { motion, AnimatePresence } from 'motion/react';

// --- Row component ---
const ProblemeRow: React.FC<{
  entry: ProblemeEntry;
  isLoading: boolean;
  onSelect: (entry: ProblemeEntry) => void;
}> = ({ entry, isLoading, onSelect }) => {
  const diffStars = entry.difficulty === 'facile' ? 1 : entry.difficulty === 'moyen' ? 3 : 5;

  const center = entry.difficulty ? (
    <div className="hidden items-center gap-0.5 sm:flex">
      {[1, 2, 3, 4, 5].map(i => (
        <FaIcon
          key={i}
          icon={i <= diffStars ? faStar : faStarRegular}
          size={11}
          aria-hidden="true"
          className={i <= diffStars ? 'text-[#FF7F50]' : 'text-[#D6D0CA]'}
        />
      ))}
    </div>
  ) : null;

  return (
    <DashboardRow
      title={entry.title}
      eyebrow={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 text-[0.65rem] font-bold uppercase tracking-wider">{entry.theme}</span>}
      center={center}
      isLoading={isLoading}
      onSelect={() => onSelect(entry)}
      titleClassName="text-[#1E2548] group-hover:text-[#FF7F50]"
    />
  );
};

// --- Main Module ---
interface ProblemeModuleProps {
  user: UserProfile;
  onSelectProbleme: (entry: ProblemeEntry) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
  hideHeader?: boolean;
}

const ProblemeModule: React.FC<ProblemeModuleProps> = ({
  user, onSelectProbleme, isExpanded, onToggle, hideHeader
}) => {
  const [index, setIndex] = useState<ProblemeIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTheme, setActiveTheme] = useState<string>('all');
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const showLoading = loading && !index;

  const classId = user.classId;

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  useEffect(() => {
    if (!index && isExpanded) {
      (async () => {
        try {
          const idx = await problemeService.loadIndex(classId);
          setIndex(idx);
        } catch (err) {
          console.error('Failed to load problème index:', err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [classId, isExpanded, index]);

  const filteredProblemes = useMemo(() => {
    if (!index) return [];
    return problemeService.getByTheme(index, activeTheme);
  }, [index, activeTheme]);

  const handleSelect = useCallback(async (entry: ProblemeEntry) => {
    setLoadingEntryId(entry.id);
    setErrorMsg(null);
    try {
      onSelectProbleme(entry);
    } catch (err) {
      console.error('Failed to load problème:', err);
      setErrorMsg('Impossible de charger ce problème.');
      setLoadingEntryId(null);
    }
  }, [onSelectProbleme]);

  const themes = useMemo(() => {
    if (!index) return [];
    return [{ id: 'all', name: 'Tous' }, ...index.themes];
  }, [index]);

  return (
    <section className={cn(ui.dashboard.module, isExpanded ? 'mb-12 mt-0 w-full max-w-[1180px] mx-auto' : 'mb-8 mt-12 w-full max-w-[900px] mx-auto hover:opacity-95')} style={{ ['--accent' as any]: '#FF7F50' }}>

      {!hideHeader && (
        <ModuleHeader
          badge="Pb."
          eyebrow="Résolution guidée"
          title="Problèmes"
          expanded={!!isExpanded}
          accentClassName="group-hover:bg-[#FF7F50] group-hover:text-white group-hover:border-[#FF7F50]"
          onToggle={onToggle}
        />
      )}


      {isExpanded && index && themes.length > 1 && (
        <div className="flex flex-col items-center justify-center gap-4 mt-4 mb-8 w-full px-2 max-w-2xl mx-auto">
          <div className="flex flex-col text-center">
             <span className="text-[0.65rem] font-bold tracking-[0.2em] uppercase text-slate-400 mb-1.5">Thématiques</span>
             <h4 className="text-[1.25rem] tracking-tight text-slate-800 font-medium">Explorer par sujet</h4>
          </div>
          
          <div className="w-full flex justify-center">
            <SegmentControl
              value={activeTheme}
              options={themes.map(t => ({ value: t.id, label: t.name }))}
              onChange={(val) => setActiveTheme(val)}
            />
          </div>
        </div>
      )}

      {/* --- LIST (ACCORDION CONTENT) --- */}
      <div className={`transition-[grid-template-rows,opacity,margin] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] grid ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
        <div className="overflow-hidden">
          {errorMsg && (
            <InlineAlert onDismiss={() => setErrorMsg(null)}>{errorMsg}</InlineAlert>
          )}

          {showLoading ? (
            <LoadingState label="Préparation des problèmes" rows={4} />
          ) : filteredProblemes.length > 0 ? (
            <motion.div layout className={ui.dashboard.list}>
              <AnimatePresence mode="popLayout">
                {filteredProblemes.map(entry => (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    <ProblemeRow
                      entry={entry}
                      isLoading={loadingEntryId === entry.id}
                      onSelect={handleSelect}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <EmptyState icon={faBookOpen} text="Aucun problème disponible." />
          )}
        </div>
      </div>
    </section>
  );
};

export default ProblemeModule;
