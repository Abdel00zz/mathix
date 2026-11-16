import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  faCalendar,
  faChevronRight,
  faDice,
  faGraduationCap,
  faGrip,
  faCircleNotch,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { School, SchoolsData } from '../../services/concoursService';
import { getSchoolStats } from '../../services/concoursProgress';
import { cn } from '../UI/designSystem';
import { DashboardRow, EmptyState, LoadingState, SegmentControl } from './DashboardModulePrimitives';

// ── Types ────────────────────────────────────────────────────────────────────

type CatalogType = 'all' | 'random' | 'annale' | 'theme';

interface CatalogItem {
  id: string;
  type: 'random' | 'annale' | 'theme';
  title: string;
  count: number;
  year?: string;
  themeId?: string;
}

interface ConcoursModuleProps {
  schoolsData: SchoolsData | null;
  loading: boolean;
  onStartConcoursExam: (schoolId: string, themeId: string | null, questionCount: number, year?: string | null) => void;
}

const FILTERS: Array<{ value: CatalogType; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'annale', label: 'Epreuves' },
  { value: 'theme', label: 'Thèmes' },
  { value: 'random', label: 'Simulation' },
];

// ── Row ──────────────────────────────────────────────────────────────────────

const SCHOOL_ACCENTS: Record<string, string> = {
  ensa: '#2563eb',
  medecine: '#dc2626',
  ensam: '#8a7500',
};

const getSchoolAccent = (school?: School): string => (
  school ? (SCHOOL_ACCENTS[school.id] || school.color || '#0d946a') : '#0d946a'
);

