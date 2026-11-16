# Guide de Création de Fiches de Révision JSON
### Instructions pour le robot de traitement de cours

> **Mission** : Lire un PDF ou une image de cours, analyser son contenu en profondeur, puis produire une fiche JSON structurée, fidèle et pédagogique.

---

## 1. Règles Absolues

> **Ne jamais inventer de contenu.** Chaque bloc doit provenir du document source.
>
> **Les exercices d'application sont toujours dans des blocs `application` séparés.** Jamais intégrés dans un bloc `definition`, `property` ou `theorem`.
>
> **Les `\blank{}` sont réservés aux blocs `application` et `exploration`.** Aucun blank dans les autres types de blocs — y compris dans un tableau : une table de cours se lit, elle ne se devine pas.
>
> **Chaque bloc `application` doit contenir `"difficulty": 1..5`.** C'est un nombre JSON, pas une chaîne. `3` est la valeur par défaut si le document source ne donne aucun indice.
>
> **Ne plus produire `"type": "example"`.** L'ancien type est seulement lu comme alias de compatibilite. Toute illustration ou tout exemple actif devient `"type": "application"`.
>
> `application` : exercice de calcul **demandé à l'élève**. Toujours `\qst{...}` ou `\question{...}`, `"difficulty": 1..5`, et des `\blank{}` pour les étapes clés. Compteur affiché : *Exercice d'application 01, 02…*
>
> **Les applications à plusieurs questions utilisent `\begin{enumerate}` et `\item`.** L'énoncé commun et les sous-questions restent dans `\qst{...}` ; la correction reste après `\qst{...}` et ses réponses utilisent aussi `\begin{enumerate}`. Les sous-questions ne sont jamais écrites en `1)` texte brut.
>
> **Tout doit être adapté aux élèves marocains du lycée** qui lisent le français comme langue seconde — phrases courtes, mots simples, zéro jargon pédagogique.
>
> **Ne jamais utiliser le symbole `✓` (`\checkmark`).** Remplacer par des mots significatifs : « vérifié », « condition remplie », « résultat confirmé », « résultat cohérent », etc.
>
> **Éviter « Étape 1 », « Étape 2 »… dans la rédaction des applications.** Préférer des transitions naturelles avec `\textbf{}` sur les mots-clés (ex : `\textbf{Symétrie du domaine :}`, `\textbf{Calcul de $f(-x)$ :}`, `\textbf{Comparaison :}`). N'utiliser « Étape X » que si la numérotation est inévitable pour la clarté.

---

## 2. Section d'Introduction — Obligatoire en Début de Fiche

**Chaque fiche doit commencer par une section d'introduction** avant toutes les sections de cours. Cette section pose le contexte et donne envie à l'élève de lire la suite.

### Structure obligatoire

La section d'introduction contient **deux blocs dans cet ordre** :

1. **Un bloc `text`** — 1 à 2 phrases qui posent le sujet et l'objectif du chapitre. C'est le point d'entrée de l'élève.
2. **Un bloc `culture`** — contexte historique ou lien avec le monde réel (technologie, médecine, nature, ingénierie...)

Le bloc `culture` doit :
- Un **texte court** (3 à 5 phrases) qui relie le concept à une application concrète ou à son histoire
- **Toujours montrer le lien entre les maths et le monde réel** : cryptographie, GPS, imagerie médicale, architecture, musique, intelligence artificielle, etc.
- Une **image Wikipedia** d'un savant lié au sujet, ou d'un objet/phénomène concret qui illustre le chapitre

### Règles pour l'image Wikipedia

- La `src` doit être un **lien direct vers le fichier image** sur Wikimedia Commons
- Format recommandé : `https://upload.wikimedia.org/wikipedia/commons/[chemin]/[fichier.jpg]`
- Choisir une image **libre de droits** (domaine public ou licence libre) — toutes les images Wikimedia Commons le sont
- Préférer un **portrait de savant** si le concept a un inventeur connu, sinon un objet ou phénomène concret lié au sujet
- `position: "right"`, `width: "22.5%"`

### Comment trouver la bonne image

1. Aller sur `https://fr.wikipedia.org/wiki/[sujet]`
2. Cliquer sur l'image principale de l'article
3. Sur la page Wikimedia Commons, copier le lien du fichier original
4. Utiliser ce lien direct comme valeur de `src`

### Exemples de correspondances sujet → image

| Chapitre | Image suggérée | Savant / Objet |
|----------|---------------|----------------|
| Logarithme népérien | Portrait de John Napier | Inventeur des logarithmes (1614) |
| Nombres complexes | Portrait de Leonhard Euler | Formule d'Euler $e^{i\pi}+1=0$ |
| Suites numériques | Portrait de Fibonacci | Suite de Fibonacci dans la nature |
| Dérivation | Portrait de Newton ou Leibniz | Inventeurs du calcul différentiel |
| Produit scalaire | Photo d'un travail physique (force × déplacement) | Application concrète en physique |
| Probabilités | Portrait de Pascal ou Fermat | Correspondance fondatrice (1654) |
| Géométrie dans l'espace | Photo d'une architecture (dôme, pont) | Application géométrique réelle |

### JSON de la section d'introduction

```json
{
  "id": "intro",
  "category": "course",
  "title": "Introduction",
  "blocks": [
    {
      "type": "text",
      "content": "On va apprendre à manipuler le logarithme népérien : simplifier des expressions, résoudre des équations exponentielles et étudier des fonctions nouvelles. Ce chapitre s'appuie sur l'exponentielle vue précédemment. Le calcul est assez direct, mais il faut bien maîtriser les propriétés algébriques pour ne pas se tromper de signe. Avec de la rigueur, les logarithmes deviennent un outil très puissant."
    },
    {
      "type": "culture",
      "title": "Des étoiles aux algorithmes : à quoi servent les logarithmes ?",
      "content": "Le mathématicien écossais John Napier publie les logarithmes en 1614 pour simplifier les calculs astronomiques. Aujourd'hui, les logarithmes sont partout : mesure du bruit en décibels, échelle de Richter pour les séismes, compression d'images numériques, et complexité des algorithmes en informatique.",
      "media": {
        "src": "https://upload.wikimedia.org/wikipedia/commons/6/60/John_Napier.jpg",
        "position": "right",
        "width": "22.5%",
        "caption": "John Napier (1550–1617)"
      }
    }
  ]
}
```

### Règles bloc `text` d'intro

3 à 5 phrases fluides, sans formule : objectifs, prérequis, difficulté principale, motivation. Lire l'ensemble de la fiche avant de rédiger.

### Règles bloc `culture`

3 à 5 phrases : lien maths ↔ monde réel (technologie, médecine, nature, histoire). Répondre à *À quoi ça sert ?* et/ou *Qui l'a inventé ?*. Pas de formule.

### Placement du bloc `culture` dans la fiche

Le bloc `culture` peut apparaître à **deux endroits** :
- **En introduction** (obligatoire) — contexte historique + lien monde réel
- **Au milieu d'une section** (optionnel) — quand un concept a un lien fort avec une application concrète. Exemple : après les congruences, un bloc culture sur la cryptographie RSA

---

## 3. Processus d'Analyse Avant Toute Rédaction

> Lire tout le chapitre avant d'écrire le moindre bloc JSON.

### Phase 1 — Classifier chaque paragraphe

Pour chaque paragraphe du document, identifier son rôle avant de décider du type de bloc :

