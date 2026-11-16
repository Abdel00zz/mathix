# Guide de Création d'Exercices JSON

---

## Règle d'Or : Fidélité Absolue

> **Le fichier JSON doit être une transcription exacte et structurée du document source (PDF, image).**
>
> - **INTERDIT** : Inventer, ajouter, supprimer ou reformuler le contenu des questions et énoncés.
> - **OBLIGATOIRE** : Les solutions présentes dans la source doivent être **transformées en indices pédagogiques** (`hint`), jamais supprimées.

---

## Structure JSON Générale

```json
{
  "id": "ex-[chapitre]-[numero]",
  "topic": "Thème - Sous-thème",
  "requiresRedaction": true,
  "context": "Énoncé introductif global de l'exercice (si applicable).",
  "questions": [ ... ]
}
```

---

## Structure d'une Question

### Règle de fidélité au contenu

> **Transcrire mot pour mot** le texte de la source. Ne pas reformuler, ne pas résumer, ne pas compléter.
> Seule la mise en forme change : le texte brut devient du JSON + LaTeX.

### Règle d'adaptation des numérotations

La source peut utiliser des conventions variées : `1)`, `1.`, `I.`, `a)`, `a.`, `•`, etc.
**Il faut adapter intelligemment** ces conventions au système d'`id` JSON, sans trahir la hiérarchie logique de la source.

| Source | `id` JSON |
|---|---|
| Partie `I.` puis `II.` | `"p1"`, `"p2"` avec `"type": "partie"` — voir la section *Les Parties* |
| Question `1)` | `"q1"` (ou `"p1q1"` si l'exercice a des parties) |
| Sous-partie `a)` de la question `2` | `"q2a"` (ou `"p1q2a"`) |
| Question sans numéro (exercice court) | `"q1"`, `"q2"`... en suivant l'ordre |


> **Le principe** : l'`id` reflète la position réelle dans la source. Un élève qui lit le PDF et le JSON doit retrouver immédiatement à quoi correspond chaque `id`.

---

### Cas 1 — Question simple (sans sous-parties)

```json
{
  "id": "q1",
  "content": "Calculer $f(0)$ et $f(1)$.",
  "hint": "..."
}
```

### Cas 2 — Question avec introduction + sous-parties

Si le numéro de question est suivi d'un texte **avant** les sous-parties :

```json
{
  "id": "q2",
  "content": "Soit $f(x) = x^2 - 3x + 2$.",
  "subQuestions": [
    { "id": "sq2a", "content": "Calculer $f(0)$ et $f(1)$.", "hint": "..." },
    { "id": "sq2b", "content": "Factoriser $f(x)$.", "hint": "..." }
  ]
}
```

### Cas 3 — Question conteneur (sans texte propre)

Si le numéro de question est **directement** suivi des sous-parties, sans texte intermédiaire, le `content` est une chaîne **vide** :

```json
{
  "id": "q3",
  "content": "",
  "subQuestions": [
    { "id": "sq3a", "content": "Déterminer les réels $a$, $b$ et $c$.", "hint": "..." }
  ]
}
```

### Cas 4 — Sous-sous-parties `i.`, `ii.` → à aplatir

> ⚠️ **Le rendu s'arrête à 2 niveaux.** Une sous-partie `b)` qui contient elle-même des `i.`, `ii.` ne peut pas être imbriquée : elle doit être aplatie au niveau `subQuestion`.

```json
{
  "id": "q2",
  "content": "Soit $(u_n)$ la suite définie par …",
  "subQuestions": [
    { "id": "q2a", "content": "Montrer que $u_n > 0$ pour tout $n$.", "hint": "..." },
    { "id": "q2b", "content": "En déduire la convergence de la suite.", "hint": "..." }
  ]
}
```

Voir la section *Profondeur Maximale : 2 Niveaux*.

> ❌ Ne jamais omettre `content`. Ne jamais l'inventer si la source n'en a pas. Ne jamais reformuler l'énoncé.

---

## Les Parties (`type: "partie"`)

Quand la source découpe l'exercice en **Partie 1 / Partie 2**, **I- / II-**, **A / B**… il ne faut **jamais** écrire ce libellé dans un `content`. Le moteur possède un bloc dédié.

### Règle fondamentale

> Une partie est un **bloc séparateur autonome**, frère des questions — **jamais** un conteneur qui les enveloppe.

```json
{
  "questions": [
    { "id": "p1", "type": "partie", "content": "On considère dans $\\mathbb{C}$ l'équation $(E):z^2-2iz+\\alpha=0$." },
    { "id": "p1q1", "content": "", "subQuestions": [ … ] },
    { "id": "p1q2", "content": "…", "hint": "…" },

    { "id": "p2", "type": "partie", "content": "Le plan complexe est rapporté à un repère orthonormé direct." },
    { "id": "p2q1", "content": "", "subQuestions": [ … ] }
  ]
}
```

Ce que le moteur fait automatiquement :

| Élément | Comportement |
|---|---|
| Le libellé « Partie A », « Partie B »… | **Généré** à partir de l'ordre des blocs `partie` |
| La couleur du badge | Attribuée automatiquement (6 couleurs : A→F) |
| La numérotation des questions | **Remise à 1** après chaque bloc `partie` |
| Les labels `a.` `b.` `c.` | Générés à partir de l'ordre des `subQuestions` |

### Conséquences directes

- ❌ `"content": "Partie 1 : On considère…"` → le libellé apparaîtrait **deux fois**.
  ✅ `"content": "On considère…"` avec `"type": "partie"`.
- ❌ `"content": "I- Soit $a$ un complexe…"` → idem, retirer le `I-`.
- ❌ Ne jamais écrire `1)`, `2)`, `a)`, `b.` dans un `content` : la numérotation est calculée.
- Un bloc `partie` **n'a pas** de `subQuestions` et **pas** de `hint`.
- Si la source n'écrit qu'un titre nu (« Partie 1 » sans texte), mettre `"content": ""` : seul le badge s'affiche.

### Convention d'`id` avec parties

Les `id` doivent rester **uniques dans tout le fichier** (la clé de progression de l'élève est `exerciseId-questionId-subQuestionId`).

| Contexte | Question | Sous-question |
|---|---|---|
| Exercice **sans** parties | `q1`, `q2`… | `q1a`, `q1b`… |
| Exercice **avec** parties | `p1q1`, `p1q2`, `p2q1`… | `p1q1a`, `p2q1b`… |

> Deux questions nommées `q1` dans deux parties différentes **écraseraient mutuellement** la progression de l'élève.

---

## Profondeur Maximale : 2 Niveaux

> ⚠️ **Le rendu interactif s'arrête à `question > subQuestion`. Un troisième niveau est chargé mais jamais affiché — le contenu est silencieusement perdu.**

Une source à trois niveaux (Partie → 1) → a\)) doit donc être **aplatie** : la partie devient un bloc `partie`, le `1)` devient la question, le `a)` devient la sous-question.

