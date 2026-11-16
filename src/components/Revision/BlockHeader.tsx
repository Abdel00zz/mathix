import React from 'react';
import MathRenderer from '../MathRenderer';
import { ENV_COLORS, ENV_LABELS } from '../../styles/mathTheme';
import { tokensOf } from '../../styles/revisionPalette';
import { QuestionGlyph } from './RevisionArtwork';

interface BlockHeaderProps {
    type: string;
    label: string;
    title?: string;
    number?: number;
}

type BadgeConfig = {
    /** Couleur d'accent (titre + point d'interrogation), issue de la palette. */
    hex: string;
    /** true → badge "nu" (texte coloré sans pastille), false → pastille pleine. */
    noBox?: boolean;
};

// Types affichés en badge "nu" (théorie/méthode), les autres en pastille.
const NO_BOX_TYPES = new Set(['definition', 'proposition', 'property', 'lemma', 'theorem', 'corollary', 'method', 'strategy']);

const normalizeBlockType = (t: string) => {
    const norm = t.trim().toLowerCase();
    if (norm === 'note') return 'remark';
    if (norm === 'technique') return 'rappel';
    if (norm === 'indices' || norm === 'indice') return 'hint';
    if (norm === 'methode') return 'method';
    return norm;
};

// Config dérivée de la palette : l'accent vient d'ENV_COLORS (familles
// pastel), le style "nu vs pastille" du jeu NO_BOX_TYPES.
const getBadgeConfig = (typeKey: string): BadgeConfig => ({
    hex: ENV_COLORS[typeKey] ?? ENV_COLORS.default,
    noBox: NO_BOX_TYPES.has(typeKey),
});

interface RevisionBadgeProps {
    typeKey: string;
    label: string;
    number?: number | string;
    /** @deprecated Les badges sont désormais des indicateurs sémantiques purs (NASA/NatGeo) */
    onToggle?: () => void;
    expanded?: boolean;
    controls?: string;
}

export const RevisionBadge = ({ typeKey, label, number }: RevisionBadgeProps) => {
    const tokens = tokensOf(typeKey);

    return (
        <div
            className={`revision-badge revision-badge-${typeKey} inline-flex items-center gap-1.5 select-none`}
            style={{ 
                backgroundColor: tokens.bgSoft,
                borderColor: tokens.border,
                color: tokens.accent,
            }}
        >
            <span
                className="revision-badge-label typo-ui font-semibold uppercase tracking-[0.08em] leading-none whitespace-nowrap"
            >
                {label}
            </span>
            {number !== undefined && number !== null && `${number}`.trim() !== '' && (
                <span className="revision-badge-number font-bold tabular-nums">
                    {number}
                </span>
            )}
        </div>
    );
};

