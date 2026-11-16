# GUIDE DES MACROS — LaTeX pour Fiches de Révision
### Référence complète : 181 macros, usage par type de bloc, patterns pédagogiques

> **Ce guide est le compagnon technique du `GUIDE_MASTER_REVISION.md`.**
> Le GUIDE_MASTER définit *quoi* écrire et *comment* l'organiser.
> Ce guide définit *avec quels outils* l'écrire et *comment* le rendre lisible.
> Avant d'écrire la moindre formule, lire les deux guides.

---

## 0. Posture — Pourquoi ce guide existe

**Le problème** : une fiche de révision peut être mathématiquement irréprochable et visuellement illisible. Lignes collées, formules trop petites, blanks au mauvais endroit, vecteurs mal notés, espacement absurde.

**La solution** : 181 macros organisées en familles, chacune avec un contexte d'usage précis. Chaque macro résout un problème visuel ou pédagogique concret.

**Public** : le robot de traitement et tout contributeur qui écrit du JSON pour l'application mathplus.

---

## 1. Architecture du Rendu — Comprendre avant d'écrire

### Les deux moteurs

Tout `content` JSON traverse **deux moteurs** distincts, dans cet ordre :

| Étape | Moteur | Ce qu'il traite | Fichier source |
|:------|:-------|:----------------|:---------------|
| 1 | **Parser textuel** | `\textbf{}`, `\blank{}`, `\question{}`, `\itemsize{}`, `\calcbtn{}`, `\par` | `utils/parser/tokenProcessor.ts` |
| 2 | **KaTeX** | Tout entre `$...$` ou `$$...$$` : formules, `\frac`, `\overrightarrow`, `\boxed` | `services/katexService.ts` |

**Conséquence** : `\textbf{mot}` est du texte pur (moteur 1). `$\textbf{mot}$` est du math KaTeX (moteur 2). Le rendu est **différent**. Utiliser le bon contexte.

### L'injection automatique — `\arraystretch`

Le composant `MathRenderer.tsx` injecte automatiquement :

| Mode | Préfixe injecté | Effet |
|:-----|:----------------|:------|
| Display `$$...$$` | `\def\arraystretch{1.5}` | Espacement vertical 1.5× dans `align*`, `array`, `cases` |
| Inline `$...$` | `\def\arraystretch{1.2}` | Espacement vertical 1.2× (discret) |

> **RÈGLE ABSOLUE** : Ne JAMAIS écrire `\def\arraystretch{...}` dans le JSON.
> Double définition = crash KaTeX. Le rendu affiche le code brut au lieu de la formule.

### Tailles CSS dans les blocs `application`

| Élément | Valeur | Source |
|:--------|:-------|:-------|
| Texte de base | `line-height: 1.62` | `.revision-application-content .math-renderer` |
| KaTeX inline | `font-size: 1.05em` | `.revision-application-content .katex` |
| KaTeX display | `font-size: 1.15em` | `.revision-application-content .katex-display > .katex` |
| Marge display haut | `0.5rem` | `.revision-application-content .katex-display` |
| Marge display bas | `0.65rem` | `.revision-application-content .katex-display` |

---

## 2. L'Échappement JSON — La source de 80% des bugs

### La règle d'or

