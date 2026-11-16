
import React, { useRef, useState, useEffect, useMemo } from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faDownload,
  faUpload,
  faRotateRight,
  faCheck,
  faTriangleExclamation,
  faRotateLeft,
  faClock,
  faList,
  faEye,
  faEyeSlash,
  faHashtag,
  faUser,
  faChevronDown,
  faCircleCheck,
  faCircleExclamation,
  faXmark,
  faBell,
  faMoon,
  faPalette,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import {
  AppSettings,
  UserProfile,
  RootManifest,
  DigestFrequency,
  NotificationCategory,
  NotificationPrefs,
  ReadingTheme,
  RevisionBlockVisibilitySettings,
  RevisionNumberingKey,
} from '../../types';
import {
  DEFAULT_REVISION_BLOCK_VISIBILITY,
  DEFAULT_REVISION_BLOCK_NUMBERING,
  createDefaultAppSettings,
} from '../../utils/constants';
import { localNotificationService } from '../../services/localNotificationService';
import { enableDeviceNotifications } from '../../utils/enableNotifications';
import { normalizePlan } from '../../services/studyPlanService';
import { resolveNotificationPrefs } from '../../utils/notificationPrefs';
import { resolveReadingTheme } from '../../utils/readingTheme';
import PageShell from '../UI/PageShell';
import SheetModal from '../UI/SheetModal';
import {
  ChoiceGroup,
  Field,
  FieldPair,
  PillGroup,
  Row,
  Section,
  inputClass,
} from '../UI/SettingsPrimitives';
import { useIsPhone } from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/I18nContext';
import { translateClassLabel } from '../../i18n/classLabels';

interface SettingsModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onExportData: () => void;
  onImportData: (file: File) => Promise<void>;
  globalProgress: any;
  currentSettings: AppSettings;
  onApplySettings: (settings: AppSettings) => void;
  hideRevision?: boolean;
  user?: UserProfile | null;
  manifest?: RootManifest | null;
  onUpdateProfile?: (updates: Partial<UserProfile>, switchView?: 'dashboard') => void;
  onLogout?: () => void;
  variant?: 'modal' | 'page';
}

/**
 * Réglages de repli du formulaire. La base vient de `createDefaultAppSettings`
 * (partagée avec `useAppSettings`) ; seul le planning est ajouté ici, car il
 * exige `normalizePlan` que `constants` ne peut pas importer.
 */
const createResetSettings = (): AppSettings => ({
  ...createDefaultAppSettings(),
  studyPlan: normalizePlan(null),
});

type SettingsTabId = 'revision' | 'quiz' | 'data' | 'profile' | 'notifications' | 'appearance';

const DIGEST_CHOICES: { value: DigestFrequency; label: string; hint: string }[] = [
  { value: 12, label: '2× par jour', hint: 'Matin et soir' },
  { value: 24, label: 'Chaque jour', hint: 'Un bilan quotidien' },
  { value: 72, label: 'Tous les 3 jours', hint: 'Rythme léger' },
];

const CATEGORY_OPTIONS: { key: NotificationCategory; label: string; hint: string }[] = [
  { key: 'messages', label: 'Messages de votre professeur', hint: 'Annonces de classe et messages de l\'administration. Les messages urgents passent toujours.' },
  { key: 'digest', label: 'Bilan de progression', hint: 'Cours, quiz, exercices, concours, régularité.' },
  { key: 'revision', label: 'Rappels de révision', hint: 'Basés sur la courbe de l\'oubli, chapitre par chapitre.' },
  { key: 'content', label: 'Nouveautés', hint: 'Nouveaux exercices, quiz et chapitres publiés.' },
];

const REVISION_VISIBILITY_OPTIONS: ReadonlyArray<{
  key: keyof RevisionBlockVisibilitySettings;
  label: string;
  labelAr: string;
  hint: string;
  hintAr: string;
}> = [
  { key: 'method', label: 'Méthodes', labelAr: 'الطرق', hint: 'Masque les fiches méthode et blocs méthode.', hintAr: 'يخفي بطاقات وفقرات الطرق.' },
  { key: 'example', label: 'Exemples', labelAr: 'الأمثلة', hint: 'Affiche ou cache les exemples guidés.', hintAr: 'يُظهر أو يُخفي الأمثلة الموجهة.' },
  { key: 'exploration', label: 'Explorations', labelAr: 'الاستكشافات', hint: 'Affiche ou cache les phases d’exploration et activités.', hintAr: 'يُظهر أو يُخفي أنشطة الاستكشاف.' },
  { key: 'proof', label: 'Preuves', labelAr: 'البراهين', hint: 'Affiche ou cache les démonstrations.', hintAr: 'يُظهر أو يُخفي البراهين.' },
  { key: 'remark', label: 'Remarques', labelAr: 'الملاحظات', hint: 'Masque les remarques et notes complémentaires.', hintAr: 'يخفي الملاحظات والتنبيهات التكميلية.' },
  { key: 'intuition', label: 'Intuition', labelAr: 'الحدس الرياضي', hint: 'Masque les encadrés intuitifs.', hintAr: 'يخفي الفقرات الحدسية.' },
  { key: 'summary', label: 'Résumé', labelAr: 'الملخص', hint: 'Masque les synthèses de fin de passage.', hintAr: 'يخفي ملخصات نهاية الفقرة.' },
];

const REVISION_NUMBERING_OPTIONS: Array<{
  key: RevisionNumberingKey;
  label: string;
  labelAr: string;
  hint: string;
  hintAr: string;
}> = [
  { key: 'definition', label: 'Définitions', labelAr: 'التعاريف', hint: 'Numéroter les définitions (Définition 1, Définition 2…)', hintAr: 'ترقيم التعاريف (تعريف 1، تعريف 2…)' },
  { key: 'property', label: 'Propriétés', labelAr: 'الخاصيات', hint: 'Numéroter les propriétés (Propriété 1, Propriété 2…)', hintAr: 'ترقيم الخاصيات (خاصية 1، خاصية 2…)' },
  { key: 'theorem', label: 'Théorèmes', labelAr: 'المبرهنات', hint: 'Numéroter les théorèmes (Théorème 1, Théorème 2…)', hintAr: 'ترقيم المبرهنات (مبرهنة 1، مبرهنة 2…)' },
  { key: 'proposition', label: 'Propositions', labelAr: 'القضايا', hint: 'Numéroter les propositions (Proposition 1, 2…)', hintAr: 'ترقيم القضايا (قضية 1، 2…)' },
  { key: 'method', label: 'Méthodes', labelAr: 'الطرق', hint: 'Numéroter les fiches et blocs méthode', hintAr: 'ترقيم بطاقات وفقرات الطرق' },
  { key: 'application', label: 'Exercices d\'application', labelAr: 'تمارين تطبيقية', hint: 'Numéroter les exercices d\'application', hintAr: 'ترقيم التمارين التطبيقية' },
  { key: 'example', label: 'Exemples', labelAr: 'الأمثلة', hint: 'Numéroter les exemples guidés', hintAr: 'ترقيم الأمثلة الموجهة' },
  { key: 'remark', label: 'Remarques', labelAr: 'الملاحظات', hint: 'Numéroter les remarques et notes', hintAr: 'ترقيم الملاحظات' },
  { key: 'warning', label: 'Avertissements (Attention)', labelAr: 'التنبيهات', hint: 'Numéroter les avertissements', hintAr: 'ترقيم التنبيهات' },
  { key: 'hint', label: 'Indices', labelAr: 'الإرشادات', hint: 'Numéroter les indices', hintAr: 'ترقيم الإرشادات' },
  { key: 'technique', label: 'Techniques', labelAr: 'التقنيات', hint: 'Numéroter les fiches techniques', hintAr: 'ترقيم البطاقات التقنية' },
  { key: 'exploration', label: 'Explorations', labelAr: 'الاستكشافات', hint: 'Numéroter les phases d\'exploration', hintAr: 'ترقيم مراحل الاستكشاف' },
];

