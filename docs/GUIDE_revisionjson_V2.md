# GUIDE PÉDAGOGIE V2 — Types, Choix et Volume
### Comment choisir le bon bloc, le bon ton et le bon volume pour chaque idée

> Les exercices d'application sont des démonstrations guidées complètes.
> Ce guide se concentre sur **trois axes** : la pédagogie, le choix du type de bloc et le volume de contenu.

---

## 0. Philosophie — Le changement de paradigme

L'élève lit un raisonnement **complet, structuré, fluide**. Chaque étape est visible et expliquée. L'élève comprend *pourquoi* on fait chaque calcul, pas juste *quoi* écrire. La validation des acquis se fait via les quiz (`quiz.json`) et exercices (`exercices.json`).

---

## 1. Mission et Public

**Mission** : produire une fiche de révision qui soit un **manuel scolaire miniature**, suffisant pour qu'un élève révise, comprenne et maîtrise le chapitre.

**Public** : élèves marocains et tunisiens du lycée (TC, 1BAC, 2BAC). Français langue seconde. Niveau moyen à bon.

**Posture du rédacteur** : un enseignant expérimenté qui rédige un excellent manuel. Précis, clair, chaleureux, exigeant. Ni transcripteur, ni résumeur automatique.

---

## 2. Règles Absolues

> Ces règles ne souffrent aucune exception.

1. **Ne jamais inventer de contenu.** Chaque bloc provient du document source.
2. **Les exercices d'application sont toujours dans des blocs `application` séparés.** Jamais dans un `definition`, `property` ou `theorem`.
3. **Chaque bloc `application` contient `"difficulty": 1..5`.** Utiliser un nombre JSON, pas une chaîne. Choisir `3` par défaut si le niveau n'est pas explicite.
4. **Ne jamais utiliser le tiret long `—`.** Utiliser `,` `;` `:` `(...)` ou reformuler.
5. **Ne jamais utiliser `arctan`, `arcsin`, `arccos`.** Hors programme.
6. **Ne jamais utiliser `Z` majuscule pour un nombre complexe.** Toujours `z`, `w`, `u`, `v`.
7. **Ne jamais utiliser `\checkmark` (`✓`).** Utiliser des mots.
8. **Ne jamais utiliser `Étape 1 :`, `Étape 2 :`...** dans les applications. Utiliser des connecteurs naturels.
9. **Ne jamais utiliser `D.A.`, `D.E.`, `Conclusion :`.** Conclure directement.
10. **Pas de bloc `summary` ni `strategy`.** Utiliser `method` ou `technique`.
11. **Pas de flèches `→` `⇒` pour remplacer des mots.** Réservées aux formules.
12. **Tout repère doit être introduit** dans le bloc `text` d'ouverture.
13. **Ne jamais écrire `\def\arraystretch{...}`** dans le JSON (auto-injecté par le renderer).
14. **Toujours utiliser `\overrightarrow{}`** pour les vecteurs, jamais `\vec{}`.

---

## 3. L'Art du Choix — Quel type pour quelle idée ?

> C'est la décision la plus importante. Un mauvais choix de type rend la fiche confuse.

### Arbre de décision

```
Le paragraphe source...

├─ Introduit un NOUVEAU CONCEPT avec une caractérisation précise ?
│  └─ → definition
│
├─ Énonce un RÉSULTAT MAJEUR (hypothèses → conclusion) ?
│  ├─ Résultat fondamental du chapitre ?
│  │  └─ → theorem
│  ├─ Conséquence immédiate d'un théorème juste au-dessus ?
│  │  └─ → corollary
│  ├─ Résultat intermédiaire pour une preuve ?
│  │  └─ → lemma
│  └─ Implication concrète ou application notable ?
│     └─ → consequence
│
├─ Donne une FORMULE ou RÈGLE directement utilisable ?
│  └─ → property
│
├─ Montre un CALCUL CONCRET sur un cas particulier ?
│  └─ → application
│
├─ Décrit une PROCÉDURE pour résoudre un type de problème ?
│  ├─ Recette générale applicable à une famille d'exercices ?
│  │  └─ → method
│  └─ Technique de calcul pour une forme d'expression précise ?
│     └─ → technique
│
├─ PROUVE rigoureusement un résultat ? (uniquement si demandé)
│  └─ → proof
│
├─ Donne une IMAGE VISUELLE ou une analogie intuitive ?
│  └─ → intuition
│
├─ Signale un PIÈGE ou une ERREUR FRÉQUENTE ?
│  └─ → warning
│
├─ Apporte une NUANCE, une précision, un complément ?
│  └─ → remark
│
├─ Fait la LIAISON entre deux sections ?
│  └─ → text
│
└─ Relie les maths au MONDE RÉEL ou à l'HISTOIRE ?
   └─ → culture
```