Tout `\` LaTeX doit être **doublé** dans le JSON :

| LaTeX réel | Dans le JSON | Pourquoi |
|:-----------|:-------------|:---------|
| `\frac{a}{b}` | `\\frac{a}{b}` | `\f` = form feed en JSON |
| `\blank{x}` | `\\blank{x}` | **`\b` = backspace** → KaTeX crash |
| `\begin{align*}` | `\\begin{align*}` | `\b` = backspace |
| `\textbf{mot}` | `\\textbf{mot}` | `\t` = tabulation |
| `\par` | `\\par` | `\p` n'est pas un escape JSON, mais doubler par cohérence |
| `\overrightarrow{u}` | `\\overrightarrow{u}` | `\o` n'est pas standard |

**Le piège le plus fréquent** : `\blank{12}` avec un seul `\`. En JSON, `\b` = backspace (U+0008). KaTeX reçoit `<BS>lank{12}` et ne compile pas. Le rendu affiche `\def\arraystretch{1.2} -7x + 5y + 4z + lank{12} = 0`.

### Vérification rapide

```bash
node -e "JSON.parse(require('fs').readFileSync('fichier.json','utf8')); console.log('OK')"
```

---

## 3. Modes Mathématiques — Quand utiliser quoi

### Inline `$...$` — Dans le flux du texte

La formule s'intègre dans la phrase. Taille adaptée automatiquement.

```json
"Le module est $|z| = \\sqrt{a^2 + b^2}$."
```

**Quand l'utiliser** :
- Nommer une variable : « Soit $z = a + ib$ »
- Référencer une formule courte : « puisque $|z| = r$ »
- Introduire une notation : « on note $\\overrightarrow{u}$ le vecteur directeur »

**Quand ne PAS l'utiliser** :
- Formules de plus de ~30 caractères → passer en display
- Résultats à encadrer → `$$\boxed{...}$$`

### Display `$$...$$` — Centré, une ligne à lui seul

La formule est centrée avec des marges verticales. Taille 10% plus grande.

```json
"$$\\boxed{\\overrightarrow{u} \\cdot \\overrightarrow{v} = x_1 x_2 + y_1 y_2 + z_1 z_2}$$"
```

**Quand l'utiliser** :
- Formule principale d'un `theorem` ou `property`
- Résultat encadré `\boxed{}`
- Calcul en chaîne `align*`
- Tableau `array`

### Alignement multi-lignes `align*` — Standard obligatoire

Le `&` se place **avant** chaque `=` pour aligner verticalement :

```json
"\\begin{align*}z_1 z_2 &= (1+i)(2-i) \\\\&= \\blank{2 - i + 2i - i^2} \\\\&= \\boxed{3+i}\\end{align*}"
```

> Dans un `application`, chaque calcul en chaîne utilise `align*`. Jamais de `$$ ... = ... $$ \n $$ ... = ... $$` sur des lignes séparées.

### Espacement entre lignes dans `align*`

| Commande | Espace ajouté | Usage |
|:---------|:--------------|:------|
| `\\\\` | Standard (× `\arraystretch`) | Entre deux étapes normales |
| `\\\\[6pt]` | +6pt | Séparer deux groupes d'étapes |
| `\\\\[12pt]` | +12pt | Séparation forte (rare, entre deux sous-calculs) |

### ⚠️ `\\\\` suivi d'un crochet — le piège qui efface un tableau

`\\\\` accepte cet argument optionnel **uniquement** s'il est collé : après
`\\\\`, KaTeX teste le caractère suivant. Donc une ligne qui **commence par
`[`** écrit `\\\\[…]` et KaTeX y voit une dimension :

```latex
\\begin{array}{c|c}
I & f(I) \\\\ \\hline
[0,1] & [0,2]           ← ❌ « [0,1] » lu comme un espacement → Invalid size → tableau perdu
\\end{array}
```

Correction : un **groupe vide** entre les deux.

```latex
{} \\\\ {}[0,1] & {}[0,2]      ← ✅
```
> Le moteur insère lui-même ce groupe vide au rendu (`utils/parser/latexNormalize.ts`) :
> l'ancienne forme s'affiche donc correctement. Écrire la forme explicite reste la règle —
> c'est elle que les outils de contrôle savent vérifier.
- `\\\\ \\hline[0,1]` et `\\\\ {}[0,1]` sont **corrects** (rien de collé) ;
- `\\\\[6pt]` reste un vrai espacement, il n'est pas concerné ;
- un crochet **fermant** en tête de ligne (`]0,1[`) n'est pas concerné ;
- mêmes règles dans `align*`, `itemize`, `enumerate` et `array`.

> Contrôle automatique : `npm run validate:content` (règle 14) et
> `node tmp/check-math-katex.mjs fiche.json`. Voir `docs/GUIDE_TABLEAUX_VARIATIONS.md`.

---

## 4. Macros par Type de Bloc — Le bon outil au bon endroit

### Ce guide suit la logique du GUIDE_MASTER : chaque type de bloc a ses macros autorisées et ses patterns typiques.

---

### 4.1 Bloc `text` — Ouverture de section

**Rôle** : 2-3 phrases de liaison. Rappel + annonce.

| Macro autorisée | Usage dans `text` |
|:----------------|:------------------|
| `$...$` inline | Poser le repère : `$\\Oijk$` ou `$\\repere{O}{i}{j}$` |
| `\par` | Séparer rappel et annonce |

**Macros INTERDITES** : `\blank{}`, `\textbf{}` (pas de mots-clés ici), `$$...$$` (pas de display math), `\question{}`.

**Pattern type** :
```json
{
  "type": "text",
  "content": "On sait maintenant que deux vecteurs sont orthogonaux lorsque leur produit scalaire est nul. On va utiliser cette propriété pour établir l'équation d'un plan passant par un point et perpendiculaire à un vecteur donné."
}
```

---

### 4.2 Bloc `definition` — Concept nouveau

**Rôle** : caractérisation précise d'un concept. Nom en gras, conditions, notation.

| Macro | Usage |
|:------|:------|
| `\textbf{concept}` | **Obligatoire** sur le nom du concept à sa première apparition |
| `$...$` inline | Notation, variables |
| `$$\boxed{...}$$` | Formule de la définition si elle est courte et percutante |
| `\par\smallskip` | Séparer « on dit que » et « on note » |
| `\begin{itemize}` | Conditions ou cas distincts |

**Macros INTERDITES** : `\blank{}`, `\question{}`, `\calcbtn{}`.

**Pattern type** :
```json
{
  "type": "definition",
  "title": "Qu'appelle-t-on \\mathqst{produit scalaire de deux vecteurs} ?",
  "content": "Soient $\\overrightarrow{u}$ et $\\overrightarrow{v}$ deux vecteurs non nuls. On appelle \\textbf{produit scalaire} de $\\overrightarrow{u}$ et $\\overrightarrow{v}$ le nombre réel :\\par\\smallskip$$\\boxed{\\scalaire{u}{v} = \\norme{u} \\times \\norme{v} \\times \\cos(\\overrightarrow{u}, \\overrightarrow{v})}$$"
}
```

---

### 4.3 Bloc `theorem` / `property` — Résultats à retenir

**Rôle** : résultat avec hypothèses explicites et conclusion encadrée.

| Macro | Usage | Bloc |
|:------|:------|:-----|
| `$$\boxed{...}$$` | **Obligatoire** pour la formule centrale | `theorem`, `property` |
| `\begin{itemize}` | Liste de propriétés de même nature | `property` |
| `$...$` inline | Hypothèses : « Pour tout $x > 0$ » |  |
| `\par\smallskip` | Séparer hypothèses et conclusion |  |
| `\encadre{...}` | Alternative Premium à `\boxed` — cadre bleu | `property` |

**Macros INTERDITES** : `\blank{}`, `\question{}`.

**Pattern — Théorème avec formule encadrée** :
```json
{
  "type": "theorem",
  "title": "Comment \\mathqst{calculer le produit scalaire par les coordonnées} ?",
  "content": "Dans un repère orthonormé $\\Oijk$, soient $\\overrightarrow{u}\\coordiii{x_1}{y_1}{z_1}$ et $\\overrightarrow{v}\\coordiii{x_2}{y_2}{z_2}$.\\par\\smallskip$$\\boxed{\\scalaire{u}{v} = x_1 x_2 + y_1 y_2 + z_1 z_2}$$"
}
```

**Pattern — Propriété avec liste `itemize`** :
```json
{
  "type": "property",
  "title": "Quelles sont les \\mathqst{propriétés du produit vectoriel} ?",
  "content": "Pour tous vecteurs $\\overrightarrow{u}$, $\\overrightarrow{v}$ et tout réel $\\la$ :\\begin{itemize}\\item $\\vectoriel{u}{v} = -\\vectoriel{v}{u}$ (\\textbf{antisymétrie})\\item $\\overrightarrow{u} \\wedge (\\la\\overrightarrow{v}) = \\la(\\vectoriel{u}{v})$ (\\textbf{linéarité})\\item $\\vectoriel{u}{v} = \\overrightarrow{0} \\ssi \\overrightarrow{u}$ et $\\overrightarrow{v}$ colinéaires\\end{itemize}"
}
```

---

### 4.4 Bloc `application` — Le bloc à `\blank{}` (avec `exploration`)

> C'est le bloc **le plus exigeant** en termes de mise en page LaTeX.

**Structure en trois temps** :
1. `\question{Calculons... / Montrons que... / Déterminons...}`
2. Calcul avec `align*`, connecteurs naturels, `\blank{}` sur les étapes clés
3. Résultat final dans `$\boxed{...}$`

| Macro | Usage dans `application` | Obligatoire ? |
|:------|:---------------------|:-------------:|
| `\question{...}` | Ouvrir l'exemple — toujours en premier | ✅ |
| `\blank{réponse}` | 3 à 5 par exemple, bien répartis | ✅ |
| `\begin{align*}` | Tout calcul en chaîne | ✅ |
| `$\boxed{résultat}$` | Résultat final décisif | ✅ |
| `\par\smallskip` | Entre `\question{}` et le calcul, entre deux idées | Recommandé |
| `\blue{...}`, `\red{...}` | Annoter visuellement une étape clé | Optionnel |
| `\coordiii{x}{y}{z}` | Afficher les coordonnées compactement | Recommandé |
| `\scalaire{u}{v}` | Notation du produit scalaire | Recommandé |
| `\norme{u}` | Norme d'un vecteur | Recommandé |
| `\annotedown{expr}{label}` | Expliquer une étape sous une accolade | Optionnel |
| `\calcbtn{touche}` | Indication calculatrice | Optionnel |

**Macros INTERDITES dans `application`** : `\mathqst{}` (réservé aux titres), `\objectif{}`, `\defi{}`, `\savant{}`.

#### Règle des `\blank{}` — Où les placer

| Position | Effet pédagogique | Exemple |
|:---------|:------------------|:--------|
| Après la décomposition | L'élève **applique** la règle | `\\blank{2 - 4 - 6}` |
| Sur un résultat intermédiaire | L'élève **raisonne** | `\\blank{0}` (produit scalaire nul) |
| Sur le résultat final | L'élève **conclut** | `\\blank{\\text{perpendiculaires}}` |
| Sur une identification | L'élève **reconnaît** | `\\blank{2}\\overrightarrow{i}` |

❌ **Blanks à éviter** :
```
"On \\blank{applique} la formule"     → verbe, pas un savoir
"$\\ln(e) = \\blank{1}$" seul         → trivial, pas d'exercice
Trois blanks consécutifs sur des 0     → ennuyeux, pas formateur
```

#### Pattern complet — Produit scalaire

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\question{Calculons $\\scalaire{u}{v}$ pour $\\overrightarrow{u}\\coordiii{2}{-1}{3}$ et $\\overrightarrow{v}\\coordiii{1}{4}{-2}$.}\\par\\smallskip\\begin{align*}\\scalaire{u}{v} &= \\blue{2}(1) + \\blue{(-1)}(4) + \\blue{3}(-2) \\\\&= \\blank{2 - 4 - 6} \\\\&= \\boxed{-8}\\end{align*}"
}
```

#### Pattern complet — Équation de plan

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\question{Déterminons une équation cartésienne du plan $(P)$ passant par $A(1; -1; 0)$ et de vecteur normal $\\overrightarrow{n}\\coordiii{-7}{5}{4}$.}\\par\\smallskip On écrit $\\overrightarrow{AM}\\coordiii{x-1}{y+1}{z}$ et $\\scalaire{AM}{n} = 0$ donne :\\par\\begin{align*}-7(x-1) + 5(y+1) + 4z &= 0 \\\\-7x + \\blank{7} + 5y + \\blank{5} + 4z &= 0 \\\\-7x + 5y + 4z + \\blank{12} &= 0\\end{align*}D'o\\`u $\\boxed{-7x + 5y + 4z + 12 = 0}$."
}
```

#### Pattern complet — Vérification de perpendiculairté

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\question{Montrons que les plans $(P_1)$ et $(P_2)$ sont perpendiculaires.}\\par\\smallskip On identifie les normales : $\\overrightarrow{n_1}\\coordiii{\\blank{2}}{-1}{1}$ et $\\overrightarrow{n_2}\\coordiii{1}{\\blank{1}}{-1}$.\\par\\begin{align*}\\scalaire{n_1}{n_2} &= 2(1) + (-1)(1) + 1(-1) \\\\&= 2 - 1 - 1 \\\\&= \\blank{0}\\end{align*}Le produit scalaire est nul, donc les plans sont bien \\blank{\\text{perpendiculaires}}."
}
```

