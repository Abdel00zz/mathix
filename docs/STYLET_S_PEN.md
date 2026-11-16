# Stylet S Pen — boutons, gomme et gestes

> Ce qui est branché sur le **bouton latéral** du S Pen, où c'est implémenté, et
> ce que le navigateur permet réellement. Cible de référence : **Galaxy Tab S7 +
> S Pen**, Chrome Android et **Samsung Internet installé en PWA**.

---

## 1. Ce que le navigateur voit

Chrome Android expose le S Pen par les **Pointer Events**. Le bouton latéral
n'est pas un événement à part : c'est un **bit dans `event.buttons`**, le
bitmask de l'état *courant* des boutons.

| Champ | Valeur | Signification |
|-------|--------|---------------|
| `pointerType` | `'pen'` | stylet, bouton relâché |
| `pointerType` | `'eraser'` | **même stylet, bouton maintenu** (voir §1.1) |
| `buttons & 1` | pointe posée | contact |
| `buttons & 2` | **bouton latéral maintenu** | c'est celui du S Pen |
| `buttons & 32` | gomme matérielle | stylets Surface / Wacom |
| `button` | `2` / `5` | la *transition* qui vient d'avoir lieu |

Deux conséquences qui gouvernent tout le code :

1. **`buttons` (état) et `button` (transition) ne sont pas interchangeables.**
   Au relâchement, `button` désigne le bouton *libéré* : s'en servir pour tester
   « le bouton est-il enfoncé ? » inverse la logique. On teste donc `buttons`
   pour l'état, `button` seulement pour détecter un front.
2. **Le bouton est « chordé ».** Il s'enfonce et se relâche *pendant* le geste,
   sans nouveau `pointerdown`. La transition arrive dans un `pointermove`. Un
   code qui ne décide de l'outil qu'au `pointerdown` ne verra jamais l'appui.

Le bouton latéral produit aussi un `contextmenu` : les deux surfaces de dessin
le neutralisent (`onContextMenu={e => e.preventDefault()}`).

### 1.1 Le piège One UI : le stylet change d'identité

Sur One UI — et **Samsung Internet en premier**, PWA incluse — l'appui du bouton
ne se contente pas de poser un bit : Android requalifie le stylet en
`TOOL_TYPE_ERASER`. Chromium traduit ça en `pointerType: 'eraser'`, **parfois
sans aucun bit de bouton dans `buttons`**, et comme il y voit un autre
périphérique il lui alloue un **nouveau `pointerId`**. Trois pièges en un :

| Piège | Symptôme si on l'ignore |
|-------|-------------------------|
| `pointerType` devient `'eraser'` | tout `=== 'pen'` échoue : plus de gomme, plus de rejet de paume |
| Le bouton n'est plus dans `buttons` | « maintenir pour gommer » sans effet |
| Nouveau `pointerId` | le trait en cours n'a jamais son `pointerup` → mot effacé au moment de l'appui |

D'où trois règles, toutes couvertes par les tests :

- `isPenPointerType` (`src/utils/penPointer.ts`) est l'**unique** définition de
  « c'est le stylet » : `'pen'` **ou** `'eraser'`. Les deux surfaces en dépendent.
- `hasPenEraserButton` et `AirButtonClick` traitent le passage à `'eraser'`
  comme le front montant du bouton, et le retour à `'pen'` comme le front
  descendant — le seul signal disponible quand `buttons` reste muet.
- Un `pointerdown` qui arrive avec un geste encore ouvert sous un **autre**
  `pointerId` valide ce geste au lieu de l'écraser (« trait orphelin »). Idem sur
  `pointercancel`, que Samsung Internet émet quand il requalifie l'appui en clic
  secondaire.

Enfin, Samsung Internet mappe par défaut « bouton maintenu + glisser » sur sa
**propre sélection de texte au S Pen**, qui intercepte le geste avant le canvas.
Les deux surfaces la désarment en rendant leur zone non sélectionnable
(`user-select: none`, `-webkit-touch-callout: none`).

---

## 2. Maintenir pour gommer — c'est en place

**Réponse courte : oui, ça marche, sur les deux surfaces de dessin.** Maintenir
le bouton latéral active la gomme tant qu'il est tenu ; au relâchement,
l'écriture reprend sans repasser par la barre d'outils. Exactement le
comportement de Samsung Notes / Noteshelf.

### Surface « Révision » (annotations manuscrites)

`src/components/Revision/annotation/` — c'est l'implémentation la plus complète.