❌ **Trois niveaux — le `a)` et le `b)` ne s'afficheront pas :**
```json
{ "id": "p2", "content": "Partie 2 : …", "subQuestions": [
    { "id": "p2_1", "content": "On pose $Z=…$", "subQuestions": [
        { "id": "p2_1a", "content": "Vérifier que…" },
        { "id": "p2_1b", "content": "Montrer que…" }
    ]}
]}
```

✅ **Deux niveaux + bloc partie :**
```json
{ "id": "p2", "type": "partie", "content": "…" },
{ "id": "p2q1", "content": "On pose $Z=…$", "subQuestions": [
    { "id": "p2q1a", "content": "Vérifier que…", "hint": "…" },
    { "id": "p2q1b", "content": "Montrer que…", "hint": "…" }
]}
```

> Le cas `Cas 4` (sous-sous-parties `i.`, `ii.`) n'est acceptable que si la source ne comporte **aucune** partie : la hiérarchie disponible est alors `question > subQuestion`, et les `i.`/`ii.` doivent être fusionnés dans le niveau `subQuestion`.

---

## Champs Optionnels

| Champ | Niveau | Rôle |
|---|---|---|
| `bareme` | sous-question | Barème en points, affiché dans un badge à droite (ex. `0.5`) |
| `examenYear` | exercice | Année de l'examen source (ex. `2024`) |
| `examenSession` | exercice | `"Normale"` ou `"Rattrapage"` |
| `sessionDate` | exercice | Date ISO — active le chronomètre « live » pendant 2 h |
| `media` | exercice / question / sous-question | Figure (voir plus bas) |

> `examenYear` / `examenSession` servent à **conserver la provenance** quand le fichier est renommé (`ex_07.json`) : l'information ne doit jamais vivre uniquement dans le nom du fichier.