---

### 4.5 Bloc `method` — Recette pratique

**Rôle** : procédure en 3-6 phrases que l'élève applique immédiatement à l'examen.

| Macro | Usage |
|:------|:------|
| `\textbf{mot-clé}` | Technique, condition, erreur à éviter |
| `$...$` inline | Formules de référence |
| `\par` | Séparer les étapes |
| `\begin{enumerate}` | Deux grandes phases indépendantes |
| `\calcbtn{touche}` | Mode calculatrice |
| `\textbf{Erreur à éviter :}` | Terminer par l'erreur fréquente (en **milieu** de contenu, jamais en ouverture) |

**Macros INTERDITES** : `\blank{}`, `\question{}` (réservés à `application` et `exploration`).

> **Règle obligatoire** : Tout `method` est suivi d'un bloc `application` qui applique exactement la technique.

**Pattern type** :
```json
{
  "type": "method",
  "title": "Comment \\mathqst{déterminer l'équation d'un plan} connaissant un point et un vecteur normal ?",
  "content": "On identifie le \\textbf{vecteur normal} $\\overrightarrow{n}\\coordiii{a}{b}{c}$ et le \\textbf{point} $A(x_0; y_0; z_0)$.\\par On écrit $\\overrightarrow{AM} \\cdot \\overrightarrow{n} = 0$ avec $M(x; y; z)$ quelconque.\\par On développe et on regroupe : $a(x-x_0) + b(y-y_0) + c(z-z_0) = 0$.\\par\\textbf{Piège :} ne pas oublier de développer les produits avant de regrouper les termes constants."
}
```

---

### 4.6 Bloc `warning` — Piège à mettre en évidence

> **La phrase d'ouverture est obligatoire.** Le bloc ne commence **jamais** par un libellé figé (`\textbf{Erreur classique :}`, `\textbf{Attention :}`…). Il s'ouvre par une phrase adressée à l'élève, au « vous », terminée par « : » — par exemple *« Une erreur très fréquente, que vous ne devez pas commettre : »*. Voir la table complète dans `GUIDE_CREATION_REVISION.md` § 7 et `GUIDE_MASTER_REVISION.md`.

| Macro | Usage |
|:------|:------|
| phrase d'ouverture au « vous » + « : » | Ouvrir le warning (jamais un libellé figé) |
| `$...$` inline | Montrer la formule fausse et la formule correcte |
| `\encadrerouge{faux}` | Encadrer l'erreur en rouge |
| `\encadrevert{correct}` | Encadrer le bon résultat en vert |
| `\cmark` / `\xmark` | Marquer vrai/faux visuellement |
| `\crossed{expr}` | Barrer une expression fausse |

**Pattern Premium — Comparaison visuelle** :
```json
{
  "type": "warning",
  "content": "Une erreur classique, ne la commettez pas : confondre module du produit et module de la somme.\\par$$\\encadrevert{|z_1 z_2| = |z_1| \\cdot |z_2|}\\;\\cmark \\qquad \\encadrerouge{|z_1 + z_2| = |z_1| + |z_2|}\\;\\xmark$$"
}
```

---

### 4.7 Bloc `remark` — Précision avec `\itemsize{}`

| Macro | Usage |
|:------|:------|
| `\itemsize{idée}` | **Exactement 2** idées autonomes dans un seul bloc |
| `\textbf{...}` | Mot-clé de chaque idée |
| `\par` | Si une seule idée développée en deux phrases |

**Quand `\itemsize{}`** : les deux items peuvent s'enchaîner avec « et aussi ».
**Quand `\par`** : l'un découle de l'autre ou les complète.
**Quand `\begin{itemize}`** : 3 items ou plus.

---

### 4.8 Bloc `intro` — Premier contact

| Macro | Obligatoire | Zone |
|:------|:----------:|:-----|
| `\objectif{texte}` | ✅ | Gauche — objectif principal |
| `\defi{texte}` | ✅ | Gauche — difficulté principale |
| `\savant{Nom}` | ✅ | Droite — mathématicien lié au chapitre |
| `$...$` inline | Max 1 | Une formule emblématique |

**Macros INTERDITES** : `\textbf{}`, `\redb{}`, `\blueb{}`, `\mathqst{}`, `\def\arraystretch`.

---

## 5. Catalogue des 181 Macros — Par famille

---

### 5.1 Ensembles de nombres