| Ce que dit le paragraphe | Type de bloc à utiliser |
|--------------------------|-------------------------|
| Introduit un concept nouveau avec une caractérisation précise | `definition` |
| Énonce un résultat majeur démontrable, avec hypothèses et conclusion | `theorem` |
| Donne une règle de calcul ou une formule directement utilisable | `property` |
| Résultat intermédiaire nécessaire pour démontrer autre chose | `lemma` |
| Conséquence directe et immédiate d'un théorème | `corollary` |
| Implication ou application notable d'un résultat | `consequence` |
| Illustre un concept par un calcul ou une vérification (exercice pour l'élève) | `application` |
| Ouvre une section : rappelle les prérequis ou introduit le paragraphe avec un exercice de mise en route | `exploration` |
| Exercice guidé visible, contenu nouveau utilisé immédiatement sans correction cachée | `exploration` |
| Décrit une procédure générale étape par étape (algorithme) | `method` |
| Donne une technique de calcul spécifique à un type d'expression | `technique` |
| Décrit une approche stratégique de haut niveau pour un type de problème | `strategy` |
| Démontre rigoureusement un résultat | `proof` |
| Donne une image visuelle ou géométrique pour comprendre intuitivement | `intuition` |
| Récapitule les résultats essentiels d'une ou plusieurs sections | `summary` |
| Signale une erreur fréquente ou un piège | `warning` |
| Apporte une nuance ou un complément | `remark` |
| Introduit ou relie des sections (obligatoire en 1er bloc de chaque section) | `text` |
| Lien avec le monde réel (techno, médecine, nature...) ou contexte historique | `culture` |

### Phase 2 — Distinguer les types formels et les types procéduraux

#### Distinguer `definition`, `theorem`, `property`, `lemma`, `corollary`, `consequence`

**`definition`** — Introduit un concept nouveau par une caractérisation :
- Répond à : *Qu'est-ce que c'est ?*
- Donne le nom du concept (en **gras** dans le contenu)
- Pose les conditions d'existence si nécessaire

**`theorem`** — Énonce un résultat majeur qui se démontre :
- Répond à : *Qu'est-ce qui est vrai, et sous quelles conditions ?*
- A des **hypothèses** explicites et une **conclusion** claire
- Le résultat principal est dans `$$\boxed{...}$$`
- Peut être accompagné d'un bloc `proof`

**`property`** — Donne une règle ou formule directement utilisable :
- Répond à : *Comment on calcule / on simplifie ?*
- Pas de démonstration attendue, utilisé comme outil de calcul

**`lemma`** — Résultat intermédiaire auxiliaire :
- Répond à : *De quoi a-t-on besoin pour démontrer le théorème suivant ?*
- Moins important que le théorème principal, mais nécessaire pour la démonstration
- Utiliser uniquement quand le document source le présente explicitement

**`corollary`** — Conséquence immédiate et directe d'un théorème :
- Répond à : *Qu'est-ce qu'on obtient tout de suite à partir de ce théorème ?*
- Toujours placé **juste après** le théorème dont il découle
- Ne nécessite pas de nouvelle démonstration

**`consequence`** — Application ou implication notable d'un résultat :
- Répond à : *Qu'est-ce que cela implique concrètement ?*
- Plus large qu'un corollaire — peut découler de plusieurs blocs combinés
- Souvent utilisé pour relier un résultat abstrait à une situation concrète

> Si un paragraphe source mélange définition et propriétés, **les séparer en deux blocs distincts**.

#### Distinguer `method`, `technique` et `strategy`

**`method`** — Recette pratique et directe :
- Répond à : *Quelle est la marche à suivre pour résoudre ce type de problème ?*
- Texte concis à l'impératif, `\begin{itemize}` pour les cas, `\par` pour séparer
- Pas de `\step{}`, pas de numérotation d'étapes
- Applicable à de nombreux cas différents du même type

**`technique`** — Procédure de calcul spécifique à un type d'expression :
- Répond à : *Comment traite-t-on spécifiquement cette forme de calcul ?*
- Plus ciblé que la méthode : lié à une expression ou transformation précise
- Exemple : *technique de factorisation*, *technique du changement de variable*
- Même style que `method` : direct, concis, pratique

**`strategy`** — Approche de haut niveau pour un type de problème :
- Répond à : *Comment choisir la bonne méthode avant de commencer ?*
- Décrit une logique de décision, pas des étapes de calcul
- Exemple : *Comment choisir entre dérivation et développement limité ?*
- Ne pas confondre avec `method` : la stratégie oriente, la méthode exécute

---

#### Remplacer `example` par `application`

> Cette règle supprime l'ambiguïté : **ne jamais créer de nouveau bloc `"type": "example"`**. Il reste seulement comme alias ancien pour relire de vieux JSON.

**`application`** — Exercice d'application actif :
- Répond à : *Sauras-tu appliquer ce résultat par toi-même ?*
- Commence **toujours** par `\qst{...}` ou `\question{...}`.
- `\qst{...}` peut contenir un énoncé long, plusieurs phrases, des formules, puis `\begin{enumerate}` avec plusieurs `\item`.
- Après `\qst{...}`, écrire une **correction unique**. En mode étendu, l'interface sépare automatiquement l'énoncé et la correction avec le badge `Correction`.
- Si l'énoncé contient plusieurs questions, la correction ne recrée pas plusieurs `\qst{...}` : elle utilise `\begin{enumerate}` pour répondre dans le même ordre.
- Contient `"difficulty": 1` à `5` (nombre JSON, jamais une chaîne).
- Contient des `\blank{val}` sur les étapes clés quand l'élève doit retrouver une valeur.
- Compteur affiché : *Exercice d'application 01, Exercice d'application 02…*

**Tableau de décision rapide :**

| Le paragraphe source... | Type correct |
|-------------------------|-------------|
| Demande à l'élève de calculer / vérifier / démontrer | `application` |
| Montre un calcul concret que l'élève doit comprendre activement | `application` |
| Contient des trous à remplir (`...`, `□`, `___`) | `application` |
| Lit ou exploite un résultat déjà obtenu sans trous | `exploration` |
| A une difficulté graduée ou un barème | `application` |

**Exemple JSON correct :**

```json
{
  "type": "application",
  "difficulty": 4,
  "content": "\\qst{On forme des nombres de trois chiffres distincts avec $1,2,3,4,5,6,7$.\\par\\smallskip\\begin{enumerate}\\item Combien de nombres peut-on former ?\\item Combien sont pairs ?\\end{enumerate}}\\par\\smallskip\\begin{enumerate}\\item L'ordre compte, donc $N=A_{\\blank{7}}^{\\blank{3}}=\\boxed{210}$.\\item Pour être pair, le dernier chiffre est dans $\\{2,4,6\\}$. On obtient $3\\times A_{\\blank{6}}^{\\blank{2}}=\\boxed{90}$.\\end{enumerate}"
}
```

---

## 4. Public Cible et Style Linguistique

### Public visé

Les fiches s'adressent aux **élèves marocains du lycée** (Tronc Commun, 1BAC, 2BAC) :
- Français **langue seconde** — pas langue maternelle
- Phrases **courtes** (max 15–20 mots par phrase)
- Vocabulaire **simple et direct**
- Exemples avec des **nombres concrets**, pas des lettres abstraites seules

### Style de rédaction

| À faire | À éviter |
|---------|----------|
| Phrases courtes et directes | Phrases longues avec plusieurs virgules |
| Mots du quotidien | Jargon pédagogique ou littéraire |
| « On divise », « Cela donne » | « Il convient de procéder à la division » |
| « Si le reste est 0 » | « Dans l'éventualité où le reste s'avère nul » |
| « On trouve », « On obtient » | « On constate que », « Il s'avère que » |
| Connecteurs simples : *puisque, donc, ainsi, d'où* | Flèches pour remplacer des mots (« → » « ⇒ ») |
| `\textbf{mot clé}` sur les mots importants | Texte plat sans repères visuels |
| « on obtient alors », « donc », « ce qui donne » | `$\Rightarrow$` ou `$\to$` pour dire *donc* ou *donne* |

### Flèches : uniquement dans les formules mathématiques

Les symboles `$\to$`, `$\Rightarrow$`, `$\implies$` sont réservés aux **formules mathématiques** où ils ont un sens précis :

**Utilisations correctes** (dans une formule) :
- `$\lim_{x \to +\infty}$` — notation standard des limites
- `$P \implies Q$` — implication logique dans un énoncé formel
- `$f : \mathbb{R} \to \mathbb{R}$` — notation d'une application

**Utilisations interdites** (pour expliquer en texte) :
```
❌ "Somme $\to$ produit"
✅ "On transforme une \textbf{somme} en \textbf{produit}"

❌ "produit nul $\Rightarrow$ un facteur nul"
✅ "le produit est nul, donc \textbf{chaque facteur} est égal à zéro"

❌ "$\cos \times \cos$ → formule avec..."
✅ "Pour un produit $\cos \times \cos$, appliquer la formule..."
```

**Règle simple** : si la flèche remplace un mot français (*donc*, *donne*, *devient*), utiliser le mot. Si la flèche fait partie d'une notation mathématique standard, la garder.

### Mots-clés en gras

Dans les blocs `method`, `warning` et `remark`, mettre en **gras** (`\textbf{...}`) les mots-clés que l'élève doit retenir : le nom de la technique, la condition importante, l'erreur à éviter.

### Exemples de reformulation

```
❌ "La divisibilité constitue une relation fondamentale entre entiers."
✅ "Un nombre divise un autre s'il n'y a pas de reste."

❌ "On procède à la vérification de la primalité du nombre."
✅ "On vérifie si le nombre est premier."

❌ "Il convient de noter que cette propriété est valable."
✅ "Cette propriété est toujours vraie."
```

---

## 5. Structure du Fichier JSON

**Emplacement** : `public/data/[niveau]/[chapitre]/revisions/fiche_[chapitre]_cours.json`

```json
{
  "header": {
    "title": "Titre du Chapitre",
    "subtitle": "Description courte",
    "context": "Niveau (1BAC, 2BAC...)"
  },
  "sections": [
    {
      "id": "id_unique_snake_case",
      "category": "course",
      "title": "Titre de la Section",
      "blocks": []
    }
  ]
}
```

Chaque **section** regroupe un ensemble de blocs autour d'une même idée.
Chaque **bloc** représente une seule unité pédagogique (une définition, une application, etc.).

### Plusieurs fiches pour un même chapitre

Un chapitre peut proposer **plusieurs fiches** (cours principal, compléments, approfondissement). L'élève voit alors une étape « Leçon 1 », « Leçon 2 » sur la carte du chapitre.

Deux déclarations sont nécessaires — la carte du tableau de bord lit le manifeste de **classe**, la vue leçon lit celui du **chapitre** :

`public/data/classes/[niveau].json`

```json
{
  "id": "derivation-etude",
  "title": "Dérivation et étude",
  "quizCount": 22,
  "manifestPath": "data/2eme-bac-sc-math/derivation-etude/manifest.json",
  "revisions": [
    { "path": "data/2eme-bac-sc-math/derivation-etude/revisions/fiche_derivation_cours.json", "title": "Fiche de cours" },
    { "path": "data/2eme-bac-sc-math/derivation-etude/revisions/fiche_derivation_etude_cours.json", "title": "Applications de la dérivée" }
  ]
}
```

`public/data/[niveau]/[chapitre]/manifest.json`

```json
{
  "revisions": [
    { "id": "rev-derivation-01", "title": "Fiche de cours", "path": "data/2eme-bac-sc-math/derivation-etude/revisions/fiche_derivation_cours.json" },
    { "id": "rev-derivation-02", "title": "Applications de la dérivée", "path": "data/2eme-bac-sc-math/derivation-etude/revisions/fiche_derivation_etude_cours.json" }
  ]
}
```

Règles :

- **L'ordre du tableau fait foi.** La fiche d'index 0 est la leçon principale : elle conserve la progression déjà enregistrée par les élèves. **Ne jamais réordonner** `revisions` d'un chapitre existant.
- Placer une fiche secondaire **dans le dossier `revisions/` du chapitre déclaré**, jamais dans un dossier voisin : `npm run validate:content` signale sinon un contenu inatteignable.
- Écrire la fiche en suivant exactement les mêmes règles de rédaction que la fiche principale : elle s'affiche dans le même lecteur.
- **Un seul** quiz est ouvert par chapitre (le premier déclaré) : en déclarer plusieurs n'a pas d'effet côté élève.

---

## 6. Règles pour les Titres des Blocs

Les blocs `definition`, `theorem`, `property`, `method` et `proof` ont un champ `title` obligatoire.

### Principe

> **Lire le contenu du bloc en entier d'abord**, puis formuler le titre.
> Le titre doit poser **la question naturelle qu'un élève se poserait** en découvrant ce contenu.

### Règles

| Règle | Application |
|-------|-------------|
| **Toujours une question** | Commencer par *Qu'est-ce que... ?*, *Comment... ?*, *Pourquoi... ?*, *Quand... ?* |
| **Mots simples** | Pas de termes rares — l'élève lit en français langue seconde |
| **Ciblé sur l'idée centrale** | Pointer l'idée principale du bloc, pas le sujet général de la section |
| **Court** | Maximum 10–12 mots |
| **Pas de répétition** | Ne pas reformuler le titre de la section |
| **`\mathqst{}` obligatoire** | Entourer la phrase clé de la question avec `\mathqst{}` (voir ci-dessous) |

### La commande `\mathqst{}` dans les titres

La commande `\mathqst{phrase clé}` met en valeur **le cœur de la question** dans le titre.
Elle affiche le texte en **extra-gras** avec la couleur du type de bloc (définition, propriété, théorème…).

**Syntaxe :** `"title": "Mot interrogatif \\mathqst{phrase clé du titre}"`

| Exemple de titre | Explication |
|------------------|-------------|
| `"Quand dit-on que \\mathqst{$a$ divise $b$}"` | La partie essentielle est « $a$ divise $b$ » |
| `"Comment \\mathqst{exprimer le conjugué d'un nombre complexe}"` | La phrase clé est l'action principale |
| `"Que signifie \\mathqst{$\\displaystyle\\lim_{n \\to +\\infty} u_n = \\ell$}"` | La formule clé est mise en valeur |
| `"C'est quoi \\mathqst{un nombre premier}"` | Le concept défini est souligné |

**Règles :**
- Exactement **une** `\mathqst{}` par titre
- Elle entoure la **partie essentielle**, pas le mot interrogatif
- Elle peut contenir des formules `$...$`
- **Interdite** dans le champ `content` et dans les blocs `intro`

### Exemples par type de bloc

**`definition`**

| Contenu | ❌ Générique | ✅ Ciblé et simple |
|---------|-------------|-------------------|
| ln(x) est la réciproque de e^x | "Comment définir ln ?" | "Qu'est-ce que ln(x) veut dire ?" |
| La dérivée comme limite du taux d'accroissement | "Qu'est-ce qu'une dérivée ?" | "Comment mesure-t-on la pente en un point ?" |
| Vecteurs colinéaires si déterminant nul | "Comment définir la colinéarité ?" | "Quand dit-on que deux vecteurs sont colinéaires ?" |

**`theorem`**

| Contenu | ❌ Générique | ✅ Ciblé et simple |
|---------|-------------|-------------------|
| (ln x)' = 1/x | "Quelle est la dérivée de ln ?" | "Pourquoi la dérivée de ln(x) donne 1/x ?" |
| TVI : f continue sur [a,b] prend toutes les valeurs intermédiaires | "Quel est le TVI ?" | "Pourquoi une courbe continue ne peut pas sauter ?" |
| Al-Kashi : a² = b² + c² − 2bc·cos(A) | "Qu'est-ce que la loi d'Al-Kashi ?" | "Comment trouver un côté quand on connaît les angles ?" |

**`property`**

| Contenu | ❌ Générique | ✅ Ciblé et simple |
|---------|-------------|-------------------|
| ln(ab) = ln a + ln b | "Comment simplifier les logarithmes ?" | "Comment ln transforme une multiplication en addition ?" |
| (u × v)' = u'v + uv' | "Quelle est la formule du produit ?" | "Comment dériver quand deux fonctions sont multipliées ?" |
| ln(1) = 0 et ln(e) = 1 | "Quelles sont les valeurs remarquables ?" | "Quelles valeurs de ln faut-il connaître par cœur ?" |

### À éviter absolument

```
❌ "Comment définir le logarithme népérien ?"  → trop large, répète le titre de section
❌ "Quelle est la propriété des logarithmes ?" → vague, ne cible rien
❌ "Théorème fondamental"                       → pas une question
❌ "Pourquoi ln et l'exponentielle s'annulent mutuellement ?" → "s'annulent" trop abstrait
```

---

## 7. Types de Blocs — Définition et Rédaction

---

### `definition` — Introduire un concept nouveau

**Quand l'utiliser** : le paragraphe source donne le sens précis d'un terme mathématique nouveau.

**Règles de rédaction** :
- Le nom du concept nouveau est en **gras** (`\textbf{...}`) à sa première apparition dans le contenu
- Énoncer la caractérisation précise : conditions, notation, signification
- Ne pas mélanger définition et propriétés dans le même bloc
- Phrases courtes, une idée par phrase
- **Aucun `\blank{}` dans ce bloc**

```json
{
  "type": "definition",
  "title": "Qu'est-ce que ln(x) veut dire ?",
  "content": "Le \\textbf{logarithme népérien}, noté $\\ln$, est la fonction réciproque de l'exponentielle $e^x$.\\par\\smallskip Pour tout $x > 0$, $\\ln(x)$ est l'unique réel $y$ tel que $e^y = x$.\\par\\smallskip Autrement dit : $y = \\ln(x) \\Leftrightarrow e^{y} = x$"
}
```

---

### `theorem` — Énoncer un résultat majeur

**Quand l'utiliser** : le paragraphe source énonce un résultat avec des hypothèses et une conclusion, qui peut être démontré.

**Règles de rédaction** :
- Énoncer clairement les **hypothèses** avant la conclusion
- Mettre la formule centrale dans `\boxed{...}`
- Ne pas démontrer dans ce bloc — utiliser un bloc `proof` séparé si besoin
- **Aucun `\blank{}` dans ce bloc**

```json
{
  "type": "theorem",
  "title": "Pourquoi la dérivée de ln(x) donne 1/x ?",
  "content": "Pour tout $x > 0$, la fonction $\\ln$ est dérivable et :\\par\\smallskip$$\\boxed{(\\ln x)' = \\frac{1}{x}}$$"
}
```

---

### `property` — Donner une règle ou formule

**Quand l'utiliser** : le paragraphe source donne des formules ou règles directement utilisables dans les calculs.

**Règles de rédaction** :
- Regrouper les formules de même nature dans un seul bloc
- Utiliser `\begin{itemize}` pour les listes de formules
- Ajouter une courte explication après chaque formule si nécessaire
- **Aucun `\blank{}` dans ce bloc**

```json
{
  "type": "property",
  "title": "Comment ln transforme une multiplication en addition ?",
  "content": "Pour $a > 0$ et $b > 0$ :\\begin{itemize}\\item $\\ln(ab) = \\ln a + \\ln b$\\item $\\ln\\left(\\displaystyle\\frac{a}{b}\\right) = \\ln a - \\ln b$\\item $\\ln(a^n) = n\\ln a$ \\quad ($n \\in \\mathbb{Z}$)\\end{itemize}"
}
```

---

### Ancien `example` — Remplacé par `application`

Ne plus produire de bloc `"type": "example"`. Si le document montre un cas concret que l'élève doit travailler, utiliser `"type": "application"` avec `\qst{...}`, une correction et `"difficulty": 1..5`.

Si le document lit simplement un résultat déjà obtenu, sans blanks et sans travail actif de l'élève, utiliser `"type": "exploration"`.

```json
{
  "type": "application",
  "difficulty": 2,
  "content": "\\qst{Calculons le module de $z = 3 - 4\\mathrm{i}$.}\\par\\smallskip On applique la formule : $|z| = \\sqrt{3^2 + (-4)^2}=\\sqrt{\\blank{25}}=\\boxed{5}$."
}
```

---

### `application` - Exercice d'application actif

> Type JSON canonique : `"type": "application"`.
> Ajouter `"difficulty": 1..5` ; 1 = simple, 5 = exigeant. Les étoiles de difficulté s'affichent automatiquement à droite du cadre.

Pour plusieurs questions, poser l'énoncé dans `\qst{...}` puis numéroter avec `\begin{enumerate}`, `\item`, `\end{enumerate}`. Pour une question directe, `\qst{...}` suffit. `\question{...}` reste accepté comme alias long.

`\qst{...}` accepte beaucoup de contenu : contexte, plusieurs phrases, formules inline, petits paragraphes et liste `enumerate`. Après cette commande, écrire la correction en un seul bloc fluide. Pour plusieurs réponses, utiliser `\begin{enumerate}` dans la correction, jamais une nouvelle série de `\qst{...}`.


**Quand l'utiliser** : après chaque définition, théorème ou propriété importante — jamais intégré dedans.

C'est **le seul bloc qui contient des `\blank{}`**. Les autres blocs expliquent ; le bloc `application` force l'élève à raisonner, rédiger et calculer par lui-même.

#### Structure obligatoire en trois temps

1. **Exposer** — ouvrir avec `\qst{...}` : formuler la demande clairement (énoncé direct, ou énoncé commun + questions en `enumerate`)
2. **Corriger** — après `\qst{...}`, dérouler le calcul avec des connecteurs naturels : *On commence par...*, *Puisque...*, *On obtient...*, *D'où...*
3. **Conclure** — terminer par le résultat final, sans le mot « Conclusion » ni « D.A. » ni « D.E. »

**Règles strictes** :
- Toujours commencer par `\qst{...}` : *Montrons que...*, *Vérifions que...*, *Calculons...*, *Déterminons...*, *Simplifions...*
- Jamais de "Étape 1 :", "Étape 2 :", "D.A.", "D.E.", "Conclusion :"
- Les connecteurs remplacent les étiquettes : *puisque, donc, ainsi, d'où, on en déduit*
- L'exercice d'application doit être **typique** du concept illustré dans le bloc précédent
- Utiliser `\begin{align*}` pour les calculs en plusieurs lignes
- Champ `difficulty` obligatoire, entier entre `1` et `5`
- Badge et étoiles gérés automatiquement par le renderer : ne pas écrire les étoiles dans `content`

#### Structure JSON obligatoire

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{...}\\par\\smallskip ..."
}
```

#### Cas multi-questions

```json
{
  "type": "application",
  "difficulty": 4,
  "content": "\\qst{On considère une fonction $f$ définie sur $\\mathbb{R}$.\\par\\smallskip\\begin{enumerate}\\item Déterminer $f'(x)$.\\item Étudier le signe de $f'(x)$.\\item Dresser le tableau de variations de $f$.\\end{enumerate}}\\par\\smallskip\\begin{enumerate}\\item On calcule $f'(x)=...$.\\item On étudie son signe avec un tableau.\\item On en déduit les variations de $f$.\\end{enumerate}"
}
```

Choisir `difficulty: 1` ou `2` pour une question directe, `3` pour une application standard, `4` ou `5` pour plusieurs questions, un piège ou une synthèse.

#### `\qpart{N}` — Séparateur de parties visuelles

Quand une application est longue avec **2 à 4 parties distinctes**, utiliser `\qpart{N}` pour séparer chaque groupe. La commande crée un **badge centré** avec des lignes flanquantes (*——— PARTIE N ———*).

```json
{
  "type": "application",
  "difficulty": 4,
  "content": "\\qst{Soit $z = -1 + \\mathrm{i}\\sqrt{3}$.\\par\\smallskip\\begin{enumerate}\\item Calculer $|z|$ et $\\arg(z)$.\\item En déduire la forme exponentielle de $z$.\\end{enumerate}}\\par\\smallskip\\begin{enumerate}\\item On obtient $|z| = \\blank{2}$ et $\\arg(z) = \\blank{\\frac{2\\pi}{3}}$.\\item Donc $z = \\blank{2e^{\\mathrm{i}\\frac{2\\pi}{3}}}$.\\end{enumerate}"
}
```

**Règles** :
- Uniquement dans les blocs `application` avec au moins **2 parties distinctes**
- Complémentaire à `\begin{enumerate}` : `\qpart` sépare seulement de **grandes parties de correction**, `\item` sépare les sous-questions et leurs réponses
- Pas plus de **4 parties** (`\qpart{1}` à `\qpart{4}`)

#### Les `\blank{}` dans les applications

##### Règle des 3 à 5 blanks

| Nombre de blanks | Effet |
|:-:|:--|
| 1 – 2 | Trop peu |
| **3 – 5** | **Optimal** |
| 6 | Plafond absolu |
| 7+ | Interdit — découper en deux blocs `application` |

**Placement** : étape intermédiaire clé, valeur décisive (signe, fraction, exposant), conclusion. Jamais sur texte de liaison ni avant le contexte. Répartir un blanc par étape de raisonnement, en évitant les blancs voisins dans une même formule (`$\blank{2}\times\blank{3}=\blank{6}$`).

##### Blanks à éviter

| Anti-pattern | Exemple | Pourquoi c'est faux |
|:--|:--|:--|
| Blank sur du texte de liaison | `"On \\blank{applique} la formule..."` | Le verbe n'est pas un savoir mathématique |
| Blank trop tôt, avant le contexte | `"Calculons $\\ln(\\blank{x^2+1})$..."` | L'élève ne peut pas deviner ce qu'on cherche |
| Tous les blanks au même endroit | `"$\\blank{2} \\times \\blank{3} = \\blank{6}$"` | Rupture visuelle, continuité brisée |
| Blank sur un résultat trivial seul | `"$\\ln(e) = \\blank{1}$"` | Appartient à une `property`, pas à une application |

##### Exemple

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{Simplifions $\\ln\\left(\\dfrac{8e^2}{e}\\right)$.}\\par\\smallskip On sépare la fraction :\\begin{align*}\\ln\\left(\\frac{8e^2}{e}\\right) &= \\ln(8e^2) - \\blank{\\ln(e)} \\\\&= \\ln(8) + \\blank{2\\ln(e)} - 1 \\\\&= \\ln(8) + \\blank{2} - 1 \\\\&= \\blank{\\ln(8) + 1}\\end{align*}"
}
```

