import React from 'react';
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';
import { faStar as faStarSolid } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';

/** Étoiles de difficulté (1 à 5) affichées en coin des blocs "application". */
const ApplicationDifficultyStars: React.FC<{ value: number }> = ({ value }) => {
    if (!value) return null;

    return (
        <div
            className="absolute top-3.5 right-4 sm:right-5 z-30 flex items-center gap-[4px] select-none"
            aria-label={`Difficulté ${value} sur 5`}
            title={`Difficulté ${value}/5`}
        >
            {Array.from({ length: 5 }, (_, index) => {
                const active = index < value;
                return (
                    <FaIcon
                        key={index}
                        icon={active ? faStarSolid : faStarRegular}
                        size={12}
                        className={active ? 'text-[#f59e0b] drop-shadow-[0_1px_4px_rgba(245,158,11,0.35)]' : 'text-[#cbd5e1]'}
                    />
                );
            })}
        </div>
    );
};

export default ApplicationDifficultyStars;