| Macro | Résultat | Chapitre typique |
|:------|:---------|:-----------------|
| `\R` | $\mathbb{R}$ | Tous |
| `\N` | $\mathbb{N}$ | Suites, arithmétique |
| `\Z` | $\mathbb{Z}$ | Arithmétique |
| `\Q` | $\mathbb{Q}$ | Continuité |
| `\C` | $\mathbb{C}$ | Complexes |
| `\K` | $\mathbb{K}$ | Algèbre linéaire |
| `\D` | $\mathbb{D}$ | Dérivabilité |
| `\Primes` | $\mathbb{P}$ | Nombres premiers |
| `\Rstar` | $\mathbb{R}^*$ | Fonctions (domaine) |
| `\Rplus` | $\mathbb{R}_+$ | Intégrales |
| `\Rplusstar` | $\mathbb{R}_+^*$ | Logarithme |
| `\Rminus` | $\mathbb{R}_-$ | Étude de signe |
| `\Nstar` | $\mathbb{N}^*$ | Suites, récurrence |
| `\Zstar` | $\mathbb{Z}^*$ | Arithmétique |
| `\Qstar` | $\mathbb{Q}^*$ | — |
| `\Cstar` | $\mathbb{C}^*$ | Complexes (affixe non nulle) |
| `\void` | $\varnothing$ | Ensemble vide |

### 5.2 Ensembles — Opérations

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\union` | $\cup$ | Réunion |
| `\inter` | $\cap$ | Intersection |
| `\bigunion` | $\bigcup$ | Réunion indexée |
| `\biginter` | $\bigcap$ | Intersection indexée |
| `\included` | $\subset$ | Inclusion |
| `\notincluded` | $\not\subset$ | Non-inclusion |
| `\belongs` | $\in$ | Appartenance |
| `\notbelongs` | $\notin$ | Non-appartenance |
| `\comp` | $\complement_E$ | Complémentaire (`\comp{E}`) |
| `\card{E}` | $\text{card}(E)$ | Cardinal |

### 5.3 Intervalles

| Macro | Notation | Type |
|:------|:---------|:-----|
| `\interval{a}{b}` | $[a ; b]$ | Fermé |
| `\intervaloo{a}{b}` | $]a ; b[$ | Ouvert |
| `\intervalco{a}{b}` | $[a ; b[$ | Semi-ouvert à droite |
| `\intervaloc{a}{b}` | $]a ; b]$ | Semi-ouvert à gauche |

### 5.4 Délimiteurs automatiques

| Macro | Résultat | Usage typique |
|:------|:---------|:--------------|
| `\pa{expr}` | $\left(expr\right)$ | Parenthèses auto-dimensionnées |
| `\br{expr}` | $\left[expr\right]$ | Crochets |
| `\ac{expr}` | $\left\{expr\right\}$ | Accolades |
| `\abs{x}` | $\left\lvert x\right\rvert$ | Valeur absolue, module |
| `\norm{x}` | $\left\lVert x\right\rVert$ | Norme générale |
| `\floor{x}` | $\lfloor x\rfloor$ | Partie entière |
| `\ceil{x}` | $\lceil x\rceil$ | Partie entière supérieure |
| `\ang{x}` | $\langle x\rangle$ | Produit scalaire, crochet de dualité |

---

### 5.5 Vecteurs et Géométrie Analytique ⭐

> **Notation obligatoire BAC** : toujours `\overrightarrow{...}`, jamais `\vec{...}`.

#### Vecteurs

| Macro | Résultat | Quand l'utiliser |
|:------|:---------|:-----------------|
| `\overrightarrow{AB}` | $\overrightarrow{AB}$ | Vecteur entre deux points |
| `\vect{u}` | $\overrightarrow{u}$ | Raccourci pour vecteur générique |
| ~~`\vec{u}`~~ | ❌ **INTERDIT** | Notation courte non-BAC |

#### Coordonnées

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\coord{x}{y}` | $\left(x\,;\,y\right)$ | Point 2D ou composantes 2D |
| `\coordiii{x}{y}{z}` | $\left(x\,;\,y\,;\,z\right)$ | Point 3D ou composantes 3D |

**Exemple dans un `application`** :
```json
"$\\overrightarrow{u}\\coordiii{\\blank{2}}{-1}{3}$"
```

#### Repères

| Macro | Résultat | Contexte |
|:------|:---------|:---------|
| `\Oij` | $(O; \overrightarrow{i}, \overrightarrow{j})$ | Plan, repère standard |
| `\Oijk` | $(O; \overrightarrow{i}, \overrightarrow{j}, \overrightarrow{k})$ | Espace, repère standard |
| `\repere{O}{i}{j}` | $\left(O; \overrightarrow{i}, \overrightarrow{j}\right)$ | Repère personnalisé 2D |
| `\repereijk{O}{i}{j}{k}` | $\left(O; \overrightarrow{i}, \overrightarrow{j}, \overrightarrow{k}\right)$ | Repère personnalisé 3D |

**Usage** : poser le repère dans le bloc `text` d'ouverture :
```json
"L'espace est muni d'un repère orthonormé $\\Oijk$."
```

#### Opérations géométriques

| Macro | Résultat | Bloc typique |
|:------|:---------|:-------------|
| `\scalaire{u}{v}` | $\overrightarrow{u} \cdot \overrightarrow{v}$ | `application`, `theorem` |
| `\vectoriel{u}{v}` | $\overrightarrow{u} \wedge \overrightarrow{v}$ | `application`, `property` |
| `\norme{u}` | $\left\lVert\overrightarrow{u}\right\rVert$ | `application` |
| `\dist{A}{P}` | $d(A, P)$ | `application`, `property` |
| `\midpoint{A}{B}` | $I_{AB}$ | `application` |
| `\aire{T}` | $\mathcal{A}(T)$ | `application`, `property` |
| `\vol{V}` | $\mathcal{V}(V)$ | `application` |

#### Objets géométriques

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\seg{AB}` | $[AB]$ | Segment |
| `\droite{D}` | $(D)$ | Droite |
| `\plan{P}` | $(\mathcal{P})$ | Plan |
| `\perpmark` | $\perp$ | Perpendiculaire |
| `\parmark` | $\parallel$ | Parallèle |

---

### 5.6 Nombres Complexes ⭐

| Macro | Résultat | Bloc typique |
|:------|:---------|:-------------|
| `\conj{z}` | $\overline{z}$ | `property`, `application` |
| `\module{z}` | $\left\|z\right\|$ | `application` |
| `\argu{z}` | $\arg(z)$ | `application` |
| `\affixe{A}` | $z_A$ | `application` — point du plan complexe |
| `\expo{r}{\theta}` | $r\,e^{i\theta}$ | `application` — forme exponentielle |
| `\trigo{r}{\theta}` | $r(\cos\theta + i\sin\theta)$ | `application` — forme trigonométrique |
| `\cis{\theta}` | $\cos\theta + i\sin\theta$ | `property` |

**Pattern — Passage à la forme exponentielle** :
```json
"\\question{Donnons l'écriture exponentielle de $z = 1 + i$.}\\par\\smallskip\\begin{align*}\\module{z} &= \\sqrt{1^2 + 1^2} = \\blank{\\sqrt{2}} \\\\[6pt]\\argu{z} &= \\blank{\\dfrac{\\pi}{4}} \\\\[6pt]z &= \\boxed{\\expo{\\sqrt{2}}{\\pi/4}}\\end{align*}"
```

---

### 5.7 Analyse — Limites, dérivées, intégrales

#### Limites

| Macro | Résultat | Bloc typique |
|:------|:---------|:-------------|
| `\limn` | $\lim_{n \to +\infty}$ | Suites |
| `\limx{a}` | $\lim_{x \to a}$ | Continuité, dérivabilité |
| `\limpinf` | $\lim_{x \to +\infty}$ | Branches infinies |
| `\limminf` | $\lim_{x \to -\infty}$ | Branches infinies |
| `\cvto{n}{+\infty}` | $\xrightarrow[n \to +\infty]{}$ | Convergence (flèche) |

#### Dérivation

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\d` | $\mathrm{d}$ | Différentielle droite |
| `\dd{x}` | $\frac{\mathrm{d}}{\mathrm{d}x}$ | Opérateur dérivée |
| `\diff{f}{x}` | $\frac{\mathrm{d}f}{\mathrm{d}x}$ | Dérivée de f par rapport à x |
| `\pd{x}` | $\frac{\partial}{\partial x}$ | Dérivée partielle |

