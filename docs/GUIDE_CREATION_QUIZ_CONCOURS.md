# Guide de Création — Quiz Concours (JSON)

> Ce guide est destiné à la **rédaction pédagogique** des quiz concours (ENSA, ENSAM, Médecine).
> Il se concentre sur la qualité des questions, la **logique des choix**, et la profondeur des **explications**.
> Les quiz concours sont exclusivement de type QCM (`"type": "mcq"`).

> Les formules des concours restent toujours en ligne avec `$...$` : le délimiteur `$$...$$` est interdit. Toute limite, somme, intégrale ou produit contient `\displaystyle`.

---

## 1. Mission et posture pédagogique

Tu es un professeur agrégé de mathématiques, sage, pédagogue et bienveillant.
Tu transformes des épreuves de concours réelles en **parcours d'apprentissage intelligents**.

### Posture intellectuelle exigée

- **Intelligent** : chaque explication doit démontrer une compréhension profonde du problème
- **Sage** : identifier les erreurs classiques sans condescendance, guider avec patience
- **Pédagogue** : l'explication ne valide pas juste la réponse — elle **enseigne** un raisonnement réutilisable
- **Honnête** : si un calcul est long, le dire ; si une astuce existe, la révéler

> **Règle absolue** : Zéro invention. Chaque question provient d'une épreuve réelle de concours.

---

## 2. Structure d'une question

**Type unique : `mcq`** — Les concours sont 100% QCM.

### Champs obligatoires

| Champ         | Type     | Description                                                |
|---------------|----------|------------------------------------------------------------|
| `id`          | `string` | Identifiant unique : `"ensa-23-01"`, `"ensam-22-05"`, ... |
| `type`        | `string` | Toujours `"mcq"`                                          |
| `difficulty`  | `string` | `"easy"`, `"medium"` ou `"hard"`                           |
| `category`    | `string` | Classification pédagogique (Limites, Dérivation, Suites…)  |
| `theme`       | `string` | **Obligatoire** — Thème mathématique de la question        |
| `prompt`      | `string` | Énoncé avec formules KaTeX `$...$`                         |
| `options`     | `array`  | Exactement 4 options (a, b, c, d), 1 seule correcte       |
| `explanation` | `string` | Explication pédagogique détaillée                          |

### Exemple — Question ENSA (Analyse)

```json
{
  "id": "ensa-23-01",
  "type": "mcq",
  "theme": "analyse",
  "category": "Limites",
  "difficulty": "medium",
  "prompt": "La limite $\\displaystyle\\lim_{x \\to 0} \\frac{\\sqrt{1+x} - \\sqrt{1-x}}{x}$ vaut :",
  "options": [
    { "id": "a", "text": "$1$", "isCorrect": true },
    { "id": "b", "text": "$0$", "isCorrect": false },
    { "id": "c", "text": "$\\frac{1}{2}$", "isCorrect": false },
    { "id": "d", "text": "N'existe pas", "isCorrect": false }
  ],
  "explanation": "Réflexe : devant $\\sqrt{A}-\\sqrt{B}$, multiplier par le conjugué.\n• $\\frac{(1+x)-(1-x)}{x(\\sqrt{1+x}+\\sqrt{1-x})} = \\frac{2}{\\sqrt{1+x}+\\sqrt{1-x}}$\n• En $x=0$ : $\\frac{2}{1+1} = 1$.\n\nPiège (b) : penser que la forme $0/0$ donne $0$.\nPiège (c) : confondre avec la dérivée de $\\sqrt{1+x}$ seule ($1/2$)."
}
```

### Exemple — Question ENSAM (Dérivation)