const BlockHeader: React.FC<BlockHeaderProps> = ({ type, label, title, number }) => {
    const typeKey = normalizeBlockType(type);
    const resolvedLabel = typeKey === 'rappel' ? 'Rappel' : label;
    const cfg = getBadgeConfig(typeKey);
    const titleColor = cfg.hex;

    const hasTitle = title && !['example', 'remark', 'proof', 'warning'].includes(typeKey);

    if (typeKey === 'warning') {
        const warningLabel = number ? `${ENV_LABELS.warning} ${number}` : ENV_LABELS.warning;
        return (
            <div className="revision-warning-header mb-1.5 flex flex-wrap items-center gap-2 select-none" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <span className="revision-warning-label">{warningLabel}</span>
                {title && (
                    <>
                        <span className="revision-warning-separator text-[#be123c] font-semibold text-sm select-none" aria-hidden="true">—</span>
                        <h4 className="typo-display font-semibold text-[1.02rem] sm:text-[1.08rem] m-0 text-[#9f1239] leading-snug">
                            <MathRenderer inline content={title} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                        </h4>
                    </>
                )}
            </div>
        );
    }

    /* ── RAPPEL : badge absolu au-dessus du cadre ── */
    if (typeKey === 'rappel') {
        return (
            <div className="revision-rappel-header" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <div className="absolute top-0 -translate-y-1/2 left-4 sm:left-5 select-none z-20">
                    <RevisionBadge typeKey="rappel" label={resolvedLabel} number={number} />
                </div>
                {title && (
                    <div className="revision-rappel-title-shell">
                        <h4 className="revision-rappel-title typo-ui">
                             <MathRenderer inline content={title} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                        </h4>
                    </div>
                )}
            </div>
        );
    }

    if (typeKey === 'application') {
        return (
            <div className="revision-application-header select-none relative mb-3 flex flex-col items-start text-left ml-0 pl-0" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <div className="select-none mb-2 flex items-center justify-start text-left w-full ml-0 pl-0">
                    <RevisionBadge typeKey="application" label={resolvedLabel} number={number} />
                </div>
                {hasTitle && (
                    <h4 className="typo-display font-semibold text-[1.12rem] sm:text-[1.2rem] m-0 mb-1.5 leading-snug text-[#0f172a] text-left">
                        <MathRenderer inline content={title!} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                    </h4>
                )}
            </div>
        );
    }

    if (typeKey === 'example') {
        return (
            <div className="revision-example-header select-none relative mb-2.5" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <div className="select-none">
                    <RevisionBadge typeKey="example" label={resolvedLabel} number={number} />
                </div>
            </div>
        );
    }

    if (typeKey === 'intuition') {
        return (
            <div className="revision-intuition-header mb-2 select-none relative" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <div className="select-none mb-1.5">
                    <RevisionBadge typeKey="intuition" label={ENV_LABELS.intuition} number={number} />
                </div>
                {title && (
                    <span className="typo-ui text-[#0f172a] text-[1.08rem] sm:text-[1.14rem] font-semibold pt-1 inline-block">
                        <MathRenderer inline content={title} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                    </span>
                )}
            </div>
        );
    }

    if (typeKey === 'summary') {
        return (
            <div className="revision-summary-header select-none relative mb-2" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
                <div className="select-none">
                    <RevisionBadge typeKey="summary" label={ENV_LABELS.summary} number={number} />
                </div>
            </div>
        );
    }

    if (typeKey === 'intro' || typeKey === 'exploration') return null;

    return (
        <div className="revision-block-header relative mb-2.5 flex flex-col items-start gap-1.5" style={{ '--mathqst-color': titleColor } as React.CSSProperties}>
            {!cfg.noBox && (
                <div className="select-none mb-1 cursor-default">
                    <RevisionBadge typeKey={typeKey} label={resolvedLabel} number={number} />
                </div>
            )}
            {hasTitle && (() => {
                const cleanTitle = title ? title.replace(/\?\s*$/, '').replace(/\?\s*(\$\s*)$/, '$1') : '';
                return (
                    <h4 className="m-0 typo-display font-semibold text-[1.2rem] md:text-[1.34rem] leading-[1.32] tracking-[-0.01em] text-left text-[#0f172a]">
                        {typeKey === 'method' ? (
                            <span className="revision-method-holo">
                                <MathRenderer inline content={cleanTitle} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                                <span className="ml-1 revision-question-mark revision-question-mark-linked">
                                    <QuestionGlyph />
                                </span>
                            </span>
                        ) : (
                            <>
                                <MathRenderer inline content={cleanTitle} fontSize="inherit" className="revision-title-text" enableLexicon={false} />
                                <span className="ml-1 revision-question-mark revision-question-mark-linked">
                                    <QuestionGlyph />
                                </span>
                            </>
                        )}
                    </h4>
                );
            })()}

            {cfg.noBox && typeKey !== 'method' && (
                <span className="typo-ui font-semibold text-[0.78rem] tracking-[0.1em] uppercase select-none" style={{ color: titleColor }}>
                    {resolvedLabel}
                </span>
            )}
        </div>
    );
};

export default React.memo(BlockHeader);