### Les confusions fréquentes

| Situation ambiguë | Mauvais choix | Bon choix | Pourquoi |
|:--|:--|:--|:--|
| "Pour tout $x > 0$, $\ln(xy) = \ln x + \ln y$" | `theorem` | `property` | C'est une règle de calcul, pas un résultat avec preuve |
| "$\ln$ est la réciproque de $e^x$" | `property` | `definition` | C'est la caractérisation fondatrice du concept |
| "Calculons $\ln(e^3 \times e^2)$" | `property` | `application` | C'est un calcul concret sur des valeurs |
| "Le signe de $f'(x)$ permet de lire les variations" | `remark` | `exploration` | C'est l'usage guidé d'un résultat déjà établi |
| "Pour simplifier $\ln$, utiliser les propriétés algébriques" | `remark` | `method` | C'est une procédure, pas un commentaire |
| "$\ln(a+b) \neq \ln a + \ln b$" | `remark` | `warning` | C'est un piège à signaler |
| "TVI : si $f$ continue sur $[a,b]$..." | `property` | `theorem` | C'est un résultat majeur avec hypothèses |
| "La composée de fonctions continues est continue" | `theorem` | `property` | C'est une règle opératoire, pas un résultat central |

### Règle de départage

Quand tu hésites entre deux types :
1. **`definition` vs `property`** : le concept est-il *nommé pour la première fois* ? → `definition`. Sinon → `property`.
2. **`theorem` vs `property`** : le résultat est-il *surprenant* et nécessite-t-il une preuve ? → `theorem`. Est-il *évident une fois la définition posée* ? → `property`.
3. **`method` vs `technique`** : la procédure s'applique-t-elle à une *famille de problèmes* ? → `method`. À une *forme d'expression précise* ? → `technique`.
4. **`warning` vs `remark`** : l'élève risque-t-il de *se tromper* ? → `warning`. C'est juste une *précision utile* ? → `remark`.
5. **`corollary` vs `consequence`** : le résultat découle-t-il *immédiatement* du théorème précédent (une ligne) ? → `corollary`. A-t-il des *implications pratiques* qui méritent explication ? → `consequence`.

---

## 4. Volume — Combien de contenu par bloc ?

> Le volume est la clé de la lisibilité. Trop court = inutile. Trop long = illisible.

### Jauge par type de bloc

| Type | Volume cible | Phrases | Formules max | Ton |
|:-----|:-------------|:--------|:-------------|:----|
| `intro` | 3-4 phrases | 3-4 | 1 emblématique | Motivant |
| `text` | 2-3 phrases | 2-3 | 0 | Transition douce |
| `definition` | 2-4 phrases | 2-4 | 1-2 | Précis, formel |
| `theorem` | 2-3 phrases | 2-3 | 1 encadrée | Solennel |
| `property` | 1-3 phrases + liste | 1-3 | 2-5 (itemize) | Direct |
| `application` | 5-12 lignes | 3-6 | 3-8 (align) | Guidé, fluide |
| `exploration` | 3-6 lignes | 2-4 | 1-3 | Lecture, déduction |
| `method` | 3-6 phrases | 3-6 | 1-2 | Pratique, concis |
| `technique` | 2-4 phrases | 2-4 | 1-2 | Ciblé |
| `warning` | 2-3 phrases | 2-3 | 1-2 | Alerte |
| `remark` | 1-3 phrases | 1-3 | 0-1 | Nuancé |
| `intuition` | 2-3 phrases | 2-3 | 0-1 | Imagé |
| `culture` | 3-5 phrases | 3-5 | 0 | Accessible |
| `proof` | 5-15 lignes | 4-10 | 3-8 | Rigoureux |
| `lemma` | 2-3 phrases | 2-3 | 1 encadrée | Auxiliaire |
| `corollary` | 1-2 phrases | 1-2 | 1 | Bref |
| `consequence` | 2-4 phrases | 2-4 | 1-2 | Concret |

