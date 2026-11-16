import React, { memo } from 'react';
import MathRenderer from '../../MathRenderer';

interface PartHeaderProps {
    partLabel: string;
    content?: string;
}

/**
 * En-tête de partie centré style LaTeX avec police Itim : « ── Partie I ── »
 * avec filets horizontaux fins dégradés et typographie soignée.
 */
const PartHeader = memo(({ partLabel, content }: PartHeaderProps) => (
    <div className="my-[clamp(0.75rem,1.6vw,1.15rem)] animate-in fade-in duration-500 select-none">
        <div className="flex items-center justify-center gap-[clamp(0.75rem,1.6vw,1.15rem)]">
            <span
                className="h-[0.5px] w-[clamp(2.25rem,5vw,3.75rem)]"
                style={{
                    background: 'linear-gradient(to right, transparent, #aaa39b)'
                }}
            />
            <h2 className="font-itim text-[clamp(1.14rem,1.06rem_+_0.34vw,1.32rem)] font-normal text-black tracking-wide select-none leading-none">
                Partie {partLabel}
            </h2>
            <span
                className="h-[0.5px] w-[clamp(2.25rem,5vw,3.75rem)]"
                style={{
                    background: 'linear-gradient(to left, transparent, #aaa39b)'
                }}
            />
        </div>
        {content && (
            <div className="mt-2 text-center text-[clamp(0.98rem,0.93rem_+_0.22vw,1.1rem)] typo-exercise font-medium text-slate-800 leading-relaxed [&_.katex]:tracking-normal print:text-[12pt]">
                <MathRenderer inline content={content} enableKeywords={false} fontSize="inherit" />
            </div>
        )}
    </div>
));

export default PartHeader;