const ConcoursRow: React.FC<{
  item: CatalogItem;
  isLoading: boolean;
  best?: number;
  onSelect: () => void;
}> = ({ item, isLoading, best, onSelect }) => {
  const icon = item.type === 'annale' ? faCalendar : item.type === 'theme' ? faGrip : faDice;
  const isRandom = item.type === 'random';

  const title = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <FaIcon icon={icon} size={13} className="shrink-0 text-slate-400 group-hover:text-[var(--learning-blue)] transition-colors duration-200" aria-hidden="true" />
      <span className="truncate text-slate-800 group-hover:text-slate-900 transition-colors duration-200">{item.title}</span>
      {item.year && (
        <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-[var(--learning-blue)] transition-transform duration-300 group-hover:scale-105">
          {item.year}
        </span>
      )}
    </span>
  );

  const progress = Math.max(0, Math.min(100, best ?? 0));
  const center = (
    <div className="w-28 sm:w-36">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/90"
        role="progressbar"
        aria-label={`Progression ${item.title}${item.year ? ` ${item.year}` : ''}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        title={`${progress}%`}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${progress}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>
    </div>
  );
  const right = (
    isLoading ? (
      <FaIcon icon={faCircleNotch} size={15} spin className="text-[#FF7F50]" aria-hidden="true" />
    ) : (
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'min-w-[48px] text-right text-xs font-bold leading-none uppercase tracking-wider transition-all duration-300',
            isRandom ? 'text-amber-700' : 'text-slate-500'
          )}
        >
          {isRandom ? 'Simulation' : `${item.count} qst`}
        </span>
        <FaIcon icon={faChevronRight} size={14} className="opacity-30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-70" aria-hidden="true" />
      </div>
    )
  );

  return (
    <DashboardRow
      title={title}
      center={center}
      centerClassName="pointer-events-none absolute left-1/2 -translate-x-1/2"
      right={right}
      isLoading={isLoading}
      onSelect={onSelect}
      className="rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 bg-slate-50/50 border border-slate-200/50 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200"
    />
  );
};

// ── Module ───────────────────────────────────────────────────────────────────

const ConcoursModule: React.FC<ConcoursModuleProps> = ({ schoolsData, loading, onStartConcoursExam }) => {
  const schools = useMemo(() => schoolsData?.schools ?? [], [schoolsData]);

  const [activeSchoolId, setActiveSchoolId] = useState<string>(() => {
    return sessionStorage.getItem('concours_active_school') || '';
  });
  const [filter, setFilter] = useState<CatalogType>(() => {
    const saved = sessionStorage.getItem('concours_active_filter');
    return (saved === 'all' || saved === 'annale' || saved === 'theme' || saved === 'random') ? saved : 'all';
  });
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem('concours_active_filter', filter);
  }, [filter]);

  // École active dérivée (pas de setState dans un effet) : on retombe sur la
  // première école tant que le choix mémorisé n'est pas (encore) valide.
  const school: School | undefined = useMemo(
    () => schools.find(s => s.id === activeSchoolId) || schools[0],
    [schools, activeSchoolId]
  );

  const handleSelectSchool = useCallback((id: string) => {
    setActiveSchoolId(id);
    sessionStorage.setItem('concours_active_school', id);
  }, []);

  const accent = getSchoolAccent(school);
  const defaultCount = school?.questionsPerExam || 20;

  // Stats personnelles (localStorage, synchrone) — records par session.
  const stats = useMemo(() => (school ? getSchoolStats(school.id) : null), [school]);

  // Catalogue construit à partir des comptages PRÉCALCULÉS (schools.json) :
  // aucun téléchargement de fichier de questions → rendu instantané.
  const catalogItems = useMemo<CatalogItem[]>(() => {
    if (!school) return [];
    // Comptages précalculés (schools.json). S'ils manquent (future école non
    // indexée), on n'élimine pas l'item — on évite seulement ceux explicitement vides.
    const themeCounts = school.themeCounts;
    const total = school.totalQuestions || 0;

    const random: CatalogItem = {
      id: 'random-all',
      type: 'random',
      title: 'Simulation complète',
      count: Math.min(defaultCount, total || defaultCount),
    };

    const annales = [...school.annales]
      .filter(a => a.count === undefined || a.count > 0)
      .sort((a, b) => Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10))
      .map<CatalogItem>(a => ({
        id: `annale-${a.year}`,
        type: 'annale',
        title: 'Session',
        year: a.year,
        count: a.count ?? defaultCount,
      }));

    const themes = school.themes
      .map<CatalogItem>(t => ({
        id: `theme-${t.id}`,
        type: 'theme',
        title: t.name,
        themeId: t.id,
        count: themeCounts ? (themeCounts[t.id] || 0) : defaultCount,
      }))
      .filter(t => t.count > 0);

    return [random, ...annales, ...themes];
  }, [school, defaultCount]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return catalogItems;
    return catalogItems.filter(item => item.type === filter);
  }, [catalogItems, filter]);

  const handleSelect = useCallback((item: CatalogItem) => {
    if (!school || item.count <= 0) return;
    setLoadingItem(item.id);
    const count = Math.min(defaultCount, item.count);
    if (item.type === 'annale') onStartConcoursExam(school.id, null, count, item.year || null);
    else if (item.type === 'theme') onStartConcoursExam(school.id, item.themeId || null, count, null);
    else onStartConcoursExam(school.id, null, count, null);
  }, [school, defaultCount, onStartConcoursExam]);

  if (loading && !schoolsData) {
    return <LoadingState label="Préparation des concours" rows={4} />;
  }

  if (!school) {
    return <EmptyState icon={faGraduationCap} text="Aucun concours disponible pour le moment." />;
  }

  return (
    <section
      className="w-full max-w-[1180px] mx-auto typo-ui"
      style={{ ['--accent' as any]: accent, ['--compact-accent' as any]: accent }}
    >
      {/* Toolbar : sélecteur d'école + filtre de type */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mt-4 mb-8 w-full px-1">
        <div className="w-full sm:w-auto min-w-[200px] sm:max-w-xs">
          <SegmentControl
            value={school.id}
            options={schools.map(s => ({ value: s.id, label: s.name, color: getSchoolAccent(s) }))}
            onChange={handleSelectSchool}
            className="w-full"
          />
        </div>
        <div className="w-full sm:w-auto min-w-[280px] sm:max-w-sm sm:ml-auto">
          <SegmentControl
            value={filter}
            options={FILTERS}
            onChange={(value) => setFilter(value as CatalogType)}
            className="w-full"
          />
        </div>
      </div>

      {/* Statbar personnelle (records) — affichée seulement si l'élève a joué */}
      {/* Liste */}
      {filteredItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          {filteredItems.map(item => (
            <ConcoursRow
              key={item.id}
              item={item}
              isLoading={loadingItem === item.id}
              best={stats?.byItem[item.id]?.best}
              onSelect={() => handleSelect(item)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={faGraduationCap} text="Aucun contenu pour ce filtre." />
      )}
    </section>
  );
};

export default memo(ConcoursModule);
