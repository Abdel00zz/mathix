import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons';
import { ChapterProgress, UserProfile } from '../../types';
import { DsDevoirData } from '../../services/dsService';
import { OlympiadItemEntry, OlympiadManifest, olympiadService } from '../../services/olympiadService';
import { cn } from '../UI/designSystem';
import { DashboardRow, EmptyState, LoadingState, SegmentControl } from './DashboardModulePrimitives';

interface OlympiadModuleProps {
  user: UserProfile;
  globalProgress: Record<string, ChapterProgress>;
  onStartOlympiad: (session: DsDevoirData) => void;
}

const OlympiadRow: React.FC<{
  item: OlympiadItemEntry;
  isLoading: boolean;
  percentage: number;
  onOpen: () => void;
}> = ({ item, isLoading, percentage: _percentage, onOpen }) => {
  const badgeStyle = item.badge === 'international'
    ? 'bg-[#FF7F50] text-white'
    : 'bg-[#E4DFDA]/60 text-[#6B6460]';

  return (
    <DashboardRow
      title={item.title}
      center={(
        <div className={cn('px-3 py-1 sm:px-4 sm:py-1.5 flex justify-center items-center rounded-full text-[0.6rem] sm:text-xs font-bold uppercase tracking-wider transition-all duration-300 group-hover:scale-105', badgeStyle)}>
          {item.badge}
        </div>
      )}
      isLoading={isLoading}
      onSelect={onOpen}
      titleClassName="text-[#1E2548] group-hover:text-[#FF7F50]"
    />
  );
};

const OlympiadModule: React.FC<OlympiadModuleProps> = ({ user, globalProgress, onStartOlympiad }) => {
  const [manifest, setManifest] = useState<OlympiadManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBadge, setActiveBadge] = useState<'all' | 'national' | 'international'>('all');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const showLoading = loading;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await olympiadService.loadManifest(user.classId);
        if (active) setManifest(data);
      } catch {
        if (active) setManifest(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user.classId]);

  const filtered = useMemo(() => {
    const items = manifest?.items || [];
    return items
      .filter((i) => activeBadge === 'all' || i.badge === activeBadge)
      .sort((a, b) => b.year - a.year);
  }, [manifest, activeBadge]);

  const openItem = useCallback(async (item: OlympiadItemEntry) => {
    setLoadingId(item.id);
    try {
      const session = await olympiadService.loadAsSession(item.path);
      onStartOlympiad(session);
    } finally {
      setLoadingId(null);
    }
  }, [onStartOlympiad]);

  if (showLoading) return <LoadingState label="Préparation des olympiades" rows={4} />;

  if (!manifest || filtered.length === 0) {
    return <EmptyState icon={faBookOpen} text="Aucune épreuve olympiad disponible pour le moment." />;
  }

  return (
    <section className="w-full max-w-[1180px] mx-auto typo-ui">
      <div className="flex flex-col items-center justify-center gap-4 mt-4 mb-8 w-full px-2 max-w-2xl mx-auto">
        <div className="flex flex-col text-center">
          <span className="text-[0.65rem] font-bold tracking-[0.2em] uppercase text-slate-400 mb-1.5">Archive Nationale</span>
          <h4 className="text-[1.25rem] tracking-tight text-slate-800 font-medium">Olympiades {manifest.years[0]}-{manifest.years[manifest.years.length - 1]}</h4>
        </div>
        <div className="w-full flex justify-center">
          <SegmentControl
            value={activeBadge}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'national', label: 'National' },
              { value: 'international', label: 'International' },
            ]}
            onChange={(value) => setActiveBadge(value as 'all' | 'national' | 'international')}
          />
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((item) => {
          const done = Object.keys(globalProgress[item.id]?.exerciseFeedback || {}).length;
          const total = item.exerciseCount || 0;
          const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <OlympiadRow
              key={item.id}
              item={item}
              isLoading={loadingId === item.id}
              percentage={percentage}
              onOpen={() => openItem(item)}
            />
          );
        })}
      </div>
    </section>
  );
};

export default OlympiadModule;