#### Formulations d'ouverture valides pour `\qst{}`

| Formulation | Usage |
|-------------|-------|
| `Calculons ...` | Calcul numérique ou algébrique |
| `Simplifions ...` | Réduction d'une expression |
| `Montrons que ...` | Vérification d'une égalité ou d'une propriété |
| `Vérifions que ...` | Contrôle d'un résultat |
| `Déterminons ...` | Trouver une valeur ou un objet |
| `Résolvons ...` | Résoudre une équation ou inéquation |
| `Étudions ...` | Analyser le comportement d'une fonction |

#### À bannir dans la résolution

```
❌ "Étape 1 :", "Étape 2 :"
❌ "D.A. :", "D.E. :"
❌ "Conclusion :", "On conclut que :"
❌ "ea X" ou toute notation non standard
```

---

### `exploration` — Paragraphe d'ouverture

**Rôle** : Ouvre une section — phrase d'accroche + exercice simple entièrement visible. Remplace le binôme `text` + `application` légère. Rendu texte brut, sans boîte ni badge.

**Règles JSON** :
- `"type": "exploration"` — pas de `"difficulty"` requis
- Contenu entièrement visible : pas de `\qpart{}`, pas de correction cachée
- Une seule question simple (`\qst{}`) — pas de difficulté progressive
- Max **3 `\blank{}`** — uniquement sur des prérequis déjà vus, jamais sur du contenu nouveau

