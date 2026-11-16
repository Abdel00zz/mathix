import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ACCENT_BY_TYPE } from '../../styles/revisionPalette';
import { ENV_LABELS } from '../../styles/mathTheme';
import { REVISION_ICONS, RevisionBadgeIcon, iconForBlockType } from './revisionIcons';

describe('icônes des blocs de révision', () => {
  it('chaque type de bloc de la palette possède une icône', () => {
    const missing = Object.keys(ACCENT_BY_TYPE).filter(type => !REVISION_ICONS[type]);
    expect(missing).toEqual([]);
  });

  it('un type inconnu retombe sur l\'icône par défaut', () => {
    expect(iconForBlockType('type-inexistant')).toBe(iconForBlockType('intro'));
  });

  it('les pictogrammes principaux sont distincts entre eux', () => {
    const main = ['definition', 'theorem', 'method', 'application', 'example', 'warning', 'intuition', 'summary', 'proof', 'hint'];
    const unique = new Set(main.map(type => REVISION_ICONS[type]));
    expect(unique.size).toBe(main.length);
  });

  it('l\'icône est décorative : masquée aux lecteurs d\'écran', () => {
    const html = renderToStaticMarkup(React.createElement(RevisionBadgeIcon, { type: 'definition' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('revision-badge-icon');
  });

  it('les libellés fixes sont accentués', () => {
    expect(ENV_LABELS.summary).toContain('Résumé');
    expect(ENV_LABELS.warning).toBe('Attention');
    expect(ENV_LABELS.intuition).toBe('Intuition');
  });
});