/**
 * Bascule sobre : deux états lisibles, pas d'iconographie interne. Les petites
 * croix et coches du modèle précédent étaient illisibles à cette taille et
 * ajoutaient du bruit sur une page qui en comptait déjà trop.
 */
const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--modal-accent)]/30 focus-visible:ring-offset-2 ${
      checked ? 'bg-[var(--modal-accent)]' : 'bg-[#cbc2cb]'
    }`}
  >
    <span className="sr-only">Activer/Désactiver</span>
    <span
      className={`pointer-events-none inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
        checked ? 'translate-x-[25px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: IconDefinition;
}[] = [
  { id: 'profile', label: 'Profil et connexion', description: 'Identité & session', icon: faUser },
  { id: 'appearance', label: 'Apparence', description: 'Texte & couleurs', icon: faPalette },
  { id: 'notifications', label: 'Notifications', description: 'Bilans & rappels', icon: faBell },
  { id: 'revision', label: 'Révision', description: 'Blocs visibles', icon: faList },
  { id: 'quiz', label: 'Quiz', description: 'Temps & rythme', icon: faClock },
  { id: 'data', label: 'Données', description: 'Export & import', icon: faDownload },
];

/*
 * Le champ affiche un numéro national derrière un préfixe « +212 » figé.
 * Certains profils stockent l'indicatif dans le numéro : sans ce nettoyage,
 * l'écran montrait « +212 212 678 900 ».
 */
