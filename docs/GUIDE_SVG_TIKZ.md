# Guide — Créer des figures SVG de qualité TikZ / LaTeX

> **Public** : professeurs et développeurs qui ajoutent des figures à un quiz,
> un exercice ou une fiche de révision.
> **Objectif** : produire des figures indiscernables d'une sortie TikZ
> (police Computer Modern / Latin Modern Math, papier millimétré bleu pâle,
> grille cyan pointillée, axes noirs à pointe triangulaire), lisibles sur
> mobile comme sur PC, et reconnaissables comme des schémas quelle que soit
> la carte de l'application qui les porte.
---

## 0. Les consignes — récapitulatif

À relire avant d'écrire une figure. Chaque règle renvoie à sa justification.

### Polices

| # | Consigne | § |
| --- | --- | --- |
| 1 | **Embarquer les polices en base64.** `font-family: "Latin Modern Math"` seul retombe silencieusement sur Times New Roman. | § 1 |
| 2 | **Pile `FigMath, FigMain, serif` obligatoire** sur toute étiquette mathématique. `FigMath` seule fait tomber chaque chiffre et chaque signe en police système, **au milieu du mot**. | § 4 bis |
| 3 | **Jamais d'accentué, jamais d'exposant Unicode** (`é`, `⁻¹`) : aucune police KaTeX ne les contient. La prose accentuée va dans la légende JSON. | § 4 bis |
| 4 | **Deux polices, comme dans le contenu** : la prose en `system-ui` (`.lbl-t`, `.lbl-u`), les mathématiques en Computer Modern (`.lbl-*`). | § 4 ter |
| 5 | **Nom de fonction en romain droit** : `\tan` ≠ *tan*. Ajouter `.up` **après** la classe de couleur — c'est l'ordre dans le CSS qui décide, pas celui de l'attribut `class`. | § 4 bis |
| 6 | `𝒞_f` = `<tspan class="script">C</tspan><tspan class="sub">f</tspan>` ; l'exposant de second rang (`.sub .sup`) n'est **pas** réduit en cascade, sinon illisible. | § 4 ter |

### Repère et tracé

| # | Consigne | § |
| --- | --- | --- |
| 7 | **Papier millimétré `.paper`** : bleu très pâle, bords arrondis, couvrant toute la figure. Une figure à plusieurs panneaux pose une carte par panneau. | § 4, § 7 |
| 8 | **Grille millimétrée pleine page**, alignée sur l'origine ; pas = pas des nombres si les axes sont gradués, demi ou quart de pas si le domaine est symbolique, pas distincts si l'échelle est anisotrope. | § 8 |
| 9 | **Le domaine doit englober les axes** (`x = 0`, `y = 0`) et la marge des étiquettes de gauche. | § 9 bis |
| 10 | **Pointe de flèche triangulaire** (le `->` de LaTeX) : `markerUnits="userSpaceOnUse"` et `refX` = abscisse exacte de la pointe. | § 5 |
| 11 | **Un seul rythme de tirets par rôle** (`6 4` droites de repère, `4 3.5` guides) ; **le trait le plus épais est le sujet** (courbe 2,6 px > droite de repère 1,8 > guide 1,7 > axe 1,7 > grille 1,1). | § 4 |
| 12 | **Barres de mise en évidence à côté de l'axe**, jamais dessus : écrasée sur l'axe, la barre de 3,6 px le fait lire comme un axe noir. | § 9 bis |

### Étiquettes

| # | Consigne | § |
| --- | --- | --- |
| 13 | **Une étiquette ne croise rien** : ni un axe, ni la courbe, ni le point qu'elle nomme, ni une droite de repère. Sur une droite horizontale, elle se pose **au-dessus** (`dy` négatif). | § 9, § 9 bis |
| 14 | **14,5 à 16 px dans le SVG**, et `width` **proportionnelle** à la largeur du `viewBox` : sinon les libellés diffèrent de 40 % d'une figure à l'autre. L'origine `O` s'écrit en **italique mathématique**, jamais en romain. | § 4, § 10 |

### Contenu et légende

| # | Consigne | § |
| --- | --- | --- |
| 15 | **Chemin absolu** `/data/<classe>/…` dans `media.src` : aucun résolveur ne préfixe les chemins relatifs. | § 10 |
| 16 | **Rattacher la figure à un bloc toujours visible** (`text`, `warning`, `remark`, `application`) — sur un bloc repliable, elle reste cachée jusqu'au clic. | § 10 |
| 17 | **Légende dans `media.caption` du JSON**, jamais dans l'image ; le LaTeX y fonctionne. **Interdite dans les quiz** (elle donne la réponse). | § 12 |

### Validation — avant de valider une figure

```bash
node tmp/check-figures.mjs     # polices, papier, viewBox, écarts entre cartes
node tmp/check-svg.mjs <f.svg> # validité XML, balises, appariement
node tmp/dump-svg-text.mjs <f.svg>   # inventaire des textes (repérer les collisions)
node tmp/check-math-katex.mjs <fiche.json>  # toutes les formules, légendes comprises
node tmp/check-guide-examples.mjs docs/GUIDE_SVG_TIKZ.md  # les exemples de ce guide
```

Le générateur refuse par ailleurs d'écrire un SVG dont un attribut vaut `NaN`
ou `undefined` (§ 9 bis) — c'est le filet de sécurité du point 9.

---

## 1. Le piège à connaître avant tout : les polices

Les figures sont affichées par `MediaRenderer` via une balise `<img src="….svg">`.

```
MediaRenderer.tsx  →  <OptimizedImage src={media.src} …/>  →  <img src="…svg">
```

Un SVG chargé dans `<img>` est un **document isolé** : il n'a accès ni aux
styles de la page, ni à ses webfonts, ni au réseau. Conséquence directe :

> Une ligne `font-family: "Latin Modern Math", serif` ne suffit jamais.
> Sur une machine où Latin Modern n'est pas installée (le cas par défaut sous
> Windows), le navigateur retombe silencieusement sur Times New Roman et la
> figure perd tout son aspect LaTeX.

**La seule solution fiable est d'embarquer la police dans le SVG**, en base64,
exactement comme le fait `dvisvgm` lorsqu'il exporte un TikZ vers SVG.