**Choisir les bons `\blank{}`** :
- Le blank doit tomber sur une **valeur attendue sans réflexion** : résultat direct, formule connue, lecture d'une donnée
- Calibrage : **1 blank** = rappel pur ; **2–3 blanks** = légère sollicitation active
- Si la réponse nécessite un raisonnement → déplacer dans `application`

**Équilibrer le contenu** :
- Accroche ≤ 2 phrases ; question ≤ 2 lignes — rester court
- L'exercice doit être résolvable immédiatement avec ce qui précède
- Si le contenu grossit : couper en `text` + `application`

```json
{
  "type": "exploration",
  "title": "Pour commencer",
  "content": "On sait qu'un nombre complexe s'écrit $z = a + \\mathrm{i}b$ avec $a, b \\in \\mathbb{R}$.\\par\\smallskip\\qst{Identifier la partie réelle et la partie imaginaire de $z = -3 + 5\\mathrm{i}$.}\\par\\smallskip Partie réelle : $\\blank{-3}$ et partie imaginaire : $\\blank{5}$."
}
```

**Anti-patterns** :
```
❌ Après une application — exploration OUVRE, ne suit pas
❌ Exercice long ou difficile → utiliser application
❌ \blank{} sur du contenu nouveau jamais vu
❌ Plus de 3 blanks
```

---

### `warning` — Signaler une erreur fréquente

**Quand l'utiliser** : quand le document source ou le contexte indique un piège classique ou une confusion courante chez les élèves.

**Aucun `\blank{}` dans ce bloc.**

#### La phrase d'ouverture — obligatoire

Le bloc ne commence **jamais** par un libellé figé. Il s'ouvre par une phrase qui parle à l'élève, au « vous », terminée par « : ».

| À bannir | À écrire |
|:---------|:---------|
| `\textbf{Erreur fréquente :}` | *Une erreur très fréquente, que vous ne devez pas commettre :* |
| `\textbf{Erreur classique :}` | *C'est une erreur classique, ne la commettez pas :* |
| `\textbf{Erreurs fréquentes :}` (liste) | *Ces erreurs très fréquentes vous coûteront des points :* |
| `\textbf{Piège classique :}` | *Un piège classique dans lequel vous ne devez pas tomber :* |
| `\textbf{Attention :}` | *Attention, c'est ici que vous risquez de vous tromper :* |
| `\textbf{Point de vigilance :}` | *Le point de vigilance à ne pas oublier :* |
| `\textbf{À ne pas confondre :}` | *Deux choses à ne surtout pas confondre :* |