---

## Nommage des Fichiers et Manifest

Les fichiers d'un chapitre sont nommés `ex_01.json`, `ex_02.json`… et **classés du plus facile au plus difficile**. L'ordre du tableau `exercises` du manifest est l'ordre d'affichage dans l'application.

```json
{
  "exercises": [
    { "id": "ex-complexes-01", "path": "data/2eme-bac-sc-math/complexes/exercises/ex_01.json" },
    { "id": "ex-complexes-02", "path": "data/2eme-bac-sc-math/complexes/exercises/ex_02.json" }
  ]
}
```

Règles de cohérence :

- `id` du manifest = `ex-[chapitre]-NN`, et le champ `id` **dans** le fichier doit être identique.
- Tout fichier présent dans `exercises/` doit figurer dans le manifest, et inversement — un `path` mort fait échouer le chargement du chapitre.
- `quizCount` du manifest = nombre réel de questions du quiz, et doit correspondre à celui de `public/data/classes/[classe].json`.

---

## Le Champ `context`

Sert à isoler l'énoncé introductif global qui pose le cadre de **tout l'exercice**.

```json
{
  "context": "Soit $f$ la fonction définie sur $]0;+\\infty[$ par $f(x) = x + \\ln x$.",
  "questions": [
    { "id": "q1", "content": "Calculer $\\lim_{x \\to 0^+} f(x)$.", "hint": "..." }
  ]
}
```

> ❌ Ne pas mélanger le contexte global dans le `content` de la première question.

---

## Le Champ `hint` — Philosophie et Rédaction

### Principe fondamental

> **Lire entièrement le JSON de l'exercice avant de rédiger les hints.**
> Le hint doit s'appuyer sur la logique de l'exercice : ce qui a été établi dans les questions précédentes, les résultats intermédiaires déjà construits, les outils déjà introduits.

Un bon hint **oriente la réflexion** sans donner la réponse. Il répond à la question implicite de l'élève : *"Par où est-ce que je commence ?"* ou *"Qu'est-ce que je n'ai pas vu ?"*

### Les 3 niveaux d'intervention

| Situation dans la source | Action à faire |
|---|---|
| Aucun indice, aucune solution | Champ `hint` **vide** — ne rien inventer |
| Un indice partiel donné | Reprendre fidèlement, reformuler si trop direct |
| Une solution complète | **Obligatoire** : transformer en chemin de réflexion pédagogique |

### Ce qu'un hint doit faire

- **Rappeler** un outil ou résultat vu plus tôt dans l'exercice ou le cours.
- **Orienter** vers la bonne approche sans la nommer explicitement.
- **Alerter** sur un piège courant ou une erreur fréquente.
- **Débloquer** l'élève sur la première étape seulement, pas sur toute la résolution.

### Ce qu'un hint ne doit PAS faire

- Donner la réponse finale, même reformulée.
- Dérouler toutes les étapes du calcul.
- Être plus long que nécessaire.

---

## Style des Hints — Direct et Intelligent

Le hint est du **texte brut**, sans commandes spéciales. Pas de `\method`, `\step`, `\tip`, `\conclusion`. Écrire directement en langage naturel, comme un prof qui murmure un conseil à l'élève.

**Règles de style :**
- Une à deux phrases maximum.
- Aller droit au point : quel outil utiliser, ou quelle question précédente exploiter.
- Le LaTeX `$...$` est autorisé pour les formules.
- Ne jamais donner la réponse, même reformulée.

---

## Exemples de Hints — Bons vs Mauvais

### Exemple 1 : Limite en 0⁺ avec logarithme

**Question** : Calculer $\lim_{x \to 0^+} f(x)$ avec $f(x) = x + \frac{1}{2} - \ln x + \frac{1}{2}(\ln x)^2$.

❌ **Trop direct** :
```
"hint": "Quand x→0⁺, ln x → -∞, donc (ln x)² → +∞ et f(x) → +∞."
```

✅ **Bon hint** :
```
"hint": "Quel terme domine quand $x \\to 0^+$ ? Comparez la croissance de $(\\ln x)^2$ et $\\ln x$."
```

---

### Exemple 2 : Question "En déduire" (s'appuyant sur une question précédente)

**Question** : En déduire que $\lim_{x \to +\infty} f(x) = +\infty$.

