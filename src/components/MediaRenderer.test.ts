import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MediaRenderer from './MediaRenderer';

vi.mock('./MathRenderer', () => ({ default: ({ content }: { content: string }) => React.createElement('span', null, content) }));
vi.mock('../hooks/useProfessorAccess', () => ({ useProfessorAccess: () => false }));
vi.mock('../hooks/useProfViewMode', () => ({ useIsTabletSurface: () => false }));

describe('multiple content images', () => {
  it('renders all images and captions around a single copy of the text', () => {
    const html = renderToStaticMarkup(React.createElement(MediaRenderer, {
      media: { src: '/top.png', caption: 'Dessus', additionalImages: [
        { src: '/left.png', position: 'left', caption: 'Gauche' },
        { src: '/right.png', position: 'float-right', caption: 'Droite' },
        { src: '/bottom.png', position: 'bottom', caption: 'Dessous' },
      ] },
      children: React.createElement('p', null, 'Texte associé unique'),
    }));
    for (const src of ['/top.png', '/left.png', '/right.png', '/bottom.png']) expect(html).toContain(`src="${src}"`);
    expect(html.match(/Texte associé unique/g)).toHaveLength(1);
    expect(html.indexOf('src="/top.png"')).toBeLessThan(html.indexOf('Texte associé unique'));
    expect(html.indexOf('src="/bottom.png"')).toBeGreaterThan(html.indexOf('Texte associé unique'));
  });
});
