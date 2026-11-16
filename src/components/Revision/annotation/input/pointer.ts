import { PEN_BARREL_MASK, PEN_ERASER_MASK, PEN_TIP_MASK } from './constants';
import { isPenPointerType } from '../../../../utils/penPointer';

/**
 * Interprétation des événements pointeur, indépendante de React. Le sous-ensemble
 * de champs dont dépend le canvas est extrait dans `PointerSample` : les
 * fonctions restent pures et testables avec un simple objet littéral.
 */
export interface PointerSample {
  pointerType: string;
  button: number;
  buttons: number;
  pressure: number;
  clientX: number;
  clientY: number;
  tiltX?: number;
  tiltY?: number;
  timeStamp?: number;
}

/**
 * Le S Pen arrive sous DEUX `pointerType` selon le navigateur et l'état du
 * bouton latéral — voir `utils/penPointer.ts` pour le détail du cas One UI.
 * Refuser `'eraser'` faisait sortir le stylet de tous les chemins de code dès
 * que le bouton était enfoncé.
 */
export function isPenPointer(event: PointerSample): boolean {
  return isPenPointerType(event.pointerType);
}

/** La pointe peut rejoindre un bouton déjà pressé sans nouveau pointerdown. */
export function hasPenTipContact(event: PointerSample): boolean {
  return isPenPointer(event)
    && ((event.buttons & PEN_TIP_MASK) !== 0 || event.pressure > 0);
}

/**
 * Bouton latéral = 2, gomme matérielle = 5 / bit 32, et `pointerType: 'eraser'`
 * = le navigateur a DÉJÀ tranché (Samsung Internet, vraie pointe-gomme Wacom).
 */
export function hasPenEraserButton(event: PointerSample): boolean {
  if (event.pointerType === 'eraser') return true;
  return event.pointerType === 'pen'
    && (
      event.button === 2
      || event.button === 5
      || (event.buttons & PEN_BARREL_MASK) !== 0
      || (event.buttons & PEN_ERASER_MASK) !== 0
    );
}

/**
 * Détecteur de « clic du bouton latéral en l'air » (pointe jamais posée pendant
 * l'appui) → bascule stylo/gomme. Un appui suivi d'un contact est une gomme au
 * vol (bouton maintenu en écrivant) : ignoré. État interne minimal, aucune
 * dépendance DOM : on l'alimente avec chaque échantillon et il signale la bascule.
 */
export class AirButtonClick {
  private barrelDown = false;
  private press: { start: number; valid: boolean } | null = null;

  constructor(private readonly maxMs: number, private readonly now: () => number = () => performance.now()) {}

  /** @returns true si un clic en l'air valide vient d'être détecté. */
  update(event: PointerSample): boolean {
    if (!isPenPointer(event)) return false;
    // État COURANT du bouton via `buttons` (bitmask) — `button` au relâchement
    // désigne le bouton libéré et fausserait la détection de front. Sur One UI,
    // le bouton ne se lit pas dans `buttons` mais dans la bascule du type de
    // pointeur : `'eraser'` EST le front montant, le retour à `'pen'` le front
    // descendant (le stylet change d'identité, pas d'état de bouton).
    const barrel = event.pointerType === 'eraser'
      || (event.buttons & PEN_BARREL_MASK) !== 0
      || (event.buttons & PEN_ERASER_MASK) !== 0;
    const tip = (event.buttons & PEN_TIP_MASK) !== 0 || event.pressure > 0;
    const wasDown = this.barrelDown;
    this.barrelDown = barrel;

    if (barrel && !wasDown) {
      // Front montant : « clic » valide seulement s'il démarre en l'air.
      this.press = { start: this.now(), valid: !tip };
    } else if (!barrel && wasDown) {
      // Front descendant : bascule si l'appui est resté en l'air et bref.
      const press = this.press;
      this.press = null;
      if (press?.valid && this.now() - press.start < this.maxMs) return true;
    } else if (barrel && tip && this.press) {
      // Contact pendant l'appui → gomme au vol, plus un clic.
      this.press.valid = false;
    }
    return false;
  }
}
