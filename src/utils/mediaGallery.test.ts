import { describe, expect, it } from 'vitest';
import type { MediaConfig } from '../types';
import { countByAnchor, effectiveAnchor, groupMediaByPosition, hasTwoZones, mediaByAnchor, mediaFromImages, mediaImages } from './mediaGallery';

describe('media gallery compatibility', () => {
  it('keeps legacy image settings through editing', () => {
    const old = { src: '/figure.png', width: '35%', caption: 'Figure', style: { border: false }, position: 'right' as const };
    expect(mediaFromImages(mediaImages(old))).toEqual(old);
  });
  it('keeps order and per-image settings when removing the first image', () => {
    const media = { src: '/a.png', additionalImages: [{ src: '/b.png', position: 'bottom' as const }, { src: '/c.png', width: 120 }] };
    const next = mediaFromImages(mediaImages(media).slice(1));
    expect(next).toEqual({ src: '/b.png', position: 'bottom', additionalImages: [{ src: '/c.png', width: 120 }] });
  });
  it('removes empty entries and permits removing every image', () => {
    expect(mediaFromImages([{ src: ' ' }])).toBeUndefined();
    expect(mediaFromImages([{ src: '' }, { src: ' /b.png ' }])).toEqual({ src: '/b.png' });
  });
  it('places every image relative to the same content without losing any', () => {
    const images = [{ src: '/a.png', position: 'left' as const }, { src: '/b.png', position: 'bottom' as const }, { src: '/c.png', position: 'left' as const }];
    const grouped = groupMediaByPosition(images);
    expect(grouped.left.map(image => image.src)).toEqual(['/a.png', '/c.png']);
    expect(grouped.bottom.map(image => image.src)).toEqual(['/b.png']);
    expect(Object.values(grouped).flat()).toHaveLength(3);
    expect(groupMediaByPosition(images, 'top').top).toEqual(images);
  });
});

const media: MediaConfig = {
  src: '/a.png',
  position: 'top',
  additionalImages: [
    { src: '/b.png', position: 'bottom' },
    { src: '/c.png', position: 'inline-right', anchor: 'lead' },
    { src: '/d.png', position: 'bottom', anchor: 'lead' },
  ],
};

describe('association d’une figure (énoncé / contenu)', () => {
  it('respecte l’association écrite par l’auteur', () => {
    expect(effectiveAnchor({ src: '/x.png', anchor: 'lead' }, 'reveal')).toBe('lead');
    expect(effectiveAnchor({ src: '/x.png', anchor: 'content' }, 'application')).toBe('content');
  });

  it('retrouve la règle historique d’un exercice d’application', () => {
    // Sans association explicite, `bottom` visait la correction et tout le
    // reste l'énoncé : les fiches déjà publiées ne changent pas de rendu.
    expect(effectiveAnchor({ src: '/x.png', position: 'bottom' }, 'application')).toBe('content');
    expect(effectiveAnchor({ src: '/x.png', position: 'top' }, 'application')).toBe('lead');
    expect(effectiveAnchor({ src: '/x.png' }, 'application')).toBe('lead');
  });

  it('laisse une propriété dans son contenu, comme avant', () => {
    expect(effectiveAnchor({ src: '/x.png', position: 'inline-right' }, 'reveal')).toBe('content');
    expect(effectiveAnchor({ src: '/x.png' }, 'reveal')).toBe('content');
  });

  it('sait quels blocs ont deux zones', () => {
    expect(hasTwoZones('application')).toBe(true);
    expect(hasTwoZones('reveal')).toBe(true);
    expect(hasTwoZones('single')).toBe(false);
  });
});

describe('répartition par zone', () => {
  it('sépare les figures de l’énoncé et de la correction', () => {
    const lead = mediaByAnchor(media, 'lead', 'application');
    const content = mediaByAnchor(media, 'content', 'application');

    // /a (top → énoncé), /c et /d (associées explicitement à l'énoncé).
    expect(lead && [lead.src, ...(lead.additionalImages || []).map(image => image.src)]).toEqual(['/a.png', '/c.png', '/d.png']);
    // /b (bottom → correction, règle historique).
    expect(content && [content.src, ...(content.additionalImages || []).map(image => image.src)]).toEqual(['/b.png']);
  });

  it('conserve l’ordre choisi par l’auteur', () => {
    // Dans un bloc révélable, tout va au contenu sauf association explicite.
    const content = mediaByAnchor(media, 'content', 'reveal');
    expect(content && [content.src, ...(content.additionalImages || []).map(image => image.src)])
      .toEqual(['/a.png', '/b.png']);
    const lead = mediaByAnchor(media, 'lead', 'reveal');
    expect(lead && [lead.src, ...(lead.additionalImages || []).map(image => image.src)])
      .toEqual(['/c.png', '/d.png']);
  });

  it('rend undefined plutôt qu’un média vide', () => {
    expect(mediaByAnchor(undefined, 'lead', 'application')).toBeUndefined();
    expect(mediaByAnchor({ src: '   ' }, 'lead', 'application')).toBeUndefined();
  });

  it('compte les figures par zone', () => {
    expect(countByAnchor(media, 'application')).toEqual({ lead: 3, content: 1, item: 0 });
    expect(countByAnchor(media, 'reveal')).toEqual({ lead: 2, content: 2, item: 0 });
    expect(countByAnchor(undefined, 'single')).toEqual({ lead: 0, content: 0, item: 0 });
  });

  it('n’égare aucune figure : la somme des zones redonne l’original', () => {
    for (const kind of ['application', 'reveal', 'single'] as const) {
      const lead = mediaByAnchor(media, 'lead', kind);
      const content = mediaByAnchor(media, 'content', kind);
      const rebuilt = mediaFromImages([
        ...(lead ? [lead, ...(lead.additionalImages || [])] : []),
        ...(content ? [content, ...(content.additionalImages || [])] : []),
      ]);
      const srcs = rebuilt ? [rebuilt.src, ...(rebuilt.additionalImages || []).map(image => image.src)] : [];
      expect(srcs.sort()).toEqual(['/a.png', '/b.png', '/c.png', '/d.png']);
    }
  });
});