#### Intégration

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\intR` | $\int_{-\infty}^{+\infty}$ | Intégrale sur $\R$ |
| `\intab{a}{b}` | $\int_a^b$ | Intégrale bornée |
| `\FI{f(x)}{a}{b}` | $\left[f(x)\right]_a^b$ | Primitive aux bornes |

**Pattern — Calcul d'intégrale** :
```json
"\\begin{align*}\\intab{0}{1} 2x\\,\\d x &= \\FI{x^2}{0}{1} \\\\&= \\blank{1^2 - 0^2} \\\\&= \\boxed{1}\\end{align*}"
```

#### Sommes et produits

| Macro | Résultat |
|:------|:---------|
| `\sumin` | $\sum_{i=1}^n$ |
| `\sumkn` | $\sum_{k=0}^n$ |
| `\suminf` | $\sum_{n=0}^{+\infty}$ |
| `\prodin` | $\prod_{i=1}^n$ |

#### Constantes et symboles

| Macro | Résultat | Quand |
|:------|:---------|:------|
| `\e` | $\mathrm{e}$ | Exponentielle (pas $e$ italique) |
| `\i` | $\mathrm{i}$ | Imaginaire pur (pas $i$ italique) |
| `\pinf` | $+\infty$ | — |
| `\minf` | $-\infty$ | — |
| `\dst` | $\displaystyle$ | Forcer la taille display en inline |

#### Trigonométrie — raccourcis

| Macro | Résultat |
|:------|:---------|
| `\cosq{x}` | $\cos^2 x$ |
| `\sinq{x}` | $\sin^2 x$ |
| `\tanq{x}` | $\tan^2 x$ |
| `\cis{\theta}` | $\cos\theta + i\sin\theta$ |
| `\sh` | $\sinh$ |
| `\ch` | $\cosh$ |
| `\th` | $\tanh$ |

#### Variations et monotonie

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\croiss` | $\nearrow$ | Fonction croissante |
| `\decroiss` | $\searrow$ | Fonction décroissante |
| `\ssi` | $\Longleftrightarrow$ | Si et seulement si |

---

### 5.8 Probabilités et Statistiques

| Macro | Résultat | Exemple d'usage |
|:------|:---------|:----------------|
| `\Proba{A}` | $\mathbb{P}(A)$ | « $\Proba{A \cap B}$ » |
| `\ProbaC{B}{A}` | $\mathbb{P}_B(A)$ | Probabilité conditionnelle |
| `\Esper{X}` | $\mathbb{E}[X]$ | Espérance |
| `\Var{X}` | $\mathbb{V}(X)$ | Variance |
| `\Cov{X,Y}` | $\text{Cov}(X,Y)$ | Covariance |
| `\Bin{n}{p}` | $\mathcal{B}(n, p)$ | Loi binomiale |
| `\Norm{\mu}{\sigma}` | $\mathcal{N}(\mu, \sigma)$ | Loi normale |
| `\loi` | $\hookrightarrow$ | « $X \loi \Bin{10}{0.3}$ » |

---

