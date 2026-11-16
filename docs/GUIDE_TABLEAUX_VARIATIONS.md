# Guide — Tableaux de Signes & de Variations (qualité LaTeX)

> Objectif : produire, avec KaTeX + nos macros premium, des tableaux aussi soignés que ceux générés par `tkz-tab` en LaTeX.

KaTeX n'a pas `tkz-tab`. Toute la qualité visuelle repose donc sur 3 leviers :

1. Le bon **squelette `\begin{array}`**
2. Les **macros dédiées** (`\plus`, `\moins`, `\zero`, `\fleup`, `\fledown`, `\dbar`, `\pinf`, `\minf`, `\fleupB`, `\fledownB`, `\interdit`, `\tvstrut`, `\tsstrut`, `\blank{}`)
3. Un **espacement cellulaire** contrôlé via `\def\arraystretch{...}` et le strut `\tvstrut`

Respectés dans cet ordre, le rendu est indiscernable de `tkz-tab`.

---

## 1. Règles d'or

| Règle | Pourquoi |
|:------|:---------|
| Toujours `$$...$$` (display math) | Les tableaux cramés en inline sont illisibles |
| Toujours `\def\arraystretch{1.8}` min. avant `\begin{array}` pour un tableau de variations | Sinon les flèches paraissent ridicules |
| Jamais de lignes vides entre `\hline` et la ligne suivante | KaTeX ajoute un vide disgracieux |
| **Un `&` entre chaque cellule**, zéro espace parasite | Alignement précis |
| Utiliser `\fleup` / `\fledown`, pas `\nearrow` / `\searrow` bruts | Couleur + taille premium |
| Utiliser `\zero` sur une racine, pas `0` nu | Trait vertical bleu qui marque la rupture |
| `\dbar` (ou `\interdit`) sur une valeur interdite | Double barre rouge traversante |
| Une ligne qui **commence par `[`** s'écrit `\\ {}[…]` | Sinon KaTeX lit `[…]` comme un espacement et **tout le tableau disparaît** |

### ⚠️ Le piège n° 1 : une ligne qui commence par un intervalle

Dans un `array`, `\\` accepte un **argument optionnel de dimension** — `\\[2pt]`,
`\\[1.5em]`. Une ligne qui commence par un crochet est donc ambiguë :

```latex
\begin{array}{c|c}
I & f(I) \\ \hline
[0,1] & [0,2] \\      ← KaTeX lit « [0,1] » comme un espacement de ligne
\end{array}
```

KaTeX échoue avec `Invalid size: '0,1'` et **tout le tableau est figé en rouge**.

> Le **moteur insère désormais la parade automatiquement** (`utils/parser/latexNormalize.ts`) :
> vos fiches s'affichent même si le `{}` manque. On continue néanmoins d'écrire la forme
> explicite — un source qui dit ce qu'il fait reste relisible, et rien ne dépend d'une
> réparation invisible.

La parade LaTeX est un **groupe vide** entre `\\` et le crochet :

```latex
\begin{array}{c|c}
I & f(I) \\ \hline
{} \\ {}[0,1] & {}[0,2] \\
\end{array}
```

Règles de contrôle :

- cela ne concerne **que** le crochet collé à `\\` : `\\ \hline[0,1]` et
  `\\ {}[0,1]` sont corrects ;
- `\\[2pt]` reste un **vrai** espacement et n'est pas touché par la correction ;
- `]0,1[` en début de ligne n'est pas concerné (le crochet est fermant).

> L'outillage le détecte : `node tmp/check-math-katex.mjs fiche.json` (message
> « Invalid size ») et `npm run validate:content` (règle 14). Correction
> automatisée d'une fiche : `node tmp/fix-row-bracket.mjs fiche.json --apply`.

---

## 2. Structure type d'un tableau de signes

```
$$
\def\arraystretch{1.7}
\begin{array}{|c|ccccccc|}
\hline
x        & \minf & & x_1  & & x_2  & & \pinf \\
\hline
f'(x)    &       & \plus & \zero & \moins & \zero & \plus & \\
\hline
\end{array}
$$
```

