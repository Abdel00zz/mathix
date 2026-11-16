# Guide — Structure JSON des Examens Nationaux

---

## Règle fondamentale : Fidélité absolue

> Le JSON est une transcription **exacte** du document source (PDF, image de l'épreuve).
> - **Interdit** : inventer, reformuler, compléter ou supprimer du contenu.
> - **Obligatoire** : écrire en UTF-8 propre — pas de `\u2019`, pas d'échappements Unicode inutiles.
> - Le LaTeX `$...$` et `\\dfrac`, `\\mathbb`, etc. sont autorisés dans `content` et `hint`.

---

## Structure globale

```json
{
  "id": "nat-2024-n",
  "title": "Examen National 2024 — Session Normale",
  "type": "national",
  "year": 2024,
  "session": "normale",
  "classId": "2eme-bac-sc-ex",
  "duration": 180,
  "coefficient": 4,
  "totalPoints": 20,
  "exercises": [ ... ]
}
```

| Champ | Obligatoire | Description |
|---|---|---|
| `id` | oui | Identifiant unique : `nat-{année}-{n\|r}` (n = normale, r = rattrapage) |
| `type` | oui | Toujours `"national"` |
| `session` | oui | `"normale"` ou `"rattrapage"` |
| `duration` | oui | Durée en minutes |
| `totalPoints` | oui | Barème total (généralement 20) |

---

## Structure d'un exercice

```json
{
  "id": "nat2024n-ex1",
  "number": 1,
  "theme": "suites-numeriques",
  "difficulty": 3,
  "points": 3,
  "topic": "Suites numériques — Récurrence, convergence et suite géométrique",
  "context": "On considère la suite $(u_n)$ définie par...",
  "questions": [ ... ]
}
```

- `theme` : slug en kebab-case (`suites-numeriques`, `geometrie-espace`, `nombres-complexes`, `probabilites`, `analyse`)
- `context` : l'énoncé introductif global de l'exercice (texte avant la première question)
- `difficulty` : 1 à 5

---

## Types de questions

### Question simple

```json
{ "id": "q1", "content": "Montrer que $p(A) = \\dfrac{1}{3}$.", "bareme": 0.5, "hint": "..." }
```

### Question conteneur (sans texte propre) + sous-questions

```json
{
  "id": "q1",
  "content": "",
  "subQuestions": [
    { "id": "1a", "content": "Vérifier que...", "bareme": 0.5, "hint": "..." },
    { "id": "1b", "content": "Montrer par récurrence...", "bareme": 0.5, "hint": "..." }
  ]
}
```

### Question avec introduction + sous-questions

```json
{
  "id": "q3",
  "content": "Soit $R$ la rotation de centre $O$ et d'angle $\\dfrac{\\pi}{6}$.",
  "subQuestions": [
    { "id": "3a", "content": "Vérifier que...", "bareme": 0.5, "hint": "..." },
    { "id": "3b", "content": "Montrer que...", "bareme": 0.5, "hint": "..." }
  ]
}
```

---

## Déclaration des Parties (Problème)

Quand un exercice comporte **Partie I**, **Partie II**, etc., on utilise `"type": "partie"` :

```json
{
  "id": "p1",
  "type": "partie",
  "content": "On considère les deux fonctions $u$ et $v$..."
}
```

**Règles :**
- `id` : `"p1"`, `"p2"`, `"p3"`…
- `type` : obligatoirement `"partie"`
- `content` : le texte introductif de la partie — **pas** le mot "Partie I" (le rendu le génère automatiquement)
- Pas de `subQuestions` sur un nœud partie.

**Les questions qui suivent** utilisent des préfixes d'id différents par partie :

```json
{ "id": "p1", "type": "partie", "content": "On considère les fonctions $u$ et $v$..." },
{ "id": "q1", "content": "Tracer les courbes...", "bareme": 0.5, "hint": "..." },
{ "id": "q2", "content": "Justifier que...", "bareme": 0.25, "hint": "..." },
{ "id": "q3", "content": "Calculer l'aire...", "bareme": 0.5, "hint": "..." },
{ "id": "p2", "type": "partie", "content": "On considère la fonction $f$..." },
{ "id": "r1", "content": "", "subQuestions": [ ... ] },
{ "id": "r2", "content": "", "subQuestions": [ ... ] }
```

> Les questions de Partie I ont des `id` en `q*`, celles de Partie II en `r*`, Partie III en `s*`, etc.

---

## Convention des `id`

| Source | `id` JSON |
|---|---|
| Partie I, II | `"p1"`, `"p2"` |
| Question 1, 2 (Partie I) | `"q1"`, `"q2"` |
| Question 1, 2 (Partie II) | `"r1"`, `"r2"` |
| Sous-question a) de q2 | `"2a"` ou `"r2a"` |
| Sous-sous-question i. de b) de q3 | `"3b_i"` |