- **Accord du nombre** : une liste de plusieurs erreurs appelle une phrase au pluriel.
- **Varier** les formulations à l'intérieur d'une même fiche : répéter la même phrase recrée l'étiquette qu'on voulait supprimer.
- Le libellé **en milieu** de contenu (`\par\textbf{Piège :} ne pas oublier…`) reste accepté.

**Correct**

```json
{
  "type": "warning",
  "content": "Une erreur très fréquente, que vous ne devez pas commettre : ne confondez pas $\\ln(a + b)$ et $\\ln a + \\ln b$. La formule $\\ln(ab) = \\ln a + \\ln b$ s'applique à un \\textbf{produit}, pas à une somme."
}
```

**Interdit**

```json
{
  "type": "warning",
  "content": "\\textbf{Erreur fréquente :} ne confondez pas $\\ln(a + b)$ et $\\ln a + \\ln b$."
}
```

---

### `remark` — Ajouter une précision

**Quand l'utiliser** : complément utile qui ne mérite pas un bloc `definition` ou `property` à part entière.

**Aucun `\blank{}` dans ce bloc.**

```json
{
  "type": "remark",
  "content": "La fonction $\\ln$ n'est définie que pour $x > 0$. Elle n'existe pas en $x = 0$ ni pour $x < 0$."
}
```

---

### `text` — Introduire ou relier

**Quand l'utiliser** : **obligatoire en ouverture de chaque section de cours** (y compris `intro`). Il assure la continuité pédagogique entre les sections.

**Structure obligatoire du bloc `text` d'ouverture** — deux temps en une ou deux phrases :

1. **Rappel** — ce qu'on vient de voir ou ce qu'on sait déjà (ancrage avec le contenu précédent)
2. **Annonce** — ce que cette section va apporter (objectif clair et motivant)

**Règles de rédaction** :
- Maximum 2–3 phrases courtes
- Pas de formules mathématiques dans ce bloc
- Vocabulaire simple, ton direct
- Le rappel doit nommer explicitement le concept précédent

**Aucun `\blank{}` dans ce bloc.**

```
❌ "Nous allons maintenant étudier les propriétés."
✅ "On sait maintenant calculer une intégrale par la formule fondamentale F(b) − F(a).
    Certaines intégrales ne rentrent pas dans ce cadre : elles demandent une technique
    spéciale appelée intégration par parties."
```

```json
{
  "type": "text",
  "content": "On sait maintenant définir l'intégrale et calculer des primitives directes. Certaines intégrales d'un produit de deux fonctions nécessitent une technique spéciale : l'intégration par parties."
}
```

---

### `method` — Technique pratique et directe

**Quand l'utiliser** : quand le document explique *comment faire* une opération — pas ce qu'elle est.

La méthode expose une **recette concrète** : le texte dit quoi faire, dans quel ordre, sans blabla. Style livre de maths : concis, direct, destiné à des élèves.

**Règles** :
- Texte fluide avec `\par` et `\textbf{}` sur les mots-clés
- `\begin{itemize}` pour des cas distincts uniquement ; `\begin{enumerate}` si l'ordre compte
- Pas de `\step{}`, pas de numérotation d'étapes imbriquées
- Texte court : 3 à 6 phrases max
- Terminer par `\textbf{Astuce :}` ou `\textbf{Piège :}` si pertinent
- **Aucun `\blank{}` dans ce bloc**

```json
{
  "type": "method",
  "title": "Comment tester si un nombre est premier ?",
  "content": "Calculer $\\lfloor\\sqrt{n}\\rfloor$. Tester la divisibilité de $n$ par chaque premier $p \\leq \\lfloor\\sqrt{n}\\rfloor$.\\par Si aucun ne divise $n$, alors $n$ est premier."
}
```

```json
{
  "type": "method",
  "title": "Comment linéariser un produit trigonométrique ?",
  "content": "On transforme un \\textbf{produit} en \\textbf{somme}. Choisir la formule selon le type :\\begin{itemize}\\item $\\cos x \\cos y = \\frac{1}{2}[\\cos(x+y) + \\cos(x-y)]$\\item $\\sin x \\sin y = -\\frac{1}{2}[\\cos(x+y) - \\cos(x-y)]$\\item $\\sin x \\cos y = \\frac{1}{2}[\\sin(x+y) + \\sin(x-y)]$\\end{itemize}\\par Remplacer $x$ et $y$ par les arguments, puis simplifier."
}
```

```json
{
  "type": "method",
  "title": "Comment montrer qu'un entier divise une expression ?",
  "content": "On utilise la \\textbf{combinaison linéaire}. Si on sait que $a \\mid A$ et $a \\mid B$, alors $a$ divise toute expression $\\alpha A + \\beta B$ avec $\\alpha, \\beta \\in \\mathbb{Z}$.\\par \\textbf{Technique :} choisir $\\alpha$ et $\\beta$ pour \\textbf{éliminer la variable} et isoler une constante.\\par\\begin{itemize}\\item Si $a \\mid (12n+1)$ et $a \\mid (5n+3)$, poser $5 \\times (12n+1) - 12 \\times (5n+3) = -31$, donc $a \\mid 31$\\item Si l'expression est un polynôme en $n$, \\textbf{factoriser} : $n^3-1 = (n-1)(n^2+n+1)$ donne directement $(n-1) \\mid (n^3-1)$\\end{itemize}"
}
```

---

### `proof` — Démontrer rigoureusement

> **Bloc désactivé par défaut. Ne jamais produire de bloc `proof` sauf si l'utilisateur le demande explicitement.**

**Structure quand demandé** :
- Énoncer les données au début
- Numéroter les étapes avec `1.`, `2.`, `3.`
- Terminer directement par le résultat — sans le mot « Conclusion : »
- **Aucun `\blank{}` dans ce bloc**

```json
{
  "type": "proof",
  "title": "Pourquoi le produit de deux nombres pairs est-il pair ?",
  "content": "Soient $a$ et $b$ deux entiers pairs.\\par\\smallskip 1. Par définition, il existe $k, k' \\in \\mathbb{Z}$ tels que $a = 2k$ et $b = 2k'$.\\par 2. On calcule : $ab = (2k)(2k') = 4kk' = 2(2kk')$.\\par 3. En posant $K = 2kk'$, on a $ab = 2K$ avec $K \\in \\mathbb{Z}$, donc $ab$ est bien pair."
}
```

---

### `lemma` — Résultat intermédiaire

**Quand l'utiliser** : le document source présente un résultat auxiliaire nécessaire pour démontrer un théorème suivant, ou pour justifier une propriété.

**Règles de rédaction** :
- Toujours accompagné d'un `title` qui explique à quoi sert ce lemme
- Énoncer le résultat clairement avec ses conditions
- Le résultat principal dans `$$\boxed{...}$$` si c'est une formule
- **Aucun `\blank{}` dans ce bloc**

> **Bloc revealable** — le contenu est masqué par défaut, l'élève clique pour révéler.

```json
{
  "type": "lemma",
  "title": "Pourquoi peut-on écrire n comme produit de premiers ?",
  "content": "Tout entier $n \\geq 2$ s'écrit comme produit de nombres premiers.\\par\\smallskip Ce résultat est la base de la démonstration du théorème de divisibilité qui suit."
}
```

---

### `corollary` — Conséquence directe d'un théorème

**Quand l'utiliser** : le document présente un résultat qui découle immédiatement du théorème précédent, sans nouvelle démonstration.

**Règles de rédaction** :
- Toujours placé **juste après** le théorème dont il découle
- Le `title` doit rappeler le lien avec le théorème : *Qu'est-ce qu'on en déduit directement ?*
- **Aucun `\blank{}` dans ce bloc**

> **Bloc revealable** — le contenu est masqué par défaut, l'élève clique pour révéler.

```json
{
  "type": "corollary",
  "title": "Qu'est-ce qu'on déduit du théorème des valeurs intermédiaires ?",
  "content": "Si $f$ est continue sur $[a, b]$ et si $f(a) \\times f(b) < 0$, alors il existe au moins un réel $c \\in ]a, b[$ tel que $f(c) = 0$.\\par\\smallskip En pratique : si la courbe passe d'un côté à l'autre de l'axe, elle le coupe forcément."
}
```

---

### `consequence` — Implication ou application d'un résultat

**Quand l'utiliser** : le document tire une conclusion concrète ou pratique d'un résultat, souvent pour relier l'abstrait au concret ou signaler une application importante.

**Règles de rédaction** :
- Peut suivre un `theorem`, une `property` ou même plusieurs blocs combinés
- Le `title` doit répondre à : *Qu'est-ce que cela change concrètement ?*
- **Aucun `\blank{}` dans ce bloc**

> **Bloc revealable** — le contenu est masqué par défaut, l'élève clique pour révéler.

```json
{
  "type": "consequence",
  "title": "Que peut-on faire grâce à la dérivée ?",
  "content": "Si $f'(x) > 0$ sur un intervalle, alors $f$ est croissante sur cet intervalle.\\par\\smallskip Cela permet d'étudier le sens de variation d'une fonction sans tracer sa courbe."
}
```

---

### `technique` — Technique de calcul spécifique

**Quand l'utiliser** : le document présente une manière de traiter une forme d'expression particulière — plus ciblé qu'une méthode générale.

**Règles de rédaction** :
- Le `title` doit nommer la situation précise : *Comment traite-t-on... ?*
- Même style que `method` : texte fluide, `\textbf{}` sur les mots-clés, `\par` pour séparer, `\begin{itemize}` uniquement pour des cas distincts
- **Pas de `\step{}`**, pas de numérotation d'étapes
- **Aucun `\blank{}` dans ce bloc**