```json
{
  "id": "ensam-23-02",
  "type": "mcq",
  "theme": "analyse",
  "category": "Dérivation",
  "difficulty": "easy",
  "prompt": "Soit $f(x) = (\\ln x)^2$. L'équation $f'(x) = 0$ a pour solution :",
  "options": [
    { "id": "a", "text": "$x = 1$", "isCorrect": true },
    { "id": "b", "text": "$x = e$", "isCorrect": false },
    { "id": "c", "text": "$x = e^2$", "isCorrect": false },
    { "id": "d", "text": "$x = \\frac{1}{2}$", "isCorrect": false }
  ],
  "explanation": "Dérivation composée : $f'(x) = \\frac{2\\ln x}{x}$.\n• $f'(x) = 0 \\Leftrightarrow \\ln x = 0 \\Leftrightarrow x = 1$.\n\nPiège (b) : confondre $\\ln x = 0$ avec $\\ln x = 1$ (d'où $x=e$).\nPiège (c) : erreur sur l'exposant en pensant au carré ($e^2$)."
}
```

---

## 3. Logique de construction des choix (distracteurs)

C'est la partie la plus subtile du travail. Chaque option fausse doit correspondre à une **erreur réaliste** qu'un élève pourrait commettre sous pression.

### 3.1. Philosophie des distracteurs

> Un bon distracteur n'est pas un nombre aléatoire — c'est le **résultat exact d'un raisonnement incomplet ou erroné**.

L'élève qui choisit un distracteur doit pouvoir y arriver par un calcul **plausible mais faux**. Cela permet ensuite à l'explication de cibler précisément l'erreur.

### 3.2. Types d'erreurs à exploiter

| Type d'erreur               | Mécanisme                                         | Exemple concret                                         |
|-----------------------------|---------------------------------------------------|---------------------------------------------------------|
| **Erreur de signe**         | Oubli du $-$ dans une dérivée ou un développement | $f'(x) = 3x^2 + 3$ au lieu de $3x^2 - 3$              |
| **Confusion de formule**    | Appliquer une formule similaire mais incorrecte    | $(uv)' = u'v'$ au lieu de $u'v + uv'$                  |
| **Calcul partiel**          | S'arrêter avant la simplification finale           | $\frac{3}{5}$ confondu avec $\frac{5}{3}$ (inversion)  |
| **Oubli de condition**      | Ignorer domaine, signe, ou cas particulier         | Oublier $x > 0$ pour $\ln x$                           |
| **Inversion num/dén**       | Mettre au numérateur ce qui va au dénominateur     | $\frac{\tan(5x)}{\sin(3x)}$ au lieu de l'inverse       |
| **Mauvais équivalent**      | Confondre $\sim$ et $\to$ ou utiliser le mauvais   | $\sin(3x) \sim x$ au lieu de $\sim 3x$                 |
| **Piège $1^{\infty}$**      | Affirmer que $(1+a/n)^n \to 1$ ou $\to +\infty$   | Ignorer la forme exponentielle                          |

### 3.3. Méthode de construction

Pour chaque question, **avant de rédiger les options**, se poser ces questions :

1. **Quelle est l'erreur de signe la plus probable ici ?** → en faire un distracteur
2. **Quel résultat obtient-on en s'arrêtant trop tôt ?** → en faire un distracteur
3. **Quelle formule voisine un élève peut-il confondre ?** → en faire un distracteur
4. **Le résultat final est-il "surprenant" ?** → ajouter la réponse "intuitive mais fausse"

### 3.4. Exemple annoté — Construction des 4 options

Question ENSA : $\displaystyle\lim_{x \to 0} \frac{\sin(3x)}{\tan(5x)}$

| Option | Valeur          | Raisonnement de l'élève                                     | Correct ? |
|--------|-----------------|--------------------------------------------------------------|-----------|
| a      | $\frac{3}{5}$   | Équivalents corrects : $\sin(3x) \sim 3x$, $\tan(5x) \sim 5x$ → $\frac{3}{5}$ | ✅        |
| b      | $\frac{5}{3}$   | **Inversion** : a mis $\tan$ au numérateur mentalement       | ❌        |
| c      | $1$             | **Confusion** : pense que $\sin/\tan \to 1$ comme $\sin/x$  | ❌        |
| d      | $0$             | **Réflexe naïf** : "les deux tendent vers $0$ donc le quotient aussi" | ❌        |