Le projet dispose déjà des polices Computer Modern via KaTeX (dont Latin Modern
Math est l'héritière directe) :

| Fichier | Usage |
| --- | --- |
| `node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2` | chiffres, `O`, `A`, `C`, `T`, texte droit |
| `node_modules/katex/dist/fonts/KaTeX_Math-Italic.woff2` | italiques mathématiques : `x`, `y`, `f` |

Vous n'avez pas à encoder ces fichiers à la main : `scripts/svg-tikz-skeleton.mjs`
le fait pour vous (§ 5).

---

## 2. Deux chaînes de production

### A. TikZ compilé (préféré pour les figures riches)

`scripts/generate-complex-tikz.mjs` écrit de vrais fichiers `.tex`
(`preamble` + `standalone`) puis on compile avec `pdflatex` / `dvisvgm`.
C'est la voie utilisée pour `complexes/revisions/figures/tikz`.

Avantage : géométrie exacte, flèches `arrows.meta` natives, arcs, cotations.
Contrainte : une chaîne LaTeX doit être disponible sur la machine.

### B. SVG écrit ou généré à la main (voie de ce guide)

On compose l'SVG directement, en réutilisant la feuille de style et la pointe
de flèche ci-dessous. C'est la voie retenue pour les figures de quiz
(`mise-a-niveau/quiz/figures/*.svg`), où l'on veut un fichier léger, autonome
et versionné sans outil externe.

---

## 3. Palette canonique du projet

Ces couleurs sont celles de `scripts/svg-tikz-style.mjs`. Ne pas en inventer
d'autres : c'est ce qui fait qu'une figure ressemble à sa voisine.

| Rôle | Nom | Hex | Classe CSS |
| --- | --- | --- | --- |
| Papier de la figure | `paper` | `#EAF4FC` | `.paper` |
| Grille millimétrée | `grid` | `#AFDAF2` | `.grid` |
| Axes, graduations, pointe de flèche | `axis` | `#111111` | `.axis` `.tick` `.tip` |
| Courbe principale | `blue` | `#1B6FE3` | `.curve` `.pt` `.lbl-blue` |
| Droite de repère : asymptote, seuil $y=k$, diagonale $y=x$ | `coral` | `#E23636` | `.aux-*` `.lbl-coral` |
| Guide de projection (d'un point vers un axe) | `teal` | `#1CA45C` | `.guid` `.lbl-teal` |
| Courbe secondaire — 3ᵉ et 4ᵉ courbes d'une même figure | `magenta` | `#D6006E` | `.curve-m` |
| Courbe secondaire — variante | `purple` | `#7A2BC8` | `.curve-p` |
| Étiquettes et nombres | `ink` | `#111111` | `.lbl` `.lbl-o` `.lbl-m` |

### Sémantique à respecter

- **Un rôle = une couleur.** La courbe est toujours bleue, toute droite de
  repère toujours rouge, tout guide de projection toujours vert. L'élève
  apprend le code couleur d'une figure à l'autre.
- **Le rouge est un accent, pas une masse.** Il porte les droites de repère —
  jamais une courbe. Une figure qui compte cinq droites rouges (une asymptote
  dans chaque direction, plus la diagonale) est légitime mais doit rester
  lisible : d'où l'épaisseur volontairement inférieure à celle des courbes.
- **Le vert ne sert qu'aux guides.** C'est ce qui le distingue d'une asymptote
  au premier regard : une ligne verte joint toujours un point à un axe.
- **Jamais plus de 4 encres** sur une même figure (papier et grille exclus).

---

## 4. Feuille de style de référence

À copier telle quelle à l'intérieur de `<style>`. Les deux `@font-face` sont
injectés automatiquement par le générateur de squelette (§ 5) — remplacés ici
par un commentaire pour la lisibilité.

```css
/* @font-face FigMain    ← KaTeX_Main-Regular.woff2        (base64) */
/* @font-face FigMath    ← KaTeX_Math-Italic.woff2         (base64) */
/* @font-face FigScript  ← KaTeX_Caligraphic-Regular.woff2 (base64) */

text            { font-family: FigMain, …serif; font-size: 14.5px; fill: #111111; }

/* Le papier de la figure : un bleu très pâle, à bords arrondis, qui couvre
   TOUTE la figure. C'est lui qui donne l'assise du schéma de manuel ; la carte
   de l'application reste visible tout autour (voir § 7). */
.paper          { fill: #EAF4FC; stroke: none; }

/* Grille millimétrée : cyan pointillée, PLEINE PAGE. */
.grid           { stroke: #AFDAF2; stroke-width: 1.1; stroke-dasharray: 3 3; fill: none; }
.axis           { stroke: #111111; stroke-width: 1.7; fill: none; stroke-linecap: butt; }
.tick           { stroke: #111111; stroke-width: 1.7; stroke-linecap: butt; }
.tip            { fill: #111111; }

.curve          { fill: none; stroke: #1B6FE3; stroke-width: 2.6;
                  stroke-linecap: round; stroke-linejoin: round; }
.pt             { fill: #1B6FE3; stroke: #ffffff; stroke-width: 2; }
.pt-open        { fill: #ffffff; stroke: #1B6FE3; stroke-width: 2.2; }

/* Droites de repère : rouge, un seul motif et une seule épaisseur — plus
   FINE que la courbe, pour que le rouge reste un accent. */
.aux-g          { fill: none; stroke: #E23636; stroke-width: 1.8; stroke-dasharray: 6 4; }
.aux-c          { fill: none; stroke: #E23636; stroke-width: 1.8; stroke-dasharray: 6 4; }
.aux-t          { fill: none; stroke: #E23636; stroke-width: 1.8; stroke-dasharray: 6 4; }
/* Guides de projection : vert, plus serrés — c'est ce qui les distingue d'une
   asymptote au premier regard. */
.guid           { fill: none; stroke: #1CA45C; stroke-width: 1.7; stroke-dasharray: 4 3.5; }
.band           { fill: #1B6FE3; opacity: .07; }

/* Mise en évidence d'un intervalle sur un axe — c'est ce qui fait lire
   « l'image du segment [a, b] est le segment [m, M] ». À POSER À CÔTÉ de
   l'axe, jamais dessus : sur l'axe, la barre l'épaissit et se lit comme un axe
   noir (voir § 9 bis). */
.hl             { fill: none; stroke: #1B6FE3; stroke-width: 3.6; stroke-linecap: butt; }
.hl-tick        { stroke: #1B6FE3; stroke-width: 1.9; stroke-linecap: butt; }
.hl-lbl         { font-family: FigMath, FigMain, …serif; font-style: italic;
                  font-size: 15px; fill: #1B6FE3; }

/* Étiquettes : la pile FigMath,FigMain est OBLIGATOIRE (voir § 4 bis). */
.lbl            { font-family: FigMain, …serif; font-size: 14.5px; fill: #111111; }
/* L'origine s'écrit `$O$` en LaTeX : italique mathématique. En romain, elle
   ressemble à un zéro. */
.lbl-o          { font-family: FigMath, FigMain, …serif; font-style: italic;
                  font-size: 16px; fill: #111111; }
.lbl-m          { font-family: FigMath, FigMain, …serif; font-style: italic;
                  font-size: 15px; fill: #111111; }
.lbl-blue       { font-family: FigMath, FigMain, …serif; font-style: italic;
                  font-size: 15px; fill: #1B6FE3; }
.lbl-teal       { … fill: #1CA45C; }
.lbl-coral      { … fill: #E23636; }
.lbl-gold       { … fill: #C97A12; }

/* Prose : la police du SYSTÈME, comme les phrases du contenu (§ 4 ter).
   Ces deux classes servent dans des panneaux réduits (figures à 2 ou 3
   cartes) : 11,5 px y tomberait sous 7 px à l'affichage. */
.lbl-t          { font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
                  font-size: 13.5px; font-weight: 600; fill: #111111; }
.lbl-u          { font-family: system-ui, …sans-serif; font-size: 13px;
                  font-weight: 500; fill: #E23636; }

/* Indices et exposants : moins serrés que KaTeX, sinon illisibles (§ 4 ter). */
.sub            { font-size: .8em;  font-style: italic; baseline-shift: sub; }
.sup            { font-size: .82em; font-style: italic; baseline-shift: super; }
.sub .sup      { font-size: .95em; }
.up             { font-family: FigMain, …serif; font-style: normal; }
.script         { font-family: FigScript, FigMath, FigMain, …serif;
                  font-style: normal; font-size: 1.15em; }
```

**Le papier.** Une figure porte son propre papier millimétré : un bleu très
pâle, à bords arrondis, qui couvre toute la surface. C'est ce qui lui donne
l'air d'une page de manuel — et ce qui rend la figure identifiable comme un
schéma, quelle que soit la carte sur laquelle elle est posée. Voir § 7.

**Tailles.** 14,5 px pour les nombres de graduation, 15-16 px pour les
étiquettes structurelles (`x`, `y`, `a`, `𝒞_f`), et **16 px en italique
mathématique pour l'origine `O`** — un `O` en romain se lit comme un zéro.
La prose descend à 13,5 px.

**Épaisseurs.** 1,7 px pour les axes, **2,6 px pour la courbe** (le trait le
plus épais de la figure), 1,8 px pour les droites de repère, 1,7 px pour les
guides, 1,1 px pour la grille. L'ordre des épaisseurs porte le sens : la
courbe domine toujours les droites qui la commentent.

**Tirets.** Un seul motif pour toutes les droites de repère (`6 4`) et un seul
pour les guides (`4 3.5`). Multiplier les rythmes donne l'impression que
certaines droites sont « tirées plus long » que d'autres, et deux droites
voisines finissent par se confondre.

---

## 4 bis. Les polices : la règle des deux maillons

> **C'est l'erreur qui se voit le plus.** KaTeX répartit les glyphes comme
> LaTeX : `KaTeX_Math-Italic` ne contient **que des lettres** (latin et grec),
> et `KaTeX_Main-Regular` porte les chiffres et la ponctuation.

Une étiquette mathématique écrite avec `font-family: FigMath` **seule** tombe
donc en police système à chaque `(`, `)`, `=`, `;`, `[`, `]`, `/`, `+`, `.`,
`,` et à chaque chiffre — **au milieu du mot** : `f(a)` mélange deux fontes.

```css
/* ✗ FAUX : la ponctuation et les chiffres tombent en Times */
.lbl-m { font-family: FigMath, serif; }

/* ✓ JUSTE : lettres en italique, chiffres et ponctuation droits */
.lbl-m { font-family: FigMath, FigMain, serif; }
```

### Ce que les polices KaTeX ne contiennent **pas**

| Absent partout | Conséquence |
| --- | --- |
| **Tout caractère accentué** (`é è à ç ê î ô û ù œ É`) | jamais de prose française dans une figure |
| Exposants Unicode `⁻ ¹ ² ³` | composer l'exposant en SVG (`.sup`) |
| `ϖ` `𝜋` (Unicode mathématique U+1D6xx/1D70x) | utiliser le grec ordinaire |
| Chiffres et ponctuation dans la police *italique* | toujours mettre `FigMain` en second |

Conséquence pratique : **la figure ne contient que le dessin, des symboles et
des étiquettes techniques**. Toute phrase explicative va dans le `caption` du
JSON (§ 12) — où l'application rend les accents et les mathématiques
correctement.

### Greek et calligraphique

- Le **grec ordinaire** (`π`, `Δ`, `α`…) est dans `FigMath` ; il s'obtient donc
  en écrivant simplement `π` dans une étiquette `.lbl-*` mathématique.
- L'**initiale calligraphique** d'une courbe s'écrit comme `\mathscr{C}` en
  LaTeX : `<tspan class="script">C</tspan><tspan class="sub">f</tspan>`
  → `𝒞_f`. Ne pas utiliser les caractères Unicode de script (absents).

### Droite ou italique : la règle LaTeX, pas l'esthétique

En mathématiques, **l'italique est réservé aux variables**. Un nom de fonction
se compose en **romain droit** : `\tan` ≠ *tan*, `\ln` ≠ *ln*,
`\operatorname{Arctan}` ≠ *Arctan*. C'est aussi vrai pour les mots qui
accompagnent une figure (« aucune solution ») : ce n'est pas une variable.

```css
/* Le modificateur .up annule l'italique et repasse sur la fonte droite */
.up { font-family: FigMain, serif; font-style: normal; }
```

Il s'ajoute **après** la classe de couleur :

```html
<text class="lbl-blue up" x="295" y="78" text-anchor="middle">tan</text>
```

| Étiquette | Classe | Pourquoi |
| --- | --- | --- |
| `f`, `a`, `x`, `n`, `k`, `y = x`, `π/2` | `lbl-m`, `lbl-blue`… | variables et nombres : italique |
| `tan`, `Arctan`, `ln`, `exp` | `lbl-* up` | noms de fonctions : romain droit |
| « aucune solution », `n impair` | `lbl-* up` ou `lbl-t` | mots : romain droit |

> **Pourquoi l'ordre de la classe compte.** `.lbl-blue` et `.up` ont la même
> spécificité (une classe) : c'est **la dernière règle de la feuille de style**
> qui l'emporte. Dans `svg-tikz-style.mjs`, `.up` est donc déclaré **après**
> toutes les classes de couleur. Écrire `class="up lbl-blue"` ne change rien
> — c'est la position dans le CSS qui décide, pas l'ordre dans l'attribut.

La légende d'une même figure dit `\tan` et `\operatorname{Arctan}` : composée
par KaTeX (§ 12), elle est **droite**. Si la figure écrit *tan* en italique, le
lecteur voit deux graphies du même objet dans le même bloc ; c'est ce
désaccord qu'il faut traquer.

### Vérifier

```bash
node tmp/check-figures.mjs     # polices, papier, viewBox, écarts entre cartes
```

---

## 4 ter. Prose et mathématiques : deux polices, comme dans le contenu

Le contenu de l'application a une typographie à deux étages, et une figure doit
la reproduire :

| Dans le contenu | Dans la figure | Police |
| --- | --- | --- |
| Phrase : « le trou se comble » | Titre de panneau, annotation en mots | celle du **système** (`system-ui`) |
| Formule : `f(0) = 1` (KaTeX) | Étiquette `f(a)`, `π/2`, `𝒞_f` | **Computer Modern** (KaTeX embeddée) |

Aucune webfont de la page ne traverse la frontière de `<img>` — mais les
polices **système**, si. Un mot comme « saut » écrit en Computer Modern jure
avec la phrase qui l'entoure ; écrit en `system-ui`, il se fond dans la page.

```css
/* Prose */
.lbl-t { font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
         font-size: 11.5px; font-weight: 600; }
.lbl-u { font-family: system-ui, …sans-serif; font-size: 11.5px; font-weight: 500; }
```

```html
<text class="lbl-t" x="130" y="248" text-anchor="middle">saut</text>
<text class="lbl-u" x="690" y="243" text-anchor="end">aucune solution</text>
```

**Le corollaire est plus important que la règle.** Si un mot doit être écrit
dans la figure, c'est qu'il porte une information *nommable* : un titre de
panneau, un cas (« aucune solution »). Toute phrase plus longue va dans la
légende (§ 12), où le LaTeX et les accents sont disponibles.

### Indices et exposants : s'écarter de LaTeX pour rester lisible

KaTeX descend à 0,7 em puis 0,5 em pour les scripts. À 13 px dans une figure,
un exposant de second rang tombe sous 7 px : `𝒞_f⁻¹` se lisait « 𝒞_2 ».

```css
.sub { font-size: .8em;  baseline-shift: sub; }
.sup { font-size: .82em; baseline-shift: super; }
```

Soit, imbriqués, 0,66 em ≈ 9 px à 14 px de base : lisible. On s'écarte de
LaTeX, et c'est le bon compromis — une figure est vue à 60 % de la largeur
d'une colonne, pas imprimée sur du papier glacé.

Les exposants **Unicode** (`⁻ ¹ ² ³`) n'existent dans aucune des polices : ils
doivent être composés en SVG avec `<tspan class="sup">-1</tspan>`.

---

## 5. Pointe de flèche et étendue des axes

C'est le détail qui trahit le plus une figure amateur. Deux règles :

1. `markerUnits="userSpaceOnUse"` — la pointe garde **la même taille** quelle
   que soit l'épaisseur du trait qui la porte. Sans cela, l'axe des ordonnées
   et l'axe des abscisses n'ont pas la même flèche.
2. `refX` doit valoir **exactement la pointe** (`10` pour un `viewBox` de 0 0 10 7),
   sinon la pointe dépasse de l'extrémité et se fait rogner par le `viewBox`.

```html
<marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5"
        markerWidth="10" markerHeight="7"
        markerUnits="userSpaceOnUse" orient="auto">
  <path class="tip" d="M0,0 L10,3.5 L0,7 L2.9,3.5 Z"/>
</marker>
```

Le triangle est **légèrement concave** (`L2.9,3.5 Z`) : c'est la silhouette du
`->` de LaTeX. Un triangle plein donne une flèche pataude, une pointe
« stealth » très creusée donne un dard qui ne ressemble plus à LaTeX.

Usage : `marker-end="url(#arrow)"` sur une `<line class="axis">`.

### Les axes courent jusqu'au bord

Sur un schéma de manuel, le trait d'axe va jusqu'à l'extrémité de la figure,
alors que la dernière graduation reste à l'intérieur. `axes()` distingue donc
deux domaines :

```js
axes(s, {
  xmin: -0.2, xmax: 2.2,          // étendue des graduations et des nombres
  axis: { xmin: -0.4, xmax: 2.45 }, // étendue du trait lui-même
});
```

Sans `axis`, le trait s'arrête à la dernière graduation et la figure paraît
recroquevillée au milieu de son papier.

---

## 6. Squelette minimal complet

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 400" width="420" height="400"
     role="img" shape-rendering="geometricPrecision">
  <title>Allure de C_f avec sa tangente au point A(2 ; 2)</title>
  <defs>
    <style>/* § 4 */</style>
    <!-- § 5 -->
  </defs>

  <rect class="paper" x="0" y="0" width="420" height="400" rx="12"/>  <!-- § 7 -->
  <g class="grid">   <!-- millimétrée, pleine page --> </g>
  <g class="axes">   <!-- axes + graduations --> </g>
  <path class="curve" d="M …"/>
  <circle class="pt" cx="…" cy="…" r="4"/>
  <g class="labels"> … </g>
</svg>
```

Points obligatoires :

- `role="img"` **et** un `<title>` : c'est ce que lit un lecteur d'écran quand
  l'SVG est ouvert seul. Le texte alternatif destiné au contenu est le champ
  `alt` du JSON (§ 10).
- `shape-rendering="geometricPrecision"` : évite que le navigateur arrondisse
  les traits obliques.
- **Un papier millimétré en premier élément** : c'est lui qui donne son assise
  à la figure (§ 7). Il est posé avant la grille, les axes et les courbes.
- `width` et `height` doivent valoir les dimensions du `viewBox` : c'est ce
  qui fixe le rapport d'aspect quand l'image est posée en pourcentage.

---

## 7. Le fond : papier millimétré

Une figure porte **son propre papier** : un bleu très pâle (`#EAF4FC`), à bords
arrondis, qui couvre toute la surface. C'est ce qui lui donne l'air d'une page
de manuel — et ce qui la fait reconnaître comme un schéma quelle que soit la
carte de l'application sur laquelle elle est posée.

```html
<rect class="paper" x="0" y="0" width="420" height="400" rx="12"/>
```

```css
.paper { fill: #EAF4FC; stroke: none; }
```

Trois points d'attention :

1. **Le papier se pose en premier**, avant la grille, les axes et les courbes.
   Dans l'ordre d'un document SVG, le dernier écrit est dessiné au-dessus.
2. **Il couvre toute la figure**, bord à bord. Un papier plus petit laisse une
   bande transparente que rien ne signale — `tmp/check-figures.mjs` refuse ce
   cas.
3. **La carte de l'application reste visible tout autour.** Le `rx="12"` du
   papier, combiné à la marge du bloc, suffit à détacher la figure sans qu'il
   faille un cadre ou une ombre dans le JSON (`style` du média).

**Une figure à plusieurs panneaux pose une carte par panneau**, jamais une
seule grande page : les panneaux se lisent alors comme des blocs séparés, et
chacun a sa propre grille alignée sur son propre repère.

```js
// figure({ …, paper: false }) puis, par panneau :
parts.push(paper({ x: p, y: 0, w: 252, h: H }));
parts.push(...grid(s, { step: 1, x: p, y: 0, w: 252, h: H }));
```

> **Pourquoi un fond opaque, alors que la figure était transparente ?** Une
> figure transparente adopte la carte, mais elle flotte : rien ne dit où
> commence le domaine, et la grille cyan se pose sur l'ivoire comme sur le
> blanc sans qu'on sache ce qui est dessiné et ce qui est le fond. Le papier
> tranche. C'est le style de référence du projet.

**Ces figures ne sont pas conçues pour un fond sombre.**

---

## 8. Conversions math → pixels

Un repère se décrit par quatre nombres : l'origine en pixels et le pas d'une
unité sur chaque axe.

```js
const x0 = 60,  y0 = 340;   // position de l'origine (0 ; 0) dans le viewBox
const ux = 45,  uy = 45;    // pixels par unité

const px = (x) => x0 + x * ux;   // abscisse mathématique → x SVG
const py = (y) => y0 - y * uy;   // ordonnée mathématique → y SVG (axe inversé)
```

**Aspect carré.** Pour que les cellules de la grille soient carrées, il faut
`ux === uy`. C'est le cas par défaut du générateur.

**Grille pleine page.** La grille couvre **toute** la figure, pas seulement le
domaine gradué : c'est le papier millimétré du manuel. Elle est alignée sur
l'origine du repère, donc une ligne passe exactement sur chaque graduation.

**Pas de la grille.** Il dépend de ce que les axes nomment :

| Repère | Pas | Exemple |
| --- | --- | --- |
| Axes **gradués en nombres** | le pas des nombres (`1`) | `arctan-graphe` : on lit que π/2 ≈ 1,57, entre les deux premiers traits |
| Domaine **symbolique** (`a`, `b`, `c`, `k`) | demi-pas (`0.5`) | `tvi-existence` : papier quadrillé, sans suggérer de valeurs |
| Idem, figure plus fine | quart de pas (`0.25`) | `tvi-non-unicite` : les trois solutions se lisent d'un coup d'œil |
| Échelle **très dilatée** dans un sens | pas distinct par axe | `continuite-prolongement` : `stepX: 1`, `stepY: 0.25` |

`grid()` **double le pas** tant qu'il descend sous 18 px : sans cela, un domaine
serré donnerait un aplat cyan au lieu d'une grille.

> **Le cas de l'échelle anisotrope.** Quand une figure dilate fortement un axe
> (155 px par unité en ordonnée contre 39 en abscisse, pour montrer une fonction
> qui reste entre 0 et 1), une grille au même pas dans les deux sens donne des
> cellules très allongées. On passe alors `stepX` et `stepY` distincts pour
> retrouver des carreaux à peu près carrés.

Une figure **sans grille** paraît nue : le lecteur ne peut ni estimer, ni
comparer, ni vérifier. C'est la première chose qui fait dire d'un schéma qu'il
est « pauvre » alors que la courbe est juste.

**Débordement des axes.** Les traits d'axe courent jusqu'au bord de la figure,
alors que la dernière graduation reste à l'intérieur — c'est l'option `axis` de
`axes()`, détaillée au § 5.

**Graduations.** Demi-longueur 4 px (≈ `tick length=0.15cm` de TikZ) : elles
traversent l'axe de part et d'autre.

---

## 9. Placement des étiquettes — les règles TikZ

C'est le second point qui distingue une figure soignée d'une figure bricolée.
Les règles ci-dessous correspondent aux primitives TikZ usuelles.

| Élément | Équivalent TikZ | Règle SVG |
| --- | --- | --- |
| Origine | `node[below left] {$O$}` | classe `.lbl-o` (**italique mathématique**, 16 px), `text-anchor="end"`, décalée de 6 px à gauche et 20 px sous l'origine — **jamais centrée sur l'origine**, elle recouvrirait l'axe |
| Nombres de l'axe des abscisses | `node[below]` | `text-anchor="middle"`, 20 px sous l'axe |
| Nombres de l'axe des ordonnées | `node[left]` | `text-anchor="end"`, 6 px à gauche de l'axe, `+5 px` de correction de ligne de base |
| Nom des axes | `node[above] {$x$}` | italique, à droite de la pointe pour `x`, au-dessus pour `y` |
| Point remarquable | `node[above right] {$A(2\,;\,2)$}` | `text-anchor="end"` en haut à gauche du point : la concavité de la courbe réserve cet espace |
| Courbe | `node[right] {$C_f$}` | à droite de la courbe, dans la zone libre entre courbe et tangente |
| Droite auxiliaire | `node[right, color]` | au bord de la droite, du côté intérieur de la figure |

**Toujours vérifier par la mesure**, jamais à l'œil (§ 10). Les collisions
typiques sont : `O` sur l'axe vertical, `A(…)` sur le disque du point,
`C_f` posée sur la courbe, une étiquette qui sort du `viewBox`.

**Indices.** `𝒞_f` s'écrit avec un contenu mixte et un `tspan` :

```html
<text class="lbl-blue" x="192" y="118" text-anchor="start"><tspan class="script">C</tspan><tspan class="sub">f</tspan></text>
```

Pour l'exposant `𝒞_f⁻¹`, il faut **deux** `tspan` imbriqués — les caractères
Unicode `⁻¹` n'existent dans aucune police (voir § 4 ter) :

```html
<tspan class="script">C</tspan><tspan class="sub">f<tspan class="sup">-1</tspan></tspan>
```

La classe `.sub` réduit à `.8em` et abaisse la ligne de base — ne pas
utiliser `dy` en dur, qui casse si la taille change.

**Mathématiques.** Les variables (`x`, `y`, `f`, `T`, `Δ`) vont en italique via
`.lbl-*` (police `FigMath`). Les **nombres restent droits** (règle `text`).
En arabe, ne jamais appliquer de `letter-spacing` (voir `docs/GUIDE_*.md` i18n).

---

## 9 bis. Trois pièges qui passent l'œil mais pas la relecture

### 1. Une étiquette traversée par la droite qu'elle nomme

C'est la collision la plus fréquente, et la plus invisible : quand la droite
auxiliaire part du **bord du panneau** et non de l'axe, elle balaie toute la
largeur — donc la zone où sont écrits les noms de valeurs.

```js
// ✗ la droite y = a part de xmin : elle barre l'étiquette « a »
seg(s, X.xmin, 1, X.xmax, 1, 'aux-g');
label(s, 0, 1, 'a', 'lbl-gold', 'end', -6, +4);   // glyph 91..100, ligne à 96

// ✓ l'étiquette passe au-dessus de la droite
label(s, 0, 1, 'a', 'lbl-gold', 'end', -6, -6);   // glyph 81..90, ligne à 96
```

Règle : une étiquette posée sur une droite horizontale se met **au-dessus** de
la droite (`dy` négatif), jamais à cheval. Vérifier si la droite commence à
l'axe (`seg(s, 0, …)`) : dans ce cas l'étiquette à gauche de l'axe est hors
d'atteinte, et `dy = +4` convient.

### 2. Une barre de mise en évidence posée sur l'axe

`.hl` fait 3,6 px : c'est ce qu'il faut pour qu'un intervalle se voie, et c'est
beaucoup trop pour un axe (1,3 px). Écrasé sur l'axe, le trait paraît noir et
l'épais ; le lecteur croit à un axe mal réglé, pas à un intervalle marqué.

```js
// ✗ l'axe des ordonnées devient une barre sombre
seg(s, 0, m, 0, M, 'hl');
// ✓ barre de 9 px À CÔTÉ de l'axe, du côté extérieur au tracé
segPx(s, 0, m, 0, M, 'hl', -9, 0);
```

Décaler aussi les `hl-tick` de fin d'intervalle du même nombre de pixels, et
éloigner d'autant les étiquettes (`m`, `M`) pour ne pas les confondre avec la
barre.

### 3. Un domaine qui ne contient pas les axes

Les axes se dessinent en `x = 0` et `y = 0` ; le repère, lui, se règle sur le
**domaine**. Si le domaine ne contient pas zéro, l'axe tombe hors du papier et
le repère paraît décalé.

```js
// ✗ domaine [0,3 ; 2,1] : l'axe des ordonnées (x = 0) n'est plus dans le papier
const X = { xmin: 0.3, xmax: 2.1 };
// ✓ domaine élargi pour englober l'axe, même si la courbe ne l'atteint pas
const X = { xmin: -0.25, xmax: 2.1 };
```

De même, prévoir la marge des étiquettes : `m`, `f(a)`, `k` se posent **à
gauche** de l'axe, donc le papier doit commencer plus à gauche — et l'étendue
du trait d'axe (`axis`) doit laisser la pointe de flèche à l'intérieur.

### Le contrôle automatique

```bash
node tmp/check-figures.mjs
```

Le script vérifie désormais que **tout trait de grille ou d'axe reste dans le
`viewBox`**, et que le **papier couvre bien la figure** — pour un panneau unique
comme pour une figure à plusieurs cartes, dont il contrôle aussi l'écart. C'est
ce qui remplace un long coup d'œil sur une capture réduite.

Et le générateur refuse d'écrire un SVG fautif :

```
figure : coordonnée invalide (« NaN ») dans
  <line class="axis" x1="NaN" y1="33" …/>
Vérifier les clés passées à axes()/panel() : {xmin, xmax, ymin, ymax}.
```

Un attribut `NaN` ou `undefined` est **ignoré en silence** par le navigateur :
la figure sort sans axes, sans grille, et rien ne le signale. C'est ce que fait
un appel `axes(s, {...X, ...Y})` où `X = {min, max}` au lieu de
`{xmin, xmax}` — deux clés qui s'écrasent et disparaissent dans le spread.

---

## 10. Créer une figure pas à pas

### Étape 1 — Générer le squelette

```bash
node scripts/svg-tikz-skeleton.mjs --out tmp/ma-figure.svg \
  --xmin -2 --xmax 7 --ymin -1 --ymax 5 \
  --ux 45 --uy 45 --x0 90 --y0 320
```

Options : `--out`, `--w`, `--h`, `--xmin`, `--xmax`, `--ymin`, `--ymax`,
`--ux`, `--uy`, `--x0`, `--y0`, `--pad`.

Le fichier produit contient déjà : papier millimétré, grille, polices
embarquées, feuille de style, pointe de flèche, axes, graduations, nombres et
noms d'axes. Sans `--out`, le SVG est écrit sur la sortie standard.

### Étape 2 — Ajouter la géométrie

Remplacer les blocs `À COMPLÉTER`. Pour une courbe, le plus simple est de
générer les points avec les conversions du § 8 :

```js
const pts = [];
for (let i = 0; i <= 200; i += 1) {
  const x = xmin + (i / 200) * (xmax - xmin);
  pts.push(`${round(px(x))},${round(py(x * x / 2 - 1))}`);
}
// → <path class="curve" d="M … L … L …"/>
```

Préférer `M`/`L`/`C` : **pas de `<polyline>`** (pas d'arrondi de jointure) et
pas d'attributs de tracé inline — tout est dans les classes CSS.

### Étape 3 — Étiqueter selon le § 9

### Étape 4 — Vérifier

```bash
# Générer un squelette complet (polices embarquées, style, axes, graduations)
node scripts/svg-tikz-skeleton.mjs --out tmp/ma-figure.svg --ux 45 --uy 45

# Contrôle d'ensemble : polices, papier, viewBox
node tmp/check-figures.mjs

# Validité XML, balises inattendues, appariement des balises
node tmp/check-svg.mjs public/data/…/ma-figure.svg

# Inventaire des textes (police, taille, couleur, ancre)
node tmp/dump-svg-text.mjs public/data/…/ma-figure.svg

# Inventaire des primitives (lignes, chemins, cercles, épaisseurs)
node tmp/dump-svg-shapes.mjs public/data/…/ma-figure.svg

# Cohérence du contenu (JSON, médias, références de fichiers)
node scripts/validate-content.mjs
```

Puis **mesurer les boîtes englobantes** dans le navigateur : tout élément dont
le `getBBox()` sort du `viewBox` est rogné à l'affichage. C'est la seule façon
fiable de détecter une étiquette qui déborde.

### Étape 5 — Déclarer la figure dans le contenu

```json
"media": {
  "src": "/data/2eme-bac-sc-math/mise-a-niveau/quiz/figures/ma-figure.svg",
  "alt": "Courbe de f avec sa tangente au point A de coordonnées (2 ; 2).",
  "position": "bottom",
  "width": "65%",
  "lazy": false,
  "style": { "border": false, "shadow": false, "rounded": true },
  "caption": "La tangente en $A$ a pour coefficient directeur $f'(2) = 3$.",
  "captionStyle": { "align": "center", "size": "md" }
}
```

`caption` et `captionStyle` **uniquement hors quiz** (§ 12).

**Chemin absolu obligatoire.** `media.src` part directement dans un `<img src>`
et aucun résolveur ne préfixe les chemins relatifs : `"figures/x.svg"`
demanderait `/figures/x.svg` et casserait. Toujours `"/data/<classe>/…"`.

**Positions valides** (type `MediaPosition`) : `top`, `bottom`, `left`,
`right`, `inline`, `inline-right`, `float-left`, `float-right`.
Il n'existe **pas** de valeur `center` : une valeur inconnue retombe sur `top`.

**Média d'un bloc repliable.** Pour `definition`, `theorem`, `property`,
`method`, `corollary`… le média est rendu **à l'intérieur du panneau de
révélation** : la figure reste cachée tant que l'élève n'a pas cliqué. Pour
qu'une figure soit visible d'emblée, la rattacher à un bloc toujours visible
(`text`, `warning`, `remark`, `application`) — c'est le cas des huit figures
de `limites-continuite`.

> **Piège sur `application`.** Ce bloc est toujours visible, mais sa correction
> est repliable : dans un exercice d'application, **`position: "bottom"` cache la
> figure jusqu'à la correction**. Utiliser `top` (ou `float-*`) pour une figure
> d'énoncé — c'est ce que font les figures de `limites-continuite`. Détails :
> `docs/GUIDE_IMAGES.md`, « Cas particulier : bloc `application` ».

**Largeur proportionnelle au `viewBox`.** Toutes les figures d'une même fiche
doivent avoir la même échelle apparente. `width` s'applique à une colonne de
largeur fixe : il faut donc `width % = largeur du viewBox × k`, avec
**k = 0,1468 %/px** (calibré pour une colonne de 700 px : les libellés de 13 px
y sont alors rendus à 13 px), **plafonné à 100 %** — une figure à trois
panneaux est large, on ne peut pas la réduire sans perdre les libellés.

```js
const width = Math.min(100, viewBoxW * 0.1468).toFixed(0) + '%';
```

| Figure | viewBox | width |
| --- | --- | --- |
| `arctan-graphe` | 440 | 65 % |
| `continuite-tvi-existence` | 440 | 65 % |
| `continuite-image-segment` | 460 | 68 % |
| `continuite-tvi-non-unicite` | 460 | 68 % |
| `continuite-reciproque-symetrie` | 470 | 69 % |
| `continuite-prolongement` | 560 | 82 % |
| `racines-n-iemes-parite` | 740 | 100 % (plafonné) |
| `continuite-trois-types` | 780 | 100 % (plafonné) |

Sans cette règle, une figure à petit `viewBox` affiche des libellés 40 % plus
gros que sa voisine — le lecteur croit à une incohérence de la figure alors
que c'est celle de la mise en page.

### Remplacer une figure existante

`tmp/restyle-tikz.mjs` reste l'outil de référence pour rejouer la mise au
style des figures `mise-a-niveau`. Il lit les originaux depuis
`tmp/backup-figures/` et réécrit les fichiers de `public/data/…/quiz/figures/` :
il est donc **rejouable** sans ré-embarquer les polices une seconde fois.

---

## 11. Pédagogie — à quoi sert une figure

Une figure n'est pas une décoration : elle **porte une information que le texte
ne peut pas dire aussi vite**. Trois usages, à ne pas mélanger :

1. **Lecture graphique** — asymptote, sens de variation, extremum, limite.
   → Une seule courbe, les repères strictement nécessaires, rien d'autre.
2. **Construction** — tangente et nombre dérivé, déplacement `Δx`/`Δy`.
   → La courbe **et** l'objet construit, ce dernier dans une couleur d'appoint,
   avec les deux déplacements explicitement cotés.
3. **Comparaison de méthodes** — figure d'appui d'une démonstration.
   → Deux objets au plus, jamais trois courbes sans nécessité.

### Règles de lisibilité

- **Une figure = une question.** Si l'élève doit chercher quoi regarder, la
  figure est ratée.
- **Sur mobile, une figure ne dépasse pas ~60 % de la colonne** : au-delà elle
  pousse l'énoncé hors de l'écran.
- **Le trait le plus épais est le sujet.** La courbe (1,8 px) domine toujours
  ses auxiliaires (1,5 px) et la grille (0,7 px).
- **Ne jamais écrire dans la figure ce que l'énoncé dit déjà.** C'est pourquoi
  les figures de quiz n'ont pas de légende (§ 12).
- **Étiqueter, pas commenter** : `C_f`, `A(2 ; 2)`, `T`, `Δ : y = x`. Une
  phrase entière dans une figure ne se lit pas.

### Accessibilité

- `<title>` **obligatoire** dans l'SVG : c'est la description lue par un
  lecteur d'écran, et l'infobulle au survol.
- Le champ `alt` du JSON **décrit la figure et ce qu'elle permet de lire**,
  pas son apparence : « Courbe de f avec une asymptote verticale x = 1 et un
  minimum au point (3 ; 2) ».
- Ne jamais transmettre une information **uniquement** par la couleur : la
  courbe est bleue **et** continue, l'asymptote corail **et** pointillée.

---

## 12. Les légendes — dans le JSON, jamais dans l'image

**Règle fondatrice : aucun mot de prose n'entre dans le SVG.** Une phrase
française dans la figure se compose dans la mauvaise police (les Computer
Modern embarquées n'ont **aucun** caractère accentué, § 4 bis), se traduit mal
et ne peut plus être relue ni corrigée sans régénérer le dessin.

Le commentaire d'une figure vit donc dans le **`caption` du média**, dans le
JSON. La figure ne contient que les étiquettes mathématiques ; la phrase qui
l'explique est composée par l'application.

### Le mécanisme, tel qu'il est câblé

`MediaRenderer.tsx` enveloppe l'image dans un `<figure>` et ajoute, dès que
`caption` est non vide :

```jsx
<figure>
  <div>…<img src={media.src} alt={media.alt} />…</div>
  {caption && (
    <figcaption className="mt-1.5 px-0.5 …text-left">
      <span className="block text-[11px] md:text-xs …">
        <MathRenderer inline content={caption} fontSize="inherit" enableLexicon={false} />
      </span>
    </figcaption>
  )}
</figure>
```

Trois conséquences pratiques :

- la légende est **toujours sous l'image**, quelle que soit `position` — ce
  champ place l'image par rapport au texte du bloc, il n'a aucun effet sur la
  légende ;
- elle est **rendue par `MathRenderer`**, donc **le LaTeX y est pris en charge
  exactement comme dans le contenu** — accents français compris, puisque la
  composition se fait avec les polices de la page ;
- elle est **contrainte à la largeur du média** : une figure à `width: "60%"`
  a une légende de 60 % de colonne, pas davantage.

### LaTeX pris en charge

Les délimiteurs sont ceux de `katexService` :

| Délimiteur | Mode | Usage dans une légende |
| --- | --- | --- |
| `$…$` | inline | **à privilégier** — la légende est une phrase, pas un calcul exposé |
| `\(…\)` | inline | équivalent |
| `$$…$$` | display | possible, mais coupe la phrase : à éviter |
| `\[…\]` | display | idem |

```json
"caption": "En $0$, la limite vaut $1$ alors que $f(0)$ n'existe pas : le trou se comble en posant $f(0)=1$."
```

`enableLexicon={false}` : le lexique n'est **pas** activé dans une légende —
c'est une note de lecture, pas un texte à annoter.

### Style de la légende

```json
"captionStyle": { "align": "left", "size": "md", "italic": false }
```

| Champ | Valeurs | Défaut | Remarque |
| --- | --- | --- | --- |
| `align` | `left`, `center`, `right` | `left` | `left` est la convention typographique d'une légende sous figure |
| `size` | `xs`, `sm`, `md` | `xs` | `xs` = 9-10 px, `sm` = 10-11 px, `md` = 11-12 px |
| `italic` | booléen | `false` | réservé aux citations |

Le défaut `xs` (9-10 px) convient à un titre de figure (« Portrait de
Cantor »). Dès que la légende porte une **phrase pédagogique**, passer à
`"size": "md"` — c'est le réglage retenu pour les huit figures de
`limites-continuite`.

### Répartition du travail : figure contre légende

| À mettre **dans la figure** (`<text>`) | À mettre **dans la légende** (`caption`) |
| --- | --- |
| Étiquettes strictement mathématiques : `x`, `a`, `f(a)`, `𝒞_f`, `Δ : y = x` | Toute phrase, toute phrase avec accents |
| Une lettre, au plus un couple `(x ; y)` | Le sens de ce que l'on voit : « la limite vaut 1 alors que f(0) n'existe pas » |
| Ce que le lecteur doit identifier d'un coup d'œil | Ce qu'il doit comprendre une fois qu'il a vu |

Corollaire : le `caption` **complète** la figure, il ne la **décrit pas** —
la description de l'apparence est le rôle du champ `alt` (accessibilité, § 11).

### Quand une légende est interdite

| Contexte | Légende (`caption`) |
| --- | --- |
| **Quiz** | **Interdite.** L'énoncé pose la question, la figure la fait comprendre. Une légende donnerait la réponse ou ferait doublon. Le champ `captionStyle` associé doit être supprimé avec elle. |
| Exercices | Autorisée si elle apporte une indication que l'énoncé ne donne pas. |
| Fiches de révision | Autorisée — c'est souvent le seul texte d'accompagnement (par exemple les portraits de mathématiciens, ou les huit commentaires de `limites-continuite`). |

`MediaRenderer` teste `{caption && …}` : **omettre le champ** suffit, il ne
rend aucun `<figcaption>` vide.

### Écrire les légendes d'une fiche

Un script idempotent vaut mieux qu'une édition à la main : la table des
légendes est relue à chaque exécution, et la re-sérialisation du JSON est
neutre à l'octet près sur ces fiches.

```powershell
node tmp/set-continuite-captions.mjs --apply   # pose caption, alt, width, captionStyle
node tmp/dump-captions.mjs                     # relit ce qui est réellement enregistré
```

`dump-captions.mjs` vérifie au passage **l'appariement des `$`** (un `$`
orphelin laisserait la fin de la phrase en LaTeX brut à l'écran) et liste les
accents — leur présence dans le JSON est normale, leur présence dans un SVG
serait un défaut.

### Vérifier le LaTeX des légendes

`check-math-katex.mjs` parcourt **toutes** les chaînes du JSON — contenu des
blocs, `title` **et `caption`** — et rend chaque formule avec KaTeX en mode
strict :

```powershell
node tmp/check-math-katex.mjs "public/data/2eme-bac-sc-math/limites-continuite/revisions/fiche_limites_continuite_cours.json"
# formules contrôlées : 437
# échecs             : 0
```

À lancer après toute retouche de légende : une formule invalide ne casse pas
la page, elle s'affiche en rouge au milieu de la phrase.

---

## 13. Pièges rencontrés (et comment les éviter)

| Piège | Symptôme | Correctif |
| --- | --- | --- |
| `font-family: FigMath` **sans `FigMain`** | chiffres et ponctuation dans une police système, **au milieu du mot** | pile `FigMath, FigMain, …serif` (§ 4 bis) |
| Caractère accentué dans la figure | repli police système, jamais présent dans KaTeX | sortir la prose vers `caption` |
| Exposants Unicode `⁻¹` | absents des deux polices | `<tspan class="sup">-1</tspan>` |
| Rythmes de tirets multiples | certaines droites semblent « tirées plus long » | un motif pour les auxiliaires, un pour les repères |
| `media.src` relatif | image cassée (le SPA renvoie `index.html`) | chemin absolu `/data/…` |
| `position: "center"` | retombe silencieusement sur `top` | utiliser une position du type `MediaPosition` |
| Média sur un bloc repliable | la figure reste invisible | la rattacher à un bloc toujours visible |
| `viewBox` mal construit — largeur à `0` | Figure entièrement blanche | Vérifier `viewBox="0 0 W H"` |
| `refX` inférieur à la pointe du `marker` | Flèche rognée, tailles incohérentes entre axes | `refX` = abscisse de la pointe (`10`) + `markerUnits="userSpaceOnUse"` |
| `font-family` inline sur chaque `<text>` | écrase la feuille de style, police incohérente | tout passer par les classes |
| Police non embarquée | Repli silencieux sur Times New Roman | `@font-face` base64 (générateur) |
| Grille plein cadre | Aspect « tableau » | Borner la grille au domaine gradué |
| `<rect>` de fond blanc | Rectangle visible sur fond gris/ivoire | Supprimer le `rect` |
| Contenu mixte perdu au retraitement | `𝒞_f` devient `f` | Préserver la séquence texte + `tspan` |
| Étiquettes de longueurs inégales | deux repères de même rôle n'ont pas la même portée | aligner les extrémités sur le même bord |
| `width` identique pour des `viewBox` différents | tailles de libellés incohérentes d'une figure à l'autre | `width ∝ largeur du viewBox` (§ 10) |
| `$` orphelin dans un `caption` | la fin de la phrase s'affiche en LaTeX brut | apparier les `$` — `node tmp/dump-captions.mjs` |
| `captionStyle` absent sur une phrase | légende en 9 px, illisible | `"captionStyle": { "size": "md" }` (§ 12) |
| `caption` laissé sur un média de quiz | la légende donne la réponse | supprimer `caption` **et** `captionStyle` (§ 12) |
| Prose dans la figure « pour aller plus vite » | accents en police système, phrase non traduisible | sortir la phrase vers `caption` (§ 12) |
| Nom de fonction en italique | la figure écrit *tan*, la légende `tan` : deux graphies dans le même bloc | `class="lbl-* up"` (§ 4 bis) |
| Étiquette posée sur la droite qu'elle nomme | le tireté barre le `a` ou le `k` ; à l'écran, une tache orange | étiquette **au-dessus** de la droite : `dy` négatif (§ 9 bis) |
| Barre `.hl` écrasée sur un axe | l'axe paraît noir et épais, on ne voit plus l'intervalle marqué | barre décalée à côté de l'axe via `segPx` (§ 9 bis) |
| Domaine qui ne contient pas `x = 0` | l'axe des ordonnées tombe hors du papier, le repère paraît décalé | élargir le domaine (§ 9 bis) |
| `axes(s, {...X, ...Y})` avec `X = {min, max}` | les clés `min`/`max` s'écrasent : **axes, grille et panneau absents**, sans erreur | `{xmin, xmax}` / `{ymin, ymax}` — le générateur lève une erreur sur `NaN` |
| Prose en Computer Modern | « saut » en romain, la phrase du contenu en sans-serif : deux typographies | `.lbl-t` / `.lbl-u` = `system-ui` (§ 4 ter) |
| Exposant de second rang | `𝒞_f⁻¹` se lit « 𝒞_2 » : sous 7 px, illisible | `.sub`/`.sup` à .8em et non .7/.5 (§ 4 ter) |
| Grille absente | figure nue, aucune échelle : on ne peut ni comparer ni lire π/2 | `axes(…, { grid: step })` (§ 8) |
| Papier absent ou trop court | bande transparente d'un côté de la figure, que rien ne signale | `paper()` couvrant `0..w` × `0..h` (§ 7) |

---

## 14. Fichiers de référence

| Chemin | Rôle |
| --- | --- |
| `scripts/svg-tikz-skeleton.mjs` | Génère un squelette complet, polices embarquées |
| `scripts/svg-tikz-style.mjs` | Source unique : palette, feuille de style, marqueur, conversions, primitives (`panel`, `grid`, `segPx`, `axes`) |
| `scripts/generate-continuite-figures.mjs` | Les huit figures de la fiche `limites-continuite` (générateur rejouable) |
| `scripts/generate-complex-tikz.mjs` | Pipeline TikZ/.tex pour les figures de complexes |
| `tmp/restyle-tikz.mjs` | Rejoue la mise au style des figures `mise-a-niveau` |
| `tmp/set-continuite-captions.mjs` | Pose les `caption` / `alt` / `width` / `captionStyle` des huit figures |
| `tmp/dump-captions.mjs` | Relit les légendes enregistrées, vérifie l'appariement des `$` |
| `tmp/check-math-katex.mjs` | Valide **toutes** les formules du JSON, `caption` compris |
| `tmp/check-figures.mjs` | Polices, papier, couverture du `viewBox`, écarts entre cartes |
| `tmp/check-svg.mjs` | Validité XML, balises, appariement |
| `tmp/caption-preview/` | Banc de contrôle visuel : markup de `MediaRenderer` + KaTeX local, alimenté par le JSON réel |
| `tmp/dump-svg-text.mjs` | Inventaire des étiquettes |
| `tmp/dump-svg-shapes.mjs` | Inventaire des primitives et épaisseurs |
| `scripts/validate-content.mjs` | Validation globale du contenu |
| `src/components/MediaRenderer.tsx` | Rendu des figures (largeur, légende, positions) |
| `public/data/2eme-bac-sc-math/mise-a-niveau/quiz/figures/` | Figures de référence déjà mises au style |
