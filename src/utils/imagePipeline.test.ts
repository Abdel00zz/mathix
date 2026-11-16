import { describe, expect, it } from 'vitest';
import {
  CLOUD_IMAGE_MAX_BYTES,
  STUDIO_MEDIA_MAX_BYTES,
  base64Length,
  budgetSteps,
  dataUriLength,
  fitWithin,
  sniffFormat,
  svgIntrinsicSize,
} from './imagePipeline';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('sniffFormat', () => {
  it('reconnaît les formats par leurs octets d\'en-tête', () => {
    expect(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniffFormat(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('gif');
    expect(sniffFormat(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('webp');
  });

  it('reconnaît un SVG derrière une déclaration XML', () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<!-- c -->\n<svg width="10" height="10"></svg>');
    expect(sniffFormat(svg)).toBe('svg');
  });

  it('refuse les octets inconnus, quelle que soit l\'extension annoncée', () => {
    expect(sniffFormat(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(sniffFormat(new TextEncoder().encode('<html><body>pas une image</body></html>'))).toBeNull();
    expect(sniffFormat(bytes())).toBeNull();
  });
});

describe('svgIntrinsicSize', () => {
  it('privilégie width/height, puis le viewBox, puis une taille par défaut', () => {
    expect(svgIntrinsicSize('<svg width="200" height="100" viewBox="0 0 50 50">')).toEqual({ width: 200, height: 100 });
    expect(svgIntrinsicSize('<svg viewBox="0 0 320 240">')).toEqual({ width: 320, height: 240 });
    expect(svgIntrinsicSize('<svg>')).toEqual({ width: 1024, height: 768 });
  });
});

describe('fitWithin', () => {
  it('réduit proportionnellement sans déformer', () => {
    const { width, height } = fitWithin(4000, 3000, 1600);
    expect(width).toBe(1600);
    expect(height).toBe(1200);
  });

  it('n\'agrandit jamais une petite image', () => {
    expect(fitWithin(300, 200, 1600)).toEqual({ width: 300, height: 200 });
  });

  it('garde au moins un pixel sur une image très fine', () => {
    const { width, height } = fitWithin(10000, 2, 1000);
    expect(width).toBe(1000);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe('budgetSteps', () => {
  it('commence à pleine résolution et pleine qualité, puis dégrade', () => {
    const steps = budgetSteps(1600);
    expect(steps[0]).toEqual({ edge: 1600, quality: 0.88 });
    const last = steps[steps.length - 1];
    expect(last.edge).toBeLessThan(steps[0].edge);
    expect(last.quality).toBeLessThan(steps[0].quality);
  });

  it('baisse la qualité avant de réduire la résolution', () => {
    const steps = budgetSteps(1600);
    const firstEdgeChange = steps.findIndex(step => step.edge !== steps[0].edge);
    expect(firstEdgeChange).toBeGreaterThan(1);
    expect(steps.slice(0, firstEdgeChange).every(step => step.edge === 1600)).toBe(true);
  });

  it('ne demande jamais un côté inférieur à 16 px', () => {
    expect(Math.min(...budgetSteps(20).map(step => step.edge))).toBeGreaterThanOrEqual(16);
  });
});

describe('budgets serveur', () => {
  it('base64Length suit la formule 4 * ceil(n / 3)', () => {
    expect(base64Length(0)).toBe(0);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });

  it('le budget cloud du canvas tient sous le plafond serveur de 850 000 caractères', () => {
    expect(dataUriLength(CLOUD_IMAGE_MAX_BYTES, 'image/webp')).toBeLessThan(850_000);
  });

  it('le budget studio tient sous le plafond serveur de 950 000 caractères', () => {
    expect(dataUriLength(STUDIO_MEDIA_MAX_BYTES, 'image/webp')).toBeLessThan(950_000);
  });
});