const nationalDigits = (raw: string): string => {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('00212')) digits = digits.slice(5);
  else if (digits.startsWith('212') && digits.length > 9) digits = digits.slice(3);
  if (digits.startsWith('0') && digits.length > 9) digits = digits.slice(1);
  return digits.slice(0, 9);
};

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onExportData,
  onImportData,
  currentSettings,
  onApplySettings,
  hideRevision = false,
  user = null,
  manifest = null,
  onUpdateProfile,
  onLogout,
  variant = 'page',
}) => {
  const { lang, dir, setLang } = useI18n();
  const [tempSettings, setTempSettings] = useState<AppSettings>(currentSettings);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile editing state
  const [tempFirstName, setTempFirstName] = useState(user?.firstName || user?.name?.split(' ')[0] || '');
  const [tempLastName, setTempLastName] = useState(user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '');
  const [tempPhone, setTempPhone] = useState(() => nationalDigits(user?.phone || ''));
  const [tempBirthdate, setTempBirthdate] = useState(user?.birthdate || '');
  const [tempSchoolName, setTempSchoolName] = useState(user?.schoolName || '');
  const [tempClassId, setTempClassId] = useState(user?.classId || '');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [, setProfileSaved] = useState(false);
  const classListRef = useRef<HTMLDivElement>(null);
  const isPhone = useIsPhone();
  const isProfessorProfile = user?.role === 'prof';
  const tabRailRef = useRef<HTMLDivElement>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  useEffect(() => {
    if (!savedSection) return;
    const timer = setTimeout(() => setSavedSection(null), 2200);
    return () => clearTimeout(timer);
  }, [savedSection]);
  const [nativePermission, setNativePermission] = useState<NotificationPermission>(() => localNotificationService.permission());

  /*
   * Ramène l'onglet actif dans le champ de vision du rail.
   *
   * `scrollIntoView` ne convient pas ici : il cible le plus proche ancêtre
   * défilant et finit par bouger la page au lieu du rail. On calcule donc le
   * décalage horizontal nous-mêmes, en gardant une marge pour que le dégradé
   * de bord ne masque pas l'onglet qu'on vient d'atteindre.
   *
   * Défilement instantané, volontairement : `behavior: 'smooth'` est ignoré
   * sur ce conteneur (le rail ne bougeait pas du tout), et un onglet qui se
   * replace sans délai se lit mieux qu'une animation.
   */
  useEffect(() => {
    const rail = tabRailRef.current;
    const current = rail?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!rail || !current) return;

    // `offsetLeft` se mesure depuis l'ancêtre positionné : on repasse en
    // coordonnées du rail avant de comparer à `scrollLeft`.
    const railLeft = rail.getBoundingClientRect().left;
    const start = current.getBoundingClientRect().left - railLeft + rail.scrollLeft;
    const margin = 24;
    const left = start - margin;
    const right = start + current.offsetWidth + margin;

    if (left < rail.scrollLeft) {
      rail.scrollTo({ left: Math.max(0, left) });
    } else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: right - rail.clientWidth });
    }
  }, [activeTab]);
  const [testSent, setTestSent] = useState(false);

  const prefs: NotificationPrefs = useMemo(() => resolveNotificationPrefs(tempSettings), [tempSettings]);
  const readingTheme = useMemo(() => resolveReadingTheme(tempSettings), [tempSettings]);

  const patchPrefs = (patch: Partial<NotificationPrefs>) =>
    setTempSettings(prev => ({ ...prev, notificationPrefs: { ...resolveNotificationPrefs(prev), ...patch } }));

  const patchReadingTheme = (patch: Partial<ReadingTheme>) =>
    setTempSettings(prev => ({ ...prev, readingTheme: { ...resolveReadingTheme(prev), ...patch } }));

  const toggleCategory = (key: NotificationCategory) => {
    const current = resolveNotificationPrefs(tempSettings);
    patchPrefs({ categories: { ...current.categories, [key]: !current.categories[key] } });
  };

  /*
   * L'autorisation système ne se déduit pas de la préférence : le navigateur
   * garde le dernier mot, et un refus est définitif tant que l'élève ne le
   * lève pas lui-même dans les réglages du téléphone.
   */
  const handleEnableNative = async () => {
    // Autorisation + abonnement push : sans le second, l'élève reçoit ses
    // rappels locaux mais devient injoignable depuis la page admin.
    const result = await enableDeviceNotifications(user?.name, user?.classId, prefs, user?.accountId);
    setNativePermission(result);
    patchPrefs({ native: result === 'granted' });
  };

  const handleTestNotification = async () => {
    const ok = await localNotificationService.show(
      'monProf',
      'Notification de test — vos rappels arriveront de cette façon.',
      { tag: 'test' }
    );
    setTestSent(ok);
    setTimeout(() => setTestSent(false), 2500);
  };

  /*
   * Sur téléphone la liste s'ouvre en feuille de bas d'écran : un menu
   * `absolute` dans un corps défilant finissait toujours rogné. Sur grand
   * écran on garde le menu ancré, mais on l'amène dans la vue et on montre la
   * classe déjà choisie — sinon, avec huit niveaux, l'utilisateur ouvre sur
   * une liste qui ne contient pas sa propre sélection.
   */
  useEffect(() => {
    if (!classDropdownOpen) return;
    const list = classListRef.current;
    if (!list) return;
    const raf = requestAnimationFrame(() => {
      if (!isPhone) list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const selected = list.querySelector<HTMLElement>('[data-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [classDropdownOpen, isPhone]);

  // La feuille ouverte bloque le défilement de la page derrière elle.
  useEffect(() => {
    if (!classDropdownOpen || !isPhone) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [classDropdownOpen, isPhone]);

  useEffect(() => {
    if (variant === 'page' || isOpen) {
      setTimeout(() => {
        setTempSettings(currentSettings);
        setActiveTab('profile');
        setTempFirstName(user?.firstName || user?.name?.split(' ')[0] || '');
        setTempLastName(user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '');
        setTempPhone(nationalDigits(user?.phone || ''));
        setTempBirthdate(user?.birthdate || '');
        setTempSchoolName(user?.schoolName || '');
        setTempClassId(user?.classId || '');
        setProfileSaved(false);
      }, 0);
    }
  }, [variant, isOpen, currentSettings, user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('loading');
    try {
      await onImportData(file);
      setImportStatus('success');
      setTimeout(() => setImportStatus('idle'), 2000);
    } catch (error) {
      console.error(error);
      setImportStatus('error');
    }
  };

  // Detect whether profile fields have been touched
  const isProfileDirty = useMemo(() => {
    if (!user) return false;
    const origFirst = user.firstName || user.name?.split(' ')[0] || '';
    const origLast = user.lastName || user.name?.split(' ').slice(1).join(' ') || '';
    return (
      tempFirstName.trim() !== origFirst ||
      tempLastName.trim() !== origLast ||
      tempPhone !== nationalDigits(user.phone || '') ||
      (tempBirthdate || '') !== (user.birthdate || '') ||
      (tempSchoolName.trim() || '') !== (user.schoolName || '') ||
      tempClassId !== (user.classId || '')
    );
  }, [user, tempFirstName, tempLastName, tempPhone, tempBirthdate, tempSchoolName, tempClassId]);


  /*
   * Enregistrement par carte : on applique tout ce qui a changé, mais on ne
   * quitte pas la page. L'élève reste où il est, avec une confirmation sur la
   * carte qu'il vient de valider.
   *
   * Exception assumée : changer de classe ou de mode reconstruit le tableau de
   * bord, la fermeture reste alors nécessaire (gérée par `handleApplyProfile`).
   */
  const saveSection = (sectionId: string) => {
    onApplySettings(tempSettings);
    if (isProfileDirty && user && onUpdateProfile) handleApplyProfile();

    setSavedSection(sectionId);
  };

  const handleCancel = () => { setTempSettings(currentSettings); onClose(); };
  /*
   * Applique immédiatement : la carte « Réinitialisation » ne porte pas de
   * bouton d'enregistrement (elle n'a pas de champ en attente), un simple
   * `setTempSettings` n'aurait donc jamais été persisté.
   */
  const handleResetDefaults = () => {
    const defaults = createResetSettings();
    setTempSettings(defaults);
    onApplySettings(defaults);
    setSavedSection('reset');
  };

  const formatPhone = (raw: string) => {
    const digits = nationalDigits(raw);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  };

  const handleApplyProfile = () => {
    if (!user || !onUpdateProfile) return;
    const selectedClass = manifest?.classes.find(c => c.id === tempClassId);
    const updates: Partial<UserProfile> = {
      name: `${tempFirstName.trim()} ${tempLastName.trim()}`.trim() || user.name,
      firstName: tempFirstName.trim() || undefined,
      lastName: tempLastName.trim() || undefined,
      phone: isProfessorProfile
        ? user.phone
        : (tempPhone ? `+212${tempPhone}` : user.phone),
      birthdate: tempBirthdate || undefined,
      schoolName: tempSchoolName.trim() || undefined,
    };

    const classChanged = tempClassId !== user.classId && !!selectedClass;

    if (selectedClass && !isProfessorProfile) {
      updates.classId = selectedClass.id;
      updates.className = selectedClass.title;
    }

    const switchView = classChanged ? 'dashboard' : undefined;

    onUpdateProfile(updates, switchView);
    setProfileSaved(true);
    setTimeout(() => {
      onClose();
    }, switchView ? 200 : 250);
  };
  const formatTime = (s: number) => (s >= 60 ? `${s / 60}min` : `${s}s`);

  const revisionVisibility = {
    ...DEFAULT_REVISION_BLOCK_VISIBILITY,
    ...(tempSettings.revisionBlockVisibility || {}),
  };

  const setAllRevisionBlocks = (enabled: boolean) => {
    setTempSettings((prev) => ({
      ...prev,
      revisionBlockVisibility: {
        ...DEFAULT_REVISION_BLOCK_VISIBILITY,
        ...Object.fromEntries(REVISION_VISIBILITY_OPTIONS.map((o) => [o.key, enabled])),
      },
    }));
  };

  const revisionNumbering = {
    ...DEFAULT_REVISION_BLOCK_NUMBERING,
    ...(tempSettings.revisionBlockNumbering || {}),
  };

  const setAllRevisionNumbering = (enabled: boolean) => {
    setTempSettings((prev) => ({
      ...prev,
      revisionBlockNumbering: {
        ...DEFAULT_REVISION_BLOCK_NUMBERING,
        ...Object.fromEntries(REVISION_NUMBERING_OPTIONS.map((o) => [o.key, enabled])),
      },
    }));
  };
  if (variant === 'modal' && !isOpen) return null;

  const visibleTabs = SETTINGS_TABS.filter(t => !(hideRevision && t.id === 'revision'));
  const interfaceCopy = lang === 'ar'
    ? {
        title: 'الإعدادات', language: 'لغة الواجهة', languageHint: 'يمكنك التبديل بين الفرنسية والعربية في أي وقت.',
        french: 'Français', arabic: 'العربية',
        tabs: { profile: 'الملف الشخصي', appearance: 'المظهر', notifications: 'الإشعارات', revision: 'المراجعة', quiz: 'الاختبارات', data: 'البيانات' },
      }
    : {
        title: 'Paramètres', language: 'Langue de l’interface', languageHint: 'Passez du français à l’arabe à tout moment.',
        french: 'Français', arabic: 'العربية',
        tabs: { profile: 'Profil et connexion', appearance: 'Apparence', notifications: 'Notifications', revision: 'Révision', quiz: 'Quiz', data: 'Données' },
      };
  const tr = (fr: string, ar: string) => lang === 'ar' ? ar : fr;
  const digestChoices = lang === 'ar'
    ? [{ value: 12 as DigestFrequency, label: 'مرتان يومياً', hint: 'صباحاً ومساءً' }, { value: 24 as DigestFrequency, label: 'كل يوم', hint: 'ملخص يومي' }, { value: 72 as DigestFrequency, label: 'كل 3 أيام', hint: 'وتيرة خفيفة' }]
    : DIGEST_CHOICES;
  const categoryOptions = lang === 'ar'
    ? [
        { key: 'messages' as NotificationCategory, label: 'رسائل الأستاذ', hint: 'إعلانات القسم والرسائل المهمة.' },
        { key: 'digest' as NotificationCategory, label: 'ملخص التقدم', hint: 'الدروس والاختبارات والتمارين والمواظبة.' },
        { key: 'revision' as NotificationCategory, label: 'تذكيرات المراجعة', hint: 'تذكيرات حسب تقدمك في كل محور.' },
        { key: 'content' as NotificationCategory, label: 'مستجدات المحتوى', hint: 'تمارين واختبارات ومحاور جديدة.' },
      ]
    : CATEGORY_OPTIONS;

  /* Rail d'onglets souligné : l'indicateur actif est un filet sur la ligne de
     base, donc jamais rogné par le défilement horizontal. L'onglet choisi est
     ramené dans le champ de vision — sur téléphone, « Données » se trouvait
     hors écran sans que rien ne le signale. */
  const tabRail = (
    <div ref={tabRailRef} role="tablist" aria-label="Sections des réglages" className="app-page__rail app-page__rail--fade px-1">
      {visibleTabs.map(({ id, icon }) => {
        const sel = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sel}
            data-tab={id}
            onClick={() => setActiveTab(id)}
            className="app-tab typo-ui modal-t-label font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--modal-accent)]"
          >
            <FaIcon icon={icon} size={14} aria-hidden="true" />
            <span>{interfaceCopy.tabs[id]}</span>
          </button>
        );
      })}
    </div>
  );

  /* Passé à chaque carte : bouton d'enregistrement + retour visuel local. */
  const sectionSave = (id: string) => ({
    onSave: () => saveSection(id),
    saved: savedSection === id,
  });

  const content = (
      <PageShell
        title={interfaceCopy.title}
        onClose={handleCancel}
        toolbar={tabRail}
        dir={dir}
        contentMaxWidth={760}
      >
              <div className="min-w-0">

                {/* — PROFIL — */}
                {activeTab === 'profile' && (
                  <div>

                    <Section title={interfaceCopy.language} description={interfaceCopy.languageHint}>
                      <div className="flex flex-wrap gap-2" role="group" aria-label={interfaceCopy.language}>
                        {(['fr', 'ar'] as const).map((option) => {
                          const selected = lang === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setLang(option)}
                              aria-pressed={selected}
                              className={`app-tap typo-ui rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${selected ? 'border-[var(--modal-accent)] bg-[var(--modal-accent)] text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                            >
                              {option === 'fr' ? interfaceCopy.french : interfaceCopy.arabic}
                            </button>
                          );
                        })}
                      </div>
                    </Section>

                    {/* Carte d'identité : qui est connecté, en un coup d'œil. */}
                    {user && (
                      <div className="mb-6 flex items-center gap-3.5 rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white via-white to-[var(--modal-accent-soft)]/40 p-3.5 shadow-sm sm:p-4">
                        <div className="modal-t-h2 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-md bg-gradient-to-br from-[var(--modal-accent)] to-[var(--modal-accent-deep)]">
                          {(user.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="typo-ui modal-t-lead truncate font-bold text-[#1f1f1f]">{user.name}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                            <p className="typo-ui modal-t-label truncate font-medium text-[#5b6871]">
                              {translateClassLabel(user.classId, user.className, lang)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <Section title={tr('Identité', 'الهوية')} {...sectionSave("identity")}>
                      <FieldPair>
                        <Field label={tr('Prénom', 'الاسم الشخصي')} htmlFor="set-first">
                          <input
                            id="set-first"
                            type="text"
                            value={tempFirstName}
                            onChange={e => { setTempFirstName(e.target.value); setProfileSaved(false); }}
                            placeholder={tr('Votre prénom', 'اكتب اسمك الشخصي')}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={tr('Nom de famille', 'الاسم العائلي')} htmlFor="set-last">
                          <input
                            id="set-last"
                            type="text"
                            value={tempLastName}
                            onChange={e => { setTempLastName(e.target.value); setProfileSaved(false); }}
                            placeholder={tr('Votre nom de famille', 'اكتب اسمك العائلي')}
                            className={inputClass}
                          />
                        </Field>
                      </FieldPair>

                      <FieldPair>
                        {/* `lang` explicite : sans lui, Chrome sert le masque de
                            sa propre langue (mm/dd/yyyy) à un élève marocain. */}
                        <Field label={tr('Date de naissance', 'تاريخ الازدياد')} htmlFor="set-birth" hint={tr('Jour / mois / année.', 'اليوم / الشهر / السنة.')}>
                          <input
                            id="set-birth"
                            type="date"
                            lang={lang === 'ar' ? 'ar-MA' : 'fr-MA'}
                            value={tempBirthdate}
                            onChange={e => { setTempBirthdate(e.target.value); setProfileSaved(false); }}
                            className={inputClass}
                          />
                        </Field>
                        <Field label={tr('Établissement scolaire', 'المؤسسة التعليمية')} htmlFor="set-school">
                          <input
                            id="set-school"
                            type="text"
                            value={tempSchoolName}
                            onChange={e => { setTempSchoolName(e.target.value); setProfileSaved(false); }}
                            placeholder={tr('Nom de votre lycée', 'اسم مؤسستك التعليمية')}
                            className={inputClass}
                          />
                        </Field>
                      </FieldPair>
                    </Section>

                    <Section title={tr('Contact', 'التواصل')} description={tr('Vos coordonnées de contact.', 'معلومات التواصل الخاصة بك.')} {...sectionSave("contact")}>
                      {/* Un numéro marocain commence par 6 ou 7. On le signale
                          sans rien corriger d'office : mieux vaut demander que
                          réécrire silencieusement la donnée de l'élève. */}
                      <Field
                        label={tr('Numéro de téléphone', 'رقم الهاتف')}
                        htmlFor="set-phone"
                        hint={isProfessorProfile
                          ? tr('Le téléphone du compte professeur est affecté depuis l’administration.', 'رقم هاتف حساب الأستاذ محدد من طرف الإدارة.')
                          : tempPhone.length > 0 && !/^[67]/.test(tempPhone)
                            ? tr('Ce numéro semble incomplet : saisissez les 9 chiffres après +212 (il commence par 6 ou 7).', 'يبدو الرقم غير مكتمل: اكتب الأرقام التسعة بعد +212، ويبدأ بـ 6 أو 7.')
                            : undefined}
                      >
                        <div className="flex items-stretch overflow-hidden rounded-lg border border-[#d3d8de] bg-white transition-colors focus-within:border-[#1f1f1f] focus-within:ring-1 focus-within:ring-[#1f1f1f]/15">
                          <span className="typo-ui modal-t-label flex shrink-0 select-none items-center gap-1.5 border-e border-[#e5e7eb] px-3.5 text-[#5b6871]">
                            🇲🇦 +212
                          </span>
                          <input
                            id="set-phone"
                            type="tel"
                            inputMode="numeric"
                            value={formatPhone(tempPhone)}
                            onChange={e => { setTempPhone(nationalDigits(e.target.value)); setProfileSaved(false); }}
                            disabled={isProfessorProfile}
                            placeholder="6XX XXX XXX"
                            className="w-full bg-transparent px-3.5 py-2.5 typo-ui text-[16px] text-[#1f1f1f] outline-none placeholder:text-[#8c97a3] sm:text-[14px]"
                          />
                        </div>
                      </Field>
                    </Section>

                    <Section title={tr('Classe', 'المستوى الدراسي')} description={tr('Le programme et les chapitres suivent la classe choisie.', 'يتغير البرنامج والمحاور حسب المستوى المختار.')} {...sectionSave("level")}>
                      {/* Class selector */}
                      {manifest && (
                        <div className="relative">
                          <label className="typo-ui modal-t-label mb-1.5 block font-medium text-[#1f1f1f]">{tr('Classe', 'المستوى الدراسي')}</label>
                          <button
                            type="button"
                            onClick={() => { if (!isProfessorProfile) setClassDropdownOpen(p => !p); }}
                            disabled={isProfessorProfile}
                            aria-expanded={classDropdownOpen}
                            className={`${inputClass} app-tap flex items-center justify-between text-left`}
                          >
                            <span className={tempClassId ? 'text-[#1f1f1f]' : 'text-[#8c97a3]'}>
                              {(() => {
                                const selected = manifest.classes.find(c => c.id === tempClassId);
                                return selected ? translateClassLabel(selected.id, selected.title, lang) : tr('Choisir une classe', 'اختر مستواك الدراسي');
                              })()}
                            </span>
                            <FaIcon icon={faChevronDown} size={14} className={`text-[#5b6871] transition-transform duration-200 ${classDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                          {classDropdownOpen && !isProfessorProfile && (isPhone ? (
                            /*
                             * Téléphone : feuille de bas d'écran. Un menu `absolute`
                             * dans le corps défilant finissait rogné dès qu'il
                             * s'ouvrait en position basse, et les dernières classes
                             * devenaient inatteignables. La feuille sort du flux, se
                             * pose au-dessus de la navigation, et laisse le pouce
                             * atteindre chaque ligne.
                             */
                            <div className="fixed inset-0 z-[120] flex items-end">
                              <div
                                className="absolute inset-0 bg-slate-950/45 backdrop-blur-md animate-in fade-in duration-200"
                                onClick={() => setClassDropdownOpen(false)}
                              />
                              <div className="relative z-10 w-full rounded-t-[28px] border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-2xl animate-in slide-in-from-bottom duration-300">
                                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                                  <p className="modal-t-lead font-bold text-slate-900">{tr('Choisir une classe', 'اختر مستواك الدراسي')}</p>
                                  <button
                                    type="button"
                                    onClick={() => setClassDropdownOpen(false)}
                                    aria-label={tr('Fermer', 'إغلاق')}
                                    className="app-tap flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-700 active:scale-95"
                                  >
                                    <FaIcon icon={faXmark} size={16} aria-hidden="true" />
                                  </button>
                                </div>
                                <div
                                  ref={classListRef}
                                  role="listbox"
                                  aria-label={tr('Choisir une classe', 'اختر مستواك الدراسي')}
                                  className="app-page__scroll max-h-[55dvh] overflow-y-auto overscroll-contain p-2.5 pb-[calc(var(--app-nav-h)+0.75rem)] space-y-1"
                                >
                                  {manifest.classes.map(cls => (
                                    <button
                                      key={cls.id}
                                      type="button"
                                      role="option"
                                      aria-selected={tempClassId === cls.id}
                                      data-selected={tempClassId === cls.id ? 'true' : undefined}
                                      onClick={() => { setTempClassId(cls.id); setClassDropdownOpen(false); setProfileSaved(false); }}
                                      className={`app-tap w-full flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-3 text-left modal-t-body font-medium transition-all ${
                                        tempClassId === cls.id ? 'bg-[var(--modal-accent-soft)] text-[var(--modal-accent-deep)] font-semibold shadow-sm' : 'text-slate-700 active:bg-slate-50'
                                      }`}
                                    >
                                      <span className="min-w-0">{translateClassLabel(cls.id, cls.title, lang)}</span>
                                      {tempClassId === cls.id && <FaIcon icon={faCircleCheck} size={17} className="shrink-0 text-[var(--modal-accent)]" aria-hidden="true" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              ref={classListRef}
                              role="listbox"
                              aria-label={tr('Choisir une classe', 'اختر مستواك الدراسي')}
                              className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-slate-300 bg-white shadow-lg z-20 p-1 max-h-[min(320px,45vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
                            >
                              {manifest.classes.map(cls => (
                                <button
                                  key={cls.id}
                                  type="button"
                                  role="option"
                                  aria-selected={tempClassId === cls.id}
                                  data-selected={tempClassId === cls.id ? 'true' : undefined}
                                  onClick={() => { setTempClassId(cls.id); setClassDropdownOpen(false); setProfileSaved(false); }}
                                  className={`modal-t-body w-full text-left px-3 py-2.5 rounded-md font-medium transition-all flex items-center justify-between gap-2 ${
                                    tempClassId === cls.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="min-w-0">{translateClassLabel(cls.id, cls.title, lang)}</span>
                                  {tempClassId === cls.id && <FaIcon icon={faCircleCheck} size={15} className="shrink-0" aria-hidden="true" />}
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warning when class changes */}
                      {user && tempClassId !== user.classId && (
                        <div className="flex items-start gap-2.5 rounded-lg border border-[#e8d9b4] bg-[#fdf8ec] px-3.5 py-3">
                          <FaIcon icon={faCircleExclamation} size={15} className="mt-0.5 shrink-0 text-[#c98a2b]" aria-hidden="true" />
                          <p className="typo-ui modal-t-label leading-relaxed text-[#7a5f22]">
                            {tr('Changement de niveau détecté. Votre progression actuelle sera préservée et accessible à nouveau si vous revenez à ce niveau.', 'تم رصد تغيير في المستوى. سيبقى تقدمك محفوظاً ويمكنك استعادته عند العودة إلى هذا المستوى.')}
                          </p>
                        </div>
                      )}
                    </Section>

                    <Section title={tr('Connexion', 'تسجيل الدخول')} description={tr('Terminez votre session sur cet appareil.', 'أنهِ جلستك على هذا الجهاز.')}>
                      {onLogout && (
                        <button
                          type="button"
                          onClick={onLogout}
                          className="app-tap typo-ui modal-t-label inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 font-semibold text-red-700 transition-colors hover:bg-red-100 active:bg-red-200"
                        >
                          <FaIcon icon={faRightFromBracket} size={15} aria-hidden="true" /> {tr('Se déconnecter', 'تسجيل الخروج')}
                        </button>
                      )}
                    </Section>
                  </div>
                )}

                {/* — APPARENCE — */}
                {activeTab === 'appearance' && (
                  <div>
                    <Section
                      title={tr('Taille du texte', 'حجم نص الواجهة')}
                      description={tr('Ajuste les menus, les réglages et les éléments de navigation.', 'يضبط القوائم والإعدادات وعناصر التنقل.')}
                      {...sectionSave("appearance-ui-size")}
                    >
                      <ChoiceGroup
                        ariaLabel={tr('Taille du texte de l’interface', 'حجم نص الواجهة')}
                        options={[
                          { value: 'sm', label: tr('Compacte', 'صغير'), hint: '14 px' },
                          { value: 'base', label: tr('Normale', 'عادي'), hint: '15 px' },
                          { value: 'lg', label: tr('Grande', 'كبير'), hint: '17 px' },
                        ]}
                        value={tempSettings.fontSize || 'base'}
                        onChange={fontSize => setTempSettings(prev => ({ ...prev, fontSize }))}
                      />
                    </Section>

                    <Section
                      title={tr('Texte des documents', 'حجم نص الدروس')}
                      description={tr('Agrandit uniquement les contenus de révision, quiz et exercices.', 'يضبط حجم محتوى المراجعة والاختبارات والتمارين فقط.')}
                      {...sectionSave("appearance-doc-size")}
                    >
                      <PillGroup
                        ariaLabel={tr('Échelle du texte des documents', 'مقياس نص الدروس')}
                        options={[
                          { value: 0.9, label: '90 %' },
                          { value: 1, label: '100 %' },
                          { value: 1.1, label: '110 %' },
                          { value: 1.2, label: '120 %' },
                        ]}
                        value={readingTheme.docScale}
                        onChange={docScale => patchReadingTheme({ docScale })}
                      />
                      <div
                        className="typo-exercise rounded-xl border border-[var(--reading-paper-border)] bg-[var(--reading-paper)] px-4 py-3 text-slate-800"
                        style={{ fontSize: `calc(1rem * ${readingTheme.docScale})` }}
                      >
                        Une fonction dérivable est continue sur son intervalle.
                      </div>
                    </Section>

                    <Section
                      title={tr('Police des documents', 'خط الدروس')}
                      description={tr('La police Serif reste recommandée pour son harmonie avec les formules mathématiques.', 'يوصى بخط Serif لتناسقه مع الصيغ الرياضية.')}
                      {...sectionSave("appearance-font")}
                    >
                      <ChoiceGroup
                        ariaLabel={tr('Police des documents', 'خط الدروس')}
                        options={[
                          { value: 'serif', label: 'Serif', hint: tr('Classique et mathématique', 'كلاسيكي ومناسب للرياضيات'), labelClassName: 'font-serif' },
                          { value: 'sans', label: tr('Sans serif', 'بدون زوائد'), hint: tr('Nette et moderne', 'واضح وعصري'), labelClassName: 'font-sans' },
                          { value: 'ronde', label: tr('Ronde', 'مستدير'), hint: tr('Souple et chaleureuse', 'مرن ومريح'), labelClassName: 'font-[var(--font-itim)]' },
                        ]}
                        value={readingTheme.docFont}
                        onChange={docFont => patchReadingTheme({ docFont })}
                      />
                    </Section>

                    <Section
                      title={tr('Couleur du papier', 'لون الخلفية')}
                      description={tr('Choisissez une surface claire et confortable pour les longues lectures.', 'اختر خلفية مريحة للقراءة الطويلة.')}
                      {...sectionSave("appearance-paper")}
                    >
                      <ChoiceGroup
                        ariaLabel={tr('Couleur du papier', 'لون الخلفية')}
                        columns={2}
                        options={[
                          { value: 'ivoire', label: tr('Ivoire', 'عاجي'), swatchClassName: 'border-[#ddd4c5] bg-[#f5f0e8]' },
                          { value: 'blanc', label: tr('Blanc', 'أبيض'), swatchClassName: 'border-slate-200 bg-white' },
                          { value: 'creme', label: tr('Crème', 'كريمي'), swatchClassName: 'border-[#e8dcc4] bg-[#fdf9f0]' },
                          { value: 'ardoise', label: tr('Ardoise claire', 'رمادي فاتح'), swatchClassName: 'border-[#c3ceda] bg-[#e6ecf2]' },
                        ]}
                        value={readingTheme.paper}
                        onChange={paper => patchReadingTheme({ paper })}
                      />
                    </Section>
                  </div>
                )}

                {/* — NOTIFICATIONS — */}
                {activeTab === 'notifications' && (
                  <div>
                    <Section
                      title={tr('Messages & rappels', 'الرسائل والإشعارات')}
                      description={tr('Les messages restent toujours consultables dans la boîte de réception. Les notifications système s’affichent en plus dans la barre du téléphone.', 'تبقى الرسائل متاحة في صندوق الوارد، ويمكن عرض إشعاراتها في شريط الهاتف.')}
                      {...sectionSave("notif-master")}
                    >
                      <Row
                        label={tr('Activer les messages', 'تفعيل الرسائل')}
                        hint={tr('Coupe tout si désactivé, y compris les bilans.', 'عند إيقافه، تتوقف الرسائل والملخصات.')}
                        control={<ToggleSwitch checked={prefs.enabled} onChange={() => patchPrefs({ enabled: !prefs.enabled })} />}
                      />
                    </Section>

                    {prefs.enabled && (
                      <>
                        <Section
                          title={tr('Sur cet appareil', 'على هذا الجهاز')}
                          description={
                            nativePermission === 'granted'
                              ? tr('Notifications autorisées par le navigateur.', 'الإشعارات مسموح بها من المتصفح.')
                              : nativePermission === 'denied'
                                ? tr('Refusées : réautorisez « Notifications » dans les réglages du navigateur pour ce site.', 'تم رفضها: اسمح بالإشعارات من إعدادات المتصفح لهذا الموقع.')
                                : tr('Affiche vos rappels même quand l’application n’est pas au premier plan.', 'تظهر الإشعارات حتى عندما لا يكون التطبيق في الواجهة.')
                          }
                          {...(nativePermission === 'granted' ? sectionSave('device') : {})}
                        >
                          {nativePermission === 'granted' ? (
                            <>
                              <Row
                                label={tr('Envoyer les rappels au téléphone', 'إرسال الإشعارات إلى الهاتف')}
                                icon={<FaIcon icon={faBell} size={15} aria-hidden="true" />}
                                control={<ToggleSwitch checked={prefs.native} onChange={() => patchPrefs({ native: !prefs.native })} />}
                              />
                              <button
                                type="button"
                                onClick={handleTestNotification}
                                className="app-tap modal-button-secondary typo-ui modal-t-label inline-flex items-center gap-2 px-4 font-medium"
                              >
                                {testSent ? <><FaIcon icon={faCircleCheck} size={14} aria-hidden="true" /> {tr('Envoyée', 'تم الإرسال')}</> : <><FaIcon icon={faBell} size={14} aria-hidden="true" /> {tr('Envoyer un test', 'إرسال اختبار')}</>}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={handleEnableNative}
                              disabled={nativePermission === 'denied'}
                              className="app-tap modal-button-primary typo-ui modal-t-label inline-flex items-center gap-2 px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <FaIcon icon={faBell} size={14} aria-hidden="true" /> {tr('Autoriser les notifications', 'السماح بالإشعارات')}
                            </button>
                          )}
                        </Section>

                        <Section
                          title={tr('Bilan de progression', 'ملخص التقدم')}
                          description={tr('Un récapitulatif chiffré de ce qui a bougé sur chaque axe depuis le bilan précédent.', 'ملخص رقمي لتطورك منذ آخر متابعة.')}
                          {...sectionSave("digest")}
                        >
                          <ChoiceGroup
                            ariaLabel={tr('Fréquence du bilan', 'وتيرة الملخص')}
                            options={digestChoices.map(c => ({ value: c.value, label: c.label, hint: c.hint }))}
                            value={prefs.digestHours}
                            onChange={(value) => patchPrefs({ digestHours: value as DigestFrequency })}
                          />
                        </Section>

                        <Section title={tr('Ce que vous recevez', 'أنواع الرسائل')} {...sectionSave("categories")}>
                          {categoryOptions.map(option => (
                            <Row
                              key={option.key}
                              label={option.label}
                              hint={option.hint}
                              control={<ToggleSwitch checked={prefs.categories[option.key]} onChange={() => toggleCategory(option.key)} />}
                            />
                          ))}
                        </Section>

                        <Section
                          title={tr('Ne pas déranger', 'عدم الإزعاج')}
                          description={tr('Aucune notification sur le téléphone pendant cette plage — les messages restent dans la boîte de réception.', 'لا تصل إشعارات الهاتف خلال هذه الفترة، وتبقى الرسائل في صندوق الوارد.')}
                          {...sectionSave("quiet")}
                        >
                          <Row
                            label={tr('Activer la plage silencieuse', 'تفعيل الفترة الهادئة')}
                            icon={<FaIcon icon={faMoon} size={15} aria-hidden="true" />}
                            control={
                              <ToggleSwitch
                                checked={prefs.quietHours.enabled}
                                onChange={() => patchPrefs({ quietHours: { ...prefs.quietHours, enabled: !prefs.quietHours.enabled } })}
                              />
                            }
                          />
                          {prefs.quietHours.enabled && (
                            <FieldPair>
                              <Field label={tr('De', 'من')} htmlFor="quiet-from">
                                <input
                                  id="quiet-from"
                                  type="time"
                                  value={prefs.quietHours.from}
                                  onChange={e => patchPrefs({ quietHours: { ...prefs.quietHours, from: e.target.value } })}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label={tr('À', 'إلى')} htmlFor="quiet-to">
                                <input
                                  id="quiet-to"
                                  type="time"
                                  value={prefs.quietHours.to}
                                  onChange={e => patchPrefs({ quietHours: { ...prefs.quietHours, to: e.target.value } })}
                                  className={inputClass}
                                />
                              </Field>
                            </FieldPair>
                          )}
                        </Section>
                      </>
                    )}
                  </div>
                )}

                {/* — REVISION — */}
                {activeTab === 'revision' && (
                  <div>
                    <Section
                      title={tr('Blocs de révision', 'فقرات المراجعة')}
                      description={tr('Choisissez les éléments à afficher dans vos fiches de révision.', 'اختر العناصر التي تريد إظهارها في بطاقات المراجعة.')}
                      {...sectionSave("revision")}
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAllRevisionBlocks(true)}
                          className="app-tap modal-button-secondary typo-ui modal-t-label inline-flex items-center gap-2 px-3.5 font-medium"
                        >
                          <FaIcon icon={faEye} size={14} aria-hidden="true" /> {tr('Tout afficher', 'إظهار الكل')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllRevisionBlocks(false)}
                          className="app-tap modal-button-secondary typo-ui modal-t-label inline-flex items-center gap-2 px-3.5 font-medium"
                        >
                          <FaIcon icon={faEyeSlash} size={14} aria-hidden="true" /> {tr('Tout masquer', 'إخفاء الكل')}
                        </button>
                      </div>

                      {REVISION_VISIBILITY_OPTIONS.map((option) => {
                        const enabled = revisionVisibility[option.key] !== false;
                        return (
                          <Row
                            key={option.key}
                            label={tr(option.label, option.labelAr)}
                            hint={tr(option.hint, option.hintAr)}
                            control={
                              <ToggleSwitch
                                checked={enabled}
                                onChange={() =>
                                  setTempSettings((prev) => ({
                                    ...prev,
                                    revisionBlockVisibility: {
                                      ...DEFAULT_REVISION_BLOCK_VISIBILITY,
                                      ...(prev.revisionBlockVisibility || {}),
                                      [option.key]: !enabled,
                                    },
                                  }))
                                }
                              />
                            }
                          />
                        );
                      })}
                    </Section>

                    <Section
                      title={tr('Numérotation des blocs', 'ترقيم الفقرات')}
                      description={tr('Activez ou désactivez les numéros sur les différents types de blocs (définitions, propriétés, théorèmes...).', 'فعّل أو عطّل الترقيم لمختلف أنواع الفقرات (التعاريف، الخاصيات، المبرهنات...).')}
                      {...sectionSave("revision-numbering")}
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAllRevisionNumbering(true)}
                          className="app-tap modal-button-secondary typo-ui modal-t-label inline-flex items-center gap-2 px-3.5 font-medium"
                        >
                          <FaIcon icon={faHashtag} size={14} aria-hidden="true" /> {tr('Tout numéroter', 'ترقيم الكل')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllRevisionNumbering(false)}
                          className="app-tap modal-button-secondary typo-ui modal-t-label inline-flex items-center gap-2 px-3.5 font-medium"
                        >
                          <FaIcon icon={faEyeSlash} size={14} aria-hidden="true" /> {tr('Tout masquer', 'إخفاء الكل')}
                        </button>
                      </div>

                      {REVISION_NUMBERING_OPTIONS.map((option) => {
                        const enabled = revisionNumbering[option.key] !== false;
                        return (
                          <Row
                            key={option.key}
                            label={tr(option.label, option.labelAr)}
                            hint={tr(option.hint, option.hintAr)}
                            control={
                              <ToggleSwitch
                                checked={enabled}
                                onChange={() =>
                                  setTempSettings((prev) => ({
                                    ...prev,
                                    revisionBlockNumbering: {
                                      ...DEFAULT_REVISION_BLOCK_NUMBERING,
                                      ...(prev.revisionBlockNumbering || {}),
                                      [option.key]: !enabled,
                                    },
                                  }))
                                }
                              />
                            }
                          />
                        );
                      })}
                    </Section>
                  </div>
                )}

                {/* — QUIZ — */}
                {activeTab === 'quiz' && (
                  <div>
                    <Section title="Temps par question" description="Durée accordée pour chaque question de quiz." {...sectionSave("quiztime")}>
                      <Field label="Minutes et secondes">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center overflow-hidden rounded-lg border border-[#d3d8de] bg-white transition-colors focus-within:border-[#1f1f1f] focus-within:ring-1 focus-within:ring-[#1f1f1f]/15">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              aria-label="Minutes"
                              value={String(Math.floor((tempSettings.quizTimePerQuestion || 45) / 60)).padStart(2, '0')}
                              onChange={e => {
                                const m = parseInt(e.target.value.replace(/\D/g, '').slice(0, 2) || '0', 10);
                                const currentSec = (tempSettings.quizTimePerQuestion || 45) % 60;
                                setTempSettings(s => ({ ...s, quizTimePerQuestion: Math.max(10, m * 60 + currentSec) }));
                              }}
                              className="typo-ui modal-t-h2 w-12 bg-transparent py-2.5 text-center font-medium tabular-nums text-[#1f1f1f] outline-none"
                            />
                            <span className="typo-ui modal-t-h2 select-none font-medium text-[#8c97a3]">:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={2}
                              aria-label="Secondes"
                              value={String((tempSettings.quizTimePerQuestion || 45) % 60).padStart(2, '0')}
                              onChange={e => {
                                const s = Math.min(59, parseInt(e.target.value.replace(/\D/g, '').slice(0, 2) || '0', 10));
                                const currentMin = Math.floor((tempSettings.quizTimePerQuestion || 45) / 60);
                                setTempSettings(prev => ({ ...prev, quizTimePerQuestion: Math.max(10, currentMin * 60 + s) }));
                              }}
                              className="typo-ui modal-t-h2 w-12 bg-transparent py-2.5 text-center font-medium tabular-nums text-[#1f1f1f] outline-none"
                            />
                          </div>
                          <span className="typo-ui modal-t-label text-[#5b6871]">
                            soit {formatTime(tempSettings.quizTimePerQuestion || 45)}
                          </span>
                        </div>
                      </Field>

                      <Field label="Réglages rapides">
                        <PillGroup
                          ariaLabel="Temps par question"
                          options={[30, 45, 60, 90, 120].map(time => ({ value: time, label: formatTime(time) }))}
                          value={tempSettings.quizTimePerQuestion || 45}
                          onChange={(time) => setTempSettings(s => ({ ...s, quizTimePerQuestion: time }))}
                        />
                      </Field>
                    </Section>

                    <Section title="Aménagement" {...sectionSave("tierstemps")}>
                      <Row
                        label="Tiers-temps"
                        hint="Accorde 33 % de temps supplémentaire (+1/3) pour les quiz et la prépa concours."
                        control={
                          <ToggleSwitch
                            checked={!!tempSettings.tiersTemps}
                            onChange={() => setTempSettings((prev) => ({ ...prev, tiersTemps: !prev.tiersTemps }))}
                          />
                        }
                      />
                    </Section>
                  </div>
                )}

                {/* — DONNÉES — */}
                {activeTab === 'data' && (
                  <div>
                    <input type="file" ref={fileInputRef} accept=".json" onChange={handleFileChange} className="hidden" />

                    <Section title={tr('Sauvegarde', 'النسخ الاحتياطي')} description={tr('Votre progression et vos réglages, dans un fichier que vous gardez.', 'احفظ تقدمك وإعداداتك في ملف خاص بك.')}>
                      <div className="space-y-2">
                        <button
                          onClick={onExportData}
                          className="app-tap modal-card modal-card--interactive flex w-full items-center gap-3.5 px-3.5 py-3.5 text-left"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef4fe] text-[#5b6871]">
                            <FaIcon icon={faDownload} size={16} aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="typo-ui modal-t-body block font-medium text-[#1f1f1f]">{tr('Exporter mes données', 'تصدير بياناتي')}</span>
                            <span className="typo-ui modal-t-hint mt-0.5 block text-[#5b6871]">{tr('Télécharger la progression et les paramètres.', 'تنزيل التقدم والإعدادات.')}</span>
                          </span>
                        </button>

                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={importStatus === 'loading'}
                          className="app-tap modal-card modal-card--interactive flex w-full items-center gap-3.5 px-3.5 py-3.5 text-left disabled:cursor-wait disabled:opacity-60"
                        >
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            importStatus === 'success' ? 'bg-[#e6f2df] text-[#4D8A2E]'
                            : importStatus === 'error' ? 'bg-[#fbe9e9] text-[#b4443c]'
                            : 'bg-[#eef4fe] text-[#5b6871]'
                          }`}>
                            {importStatus === 'loading' ? <FaIcon icon={faRotateRight} size={16} spin aria-hidden="true" />
                              : importStatus === 'success' ? <FaIcon icon={faCheck} size={16} aria-hidden="true" />
                              : importStatus === 'error' ? <FaIcon icon={faTriangleExclamation} size={16} aria-hidden="true" />
                              : <FaIcon icon={faUpload} size={16} aria-hidden="true" />}
                          </span>
                          <span className="min-w-0">
                            <span className="typo-ui modal-t-body block font-medium text-[#1f1f1f]">
                              {importStatus === 'success' ? tr('Importé avec succès', 'تم الاستيراد بنجاح') : importStatus === 'error' ? tr('Import échoué', 'فشل الاستيراد') : tr('Importer une sauvegarde', 'استيراد نسخة احتياطية')}
                            </span>
                            <span className="typo-ui modal-t-hint mt-0.5 block text-[#5b6871]">
                              {importStatus === 'loading' ? tr('Traitement en cours…', 'جارٍ المعالجة…') : tr('Restaurer un fichier JSON exporté.', 'استعادة ملف JSON تم تصديره.')}
                            </span>
                          </span>
                        </button>
                      </div>
                    </Section>

                    <Section title={tr('Réinitialisation', 'إعادة الضبط')} description={tr('Remet tous les réglages à leur valeur d’origine. Votre progression n’est pas touchée.', 'يعيد الإعدادات إلى قيمها الأصلية دون حذف تقدمك.')}>
                      <button
                        onClick={handleResetDefaults}
                        className="app-tap typo-ui modal-t-label inline-flex items-center gap-2 rounded-md border border-[#e6cdcb] bg-[#fdf4f3] px-4 font-semibold text-[#b4443c] transition-colors hover:bg-[#fbe9e9]"
                      >
                        {savedSection === 'reset'
                          ? <><FaIcon icon={faCheck} size={14} aria-hidden="true" /> {tr('Réglages réinitialisés', 'تمت إعادة ضبط الإعدادات')}</>
                          : <><FaIcon icon={faRotateLeft} size={14} aria-hidden="true" /> {tr('Réinitialiser les réglages', 'إعادة ضبط الإعدادات')}</>}
                      </button>
                    </Section>
                  </div>
                )}

              </div>
      </PageShell>
  );

  if (variant === 'modal') {
    return (
      <SheetModal open label={interfaceCopy.title} onClose={handleCancel} desktopMaxWidth="46rem">
        {content}
      </SheetModal>
    );
  }

  return content;
};

export default SettingsModal;
