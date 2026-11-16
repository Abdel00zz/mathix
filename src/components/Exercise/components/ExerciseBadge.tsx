import React, { memo } from 'react';

interface ExerciseBadgeProps {
    number: string;
    examenYear?: number;
    examenSession?: string;
}

/**
 * Badge « EXERCICE 01 » moderne, géométrique et sans arrondi (rounded-none).
 * Cadre pour le libellé « EXERCICE » et cadre assorti pour le numéro « X ».
 */
const ExerciseBadge = memo(({ number, examenYear, examenSession }: ExerciseBadgeProps) => (
    <div className="inline-flex items-center gap-3 flex-wrap select-none">
        {/* Double cadre géométrique sans arrondi (EXERCICE + NUMÉRO) */}
        <div className="inline-flex items-stretch rounded-none border-2 border-slate-900 shadow-[3px_3px_0_rgba(15,23,42,0.12)]">
            {/* Cadre "EXERCICE" */}
            <div className="bg-slate-900 text-white px-3 py-1 flex items-center justify-center">
                <span className="typo-mono font-bold text-[0.72rem] sm:text-[0.78rem] uppercase tracking-[0.2em] leading-none">
                    Exercice
                </span>
            </div>

            {/* Cadre "NUMÉRO" (ex: 01) */}
            <div className="bg-white text-slate-900 px-2.5 sm:px-3 py-1 border-l-2 border-slate-900 flex items-center justify-center min-w-[2.2rem]">
                <span className="typo-mono font-black text-[0.82rem] sm:text-[0.9rem] tracking-wider tabular-nums leading-none">
                    {number}
                </span>
            </div>
        </div>

        {/* Badge Examen National (sans arrondi, style harmonieux) */}
        {examenYear && (
            <div className="inline-flex items-center px-2.5 py-1 rounded-none border border-slate-300 bg-slate-50 text-slate-600 text-[0.68rem] sm:text-[0.74rem] font-semibold uppercase tracking-[0.14em] typo-mono shadow-[2px_2px_0_rgba(0,0,0,0.04)]">
                Examen National {examenYear}{examenSession ? ` · ${examenSession}` : ''}
            </div>
        )}
    </div>
));

export default ExerciseBadge;