> L'`id` reflète la position dans la source. L'élève doit retrouver immédiatement à quoi correspond chaque `id`.

---

## Le champ `bareme`

- Nombre décimal : `0.25`, `0.5`, `0.75`, `1`
- Placé sur chaque **question simple** ou **sous-question** qui porte des points
- Pas de barème sur les nœuds `type: "partie"`
- La somme des barèmes d'un exercice doit correspondre à ses `points`

---

## Le champ `hint` — Indice pédagogique

### Philosophie

> Le hint oriente la réflexion **sans donner la réponse**. Il répond à la question implicite : *"Par où est-ce que je commence ?"*

### Règles

| Situation | Action |
|---|---|
| Aucun indice dans la source | Rédiger un hint qui **oriente** vers la bonne approche |
| Un indice partiel donné | Reprendre fidèlement |
| Une solution complète | Transformer en chemin de réflexion |

### Ce qu'un hint doit faire

- Rappeler un outil, un théorème ou un résultat d'une question précédente
- Orienter vers la première étape, pas vers la solution complète
- Être bref : 1 à 2 phrases maximum

### Ce qu'un hint ne doit PAS faire

- Donner la réponse finale
- Dérouler toutes les étapes du calcul
- Être plus long que l'énoncé de la question

---

### Stratégies de rédaction par type de question

> Ces consignes sont extraites de l'analyse des corrections officielles et classées par famille de question.

#### « Vérifier que… » / « Montrer que… (résultat donné) »

Le résultat est déjà dans l'énoncé — le hint doit indiquer **par où commencer** :
- Nommer l'outil (produit vectoriel, récurrence, dérivation…)
- Esquisser la première transformation sans la dérouler

```json
"hint": "Calculez $u_{n+1} - \\frac{2}{5}u_n$ en réduisant au même dénominateur : le numérateur se factorise en $\\frac{-4u_n^2}{5(2u_n+5)}$."
```

#### « Calculer » / « Déterminer »

Le hint rappelle la formule ou la technique, **jamais le résultat numérique** :

```json
"hint": "Formule des probabilités totales : $P(D) = \\sum P(A_i) \\cdot P_{A_i}(D)$."
```

#### « En déduire… »

Le hint **pointe explicitement** le résultat antérieur à réutiliser :

```json
"hint": "Réutilisez le résultat de 2a) : $ac = 4b$, donc $\\frac{ac}{4} = b$."
```

#### Récurrence

Le hint distingue clairement **initialisation** et **hérédité** :

```json
"hint": "Initialisez avec $u_0 = \\frac{3}{2} > 0$. Pour l'hérédité, si $u_n > 0$ alors $2u_n > 0$ et $2u_n + 5 > 0$, donc le quotient est..."
```

#### Suite géométrique auxiliaire

Le hint guide vers le calcul de $v_{n+1}$ sans anticiper la simplification :

```json
"hint": "Calculez $v_{n+1}$ en remplaçant $u_{n+1}$ par son expression, puis simplifiez les fractions composées pour obtenir $\\frac{2}{5}v_n$."
```

#### Encadrement + théorème des gendarmes

Le hint décompose en deux temps : encadrer, puis passer à la limite :

```json
"hint": "De $0 \\leq \\ln x \\leq 2\\sqrt{x}$, élevez au cube puis divisez par $x^2$. Comme $\\frac{8}{\\sqrt{x}} \\to 0$, concluez par le théorème d'encadrement."
```

#### Forme trigonométrique

Le hint rappelle la démarche module + argument :

```json
"hint": "$|b| = 2$ et $b = 2(\\frac{1}{2} + i\\frac{\\sqrt{3}}{2})$ : identifiez $\\cos$ et $\\sin$ pour lire l'argument."
```

#### Fonction réciproque

Le hint rappelle les conditions d'existence et la formule de la dérivée :

