import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile, ChapterProgress, RevisionSection } from '../../types';
import SkillChecklist from '../Revision/SkillChecklist';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';

interface CadreReferentielViewProps {
  user: UserProfile;
  onBack: () => void;
  globalProgress: Record<string, ChapterProgress>;
  onToggleSkill?: (skillId: string, mastered: boolean) => void;
}

const CadreReferentielView: React.FC<CadreReferentielViewProps> = ({
  user, onBack: _onBack, globalProgress, onToggleSkill
}) => {
  const [cadreData, setCadreData] = useState<{ sections: RevisionSection[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const showLoading = useMinimumLoading(loading);

  const classId = user.classId;

  useEffect(() => {
    (async () => {
      try {
        const isJson = (r: Response) =>
          (r.headers.get('content-type') || '').includes('application/json') ||
          (r.headers.get('content-type') || '').includes('text/plain');

        const res = await fetch(`/data/${classId}/examen/cadre_referentiel.json`);

        if (res.ok && isJson(res)) {
          const data = await res.json();
          setCadreData(data);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [classId]);

  const masteredSkills = useMemo(
    () => globalProgress['cadre_referentiel']?.masteredSkills || [],
    [globalProgress]
  );

  const handleToggleSkill = useCallback(
    (skillId: string, mastered: boolean) => onToggleSkill?.(skillId, mastered),
    [onToggleSkill]
  );

  if (showLoading) return <LoadingSpinner context="framework" />;

  if (error || !cadreData || cadreData.sections.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent gap-4">
        <p className="text-[#8B949E] text-sm">Cadre référentiel non disponible pour cette classe.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-transparent relative overflow-hidden typo-ui">
      {/* Content */}
      <main className="relative z-10 max-w-[1000px] mx-auto px-4 sm:px-6 pt-10 pb-24">
        <div className="mb-8">
          <h1 className="typo-ui font-bold text-[1.5rem] sm:text-[1.95rem] leading-tight">
            <span className="text-[#2c2b29]">Cadre </span>
            <span className="text-[#F59E0B]">Référentiel</span>
          </h1>
          <p className="typo-ui text-[#8C7A5E] text-[0.85rem] mt-2 leading-relaxed max-w-xl">
            Évaluez votre maîtrise des compétences clés du programme pour l'examen national.
          </p>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <SkillChecklist
            sections={cadreData.sections}
            masteredSkills={masteredSkills}
            onToggleSkill={handleToggleSkill}
          />
        </div>
      </main>
    </div>
  );
};

export default CadreReferentielView;
