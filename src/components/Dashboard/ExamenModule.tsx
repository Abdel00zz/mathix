import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile, ChapterProgress } from '../../types';
import {
  examenService, ExamenIndex, ExamenIndexEntry, ExamenData, ExamenTheme, DifficultyLevel
} from '../../services/examenService';
import { faCalendar, faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { faDice, faFileLines, faGrip, faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { cn, ui } from '../UI/designSystem';
import { DashboardRow, LoadingState, ModuleHeader } from './DashboardModulePrimitives';

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile',
};

const DIFFICULTY_STARS: Record<DifficultyLevel, number> = { facile: 1, moyen: 3, difficile: 5 };
const DIFFICULTY_LEVELS: DifficultyLevel[] = ['facile', 'moyen', 'difficile'];

type CatalogItem = 
  | { type: 'national'; id: string; title: string; subtitle: string; year: number; session: string; raw: ExamenIndexEntry }
  | { type: 'theme'; id: string; title: string; count: number; diff: number; raw: ExamenTheme }
  | { type: 'aleatoire'; id: string; title: string; difficultyLevel: DifficultyLevel };

// --- List Row (warm-academic style, harmonized with Prepa Concours) ---
const ExamRow: React.FC<{
  item: CatalogItem;
  index: number;
  isLoading: boolean;
  onSelect: (i: CatalogItem) => void;
  doneCount?: number;
  totalCount?: number;
}> = ({ item, index: _index, isLoading, onSelect, doneCount: _doneCount, totalCount }) => {
  const isNat = item.type === 'national';
  const isTheme = item.type === 'theme';
  const isRand = item.type === 'aleatoire';
  const isRattrapage = isNat && item.session.toLowerCase() === 'rattrapage';

  const icon = isNat ? faCalendar : isTheme ? faGrip : faDice;

  const title = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {!isNat && <FaIcon icon={icon} size={14} className="shrink-0 text-slate-400 group-hover:text-[var(--theme-color,#b45309)] transition-colors duration-200" />}
      <span className="truncate text-slate-800 group-hover:text-slate-900 transition-colors duration-200">{isNat ? 'Examen national' : item.title}</span>
      {isNat && (
        <span className="shrink-0 text-sm font-extrabold text-[var(--theme-color,#b45309)] transition-transform duration-300 group-hover:scale-105 sm:text-base">
          {item.year}
        </span>
      )}
    </span>
  );

  const center = (
    <div className="flex min-w-[90px] items-center justify-center gap-2">
      {isNat && (
        <span
          className={cn(
            'text-xs font-bold uppercase tracking-wider transition-all duration-300',
            isRattrapage ? 'text-amber-700' : 'text-slate-500'
          )}
        >
          {isRattrapage ? 'Rattrapage' : 'Normale'}
        </span>
      )}
      {isTheme && (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {totalCount} ex.{totalCount && totalCount > 1 ? 's' : ''}
        </span>
      )}
      {isRand && (
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-0.5 opacity-70 sm:flex">
            {[1, 2, 3, 4, 5].map(i => {
              const isFilled = i <= DIFFICULTY_STARS[item.difficultyLevel];
              return (
                <FaIcon
                  key={i}
                  icon={isFilled ? faStarSolid : faStarRegular}
                  size={11}
                  className={isFilled ? 'text-amber-500' : 'text-slate-300'}
                />
              );
            })}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
            Simulation
          </span>
        </div>
      )}
    </div>
  );

  return (
    <DashboardRow
      title={title}
      center={center}
      isLoading={isLoading}
      onSelect={() => onSelect(item)}
      className="rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 bg-slate-50/50 border border-slate-200/50 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200"
    />
  );
};

// --- Main Module ---
interface ExamenDashboardModuleProps {
  user: UserProfile;
  globalProgress: Record<string, ChapterProgress>;
  onStartExamen: (examen: ExamenData) => void;
  onOpenCadreReferentiel?: () => void;
  isExpanded?: boolean;
  onToggle?: () => void;
  hideHeader?: boolean;
}

