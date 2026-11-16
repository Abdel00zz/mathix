
import React, { memo } from 'react';
import MediaRenderer from '../../MediaRenderer';
import RichText from './RichText';
import { MediaConfig } from '../../../types';

interface ContextBlockProps {
    content: string;
    media?: MediaConfig;
}

const CONTEXT_TEXT = "text-[clamp(1rem,0.95rem_+_0.24vw,1.15rem)] leading-[1.65] tracking-normal text-slate-900 typo-exercise antialiased [&_.katex]:text-[1.02em] [&_.katex-display]:!my-1.5 print:text-[12pt]";

const ContextBlock = memo(({ content, media }: ContextBlockProps) => (
    <div className="relative mb-[clamp(0.75rem,1.5vw,1.125rem)] animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className={CONTEXT_TEXT}>
            <MediaRenderer media={media} variant="exercise">
                <RichText content={content} />
            </MediaRenderer>
        </div>
    </div>
));

export default ContextBlock;