```json
"hint": "$f$ est continue, strictement monotone et $f(\\mathbb{R}) = \\mathbb{R}$ : elle admet une réciproque. Pour $(f^{-1})'(y) = \\frac{1}{f'(f^{-1}(y))}$."
```

#### Tableau de variations (KaTeX)

Le hint peut **inclure** le tableau final quand l'énoncé demande de le dresser :

```json
"hint": "$f'(x) \\leq 0$ sur $\\mathbb{R}$, $f'(x) = 0 \\Leftrightarrow x = 2$.\\n\\n$$\\begin{array}{|c|ccccc|}\\hline x & -\\infty & & 2 & & +\\infty \\\\\\\\ \\hline f'(x) & & - & 0 & - & \\\\\\\\ \\hline f & +\\infty & \\searrow & 2 & \\searrow & -\\infty \\\\\\\\ \\hline \\end{array}$$"
```

#### Asymptotes obliques

Quand $f$ admet deux asymptotes obliques ($y = x+1$ en $-\infty$ et $y = x-1$ en $+\infty$ par exemple), le hint guide vers le calcul de $f(x) - (ax+b)$ :

```json
"hint": "$f(x) - (x-1) = \\frac{4}{e^x+2}$. En $+\\infty$, $e^x \\to +\\infty$ donc $\\frac{4}{e^x+2} \\to 0$."
```

> Quand l'énoncé propose deux écritures alternatives de $f$ (ex: $f(x) = x-1+\\frac{4}{e^x+2}$ et $f(x) = x+1-\\frac{2e^x}{e^x+2}$), chaque écriture sert à prouver **une** asymptote. Le hint doit préciser **quelle** écriture utiliser.

#### Décomposition en éléments simples / Intégrales

Le hint oriente vers la technique de calcul (substitution, éléments simples, IPP) sans donner le résultat :

```json
"hint": "Posez $u = e^x$, $du = e^x\\,dx$. Décomposez $\\frac{1}{u(u+2)}$ en éléments simples : $\\frac{1}{2}(\\frac{1}{u} - \\frac{1}{u+2})$."
```

#### Point d'inflexion

Le hint rappelle le lien $f'' = 0$ avec changement de signe, sans donner la valeur :

```json
"hint": "$f''$ change de signe en $x = \\ln 2$ (négatif avant, positif après). Le point d'inflexion est $(\\ln 2, f(\\ln 2))$."
```

#### Géométrie dans l'espace — Sphère tangente

Le hint décompose : trouver le centre, puis vérifier la tangence :

```json
"hint": "Le centre $\\Omega$ est sur $(\\Delta)$ à distance $R$ de $A$. Puis $H$ est le symétrique de $A$ par rapport à $\\Omega$ : $H = 2\\Omega - A$."
```

---

### Exemples

**Question** : Montrer que $(v_n)$ est géométrique de raison $\frac{2}{3}$.

❌ Trop direct :
```
"hint": "On calcule v_{n+1}/v_n et on trouve 2/3."
```

✅ Bon hint :
```
"hint": "Calculez $v_{n+1}$ en remplaçant $u_{n+1}$ par son expression, puis simplifiez pour obtenir $\\frac{2}{3} v_n$."
```

**Question** : En déduire que $\lim f(x) = 1$.

❌ Ignore le lien avec la question précédente :
```
"hint": "La limite vaut 1."
```

✅ Bon hint :
```
"hint": "Étudiez $\\lim_{x \\to +\\infty} xe^{-x}$ et utilisez la continuité du logarithme."
```

---

## Encodage

- Fichier UTF-8 **sans BOM**
- Caractères natifs : `é`, `è`, `ê`, `à`, `'`, `—` (pas `\u00e9`, `\u2019`, `\u2014`)
- LaTeX entre `$...$` dans les champs `content` et `hint`
- Les doubles backslashs `\\` dans le JSON correspondent à un seul `\` en LaTeX

---

## Checklist avant validation

- [ ] Chaque question/sous-question a un `hint`
- [ ] Chaque question/sous-question (hors partie) a un `bareme`
- [ ] La somme des barèmes = `points` de l'exercice
- [ ] Les parties utilisent `"type": "partie"` avec `id` en `p1`, `p2`…
- [ ] Les préfixes d'id changent entre parties (`q*`, `r*`, `s*`…)
- [ ] Aucun `\uXXXX` dans le fichier — que du UTF-8 natif
- [ ] Le `content` des parties ne contient **pas** "Partie I :" — juste le texte introductif