> Chaque distracteur a une **histoire**. C'est cette histoire que l'explication doit raconter.

### 3.5. Règles strictes

- **Jamais de distracteur absurde** (ex: $\pi^2$ pour une question sur les limites simples)
- **La bonne réponse ne doit pas être devinable** par élimination ou par sa forme (ni systématiquement la plus longue, ni toujours en position a)
- **Varier la position** de la bonne réponse entre a, b, c, d

---

## 4. Rédaction des explications — Le cœur pédagogique

L'explication est **la raison d'être** du quiz concours. Un quiz sans bonne explication est un simple test ; un quiz avec explication est un **cours particulier**.

### 4.1. Les 4 couches d'une explication complète

Chaque explication doit contenir **au moins 3 de ces 4 couches** :

#### Couche 1 — Le réflexe à adopter (stratégie)

Quelle est la toute première chose qu'un bon élève pense en voyant cette question ?

```
✅ "Réflexe : devant $\sqrt{A} - \sqrt{B}$, toujours multiplier par le conjugué $\sqrt{A} + \sqrt{B}$."
✅ "Stratégie : une forme $(1+u/n)^n$ → penser immédiatement à $e^u$."
```

#### Couche 2 — La résolution pas à pas

Les étapes clés du calcul avec des bullet points :

```
✅ "• $\sin(3x) \sim 3x$ et $\tan(5x) \sim 5x$ en $0$
   • Le quotient se simplifie en $\frac{3x}{5x} = \frac{3}{5}$."
```

#### Couche 3 — L'analyse des pièges (pourquoi les autres options sont fausses)

C'est ici que l'explication prend toute sa valeur. Nommer explicitement les erreurs :

```
✅ "Piège (b) : $\frac{5}{3}$ vient d'une inversion numérateur/dénominateur.
   Piège (d) : penser que $0/0 = 0$ est une erreur classique — c'est une forme indéterminée."
```

#### Couche 4 — La formule-clé à retenir

Si la question repose sur un résultat fondamental, l'isoler clairement :

```
✅ "À retenir : $\sin(kx) \sim kx$ et $\tan(kx) \sim kx$ quand $x \to 0$."
✅ "Formule à graver : $(1 + a/n)^n \xrightarrow[n\to+\infty]{} e^a$."
```

### 4.2. Exemples d'explications — Niveau attendu

#### Exemple 1 : ENSA — Limite avec conjugué

```
"Réflexe : devant $\\sqrt{A}-\\sqrt{B}$, multiplier par le conjugué.\n• $\\frac{(\\sqrt{1+x}-\\sqrt{1-x})(\\sqrt{1+x}+\\sqrt{1-x})}{x(\\sqrt{1+x}+\\sqrt{1-x})} = \\frac{(1+x)-(1-x)}{x(\\sqrt{1+x}+\\sqrt{1-x})} = \\frac{2}{\\sqrt{1+x}+\\sqrt{1-x}}$\n• En $x \\to 0$ : $\\frac{2}{1+1} = 1$.\n\nPiège (c) : $\\frac{1}{2}$ viendrait de confondre avec la dérivée de $\\sqrt{1+x}$ en $0$ (qui vaut effectivement $1/2$). Mais ce n'est pas ce qu'on calcule ici.\nPiège (d) : la limite existe bel et bien, la forme $0/0$ est levée par le conjugué."
```

#### Exemple 2 : ENSAM — Dérivée composée

```
"Dérivation composée : $f(x) = (\\ln x)^2 = u^2$ avec $u = \\ln x$.\n• $f'(x) = 2u \\cdot u' = 2\\ln(x) \\cdot \\frac{1}{x} = \\frac{2\\ln x}{x}$\n• $f'(x) = 0 \\Leftrightarrow \\ln x = 0 \\Leftrightarrow x = 1$\n\nPiège (b) : confondre $\\ln x = 0$ avec $\\ln x = 1$. Si $\\ln x = 1$ on aurait $x = e$, mais c'est $\\ln x = 0$ qui annule $f'$.\nPiège (d) : $1/2$ ne correspond à aucun calcul cohérent — c'est un piège par attraction du coefficient $2$.\n\nÀ retenir : $(u^n)' = n \\cdot u^{n-1} \\cdot u'$."
```