### Volume par section

| Élément | Minimum | Maximum | Idéal |
|:--------|:--------|:--------|:------|
| Blocs par section | 3 | 8 | 5-6 |
| Sections par fiche | 3 | 10 | 5-7 |
| Blocs `culture` par fiche (hors intro) | 0 | 2 | 1 |
| Blocs `application` par section | 1 | 3 | 1-2 |
| Blocs `warning` par section | 0 | 2 | 0-1 |
| Blocs `remark` par section | 0 | 2 | 0-1 |

### Le test du "trop long"

Si un bloc dépasse ces seuils, il faut le **découper** :

| Signal d'alerte | Action |
|:--|:--|
| Une `definition` fait plus de 5 phrases | Séparer en `definition` + `remark` ou `property` |
| Un `theorem` contient des applications | Extraire les exercices dans des blocs `application` |
| Un `application` dépasse 15 lignes | Le scinder en 2 applications plus courtes |
| Une `method` dépasse 8 phrases | Vérifier qu'elle ne mélange pas 2 techniques |
| Un `warning` fait plus de 4 phrases | L'essentiel du piège doit tenir en 2 phrases |

### Le test du "trop court"

| Signal d'alerte | Action |
|:--|:--|
| Un bloc `text` fait une seule phrase banale | Enrichir avec le rappel ou l'annonce manquante |
| Un `application` ne montre qu'un seul calcul trivial | Choisir une application plus riche ou supprimer |
| Une `method` dit "appliquer la formule" | Détailler les étapes concrètes |

---

## 5. Pédagogie — Comment bien rédiger chaque type

### 5.1 `text` — Le pont entre les sections (OBLIGATOIRE en 1er)

**Rôle** : ancrer l'élève dans la progression. Deux temps :
1. Rappel de ce qui précède
2. Annonce de ce qui vient

**Volume** : 2-3 phrases. Aucune formule mathématique.

```json
{
  "type": "text",
  "content": "On sait maintenant calculer une intégrale par la formule F(b) - F(a). Certaines intégrales d'un produit de deux fonctions nécessitent une technique spéciale : l'intégration par parties."
}
```

**Règle** : si le document source contient des "activités", les assimiler et les résumer comme intro de la section concernée. Contenu ciblé et concis.

---

### 5.2 `definition` — Nommer et caractériser

**Rôle** : introduire un concept avec sa caractérisation précise.

**Recette** :
1. Nom du concept en `\textbf{}` à sa première apparition
2. Notation : comment on l'écrit ($\ln$, $z = a + ib$...)
3. Caractérisation : la condition qui définit le concept
4. Domaine : sur quoi ça s'applique ($x > 0$, $z \in \mathbb{C}$...)

**Ne pas mélanger** :
- Définition + propriétés → séparer en 2 blocs
- Définition + application → séparer en 2 blocs. **Ne JAMAIS mettre d'exercice d'application à l'intérieur d'une `definition`**.

**Enrichissement** : Mettre systématiquement les **mots-clés en gras** pour guider la lecture.

