import { createElement as h, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../i18n/I18nContext', () => ({
  useI18n: () => ({ lang: 'fr', dir: 'ltr', setLang: vi.fn(), t: (key: string) => key }),
}));

import { ProfSidebar } from './ProfSidebar';

const noop = () => undefined;

const props: ComponentProps<typeof ProfSidebar> = {
  classes: [{ id: 'c1', title: '2ème Bac Sciences Maths', path: '2eme-bac-sc-math' }],
  activeClassId: 'c1',
  session: { status: 'idle' },
  syncOk: true,
  elsewhereSessionLabel: null,
  collapsed: true,
  onSelectClass: noop,
  onJoinSession: noop,
  onOpenSettings: noop,
  onOpenHelp: noop,
  onToggleCollapsed: noop,
  onCollapse: noop,
  onLogout: noop,
};

/**
 * Le bouton plein écran lit la capacité du navigateur **au rendu** : un simple
 * rendu statique suffit donc à vérifier qu'il apparaît quand l'API existe et
 * qu'il est masqué quand elle n'existe pas (iPhone).
 */
function stubFullscreenSupport(supported: boolean, active = false) {
  vi.stubGlobal('window', { location: { href: 'http://localhost:3000/' } });
  vi.stubGlobal('document', {
    fullscreenEnabled: supported,
    fullscreenElement: active ? {} : null,
    documentElement: { requestFullscreen: supported ? () => Promise.resolve() : undefined },
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('bouton plein écran du rail professeur', () => {
  it('apparaît quand le navigateur sait passer en plein écran', () => {
    stubFullscreenSupport(true);
    const html = renderToStaticMarkup(h(ProfSidebar, { ...props, collapsed: true }));
    expect(html).toContain('aria-label="Plein écran"');
    expect(html).toContain('lucide-maximize');
    expect(html).toContain('Mode tablette (nouvelle fenêtre ou onglet)');
  });

  it('propose de quitter le plein écran quand il est actif', () => {
    stubFullscreenSupport(true, true);
    const html = renderToStaticMarkup(h(ProfSidebar, { ...props, collapsed: true }));
    expect(html).toContain('aria-label="Quitter le plein écran"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('lucide-minimize');
  });

  it('est masqué quand l’API est absente plutôt que de rester inerte', () => {
    stubFullscreenSupport(false);
    const html = renderToStaticMarkup(h(ProfSidebar, { ...props, collapsed: true }));
    expect(html).not.toContain('Plein écran');
    expect(html).not.toContain('lucide-maximize');
  });

  it('existe aussi en tuile dans la barre dépliée', () => {
    stubFullscreenSupport(true);
    const html = renderToStaticMarkup(h(ProfSidebar, { ...props, collapsed: false }));
    expect(html).toContain('Plein écran — tracé plus fin, veille suspendue');
    expect(html).toContain('Plein écran</span>');
  });

  it('affiche « Réduire » une fois le plein écran actif', () => {
    stubFullscreenSupport(true, true);
    const html = renderToStaticMarkup(h(ProfSidebar, { ...props, collapsed: false }));
    expect(html).toContain('Réduire</span>');
    expect(html).not.toContain('Plein écran</span>');
  });
});
