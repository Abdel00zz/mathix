import React, { useLayoutEffect, useRef, useState } from 'react';
import MathRenderer from '../../MathRenderer';
import MediaRenderer from '../../MediaRenderer';
import { RevisionBlock } from '../../../types';

interface IntroBlockProps {
    content: string;
    media?: RevisionBlock['media'];
    typeTone: string;
}

/**
 * Bloc d'introduction d'un chapitre : mise en page en deux colonnes
 * (motivation à gauche, histoire + portrait du savant à droite). Le texte
 * est scindé à la dernière phrase précédant le premier marqueur \savant{}.
 */
const IntroBlock: React.FC<IntroBlockProps> = ({ content, media, typeTone }) => {
    const copyRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const [imageDimensions, setImageDimensions] = useState<{ src: string; ratio: number } | null>(null);
    const imageRatio = imageDimensions?.src === media?.src ? imageDimensions?.ratio : null;
    const savantIdx = content.indexOf('\\savant{');
    let motivationText = content;
    let historyText = '';

    if (savantIdx > 0) {
        const before = content.substring(0, savantIdx);
        const sentenceBreak = before.lastIndexOf('. ');
        const splitPos = sentenceBreak !== -1 ? sentenceBreak + 2 : savantIdx;
        motivationText = content.substring(0, splitPos).trim();
        historyText = content.substring(splitPos).trim();
    }

    useLayoutEffect(() => {
        const copy = copyRef.current;
        const image = imageRef.current;
        if (!copy || !image || !media?.src) return;

        let frameId: number | undefined;

        const syncEditorialRhythm = () => {
            window.cancelAnimationFrame(frameId ?? 0);
            frameId = window.requestAnimationFrame(() => {
                const isDesktop = window.matchMedia('(min-width: 768px)').matches;

                // La version mobile prÃ©serve un interligne naturel et confortable.
                if (!isDesktop) {
                    copy.style.removeProperty('line-height');
                    return;
                }

                // On repart du rythme de lecture de rÃ©fÃ©rence avant chaque mesure.
                copy.style.removeProperty('line-height');
                const baseHeight = copy.getBoundingClientRect().height;
                const imageHeight = image.getBoundingClientRect().height;
                const baseLineHeight = Number.parseFloat(window.getComputedStyle(copy).lineHeight);

                if (!baseHeight || !imageHeight || !Number.isFinite(baseLineHeight)) return;

                const lineCount = Math.max(2, Math.round(baseHeight / baseLineHeight));
                const desiredLineHeight = baseLineHeight + (imageHeight - baseHeight) / (lineCount - 1);
                // La limite Ã©vite tout interligne artificiel si le contenu est trÃ¨s court ou trÃ¨s long.
                const minimumLineHeight = baseLineHeight * 0.94;
                const maximumLineHeight = baseLineHeight * 1.8;
                const balancedLineHeight = Math.min(
                    maximumLineHeight,
                    Math.max(minimumLineHeight, desiredLineHeight),
                );

                copy.style.lineHeight = `${balancedLineHeight}px`;
            });
        };

        const observer = new ResizeObserver(syncEditorialRhythm);
        observer.observe(image);
        window.addEventListener('resize', syncEditorialRhythm);
        syncEditorialRhythm();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', syncEditorialRhythm);
            window.cancelAnimationFrame(frameId ?? 0);
            copy.style.removeProperty('line-height');
        };
    }, [media?.src, motivationText]);

    if (media?.additionalImages?.length || media?.position) {
        return <div className="revision-intro my-6 w-full" style={{ '--mathqst-color': typeTone } as React.CSSProperties}>
            <MediaRenderer media={media} surface="revision"><MathRenderer content={content} fontSize="inherit" enableLongPressHighlight /></MediaRenderer>
        </div>;
    }

    return (
        <div className="revision-intro mt-5 sm:mt-7 md:mt-9 mb-7 md:mb-9 w-full relative z-0" style={{ '--mathqst-color': typeTone } as React.CSSProperties}>
            <div className="revision-intro-layout">
                {/* Left — Motivation & Difficulté */}
                <div ref={copyRef} className="revision-intro-copy typo-ui text-[#3E3326] text-[0.98rem] sm:text-[1rem] md:text-[1.04rem] leading-[1.68] text-left [overflow-wrap:break-word]">
                    <MathRenderer content={motivationText} fontSize="inherit" enableLongPressHighlight />
                </div>

                {/* Right — Histoire & Savant */}
                {(historyText || media?.src) && (
                    <aside className="revision-intro-aside relative">
                        {/* Circle portrait — in flow with negative margin to overflow top */}
                        {media?.src && (
                            <figure className="revision-intro-figure relative z-10">
                                <div
                                    ref={imageRef}
                                    className="revision-intro-image revision-media-canvas isolate overflow-hidden"
                                    style={imageRatio ? { aspectRatio: imageRatio } : undefined}
                                >
                                    <img
                                        src={media.src}
                                        alt={media.alt || media.caption || 'Illustration'}
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-contain mix-blend-multiply"
                                        onLoad={(event) => {
                                            const { naturalWidth, naturalHeight } = event.currentTarget;
                                            if (naturalWidth && naturalHeight) {
                                                setImageDimensions({ src: media.src, ratio: naturalWidth / naturalHeight });
                                            }
                                        }}
                                    />
                                </div>
                                {/* Caption — slides in from left on hover */}
                                {media.caption && (
                                    <figcaption className="revision-intro-caption">
                                        {media.caption}
                                    </figcaption>
                                )}
                            </figure>
                        )}
                        {/* History text zone */}
                        {historyText && (
                            <div className="typo-ui text-slate-600 text-[0.9rem] md:text-[0.94rem] leading-[1.62] text-left [overflow-wrap:break-word]">
                                <MathRenderer content={historyText} fontSize="inherit" enableLongPressHighlight />
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
};

export default IntroBlock;
