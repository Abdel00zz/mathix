import { describe, expect, it } from 'vitest';
import { AIR_CLICK_MAX_MS } from './constants';
import {
  AirButtonClick, hasPenEraserButton, hasPenTipContact, isPenPointer, type PointerSample,
} from './pointer';

/**
 * Contrat du bouton latéral du S Pen. Ces échantillons reproduisent ce que
 * Chrome Android émet réellement : le bouton du stylet n'apparaît que dans
 * `buttons` (bitmask de l'état COURANT), tandis que `button` désigne la
 * transition. Les deux doivent activer la gomme, sinon « maintenir pour gommer »
 * ne marche que sur certaines transitions.
 */
const sample = (over: Partial<PointerSample> = {}): PointerSample => ({
  pointerType: 'pen',
  button: -1,
  buttons: 0,
  pressure: 0,
  clientX: 0,
  clientY: 0,
  ...over,
});

describe('isPenPointer', () => {
  /**
   * One UI reclasse le S Pen en `TOOL_TYPE_ERASER` quand le bouton latéral est
   * maintenu ; Chromium — donc Samsung Internet, PWA incluse — l'expose en
   * `pointerType: 'eraser'`. C'est le MÊME stylet : le refuser le faisait sortir
   * du rejet de paume et de la gomme.
   */
  it('accepte le stylet sous ses deux identités', () => {
    expect(isPenPointer(sample())).toBe(true);
    expect(isPenPointer(sample({ pointerType: 'eraser' }))).toBe(true);
    expect(isPenPointer(sample({ pointerType: 'touch' }))).toBe(false);
    expect(isPenPointer(sample({ pointerType: 'mouse' }))).toBe(false);
  });
});

describe('hasPenTipContact', () => {
  it('reconnaît la pointe posée via le bit 1 comme via la pression', () => {
    expect(hasPenTipContact(sample({ buttons: 1 }))).toBe(true);
    expect(hasPenTipContact(sample({ pressure: 0.3 }))).toBe(true);
    expect(hasPenTipContact(sample())).toBe(false);
  });

  it('suit la pointe même quand le stylet arrive en `eraser`', () => {
    // Sans cela, l'appui du bouton était lu comme un lever de pointe : le trait
    // se terminait au lieu de passer à la gomme.
    expect(hasPenTipContact(sample({ pointerType: 'eraser', pressure: 0.4 }))).toBe(true);
    expect(hasPenTipContact(sample({ pointerType: 'eraser', buttons: 1 }))).toBe(true);
  });

  it('ignore le doigt et la souris', () => {
    expect(hasPenTipContact(sample({ pointerType: 'touch', pressure: 1 }))).toBe(false);
    expect(hasPenTipContact(sample({ pointerType: 'mouse', buttons: 1 }))).toBe(false);
  });
});

describe('hasPenEraserButton', () => {
  it('active la gomme tant que le bouton latéral est maintenu', () => {
    // Bouton seul (survol), puis bouton + pointe posée : la gomme reste active.
    expect(hasPenEraserButton(sample({ buttons: 2 }))).toBe(true);
    expect(hasPenEraserButton(sample({ buttons: 3, pressure: 0.5 }))).toBe(true);
  });

  it('accepte la gomme matérielle (bit 32) et les transitions button 2/5', () => {
    expect(hasPenEraserButton(sample({ buttons: 32 }))).toBe(true);
    expect(hasPenEraserButton(sample({ button: 5 }))).toBe(true);
    expect(hasPenEraserButton(sample({ button: 2 }))).toBe(true);
  });

  it('relâche la gomme dès que le bit disparaît', () => {
    expect(hasPenEraserButton(sample({ buttons: 1, pressure: 0.5 }))).toBe(false);
  });

  it('gomme sur `pointerType: eraser`, même sans bit de bouton', () => {
    // Cas Samsung Internet : le bouton n'apparaît nulle part dans `buttons`,
    // la seule trace de l'appui est la requalification du stylet.
    expect(hasPenEraserButton(sample({ pointerType: 'eraser', buttons: 1, pressure: 0.5 }))).toBe(true);
    expect(hasPenEraserButton(sample({ pointerType: 'eraser' }))).toBe(true);
  });

  it('ne confond pas le clic droit de la souris avec le bouton du stylet', () => {
    expect(hasPenEraserButton(sample({ pointerType: 'mouse', buttons: 2, button: 2 }))).toBe(false);
  });
});

describe('AirButtonClick', () => {
  /** Horloge injectée : la détection dépend d'une durée, pas du temps réel. */
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  };

  it('bascule sur un clic bref, pointe en l’air', () => {
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    expect(detector.update(sample({ buttons: 2 }))).toBe(false);
    time.advance(120);
    expect(detector.update(sample({ buttons: 0 }))).toBe(true);
  });

  it('lit le front dans la bascule de type de pointeur (One UI)', () => {
    // Le bouton n'est pas dans `buttons` : le passage `pen` → `eraser` EST le
    // front montant, le retour à `pen` le front descendant.
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    expect(detector.update(sample({ pointerType: 'eraser' }))).toBe(false);
    time.advance(120);
    expect(detector.update(sample({ pointerType: 'pen' }))).toBe(true);
  });

  it('ne bascule pas si l’on écrit pendant la requalification (One UI)', () => {
    // Gomme au vol : pointe posée pendant tout l'appui → pas de clic.
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    detector.update(sample({ pointerType: 'eraser', pressure: 0.6 }));
    time.advance(90);
    expect(detector.update(sample({ pointerType: 'pen', pressure: 0.6 }))).toBe(false);
  });

  it('ignore un appui maintenu au-delà du seuil', () => {
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    detector.update(sample({ buttons: 2 }));
    time.advance(AIR_CLICK_MAX_MS + 50);
    expect(detector.update(sample({ buttons: 0 }))).toBe(false);
  });

  it('ignore un appui pendant lequel on écrit : c’est une gomme au vol', () => {
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    detector.update(sample({ buttons: 2 }));
    time.advance(40);
    detector.update(sample({ buttons: 3, pressure: 0.6 })); // pointe posée
    time.advance(40);
    expect(detector.update(sample({ buttons: 0 }))).toBe(false);
  });

  it('ignore un appui commencé pointe posée', () => {
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    detector.update(sample({ buttons: 3, pressure: 0.6 }));
    time.advance(80);
    expect(detector.update(sample({ buttons: 1, pressure: 0.6 }))).toBe(false);
  });

  it('n’observe que le stylet', () => {
    const time = clock();
    const detector = new AirButtonClick(AIR_CLICK_MAX_MS, time.now);
    expect(detector.update(sample({ pointerType: 'mouse', buttons: 2 }))).toBe(false);
    expect(detector.update(sample({ pointerType: 'mouse', buttons: 0 }))).toBe(false);
  });
});