> **Bloc revealable** — le contenu est masqué par défaut, l'élève clique pour révéler.

```json
{
  "type": "technique",
  "title": "Comment factoriser une expression avec un facteur commun ?",
  "content": "Repérer le \\textbf{facteur commun} à tous les termes et le mettre en évidence devant une parenthèse.\\par Vérifier en développant que l'expression d'origine est retrouvée."
}
```

---

### `strategy` — Approche stratégique de haut niveau

**Quand l'utiliser** : le document explique comment choisir une méthode, quelle direction prendre, ou comment raisonner face à un type de problème — avant d'exécuter un calcul.

**Règles de rédaction** :
- Le `title` oriente vers une décision : *Comment choisit-on... ?*, *Par où commence-t-on... ?*
- Décrire la logique de décision, pas les étapes de calcul
- Même style que `method` : texte fluide, `\textbf{}` sur les mots-clés, `\par` pour séparer, `\begin{itemize}` uniquement pour des cas distincts
- **Pas de `\step{}`**, pas de numérotation d'étapes
- **Aucun `\blank{}` dans ce bloc**

> **Bloc revealable** — le contenu est masqué par défaut, l'élève clique pour révéler.

```json
{
  "type": "strategy",
  "title": "Comment choisir entre factorisation et développement ?",
  "content": "\\textbf{Objectif} : décider si on factorise ou si on développe.\\par\\begin{itemize}\\item Si l'expression contient un \\textbf{produit nul} ou une mise en facteurs évidente, on \\textbf{factorise}\\item Si l'expression contient des termes à réduire ou simplifier, on \\textbf{développe}\\item En cas de doute sur le signe d'une expression, on \\textbf{factorise} pour lire les racines\\end{itemize}"
}
```

---

### `intuition` — Image visuelle pour comprendre

**Quand l'utiliser** : pour donner une image géométrique, physique ou concrète qui aide à comprendre pourquoi un résultat est vrai — sans démonstration formelle.

**Règles de rédaction** :
- Ton accessible et imagé — l'élève doit visualiser quelque chose
- Pas de démonstration : expliquer *pourquoi ça a du sens*, pas *pourquoi c'est vrai*
- Peut suivre un `theorem` ou une `definition` difficile à saisir
- **Aucun `\blank{}` dans ce bloc**

> Contenu toujours visible (non-revealable). Rendu en italique avec bordure gauche bronze.

```json
{
  "type": "intuition",
  "content": "Imaginez que $f'(x)$ est la vitesse d'une voiture à l'instant $x$. Si la vitesse est positive, la voiture avance — la fonction monte. Si la vitesse est nulle, la voiture est à l'arrêt — c'est un extremum local."
}
```

---

### `summary` — Récapitulatif de fin de section

**Quand l'utiliser** : en fin de section ou de fiche, pour regrouper les formules ou résultats essentiels à retenir. Agit comme une mini-fiche dans la fiche.

**Règles de rédaction** :
- Utiliser `\begin{itemize}` pour les listes de formules à retenir
- Phrases très courtes ou formules seules — pas de nouvelles explications
- Ne pas répéter le contenu mot pour mot : synthétiser
- **Aucun `\blank{}` dans ce bloc**
- Maximum **1 bloc `summary`** par fiche, placé en fin de dernière section

> Contenu toujours visible (non-revealable). Rendu dans un encadré ivoire avec bordure bronze.

```json
{
  "type": "summary",
  "title": "Ce qu'il faut retenir sur ln",
  "content": "\\begin{itemize}\\item $\\ln(1) = 0$ et $\\ln(e) = 1$\\item $\\ln(ab) = \\ln a + \\ln b$\\item $\\ln(a/b) = \\ln a - \\ln b$\\item $\\ln(a^n) = n\\ln a$\\item $(\\ln x)' = \\frac{1}{x}$ pour $x > 0$\\end{itemize}"
}
```

---

### `culture` — Contexte historique ou scientifique

> **Maximum 2 blocs `culture` par fiche** (hors section `intro`).
> **Position obligatoire** : uniquement **au milieu** ou **en bas** de la fiche.

**Aucun `\blank{}` dans ce bloc.**

```json
{
  "type": "culture",
  "title": "Histoire : L'invention des logarithmes",
  "content": "John Napier inventa les logarithmes en 1614 pour simplifier les calculs astronomiques.",
  "media": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/6/60/John_Napier.jpg",
    "position": "right",
    "width": "22.5%",
    "caption": "John Napier (1550–1617)"
  }
}
```

---

## 8. Syntaxe LaTeX — Référence et Bonnes Pratiques

### Échappement JSON (obligatoire)

Tout backslash LaTeX doit être doublé dans le JSON.

| LaTeX réel | Dans le JSON |
|------------|--------------|
| `\frac{a}{b}` | `\\frac{a}{b}` |
| `\ln x` | `\\ln x` |
| `\sqrt{x}` | `\\sqrt{x}` |
| `\vec{u}` | `\\vec{u}` |
| `\textbf{mot}` | `\\textbf{mot}` |
| `\par` | `\\par` |
| `\begin{itemize}` | `\\begin{itemize}` |
| `\blank{réponse}` | `\\blank{réponse}` |

---

### Mise en valeur et encadrement

| Outil | Usage | Exemple JSON |
|-------|-------|--------------|
| `$$\\boxed{...}$$` | Résultat final d'un `theorem` ou formule clé d'un `property` | `$$\\boxed{(\\ln x)' = \\frac{1}{x}}$$` |
| `\\textbf{...}` | Nom d'un concept nouveau dans un `definition` | `\\textbf{logarithme népérien}` |
| `\\displaystyle\\frac{}{}` | Fraction lisible en ligne | `$\\displaystyle\\frac{1}{x}$` |
| `\\begin{align*}` | Calculs en plusieurs lignes alignés sur `=` | voir exemples |
| `\\par\\smallskip` | Saut de ligne avec espace entre deux idées | entre deux phrases distinctes |
| `\\blank{réponse}` | Active recall dans les blocs `application` et `exploration` | `$\\ln(e) = \\blank{1}$` |
| `\\qst{énoncé}` | Ouvrir un bloc `application` — obligatoire en première position | `\\qst{Calculons $f'(x)$.}` |
| `\\question{énoncé}` | Alias long de `\\qst{...}` | accepté pour compatibilité |
| `\\qpart{N}` | Séparateur de parties dans un `application` long (badge centré) | `\\qpart{1}`, `\\qpart{2}` |
| `\\mathqst{phrase}` | Mettre en valeur le cœur d'un titre de bloc | `"Comment \\mathqst{dériver un produit}"` |

**Règle** : Dans tout bloc `theorem` et `property`, le résultat principal doit toujours être dans `$$\\boxed{...}$$`.

---

### Tableaux — préférables mais avec sagesse

Les tableaux LaTeX (`\begin{array}`) sont **préférables** quand la lecture **croisée lignes × colonnes** apporte une information que du texte linéaire ne donne pas.