❌ **Ignore le lien avec la question précédente** :
```
"hint": "x tend vers +∞ et ln x aussi, donc f(x) → +∞."
```

✅ **Bon hint** :
```
"hint": "Reprenez l'expression établie à la question précédente. Quel est le comportement de chaque terme quand $x \\to +\\infty$ ?"
```

---

### Exemple 3 : Démonstration avec identité remarquable

**Question** : Montrer que $f(x) - x = \frac{1}{2}(\ln x - 1)^2$.

❌ **Donne la réponse** :
```
"hint": "Développez ½(ln x - 1)² = ½(ln x)² - ln x + ½ et vous retrouvez f(x) - x."
```

✅ **Bon hint** :
```
"hint": "Calculez $f(x) - x$ directement. Reconnaissez-vous une identité remarquable ?"
```

---

### Exemple 4 : Rappel d'un résultat de cours

**Question** : Montrer que $(C)$ admet une branche parabolique de direction $y = x$.

✅ **Bon hint** :
```
"hint": "Calculez $\\lim \\frac{f(x)}{x}$ puis $\\lim (f(x)-x)$. Rappel : si le quotient tend vers 1 et la différence vers $\\pm\\infty$, c'est une branche parabolique."
```

---

### Exemple 5 : Question de signe / tableau de variations

**Question** : Dresser le tableau de variations de $f$.

✅ **Bon hint** :
```
"hint": "Le signe de $f'(x)$ est celui du numérateur. Utilisez le résultat de la question précédente."
```

---

## Insertion d'Images (Media)

```json
{
  "media": {
    "src": "/data/[classe]/pictures/ex_[numero]_[description].png",
    "type": "image",
    "position": "right",
    "width": "35%",
    "alt": "Description de la figure",
    "caption": "Figure $n°1$",
    "shadow": true,
    "border": true
  }
}
```

Le champ `media` peut se placer :
- Au niveau de l'exercice (dans ou près de `context`) — pour une figure globale.
- Au niveau d'une question ou sous-question — pour une figure spécifique.

**Classes disponibles** : `1ere-bac-sc-math/` · `2eme-bac-sc-ex/` · `2eme-bac-sc-math/` · `tronc-commun-sc/`

**Positions valides** : `top`, `bottom`, `left`, `right`, `inline`,
`inline-right`, `float-left`, `float-right`. Il n'existe **pas** de `center`.

**Légende.** `caption` accepte le LaTeX (`$…$`), et `captionStyle` règle
l'alignement et la taille : `{ "align": "center", "size": "md" }`. Autorisée
dans un exercice, **interdite dans un quiz** (elle donne la réponse).

Pour un **schéma mathématique** (courbe, tangente, asymptote, tableau de
variations), ne pas dessiner un PNG : suivre **`docs/GUIDE_SVG_TIKZ.md`** —
polices Computer Modern embarquées, palette du projet, grille bornée, aire de
tracé, placement des étiquettes, et les commandes de validation.

---

## Mise en forme du texte et impression

Les champs `content`, `hint` et `correction` acceptent les commandes de mise en forme du moteur : surlignage (`\hl{…}`, `\hlyellow{…}`, `\hlgreen{…}`…), colonnes (`\begin{columns}[2]…\end{columns}`, `\column`, `\columnbreak`) et images dans le texte (`\image[width=50%,align=center]{src}{légende}`). Référence complète : `guide_latex_revision.md` § 11 et `GUIDE_IMAGES.md`.

> La règle de fidélité reste première : ces commandes servent à restituer la mise en page de la source (mot surligné, énoncé en colonnes, figure placée dans le texte), jamais à embellir.

**Impression (Studio › Imprimer).** Le préréglage **Correction devoir maison** active les corrections et met le contenu sur **2 colonnes** avec filet central ; l'en-tête reste normal, pleine largeur, au-dessus des colonnes. Les autres préréglages (*Fiche d'exercices*, *Devoir surveillé*, *Compact 2 colonnes*) restent inchangés. Dans un document déjà en 2 colonnes, ne pas ajouter de `\begin{columns}` : un `columns` en flux s'y replie sur une colonne.

---

## Conversion LaTeX — Référence Rapide

