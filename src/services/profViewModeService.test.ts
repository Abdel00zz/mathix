import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profViewModeService, TABLET_WINDOW_NAME } from './profViewModeService';

describe('ouverture de la simulation tablette', () => {
  const open = vi.fn();
  const alert = vi.fn();
  const focus = vi.fn();
  const setItem = vi.fn();
  const location = { href: 'https://mathplus.test/?lang=ar#studio' };

  function click(overrides: Partial<MouseEvent> = {}) {
    return {
      button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      defaultPrevented: false, preventDefault: vi.fn(), ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    location.href = 'https://mathplus.test/?lang=ar#studio';
    vi.stubGlobal('window', { location, screen: { availWidth: 1920, availHeight: 1080 }, open, alert });
    vi.stubGlobal('localStorage', { setItem });
    open.mockReturnValue({ focus });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ouvre immédiatement la fenêtre portrait sans modifier la console PC', () => {
    const event = click();
    const mode = profViewModeService.getMode();
    profViewModeService.handleTabletLinkClick(event);

    expect(open).toHaveBeenCalledExactlyOnceWith(
      'https://mathplus.test/?lang=ar&profSurface=tablet#dashboard',
      TABLET_WINDOW_NAME,
      'width=820,height=1040,left=80,top=40,resizable=yes,scrollbars=yes',
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(location.href).toBe('https://mathplus.test/?lang=ar#studio');
    expect(profViewModeService.getMode()).toBe(mode);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('laisse le vrai lien ouvrir un onglet lorsque le popup est bloqué, sans alerte', () => {
    open.mockReturnValue(null);
    const event = click();
    profViewModeService.handleTabletLinkClick(event);

    expect(open).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('conserve le lien natif si le navigateur refuse window.open par une exception', () => {
    open.mockImplementation(() => { throw new Error('Popup denied'); });
    const event = click();
    expect(() => profViewModeService.handleTabletLinkClick(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it('ne crée pas de doublon si seule la mise au premier plan est refusée', () => {
    focus.mockImplementation(() => { throw new Error('Focus denied'); });
    const event = click();
    expect(() => profViewModeService.handleTabletLinkClick(event)).not.toThrow();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
  });

  it.each([
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true },
    { button: 1 }, { defaultPrevented: true },
  ])('respecte le clic natif ou déjà traité : %j', modifiers => {
    const event = click(modifiers);
    profViewModeService.handleTabletLinkClick(event);
    expect(open).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('remplace seulement la surface et la route dans le lien de secours', () => {
    location.href = 'https://mathplus.test/app?profSurface=pc&lang=fr#revision';
    expect(profViewModeService.getTabletUrl()).toBe('https://mathplus.test/app?profSurface=tablet&lang=fr#dashboard');
  });
});