**Bloc revealable** (masqué, l'élève clique).

```json
{
  "type": "definition",
  "title": "Continuité en un point",
  "content": "Soit $f$ une fonction définie au voisinage de $a$. On dit que $f$ est \\textbf{continue en $a$} si :\\par\\smallskip$$\\lim_{x \\to a} f(x) = f(a)$$\\par Cela signifie que la courbe de $f$ ne présente ni saut ni trou au point d'abscisse $a$."
}
```

---

### 5.3 `theorem` — Affirmer un résultat majeur

**Rôle** : énoncer un résultat important avec ses hypothèses et sa conclusion.

**Recette** :
1. Hypothèses explicites ("Pour tout...", "Si $f$ est continue sur...")
2. Conclusion encadrée dans `$$\boxed{...}$$`
3. Pas de démonstration ici (bloc `proof` séparé si besoin)

**Bloc revealable.**

```json
{
  "type": "theorem",
  "title": "Théorème des valeurs intermédiaires (TVI)",
  "content": "Si $f$ est \\textbf{continue} sur $[a\\,;b]$ et si $\\lambda$ est un réel compris entre $f(a)$ et $f(b)$, alors il existe au moins un réel $c \\in [a\\,;b]$ tel que :\\par\\smallskip$$\\boxed{f(c) = \\lambda}$$"
}
```

---

### 5.4 `property` — Donner des formules utilisables

**Rôle** : regrouper les règles de calcul de même nature.

**Recette** :
1. Conditions d'application en tête ("Pour $a > 0$ et $b > 0$...")
2. Formules dans `\begin{itemize}` ou `$$\large \boxed{...}$$`
3. Une `property` = une famille de formules liées
4. **Ne JAMAIS inclure d'application** dans un bloc `property`.

**Bloc revealable.**

```json
{
  "type": "property",
  "title": "Propriétés algébriques de ln",
  "content": "Pour $a > 0$ et $b > 0$ :\\begin{itemize}\\item $\\ln(ab) = \\ln a + \\ln b$\\item $\\ln\\!\\left(\\dfrac{a}{b}\\right) = \\ln a - \\ln b$\\item $\\ln(a^n) = n\\,\\ln a$ \\quad ($n \\in \\mathbb{Z}$)\\end{itemize}"
}
```

---

### 5.5 `application` — Montrer un raisonnement complet

> **C'est le bloc le plus important pédagogiquement.** L'élève voit comment un expert résout un problème, étape par étape.
> Le contenu doit ABSOLUMENT être **bien organisé, riche, ciblé et typique**. Le discours doit être "parlant, simple et clair".
> Type JSON canonique : `"type": "application"`. Ne plus produire `"type": "example"` ; il reste seulement un alias ancien.

**Rôle** : illustrer un concept ou une méthode par un calcul concret et complet.

**Structure en trois temps** :
1. **Énoncer** : ouvrir avec `\qst{...}` (injonction directe, ou énoncé commun avec plusieurs questions).
2. **Corriger** : après `\qst{...}`, calculs fluides avec connecteurs naturels (*puisque, d'où, on en déduit*). Toujours expliquer *pourquoi* on choisit cette voie (ex: justifier le choix d'une combinaison plutôt que d'un arrangement).
3. **Conclure** : résultat final encadré avec `$\boxed{...}$`.

**Règles de rédaction** :
- Toujours commencer par `\qst{...}` ou `\question{...}`
- Ajouter `"difficulty": 1..5` dans le JSON
- Mots-clés en gras dans `\qst{}` avec `\textbf{...}`
- Utiliser `\begin{align*}` avec `&=` pour aligner les égalités
- Encadrer le résultat final avec `$\boxed{...}$` (un seul par application, deux si résultats distincts)
- Connecteurs naturels entre les étapes, argumentation détaillée.
- Aérer avec `\par\smallskip` entre les grandes étapes.
**Bloc toujours visible** (non-revealable).

Pour plusieurs questions, garder l'énoncé dans `\qst{...}` puis utiliser `\begin{enumerate}` avec `\item`. La correction vient après `\qst{...}` et répond avec un seul `\begin{enumerate}` dans le même ordre. Ne jamais écrire les sous-questions en `1)` texte brut.

En mode étendu, l'application sépare automatiquement la partie `\qst{...}` et la correction par une longue ligne pointillée grise avec le badge `Correction`. Ne pas écrire ce badge dans le JSON.

Barème rapide : `1` application immédiate, `2` simple, `3` standard BAC, `4` exigeant, `5` synthèse difficile.

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{Calculons $\\ln\\!\\left(\\dfrac{8e^2}{e}\\right)$.}\\par\\smallskip\\begin{align*}\\ln\\!\\left(\\frac{8e^2}{e}\\right) &= \\ln(8e^2) - \\ln(e) \\\\&= \\ln(8) + 2\\ln(e) - 1 \\\\&= \\ln(8) + 2 - 1 \\\\&= \\boxed{\\ln(8) + 1}\\end{align*}"
}
```

**Formulations valides pour `\qst{}`** :

| Formulation | Usage |
|:--|:--|
| `Calculons ...` | Calcul numérique ou algébrique |
| `Simplifions ...` | Réduction d'une expression |
| `Montrons que ...` | Vérification d'une égalité |
| `Déterminons ...` | Trouver une valeur ou un objet |
| `Résolvons ...` | Équation ou inéquation |
| `Étudions ...` | Comportement d'une fonction |
| `Donnons l'écriture... de ...` | Représentation sous une forme précise |

---

### 5.6 `exploration` — Utiliser ce qu'on vient d'obtenir

**Rôle** : montrer comment exploiter un résultat, un tableau, une figure ou une propriété sans transformer le bloc en exercice à trous.

**Règles** :
- Type JSON : `"type": "exploration"`
- Badge jaune, texte blanc, cadre doré moderne
- Aucun `\blank{}` ; les blanks restent réservés à `application` et `exploration`
- Titre conseillé quand l'exploration porte sur une méthode de lecture

```json
{
  "type": "exploration",
  "title": "Lecture du tableau de signes",
  "content": "Le tableau montre que l'expression est positive sur $]-\\infty\\,;a]$ et sur $[b\\,;+\\infty[$. On en déduit directement l'ensemble des solutions de l'inéquation."
}
```

---

### 5.7 `method` — Recette pratique

**Rôle** : donner une procédure applicable immédiatement sur un exercice d'examen.

**Recette** :
1. Nommer la technique avec `\textbf{}`
2. 3-6 phrases maximum, zéro blabla
3. `\par` pour séparer les idées
4. Terminer par `\textbf{Piège :}`, `\textbf{Astuce :}` ou `\textbf{Attention :}` si pertinent
5. `\begin{enumerate}` uniquement pour deux grandes phases indépendantes

**Cohérence obligatoire** : chaque `method` DOIT être immédiatement suivie d'un bloc `application` qui met en pratique exactement la technique décrite. L'application reprend les mêmes étapes dans le même ordre.

**Bloc revealable.**

```json
{
  "type": "method",
  "title": "Application du TVI — 4 étapes",
  "content": "Vérifier que $f$ est \\textbf{continue} sur $[a\\,;b]$.\\par Calculer $f(a)$ et $f(b)$.\\par Vérifier que $\\lambda$ est compris entre $f(a)$ et $f(b)$.\\par Le TVI garantit l'existence d'au moins un $c \\in [a\\,;b]$ tel que $f(c) = \\lambda$.\\par\\textbf{Attention :} le TVI donne l'\\textbf{existence} mais pas l'\\textbf{unicité}. Pour l'unicité, il faut la monotonie stricte."
}
```

---

### 5.8 `technique` — Calcul spécifique

Même esprit que `method`, mais ciblé sur une forme d'expression précise.
Bloc revealable.

---

### 5.9 `warning` — Piège à signaler

**Rôle** : prévenir une erreur fréquente ou un faux réflexe.

**Recette** :
1. **Ouvrir par une phrase qui parle à l'élève** (au « vous », terminée par « : ») — jamais par un libellé figé
2. Montrer l'erreur clairement (ce que l'élève croit)
3. Corriger (ce qui est vrai)
4. En 2-3 phrases maximum

