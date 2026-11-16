import React from 'react';
import MathRenderer from '../MathRenderer';
import { RevisionBlock, RevisionSection } from '../../types';
import CourseBlock from './CourseBlock';
import InlineCanvasZone from '../Exercise/canvas/InlineCanvasZone';
import { useRevisionChapterId } from './annotation/RevisionIdentityContext';
import { useIsTabletSurface } from '../../hooks/useProfViewMode';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { useProfPersonalization } from '../../hooks/useProfPersonalization';
import { ANNOTATABLE_TYPES, normalizeBlockType } from '../../utils/revisionBlockTypes';

interface RevisionSectionBlockProps {
    section: RevisionSection;
    index?: number;
    blockNumbering: Record<string, number>;
}

interface PreparedRenderBlock {
    block: RevisionBlock;
    number?: number;
    sourceIndex: number;
}

/** A, B, ... Z, AA... — numéro visuel calculé, jamais stocké dans le JSON. */
const alphabeticIndex = (index: number): string => {
    let value = Math.max(1, index);
    let label = '';
    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return label;
};

// L'espacement entre blocs est piloté exclusivement par la feuille de style
// (`.revision-section-content > div + div`, cf. revision-blocks.css) : une
// règle `!important` y impose le rythme de lecture. L'ancien calcul JS
// (`getBlockSpacingClass`) était donc intégralement neutralisé — il est retiré
// pour ne pas laisser croire que la mise en page dépend des types voisins.
// La taxonomie des types, elle, vit dans `utils/revisionBlockTypes`.

const RevisionSectionBlock: React.FC<RevisionSectionBlockProps> = ({ section, index, blockNumbering }) => {
    const hasIntroBlock = section.blocks?.some(b => b.type === 'intro');
    const chapterId = useRevisionChapterId();
    const isTabletSurface = useIsTabletSurface();
    const professorAccess = useProfessorAccess();
    const { canvas } = useProfPersonalization();
    // La zone d'encre n'est montée que là où elle sert réellement. Elle était
    // auparavant montée pour tous puis masquée en CSS : chaque bloc annotable
    // payait deux lectures `localStorage` + `JSON.parse` même pour un élève.
    // Le réglage « canvas » du prof peut couper complètement la fonctionnalité.
    const canShowInk = !!chapterId && isTabletSurface && professorAccess && canvas.enabled;

    const prepared: PreparedRenderBlock[] = [];
    if (section.blocks) {
        for (let i = 0; i < section.blocks.length; i++) {
            const raw = section.blocks[i];

            prepared.push({
                block: raw,
                number: blockNumbering[`${section.id}-${i}`],
                sourceIndex: i,
            });
        }
    }

    const renderedNodes: React.ReactNode[] = [];
    for (let i = 0; i < prepared.length; i++) {
        const item = prepared[i];

        // Zone manuscrite « Stylo » — blocs « box » + pratique (exemple, application).
        const canAnnotate = ANNOTATABLE_TYPES.has(normalizeBlockType(item.block.type));

        renderedNodes.push(
            <div
                key={item.sourceIndex}
                id={`revision-block-${section.id}-${item.sourceIndex}`}
                data-revision-search-block="true"
                data-revision-section-id={section.id}
                data-revision-block-type={normalizeBlockType(item.block.type)}
            >
                <CourseBlock block={item.block} number={item.number} />
                {canAnnotate && canShowInk && (
                    <div className="print:hidden">
                        <InlineCanvasZone noteKey={`boxnote:${chapterId}:${section.id}:${item.sourceIndex}`} />
                    </div>
                )}
            </div>
        );
    }

    const sectionContent = section.blocks ? (
        <div className="revision-section-content">{renderedNodes}</div>
    ) : (
        <div
            id={`revision-block-${section.id}-content`}
            data-revision-search-block="true"
            data-revision-section-id={section.id}
            className="revision-reading-block text-[#2c2b29] typo-ui font-normal flow-root tracking-normal antialiased text-left"
        >
            <MathRenderer content={section.content || ''} className="!tracking-normal" fontSize="base" />
        </div>
    );

    return (
        <section id={section.id} className="revision-section scroll-mt-24 relative">
            {section.title && !hasIntroBlock && (
                <div className="revision-section-heading">
                    <span className="revision-section-index select-none" aria-hidden="true">
                        {`${alphabeticIndex(index || 1)}.`}
                    </span>
                    <h2 className="revision-section-title typo-ui m-0 [&_.katex]:text-[1em]">
                        <MathRenderer inline content={section.title} fontSize="inherit" className="revision-title-text" />
                    </h2>
                </div>
            )}

            <div className="revision-section-body">{sectionContent}</div>
        </section>
    );
};

export default React.memo(RevisionSectionBlock);