### 5.9 Algèbre linéaire et Matrices

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\mat{a \\\\ b}` | $\begin{pmatrix} a \\ b \end{pmatrix}$ | Vecteur colonne |
| `\trans` | ${}^\mathsf{T}$ | Transposée : `$A\trans$` |
| `\rank` | $\text{rg}$ | Rang |
| `\ker` | $\text{Ker}$ | Noyau |
| `\img` | $\text{Im}$ | Image |
| `\id` | $\text{Id}$ | Identité |
| `\tr{A}` | $\text{Tr}(A)$ | Trace |
| `\sys{...}` | Système d'équations | Voir ci-dessous |

**Pattern — Système d'équations** :
```json
"$$\\sys{2x + y &= 5 \\\\ x - 3y &= 1}$$"
```
Rendu : $\left\{ \begin{aligned} 2x + y &= 5 \\ x - 3y &= 1 \end{aligned} \right.$

---

### 5.10 Logique

| Macro | Résultat | Usage |
|:------|:---------|:------|
| `\impl` | $\implies$ | Implication |
| `\rimpl` | $\Longleftarrow$ | Implication réciproque |
| `\ssi` | $\Longleftrightarrow$ | Équivalence |
| `\eqdef` | $\stackrel{\text{déf}}{=}$ | Égalité par définition |
| `\existsu` | $\exists !$ | Existence et unicité |
| `\land` | $\wedge$ | « et » logique |
| `\lor` | $\vee$ | « ou » logique |
| `\lnot` | $\neg$ | Négation |

---

### 5.11 Lettres grecques — Raccourcis

| Minuscule | Macro | Majuscule | Macro |
|:----------|:------|:----------|:------|
| $\alpha$ | `\al` | — | — |
| $\beta$ | `\be` | — | — |
| $\gamma$ | `\ga` | $\Gamma$ | `\Ga` |
| $\delta$ | `\de` | $\Delta$ | `\De` |
| $\varepsilon$ | `\eps` | — | — |
| $\lambda$ | `\la` | $\Lambda$ | `\La` |
| $\theta$ | `\the` | $\Theta$ | `\Th` |
| $\sigma$ | `\si` | $\Sigma$ | `\Si` |
| $\omega$ | `\om` | $\Omega$ | `\Om` |
| $\varphi$ | `\phi` | — | — |

---

## 6. Couleurs — Dans les formules et le texte

### Couleurs dans les formules KaTeX (`$...$`)

| Macro | Couleur | Variante gras | Quand l'utiliser |
|:------|:--------|:--------------|:-----------------|
| `\red{x}` | Rouge | `\redb{x}` | Erreur, résultat faux, danger |
| `\blue{x}` | Bleu | `\blueb{x}` | Identification, donnée de l'énoncé |
| `\green{x}` | Vert émeraude | `\greenb{x}` | Résultat correct, validation |
| `\orange{x}` | Ambre | `\orangeb{x}` | Attention, étape clé |
| `\purple{x}` | Violet | `\purpleb{x}` | Formule remarquable |
| `\pink{x}` | Rose | — | Accent discret |
| `\teal{x}` | Teal | — | Référence culturelle |

### Usage pédagogique des couleurs

1. **Identifier les données** : colorer les coordonnées extraites de l'énoncé
```json
"\\scalaire{u}{v} = \\blue{2}(1) + \\blue{(-1)}(4) + \\blue{3}(-2)"
```

2. **Montrer vrai vs faux** :
```json
"$\\green{|z_1 z_2| = |z_1| \\cdot |z_2|}$ \\cmark \\quad $\\red{|z_1 + z_2| = |z_1| + |z_2|}$ \\xmark"
```

3. **Souligner un résultat intermédiaire** :
```json
"$= \\orange{0}$ donc les vecteurs sont orthogonaux"
```

> **Règle** : maximum 2 couleurs par calcul. Au-delà, c'est un cirque visuel.

---

## 7. Annotations Visuelles Premium ⭐

### Accolades annotées

| Macro | Position | Usage |
|:------|:---------|:------|
| `\annoteup{expr}{label}` | Au-dessus | Nommer une expression |
| `\annotedown{expr}{label}` | En-dessous | Expliquer un calcul |

**Pattern — Annoter un produit scalaire** :
```json
"$$\\annotedown{x_1 x_2 + y_1 y_2 + z_1 z_2}{\\text{formule du produit scalaire}} = 0$$"
```

### Encadrés colorés

| Macro | Couleur de cadre | Fond | Usage |
|:------|:-----------------|:-----|:------|
| `\encadre{f}` | Bleu | Bleu très pâle | Résultat principal d'un `theorem` |
| `\encadrevert{f}` | Vert | Vert très pâle | Résultat correct dans un `warning` |
| `\encadrerouge{f}` | Rouge | Rouge très pâle | Erreur dans un `warning` |
| `\highlight{f}` | — | Jaune pâle | Mise en évidence discrète |

**Pattern — Warning avec encadrés** :
```json
{
  "type": "warning",
  "content": "$$\\encadrevert{\\vectoriel{u}{v} = -\\vectoriel{v}{u}} \\quad \\text{mais} \\quad \\encadrerouge{\\vectoriel{u}{v} = \\vectoriel{v}{u}}$$L'ordre des vecteurs dans le produit vectoriel \\textbf{compte} : inverser donne l'opposé."
}
```

### Marques de validation

| Macro | Rendu | Bloc typique |
|:------|:------|:-------------|
| `\cmark` | ✓ vert | `warning`, `remark` |
| `\xmark` | × rouge | `warning` |
| `\crossed{expr}` | Expression barrée | `warning` |
| `\point{A}` | **A** violet gras | `application`, `intuition` |
| `\tag{label}` | Badge violet arrondi | `remark` |

---

## 8. Tableaux de Signes et Variations ⭐

> 📖 **Guide complet, templates et checklist** → [`GUIDE_TABLEAUX_VARIATIONS.md`](./GUIDE_TABLEAUX_VARIATIONS.md)

### Macros dédiées

| Macro | Rendu | CSS classe | Usage |
|:------|:------|:-----------|:------|
| `\plus` | **+** vert gras | `.sign-plus` | Signe positif |
| `\moins` | **−** rouge gras | `.sign-moins` | Signe négatif |
| `\zero` | **0** bleu avec trait vertical | `.sign-zero` | Racine (changement de signe) |
| `\fleup` | ↗ vert (1.7em) | `.var-arrow-up` | Croissance |
| `\fledown` | ↘ rouge (1.7em) | `.var-arrow-down` | Décroissance |
| `\fleupB` | ↗ vert gros (2.2em) | `.var-arrow-big` | Croissance, tableau spacieux |
| `\fledownB` | ↘ rouge gros (2.2em) | `.var-arrow-big` | Décroissance, tableau spacieux |
| `\dbar` | ‖ rouge | `.var-dbar` | Valeur interdite (discret) |
| `\interdit` | ‖ rouge gras | `.var-dbar-big` | Valeur interdite (extra) |
| `\tvstrut` | strut 2.6em | — | Force la hauteur d'une ligne de variations |
| `\tsstrut` | strut 1.7em | — | Force la hauteur d'une ligne de signes |

> ⚠️ **Toujours préfixer** par `\def\arraystretch{1.7}` (signes) ou `\def\arraystretch{2.0}` (variations). C'est la règle n°1 pour un rendu tkz-tab-like.

### Pattern complet — Tableau de signes

```json
{
  "type": "property",
  "title": "Quel est le \\mathqst{signe de $f'(x)$} ?",
  "content": "$$\\def\\arraystretch{1.7}\\begin{array}{|c|ccccccc|}\\hline x & \\minf & & -1 & & 2 & & \\pinf \\\\\\hline f'(x) & & \\plus & \\zero & \\moins & \\zero & \\plus & \\\\\\hline\\end{array}$$"
}
```

### Pattern complet — Tableau de variations

```json
{
  "type": "property",
  "title": "Comment \\mathqst{varie $f$ sur $\\R$} ?",
  "content": "$$\\def\\arraystretch{2.0}\\begin{array}{|c|ccccc|}\\hline x & \\minf & & 1 & & \\pinf \\\\\\hline f'(x) & & \\plus & \\zero & \\moins & \\\\\\hline f & \\tvstrut \\minf & \\fleup & \\boxed{3} & \\fledown & \\minf \\\\\\hline\\end{array}$$"
}
```

### Pattern — Avec valeur interdite

```json
"$$\\def\\arraystretch{2.0}\\begin{array}{|c|ccccccc|}\\hline x & \\minf & & 0 & & 2 & & \\pinf \\\\\\hline f'(x) & & \\moins & \\dbar & \\moins & \\zero & \\plus & \\\\\\hline f & \\tvstrut \\pinf & \\fledown & \\dbar & \\fledown & -1 & \\fleup & \\pinf \\\\\\hline\\end{array}$$"
```

---

## 9. Flèches et Transformations ⭐

| Macro | Résultat | Usage typique |
|:------|:---------|:--------------|
| `\fleche{texte}` | $\xrightarrow{\;texte\;}$ | Transformation : « $z \fleche{\times i} iz$ » |
| `\longfleche{texte}` | $\xrightarrow{\quad texte \quad}$ | Transformation avec label long |
| `\bifleche{texte}` | $\xleftrightarrow{\;texte\;}$ | Équivalence |
| `\mapsmark{texte}` | $\xmapsto{\;texte\;}$ | Application : « $f : x \mapsmark{} f(x)$ » |
| `\cvto{x}{a}` | $\xrightarrow[x \to a]{}$ | Convergence |
| `\textrightarrow` | $\rightarrow$ | Flèche simple |

**Pattern — Rotation dans le plan complexe** :
```json
"$$\\point{M}(\\affixe{M}) \\fleche{\\times \\expo{1}{\\theta}} \\point{M'}(\\affixe{M'})$$"
```

---

## 10. Figures et Schémas Natifs KaTeX ⭐

KaTeX ne dessine pas de graphiques, mais on peut construire des **schémas symboliques** avec `array` et les macros géométriques.

### Marqueurs et symboles

| Macro | Rendu | Usage |
|:------|:------|:------|
| `\point{A}` | **A** violet gras | Point nommé |
| `\ptmark` | $\bullet$ | Marqueur de point |
| `\cercle` | $\bigcirc$ | Symbole cercle |
| `\carre` | $\square$ | Symbole carré |
| `\triangle` | $\triangle$ | Triangle |
| `\axeH` | Ligne horizontale | Axe |
| `\axeV` | Ligne verticale | Axe |

### Pattern — Vecteur avec ses coordonnées

```json
"$$\\overrightarrow{u}\\coordiii{a}{b}{c} \\quad \\overrightarrow{v}\\coordiii{d}{e}{f} \\quad \\scalaire{u}{v} = ad + be + cf$$"
```

### Pattern — Schéma de distance point-plan

```json
"$$\\point{A} \\xrightarrow{\\quad \\dist{A}{\\plan{P}} \\quad} \\plan{P} : ax + by + cz + d = 0$$"
```

### Pattern — Triangle annoté avec aire

```json
"$$\\begin{array}{ccc} & \\point{A} & \\\\ & \\Big\\vert & \\\\ \\point{B} & \\axeH & \\point{C} \\end{array} \\qquad \\aire{ABC} = \\frac{1}{2}\\norme{\\vectoriel{AB}{AC}}$$"
```

### KaTeX ou SVG ? Le critère

| Ce qu'on veut montrer | Outil |
|:---|:---|
| Relation entre objets, formule annotée, tableau de signes, disposition de points | **KaTeX natif** (ce chapitre) |
| **Courbe** dans un repère, tangente, asymptote, image d'un intervalle, aire sous la courbe | **SVG** → `docs/GUIDE_SVG_TIKZ.md` |

KaTeX ne trace pas de courbe : un `array` ne donnera jamais une parabole
crédible. Inversement, une relation symbolique n'a rien à faire dans une image
où les accents sont impossibles.

> **`docs/GUIDE_SVG_TIKZ.md`** — figures SVG de qualité TikZ : polices Computer
> Modern embarquées, palette du projet, grille bornée, aire de tracé, placement
> des étiquettes, légendes JSON. Le § 0 en tête est la liste des consignes à
> relire avant d'écrire une figure.

Une figure SVG se déclare dans le JSON par le champ `media` (voir
`docs/GUIDE_IMAGES.md`), sa **prose va dans `media.caption`** — jamais dans
l'image — et son `width` doit suivre la largeur du `viewBox`.

---

## 11. Commandes de Mise en Page

### Espacement textuel

| Commande | Moteur | Effet |
|:---------|:-------|:------|
| `\par` | Parser | Saut de paragraphe |
| `\par\smallskip` | Parser | Saut + petite marge (entre deux idées) |

> **Règle d'or** : `\par\smallskip` uniquement quand un élève marquerait naturellement une pause à la lecture. Ne pas fragmenter un raisonnement fluide.

### Espacement mathématique

| Commande | Taille | Usage |
|:---------|:-------|:------|
| `\,` | Fine (3mu) | Avant `\d x` : `$\int f(x)\,\d x$` |
| `\;` | Medium (4mu) | Séparation légère |
| `\:` | Thick (5mu) | — |
| `\!` | Négatif (-3mu) | Resserrer : `\sin\!x` |
| `\quad` | 18mu | Espace large entre formules |
| `\qquad` | 36mu | Espace double |

### Structures

| Commande | Usage | Bloc typique |
|:---------|:------|:-------------|
| `\begin{align*} ... \end{align*}` | Calculs alignés sur `=` | `application` |
| `\begin{itemize} ... \end{itemize}` | Liste non ordonnée | `property`, `remark` |
| `\begin{enumerate} ... \end{enumerate}` | Phases séquentielles | `method`, `proof` |
| `\begin{enumerate}` imbriqué dans un `\item` | Sous-questions numérotées `a.` `b.` `c.` (automatique) | `application`, `exploration` |
| `\begin{cases} ... \end{cases}` | Définition par morceaux | `definition`, `property` |
| `\begin{array}{|c|c|} ... \end{array}` | Tableaux | `property` (signes, variations) |
| `\sys{...}` | Système d'équations | `application` |
| `\begin{pmatrix} ... \end{pmatrix}` | Matrice/vecteur colonne | `application` |
| `\begin{columns}[2] ... \end{columns}` | Colonnes de contenu (voir ci-dessous) | `application` (énoncé), documents imprimés |
| `\image[options]{src}{légende}` | Image placée dans le texte (voir ci-dessous) | tout bloc |

### Surlignage du texte

Moteur 1 (texte). Un surligneur = une macro ; le fond seul est coloré, l'encre du texte reste lisible. Dans le JSON : `\\hl{...}`.

| Commande | Couleur | Usage |
|:---------|:--------|:------|
| `\hl{…}` · `\highlight{…}` | Ambre (discret) | Le mot ou la valeur à retenir |
| `\hlyellow{…}` | Jaune marqueur | Surlignage « stabilo » classique |
| `\hlgreen{…}` | Vert | Résultat obtenu, hypothèse vérifiée |
| `\hlred{…}` | Rouge (texte rouge aussi) | Erreur à éviter, point d'alerte |
| `\hlblue{…}` | Bleu (texte bleu aussi) | Notion, nom de théorème |
| `\hlorange{…}` · `\hlpurple{…}` · `\hlpink{…}` · `\hlcyan{…}` · `\hlgray{…}` | Fond coloré | Distinguer plusieurs rôles dans un même calcul |

- Une seule couleur par idée : plus de trois couleurs sur un bloc, on ne sait plus ce qui compte.
- Le surlignage s'imprime (le fond est forcé à l'impression).
- Dans une formule `$...$`, utiliser `\highlight{...}` côté KaTeX (surlignage jaune de la formule), pas ces macros.

### Colonnes

`\begin{columns}[options] ... \end{columns}` (alias `colonnes`). Deux formes :

| Forme | Rendu |
|:------|:------|
| `\begin{columns}[3]\begin{enumerate}\item …\item …\end{enumerate}\end{columns}` | **Flux** : le contenu se répartit seul sur 2 (défaut) à 4 colonnes ; la numérotation continue |
| `\begin{columns}A\column B\column C\end{columns}` | **Colonnes explicites** : blocs côte à côte (2-3), deux par ligne au-delà |

Options entre crochets, collées à `\begin{columns}`, séparées par des virgules, dans n'importe quel ordre :

| Option | Effet | Exemple |
|:-------|:------|:--------|
| `2` à `4` | Nombre de colonnes (mode flux ; 4 au maximum) | `[3]` |
| `rule` | Filet vertical entre les colonnes | `[2,rule]` |
| `gap=<longueur>` | Gouttière (`px`, `mm`, `cm`, `pt`, `em`, `rem`) | `[2,gap=8mm]` |

- Une option inconnue annule **toute** la liste : le crochet reste alors du texte (jamais d'erreur de rendu).
- `\columnbreak` (équivalent du *saut de colonne* de Word) fait repartir le texte suivant en haut de la colonne suivante, en mode flux.
- Sur téléphone (≤ 720 px) les colonnes s'empilent. Dans un document imprimé en 2 colonnes, un `columns` en flux reste sur une colonne : deux colonnes dans une demi-page seraient illisibles.

### Images dans le texte — `\image`

Moteur 1. Écrire l'image là où elle doit apparaître ; la **légende** est un second argument `{…}` collé, qui accepte le LaTeX. Alias : `\img`, `\includegraphics` (mêmes options).

```json
"content": "On lit le signe sur la courbe.\\par\\image[width=60%,align=center]{/data/2eme-bac-sc-math/pictures/courbe_f.png}{Courbe de $f$ sur $[0,3]$}"
```

Le placement suit le vocabulaire de Word (« Habillage du texte ») :

| Dans Word | Option ici | Remarque |
|:----------|:-----------|:---------|
| *Haut et bas* (défaut) | `align=left` · `center` · `right` | L'image occupe sa ligne ; centrée par défaut |
| *Carré / Rapproché / Au travers* | `position=float-left` · `float-right` (ou `float=left\|right`, ou `wrap=square,align=right`) | Le texte coule autour ; sur téléphone la figure repasse centrée, pleine ligne |
| *Aligné sur le texte* | `position=inline` (+ `valign=top\|middle\|bottom\|baseline`) | L'image est un grand caractère de la ligne : petites icônes, schémas dans une phrase |
| *Taille* — largeur / hauteur | `width=…` · `height=…` (ou `w=` / `h=`) | Pourcentage, `cm`, `mm`, `in`, `pt`, `px`, `em`, `rem`, `vw`, `vh`. Sans unité = pixels. Un seul des deux conserve les proportions |
| *Taille* — prédéfinie | `size=tiny\|small\|medium\|large\|full` | 20 % · 30 % · 50 % · 75 % · 100 % |
| *Distance du texte* | `gap=…` | Marge entre image et texte (habillage ou ligne) |
| *Rotation* | `rotate=-90` | Degrés, entre −360 et 360 |
| *Ajustement* | `fit=contain\|cover\|fill` | Seulement si `width` **et** `height` sont donnés |
| *Style de l'image* | `border` · `shadow` · `rounded` (`=false` pour couper) | Désactivés par défaut |
| *Texte de remplacement* | `alt={…}` | Accolades si le texte contient une virgule ; sinon la légende sert d'`alt` |

Écritures courtes : un mot seul est reconnu, donc `\image[50%,right,border]{…}` suffit.

Règles :

- `src` : chemin du site (`/data/…`), `https://…` ou image `data:`. Tout autre schéma (`javascript:`…) est refusé et remplacé par `[image non valide]`.
- Une valeur inconnue est ignorée sans erreur ; `width` supérieur à 100 % est ramené à 100 %.
- Une figure ne dépasse jamais la largeur de sa colonne, y compris à l'impression.
- « Derrière / devant le texte » n'existe pas : une image qui recouvre du texte est illisible sur téléphone et sur papier.
- Une accolade `{…}` placée juste après `\image[…]{src}` est lue comme légende : pour du texte entre accolades, laisser un espace ou un mot avant.
- Pour une figure **rattachée à un bloc** (question d'une liste, correction repliable, `lead`/`content`), utiliser plutôt le champ `media` : voir `docs/GUIDE_IMAGES.md`.

### Document « Correction devoir maison » (impression)

Le préréglage d'impression **Correction devoir maison** (Studio › Imprimer) applique par défaut :

- **contenu sur 2 colonnes** avec filet central, corps 9,6 pt, interligne 1,5 ;
- **en-tête normal**, pleine largeur, au-dessus des colonnes (marque, classe, cadre du titre inchangés) ;
- corrections affichées, accent bleu.

Dans ce document, ne pas ajouter de `\begin{columns}` autour de la correction : la mise en colonnes est déjà celle de la page. Un `\begin{columns}` en flux y est replié sur une colonne ; seules les colonnes **explicites** (`\column`) ont un sens, pour comparer deux méthodes. Le préréglage reste modifiable (1 colonne, écart, filet) avant l'impression.

---

## 12. Commandes Interdites — Résumé

| Commande | Pourquoi | Alternative |
|:---------|:---------|:------------|
| `\def\arraystretch{...}` | Auto-injecté — double définition = crash | Ne rien écrire |
| `\vec{u}` | Non-BAC, flèche courte | `\overrightarrow{u}` ou `\vect{u}` |
| `\checkmark` | Rendu inconsistant | `\cmark` ou texte français |
| `arctan`, `arcsin`, `arccos` | Hors programme BAC Maroc/Tunisie | Cercle trigo + signes |
| `Z` majuscule pour un complexe | Convention BAC | `z`, `w`, `u`, `v` minuscule |
| `—` (tiret long) | Typographie non standard | `,` `;` `:` ou reformuler |
| `Étape 1 :` dans `application` | Style non-BAC | Connecteurs : *puisque, d'où, on en déduit* |
| `\blank{}` hors `application`/`exploration` | Règle absolue du projet | Texte normal |
| `\mathqst{}` dans `content` | Réservé aux titres | `\textbf{}` dans le contenu |

---

## 13. Checklist Technique — Avant de livrer

### JSON et échappement
- [ ] `\\blank{` partout (jamais `\blank{` simple)
- [ ] `\\begin{` partout (jamais `\begin{` simple)
- [ ] Aucun `\def\arraystretch` dans le fichier
- [ ] JSON valide : `node -e "JSON.parse(require('fs').readFileSync('f.json','utf8'))"`

### Notation
- [ ] Aucun `\vec{` dans le fichier → `\overrightarrow{` ou `\vect{`
- [ ] Aucun `arctan`, `arcsin`, `arccos`
- [ ] Aucun tiret long `—`
- [ ] Aucun `\checkmark` → `\cmark` ou texte

### Blocs `application`
- [ ] Chaque bloc `application` ouvre par `\question{...}`
- [ ] 3 à 5 `\blank{}` par application, bien répartis
- [ ] Calculs en `align*` avec `&=`
- [ ] Résultat final dans `$\boxed{...}$`
- [ ] Aucun `\blank{}` hors d'un bloc `application` ou `exploration` — y compris **dans les tableaux**

### Mise en page
- [ ] `\par\smallskip` avec sagesse (pas à chaque phrase)
- [ ] Display `$$...$$` pour les formules longues (pas inline)
- [ ] `\\\\[6pt]` si deux groupes d'étapes dans un `align*`
- [ ] Maximum 2 couleurs par calcul

### Structure pédagogique
- [ ] Chaque `method` est suivi d'un bloc `application`
- [ ] Le repère est posé dans le `text` d'ouverture si la section utilise des coordonnées
- [ ] Les titres sont des questions avec `\mathqst{}`
- [ ] Variété des mots interrogatifs (pas deux « Comment » consécutifs)

---

*Ce guide est le compagnon technique du GUIDE MAÎTRE. Les deux sont indissociables.*
