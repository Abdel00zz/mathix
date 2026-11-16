/** Identité du stylet, commune aux deux surfaces d'encre de l'application. */

/**
 * Le S Pen arrive sous DEUX `pointerType` selon l'état de son bouton latéral. Sur
 * One UI — Samsung Internet en tête, PWA incluse — l'appui du bouton fait passer
 * le stylet en `TOOL_TYPE_ERASER` côté Android ; Chromium le traduit alors en
 * `pointerType: 'eraser'` et, y voyant un autre périphérique, lui alloue un
 * NOUVEAU `pointerId`. Tout test « est-ce le stylet ? » doit accepter les deux,
 * sinon l'appui du bouton fait sortir le stylet de tous les chemins de code :
 * plus de rejet de paume, plus de gomme, trait interrompu.
 *
 * Le paramètre est un `string` et non l'union littérale de `@types/react`
 * (`'mouse' | 'pen' | 'touch'`), qui ignore `'eraser'` et rejette la comparaison.
 */
export function isPenPointerType(pointerType: string): boolean {
  return pointerType === 'pen' || pointerType === 'eraser';
}