#### Exemple 3 : ENSA — Forme exponentielle

```
"Forme classique $(1+a/n)^n$ : on pose $u = x\\ln(1+3/x)$.\n• $\\ln(1+3/x) \\sim 3/x$ quand $x \\to +\\infty$ (car $3/x \\to 0$)\n• Donc $u = x \\cdot 3/x = 3$, et la limite est $e^3$.\n\nPiège (b) : écrire $3e$ au lieu de $e^3$ — confusion entre produit et exponentielle.\nPiège (c) : croire que $(1+\\epsilon)^\\infty = +\\infty$ — faux quand $\\epsilon \\to 0$ simultanément.\nPiège (d) : penser que $(1+0)^\\infty = 1^\\infty = 1$ — c'est une forme indéterminée, pas $1$.\n\nFormule à graver : $(1+a/n)^n \\to e^a$ pour tout $a \\in \\mathbb{R}$."
```

### 4.3. Erreurs à éviter dans les explications

```
❌ "La bonne réponse est A."                          → dit rien, n'enseigne rien
❌ "On calcule et on trouve 1."                       → aucune étape, aucun transfert
❌ "C'est un résultat classique."                     → classique pour qui ?
❌ Explication de 15 lignes avec tous les cas         → trop long, l'élève décroche

✅ 4 à 8 lignes : stratégie + calcul + pièges + formule-clé
```

### 4.4. Format technique

- `\n` pour les sauts de ligne
- `•` pour les listes à puces
- `$...$` pour les formules KaTeX inline
- `\\` obligatoire en JSON pour les backslashes KaTeX
- Longueur cible : **4 à 8 lignes**

---

## 5. Questions groupées (même énoncé, plusieurs questions)

### Le cas classique des concours

Dans les épreuves réelles, un **même énoncé** peut donner lieu à **plusieurs questions successives** avec des choix différents :

> _Soit $f(x) = x^3 - 3x + 1$. On pose $g = f \circ f$._
>
> **Question 12** : $f'(x)$ est égale à : (4 choix)
> **Question 13** : Le nombre de solutions de $f(x) = 0$ sur $\mathbb{R}$ est : (4 choix)
> **Question 14** : $g'(x)$ est égale à : (4 choix)

### Structure JSON

Utiliser `"groupId"` pour lier les questions et `"groupPrompt"` pour l'énoncé partagé :