| Fonction | Fichier | Rôle |
|----------|---------|------|
| `isPenPointerType` | `src/utils/penPointer.ts` | « est-ce le stylet ? » — `'pen'` ou `'eraser'` |
| `isPenPointer` | `input/pointer.ts` | même test, sur un `PointerSample` |
| `hasPenEraserButton` | `input/pointer.ts` | l'état « gomme » d'un échantillon |
| `hasPenTipContact` | `input/pointer.ts` | la pointe touche-t-elle ? (bit 1 **ou** pression > 0) |
| `AirButtonClick` | `input/pointer.ts` | clic bref **en l'air** → bascule d'outil |
| `PEN_*_MASK`, `AIR_CLICK_MAX_MS` | `input/constants.ts` | masques et seuil (650 ms) |

`BoxNoteCanvas.tsx` gère les quatre cas :

- **appui pendant le survol** → la gomme est armée (anneau dessiné sous la
  pointe), on attend le contact ;
- **appui en pleine écriture** → le trait d'encre en cours est *validé*, puis un
  geste de gomme démarre (`beginEraserGesture`) ;
- **relâchement en pleine écriture** → le geste de gomme est validé et l'encre
  reprend (`beginInkGesture`) ;
- **changement de `pointerId` en cours de geste** (One UI, §1.1) → le geste
  orphelin est validé au `pointerdown` suivant, ou au `pointercancel`.

En plus du maintien, un **clic bref, pointe en l'air**, bascule
gomme ↔ outil précédent (`BoxNoteZone.tsx` mémorise le dernier outil non-gomme).
`AirButtonClick` distingue les deux : si la pointe touche pendant l'appui, c'est
une gomme au vol, pas un clic — donc pas de bascule.

Contrat couvert par `input/pointer.test.ts`.

### Surface « Exercices » (zones de réponse)

`src/components/Exercise/canvas/DrawingCanvas.tsx` — `isStylusEraser()` accepte
`pointerType === 'eraser'`, les bits 2 et 32, `button` 2 et 5, et les anciens
champs non standard (`barrelButton`, `eraser`). L'outil actif est recalculé
**à chaque échantillon** de `pointermove`, donc l'appui en cours de geste est
bien vu.

`barrelEraserRef` mémorise l'état du bouton au début du trait. À chaque
changement en cours de geste, le trait courant est clos (`recordAdd`) et le
nouvel outil repart d'un trait neuf via `createStroke()`. Sans cette bascule, la
gomme « Précise » réécrivait rétroactivement le trait déjà tracé en trait de
gomme, et le relâchement laissait la fin du mot en gomme.

Le cas One UI est couvert au `pointerdown` : un `currentStrokeRef` encore présent
ne peut venir que d'un trait privé de son `pointerup` (le stylet a changé
d'identité), il est donc validé avant de démarrer le nouveau geste.

Les outils à geste unique (forme, lasso, sélection, texte) ne se rejouent pas
après un appui de bouton : seuls `pen`, `marker` et `highlighter` reprennent.

L'astuce est rappelée dans le panneau **Gomme** de la barre flottante — sans
cela elle ne se devine pas.

---

## 3. Ce que le bouton latéral ne peut pas faire

- **Pas de « pression » du bouton, ni de double-clic natif.** Le web ne reçoit
  que l'état enfoncé/relâché. Un double-clic devrait être reconstruit à la main
  (deux fronts dans une fenêtre de temps) — non fait, faute d'usage.
- **Pas les gestes Air Actions** (agiter le stylet, télécommande Bluetooth) :
  ils vivent dans le firmware Samsung et ne sont pas exposés au navigateur.
- **Pas de bouton hors de la zone de dessin** : sans capture de pointeur active,
  Chrome n'envoie rien d'utile.

---

## 4. Rejet de paume

Indissociable du stylet, et traité séparément sur chaque surface :

- **Révision** : `PEN_PRESENCE_MS` (1 s). Tant qu'un stylet a été vu récemment,
  tout contact tactile est ignoré — la main peut se poser sur l'écran.
- **Exercices** : réglage `palmRejection` (activé par défaut) dans le menu
  « … » de la barre flottante.

---

## Voir aussi

- [`LIAISON_TABLETTE_PC_PROF.md`](LIAISON_TABLETTE_PC_PROF.md) — liaison
  tablette ↔ PC.
- [`SCRCPY_PROJECTION.md`](SCRCPY_PROJECTION.md) — projeter l'écran de la
  tablette sur le PC.