**Bloc toujours visible.**

> **`\textbf{Erreur classique :}` en ouverture est interdit** : c'est une étiquette, pas une phrase. Écrire *« Une erreur classique, ne la commettez pas : »*. Une liste d'erreurs s'annonce au pluriel : *« Ces erreurs très fréquentes vous coûteront des points : »*. Varier les formulations à l'intérieur d'une même fiche.

```json
{
  "type": "warning",
  "content": "Une erreur classique, ne la commettez pas : $\\ln(a + b) \\neq \\ln a + \\ln b$. La formule $\\ln(ab) = \\ln a + \\ln b$ s'applique à un \\textbf{produit}, jamais à une somme."
}
```

---

### 5.10 `remark` — Nuance ou complément

**Rôle** : ajouter une précision utile sans alourdir les blocs principaux.

**Listes fluides** : Utiliser `\itemsize{...}` ou `\enumerate{...}` à la place de `\begin{itemize}` pour lister des idées. Cela garantit un rendu plus épuré, natif et académique. Ne sautez les lignes (`\par`) que si c'est strictement nécessaire pour ne pas hacher la lecture.

Deux `remark` consécutifs doivent être fusionnés en un seul avec `\itemsize{}`.

**Bloc toujours visible.**

---

### 5.11 `intuition` — Image visuelle

