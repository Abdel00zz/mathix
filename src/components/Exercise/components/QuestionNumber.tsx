import React, { memo } from 'react';

interface QuestionNumberProps {
    number: string;
}

/**
 * Numéro de question principal : « 1 » en serif gras, net et sans point.
 */
const QuestionNumber = memo(({ number }: QuestionNumberProps) => (
    <span className="shrink-0 inline-block min-w-[clamp(1.45rem,1.35rem_+_0.45vw,1.8rem)] typo-exercise text-[clamp(1.04rem,0.99rem_+_0.24vw,1.18rem)] font-bold text-slate-900 select-none leading-none tabular-nums print:min-w-[1.5rem] print:text-[12pt]">
        {number}
    </span>
));

export default QuestionNumber;
