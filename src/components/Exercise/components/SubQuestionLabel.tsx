import React, { memo } from 'react';

interface SubQuestionLabelProps {
    label: string;
    isActive: boolean;
}

/**
 * Lettre de sous-question « a » en typographie mathématique avec nuance bleue, sans point.
 */
const SubQuestionLabel = memo(({ label, isActive }: SubQuestionLabelProps) => (
    <span
        className={`shrink-0 inline-block min-w-[clamp(1.35rem,1.25rem_+_0.4vw,1.65rem)] typo-exercise text-[clamp(1.01rem,0.96rem_+_0.22vw,1.14rem)] select-none leading-none tabular-nums transition-colors duration-200 print:min-w-[1.4rem] print:text-[11pt] ${
            isActive ? 'font-bold text-sky-600' : 'font-semibold text-sky-600/90'
        }`}
    >
        {label}
    </span>
));

export default SubQuestionLabel;
