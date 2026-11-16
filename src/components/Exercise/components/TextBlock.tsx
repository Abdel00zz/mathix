import React, { memo } from 'react';
import type { MediaConfig } from '../../../types';
import MediaRenderer from '../../MediaRenderer';
import RichText from './RichText';

interface TextBlockProps {
    content: string;
    /**
     * Figure du bloc de texte. Le studio laisse en poser une ici ; sans ce
     * rendu, elle n'apparaissait qu'à l'impression — jamais à l'écran.
     */
    media?: MediaConfig;
}

const TextBlock = memo(({ content, media }: TextBlockProps) => (
    <div className="my-[clamp(1.1rem,2.4vw,1.6rem)] text-[clamp(1rem,0.95rem_+_0.2vw,1.1rem)] leading-[1.6] text-slate-800 typo-exercise antialiased animate-in fade-in duration-500 [&_.katex]:text-[1em]">
        <MediaRenderer media={media} variant="exercise">
            <RichText content={content} />
        </MediaRenderer>
    </div>
));

export default TextBlock;