**Rôle** : donner une image mentale pour comprendre un concept abstrait.
Ton imagé et accessible, pas de démonstration. 2-3 phrases.
Bloc toujours visible.

---

### 5.12 `proof` — Démonstration rigoureuse

> **Désactivé par défaut.** Ne produire que si l'utilisateur le demande explicitement.

Énoncer les données, numéroter les étapes, terminer par le résultat.

---

### 5.13 `culture` — Lien avec le monde réel

**Rôle** : montrer que les maths servent à quelque chose. Maximum 2 par fiche (hors intro).
Répondre à : *À quoi ça sert ?* ou *Qui l'a inventé ?*
3-5 phrases, ton accessible, pas de formules complexes.
Bloc toujours visible.

---

## 6. Titres des blocs — Convention

### Deux styles acceptés

**Style A — Question (recommandé pour l'engagement)** :
Utiliser `\mathqst{phrase clé}` pour mettre en valeur le coeur de la question.

| Famille | Exemples |
|:--|:--|
| Qu'est-ce que... | *Qu'est-ce que \mathqst{la forme algébrique $z = a + ib$}* |
| Comment... | *Comment \mathqst{passer de la forme algébrique à l'exponentielle}* |
| Pourquoi... | *Pourquoi \mathqst{$\|z_1 z_2\| = \|z_1\| \cdot \|z_2\|$}* |
| Quand... | *Quand \mathqst{deux complexes sont-ils conjugués}* |
| Que vaut... | *Que vaut \mathqst{$e^{i\pi}$}* |

**Style B — Nominatif direct (recommandé pour la clarté)** :

| Type | Format | Exemples |
|:--|:--|:--|
| `definition` | Nom du concept | *Continuité en un point* |
| `theorem` | Nom du théorème | *Théorème des valeurs intermédiaires (TVI)* |
| `property` | Ce qui est affirmé | *Propriétés algébriques de ln* |
| `method` | Nom de la technique | *Application du TVI — 4 étapes* |
| `culture` | Domaine réel + concept | *Bitcoin et Blockchain : la suite géométrique au coeur de la crypto* |

### Règles communes

1. **Concis** : 4-12 mots
2. **Ciblé** : une seule notion par titre
3. **Spécifique** : mentionner le concept concerné
4. **Varié** : alterner les formulations
5. **Une `\mathqst{}`** par titre si style A

---

## 7. Style de Rédaction

### Principes fondamentaux

| À faire | À éviter |
|:--|:--|
| Phrases courtes (max 15-20 mots) | Phrases à trois virgules |
| Mots du quotidien | Jargon pédagogique |
| "On divise", "Cela donne" | "Il convient de procéder à la division" |
| "Si le reste est 0" | "Dans l'éventualité où le reste s'avère nul" |
| Connecteurs simples : *puisque, donc, ainsi, d'où* | `$\Rightarrow$` pour dire *donc* en texte |
| `\textbf{mot clé}` sur les termes importants | Texte plat sans repères visuels |

### Reformulation obligatoire

Ne jamais transcrire tel quel. Le contenu est fidèle au fond, mais la forme est celle d'un excellent manuel :
- Phrases raccourcies et clarifiées
- Vocabulaire simplifié sans sacrifier la rigueur
- Enchaînements logiques explicites (*puisque, d'où, ce qui signifie que*)
- Mots-clés en gras
- Ordre : du simple vers le complexe, du connu vers l'inconnu

### Registre BAC marocain

Les verbes directifs du BAC officiel (sessions 2021-2024) :

| Verbe BAC | Usage dans la fiche |
|:--|:--|
| Montrer que | Preuve guidée |
| Vérifier que | Contrôle d'un résultat |
| En déduire que | Enchaînement déductif |
| Déterminer | Trouver un objet |
| Calculer | Calcul numérique ou algébrique |

**Interdit** : "C'est quoi" (familier), "Trouvons" (préférer "Déterminons"), "On a juste à" (informel).

### Sauts de ligne

`\par\smallskip` uniquement quand deux idées distinctes étaient collées. Ne pas fragmenter un raisonnement fluide. 
**Règle d'or :** Dans les définitions, théorèmes et textes, il faut **sauter des lignes que si nécessaire seulement**. Un abus de `\par\smallskip` détruit l'harmonie visuelle. Critère : un élève marquerait-il naturellement une pause longue ici ?

---

## 8. Ordre des Blocs dans une Section

```
Section 0 — intro (TOUJOURS en premier, TOUJOURS seule)
  └── intro       → bloc unique : objectif + défi + savant + portrait

Section 1, 2, 3... — sections de cours
  1. text         → OBLIGATOIRE : rappel + annonce
  2. definition   → concept nouveau                             [revealable]
     └── intuition  → image visuelle (optionnel)
  3. application      → application directe de la définition
     └── exploration → lecture guidée ou usage direct d'un résultat
  4. theorem      → résultat clé                                [revealable]
     └── lemma      → résultat intermédiaire si nécessaire      [revealable]
     └── corollary  → conséquence immédiate                     [revealable]
     └── consequence → implication concrète                     [revealable]
  5. property     → formules et règles                          [revealable]
  6. method       → procédure pratique                          [revealable]
  7. application      → application de la method  ⚠️ OBLIGATOIRE après method
  8. warning      → piège ou erreur fréquente
  9. remark       → nuance ou complément
 [10. culture     → optionnel, max 2/fiche hors intro]
```

**Blocs revealables** (masqués par défaut) :
`definition` `theorem` `property` `lemma` `corollary` `consequence` `technique` `method`

**Blocs toujours visibles** :
`application` `exploration` `warning` `remark` `proof` `intuition` `culture` `text` `intro`

---

## 9. Section d'Introduction — Format `intro`

La première section contient un seul bloc `type: "intro"`. C'est le premier contact avec le chapitre.

### Contenu

| Zone | Contenu | Ton |
|:--|:--|:--|
| Gauche (2-3 phrases) | Objectif du chapitre + difficulté principale | Pédagogique, direct |
| Droite (1-2 phrases) | Savant historique + héritage moderne | Culturel, inspirant |

La séparation est automatique : le composant coupe avant `\savant{}`.

### Commandes disponibles

| Commande | Rendu | Usage |
|:--|:--|:--|
| `\objectif{texte}` | Indigo, gras, majuscules | Objectif principal |
| `\defi{texte}` | Rouge, semi-gras | Difficulté ou enjeu |
| `\savant{Nom}` | Teal, semi-gras | Nom du mathématicien |
| `$...$` | Formule KaTeX inline | Une formule max |

### Règles

- 3-4 phrases au total
- Le savant doit être directement lié au chapitre
- Portrait : Wikimedia Commons, `width: "14%"` à `"16.5%"`
- Caption : `"Prénom Nom (naissance-décès)"`

---

## 10. Commandes LaTeX — Référence

### Échappement JSON

Tout backslash LaTeX doit être doublé dans le JSON : `\frac` → `\\frac`

### Mise en forme texte et listes

| Commande | Rendu | Contexte |
|:--|:--|:--|
| `\textbf{mot}` | **mot** gras | Mots-clés partout |
| `\par` | Saut de paragraphe | Entre deux idées (si nécessaire seulement) |
| `\par\smallskip` | Saut + marge | Espace visuel (avec parcimonie) |
| `\itemsize{texte}` | Puce de liste | Remplace `\begin{itemize}`. Liste fluide et élégante. |
| `\enumerate{texte}` | Numéro de liste | Remplace `\begin{enumerate}`. Liste ordonnée élégante. |
| `\calcbtn{touche}` | Style clavier | Calculatrice |
| `\qst{texte}` | Énoncé riche numéroté | Ouverture d'un bloc `application`, accepte plusieurs questions |
| `\question{texte}` | Alias long de `\qst{}` | Accepté pour compatibilité |
| `\mathqst{phrase}` | Extra-gras coloré | Dans les titres uniquement |

### Dessins et macros spécifiques (Probabilités, etc.)

| Commande | Rendu | Usage |
|:--|:--|:--|
| `$\boulerouge{}$` | Boule rouge | Indispensable en probabilités. **Doit être entouré de `$...$`** |
| `$\boulenoire{}$` | Boule noire | Représentation visuelle typique. **Dans `$...$`** |
| `$\bouleblanche{}$` | Boule blanche | Idem. |
| `$\bouleverte{}$` | Boule verte | Idem. |
| `$P_i$` (et non `$p_i$`) | Probabilité majuscule | Toujours utiliser un `P` majuscule pour les probabilités ($P_1, P_i, P(A)$). |

### Mise en valeur mathématique

| Outil | Usage |
|:--|:--|
| `$$\large \boxed{...}$$` | Résultat principal d'un `theorem`/`property`. La balise `\large` augmente la taille de 10% pour l'emphase. |
| `$\boxed{...}$` | Résultat final d'un bloc `application` |
| `\dfrac{a}{b}` | Fraction lisible inline |
| `\begin{align*}` | Calculs multi-lignes alignés sur `&=` |
| `\overrightarrow{AB}` | Vecteur (obligatoire, jamais `\vec`) |
| `\begin{array}` | Tableau (signe, valeurs, comparaison) |

---

## 11. Checklist Finale

### Structure
- [ ] Section `intro` en premier, bloc unique `type: "intro"`
- [ ] Chaque section de cours commence par un bloc `text`
- [ ] Repère introduit dans le `text` si coordonnées utilisées
- [ ] Aucun bloc `summary` ni `strategy`
- [ ] Maximum 2 blocs `culture` hors intro

### Rédaction
- [ ] Aucun tiret long `—`
- [ ] Aucun `arctan`, `arcsin`, `arccos`
- [ ] Aucun `Z` majuscule pour un complexe
- [ ] Aucun `\checkmark` ni `✓`
- [ ] Aucun `Étape 1 :` dans les applications
- [ ] Aucune flèche `→` `⇒` comme mot
- [ ] `\overrightarrow{}` partout, jamais `\vec{}`

### Volume
- [ ] Chaque bloc respecte la jauge de volume (section 4)
- [ ] Pas de bloc de plus de 15 lignes (sauf `proof`)
- [ ] 3-8 blocs par section
- [ ] Chaque `method` suivie d'un bloc `application`

### Exemples
- [ ] Chaque bloc `application` commence par `\qst{...}` ou `\question{...}`
- [ ] Chaque bloc `application` contient `"difficulty": 1..5`
- [ ] Aucun nouveau bloc n'utilise `"type": "example"` (alias ancien seulement)
- [ ] Les applications à plusieurs questions utilisent `\begin{enumerate}` et `\item` dans l'énoncé et dans la correction
- [ ] Mots-clés en `\textbf{}` dans `\qst{}`
- [ ] Égalités alignées en `align*` avec `&=`
- [ ] Résultat final dans `$\boxed{...}$`
- [ ] Toutes les étapes visibles et complètes

### JSON
- [ ] Backslashes doublés (`\\frac`, `\\begin`...)
- [ ] JSON valide (pas de virgule manquante)
- [ ] Aucun `\def\arraystretch{...}` dans le contenu

---

*Ce guide est la référence pédagogique V2 pour la création de fiches de révision.*