**Invariants :**
- Première ligne : la variable (souvent `x`) avec bornes `\minf` et `\pinf`
- Nombre de colonnes = 2·(nb racines) + 1 (une colonne pour chaque racine + une entre chaque)
- Les signes sont placés **entre** deux racines (jamais sur la racine : c'est `\zero` qui y va)

### Exemple — Signe de $-x^2 + 3x - 2$

```json
"$$\\def\\arraystretch{1.7}\\begin{array}{|c|ccccc|}\\hline x & \\minf & & 1 & & 2 & & \\pinf \\\\\\hline -x^2+3x-2 & & \\moins & \\zero & \\plus & \\zero & \\moins & \\\\\\hline\\end{array}$$"
```

---

## 3. Structure type d'un tableau de variations

```
$$
\def\arraystretch{2.0}
\begin{array}{|c|ccccc|}
\hline
x        & \minf & & \alpha & & \pinf \\
\hline
f'(x)    &       & \plus & \zero & \moins & \\
\hline
f        & \minf & \fleup & f(\alpha) & \fledown & \minf \\
\hline
\end{array}
$$
```

**Invariants :**
- 3 lignes : `x`, `f'(x)`, `f`
- `arraystretch` à **2.0** (ou 2.2) — c'est ce qui fait tenir les flèches verticalement
- Les valeurs extrêmes et l'extremum local **occupent leur propre cellule** (pas entre deux cellules)
- Les flèches `\fleup` / `\fledown` vont **entre** les valeurs

### Exemple — Variations de $f(x) = x^2 - 2x + 5$

```json
"$$\\def\\arraystretch{2.0}\\begin{array}{|c|ccccc|}\\hline x & \\minf & & 1 & & \\pinf \\\\\\hline f'(x) & & \\moins & \\zero & \\plus & \\\\\\hline f & \\pinf & \\fledown & 4 & \\fleup & \\pinf \\\\\\hline\\end{array}$$"
```

---

## 4. Valeurs interdites

Pour une fonction non définie en `a` (ex. `f(x) = 1/(x-a)`), on marque la colonne avec une **double barre** `\dbar` dans chaque ligne qui la traverse.

```
$$
\def\arraystretch{2.0}
\begin{array}{|c|ccccc|}
\hline
x     & \minf & & a & & \pinf \\
\hline
f'(x) & & \moins & \dbar & \moins & \\
\hline
f     & 0 & \fledown & \dbar & \fledown & 0 \\
\hline
\end{array}
$$
```

Pour une double barre **encore plus marquée** (rendu extra-premium) : utiliser `\interdit`.

---

## 5. Forcer la hauteur des cellules — le strut

KaTeX ne connaît pas la hauteur visuelle d'une flèche. Si le tableau paraît tassé, injecter un **strut invisible** dans la première cellule :

| Macro | Effet | Quand l'utiliser |
|:------|:------|:------|
| `\tvstrut` | Cellule de 2.6em (descente 1em) | Ligne de variations |
| `\tsstrut` | Cellule de 1.7em | Ligne de signes |

```
f & \tvstrut \minf & \fleup & 4 & \fledown & \minf
```

Règle : **un seul strut par ligne**, dans la première cellule. En ajouter plusieurs ne fait rien de plus.

---

## 6. Flèches « grandes » — `\fleupB`, `\fledownB`

Pour un tableau qui occupe toute la largeur (fiche de cours, banner), les flèches standard peuvent paraître discrètes. Les variantes B sont ~30 % plus grandes :

```
f & \minf & \fleupB & 4 & \fledownB & \minf
```

À **ne pas** utiliser dans un tableau dense à 4+ racines — ça déborderait.

---

## 7. Signes — couleur automatique

| Macro | Rendu | Couleur | Usage |
|:------|:------|:--------|:------|
| `\plus` | **+** | vert émeraude | signe positif |
| `\moins` | **−** | rouge | signe négatif |
| `\zero` | **0** barré bleu | bleu | racine (signe change) |
| `\dbar` | ‖ | rouge | valeur interdite (discret) |
| `\interdit` | ‖ | rouge | valeur interdite (gras) |
| `\fleup` | ↗ | vert | croissance |
| `\fledown` | ↘ | rouge | décroissance |
| `\fleupB` | ↗ (gros) | vert | croissance, tableau spacieux |
| `\fledownB` | ↘ (gros) | rouge | décroissance, tableau spacieux |

---

## 8. Trous pédagogiques — `\blank{...}`

Pour créer un tableau à compléter par l'élève, entourer la valeur attendue par `\blank{}` :

```
f'(x) & & \blank{\plus} & \zero & \blank{\moins} &
f    & \minf & \blank{\fleup} & \blank{4} & \fledown & \minf
```

Le contenu est masqué à l'affichage et révélé au clic.

### Qui a le droit d'avoir des trous — et où

| Bloc | Trous dans le tableau |
|:-----|:----------------------|
| `exploration` (activité) | **oui**, jusqu'à 3 valeurs déjà connues — c'est le cœur de l'activité |
| `application` (exercice d'application) | **oui**, 3 à 5 trous sur les étapes clés |
| `definition`, `theorem`, `property`, `method`, `text`… | **non** — le cours se lit, il ne se devine pas |

Un trou dans une cellule de **cours** met l'élève en échec juste après avoir découvert la règle :
le tableau se réduit à un quiz sur un résultat qu'il n'a pas encore.

**Quelles cellules trouer** (le choix est didactique, pas décoratif) :

- la **valeur finale** d'une ligne (`f(\alpha)`, `4`) : c'est le résultat à produire ;
- un **signe** quand la règle vient d'être vue (`\blank{\plus}`) ;
- **jamais** le label de la ligne (`x`, `f'(x)`, `f`) : sans lui, la table n'a plus de sens ;
- **jamais** une borne `\minf` / `\pinf` : elle est donnée par l'énoncé.

Le trou garde la **largeur de la réponse** (le texte est masqué, pas supprimé) : la table
ne bouge pas d'un pixel au moment de la révélation — c'est ce qui la rend lisible sur tablette.
Un trou par cellule au maximum, et jamais deux trous dans la même colonne si la table est étroite.

---

## 9. Checklist pro — avant validation

- [ ] `$$...$$` (pas `$...$`)
- [ ] `\def\arraystretch{1.7}` (signes) ou `{2.0}` (variations) **avant** `\begin{array}`
- [ ] Nombre de `c` dans la spec = nombre de colonnes de contenu (hors label à gauche)
- [ ] Une `\hline` après chaque ligne logique, **pas de ligne vide**
- [ ] `\minf` / `\pinf` sur les bornes (pas `-\\infty` direct)
- [ ] Racines avec `\zero`, jamais `0` nu
- [ ] Valeurs interdites avec `\dbar` sur **toutes** les lignes qui la traversent (`x`, `f'`, `f`)
- [ ] Flèches : `\fleup` / `\fledown` entre deux valeurs, jamais sur une valeur
- [ ] Si la cellule paraît tassée → ajouter `\tvstrut` dans la 1ʳᵉ cellule de la ligne
- [ ] Aucune ligne ne commence par `[` collé à `\\` → écrire `\\ {}[…]`

---

## 10. Anti-patterns courants — à ne **jamais** reproduire

| Mauvais | Pourquoi c'est faux | Correction |
|:--------|:--------------------|:-----------|
| `\begin{array}{\|ccccc\|}` (oublie du `c\|` après `x`) | Pas de séparation entre la colonne label et les données | `\|c\|ccccc\|` |
| `f'(x) & + & 0 & - & 0 & +` | Signes nus, zéros nus, pas de couleur | `f'(x) & \plus & \zero & \moins & \zero & \plus` |
| `\searrow` brut | Pas de couleur, trop petit | `\fledown` |
| `\|\|` ou `\|` nu pour valeur interdite | Rend mal, pas visible | `\dbar` (ou `\interdit`) |
| `\begin{array}` sans `\def\arraystretch` | Tableau écrasé verticalement | Ajouter `\def\arraystretch{2.0}` avant |
| Mettre `\hline\hline` | Double filet non professionnel | Une seule `\hline` |
| `[0,1] & … \\` puis `[0,2] & …` | Le `[` collé à `\\` est lu comme un espacement → **tableau perdu** | `{} \\ {}[0,2] & …` |

---

## 11. Template prêt à copier — 2 racines, variations complètes

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "$$\\def\\arraystretch{2.0}\\begin{array}{|c|ccccccc|}\\hline x & \\minf & & x_1 & & x_2 & & \\pinf \\\\\\hline f'(x) & & \\moins & \\zero & \\plus & \\zero & \\moins & \\\\\\hline f & \\tvstrut \\pinf & \\fledown & f(x_1) & \\fleup & f(x_2) & \\fledown & \\minf \\\\\\hline\\end{array}$$"
}
```

## 12. Template — Valeur interdite en `a`, 1 extremum en `b`

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "$$\\def\\arraystretch{2.0}\\begin{array}{|c|ccccccc|}\\hline x & \\minf & & a & & b & & \\pinf \\\\\\hline f'(x) & & \\plus & \\dbar & \\plus & \\zero & \\moins & \\\\\\hline f & \\tvstrut \\minf & \\fleup & \\dbar & \\fleup & f(b) & \\fledown & \\minf \\\\\\hline\\end{array}$$"
}
```

---

## 13. Rendu compact vs spacieux

- **Compact** (fiche de cours, nombreuses racines) : `arraystretch = 1.7`, flèches `\fleup` / `\fledown`, sans strut
- **Spacieux** (exercice isolé, banner pédagogique) : `arraystretch = 2.2`, flèches `\fleupB` / `\fledownB`, strut `\tvstrut` sur la ligne variations

**Ne jamais mélanger** : un tableau = un niveau de stretch.

---

## 14. Réparer un tableau qui casse

Un tableau cassé ne se plaint pas : il **disparaît** (remplacé par une tache rouge) ou affiche ses commandes en clair au milieu du bloc. Ces pannes sont réelles, reproduites contre KaTeX, et chaque message d'erreur est cité exactement.

### 14.1 Diagnostic — du symptôme à la cause

| Ce que voit l'élève | Message KaTeX | Cause | Remède |
|:--------------------|:---------------|:------|:-------|
| Tout le tableau, en rouge | `Undefined control sequence: \cline` | **KaTeX ne connaît pas `\cline`** (traît partiel sous une colonne) | `\hline` (trait complet), ou **deux `array`** : la division euclidienne d'un côté, le quotient de l'autre |
| Tout le tableau, en rouge | `Undefined control sequence: \multicolumn` ou `\multirow` | Cellule fusionnée : **non supportée** | Repenser le tableau — une colonne en moins, un intitulé répété, ou deux tableaux |
| La commande en clair, puis la fin du bloc perdue | `Undefined control sequence: \hlineP` | `\hline` **collé** à la commande suivante : KaTeX avale les lettres qui suivent | Une **espace** après `\hline` : `\hline P(X=k)=0` |
| Une cellule seule, en rouge | `Expected 'EOF', got '}'` | Accolade orpheline : `x^3 -} x^2`, `\frac{x^2 -} 1}{x-1}`, `\overrightarrow{u}}` | Recompter les accolades de la cellule ; `node tmp/fix-katex-errors.mjs` sait les réécrire |
| Une cellule seule, en rouge | `Can't use function '$'` | `$` écrit **dans** une cellule : un `array` est déjà en mode mathématique | Retirer les `$` : `& a &`, jamais `& $a$ &` |
| `Undefined control sequence` sur une commande qui existe pourtant | `Undefined control sequence: \subset` | Maths ou gras insérés dans `\text{...}`, qui n'accepte que du texte | Sortir les maths de `\text{}` : `\textbf{Si } A \subset B` |
| Colonnes décalées : « la 2ᵉ valeur est dans la 3ᵉ colonne » | *aucun message* — panne **silencieuse** | Un `&` manquant sur une ligne | Autant de cellules que de colonnes, sur **chaque** ligne |
| La dernière ligne n'a pas de trait | *aucun message* | `\\` oublié en fin de dernière ligne | `\\` à la fin de **chaque** ligne, y compris la dernière |
| Cadre vertical absent | *aucun message* | `|` absents du préambule | `{|c|ccccccc|}` |
| Tableau écrasé verticalement | *aucun message* | `\def\arraystretch` absent | `\def\arraystretch{1.7}` (signes) ou `{2.0}` (variations) avant `\begin{array}` |
| Le tableau **entier perdu**, remplacé par une espace | `Invalid size` | Ligne commençant par `[` collé à `\\` | `\\ {}[0,1] & …` (§ 1 et § 10) |

### 14.2 Avant / après — trois réparations types

| Panne | Avant | Après |
|:------|:------|:------|
| Trait partiel | `…\ x+3\\\cline{2-2}x^3+3x^2 & x^2-x-2` | `…\ x+3\\\hline x^3+3x^2 & x^2-x-2` — ou mieux : deux `array` séparés (calcul, puis quotient) |
| Commande collée | `x^n\\\hlineP(X=k)=0` | `x^n\\\hline P(X=k)=0` |
| Maths dans `\text{}` | `\text{\textbf{Si } A \subset B}` | `\textbf{Si } A \subset B` |

### 14.3 La procédure en trois temps

```bash
# 1. Localiser : message KaTeX exact + classe de correctif
node tmp/check-math-katex.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json

# 2. Réparer (dry-run par défaut, écrire seulement quand la liste est validée)
node tmp/fix-katex-errors.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json --apply

# 3. Re-contrôler
node tmp/check-math-katex.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json
node tmp/audit-revision.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json
npm run validate:content
```

Le réparateur ne touche **jamais** une formule valide : chaque correction candidate est rendue par KaTeX avant écriture, et seules les cellules qui échouent *encore* sont réécrites (plusieurs passes).

### 14.4 Quand ne pas réparer

- **Le tableau n'a pas de sens mathématique** (gauche/droite, avant/après, signe/variation) : c'est de la mise en page → le remplacer par une liste ou des phrases. C'est la première cause des tableaux qui cassent, avant même les commandes fautives.
- **Il dépasse 6 à 7 colonnes** : illisible sur téléphone → le scinder, ou le transformer en deux lignes de lecture.
- **Il répète une phrase entière dans une cellule** : la phrase va dans le `text` du dessus, le tableau ne garde que le calcul.