| Source | JSON |
|---|---|
| A(-3 ; 1) | `$A(-3;\,1)$` |
| vecteur AB | `$\\overrightarrow{AB}$` |
| x² | `$x^2$` |
| √x | `$\\sqrt{x}$` |
| fraction a/b | `$\\frac{a}{b}$` |
| ≤ ≥ | `$\\leq$` · `$\\geq$` |
| → (limite) | `$\\to$` |
| ∈ | `$\\in$` |
| ∞ | `$\\infty$` |
| ]0 ; +∞[ | `$]0;+\\infty[$` |
| f'(x) | `$f'(x)$` |
| lim x→0⁺ | `$\\displaystyle\\lim_{x \\to 0^+}$` |
| intégrale | `$\\displaystyle\\int_a^b$` |

---

## Validation Automatique

La checklist ci-dessous est **vérifiée par un script** — ne pas la dérouler à la main :

```bash
npm run validate:content
```

Il parcourt `public/data` en entier (65 chapitres, ~490 exercices, < 1 s) et sort en code 1 dès la première erreur. Il tourne aussi automatiquement avant `npm run build` (`prebuild`) : **une erreur de contenu casse le build**, elle ne peut plus partir en production.

### Ce qu'il détecte

Toutes ces pannes ont un point commun : elles ne provoquent **aucune erreur visible** à l'exécution. L'application affiche simplement moins de contenu que prévu, ou le mauvais.

| Erreur (bloquante) | Conséquence si elle passe |
|---|---|
| manifest → fichier inexistant | le chapitre se charge **vide** |
| fichier orphelin | exercice écrit mais **jamais affiché** |
| id manifest ≠ id fichier | incohérence de référence |
| hiérarchie à 3 niveaux | sous-questions **invisibles** à l'écran |
| ids dupliqués | deux questions **partagent la progression** de l'élève |
| `quizCount` faux | badge du tableau de bord incorrect |

| Avertissement | Conséquence |
|---|---|
| libellé « Partie 1 : » en dur | le libellé s'affiche **en double** |
| numérotation manuelle `1)` `a)` | doublon avec la numérotation générée |
| bloc `partie` avec sous-questions | l'imbrication est perdue au rendu |
| question vide | ne produit rien à l'écran |
| id de chapitre partagé entre classes | tout filtrage sur `chapterId` **doit** aussi filtrer sur `classId` |

### Filet de sécurité au rendu

`ExerciseEngine` **remonte** automatiquement au niveau supérieur toute sous-question imbriquée trop profond, plutôt que de la laisser disparaître, et le signale en console en développement. C'est un filet, pas la forme attendue : le script reste la référence, et la donnée doit être corrigée à la source.

> ⚠️ Le dernier point du tableau des avertissements n'est pas corrigeable côté donnée : `complexes`, `logique`, `limites`… existent légitimement dans plusieurs classes. C'est le **code** qui doit toujours croiser `classId` et `chapterId` — un `id` de chapitre n'est unique qu'à l'intérieur d'une classe.

---

## Checklist Avant Validation

### Mise en page

- [ ] Chaque « Partie » de la source est un bloc `{ "type": "partie" }` **frère** des questions.
- [ ] Aucun `content` ne commence par `Partie 1 :`, `I-`, `II-`, `A)`…
- [ ] Aucun `content` ne contient de numérotation manuelle (`1)`, `a.`, `•`).
- [ ] Aucune hiérarchie à 3 niveaux : tout est aplati en `question > subQuestion`.
- [ ] Les `id` sont uniques dans tout le fichier (`p1q1a` et non `q1a` répété d'une partie à l'autre).
- [ ] Le fichier est nommé `ex_NN.json` à sa place dans l'ordre de difficulté, et le manifest est à jour.

### Contenu

- [ ] J'ai lu l'intégralité de l'exercice avant de rédiger les hints.
- [ ] Tout le contenu est une transcription exacte de la source (pas d'invention).
- [ ] La règle `content` vs `subQuestions` est respectée (`""` si conteneur).
- [ ] L'énoncé principal est dans `context`, pas dans `q1.content`.
- [ ] Aucune solution brute n'a été supprimée — toutes reformulées en hint pédagogique.
- [ ] Les hints orientent la réflexion sans donner la réponse.
- [ ] Les hints exploitent les résultats des questions précédentes quand c'est pertinent.
- [ ] Toutes les formules sont en LaTeX `$...$` ou `$$...$$`.
- [ ] Les `id` reflètent fidèlement la hiérarchie et numérotation de la source (adaptation intelligente).
- [ ] Le texte des `content` est copié mot pour mot — aucune reformulation.