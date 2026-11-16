# Guide de Gestion des Images

## Structure des Répertoires

### Organisation Actuelle

```
public/data/
  1ere-bac-sc-math/
    pictures/          # Images pour cette classe
  2eme-bac-sc-ex/
    pictures/
      ex_4_courbe.png  # Exemple: courbe exponentielle
  2eme-bac-sc-math/
    pictures/
  tronc-commun-sc/
    pictures/
```

## Conventions de Nommage

### Pour les Exercices
- **Format** : `ex_[numero]_[description].png` ou `.jpg`
- **Exemples** :
  - `ex_4_courbe.png` - Graphique de fonction
  - `ex_12_triangle.png` - Figure géométrique
  - `ex_7_tableau.jpg` - Tableau de valeurs

### Pour les Révisions
- **Format** : `[concept]_[type].png`
- **Exemples** :
  - `barycentre_schema.png`
  - `trigo_cercle.png`
  - `derivee_tableau.png`

## Optimisation des Images

### Formats Recommandés
- **PNG** : Graphiques, diagrammes, schémas (avec transparence)
- **JPG** : Photos, images complexes

### Taille et Qualité
- **Résolution** : 72-96 DPI (suffisant pour écran)
- **Largeur max** : 1200px
- **Poids max** :
  - Schémas/graphiques : 150 KB
  - Images complexes : 200 KB

### Outils d'Optimisation
```bash
# ImageMagick (réduire taille)
magick input.png -resize 1200x -quality 85 output.png

# TinyPNG (compression)
# https://tinypng.com/
```

## Utilisation dans les Fichiers JSON

### Dans les Exercices

```json
{
  "id": "q2",
  "content": "À partir de la représentation graphique...",
  "media": {
    "src": "/data/2eme-bac-sc-ex/pictures/ex_4_courbe.png",
    "position": "float-right",
    "width": "43%",
    "alt": "Courbe représentative de g",
    "caption": "Courbe de la fonction $g$",
    "style": {
      "shadow": "md",
      "rounded": true,
      "border": true
    }
  }
}
```

### Dans les Révisions

Il n'existe **pas** de bloc `"type": "image"` : une figure est le champ `media`
d'un bloc existant.

```json
{
  "type": "text",
  "content": "Le barycentre $G$ se construit comme suit.",
  "media": {
    "src": "/data/1ere-bac-sc-math/pictures/barycentre_schema.png",
    "alt": "Schéma du barycentre",
    "width": "60%",
    "caption": "Construction du barycentre G"
  }
}
```

### Image écrite dans le texte : `\image`

