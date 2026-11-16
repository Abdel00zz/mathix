import { createElement as h, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../../i18n/translations';
import { ClassSelector } from './ClassSelector';
import { AuthPanel } from './AuthPanel';
import LoginView from '../LoginView';

const locale = vi.hoisted(() => ({ lang: 'fr' as 'fr' | 'ar' }));
vi.mock('../../../i18n/I18nContext', () => ({ useI18n: () => ({ lang: locale.lang, dir: locale.lang === 'ar' ? 'rtl' : 'ltr', setLang: vi.fn(), t: (key: keyof typeof translations.fr) => translations[locale.lang][key] }) }));
vi.mock('../../../hooks/useMediaQuery', () => ({ useIsPhone: () => false, useIsPortrait: () => false }));
vi.mock('../../../services/storageService', () => ({ storageService: { loadState: () => ({}) } }));
vi.mock('../../../services/contentService', () => ({ contentService: { fetchRootManifest: vi.fn() } }));
afterEach(() => { locale.lang = 'fr'; vi.unstubAllGlobals(); });

const noop = () => undefined;
const props: ComponentProps<typeof AuthPanel> = {
  manifest: null, existingUser: null, firstName: '', lastName: '', phone: '', phoneDialCode: '+212', selectedClassId: '', password: '',
  setFirstName: noop, setLastName: noop, setPhone: noop, setPhoneDialCode: noop, setSelectedClassId: noop, setPassword: noop,
  onSubmit: noop, onResume: noop, onReset: noop, mode: 'lycee', onModeChange: noop, role: 'student',
  onOpenConnection: noop, onClearRegistrationError: noop, studentRegistrationStep: 1, onStudentStepChange: noop,
};

describe('rendu accessible du parcours de connexion', () => {
  it('affiche l’accueil même sans catalogue', () => {
    vi.stubGlobal('window', { history: { state: null } });
    const html = renderToStaticMarkup(h(LoginView, { onLogin: noop }));
    expect(html).toContain('Se connecter');
    expect(html).toContain('Je suis un élève');
    expect(html).toContain('Je suis un prof');
    expect(html).toContain('ts-prof-label');
    expect(html).toContain('ts-split-motion-pane');
    expect(html).toContain('aria-labelledby="student-space-title"');
    expect(html).toContain('aria-labelledby="teacher-space-title"');
    expect(html).toContain('ts-landing-card');
    expect(html).toContain('ts-backdrop');
    expect(html).not.toContain('qz-showcase-track');
  });
  it('affiche la connexion sans catalogue, avec formulaire, style Teetsh et remplissage automatique adaptés', () => {
    const html = renderToStaticMarkup(h(AuthPanel, { ...props, initialReturningOpen: true }));
    expect(html).toContain('<form');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="submit"');
    expect(html).toContain('ts-auth-shell');
    expect(html).not.toContain('new-password');
  });
  it('ne demande pas de classe à l’inscription professeur', () => {
    const html = renderToStaticMarkup(h(AuthPanel, { ...props, role: 'prof' }));
    expect(html).toContain('Envoyer ma demande');
    expect(html).not.toContain('type="radio"');
  });
  it('traduit les contrôles du mot de passe en arabe', () => {
    locale.lang = 'ar';
    const html = renderToStaticMarkup(h(AuthPanel, { ...props, initialReturningOpen: true }));
    expect(html).toContain('إظهار كلمة المرور');
    expect(html).toContain('dir="ltr"'); // Le numéro garde son ordre de lecture.
    expect(html).not.toContain('Afficher le mot de passe');
  });
});

describe('sélection des classes en grille', () => {
  const classes = [
    { id: '2eme-bac-sc-math', title: '2ème Bac Sciences Mathématiques', path: '' },
    { id: 'tronc-commun-sc', title: 'Tronc Commun Scientifique', path: '' },
    { id: '1ere-bac-sc-ex', title: '1ère Bac Sciences Expérimentales', path: '' },
    { id: 'future-class', title: 'Nouvelle filière', path: '' },
  ];
  it('organise les niveaux et conserve les classes ajoutées ultérieurement', () => {
    const html = renderToStaticMarkup(h(ClassSelector, { classes, selectedClassId: '1ere-bac-sc-ex', onChange: noop }));
    expect(html.indexOf('Tronc commun')).toBeLessThan(html.indexOf('Première année du bac'));
    expect(html.indexOf('Première année du bac')).toBeLessThan(html.indexOf('Deuxième année du bac'));
    expect(html).toContain('Nouvelle filière');
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).not.toContain('<button');
  });
  it('traduit les niveaux et la sélection en arabe', () => {
    locale.lang = 'ar';
    const html = renderToStaticMarkup(h(ClassSelector, { classes, selectedClassId: '', onChange: noop }));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('الأولى بكالوريا');
    expect(html).toContain('الأولى باك علوم تجريبية');
  });
});
