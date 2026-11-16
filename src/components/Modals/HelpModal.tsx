import React, { useState } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faFileLines,
    faCode,
    faBolt,
    faCircleQuestion,
    faVideo,
    faGlobe,
    faComments,
    faEnvelope,
    faChevronDown,
    faChalkboardUser,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import PageShell from '../UI/PageShell';
import SheetModal from '../UI/SheetModal';
import { useI18n } from '../../i18n/I18nContext';
import { getBrandAssets } from '../../i18n/brandAssets';

interface HelpModalProps {
    isOpen?: boolean;
    onClose: () => void;
    variant?: 'modal' | 'page';
    audience?: 'general' | 'professor';
}

const BrandWordmark: React.FC<{ lang: 'fr' | 'ar' }> = ({ lang }) => {
    const brand = getBrandAssets(lang);
    return (
    <div className={`mx-auto ${lang === 'ar' ? 'aspect-[3/1] w-[min(88vw,330px)] sm:w-[min(520px,52vw)]' : 'aspect-[3/2] w-[min(76vw,220px)] sm:w-[min(420px,42vw)]'}`} aria-label={brand.alt}>
        <img src={brand.logo} alt="" className="h-full w-full object-contain" />
    </div>
    );
};

// ── Super Sleek Colored Accordion Item ──
const MinimalAccordionItem: React.FC<{
    icon: IconDefinition;
    colorBg: string;
    colorText: string;
    title: string;
    subtitle: string;
    description: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    isRtl?: boolean;
}> = ({ icon, colorBg, colorText, title, subtitle, description, isOpen, onToggle, isRtl }) => {
    return (
        <div className={`modal-card modal-card--interactive self-start overflow-hidden transition-all duration-300 ${isOpen ? 'modal-card--active' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
            <button
                type="button"
                onClick={onToggle}
                className={`app-tap group flex w-full items-center gap-3.5 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--modal-accent)] sm:px-5 sm:py-4 ${isRtl ? 'text-right' : 'text-left'}`}
                aria-expanded={isOpen}
            >
                {/* ICON BLOCK */}
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-current/10 shadow-sm transition-all duration-300 group-hover:-rotate-2 group-hover:scale-105 sm:h-12 sm:w-12 ${colorBg} ${colorText}`}>
                    <FaIcon icon={icon} size={19} aria-hidden="true" />
                </div>

                {/* TEXT BLOCK */}
                <div className={`flex-1 min-w-0 ${isRtl ? 'pl-1' : 'pr-1'}`}>
                    <h4 className={`modal-t-lead mb-0.5 font-bold leading-snug text-[#1c3532] ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                        {title}
                    </h4>
                    <p className={`modal-t-label text-slate-500 leading-snug ${isOpen ? 'line-clamp-none' : 'line-clamp-2'} ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                        {subtitle}
                    </p>
                </div>

                {/* CHEVRON */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${isOpen ? 'rotate-180 bg-white text-[var(--modal-accent-deep)] shadow-sm' : 'text-slate-400 group-hover:bg-[var(--modal-accent-soft)] group-hover:text-[var(--modal-accent)]'}`}>
                    <FaIcon icon={faChevronDown} size={15} aria-hidden="true" />
                </div>
            </button>
            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,1,0.2,1)] ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden min-h-0">
                    <div className="flex gap-3.5 px-4 pb-5 pt-1 sm:gap-5 sm:px-5 sm:pb-6">
                        <div className="w-13 shrink-0 hidden sm:block" />
                        <div className={`flex-1 min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                            <p className={`modal-t-body text-slate-600 leading-relaxed ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                                {description}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, variant = 'page', audience = 'general' }) => {
    const { lang: activeTab, setLang: setActiveTab } = useI18n();
    const [openIndex, setOpenIndex] = useState<number | null>(0); // First item open

    if (variant === 'modal' && !isOpen) return null;

    const isRtl = activeTab === 'ar';
    const isProfessorHelp = audience === 'professor';

    const infoMsgFr = (
        <span dir="ltr" className="block text-left">
            <span className="modal-t-h1 mb-3 block text-center font-sans font-bold text-[var(--modal-accent-deep)]">
                {isProfessorHelp ? 'Enseignez avec clarté. MathPlus s’occupe du reste.' : 'Votre espace mathématique d’excellence au Maroc.'}
            </span>
            Nous accompagnons les élèves de <span className="rounded bg-[var(--modal-accent-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">Sciences Mathématiques & Sciences Expérimentales</span> vers une <span className="rounded bg-[var(--modal-accent-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">compréhension plus profonde, un raisonnement affûté et des rédactions modèles</span> pour réussir leurs examens et intégrer les grandes écoles d’ingénieurs. Nous adoptons des méthodologies d’apprentissage modernes inspirées des meilleures pratiques universitaires (<span className="rounded bg-[var(--modal-lilac-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">apprentissage actif, Active Recall et répétition espacée</span>), validées par des institutions mondiales majeures telles que <span className="rounded bg-[var(--modal-lilac-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">Oxford et le MIT</span>.
        </span>
    );

    const infoMsgAr = (
        <span dir="rtl" className="block text-right">
            <span className="modal-t-h1 mb-3 block text-center font-sans font-bold text-[var(--modal-accent-deep)]">
                فضاؤك الرقمي لإتقان الرياضيات في المغرب.
            </span>
            نرافق تلميذات وتلاميذ <span className="rounded bg-[var(--modal-accent-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">شعبتي العلوم الرياضية والعلوم التجريبية</span> من أجل <span className="rounded bg-[var(--modal-accent-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">فهم أعمق، واستدلال رياضي أدق، وتحرير منهجي للحلول</span> استعداداً للامتحان الوطني الموحد ومباريات ولوج المدارس والمعاهد العليا. نعتمد منهجيات تعلّم حديثة، منها <span className="rounded bg-[var(--modal-lilac-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">التعلّم النشط، والاسترجاع النشط، والتكرار المتباعد</span>، المستوحاة من ممارسات جامعية رائدة في مؤسسات مثل <span className="rounded bg-[var(--modal-lilac-soft)] px-1.5 py-0.5 font-bold text-[var(--modal-accent-deep)]">Oxford وMIT</span>.
        </span>
    );

    const INFO_MSG = isRtl ? infoMsgAr : infoMsgFr;

    // The 5 requested targeted items with custom distinctive colors
    const ITEMS = [
        {
            icon: faFileLines,
            colorBg: 'bg-[#e8f7f3]',
            colorText: 'text-[#237f70]',
            title: isRtl ? 'ملخصات الدروس وبطاقات المراجعة' : 'Fiches de Cours & Cadre Référentiel',
            subtitle: isRtl ? 'ترسيخ المعارف الأساسية وفق البرنامج الدراسي.' : 'L’arsenal théorique incontournable conforme aux directives.',
            description: isRtl 
                ? 'راجع التعاريف والمبرهنات والخواص الرياضية الواردة في البرنامج الدراسي الرسمي. ويساعدك نظام الكشف التدريجي، القائم على الاسترجاع النشط، على تثبيت المعارف في الذاكرة طويلة الأمد.'
                : 'Consultez les Définitions, Théorèmes fondamentaux et Propriétés essentiels du programme officiel d\'excellence. Tous les éléments masquent leur contenu pour forcer l’Active Recall et consolider durablement vos bases théoriques.'
        },
        {
            icon: faBolt,
            colorBg: 'bg-[#eef3ff]',
            colorText: 'text-[#5274c8]',
            title: isRtl ? 'المنهجيات وتقنيات البرهنة' : 'Méthodes & Rigueur Rédactionnelle',
            subtitle: isRtl ? 'تعلّم تنظيم البرهان والتحرير الرياضي الدقيق.' : 'Rédigez comme un major, évitez les pièges classiques.',
            description: isRtl
                ? 'تعرّف إلى نماذج عملية لبناء البرهان وتنظيم مراحل الحل بلغة رياضية سليمة، مع تنبيهات إلى الأخطاء التعبيرية والمنطقية المتكررة ومعايير التحرير المطلوبة في الامتحانات.'
                : 'Des schémas de preuve détaillés pour chaque type de question. Apprenez à structurer vos rédactions selon les critères stricts exigés par les correcteurs des examens nationaux et concours.'
        },
        {
            icon: faCircleQuestion,
            colorBg: 'bg-[#fff6df]',
            colorText: 'text-[#a97817]',
            title: isRtl ? 'التقويم التشخيصي ورصد التعثرات' : 'Quiz Conceptuels & Diagnostic Flash',
            subtitle: isRtl ? 'تحديد الأخطاء والمفاهيم غير المكتسبة ومعالجتها.' : 'Débusquez vos lacunes logiques instantanément.',
            description: isRtl
                ? 'اختبارات قصيرة وتفاعلية تساعد على تشخيص التعثرات بسرعة. ويقدّم كل سؤال تصحيحاً واضحاً وإحالة مباشرة إلى الجزء المناسب من الدرس لتوفير دعم تربوي موجّه.'
                : 'Des QCM de haut niveau conçus pour traquer la moindre faille de raisonnement. En un clic, accédez à un renvoi ciblé vers l’élément exact du cours pour corriger vos automatismes.'
        },
        {
            icon: faGlobe,
            colorBg: 'bg-[#f2efff]',
            colorText: 'text-[#7560c8]',
            title: isRtl ? 'الامتحانات الوطنية ومباريات الولوج' : 'Annales Nationales & Concours',
            subtitle: isRtl ? 'تدرّب على مواضيع رسمية في ظروف قريبة من الامتحان.' : 'L’expérience ultime des épreuves officielles (Bac, FMP, ENSA...).',
            description: isRtl 
                ? 'تدرّب على مواضيع دورات سابقة للامتحان الوطني الموحد ومباريات ولوج المدارس والمعاهد العليا (FMP وENSA وENSAM وAPESA). ويمكنك فرز التمارين حسب الدروس أو إجراء محاكاة محددة المدة.'
                : 'Entraînez-vous en conditions réelles sur les sessions du Baccalauréat National ainsi que sur les concours d’accès aux grandes écoles d’élite. Filtrez par chapitre pour un travail thématique ciblé, ou simulez des épreuves chronométrées.'
        },
        {
            icon: faVideo,
            colorBg: 'bg-[#eaf7fb]',
            colorText: 'text-[#347f9a]',
            title: isRtl ? 'التمثيل التفاعلي وتتبع التقدّم' : 'Visualisation interactive & progression claire',
            subtitle: isRtl ? 'استكشف المفاهيم الرياضية بواسطة تمثيلات بيانية تفاعلية.' : 'Donnez une dimension concrète aux limites, fonctions et complexes.',
            description: isRtl
                ? 'استوعب المفاهيم المجرّدة من خلال تمثيلات بيانية حية للدوال والمتتاليات والأعداد العقدية في المستوى، مع مسار تعلّم واضح ومؤشرات سهلة لقراءة تقدّمك.'
                : 'Explorez vos chapitres à travers des graphes dynamiques pour manipuler visuellement les limites géométriques et complexes, avec un parcours de lecture clair et facile à suivre.'
        },
        {
            icon: faChalkboardUser,
            colorBg: 'bg-[#fff0eb]',
            colorText: 'text-[#bd6551]',
            title: isRtl ? 'فضاء الأستاذ والصفحة الشخصية' : 'Espace professeur & site personnel',
            subtitle: isRtl ? 'فضاء متكامل لإعداد الموارد التربوية وتدبير الأقسام.' : 'Un environnement avancé pour créer, publier et piloter vos classes.',
            description: isRtl ? (
                <span>
                    يستفيد الأستاذ من فضاء رقمي شخصي قابل للتخصيص، واستوديو لإعداد الموارد الرقمية التربوية ونشرها، وأدوات لتدبير الأقسام وتنشيط الحصص وتتبع تعلّمات التلاميذ وتقاسم الموارد. لاختيار الإعداد المناسب وتفعيل جميع الخدمات، يُرجى التواصل معنا على الرقم{' '}
                    <a href="tel:+2126756789" dir="ltr" className="font-bold text-[#b94f57] underline underline-offset-4">+2126756789</a>
                    {' '}أو عبر واتساب.
                </span>
            ) : (
                <span>
                    L’espace professeur comprend un site personnel personnalisable, un studio pour créer cours, quiz et exercices, le pilotage des classes et séances en direct, le suivi de progression et le partage de ressources. Pour définir la configuration adaptée et activer toutes les fonctionnalités, contactez-nous au{' '}
                    <a href="tel:+2126756789" className="font-bold text-[#b94f57] underline underline-offset-4">+2126756789</a>
                    {' '}ou sur WhatsApp.
                </span>
            )
        }
    ];

    const langSwitch = (
        <div className="flex rounded-xl border border-[#dcebe7] bg-[#f1f8f6] p-0.5">
            {(['fr', 'ar'] as const).map((lang) => (
                <button
                    key={lang}
                    onClick={() => setActiveTab(lang)}
                    aria-pressed={activeTab === lang}
                    className={`typo-ui modal-t-micro rounded-[9px] px-3 py-1.5 font-bold uppercase tracking-[0.08em] transition-all duration-200 sm:px-3.5 ${
                        activeTab === lang
                            ? 'bg-white text-[var(--modal-accent-deep)] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    {lang.toUpperCase()}
                </button>
            ))}
        </div>
    );

    /* Signature + contacts : sur téléphone ils descendent avec le contenu
       plutôt que d'occuper une barre fixe, l'écran étant déjà court. */
    const signature = (
        <div className={`mt-8 flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between ${isRtl ? 'sm:flex-row-reverse' : ''}`}>
            <div className="flex items-center gap-3 group">
                <div className="modal-icon-tile shrink-0 rounded-2xl p-2.5 transition-colors duration-300 shadow-sm">
                    <FaIcon icon={faCode} size={17} aria-hidden="true" />
                </div>
                <div className={`flex flex-col ${isRtl ? 'items-end text-right' : 'items-start text-left'}`}>
                    <span className="typo-ui modal-t-micro mb-1 whitespace-nowrap font-bold uppercase leading-none tracking-[0.15em] text-slate-400">
                            {isRtl ? 'الفكرة والتطوير' : 'Dev & Design'}
                    </span>
                    <span className={`modal-t-body font-semibold leading-none tracking-tight text-slate-800 ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                        {isRtl ? 'بدوح عبد المالك' : 'BOUDOUH ABDELMALEK'}
                    </span>
                </div>
            </div>

            <div className={`flex items-center gap-2.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <span className={`modal-t-label whitespace-nowrap text-slate-400 ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                            {isRtl ? 'تحتاج إلى مساعدة؟' : 'Besoin d\'aide ?'}
                </span>
                <a href="https://wa.me/212674680119" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="app-tap modal-button-secondary modal-button-compact flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-all hover:scale-105 active:scale-95">
                    <FaIcon icon={faComments} size={16} aria-hidden="true" />
                </a>
                <a href="mailto:bdh.malek@gmail.com" target="_blank" rel="noopener noreferrer" aria-label="E-mail" className="app-tap modal-button-secondary modal-button-compact flex h-10 w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-all hover:scale-105 active:scale-95">
                    <FaIcon icon={faEnvelope} size={16} aria-hidden="true" />
                </a>
            </div>
        </div>
    );

    const body = (
        <>
            {/* Hero Section */}
            <div className="mb-6 text-center sm:mb-8">
                <BrandWordmark lang={activeTab} />
                <p className={`modal-t-label mt-2 font-semibold text-[#6c817d] sm:mt-3 ${isRtl ? 'font-arabic tracking-normal' : 'typo-ui tracking-[0.04em]'}`}>
                    {isRtl ? 'مسارك نحو الإتقان' : isProfessorHelp ? 'Un espace simple pour créer, guider et faire progresser' : 'Votre parcours vers la maîtrise'}
                </p>
            </div>

            {/* Philosophy Box */}
            <div className={`modal-card modal-card--active mb-6 p-4 text-[var(--modal-muted)] sm:mb-7 sm:p-6 ${isRtl ? 'text-right' : 'text-left'}`}>
                <p className={`modal-t-body font-medium leading-relaxed ${isRtl ? 'font-arabic' : 'typo-ui'}`}>
                    {INFO_MSG}
                </p>
            </div>

            {/* Minimalist Accordion List */}
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                {ITEMS.map((item, idx) => (
                    <MinimalAccordionItem
                        key={idx}
                        icon={item.icon}
                        colorBg={item.colorBg}
                        colorText={item.colorText}
                        title={item.title}
                        subtitle={item.subtitle}
                        description={item.description}
                        isOpen={openIndex === idx}
                        onToggle={() => setOpenIndex(idx === openIndex ? null : idx)}
                        isRtl={isRtl}
                    />
                ))}
            </div>

            {signature}
        </>
    );

    const content = (
        <PageShell
            title={isRtl ? 'المساعدة' : 'Centre d’aide'}
            onClose={onClose}
            dir={isRtl ? 'rtl' : 'ltr'}
            headerRight={langSwitch}
            contentMaxWidth={isProfessorHelp ? 1040 : 920}
            surfaceClassName="help-modal-theme"
        >
            {body}
        </PageShell>
    );

    if (variant === 'modal') {
        return (
            <SheetModal open label="Centre d’aide MathPlus" onClose={onClose} desktopMaxWidth={isProfessorHelp ? '72rem' : '60rem'} sheetClassName="help-modal-theme">
                {content}
            </SheetModal>
        );
    }

    return content;
};

export default HelpModal;