Quand la figure doit apparaître **à un endroit précis du texte** (entre deux
phrases, au milieu d'un corrigé, dans un document imprimé), la commande
`\image[options]{src}{légende}` se place directement dans le `content`. Le
placement s'inspire de Word :

| Besoin (Word) | Commande |
| --- | --- |
| Centrée sur sa ligne, 60 % de la largeur | `\image[width=60%,align=center]{src}` |
| Texte qui coule autour, à droite (*Carré*) | `\image[width=35%,position=float-right]{src}` |
| Dans la ligne (*Aligné sur le texte*) | `\image[position=inline,height=1.2em]{src}` |
| Taille exacte en centimètres | `\image[width=6cm,height=4cm]{src}` |
| Distance au texte, bordure | `\image[float=left,width=30%,gap=6mm,border]{src}` |
| Avec légende (LaTeX permis) | `\image[50%]{src}{Courbe de $f$}` |

```json
"content": "On lit le signe sur la courbe.\\par\\image[width=60%,align=center]{/data/2eme-bac-sc-math/pictures/courbe_f.png}{Courbe de $f$ sur $[0,3]$}"
```

Options : `width` / `height` (ou `w` / `h`), `size` (`tiny` `small` `medium`
`large` `full`), `align` (`left` `center` `right`), `position` (`inline`
`float-left` `float-right` en plus), `float`, `wrap`, `valign`, `gap`,
`rotate`, `fit`, `border`, `shadow`, `rounded`, `alt`. Référence complète, règles
de sécurité de `src` et limites (pas de « derrière / devant le texte ») :
`docs/guide_latex_revision.md` § 11, « Images dans le texte ».

- `\image` ne gère ni `anchor` ni `targetItem` : pour rattacher une figure à un
  énoncé, à la correction ou à une question de liste, rester sur `media`.
- Dans un document imprimé, une figure sans taille est plafonnée (≈ 78 mm de
  large en 1 colonne, 72 mm en 2 colonnes, 58 mm de haut) ; dès que `width` ou
  `height` est donné, la taille demandée est respectée, bornée à la colonne.

## Positions d'Image Disponibles

Type `MediaPosition` — la valeur exacte compte, toute valeur inconnue retombe
sur `top` **sans avertissement** :

- **`top`** : au-dessus du texte du bloc (défaut)
- **`bottom`** : sous le texte du bloc
- **`left`** : à gauche du texte
- **`right`** : à droite du texte
- **`inline`** : dans le flux du texte (en ligne)
- **`inline-right`** : en ligne, alignée à droite
- **`float-left`** : flottante à gauche (exercices)
- **`float-right`** : flottante à droite (exercices)

> **Il n'existe pas de valeur `center`.** Pour centrer une figure, la centrer
dans l'image elle-même et utiliser `bottom` ou `top` : le média est déjà
centré horizontalement dans sa colonne.

### Cas particulier : bloc `application` (« Exercice d'application »)

Un exercice d'application se lit en deux temps : l'énoncé/la question
(`\qst{…}`), puis la **correction repliable**. La position de l'image y prend
donc un sens pédagogique, et l'éditeur PC (studio) affiche des libellés adaptés :

| Position | Emplacement réel |
| --- | --- |
| `top` | au-dessus de l'énoncé |
| `left` / `right` | colonne à côté de l'énoncé |
| `float-left` / `float-right` | habillage dans l'énoncé |
| `inline` / `inline-right` | dans la question |
| `bottom` | **en bas de la correction** — l'image n'apparaît qu'avec la correction |

- Une seule image par bloc : le premier média porte la position, `additionalImages`
  ne s'ajoute pas aux emplacements sémantiques.
- La **taille est adaptée automatiquement** : dans l'énoncé/la question la figure
  reste une vignette (habillage ≈ 30 %, colonne ≈ 28 %, image empilée plafonnée),
  pour ne pas écraser le texte de l'exercice ; en bas de correction elle reprend
  la taille pleine d'une figure de cours.
- Une `width` explicite dans le JSON **gagne toujours** sur l'adaptation
  automatique : n'en mettre une que si la figure l'exige.
- Poser une image sur un bloc d'application **ne désactive plus** le repli de
  correction : « Commençons la correction » reste disponible.

### Association explicite : `anchor` (`lead` ou `content`)

Depuis l'éditeur PC (studio), le bouton **Images** de chaque bloc ouvre une
modale unique qui demande d'abord à quoi la figure s'**associe**, puis où elle
se place. Deux zones existent, et seulement quand le bloc se lit en deux temps :

| Zone | Blocs concernés | Visibilité |
| --- | --- | --- |
| `lead` — énoncé / titre | `application`, `property`, `definition`, `theorem`, `proposition`, `method`… | **toujours visible**, même replié |
| `content` — contenu | idem | apparaît **avec** la correction ou la réponse révélée |

```json
{
  "type": "property",
  "title": "Que peut-on lire sur cette figure ?",
  "content": "La fonction admet un maximum local égal à $2$ en $x=1$.",
  "media": {
    "src": "/data/…/pictures/lecture_graphique.png",
    "anchor": "lead",
    "position": "right",
    "alt": "Courbe à lire"
  }
}
```

- **`anchor` est facultatif et rétrocompatible.** Absent, la règle historique
  s'applique : dans un exercice d'application `bottom` visait la correction et le
  reste l'énoncé ; dans un bloc révélable, la figure allait avec le contenu. Les
  fiches déjà publiées ne bougent donc pas — et les tests
  (`mediaGallery.test.ts`, `CourseBlock.mediaAnchor.test.ts`) le verrouillent.
- **Pourquoi associer.** Une figure servant à *répondre* (courbe à lire, tableau
  à compléter) doit être en `lead` : sans cela, l'élève ne la voit qu'après avoir
  révélé la réponse. Une figure qui *illustre la réponse* reste en `content`.
- Les blocs d'un seul tenant (`exploration` — « Activité », `example`, `warning`,
  `text`, `intro`, `proof`…) n'ont qu'une zone : la modale n'affiche pas
  l'association et la figure reste visible avec le bloc.
