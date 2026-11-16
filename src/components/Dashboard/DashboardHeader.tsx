import React, { memo, useMemo } from 'react';
import { DashboardHeaderProps } from './DashboardHeader/types';
import {
    toSentenceCase,
    getEyebrow,
    getTitle,
} from './DashboardHeader/utils';
import { getApprendreUrl } from '../../services/cloudAuthClient';
import { useI18n } from '../../i18n/I18nContext';

const NameMark: React.FC<{ name: string }> = ({ name }) => (
    <span 
        className="font-handwritten text-2xl sm:text-3xl text-[var(--section-color)] mx-1 inline-block transform -translate-y-0.5" 
        style={{ fontFamily: 'var(--font-handwritten, cursive)' }}
    >
        {name}
    </span>
);

const renderTitle = (title: string): React.ReactNode => {
    const [before, ...rest] = title.split('&');
    if (rest.length === 0) return title;

    return (
        <>
            {before.trimEnd()}{' '}
            <span className="font-medium text-[var(--dashboard-lilac,rgb(149,112,252))]">&amp;</span>
            {' '}{rest.join('&').trimStart()}
        </>
    );
};

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
    user,
    activeSectionId = 'chapitres',
    activeSectionTitle,
    sectionColor: propSectionColor,
    isProfSession = false,
    profMessage,
    levelLabel,
    profName,
}) => {
    const { lang } = useI18n();

    const firstName = useMemo(() => toSentenceCase(user.name.split(' ')[0] || ''), [user.name]);
    const eyebrow = useMemo(() => getEyebrow(levelLabel || user.className), [user.className, levelLabel]);
    const profDisplayName = useMemo(() => profName || toSentenceCase(user.name || ''), [profName, user.name]);
    const title = useMemo(() => {
        if (lang === 'ar') {
            const titles: Record<string, string> = {
                chapitres: 'برنامج التحليل والجبر', examens: 'الامتحانات الوطنية', problemes: 'المسائل والاستدلال', olympiad: 'الأولمبياد في الرياضيات', concours: 'مباريات ولوج المدارس والمعاهد',
            };
            return titles[activeSectionId] || activeSectionTitle || titles.chapitres;
        }
        return getTitle(activeSectionId, activeSectionTitle);
    }, [activeSectionId, activeSectionTitle, lang]);

    const sectionColor = useMemo(() => {
        if (propSectionColor) return propSectionColor;
        switch (activeSectionId) {
            case 'chapitres': return '#b5369b';
            case 'examens': return '#f59e0b';
            case 'problemes': return '#8b5cf6';
            case 'olympiad': return '#ec4899';
            case 'concours': return '#10b981';
            default: return '#b5369b';
        }
    }, [activeSectionId, propSectionColor]);

    if (isProfSession) {
        return (
            <header
                className="dashboard-header dash-header relative w-full pb-3 mb-4 border-b border-slate-200/70"
                style={{ '--section-color': sectionColor } as React.CSSProperties}
            >
                <p className="text-[clamp(1rem,0.95rem+0.35vw,1.25rem)] leading-relaxed text-slate-900">
                    {eyebrow && <span className="font-semibold text-[var(--section-color)]">{eyebrow} — </span>}
                    Je suis ton professeur <NameMark name={profDisplayName} />
                    {profMessage ? ` — ${profMessage}` : ''}
                </p>
            </header>
        );
    }

    // Interface ciblée (Examens, Problèmes, Olympiades, Concours) : texte continu sobre sans boîtes superflues.
    if (activeSectionId !== 'chapitres') {
        return (
            <header
                className="dashboard-header dash-header w-full pb-2.5 mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200/60"
                style={{ '--section-color': sectionColor } as React.CSSProperties}
            >
                <p className="m-0 text-[clamp(0.98rem,0.94rem+0.25vw,1.12rem)] leading-snug text-[#1A1C25]">
                    <span className="font-semibold tracking-tight">{renderTitle(title)}</span>
                    {eyebrow && <span className="text-[#666B78] font-normal"> — {eyebrow}</span>}
                </p>
                <a
                    href={getApprendreUrl()}
                    className="text-xs font-medium text-[#1D2B66] hover:underline underline-offset-4 shrink-0"
                    title={lang === 'ar' ? 'فتح دفتر المراجعة والتمارين' : 'Ouvrir le cahier interactif Apprendre'}
                >
                    {lang === 'ar' ? 'دفتر المراجعة' : 'Cahier Apprendre'}
                </a>
            </header>
        );
    }

    return (
        <header
            className="dashboard-header dash-header w-full pb-3 mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200/65"
            style={{ '--section-color': sectionColor } as React.CSSProperties}
        >
            <p className="m-0 text-[clamp(1.05rem,0.98rem+0.4vw,1.3rem)] leading-relaxed text-[#1A1C25]">
                <strong className="font-semibold tracking-tight">
                    {firstName
                        ? (lang === 'ar' ? `مرحباً ${firstName}` : `Bonjour ${firstName}`)
                        : renderTitle(title)}
                </strong>
                {eyebrow && (
                    <span className="text-[#666B78] font-normal text-[0.9em]">
                        {' · '}{eyebrow}
                    </span>
                )}
                <span className="text-[#666B78] font-normal text-[0.86em]">
                    {' · '}
                    {lang === 'ar'
                        ? 'فكرة، اختبار، وخطوة إلى الأمام.'
                        : 'Une notion, un quiz, un pas de plus.'}
                </span>
            </p>
            <a
                href={getApprendreUrl()}
                className="text-xs font-medium text-[#1D2B66] hover:underline underline-offset-4 shrink-0"
                title={lang === 'ar' ? 'فتح دفتر المراجعة والتمارين' : 'Ouvrir le cahier interactif Apprendre'}
            >
                {lang === 'ar' ? 'دفتر المراجعة' : 'Cahier Apprendre'}
            </a>
        </header>
    );
};

export default memo(DashboardHeader);
