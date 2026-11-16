import { describe, expect, it } from 'vitest';
import type { Stroke } from '../Exercise/canvas/types';
import { fitImageBox, inkToFrame, inkToImage, type ImageInkGeometry } from './sharedImageInk';

const stroke = (points: [number, number][]): Stroke => ({
  points: points.map(([x, y]) => ({ x, y, pressure: 0.5 })),
  color: '#0f172a',
  width: 3,
});

const geom = (rotation: number, factor = 1): ImageInkGeometry => ({
  naturalWidth: 400,
  naturalHeight: 200,
  rotation,
  factor,
});

describe('fitImageBox', () => {
  it("ajuste l'image à la fenêtre sans l'agrandir au-delà du naturel", () => {
    // 400×200 dans 1000×1000 : la taille naturelle suffit, on n'agrandit pas.
    expect(fitImageBox(400, 200, 1000, 1000, 0, 1)).toEqual({ width: 400, height: 200, factor: 1 });
    // 400×200 dans 200×500 : contraint par la largeur (facteur 0,5).
    expect(fitImageBox(400, 200, 200, 500, 0, 1)).toEqual({ width: 200, height: 100, factor: 0.5 });
  });

  it('échange les dimensions au quart de tour', () => {
    // Tournée, la photo paysage devient portrait : c'est la HAUTEUR qui contraint.
    expect(fitImageBox(400, 200, 1000, 200, 90, 1)).toEqual({ width: 100, height: 200, factor: 0.5 });
    expect(fitImageBox(400, 200, 1000, 200, 270, 1)).toEqual({ width: 100, height: 200, factor: 0.5 });
  });

  it('applique le zoom par-dessus l’ajustement', () => {
    expect(fitImageBox(400, 200, 200, 500, 0, 2)).toEqual({ width: 400, height: 200, factor: 1 });
  });

  it('renvoie une boîte nulle sans mesure exploitable', () => {
    expect(fitImageBox(0, 0, 800, 600, 0, 1)).toEqual({ width: 0, height: 0, factor: 0 });
    expect(fitImageBox(400, 200, 0, 0, 0, 1)).toEqual({ width: 0, height: 0, factor: 0 });
  });
});

describe('inkToFrame', () => {
  it('laisse le repère intact sans rotation ni zoom', () => {
    const [out] = inkToFrame([stroke([[10, 20]])], geom(0));
    expect(out.points[0]).toMatchObject({ x: 10, y: 20 });
  });

  it('envoie les coins de l’image sur les coins du cadre tourné', () => {
    // Quart de tour horaire : le coin haut-gauche de l'image passe en haut à
    // droite du cadre, dont la largeur vaut la hauteur de l'image.
    const corners = stroke([[0, 0], [400, 0], [0, 200]]);
    const [turned] = inkToFrame([corners], geom(90));
    expect(turned.points[0]).toMatchObject({ x: 200, y: 0 });
    expect(turned.points[1]).toMatchObject({ x: 200, y: 400 });
    expect(turned.points[2]).toMatchObject({ x: 0, y: 0 });
  });

  it('met le trait et le texte à l’échelle du zoom', () => {
    const text: Stroke = { ...stroke([[10, 10]]), isText: true, text: 'ok', fontSize: 16 };
    const [out] = inkToFrame([text], geom(0, 2));
    expect(out.width).toBe(6);
    expect(out.fontSize).toBe(32);
    expect(out.points[0]).toMatchObject({ x: 20, y: 20 });
  });
});

describe('inkToImage', () => {
  it('est l’inverse exact de inkToFrame, à toute rotation et tout zoom', () => {
    const original = stroke([[0, 0], [137, 42], [400, 200]]);
    for (const rotation of [0, 90, 180, 270]) {
      for (const factor of [1, 0.5, 2.5]) {
        const g = geom(rotation, factor);
        const [back] = inkToImage(inkToFrame([original], g), g);
        original.points.forEach((point, index) => {
          expect(back.points[index].x).toBeCloseTo(point.x, 6);
          expect(back.points[index].y).toBeCloseTo(point.y, 6);
        });
        expect(back.width).toBeCloseTo(original.width, 6);
      }
    }
  });

  it('préserve les champs qui ne relèvent pas de la géométrie', () => {
    const g = geom(90, 1.5);
    const highlight: Stroke = { ...stroke([[5, 5]]), isHighlighter: true, opacity: 0.4, pointerType: 'pen' };
    const [back] = inkToImage(inkToFrame([highlight], g), g);
    expect(back).toMatchObject({ isHighlighter: true, opacity: 0.4, pointerType: 'pen', color: '#0f172a' });
    expect(back.fontSize).toBeUndefined();
  });
});