- Le réglage tablette « Afficher les titres des blocs » décoché supprime
  l'en-tête : les figures `lead` sont alors rassemblées avec le contenu pour
  qu'aucune ne disparaisse.
- Dans un **exercice** (fichier `exercises/*.json`), la même modale nomme le nœud
  visé — « Images — question 3 › sous-question c » — et la figure reste collée à
  sa ligne dans la liste numérotée.

### Ancrer une figure sur une **question de la liste** : `anchor: "item"`

Un bloc d'application ou de propriété porte très souvent une **liste numérotée**
(`\begin{enumerate}\item …`). La modale propose alors une troisième association,
« **Avec une question de la liste** » : on choisit la question dans la liste
(elle est affichée telle que l'élève la lira) et la figure se pose **au-dessus**
ou **en dessous** d'elle, au milieu de la liste.

```json
{
  "type": "application",
  "content": "\\qst{Reprendre les étapes.}\\par\\smallskip \\begin{enumerate}\\item On factorise.\\item On simplifie.\\item On conclut.\\end{enumerate}",
  "media": {
    "src": "/data/…/pictures/courbe.png",
    "anchor": "item",
    "targetItem": 3,
    "position": "top",
    "alt": "Figure à lire avant l'étape 3"
  }
}
```

- `targetItem` est le **rang de la question** (1-based) dans la liste du bloc.
- `position: "top"` = au-dessus de cette question ; `"bottom"` = en dessous.
- La liste est **coupée en deux** autour de la figure et la **numérotation
  continue** (`1.` `2.` — figure — `3.` `4.`) : la seconde moitié reprend au bon
  rang (`listStart` du parseur), elle ne repart pas à `1.`.
- Si la question visée n'existe plus (liste remaniée), la figure est rendue
  autour du contenu au lieu d'être perdue : rien ne disparaît silencieusement.
- Une liste **imbriquée** ne compte pas : seuls les items de premier niveau sont
  proposés, comme questions.
- Le mécanisme vaut pour tous les types porteurs de liste (`application`,
  `property`, `method`, `warning`, `exploration`…). Pour un bloc à zone unique,
  l'association « question de la liste » devient le second choix de la modale.

## Largeurs Recommandées

- **Petits schémas** : `30%` - `40%`
- **Graphiques moyens** : `43%` - `50%`
- **Grandes illustrations** : `60%` - `80%`
- **Pleine largeur** : `100%`

### Cas particulier des figures SVG

Une figure SVG embarque ses libellés en **pixels** : sa largeur d'affichage
détermine donc la taille apparente du texte intérieur. Pour que deux figures
d'une même fiche aient des libellés de même taille, il faut
`width % = largeur du viewBox × 0,1468`, plafonné à `100 %`.

Voir `docs/GUIDE_SVG_TIKZ.md` § 10, tableau des huit figures de
`limites-continuite`.

## Légendes

```json
"caption": "La tangente en $A$ a pour coefficient directeur $f'(2) = 3$.",
"captionStyle": { "align": "center", "size": "md" }
```

- Le **LaTeX** (`$…$`) fonctionne dans la légende : c'est `MathRenderer` qui la
  compose, avec les polices de la page. Les accents y sont donc normaux.
- `captionStyle.align` : `left` (défaut), `center`, `right`.
- `captionStyle.size` : `xs` (défaut, 9-10 px), `sm`, `md` (11-12 px). Mettre
  `md` dès que la légende est une phrase.
- **Interdite dans les quiz** : elle donne la réponse. Autorisée en `revisions/`
  et `exercises/`.

## Figures vectorielles (SVG / TikZ)

Pour un schéma mathématique — courbe, tangente, asymptote, tableau — utiliser
le guide dédié :

> **`docs/GUIDE_SVG_TIKZ.md`** — créer une figure SVG indiscernable d'une sortie
> TikZ : polices Computer Modern embarquées, palette du projet, pointe de flèche
> `stealth`, grille bornée, aire de tracé, placement des étiquettes, légendes
> JSON, et les quatre commandes de validation.

Ce guide prend en charge les pièges spécifiques au rendu dans `<img>` (polices
système, accents absents, exposants Unicode) qu'un SVG exporté ou écrit à la
main rencontre systématiquement.

## Migration des Images Existantes

Si vous trouvez des images dans l'ancienne structure `public/pictures/`, les déplacer :

```bash
# Depuis
public/pictures/2eme-bac-sc-ex/exponentielles/ex_4_courbe.png

# Vers
public/data/2eme-bac-sc-ex/pictures/ex_4_courbe.png
```

Puis mettre à jour le JSON :
```json
"src": "/data/2eme-bac-sc-ex/pictures/ex_4_courbe.png"
```

## Checklist avant Ajout d'Image

- [ ] Image optimisée (< 200 KB)
- [ ] Nom de fichier descriptif et cohérent
- [ ] Placée dans le bon dossier `pictures/`
- [ ] Référence correcte dans le JSON
- [ ] Texte alternatif (`alt`) descriptif
- [ ] Légende (`caption`) si nécessaire — **jamais dans un quiz**
- [ ] Position et largeur appropriées

Pour une **figure SVG** (schéma mathématique), suivre en plus la checklist du
§ 0 de `docs/GUIDE_SVG_TIKZ.md` et lancer :

```bash
node tmp/check-figures.mjs <dossier-des-figures>
```

## Accessibilité

### Texte Alternatif (obligatoire)
```json
"alt": "Courbe décroissante de la fonction exponentielle négative"
```

### Légendes (recommandé)
```json
"caption": "Figure 1 : Représentation graphique de $f(x) = -e^x$"
```

## Troubleshooting

### Image ne s'affiche pas
1. Vérifier le chemin : `/data/[classe]/pictures/[nom].png`
2. Vérifier l'extension (sensible à la casse)
3. S'assurer que le fichier existe physiquement

### Image trop grande
1. Réduire la largeur dans le JSON : `"width": "40%"`
2. Optimiser le fichier source

### Image floue
1. Vérifier la résolution source (min 72 DPI)
2. Ne pas agrandir au-delà de la taille originale

### Figure invisible en grand (image sans fond)
Une figure exportée **sans fond** (traits sombres sur du transparent) disparaîtrait
sur le fond sombre de la visionneuse plein écran. L'application le détecte seule :
elle échantillonne l'image (fond mesuré par l'alpha, couleur des traits mesurée sur
les pixels partiellement opaques) et pose **une plaque claire** derrière la figure
quand c'est nécessaire.

- Aucun réglage à prévoir : une figure opaque (photo, scan déjà blanc) n'est pas
  modifiée.
- Une figure réellement claire (traits blancs) reste sur le fond sombre — une
  plaque claire la rendrait invisible à son tour.
- Rien à faire côté JSON : l'analyse est faite une fois par image, à l'affichage
  de la vignette. Pour forcer un rendu identique partout, exporter la figure avec
  son fond blanc.