**Utiliser un tableau quand** :
- On compare plusieurs cas (signe de f', tableau de variation, valeurs remarquables)
- On présente un tableau de valeurs numérique
- On récapitule des formules en deux colonnes (formule / condition)

**Ne pas utiliser un tableau quand** :
- Une simple liste `\begin{itemize}` suffit
- Le tableau n'a qu'une seule colonne de contenu (c'est une liste déguisée)
- Il y a seulement 2 éléments à présenter

```
Tableau simple (valeurs) :
$$\\begin{array}{|c|c|c|c|}\\hline x & 0 & 1 & e \\\\\\hline \\ln x & -\\infty & 0 & 1 \\\\\\hline\\end{array}$$

Tableau de signes :
$$\\begin{array}{|c|cccc|}\\hline x & 0 & & 1 & \\\\\\hline f'(x) & & + & & - \\\\\\hline\\end{array}$$
```

---

### Listes `\itemize` et `\enumerate`

**`\begin{enumerate}`** — à utiliser quand l'ordre compte :
- Étapes d'un raisonnement
- Cas à traiter en séquence
- Procédure où chaque point dépend du précédent

**`\begin{itemize}`** — à utiliser quand l'ordre n'importe pas :
- Liste de formules
- Propriétés équivalentes
- Points de rappel sans dépendance entre eux

**Combinaison recommandée** :
- `\begin{enumerate}` principal pour la structure globale
- `\begin{itemize}` à l'intérieur d'un item pour les sous-cas

**Règles d'usage** :
- Pas plus de **2 niveaux d'imbrication** — la sous-liste se ferme par son propre `\end{enumerate}` (ou `\end{itemize}`) et la liste principale par le sien ; le moteur apparié les fermetures par profondeur, ne pas « fermer tôt ».
- **Numérotation automatique** : la liste principale est numérotée `1.` `2.` `3.`, une sous-liste dans un `\item` est numérotée `a.` `b.` `c.` (puis `i.` `ii.` au troisième niveau). Ne jamais écrire « (a) » ou « 1) » soi-même : le marqueur généré ferait doublon.
- Une liste ne doit pas avoir **un seul item** — utiliser une phrase directe à la place

---

### Structures de référence

```
Saut de paragraphe avec espace :
\\par\\smallskip

Calculs alignés sur le signe = :
\\begin{align*}
  f(x) &= \\ln(x^2) \\\\
       &= 2\\ln x
\\end{align*}

Formule encadrée (résultat principal) :
$$\\boxed{formule}$$

Blank d'active recall (application et exploration) :
\\blank{réponse}

Question ouvrant un bloc application :
\\qst{Calculons $f'(x)$.}

Séparateur de parties (application longue) :
\\qpart{1}

Titre de bloc enrichi :
"Comment \\mathqst{dériver un produit de deux fonctions}"

Fraction lisible en ligne :
$\\displaystyle\\frac{a}{b}$

Nom de concept (première occurrence) :
\\textbf{nom du concept}

Tableau de valeurs :
$$\\begin{array}{|c|c|}\\hline x & f(x) \\\\\\hline\\end{array}$$
```

> **Deux pièges de tableau** — le premier est réparé automatiquement au rendu, le second non :
>
> 1. **Une ligne qui commence par `[`** — `\\` accepte un argument optionnel de dimension (`\\[2pt]`), donc `\\[0,1] & …` est lu comme un espacement : KaTeX répond `Invalid size`. Le moteur insère la parade au rendu, mais on écrit la forme explicite `{} \\ {}[0,1] & …` pour garder un source lisible. Un crochet **fermant** (`]0,1[`) n'est pas concerné, ni `\\ \hline[0,1]` (rien de collé).
> 2. **`\end{enumerate}` visible en clair** — environnement mal fermé ou sous-liste fermée trop tôt. Le moteur apparie les fermetures **par profondeur** : chaque `\begin{...}` a son `\end{...}`.
>
> `npm run validate:content` signale les deux (règles 14 et 15) ; `node tmp/check-math-katex.mjs <fiche.json>` liste les formules fautives.

---

## 9. Images et Médias

### Images locales (schémas du cours)

```
public/data/[classe]/pictures/[nom_schema].png
```

```json
{
  "src": "/data/1ere-bac-sc-math/pictures/barycentre_schema.png",
  "alt": "Schéma du barycentre de deux points",
  "width": "60%",
  "caption": "Construction du barycentre G de (A,2) et (B,3)"
}
```

### Média attaché à un bloc

Le champ `media` se place au niveau du bloc, jamais de la section :

```json
{
  "type": "definition",
  "title": "...",
  "content": "...",
  "media": {
    "src": "https://url-image.jpg",
    "position": "right",
    "width": "22.5%",
    "caption": "Description courte",
    "style": { "shadow": true, "border": true }
  }
}
```

Positions prises en charge : `top`, `bottom`, `left`, `right`, `inline`,
`inline-right`, `float-left` et `float-right` — **il n'existe pas de
`center`**, une valeur inconnue retombe silencieusement sur `top`.

### Figures vectorielles (SVG / TikZ)

Pour un **schéma mathématique** — courbe avec asymptote, tangente, image d'un
intervalle, tableau de variations — ne pas dessiner un PNG : la figure doit
porter des libellés en Computer Modern comme le texte composé par KaTeX.

> **`docs/GUIDE_SVG_TIKZ.md`** — chaîne complète : polices embarquées, palette
> du projet, pointe `stealth`, grille bornée, aire de tracé, placement des
> étiquettes, les trois pièges qui passent l'œil, et les quatre commandes de
> validation. Le § 0 en tête est la liste des consignes à relire.

Deux règles à retenir tout de suite :

- **la prose ne va jamais dans l'image** (aucune police KaTeX n'a de caractère
  accentué) : elle va dans `media.caption`, que l'application compose avec le
  LaTeX et les accents ;
- **`width` doit suivre la largeur du `viewBox`** (`width % = viewBox × 0,1468`,
  plafonné à 100 %), sinon les libellés des figures d'une même fiche n'ont pas
  la même taille apparente.

### Média d'un bloc repliable

Sur un bloc `definition`, `theorem`, `property`, `method`… le média est rendu
**dans le panneau de révélation** : la figure reste cachée jusqu'au clic. Pour
qu'elle soit visible d'emblée, la rattacher à un bloc toujours visible
(`text`, `warning`, `remark`, `application`).

---

## 10. Graphes Interactifs

```json
{
  "type": "theorem",
  "title": "...",
  "content": "...",
  "graphId": "ln_courbe",
  "graphCaption": "Courbe interactive de ln(x)"
}
```

Deux types disponibles : **`geometry`** (points, courbes, annotations) et **`intuition`** (graphe pédagogique).

---

## 11. Ordre Typique des Blocs dans une Section

```
Section 0 — intro (TOUJOURS en premier)
  └── culture        → savant ou objet Wikipedia
  └── text           → (recommandé) approche pédagogique concrète

Section 1, 2, 3... — sections de cours
  1. exploration    → RECOMMANDÉ : accroche + exercice de rappel pour ouvrir le paragraphe
     ou text        → si le contenu est purement déclaratif (aucune mise en activité possible)
  2. definition      → concept nouveau (noms en gras, aucun blank)          [revealable]
     └── intuition   → image visuelle pour comprendre la définition
  3. application     → application directe de la définition (3–5 blanks)
  4. theorem         → résultat clé avec hypothèses et conclusion            [revealable]
     └── lemma       → résultat intermédiaire si nécessaire                  [revealable]
     └── proof       → démonstration (si explicitement demandé)
     └── corollary   → conséquence immédiate du théorème                     [revealable]
     └── consequence → implication concrète ou application                   [revealable]
  5. property        → formules et règles de calcul                          [revealable]
   6. technique       → technique de calcul pour un type d'expression         [revealable]
     ou method       → procédure générale étape par étape                   [revealable]
     ou strategy     → approche stratégique de haut niveau                  [revealable]
  7. application         → application des propriétés (3–5 blanks)
  8. warning         → piège ou erreur fréquente (aucun blank)
  9. remark          → nuance ou complément (aucun blank)
 10. summary         → récapitulatif en fin de dernière section (max 1/fiche)
```

