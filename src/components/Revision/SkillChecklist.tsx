import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { RevisionSection } from '../../types';
import MathRenderer from '../MathRenderer';

interface SkillChecklistProps {
  sections: RevisionSection[];
  masteredSkills: string[];
  onToggleSkill: (skillId: string, mastered: boolean) => void;
}

const getEncouragementMessage = (percent: number): string => {
  if (percent === 0) return "Début de l'évaluation.";
  if (percent < 20) return "Maintiens l'effort.";
  if (percent < 40) return "Les bases s'installent.";
  if (percent < 60) return "Poursuis avec discipline.";
  if (percent < 80) return "Bonne dynamique.";
  if (percent < 100) return "Presque au but.";
  return "Maîtrise totale.";
};

interface SkillCardProps {
  id: string;
  title: string;
  index: number;
  isMastered: boolean;
  onToggleMastery: (id: string, mastered: boolean) => void;
}

const SkillCard: React.FC<SkillCardProps> = ({
  id,
  title,
  index,
  isMastered,
  onToggleMastery
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [entered, setEntered] = useState(false);

  const handleToggle = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = !isMastered;
    if (newValue) {
      setIsAnimating(true);
      window.setTimeout(() => setIsAnimating(false), 500);
    }
    onToggleMastery(id, newValue);
  }, [id, isMastered, onToggleMastery]);

  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), index * 35 + 40);
    return () => window.clearTimeout(t);
  }, [index]);

  return (
    <div
      onClick={handleToggle}
      role="checkbox"
      aria-checked={isMastered}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle(e);
        }
      }}
      className={`
        group flex items-center justify-between gap-5 px-4 md:px-6 py-4.5 cursor-pointer
        transition-all duration-200 ease-out outline-none select-none
        border-b border-b-neutral-200/50 last:border-b-0
        ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}
        ${isMastered
          ? 'bg-transparent'
          : 'hover:bg-neutral-50/60 bg-transparent'
        }
      `}
    >
      <div className="flex-1 min-w-0 pr-2">
        <p className={`
          text-[15.5px] md:text-[16.5px] typo-ui leading-relaxed transition-all duration-200
          ${isMastered
            ? 'text-neutral-500 line-through decoration-neutral-950 decoration-[1.5px] font-normal'
            : 'text-neutral-950 font-bold group-hover:text-black'
          }
        `}>
          <MathRenderer inline content={title} fontSize="inherit" className="revision-title-text" />
        </p>
      </div>

      <div
        className={`
          relative shrink-0 w-[28px] h-[28px] md:w-[32px] md:h-[32px] rounded-lg
          flex items-center justify-center
          border-2 transition-all duration-200
          ${isMastered
            ? 'bg-neutral-950 border-neutral-950 shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
            : 'bg-white border-neutral-300 md:border-neutral-400 group-hover:border-neutral-950 shadow-sm'
          }
        `}
        style={{
          transform: isAnimating ? 'scale(1.15)' : 'scale(1)',
          transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        <FaIcon
          icon={faCheck}
          size={16}
          className={`text-white transition-all duration-200 ${isMastered ? 'scale-100 rotate-0 opacity-100' : 'scale-0 -rotate-12 opacity-0'}`}
        />
      </div>
    </div>
  );
};

const SkillChecklist: React.FC<SkillChecklistProps> = ({
  sections,
  masteredSkills,
  onToggleSkill
}) => {
  const methodSections = useMemo(() => sections.filter(s => s.category === 'method' || !s.category), [sections]);
  const masteredSet = useMemo(() => new Set(masteredSkills), [masteredSkills]);
  const masteredCount = masteredSet.size;
  const totalCount = methodSections.length;
  const percent = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
  const allMastered = masteredCount === totalCount && totalCount > 0;

  const encouragement = useMemo(() => getEncouragementMessage(percent), [percent]);

  const handleToggle = useCallback((skillId: string, mastered: boolean) => {
    onToggleSkill(skillId, mastered);
  }, [onToggleSkill]);

  if (sections.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 opacity-60">
        <p className="text-slate-500 typo-ui text-sm">
          Aucune compétence disponible pour ce chapitre.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 max-w-3xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5 border-b border-neutral-900 pb-3 mb-6">
          <h1 className="text-xl md:text-2xl typo-ui font-black text-neutral-950 tracking-tight leading-tight uppercase font-sans">
            Évaluation des Compétences
          </h1>
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-neutral-500">
            <span>Score :</span>
            <span className="text-neutral-950 text-base font-black">{masteredCount}</span>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-500">{totalCount}</span>
          </div>
        </div>

        {/* Aligner le texte d'encouragement et la barre de progression en noir sur une seule ligne */}
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 text-xs font-mono mb-6">
          <div className="flex items-center gap-2 text-neutral-700">
            <div className="w-2 h-2 bg-neutral-950 rounded-none shrink-0" />
            <span className="font-bold tracking-wide uppercase">{encouragement}</span>
          </div>
          
          <div className="flex items-center gap-3 w-full xs:w-auto self-stretch xs:self-auto justify-between xs:justify-end">
            <div className="flex-1 xs:flex-none xs:w-48 h-[6px] bg-neutral-100 border border-neutral-200 rounded-none relative overflow-hidden">
              <div 
                className="h-full bg-neutral-950 rounded-none transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="font-bold text-neutral-950 tabular-nums w-8 text-right shrink-0">{percent}%</span>
          </div>
        </div>
      </header>

      {/* Skills list - Unboxed, flat, clean lists with border-b separators */}
      <div className="flex flex-col min-h-0">
        {sections.map((section, idx) => {
          if (section.category === 'domain') {
            return (
              <div key={section.id} className="flex items-center justify-center gap-4 pt-8 pb-4 bg-transparent border-b border-b-neutral-900/10">
                <div className="h-[2px] w-6 bg-neutral-200 rounded-none" />
                <h2 className="text-sm md:text-base typo-ui font-black text-neutral-950 tracking-wide text-center uppercase font-sans">
                  {section.title}
                </h2>
                <div className="h-[2px] w-6 bg-neutral-200 rounded-none" />
              </div>
            );
          }
          if (section.category === 'subdomain') {
            return (
              <div key={section.id} className="mt-4 mb-1 px-4 py-1.5 flex items-center bg-neutral-50/50 border-y border-neutral-200/40">
                <h3 className="text-[11px] font-mono font-bold text-neutral-500 tracking-[0.08em] uppercase">
                  <MathRenderer inline content={section.title} fontSize="inherit" />
                </h3>
              </div>
            );
          }
          return (
            <SkillCard
              key={section.id}
              id={section.id}
              title={section.title}
              index={idx}
              isMastered={masteredSet.has(section.id)}
              onToggleMastery={handleToggle}
            />
          );
        })}
      </div>

      {/* Celebration */}
      {allMastered && (
        <div className="mt-10 mb-8 text-center animate-in zoom-in-95 fade-in duration-700">
          <div className="inline-flex flex-col items-center px-10 py-7 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm">
            <p className="font-semibold text-emerald-800 text-lg typo-ui tracking-wide">
              Maîtrise Complète
            </p>
            <p className="text-[13px] text-emerald-600/80 mt-1 typo-ui font-medium">
              Tu as validé l'essentiel de la leçon.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(SkillChecklist);