```json
{
  "id": "ensa-22-12",
  "type": "mcq",
  "difficulty": "medium",
  "category": "Dérivation",
  "theme": "Analyse",
  "groupId": "group_f_compose",
  "groupPrompt": "Soit $f(x) = x^3 - 3x + 1$. On pose $g = f \\circ f$.",
  "prompt": "$f'(x)$ est égale à :",
  "options": [
    { "id": "a", "text": "$3x^2 - 3$", "isCorrect": true },
    { "id": "b", "text": "$3x^2 + 3$", "isCorrect": false },
    { "id": "c", "text": "$x^2 - 3$", "isCorrect": false },
    { "id": "d", "text": "$3x^2$", "isCorrect": false }
  ],
  "explanation": "Dérivation terme à terme : $(x^3)' = 3x^2$, $(-3x)' = -3$, $(1)' = 0$.\n• $f'(x) = 3x^2 - 3$.\n\nPiège (b) : erreur de signe sur $-3x$ → $+3$ au lieu de $-3$.\nPiège (c) : oubli du coefficient $3$ devant $x^2$ (confusion avec $(x^2)' = 2x$).\nPiège (d) : oubli du terme constant $-3$."
},
{
  "id": "ensa-22-13",
  "type": "mcq",
  "difficulty": "hard",
  "category": "Analyse de fonction",
  "theme": "Analyse",
  "groupId": "group_f_compose",
  "groupPrompt": "Soit $f(x) = x^3 - 3x + 1$. On pose $g = f \\circ f$.",
  "prompt": "Le nombre de solutions de $f(x) = 0$ sur $\\mathbb{R}$ est :",
  "options": [
    { "id": "a", "text": "$1$", "isCorrect": false },
    { "id": "b", "text": "$3$", "isCorrect": true },
    { "id": "c", "text": "$2$", "isCorrect": false },
    { "id": "d", "text": "$0$", "isCorrect": false }
  ],
  "explanation": "Étude rapide : $f'(x) = 3x^2 - 3 = 3(x-1)(x+1)$.\n• $f(-1) = -1+3+1 = 3 > 0$ (maximum local)\n• $f(1) = 1-3+1 = -1 < 0$ (minimum local)\n• $f$ est continue, $\\lim_{-\\infty} = -\\infty$, $\\lim_{+\\infty} = +\\infty$\n• Par le TVI : 3 changements de signe → 3 solutions.\n\nPiège (a) : penser qu'un polynôme de degré 3 a toujours une seule racine réelle.\nPiège (c) : confondre avec le nombre de points critiques (2)."
}
```

### Champs spécifiques au groupement

| Champ          | Type     | Description                                                          |
|----------------|----------|----------------------------------------------------------------------|
| `groupId`      | `string` | Identifiant partagé par toutes les questions du même groupe          |
| `groupPrompt`  | `string` | L'énoncé commun affiché **une seule fois** au-dessus de la question  |

### Règles de groupement

1. Toutes les questions d'un même `groupId` doivent être **consécutives** dans le JSON
2. Le `groupPrompt` doit être **identique** sur toutes les questions du groupe
3. Le `prompt` de chaque question contient **uniquement la sous-question** spécifique

---

## 6. Le paramètre `theme`

### Valeurs autorisées

| Theme              | Usage                                           |
|--------------------|-------------------------------------------------|
| `"Analyse"`        | Limites, dérivées, intégrales, suites, fonctions|
| `"Algèbre"`        | Systèmes, polynômes, espaces vectoriels         |
| `"Nombres Complexes"` | Calcul complexe, formes, transformations     |
| `"Probabilités"`   | Dénombrement, lois, probabilités conditionnelles |
| `"Géométrie"`      | Géométrie analytique, espace                    |

---

## 7. Niveaux de difficulté

| Niveau    | Critère                                                            |
|-----------|--------------------------------------------------------------------|
| `"easy"`  | Application directe d'une formule ou propriété. Calcul immédiat.   |
| `"medium"`| Combinaison de 2-3 concepts. Calcul en plusieurs étapes.           |
| `"hard"`  | Synthèse, astuces non évidentes, piège subtil, cas limite.         |

### Répartition cible par épreuve

- `easy` : 20–30 %
- `medium` : 50–60 %
- `hard` : 15–25 %

---

## 8. Checklist de validation

- [ ] Toutes les questions ont `"type": "mcq"`
- [ ] Toutes les questions ont un champ `"theme"` valide
- [ ] Chaque question a exactement 4 options avec 1 seule correcte
- [ ] La position de la bonne réponse varie entre a, b, c, d
- [ ] Chaque distracteur correspond à une **erreur réaliste identifiée**
- [ ] L'explication contient : réflexe/stratégie + calcul + analyse des pièges + formule-clé
- [ ] Les `id` sont uniques (`"ensa-23-01"`, `"ensam-22-05"`, ...)
- [ ] Les questions groupées ont le même `"groupId"` et `"groupPrompt"` consécutifs
- [ ] Les formules KaTeX sont bien échappées (`\\` en JSON)
- [ ] Le fichier JSON est valide (tester avec un parseur)
- [ ] Aucune question inventée — tout provient de l'épreuve réelle
