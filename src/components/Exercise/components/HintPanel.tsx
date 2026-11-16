
import React, { memo, useMemo } from 'react';
import MathRenderer from '../../MathRenderer';

interface HintPanelProps {
    hint: string;
    isOpen: boolean;
}

const HintPanel = memo(({ hint, isOpen }: HintPanelProps) => {
    const cleanText = useMemo(() => {
        if (!isOpen || !hint) return '';
        return hint.trim();
    }, [hint, isOpen]);

    if (!isOpen || !hint) return null;

    return (
        <div className="mt-2 sm:mt-3 mb-3 sm:mb-5 pl-0 pr-0 md:pl-12 md:pr-8 animate-in fade-in slide-in-from-top-2 duration-500 ease-out print:hidden">
            <div className="relative">

                {/* Conteneur Principal - Style Élégant et Moderne */}
                <div className="
                    relative
                    rounded-2xl
                    bg-gradient-to-br from-slate-50/80 via-white to-slate-50/60
                    border border-slate-200/60
                    shadow-lg shadow-slate-200/20
                    backdrop-blur-sm
                    pt-4 pl-4 pr-4 pb-3 sm:pt-6 sm:pl-6 sm:pr-6 sm:pb-5 md:pt-7 md:pl-7 md:pr-7 md:pb-6
                    transition-all duration-300
                    hover:shadow-xl hover:shadow-slate-300/25 hover:border-slate-300/70
                    hover:bg-gradient-to-br hover:from-slate-50/90 hover:via-white hover:to-slate-50/70
                ">
                    {/* Badge "Indice" Élégant - Style Cohérent */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="
                            inline-flex items-center px-3 py-1
                            rounded-lg
                            bg-black
                            border border-slate-800
                            shadow-[0_2px_8px_rgba(0,0,0,0.1)]
                            ring-1 ring-white/10 inset-0
                        ">
                            <span className="typo-ui font-bold text-[11px] uppercase tracking-widest text-slate-100">
                                Indice
                            </span>
                        </div>
                    </div>

                    {/* Contenu de l'indice */}
                    {cleanText && (
                        <div className="relative typo-ui text-[0.92rem] sm:text-[1rem] md:text-[1.08rem] text-slate-700 leading-[1.65] sm:leading-[1.7] [&_.katex]:text-[0.95em]">
                            <MathRenderer content={cleanText} fontSize="inherit" enableKeywords={false} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default HintPanel;