**Récapitulatif des blocs revealables** (contenu masqué par défaut, l'élève clique pour révéler) :
`definition` · `theorem` · `property` · `lemma` · `corollary` · `consequence` · `technique` · `method` · `strategy`

**Blocs toujours visibles** (non-revealable) :
`application` · `exploration` · `warning` · `remark` · `proof` · `intuition` · `summary` · `culture` · `text` · `graph`

> Le bloc `exploration` est **recommandé en ouverture de chaque section** — il remplace `text` quand un exercice de rappel est pertinent. Utiliser `text` uniquement si le contenu est trop simple pour justifier un exercice préparatoire.
> Les blocs `application` **et** `exploration` peuvent contenir des `\blank{}`. L'exploration en a au maximum 3, ciblés sur des prérequis déjà connus.
> `lemma`, `corollary`, `consequence` n'apparaissent que si le document source les présente explicitement.

---

## 12. Exemple Complet

```json
{
  "header": {
    "title": "Le Logarithme Népérien",
    "subtitle": "Définition, propriétés et calculs",
    "context": "2BAC Sciences"
  },
  "sections": [
    {
      "id": "intro",
      "category": "course",
      "title": "Introduction",
      "blocks": [
        {
          "type": "text",
          "content": "Comment simplifier des calculs avec de très grands nombres ? Les logarithmes sont nés pour répondre à cette question, et ils sont aujourd'hui au cœur de l'analyse mathématique."
        },
        {
          "type": "culture",
          "title": "Qui a inventé les logarithmes ?",
          "content": "Le mathématicien écossais John Napier publie les logarithmes en 1614. Son objectif : simplifier les calculs astronomiques très longs. À l'époque, multiplier de grands nombres prenait des heures. Avec les logarithmes, une multiplication devient une simple addition.",
          "media": {
            "src": "https://upload.wikimedia.org/wikipedia/commons/6/60/John_Napier.jpg",
            "position": "right",
            "width": "22.5%",
            "caption": "John Napier (1550–1617)"
          }
        }
      ]
    },
    {
      "id": "definition_ln",
      "category": "course",
      "title": "Définition et premières valeurs",
      "blocks": [
        {
          "type": "text",
          "content": "On va définir une nouvelle fonction : le logarithme népérien. C'est la fonction réciproque de l'exponentielle."
        },
        {
          "type": "definition",
          "title": "Qu'est-ce que ln(x) veut dire ?",
          "content": "Le \\textbf{logarithme népérien}, noté $\\ln$, est la fonction réciproque de l'exponentielle $e^x$.\\par\\smallskip Pour tout $x > 0$, $\\ln(x)$ est l'unique réel $y$ tel que $e^y = x$.\\par\\smallskip Autrement dit : $y = \\ln(x) \\Leftrightarrow e^{y} = x$"
        },
        {
          "type": "application",
          "difficulty": 3,
          "content": "\\qst{Calculons $\\ln(e^3)$ et $e^{\\ln 5}$.}\\par On applique la définition de la fonction réciproque :\\begin{align*}\\ln(e^3) &= \\blank{3} \\\\e^{\\ln 5} &= \\blank{5}\\end{align*}Puisque ln et exp se défont mutuellement, on retrouve \\blank{l'exposant} dans le premier cas et \\blank{l'argument} dans le second."
        },
        {
          "type": "property",
          "title": "Quelles valeurs de ln faut-il connaître par cœur ?",
          "content": "Deux valeurs fondamentales :\\begin{itemize}\\item $\\ln(1) = 0$ \\quad car $e^0 = 1$\\item $\\ln(e) = 1$ \\quad car $e^1 = e$\\end{itemize}"
        },
        {
          "type": "warning",
          "content": "$\\ln(x)$ n'existe que pour $x > 0$. Les expressions $\\ln(0)$ et $\\ln(-1)$ n'ont pas de sens."
        }
      ]
    },
    {
      "id": "proprietes_ln",
      "category": "course",
      "title": "Propriétés algébriques",
      "blocks": [
        {
          "type": "text",
          "content": "On sait maintenant ce que signifie ln(x) et ses valeurs de base. On étudie maintenant comment ln se comporte avec les opérations algébriques."
        },
        {
          "type": "property",
          "title": "Comment ln transforme une multiplication en addition ?",
          "content": "Pour tout $a > 0$ et $b > 0$ :\\begin{itemize}\\item $\\ln(ab) = \\ln a + \\ln b$\\item $\\ln\\left(\\displaystyle\\frac{a}{b}\\right) = \\ln a - \\ln b$\\item $\\ln(a^n) = n\\ln a$ \\quad ($n \\in \\mathbb{Z}$)\\end{itemize}"
        },
        {
          "type": "application",
          "difficulty": 3,
          "content": "\\qst{Simplifions $\\ln(48)$.}\\par On décompose $48$ en facteurs premiers : $48 = 2^{\\blank{4}} \\times \\blank{3}$. On applique les propriétés de ln :\\begin{align*}\\ln(48) &= \\ln(2^4 \\times 3) \\\\&= \\blank{\\ln(2^4) + \\ln(3)} \\\\&= \\blank{4\\ln 2 + \\ln 3}\\end{align*}"
        },
        {
          "type": "warning",
          "content": "Ne confondez pas $\\ln(a + b)$ et $\\ln a + \\ln b$. La formule $\\ln(ab) = \\ln a + \\ln b$ s'applique à un \\textbf{produit}, pas à une somme."
        }
      ]
    }
  ]
}
```

---

## 13. Principes de Qualité

---

### 13.1 — Tableaux avec discernement

**Tableaux à garder** :
- Tableaux d'opérations sur les limites (avec formes indéterminées)
- Tableaux de variation et tableaux de signes
- Tableaux de valeurs numériques (x → f(x))
- Tableaux récapitulatifs en fin de section
- Tableaux de comparaison à deux colonnes (formule / condition)

**Tableaux à convertir** en liste ou `\begin{itemize}` :
- Méthodes présentées en tableau : utiliser `\begin{itemize}` avec style direct
- Propriétés simples listées en tableau à une colonne → utiliser `\begin{itemize}`
- Exemples forcés en tableau → rédiger en texte fluide avec `\begin{align*}`

**Test rapide** : si le tableau n'a qu'**une seule colonne de contenu**, c'est une liste déguisée — la convertir.

---

### 13.2 — Harmonisation du formatage LaTeX

- `\par\smallskip` entre deux idées distinctes, jamais `\\` seul
- `\begin{align*}` pour tout calcul multi-lignes
- `\lim_{x \to a}` et non `x → a` — **jamais de flèche « tend vers »** (`\longrightarrow`, `\xrightarrow`) dans un contexte de limite
- Exception : la flèche de **type d'application** (`f : \mathbb{R} \longrightarrow \mathbb{R}`) reste correcte
- `\ln`, `\cos`, `\sin` et non `ln`, `cos`, `sin` en italique
- `\forall`, `\exists`, `\in` dans les formules

---

## 14. Checklist Finale

Avant de livrer le JSON, vérifier chaque point :

**Structure**
- [ ] La fiche commence par une section `intro` avec un bloc `text` suivi d'un bloc `culture`
- [ ] Le bloc `text` d'intro pose le sujet en 1-2 phrases (pas de formule)
- [ ] Le bloc `culture` contient une image Wikipedia (lien direct `upload.wikimedia.org`)
- [ ] L'image représente un savant lié au sujet ou un objet/phénomène concret
- [ ] Le texte `culture` fait 3 à 5 phrases courtes, lien avec technologie/nature/médecine...

**Analyse**
- [ ] Tout le chapitre a été lu avant de commencer la rédaction
- [ ] Chaque paragraphe a été classifié selon le tableau de Phase 1
- [ ] `definition`, `theorem`, `property` bien distingués (§ Phase 2)
- [ ] `method`, `technique`, `strategy` bien distingués — ne pas interchanger
- [ ] `lemma`, `corollary`, `consequence` utilisés **uniquement** si le document source les présente explicitement
- [ ] `intuition` utilisé pour donner une image, pas pour démontrer
- [ ] `summary` présent au maximum une fois, en fin de dernière section

**Contenu**
- [ ] Aucun contenu inventé — tout vient du document source
- [ ] Chaque section (sauf `intro`) commence par un bloc `text` avec rappel + annonce
- [ ] Le rappel nomme explicitement le concept vu avant
- [ ] Les noms de concepts nouveaux sont en `\textbf{...}` dans les `definition`
- [ ] Aucun nouveau bloc n'utilise `"type": "example"` ; utiliser `application` ou `exploration`
- [ ] `\qpart{N}` utilisé uniquement dans les blocs `application` avec plusieurs parties distinctes (max 4)
- [ ] Chaque bloc `application` commence par `\qst{...}` ou `\question{...}`
- [ ] Chaque bloc `application` contient `"difficulty": 1..5`
- [ ] Aucun "Étape 1 :", "D.A.", "D.E.", "Conclusion :" dans les applications
- [ ] Chaque application est typique du concept du bloc qui le précède

**Blanks — règles strictes**
- [ ] Les `\blank{}` apparaissent uniquement dans `application` (3–5 blanks) et `exploration` (1–3 blanks)
- [ ] Aucun blank dans `definition`, `theorem`, `property`, `lemma`, `corollary`, `consequence`, `technique`, `strategy`, `method`, `proof`, `intuition`, `summary`, `warning`, `remark`, `text`, `culture`
- [ ] Chaque bloc `application` contient entre **3 et 5 blanks**
- [ ] Les blanks sont répartis sur l'ensemble de l'application — pas tous groupés
- [ ] Les blanks portent sur des moments clés : étape intermédiaire, signe décisif, conclusion
- [ ] Aucun blank sur du texte de liaison (verbes, connecteurs)
- [ ] Aucun blank avant que le contexte soit posé
- [ ] Chaque blank teste une compétence différente (pas trois blanks sur la même opération)

**Titres**
- [ ] Lus depuis le contenu — question directe ciblée sur l'idée principale
- [ ] Mots simples, max 12 mots, pas de jargon

**Garde-fous (`warning`)**
- [ ] Aucun bloc ne s'ouvre par un libellé figé (`\textbf{Erreur fréquente :}`, `\textbf{Attention :}`, `\textbf{Piège classique :}`…)
- [ ] Chaque bloc s'ouvre par une phrase au « vous », terminée par « : «
- [ ] Une liste d'erreurs est introduite par une phrase au pluriel
- [ ] Les formulations varient à l'intérieur d'une même fiche

**Déclaration du chapitre**
- [ ] La fiche est bien placée dans `[niveau]/[chapitre]/revisions/`
- [ ] Elle est déclarée dans le manifeste de **classe** et dans celui du **chapitre**
- [ ] Si le chapitre porte plusieurs fiches, l'ordre du tableau `revisions` est respecté (la fiche principale reste en premier)
- [ ] `npm run validate:content` ne signale ni contenu inatteignable ni chapitre non déclaré

**Style**
- [ ] Phrases courtes (max 15–20 mots)
- [ ] Vocabulaire simple adapté aux non-francophones
- [ ] Pas de flèches « → » dans le texte

**Technique**
- [ ] JSON valide (tester avec un parser)
- [ ] `difficulty` est un nombre JSON (`3`), jamais une chaîne (`"3"`)
- [ ] Tous les backslashes LaTeX doublés (`\\`)
- [ ] `method` / `technique` / `strategy` : style direct avec `\par`, sans `\step{}` ; utiliser `\begin{enumerate}` si l'ordre compte, sinon `\begin{itemize}`
- [ ] Résultats principaux dans `$$\\boxed{...}$$` (tout `theorem` et `property` clé)
- [ ] Noms de concepts en `\\textbf{...}` à leur première apparition dans les `definition`
- [ ] Tableaux utilisés seulement quand la structure tabulaire apporte une vraie clarté
- [ ] Listes `\itemize` / `\enumerate` choisies selon que l'ordre compte ou non
- [ ] Combinaison bien appliquée si nécessaire : `enumerate` principal + `itemize` pour les sous-cas
- [ ] Pas plus de 2 niveaux d'imbrication dans les listes
- [ ] Aucun bloc `proof` sauf si explicitement demandé
- [ ] Max 2 blocs `culture` hors intro — placés au milieu ou en bas de la fiche
- [ ] Médias placés au niveau du bloc
- [ ] Progression logique des sections conforme au document source

**Qualité et harmonisation (§13)**
- [ ] Tableaux utilisés avec discernement : garder les vrais tableaux, convertir les listes déguisées
- [ ] Introduction enrichie : culture + approche pédagogique concrète
- [ ] Chaque section a au moins un bloc `application` — aucune section sans exercice d'application
- [ ] Applications typiques avec 3–5 blanks stratégiques, `\qst{}`, connecteurs naturels
- [ ] Transitions directes et explicites — nommer le concept précédent, annoncer l'objectif
- [ ] Transitions variées — pas toujours « Maintenant que... »
- [ ] `\par\smallskip` pour les sauts, jamais `\\` seul entre deux idées
- [ ] `\begin{align*}` pour tout calcul multi-lignes
- [ ] Notation formelle : `\lim`, `\ln`, `\forall` — pas de flèches ou texte informel dans les formules
- [ ] Blocs `culture` vivants — anecdotes concrètes, applications modernes, paradoxes