const ExamenDashboardModule: React.FC<ExamenDashboardModuleProps> = ({
  user, globalProgress, onStartExamen, onOpenCadreReferentiel, isExpanded, onToggle, hideHeader
}) => {
  const [index, setIndex] = useState<ExamenIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const showLoading = loading && !index;
  const [themeStats, setThemeStats] = useState<Record<string, { count: number; avgDifficulty: number }>>({});
  
  const FILTER_KEY = `examen-inline-filters-${user.classId}`;
  const [filters, setFilters] = useState<{ type: 'all' | 'national' | 'theme' | 'aleatoire' }>(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { type: 'all' };
  });

  const [selectedExamenId, setSelectedExamenId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('moyen');
  const [buildingRandom, setBuildingRandom] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  useEffect(() => {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [FILTER_KEY, filters]);

  const classId = user.classId;

  // Load only when expanded for performance, or fetch once and cache
  useEffect(() => {
    if (!index && isExpanded) {
      (async () => {
        try {
          const [idx, stats] = await Promise.all([
            examenService.loadIndex(classId),
            examenService.getThemeStats(classId),
          ]);
          setIndex(idx);
          setThemeStats(stats as any);
        } catch (err) {
          console.error('Failed to load examen index:', err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [classId, isExpanded, index]);

  const handleSelectExamen = useCallback(async (entry: ExamenIndexEntry) => {
    setSelectedExamenId(entry.id);
    setErrorMsg(null);
    try {
      const examen = await examenService.loadExamen(entry.path);
      onStartExamen(examen);
    } catch (err) {
      console.error('Failed to load examen:', err);
      setErrorMsg('Impossible de charger cet examen.');
      setSelectedExamenId(null);
    }
  }, [onStartExamen]);

  const handleThemeStart = useCallback(async (themeId: string) => {
    setSelectedTheme(themeId);
    setBuildingRandom(true);
    setErrorMsg(null);
    try {
      const exercises = await examenService.getExercisesByTheme(classId, themeId);
      if (exercises.length === 0) {
        setErrorMsg('Aucun exercice disponible pour ce thème.');
        return;
      }
      const selected = exercises.map((ex, i) => ({ ...ex, number: i + 1 }));
      const clean = selected.map(({ sourceExamenId: _sourceExamenId, ...rest }) => rest);
      
      const themeName = index?.themes.find(t => t.id === themeId)?.name || themeId;
      const examen: ExamenData = {
        id: `theme-${themeId}-${Date.now()}`,
        title: `Sujet Thématique — ${themeName}`,
        type: 'national',
        year: new Date().getFullYear(),
        classId,
        duration: 120,
        totalPoints: clean.reduce((s, e) => s + e.points, 0),
        exercises: clean,
      };
      onStartExamen(examen);
    } catch (err) {
      console.error('Failed to build theme exam:', err);
      setErrorMsg('Erreur lors de la génération du sujet.');
    } finally {
      setBuildingRandom(false);
      setSelectedTheme(null);
    }
  }, [classId, index, onStartExamen]);

  const handleRandomStart = useCallback(async (difficultyLvl: DifficultyLevel) => {
    setDifficulty(difficultyLvl);
    setBuildingRandom(true);
    setErrorMsg(null);
    try {
      const examen = await examenService.buildRandomExam(classId, difficultyLvl);
      onStartExamen(examen);
    } catch (err) {
      console.error('Failed to build exam:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBuildingRandom(false);
    }
  }, [classId, onStartExamen]);

  const handleCardClick = useCallback((item: CatalogItem) => {
    if (item.type === 'national') handleSelectExamen(item.raw as ExamenIndexEntry);
    else if (item.type === 'theme') handleThemeStart((item.raw as ExamenTheme).id);
    else if (item.type === 'aleatoire') handleRandomStart(item.difficultyLevel);
  }, [handleSelectExamen, handleThemeStart, handleRandomStart]);

  const isCardLoading = useCallback((item: CatalogItem) => {
    if (item.type === 'national') return selectedExamenId === (item.raw as ExamenIndexEntry).id;
    if (item.type === 'theme') return buildingRandom && selectedTheme === (item.raw as ExamenTheme).id;
    if (item.type === 'aleatoire') return buildingRandom && difficulty === item.difficultyLevel;
    return false;
  }, [selectedExamenId, buildingRandom, selectedTheme, difficulty]);

  const catalogItems = useMemo(() => {
    if (!index) return [];
    const items: CatalogItem[] = [];
    index.examens.forEach(e => items.push({ 
      type: 'national', id: e.id, title: `${e.year}`, 
      subtitle: e.session || 'Normale', year: e.year, 
      session: e.session?.toLowerCase() === 'rattrapage' ? 'Rattrapage' : 'Normale', raw: e 
    }));
    index.themes.forEach(t => items.push({ 
      type: 'theme', id: `th-${t.id}`, title: t.name, 
      count: themeStats[t.id]?.count || 0, diff: themeStats[t.id]?.avgDifficulty || 0, raw: t 
    }));
    DIFFICULTY_LEVELS.forEach(d => items.push({ 
      type: 'aleatoire', id: `al-${d}`, title: `Niveau ${DIFFICULTY_LABELS[d]}`, difficultyLevel: d 
    }));
    return items;
  }, [index, themeStats]);

  const filteredItems = useMemo(() => {
    return catalogItems.filter(item => {
      if (filters.type !== 'all' && item.type !== filters.type) return false;
      return true;
    }).sort((a, b) => {
      const getVal = (i: CatalogItem) => {
         if (i.type === 'national') return i.year + (i.session.toLowerCase() === 'rattrapage' ? 0.5 : 0);
         if (i.type === 'theme') return 2000;
         return 0;
      };
      return getVal(b) - getVal(a);
    });
  }, [catalogItems, filters]);

  return (
    <section className={cn(ui.dashboard.module, isExpanded ? 'mb-12 mt-0' : 'mb-8 mt-12 hover:opacity-80')} style={{ ['--accent' as any]: '#b45309' }}>

      {!hideHeader && (
        <ModuleHeader
          badge="Ex."
          eyebrow="Parcours officiel"
          title="Examens Nationaux"
          expanded={!!isExpanded}
          accentClassName="group-hover:bg-[#b45309] group-hover:text-white group-hover:border-[#b45309]"
          onToggle={onToggle}
        />
      )}
 
      {isExpanded && (
        <div className={cn(ui.dashboard.toolbar, 'mt-0 mb-5 px-2 sm:px-3')} style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenCadreReferentiel?.(); }}
            className="flex items-center px-4 py-2 sm:px-5 sm:py-2 bg-white text-slate-700 border border-slate-200 hover:border-[var(--theme-color,var(--accent,#f59e0b))] hover:text-[var(--theme-color,var(--accent,#f59e0b))] transition-all duration-300 rounded-xl hover:-translate-y-[1px] shrink-0 mr-4 text-[0.6rem] sm:text-xs font-bold uppercase tracking-wider shadow-sm hover:shadow-md"
          >
            Cadre Référentiel
          </button>
          <div className={cn(ui.dashboard.segmented, 'w-fit shrink-0 bg-slate-100/60 p-1 rounded-full border border-slate-200/50 backdrop-blur-sm')}>
            {(['all', 'national', 'theme', 'aleatoire'] as const).map(type => {
              const labels = { all: 'Tous', national: 'Par Année', theme: 'Thèmes', aleatoire: 'Simulations' };
              const active = filters.type === type;
              return (
                <button
                  key={type}
                  onClick={(e) => { e.stopPropagation(); setFilters({ type }); }}
                  className={cn(
                    "relative px-3 py-1.5 sm:px-4 sm:py-2 text-[0.6rem] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-300 ease-out shrink-0 rounded-full select-none outline-none focus:outline-none",
                    active 
                      ? "text-[var(--theme-color,var(--accent,#f59e0b))] font-extrabold" 
                      : "text-slate-500 hover:text-[var(--theme-color,var(--accent,#f59e0b))]"
                  )}
                >
                  {active && (
                    <span 
                      className="absolute inset-0 rounded-full -z-10 shadow-sm border"
                      style={{
                        background: 'color-mix(in srgb, var(--theme-color, var(--accent, #f59e0b)) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--theme-color, var(--accent, #f59e0b)) 25%, transparent)',
                      }}
                    />
                  )}
                  <span className="relative z-10">{labels[type]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
 
      {/* --- LIST (ACCORDION CONTENT) --- */}
      <div className={`grid transition-[grid-template-rows,opacity,margin] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2 sm:mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
          {errorMsg && (
            <div className={ui.dashboard.alert}>
              <span>{errorMsg}</span>
              <button onClick={(e) => { e.stopPropagation(); setErrorMsg(null); }} className="text-slate-500 hover:text-[#0f172a]">&times;</button>
            </div>
          )}

          {showLoading ? (
            <LoadingState label="Préparation des examens" rows={4} />
          ) : filteredItems.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 sm:px-6">
              {filteredItems.map((item, i) => {
                const done = Object.keys(globalProgress[item.id]?.exerciseFeedback || {}).length;
                const total = (item as any).raw?.exerciseCount || (item.type === 'theme' ? item.count : 0);
                return (
                  <ExamRow
                    key={item.id}
                    item={item}
                    index={i}
                    isLoading={isCardLoading(item)}
                    onSelect={handleCardClick}
                    doneCount={Math.max(done, 0)}
                    totalCount={total}
                  />
                );
              })}
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center text-[#6B6460]">
              <FaIcon icon={faFileLines} size={28} className="mb-3 opacity-40" />
              <p className="typo-dashboard-title italic text-base">Aucun sujet trouvé.</p>
            </div>
          )}
        </div>
      </section>
  );
};

export default ExamenDashboardModule;
