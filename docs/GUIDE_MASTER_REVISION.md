# GUIDE MAÎTRE — Création de Fiches de Révision JSON
### Instruction complète pour le robot de traitement de cours (PDF / image)

> **Ce guide est la seule référence.** Il fusionne et remplace les deux guides précédents.
> Avant d'écrire un seul caractère JSON, lire ce guide en entier.

---

## Sommaire

| § | Contenu | Quand le lire |
|:-:|:--------|:--------------|
| 0 | Mission du robot | Avant de commencer |
| 1 | Règles absolues (15 règles) | Avant de commencer |
| — | Nouveautés du format | Avant de commencer |
| 2 | Processus de travail (5 phases) | Avant de commencer |
| 3 | Section `intro`, listes, colonnes, `warning` | En rédigeant |
| 4 | Style de rédaction, **mots simples**, titres, **budget de longueur** | En rédigeant |
| 5 | Types de blocs — référence complète | En rédigeant |
| 5 bis | Les types de blocs restants | En rédigeant |
| **6** | **Traiter le document source (PDF, scan)** | Au début du travail |
| **7** | **Les figures d'une fiche** | Dès qu'une figure est utile |
| **8** | **Listes, tableaux, colonnes — mise en page et réparation** | Dès qu'un exercice a plusieurs questions |
| **9** | **Vérifier le rendu avant de livrer** | Avant de livrer |

---

## Démarrage rapide — la séquence en dix lignes

1. **Lire** le document source en entier, sans rien écrire (§ 2, phase 1).
2. **Identifier** le niveau, les prérequis, la vraie difficulté (§ 2, phase 2).
3. **Classer** chaque paragraphe par type de bloc (§ 2, phase 3).
4. **Décider** des figures, ou de leur absence (§ 7).
5. **Faire valider** les preuves par l'utilisateur (§ 2, phase 5).
6. **Rédiger** l'`intro`, puis les sections dans l'ordre du manuel (§ 3).
7. **Écrire** les blocs avec des mots simples et des titres-questions (§ 4).
8. **Aérer** les corrections, une idée par ligne (§ 5, `application`).
9. **Vérifier** : `npm run validate:content` puis `tmp/check-math-katex.mjs` (§ 9).
10. **Relire l'image complète** : titres seuls, puis question par question (§ 9).

---

## 0. Mission du robot

**Rôle** : Lire un PDF ou une image de cours, analyser son contenu pédagogique en profondeur, puis produire une fiche JSON structurée, fidèle, pédagogique et prête à être affichée dans l'application.

**Posture** : Être un éducateur expérimenté qui rédige un manuel scolaire — précis, clair, chaleureux, exigeant. Pas un transcripteur. Pas un résumeur automatique.

**Public** : élèves marocains et tunisiens du lycée (Tronc Commun, 1BAC, 2BAC). Français langue seconde. Niveau moyen à bon.

**Objectif final** : que l'élève puisse réviser, comprendre et s'auto-évaluer à partir de cette seule fiche.

---

## 1. Règles Absolues — Lire avant tout

> Ces règles ne souffrent aucune exception.

1. **Ne jamais inventer de contenu.** Chaque bloc provient du document source. Aucune formule, aucun théorème, aucun exemple ne doit être inventé.

2. **Les `\blank{}` vivent dans les blocs `application`.** Dans une `exploration`, ils ne sont admis qu'**à l'intérieur d'un tableau à compléter** — jamais dans la phrase de découverte. Aucun blank dans les définitions, théorèmes, propriétés, méthodes ou tout autre type. **Les tableaux suivent la même règle** : une table d'activité ou d'exercice d'application peut (et doit, quand elle se devine) contenir des trous ; une table de cours se lit, elle ne se devine pas.

3. **Les exercices d'application sont toujours dans des blocs `application` séparés.** Jamais intégrés dans un bloc `definition`, `property` ou `theorem`.

4. **Ne jamais utiliser le tiret long `—`.** Utiliser à la place des mots français : `,` `;` `:` `(...)` ou reformuler.

5. **Ne jamais utiliser `arctan`, `arcsin`, `arccos`.** Hors programme au Maroc et en Tunisie. Pour l'argument d'un complexe ou un angle, utiliser le cercle trigonométrique et les signes de cos/sin.

6. **Ne jamais utiliser `Z` majuscule pour désigner un nombre complexe.** Toujours `z`, `w`, `u`, `v` en minuscule.

7. **Ne jamais saisir `\checkmark` ou `✓` dans le contenu.** Écrire « vérifié », « condition remplie », « résultat confirmé » ou « résultat cohérent ». Dans `cela_permet_de`, l'application génère automatiquement des puces rondes bleues, sans ombre ni effet devant les compétences.

8. **Ne jamais utiliser `Étape 1 :`, `Étape 2 :`...** dans les applications. Utiliser des connecteurs naturels : `\textbf{Calcul de... :}`, *puisque*, *d'où*, *on en déduit*.

9. **Ne jamais utiliser `D.A.`, `D.E.`, `Conclusion :`.** Conclure directement par le résultat.

10. **Pas de bloc `summary` ni `strategy`.** Ces types sont supprimés de ce projet. Utiliser `method` ou `technique` à la place de `strategy`.

11. **Pas de flèches `â†’` ou `â‡’` pour remplacer des mots.** Réservées aux formules mathématiques.

12. **Tout repère doit être introduit.** Si on parle de $\vec{u}$, de coordonnées ou de repère, la section doit avoir posé $\left(O\,;\vec{u}\,;\vec{v}\right)$ dès le bloc `text` d'ouverture.

13. **Ne jamais écrire `\enumerate{...}` ni `\itemize{...}`.** Ces commandes n'existent pas : une liste est un **environnement**, jamais une macro à argument. Écrire `\begin{enumerate}\item ...\item ...\end{enumerate}`. Voir la section « Listes ».

14. **Ne rédiger que les preuves classiques et typiques du lycée.** Seules les démonstrations exigibles au programme, celles que l'élève doit savoir refaire le jour de l'examen. Aucune preuve hors programme, universitaire, ou admise par le manuel source. Mieux vaut aucun bloc `proof` qu'un bloc hors programme. Voir le bloc `proof`.

15. **Toujours faire confirmer le contenu des preuves par l'utilisateur avant de l'écrire dans le JSON.** Proposer chaque preuve rédigée en clair, attendre la validation explicite, puis seulement écrire le bloc `proof` dans le fichier. Aucune preuve n'entre dans une fiche sans accord.

---

## Nouveautés du Format Révision

Ces règles sont obligatoires pour toutes les nouvelles fiches.

| Nouveauté | Règle JSON | Effet dans l'application |
|:----------|:-----------|:-------------------------|
| Type canonique d'exercice | Utiliser `"type": "application"` | Badge affiché : `Exercice d'application` |
| Ancien type | Ne plus créer `"type": "example"` | Lu seulement comme alias de compatibilité |
| Difficulté | Ajouter `"difficulty": 1..5` dans chaque `application` | Étoiles modernes affichées à droite du cadre |
| exploration guidée | Utiliser `"type": "exploration"` | Badge jaune et cadre doré moderne |
| Usage d'une connaissance | Utiliser `"type": "cela_permet_de"`, avec un tableau `content` de compétences | Titre fixe « Cela permet de : », puces rondes élégantes et fond gris bleuté clair |
| Commande d'énoncé | Utiliser `\qst{...}` (`\question{...}` reste alias) | Accepte énoncé long, formules et listes |
| Plusieurs questions | Mettre `\begin{enumerate}` avec `\item` dans `\qst{...}` | Numérotation claire des sous-questions |
| Questions en colonnes | Encadrer la liste par `\begin{columns}...\end{columns}` (cf. « Colonnes — énoncés à plusieurs questions ») | Énoncé réparti sur 2 colonnes ; une seule colonne sur téléphone |
| Correction multi-questions | Utiliser `\begin{enumerate}` après `\qst{...}` | Une seule correction, badge `Correction` en mode étendu |
| Question directe | Garder `\qst{...}` seul | Même mécanisme de lecture progressive |
| Plusieurs fiches par chapitre | Déclarer chaque fiche dans `revisions` du manifeste (classe **et** chapitre) | Une étape « Leçon 1 », « Leçon 2 » sur la carte ; progression et blancs propres à chaque fiche |
| Voix des garde-fous | Ouvrir un `warning` par une **phrase adressée à l'élève**, jamais par un libellé figé | Un conseil qui se lit, au lieu d'une étiquette répétée à l'identique |
| Badges | Texte blanc sur fond coloré | Cohérence visuelle avec le dashboard |
| Figures de schéma | Figure **SVG** (voir `docs/GUIDE_SVG_TIKZ.md`), rattachée à un bloc **toujours visible**, avec sa prose dans `media.caption` — **jamais dans l'image** | La figure s'affiche d'emblée, et son commentaire est composé par l'application (LaTeX et accents corrects) |

### Figures : les trois règles qui se paient cash

1. **La prose ne va jamais dans l'image** : elle va dans `media.caption`.
2. **Rattacher la figure à un bloc toujours visible**, sinon elle reste cachée
   jusqu'au clic de l'élève.
3. **`width` proportionnelle à la largeur du `viewBox`**, sinon les libellés
   d'une même fiche n'ont pas la même taille apparente.

Détail, exceptions et exemples : **§ 7 « Les figures d'une fiche »**. Chaîne de
fabrication complète : **`docs/GUIDE_SVG_TIKZ.md`** (§ 0 = la liste des consignes).

Mini-schéma obligatoire pour un bloc `application` :

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{...}\\par\\smallskip ..."
}
```

Barème de difficulté :

| Valeur | Sens pédagogique | Usage typique |
|:------:|:-----------------|:--------------|
| `1` | Application immédiate | Lecture directe, calcul en une étape |
| `2` | Application simple | Deux étapes, formule à choisir |
| `3` | Niveau standard BAC | Raisonnement guidé, 3 à 5 blanks |
| `4` | Exercice exigeant | Plusieurs idées ou changement de forme |
| `5` | Synthèse difficile | Piège, combinaison de techniques, autonomie forte |

Si le document source ne donne pas d'indice de niveau, choisir `3` par défaut. Ne jamais omettre `difficulty`.

---

## 2. Processus de Travail — Séquence Obligatoire

> Effectuer ces phases **dans l'ordre** avant d'écrire le moindre caractère JSON.

### Phase 1 — Lire tout le document source sans rien écrire

Parcourir l'intégralité du PDF/image. Comprendre :
- Le sujet principal et les sous-thèmes
- La logique de progression (du simple vers le complexe)
- Les concepts nouveaux introduits
- Les formules et théorèmes clés
- Les exercices d'application présents
- Les erreurs fréquentes signalées

### Phase 2 — Identifier le public et le niveau

- Quel niveau BAC ? (TC, 1BAC, 2BAC)
- Quels prérequis sont supposés connus ?
- Quelle est la vraie difficulté du chapitre pour l'élève moyen ?
- Quel est le fil conducteur du chapitre ?

### Phase 3 — Classifier chaque paragraphe source

Pour chaque paragraphe, décider son type avant d'écrire le JSON :

| Ce que dit le paragraphe | Type de bloc |
|--------------------------|:------------:|
| Introduit un concept avec une caractérisation précise | `definition` |
| Énonce un résultat majeur avec hypothèses et conclusion | `theorem` |
| Donne une règle ou formule directement utilisable | `property` |
| Traduit la connaissance précédente en actions et en situations d'usage | `cela_permet_de` |
| Résultat intermédiaire nécessaire pour une démonstration | `lemma` |
| Conséquence immédiate d'un théorème | `corollary` |
| Implication ou application notable d'un résultat | `consequence` |
| Illustre un concept par un calcul (avec blanks) | `application` |
| Montre comment exploiter un résultat, une figure ou une méthode sans trous | `exploration` |
| Recette pratique pour résoudre un type de problème | `method` |
| Technique de calcul pour une expression précise | `technique` |
| Démontre rigoureusement un résultat | `proof` |
| Image visuelle ou géométrique intuitive | `intuition` |
| Signale une erreur fréquente ou un piège | `warning` |
| Nuance ou complément | `remark` |
| Remarque neutre, sans badge coloré | `note` |
| Ouverture / liaison entre sections (obligatoire en 1er) | `text` |

> **Il n'existe pas de type `culture`.** Le contexte historique et les liens avec
> le monde réel se traitent dans le bloc `text` de la section, avec l'ouverture
> rédigée (§ 3, « Comment le construire ») : c'est là que le ton culturel a sa
> place, et c'est le seul endroit prévu pour lui.

### Phase 4 — Planifier la structure des sections

Dresser la liste des sections avant d'écrire le JSON :
- Section 0 : intro (toujours)
- Sections 1 à N : découpage logique du cours

### Phase 5 — Faire valider les preuves avant d'écrire le JSON

Point d'arrêt obligatoire. Présenter à l'utilisateur la liste des blocs `proof` envisagés, puis chaque preuve rédigée en clair, et **attendre son accord**. Seules les preuves confirmées sont écrites dans le fichier. Détail de la procédure et critères de sélection : bloc `proof`.

---

## 3. Section d'Introduction — Format `intro` (Obligatoire)

La première section de toute fiche contient **un seul bloc** de type `"intro"`. C'est le premier contact de l'élève avec le chapitre.

### Comment le construire

**Avant de rédiger :** analyser dans cet ordre :
1. La fiche entière — identifier le fil conducteur et les concepts clés
2. Les quiz du chapitre — identifier les questions les plus fréquentes et les pièges typiques
3. Les exercices — identifier les compétences réellement évaluées

**Mission du bloc intro** — 3 à 4 phrases qui donnent :

| Zone | Contenu | Ton |
|:-----|:--------|:----|
| **Gauche** (2–3 phrases) | Objectif du chapitre + difficulté principale | Pédagogique, direct, motivant |
| **Droite** (1–2 phrases) | Savant historique + héritage moderne | Culturel, inspirant |

La séparation gauche/droite est **automatique** : le composant coupe juste avant la commande `\savant{}`. La phrase contenant `\savant{}` va toujours dans la zone droite.

### Structure JSON

```json
{
  "id": "intro",
  "category": "course",
  "title": "",
  "blocks": [
    {
      "type": "intro",
      "content": "Les nombres complexes permettent d'\\objectif{résoudre tout polynôme du second degré} et d'interpréter géométriquement les rotations et homothéties du plan. La \\defi{difficulté} principale réside dans la maîtrise des trois formes et dans le passage entre elles selon la situation. \\savant{Leonhard Euler} unifia la notation $e^{i\\theta} = \\cos\\theta + i\\sin\\theta$ au XVIIIe siècle, faisant des complexes un outil central en électronique, en traitement du signal et en mécanique quantique.",
      "media": {
        "src": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Leonhard_Euler.jpg",
        "type": "image",
        "position": "float-right",
        "width": "14%",
        "caption": "Leonhard Euler (1707–1783)"
      }
    }
  ]
}
```

### Commandes disponibles dans `content`

| Commande | Rendu | Usage |
|:---------|:------|:------|
| `\objectif{texte}` | **TEXTE** indigo, gras, majuscules | L'objectif principal du chapitre |
| `\defi{texte}` | **texte** rouge, semi-gras | La difficulté ou l'enjeu réel |
| `\savant{Nom}` | **Nom** vert teal, semi-gras | Nom du mathématicien |
| `$...$` | Formule KaTeX inline | Une formule emblématique maximum |

### Commandes **interdites** dans `intro`

`\textbf{}` hors `$` · `\redb{}` · `\blueb{}` · `\greenb{}` · `\method{}` · `\def\arraystretch` · `\mathqst{}`

### Commandes **interdites partout** dans le contenu JSON

| Commande | Pourquoi ? |
|:---------|:-----------|
| `\def\arraystretch{...}` | **Auto-injectée** par `MathRenderer.tsx` (ligne 63) : `\def\arraystretch{1.4}` pour le mode display (`$$`), `\def\arraystretch{1.2}` pour le mode inline (`\(`). L'ajouter dans le JSON provoque une **double définition** et un échec de compilation KaTeX. Ne JAMAIS l'écrire dans `content`. |
| `\enumerate{...}` · `\itemize{...}` | **Ces commandes n'existent pas.** Le parseur (`src/utils/parser/`) ne reconnaît que les environnements `\begin{...}` / `\end{...}` ; une macro inconnue n'est pas interprétée et son texte brut s'affiche tel quel à l'écran (`\enumerate{Si $d\mid a$...}` visible dans la fiche). Utiliser la syntaxe de la section « Listes ». |

### Listes — une seule syntaxe valide

Une liste est un **environnement** ouvert par `\begin{...}` et fermé par `\end{...}`. Chaque élément est introduit par `\item`. Il n'existe **aucune** commande `\enumerate{}` ou `\itemize{}` à argument.

| Environnement | Rendu | Quand l'utiliser |
|:--------------|:------|:-----------------|
| `\begin{enumerate}\item ...\end{enumerate}` | Liste numérotée `1.` `2.` `3.` | Étapes ordonnées, phases d'une démonstration, sous-questions d'un `\qst{...}` |
| `\begin{itemize}\item ...\end{itemize}` | Liste à puces | Propriétés de même nature, cas distincts sans ordre |
| `\itemsize{...}` | Une puce isolée, un appel par idée | **Uniquement** dans `remark` : exactement 2 idées autonomes reliables par « et aussi ». Ce n'est pas un environnement, c'est une macro à argument |

Règles :

- **Un seul** `\begin{...}` pour toute la liste, et **un** `\item` par élément. Ne jamais répéter l'ouverture de l'environnement pour chaque élément.
- L'environnement se ferme toujours : un `\begin{enumerate}` sans `\end{enumerate}` casse le rendu du bloc entier. `npm run validate:content` (règle 15) le détecte.
- **Une sous-liste dans un `\item` est permise** (`\begin{enumerate}` dans la question 2, par exemple) : le moteur apparie les fermetures par profondeur, la sous-liste se ferme par son propre `\end{enumerate}` et la liste principale par le sien. S'en tenir à **deux niveaux** — au-delà, l'indentation mange la largeur sur téléphone.
- Introduire la liste par une phrase suivie de `\par` (ou `\par\smallskip`) avant `\begin{...}`.
- Le contenu d'un `\item` accepte formules inline `$...$`, `\textbf{}`, `\blank{}` (dans `application` et `exploration` uniquement).

#### Numérotation automatique des sous-listes

Les sous-questions d'un `enumerate` imbriqué ne repartent **pas** à `1.` : le moteur déduit le marqueur de la profondeur, et rien ne s'écrit dans le JSON.

| Profondeur | Marqueur | Exemple |
|:----------:|:---------|:--------|
| liste principale | décimal | `1.` `2.` `3.` |
| sous-liste dans un `\item` | lettre minuscule | `a.` `b.` `c.` |
| troisième niveau (à éviter) | romain minuscule | `i.` `ii.` |

Conséquences pratiques : une **sous-liste repart toujours à `a.`**, une **nouvelle liste** du même bloc repart à `1.`, et deux listes sœurs ne partagent jamais leurs numéros. Écrire `\item (a)` à la main ferait donc **doublon** avec le marqueur généré.

#### Choisir le bon outil

| Situation | Outil | Pourquoi |
|:----------|:------|:---------|
| Les deux sens d'une équivalence | `enumerate` + `\textbf{Sens direct.}` / `\textbf{Réciproque.}` | Le numéro seul ne dit pas *quel* sens est démontré. L'étiquette le dit |
| Critère d'existence (nécessaire puis suffisant) | `enumerate` + `\textbf{Condition nécessaire.}` / `\textbf{Condition suffisante.}` | Même raison, vocabulaire adapté au critère |
| Étapes enchaînées, chacune réutilisant la précédente | `enumerate` nu, sans étiquette | L'ordre porte déjà tout le sens |
| Cas indépendants, 3 ou plus, sans ordre | `itemize` | La puce annonce « ordre indifférent » |
| 2 idées autonomes dans un `remark` | `\itemsize{}` | Macro dédiée à ce cas précis |

> Quand une étiquette `\textbf{Réciproque.}` ouvre l'item, supprimer le « Réciproquement, » qui commençait la phrase : garder les deux fait doublon.

Correct :

```json
"content": "Nous comparons les diviseurs communs.\\par\\smallskip\\begin{enumerate}\\item \\textbf{Sens direct.} Si $d\\mid a$ et $d\\mid b$, alors $d$ divise $a-bq=r$.\\item \\textbf{Réciproque.} Si $d\\mid b$ et $d\\mid r$, alors $d$ divise $bq+r=a$.\\end{enumerate}"
```

Interdit :

```json
"content": "Nous comparons les diviseurs communs.\\par\\smallskip\\enumerate{Si $d\\mid a$ et $d\\mid b$...}\\enumerate{Réciproquement...}"
```

### Colonnes — énoncés à plusieurs questions

> Commande : `\begin{columns}...\end{columns}` (alias `\begin{colonnes}`). C'est un **environnement**, jamais une macro `\columns{...}`.
> Elle sert à **raccourcir un énoncé qui aligne plusieurs questions courtes** — par exemple des questions 1), 2), 3), 4) qui tiendraient sinon sur une pleine hauteur d'écran.
> Le contenu pédagogique reste écrit exactement comme d'habitude : `\begin{enumerate}` + `\item`. Les colonnes ne remplacent **jamais** la liste.

#### Deux usages

| Forme écrite dans `content` | Rendu | Quand l'utiliser |
|:----------------------------|:------|:-----------------|
| `\begin{columns}\begin{enumerate}\item …\item …\end{enumerate}\end{columns}` | **Flux** : la liste se répartit toute seule sur **2 colonnes** | **Le cas normal** — questions courtes et indépendantes |
| `\begin{columns}\column{…}\column{…}\end{columns}` | **Colonnes explicites** : 2 à 3 blocs côte à côte ; 4 et plus s'enroulent deux par ligne | Comparer deux méthodes, deux rédactions ou deux cas symétriques |

Le mode **flux** est celui à privilégier : la numérotation `1. 2. 3.` et la sémantique de liste sont **conservées**, ce que les colonnes explicites ne savent pas faire (chaque colonne redémarrerait à `1.`).

**Options** (facultatives, entre crochets collés à `\begin{columns}`) : `[3]` nombre de colonnes du mode flux (2 par défaut, 4 au maximum), `[2,rule]` filet vertical, `[2,gap=8mm]` gouttière. `\columnbreak` force le texte suivant en haut de la colonne suivante. Détail : `guide_latex_revision.md` § 11, « Colonnes ».

> **Documents imprimés.** Le préréglage d'impression **Correction devoir maison** met déjà tout le contenu sur 2 colonnes (en-tête normal, pleine largeur). Dans ce document, la règle 4 ci-dessous ne s'applique pas : la correction n'est pas enveloppée dans `columns`, c'est la page qui est en colonnes.

#### Conditions d'emploi — les 5 règles

| # | Règle | Pourquoi |
|:-:|:------|:---------|
| 1 | Chaque question tient sur **1 à 2 lignes** | Au-delà, la colonne devient illisible |
| 2 | Les questions sont **indépendantes** | Si la question 3 utilise le résultat de la 2, la lecture en colonnes casse l'enchaînement |
| 3 | **2 à 4 questions** | Au-delà, découper en deux blocs `application` plutôt que de tasser |
| 4 | **Jamais la correction** | Les colonnes ne concernent que `\qst{...}` ; la correction est un `\begin{enumerate}` simple, car elle porte le raisonnement |
| 5 | **Aucun `\blank{}` dans les colonnes** | Les trous interactifs sont réservés à la correction, qui n'est jamais en colonnes |

#### Ce que l'application gère toute seule

- **≤ 720 px** (téléphone) : retour automatique à **une seule colonne**. Ne jamais gérer le responsive dans le JSON.
- **Impression** : un item de liste n'est jamais coupé entre deux colonnes ni entre deux pages.
- **Équilibrage** : les colonnes se remplissent d'elles-mêmes, il n'y a aucune largeur ni aucun saut à écrire dans le JSON.

#### Correct — 3 questions courtes et indépendantes

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{Soit $f$ continue sur $[0,2]$ avec $f(0)=3$ et $f(2)=-1$.\\begin{columns}\\begin{enumerate}\\item Que peut-on affirmer sur l'équation $f(x)=0$ ?\\item Peut-on affirmer que la solution est unique ?\\item Quelle hypothèse supplémentaire assure l'unicité ?\\end{enumerate}\\end{columns}}\\par\\smallskip\\begin{enumerate}\\item Le théorème des valeurs intermédiaires assure l'existence d'au moins une solution dans $]0,2[$.\\item La continuité seule ne permet pas de conclure à l'unicité.\\item La stricte monotonie sur $[0,2]$ assure l'unicité.\\end{enumerate}"
}
```

#### Interdit — question longue, dépendante, ou avec `\blank{}`

```json
"content": "\\qst{\\begin{columns}\\begin{enumerate}\\item Montrer que $f$ est continue sur $I$, calculer $f'(x)$, dresser son tableau de variations complet, puis en déduire que l'équation $f(x)=0$ admet une unique solution.\\item En déduire $\\blank{\\alpha}$ puis la position relative de $(C_f)$.\\end{enumerate}\\end{columns}}\\par\\smallskip\\begin{enumerate}...\\end{enumerate}"
```

Trois fautes : la première question est trop longue pour une colonne, la seconde dépend de la première, et `\blank{}` n'a rien à faire dans un énoncé mis en colonnes.

### Blocs `warning` — la phrase d'ouverture

Le bloc `warning` porte le badge « Attention ». Il ne s'ouvre **jamais** par un libellé figé : la formule répétée d'une fiche à l'autre finit par ne plus être lue.

| Interdit (libellé figé) | Correct (phrase qui parle à l'élève) |
|:------------------------|:--------------------------------------|
| `\textbf{Erreur fréquente :}` | *Une erreur très fréquente, que vous ne devez pas commettre :* |
| `\textbf{Erreur classique :}` | *C'est une erreur classique, ne la commettez pas :* |
| `\textbf{Erreurs fréquentes :}` (liste) | *Ces erreurs très fréquentes vous coûteront des points :* |
| `\textbf{Piège classique :}` | *Un piège classique dans lequel vous ne devez pas tomber :* |
| `\textbf{Attention :}` | *Attention, c'est ici que vous risquez de vous tromper :* |
| `\textbf{Point de vigilance :}` | *Le point de vigilance à ne pas oublier :* |
| `\textbf{À ne pas confondre :}` | *Deux choses à ne surtout pas confondre :* |

Règles :

- La phrase se **termine par « : »** et annonce ce qui suit.
- **Accord du nombre** : un libellé au pluriel annonce une liste, donc une phrase au pluriel. « Un piège… : » suivi de quatre puces se lit mal.
- **Varier** : reprendre mot pour mot la même phrase dans toute une fiche recrée l'étiquette qu'on voulait supprimer.
- Le bloc s'adresse à l'élève au **« vous »**, jamais au « on » impersonnel.
- Les libellés **au milieu** d'un contenu (`\par\textbf{Piège :} ne pas oublier…`) restent acceptés : dans le fil du raisonnement, ils se lisent bien.
- **Longueur** : 200 caractères, deux phrases — l'erreur, puis le réflexe qui l'évite. Au-delà, c'est un `remark` qui a pris le badge « Attention ».
- **L'ouverture elle-même reste sous 70 caractères.** Plus longue, elle annonce un paragraphe que l'élève ne lira pas.
- **L'impératif est une ouverture valide** : « Ne concluez pas trop vite à la continuité en $x_0$ : … », « Ne confondez pas $f^{-1}$ avec l'inverse $\dfrac1f$ : … ». C'est la même adresse à l'élève, en plus court.

Correct :

```json
{
  "type": "warning",
  "content": "Une erreur très fréquente, que vous ne devez pas commettre : pour une suite récurrente $u_{n+1}=f(u_n)$, la monotonie de $f$ ne donne pas directement celle de $(u_n)$. Le premier terme et la comparaison entre $u_1$ et $u_0$ interviennent."
}
```

Interdit :

```json
{
  "type": "warning",
  "content": "\\textbf{Erreur fréquente :} pour une suite récurrente $u_{n+1}=f(u_n)$, la monotonie de $f$ ne donne pas directement celle de $(u_n)$."
}
```

Deux réécritures réelles : même information, 27 % de texte en moins.

| Avant | Après |
|:------|:------|
| « La condition $f(a)f(b)<0$ garantit l'existence d'au moins une solution. Elle ne garantit pas l'unicité. Pour conclure à l'unicité, on ajoute généralement la stricte monotonie. » (176 car.) | « Un piège classique dans lequel vous ne devez pas tomber : $f(a)f(b)<0$ garantit l'existence, jamais l'unicité. Ajoutez la stricte monotonie pour conclure. » (154 car.) |
| « La fonction réciproque $f^{-1}$ ne désigne pas l'inverse $\dfrac1f$. La notation $f^{-1}$ correspond à la fonction qui échange image et antécédent. » (172 car.) | « Ne confondez pas $f^{-1}$ avec l'inverse $\dfrac1f$ : la réciproque échange l'image et l'antécédent. » (100 car.) |

Ce qui disparaît : les reprises (« la condition », « la notation »), le verbe d'attente « il faut », et le « on » impersonnel.

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

- **L'ordre du tableau fait foi** : la fiche d'index 0 est la leçon principale, elle conserve la progression déjà enregistrée par les élèves. **Ne jamais réordonner** `revisions` d'un chapitre existant.
- Chaque fiche doit contenir sa propre progression : les blancs des fiches **suivantes** sont isolés automatiquement. La fiche principale garde les identifiants historiques.
- Le `title` alimente l'infobulle de l'étape ; le libellé affiché reste « Leçon n ».
- Placer une fiche secondaire **dans le dossier `revisions/` du chapitre déclaré** (pas dans un dossier voisin), sinon l'outil `npm run validate:content` la signale comme inatteignable.
- **Un seul** `quiz` est ouvert par chapitre (le premier déclaré) : déclarer plusieurs quiz n'a pas d'effet.

### Règles de rédaction de l'intro

- **3 à 4 phrases** maximum au total
- Zone gauche : 2 à 3 phrases (objectif + difficulté)
- Zone droite : 1 à 2 phrases (savant + héritage moderne)
- Pas de formules longues ni de tableaux
- Une formule emblématique au maximum (`$e^{i\pi}+1=0$`, `$(e^x)'=e^x$`...)
- Le savant doit être **directement lié** au chapitre (inventeur ou formalisateur)
- Portrait : tableau ou gravure ancienne de Wikimedia Commons, `width: "14%"` à `"16.5%"`
- Caption format : `"Prénom Nom (naissance–décès)"` — ex : `"Leonhard Euler (1707–1783)"`

### Trouver le bon portrait

1. Aller sur `https://fr.wikipedia.org/wiki/[Nom_du_savant]`
2. Cliquer sur le portrait principal
3. Sur Wikimedia Commons, copier le lien direct du fichier original
4. Format recommandé : `https://upload.wikimedia.org/wikipedia/commons/[chemin]/[fichier.jpg]`

---

## 4. Public Cible et Style de Rédaction

### Principe fondamental

Écrire comme un **auteur de manuel scolaire marocain** : précis, direct, accessible. Pas comme un professeur qui parle à des enfants. Pas comme un article scientifique.

### Règles linguistiques

#### Le choix pédagogique central : « Cela permet de »

**Une liste à puces modernes et discrètes, introduite systématiquement par « Cela permet de : », traduit la connaissance en actes.** Pour chaque connaissance centrale d'une nouvelle fiche, placer un bloc `cela_permet_de` immédiatement après la définition, le théorème ou la propriété concernée. Il répond à la question de l'élève : « Concrètement, à quoi cela sert-il ? »

L'enchaînement de référence devient : **énoncer la connaissance, puis expliquer à quoi elle sert**. La fiche présente chaque résultat comme un outil associé à une famille de situations : reconnaître une configuration, déterminer une valeur, résoudre une équation, justifier une conclusion. Elle aide ainsi à construire une cartographie mentale du programme et à choisir le bon outil.

- **Des verbes à l'infinitif.** Commencer chaque entrée par une majuscule et un verbe d'action à l'infinitif : Reconnaître, Calculer, Déterminer, Résoudre, Justifier, Démontrer, Comparer. Préférer « calculer la valeur moyenne d'une fonction » à « propriété de la moyenne » ou « savoir le cours ».
- **Des usages fidèles au cours.** Dégager les compétences réellement permises par le résultat, ses hypothèses et les situations du document source. La reformulation est autorisée ; l'invention d'un résultat, d'une capacité hors programme ou d'une attribution officielle ne l'est pas.
- **Aucune démonstration ni aucun exemple chiffré dans cette liste.** Elle indique quand mobiliser l'outil, sans développer le calcul. L'entraînement technique reste dans les blocs `application` séparés ; les éventuelles preuves restent soumises aux règles du bloc `proof`.
- **Des puces comme repères de compétences.** De petits points bleus unis, sans ombre, halo ni effet, rythment la lecture. Chaque entrée invite à se demander « Est-ce que je sais le faire ? », sans affirmer que la compétence est déjà acquise.
- **Une répétition volontaire.** Conserver exactement « Cela permet de : » sur chaque bloc, dans toutes les sections. Cette régularité apprend à l'élève à rechercher l'utilité de chaque nouveau résultat.

Cette rubrique complète les énoncés : elle ne remplace ni leurs hypothèses ni leurs conclusions. Les fiches existantes ne sont pas réécrites automatiquement lors de l'ajout du nouveau type.

#### Formulation des phrases

| À faire | À éviter |
|:--------|:---------|
| Phrases courtes (max 15–20 mots) | Phrases à trois virgules |
| Mots du quotidien | Jargon pédagogique ou littéraire |
| « On divise », « Cela donne » | « Il convient de procéder à la division » |
| « Si le reste est 0 » | « Dans l'éventualité où le reste s'avère nul » |
| Connecteurs simples : *puisque, donc, ainsi, d'où* | `$\Rightarrow$` pour dire *donc* en texte |
| `\textbf{mot clé}` sur les termes importants | Texte plat sans repères visuels |

#### Le lecteur réel : un élève marocain de 2BAC

Le texte est en français, mais **le français n'est pas la langue maternelle de l'élève**. Sa langue de travail est l'arabe, et il découvre le vocabulaire mathématique français en même temps que la notion. Trois conséquences directes sur la rédaction :

1. **Une idée par phrase.** Si une phrase contient deux idées liées par « dont », « lequel » ou « ce qui », la couper en deux.
2. **Toujours le même mot pour la même chose.** Ne pas alterner « racine » et « solution », ni « courbe » et « tracé », ni « extremum » et « maximum ». Un élève qui cherche un mot qu'il vient d'apprendre perd le fil.
3. **Aucune tournure littéraire.** Pas d'inversion, pas de subjonctif recherché, pas de « il s'ensuit que ». Le style visé est celui du manuel officiel, pas celui d'un article.

#### Mots simples — le dictionnaire de traduction

| Ne pas écrire | Écrire |
|:--------------|:-------|
| Il convient de procéder à l'étude de la fonction | On étudie la fonction |
| Le caractère strictement monotone de $f$ | Le fait que $f$ soit strictement monotone, ou : $f$ est strictement croissante |
| En vertu de la continuité de $f$ | Comme $f$ est continue |
| Ceci étant, considérons | Maintenant, on regarde |
| Ledit intervalle | Cet intervalle |
| Il s'ensuit que | Donc |
| Nonobstant le fait que | Même si |
| Afin d'être en mesure de déterminer | Pour trouver |
| Effectuer le calcul de la dérivée | Calculer la dérivée |
| La susmentionnée propriété | Cette propriété |
| On est amené à s'interroger sur | On se demande si |
| Le présent exercice a pour objet de | Cet exercice montre comment |

> **Test simple.** Si un élève doit relire la phrase pour la comprendre — et non parce qu'il n'a pas compris les maths — la phrase est à réécrire.

#### Les cinq tics à bannir

| Tic | Pourquoi | À la place |
|:----|:---------|:-----------|
| « Nous allons maintenant voir que... » | Annonce creuse, l'élève saute la phrase | Aller directement au fait |
| « Il est important de noter que » | N'apporte rien | Écrire le fait directement |
| « Comme on peut le voir » | Renvoie à une figure sans dire quoi voir | Dire ce qu'il faut voir |
| « En effet » trois fois dans le même bloc | Tic de rédaction | Varier : *car*, *puisque*, ou rien |
| « Bref », « en gros », « du coup » | Trop familier pour un manuel | Rien du tout |

#### Budget de longueur — un plafond par type de bloc

Un bloc trop long n'est pas lu : l'élève voit un pavé et passe au suivant. Chaque type a donc un plafond, mesuré sur le `content` (les commandes comptent, elles aussi) :

| Type | Budget | Ce qui tient dedans |
|:-----|-------:|:--------------------|
| `warning` | 200 car. | l'erreur, puis le réflexe qui l'évite : deux phrases |
| `remark`, `note`, `intuition` | 250 car. | une nuance, une image |
| `text` | 350 car. | le lien entre deux blocs |
| `definition`, `theorem`, `property`… | 600 car. | l'énoncé et ses formules |
| `method`, `technique` | 500 car. | les étapes, jamais de contexte |
| `exploration` | 700 car. | le guidage de l'activité |
| `application`, `proof` | 900 car. | énoncé et correction réunis |

> **Le réflexe du plafond.** Un bloc qui dépasse est presque toujours **deux blocs** : la nuance à détacher, l'étape à poser avant, l'exemple à mettre à part. On coupe avant d'élaguer.

Le contrôle est mécanique : `node tmp/audit-revision.mjs <fiche.json>` affiche la longueur moyenne par type, le budget et chaque dépassement.

#### Le laïus recopié — la faute de rédaction la plus coûteuse

Une phrase **identique** d'un bloc à l'autre n'est plus lue : l'élève la saute, et elle occupe la place de ce qui l'aurait aidé. C'est ainsi qu'une fiche se remplit de remplissage poli — et qu'une amorce fausse survit, puisqu'elle est copiée sans être relue.

Le cas réel à ne pas reproduire : **17 exercices** ouverts par exactement la même phrase, et fausse dans la majorité d'entre eux (elle parle de « la forme de la limite » dans des exercices sur le TVI, la continuité ou les racines $n$-ièmes).

```json
"content": "\\qst{...}\\par\\smallskip \\textbf{Idée :} avant de calculer, on identifie la forme de la limite et le résultat du cours qui permet de la simplifier.\\par On pose $F(x)=\\cos x-x$."
```

Règles :

- Une amorce d'aide (`\textbf{Idée :}`) est **propre à l'exercice** : « multiplier numérateur et dénominateur par la quantité conjuguée », « poser $F(x)=\cos x-x$ pour se ramener au théorème des valeurs intermédiaires ».
- Si l'amorce n'apprend rien que la correction ne dit déjà, **on la supprime** : la correction se suffit à elle-même.
- Deux blocs ne partagent jamais une phrase de plus de dix mots — ni dans une fiche, ni d'une fiche à l'autre du même chapitre.

### Sauts de ligne — Avec sagesse

Utiliser `\par\smallskip` **uniquement** quand deux idées distinctes étaient collées. Ne pas fragmenter un raisonnement fluide. Le critère : est-ce qu'un élève lirait naturellement en marquant une pause ici ?

### Mots-clés en gras

Dans `method`, `warning`, `remark` : mettre en gras avec `\textbf{...}` les mots que l'élève doit retenir — le nom de la technique, la condition clé, l'erreur à éviter.

### Reformulation pédagogique — Règle fondamentale

> **Ne jamais transcrire tel quel.** Le robot reformule systématiquement le texte source pour le rendre meilleur, plus intelligent et hautement pédagogique. Le contenu doit rester fidèle au fond, mais la forme doit être celle d'un excellent manuel scolaire.

Cela signifie concrètement :
- Phrases raccourcies et clarifiées
- Vocabulaire simplifié sans sacrifier la rigueur
- Enchaînements logiques rendus explicites (*puisque*, *d'où*, *ce qui signifie que*)
- Mots-clés en gras pour guider l'œil
- Ordre de lecture optimisé : toujours du simple vers le complexe, du connu vers l'inconnu

### Titres des blocs — Toujours sous forme de question

> **Chaque titre de `definition`, `theorem`, `property`, `method`, `technique`, `lemma`, `corollary`, `consequence` DOIT être une question claire, concise et intelligente** — directement liée au contenu du bloc.

L'élève doit pouvoir lire le titre et comprendre immédiatement ce qu'il va apprendre. Le titre-question crée un **besoin de savoir** avant la réponse.

#### Variété obligatoire des formulations

Ne pas répéter la même structure de question. Alterner entre ces familles :

| Famille | Exemples | Usage typique |
|:--------|:---------|:--------------|
| **Qu'est-ce que...** | *Qu'est-ce que la forme algébrique $z = a + ib$ ?* | `definition` — nommer un concept |
| **Comment...** | *Comment passer de la forme algébrique à l'exponentielle ?* | `method` — expliquer une procédure |
| **Pourquoi...** | *Pourquoi $|z_1 z_2| = |z_1| \cdot |z_2|$ ?* | `theorem` — justifier un résultat |
| **Que vaut...** | *Que vaut $e^{i\pi}$ ?* | `property` — donner une formule |
| **Quand...** | *Quand deux complexes sont-ils conjugués ?* | `property` — condition |
| **Voyons ... / Découvrons ...** | *Voyons comment le module simplifie les calculs* | `text` — transition douce |
| **Quel lien entre...** | *Quel lien entre module et distance ?* | `property` — relier deux concepts |
| **À quoi sert...** | *À quoi sert la forme exponentielle ?* | `text`, `remark` — motivation |
| **Que se passe-t-il si...** | *Que se passe-t-il si $\Delta < 0$ ?* | `theorem` — cas conditionnel |
| **Comment reconnaître...** | *Comment reconnaître une rotation dans l'écriture $z' = az + b$ ?* | `method` — identification |
| **Quelle est...** | *Quelle est la formule de Moivre ?* | `theorem` — énoncer un résultat |
| **Peut-on...** | *Peut-on toujours factoriser un polynôme du second degré ?* | `theorem` — existence |
| **Sous quelle forme...** | *Sous quelle forme écrire $z$ pour faciliter une multiplication ?* | `method` — choix de stratégie |

#### Registre du Baccalauréat marocain — Obligations

> **Le registre de langue doit correspondre à celui des épreuves officielles du BAC marocain.**

L'analyse des sujets (sessions 2021–2024, NS 22F / RS 22F) révèle un style **très codifié et stable** :

| Verbe / expression BAC | Usage dans les fiches |
|:------------------------|:----------------------|
| **Montrer que** | `\qst{Montrons que ...}` — preuve guidée |
| **Vérifier que** | `\qst{Vérifions que ...}` — contrôle d'un résultat |
| **En déduire que** | `\qst{En déduisons que ...}` ou enchaînement dans le texte |
| **Déterminer** | `\qst{Déterminons ...}` — trouver un objet, une équation |
| **Calculer** | `\qst{Calculons ...}` — calcul numérique ou algébrique |

**Règles de style BAC** :
- Les questions sont **directives et progressives** : chaque sous-partie est une brique pour la suivante.
- On justifie **chaque étape intermédiaire** — pas de résultat brut.
- Les connecteurs « On identifie... », « On calcule... », « On en déduit... », « D'où... » structurent la rédaction.
- **Interdit** : « C'est quoi » (trop familier), « Trouvons » (préférer « Déterminons »), « On a juste à » (trop informel).
- Le registre est **celui d'un manuel scolaire**, pas d'une conversation orale.

#### La commande `\mathqst{}` — Mettre en valeur la phrase clé du titre

Dans les titres des blocs `definition`, `property`, `theorem`, `method`, `consequence`, `corollary`, utiliser `\mathqst{phrase clé}` pour encadrer **le cœur de la question**. La commande affiche le texte en **extra-gras** avec la couleur du type de bloc (orange par défaut, adaptée automatiquement).

| Exemple | Rendu |
|---------|-------|
| `"Quand dit-on que \mathqst{$a$ divise $b$}"` | Quand dit-on que ***$a$ divise $b$*** |
| `"Comment \mathqst{exprimer le conjugué d'un nombre complexe}"` | Comment ***exprimer le conjugué d'un nombre complexe*** |
| `"Que signifie \mathqst{$\displaystyle\lim_{n \to +\infty} u_n = \ell$}"` | Que signifie ***$\lim u_n = \ell$*** |

**Règles :**
- Exactement **une** commande `\mathqst{}` par titre
- Elle entoure la **partie essentielle** de la question, pas le mot interrogatif
- Elle peut contenir des formules `$...$` à l'intérieur
- **Interdite** dans le champ `content` et dans les blocs `intro`

#### Règles de qualité des titres

1. **Concis** : 6 à 15 mots maximum
2. **Ciblé** : une seule notion par question
3. **Spécifique** : mentionner le concept ou la formule concernée — pas de titres vagues comme *Comment faire ?*
4. **Varié** : ne pas utiliser deux titres de suite qui commencent par le même mot interrogatif
5. **En relation avec le contenu** : le titre pose la question, le bloc y répond
6. **Une `\mathqst{}`** par titre — entourant la phrase clé de la question

#### Exemples concrets de transformation

| ❌ Titre plat | ✅ Titre-question |
|:---|:---|
| *Forme algébrique* | *Qu'est-ce que la forme algébrique $z = a + ib$ ?* |
| *Module d'un nombre complexe* | *Comment calculer la distance à l'origine avec le module ?* |
| *Propriétés du module* | *Pourquoi le module du produit est-il le produit des modules ?* |
| *Forme trigonométrique* | *Sous quelle forme écrire $z$ pour voir son angle et sa distance ?* |
| *Formule de Moivre* | *Que donne $(\cos\theta + i\sin\theta)^n$ ?* |
| *Équation du second degré dans $\mathbb{C}$* | *Peut-on toujours résoudre $az^2 + bz + c = 0$ dans $\mathbb{C}$ ?* |
| *Rotation dans le plan complexe* | *Comment reconnaître une rotation dans l'écriture $z' = az + b$ ?* |
| *Cocyclicité* | *Quand quatre points sont-ils sur un même cercle ?* |

---

## 5. Types de Blocs — Référence Complète

---

### `text` — Ouvrir et relier (OBLIGATOIRE en 1er bloc de chaque section)

Deux temps en 1 à 2 phrases :
1. **Rappel** — ce qu'on vient de voir (ancrage avec le contenu précédent)
2. **Annonce** — ce que cette section va apporter

```json
{
  "type": "text",
  "content": "On sait maintenant calculer une intégrale par la formule $F(b) - F(a)$. Certaines intégrales d'un produit de deux fonctions nécessitent une technique spéciale : l'intégration par parties."
}
```

Règles :
- si le document continet des 'activité' alors il faut les assimiler et les rediger intelligment comme intro du paragpahe en relatoin, mais contenue cblé et concnise
- 2–3 phrases maximum
- **Aucune formule mathématique**
- **Aucun `\blank{}`**
- Si une section ouvre avec un repère géométrique, le poser ici : `Le plan est muni d'un repère orthonormal $\left(O\,;\vec{u}\,;\vec{v}\right)$.`

---

### `definition` — Introduire un concept nouveau

```json
{
  "type": "definition",
  "title": "Qu'est-ce que ln(x) veut dire ?",
  "content": "Le \\textbf{logarithme népérien}, noté $\\ln$, est la fonction réciproque de l'exponentielle $e^x$.\\par\\smallskip Pour tout $x > 0$, $\\ln(x)$ est l'unique réel $y$ tel que $e^y = x$."
}
```

Règles :
- Nom du concept en **gras** à sa première apparition
- Énoncer la caractérisation précise : conditions, notation, signification
- Ne pas mélanger définition et propriétés dans le même bloc
- **Aucun `\blank{}`**
- Bloc **revealable** (masqué par défaut, l'élève clique pour révéler)

---

### `theorem` — Résultat majeur avec hypothèses et conclusion

```json
{
  "type": "theorem",
  "title": "Pourquoi la dérivée de ln(x) donne 1/x ?",
  "content": "Pour tout $x > 0$, la fonction $\\ln$ est dérivable et :\\par\\smallskip$$\\boxed{(\\ln x)' = \\frac{1}{x}}$$"
}
```

Règles :
- Hypothèses explicites avant la conclusion
- Formule centrale dans `$$\boxed{...}$$`
- Pas de démonstration ici — bloc `proof` séparé si besoin
- **Aucun `\blank{}`**
- Bloc **revealable**

---

### `property` — Règles et formules directement utilisables

```json
{
  "type": "property",
  "title": "Comment ln transforme une multiplication en addition ?",
  "content": "Pour $a > 0$ et $b > 0$ :\\begin{itemize}\\item $\\ln(ab) = \\ln a + \\ln b$\\item $\\ln\\left(\\dfrac{a}{b}\\right) = \\ln a - \\ln b$\\item $\\ln(a^n) = n\\ln a$ \\quad ($n \\in \\mathbb{Z}$)\\end{itemize}"
}
```

Règles :
- Regrouper les formules de même nature dans un seul bloc
- Résultat principal dans `$$\boxed{...}$$`
- **Aucun `\blank{}`**
- Bloc **revealable**

---

### `cela_permet_de` : traduire une connaissance en actes

Bloc toujours visible, introduit **automatiquement et exclusivement** par « Cela permet de : ». Il prend la forme d'un encadré discret à fond gris bleuté très clair, avec une petite puce ronde bleue unie, sans ombre ni effet et une compétence par ligne. Le texte pédagogique conserve sa direction LTR, y compris lorsque l'interface est en arabe.

```json
{
  "type": "cela_permet_de",
  "content": [
    "Reconnaître une discontinuité par saut ;",
    "Comprendre qu'une fonction peut être définie partout sans être continue partout ;",
    "Disposer d'un contre-exemple classique en continuité."
  ]
}
```

Cet exemple reprend le modèle visuel fourni. Il accompagne une connaissance ou une figure qui établit effectivement ces usages ; il ne doit pas être copié sous un résultat sans rapport.

**Contrat de rédaction et de données :**

- Type JSON canonique : `"cela_permet_de"`.
- `content` est un tableau de chaînes : **une chaîne par compétence**, commençant par une majuscule ; généralement 2 à 4 entrées courtes et distinctes.
- Ne pas fournir de `title` : le titre fixe est généré par le composant. Ne pas le répéter dans `content`.
- Ne saisir ni coche, ni puce, ni numéro, ni environnement `itemize` ou `enumerate` : le composant crée la liste et ses puces.
- Les formules inline `$...$` et les macros de texte habituelles restent disponibles à l'intérieur d'une compétence. Éviter les formules longues, les listes imbriquées et les paragraphes multiples.
- Aucun `\blank{}`, aucune correction, aucune preuve et aucun calcul chiffré développé. Le verbe « démontrer » peut nommer une compétence, sans en rédiger la preuve.
- Pas de badge numéroté, de difficulté, de bouton Afficher ou de champ de maîtrise. Le bloc se lit immédiatement après la connaissance associée.
- Dans Prof Studio, choisir **Cours > Cela permet de**, puis ajouter ou modifier les compétences une par une.

Pour la compatibilité de lecture, une chaîne unique dans `content` s'affiche comme une seule compétence. Toutes les nouvelles fiches doivent utiliser le tableau ci-dessus pour distinguer correctement les entrées.

---

### `proof` — Démonstration

#### Quelles preuves rédiger ? Les classiques du lycée, rien d'autre

Une fiche de révision n'est pas un traité. Le robot ne rédige que les démonstrations **classiques et typiques du programme du lycée**, celles que l'élève doit savoir refaire ou reconnaître le jour de l'examen.

| Critère de sélection | Rédiger ? |
|:---------------------|:----------|
| Preuve explicitement faite en classe et exigible au BAC (Bézout, Gauss, division euclidienne, croissance comparée, unicité de la limite…) | ✅ Oui |
| Preuve courte qui éclaire la formule et sert de modèle de rédaction | ✅ Oui |
| Preuve dont la technique se réinvestit dans les exercices du chapitre | ✅ Oui |
| Démonstration hors programme ou universitaire (construction de $\mathbb{R}$, théorème admis au lycée…) | ❌ Non |
| Preuve longue, calculatoire, sans idée réutilisable | ❌ Non |
| Résultat que le manuel lui-même **admet** | ❌ Non — le signaler comme admis dans le bloc `theorem`, sans bloc `proof` |

Règles :

- **Ne jamais inventer une preuve absente du document source.** Si le résultat y est admis, il reste admis dans la fiche.
- Une preuve non exigible n'apporte rien : mieux vaut **aucun** bloc `proof` qu'un bloc hors programme.
- En cas de doute sur l'exigibilité, ne pas trancher seul : appliquer la procédure de confirmation ci-dessous.

#### Confirmation obligatoire avant écriture dans le JSON

> **Règle absolue.** Le contenu de chaque bloc `proof` doit être **soumis à l'utilisateur et validé par lui** avant d'être écrit dans le fichier JSON. Aucune preuve n'entre dans une fiche sans accord explicite.

Procédure :

1. **Lister** les preuves envisagées : pour chaque énoncé démontrable, une ligne « théorème concerné + idée de la démonstration en une phrase ».
2. **Proposer** le texte rédigé de chaque preuve, en clair, hors JSON.
3. **Attendre** la validation de l'utilisateur. Une preuve écartée ne laisse aucun bloc derrière elle.
4. **Écrire** dans le JSON uniquement les preuves confirmées, dans la forme validée.

Ce que la confirmation vérifie : l'exigibilité au programme, l'exactitude mathématique, le niveau de détail attendu, et la cohérence avec les notations déjà posées dans la fiche.

```json
{
  "type": "proof",
  "content": "On démontre les deux implications.\\par\\smallskip\\begin{enumerate}\\item \\textbf{Sens direct.} Si $\\operatorname{PGCD}(a,b)=1$, l'identité de Bézout assure l'existence de $u,v\\in\\mathbb{Z}$ tels que $au+bv=1$.\\item \\textbf{Réciproque.} Supposons qu'il existe $u,v\\in\\mathbb{Z}$ tels que $au+bv=1$. Tout diviseur commun positif de $a$ et $b$ divise alors $au+bv$, donc il divise $1$.\\end{enumerate}\\par\\smallskip On obtient bien :$$\\boxed{\\operatorname{PGCD}(a,b)=1\\iff\\exists(u,v)\\in\\mathbb{Z}^{2},\\ au+bv=1}$$"
}
```

Règles :
- Pas de `title` : le badge `Preuve` suffit, l'énoncé démontré est dans le bloc précédent
- Ouvrir par une phrase qui annonce la stratégie (« On démontre les deux implications. », « Nous comparons les diviseurs communs. »)
- Structurer avec `\begin{enumerate}` en suivant le tableau « Choisir le bon outil » de la section Listes
- Fermer sur le résultat dans `$$\boxed{...}$$`
- **Aucun `\blank{}`**

#### Le carré de fin de preuve est automatique

Le carré (*tombstone*) qui clôt la démonstration est **injecté par le CSS** (`.proof-content::after` dans `src/styles/revision/revision-blocks.css`). Il se pose contre la **marge droite**, comme dans les livres : en fin de dernière ligne s'il reste de la place, sinon seul sur une ligne en bas à droite.

Conséquence pour la rédaction : **ne jamais écrire de marqueur de fin à la main**. Sont donc interdits en fin de bloc `proof` :

| Interdit | Pourquoi |
|:---------|:---------|
| `CQFD`, `C.Q.F.D.`, `Ce qu'il fallait démontrer` | Redondant avec le carré, et lourd à lire |
| `\carre`, `$\square$`, `∎`, `\blacksquare` | Produit un **deuxième** carré, mal aligné cette fois |
| `\par` ou `\smallskip` final | Crée une ligne vide entre le texte et le carré |

---

### `application` - Exercice d'application actif

> Type JSON canonique : `"type": "application"`.
> Ajouter `"difficulty": 1..5` ; 1 = simple, 5 = exigeant. Les étoiles de difficulté s'affichent automatiquement à droite du cadre.
> L'ancien type `"example"` est seulement un alias de compatibilité. Ne plus l'utiliser dans les nouvelles fiches.

Pour plusieurs questions, poser l'énoncé dans `\qst{...}` puis numéroter avec `\begin{enumerate}`, `\item`, `\end{enumerate}`. Pour une question directe, `\qst{...}` suffit. `\question{...}` reste accepté comme alias long.

La commande `\qst{...}` accepte un contenu riche : contexte, plusieurs phrases, formules inline, petits paragraphes et liste `enumerate`. Après `\qst{...}`, écrire une seule correction. En mode étendu, l'interface sépare automatiquement l'énoncé et la correction par une ligne pointillée grise avec le badge `Correction`. Si l'énoncé contient plusieurs questions, la correction répond avec `\begin{enumerate}` et `\item`, jamais avec plusieurs blocs de correction séparés.


> C'est **le seul type de bloc qui contient des `\blank{}`** — avec l'unique exception des tableaux à compléter d'une activité (§ 8).

#### Structure en trois temps

1. **Exposer** — ouvrir avec `\qst{...}` : injonction directe, ou énoncé commun + sous-questions
2. **Corriger** — calculs avec connecteurs naturels (*puisque, d'où, on en déduit*)
3. **Conclure** — résultat final encadré avec `\boxed{}`

#### Règles de rédaction

- Toujours commencer par `\qst{...}` ou `\question{...}`.
- Pour plusieurs questions, mettre les questions dans `\qst{...}` avec `\begin{enumerate}`.
- Dans la correction, répondre avec un seul `\begin{enumerate}` dans le même ordre.
- Ne jamais créer de nouveau bloc `"type": "example"` ; utiliser `"type": "application"`.
- Ajouter `"difficulty": 1..5` dans chaque application.
- Garder les `\blank{}` **dans les `application`** — la phrase et le tableau. Une activité (`exploration`) n'en porte que dans un **tableau à compléter** : sa phrase de découverte reste sans trous (§ 5 bis, § 8).
- **Blancs d'un exercice d'application** : 3 à 5 (optimum), **6 au maximum**. Placés sur les étapes clés — factorisation, valeur décisive, résultat final — jamais sur du texte de liaison ni avant le contexte. Les étiquettes de mots s'écrivent `\blank{\text{croissante}}` pour un rendu droit et non en italique mathématique.
- **Syntaxe du trou, selon l'endroit où il est écrit** :

| Le trou est écrit… | Argument attendu | Correct | Interdit |
|:-------------------|:-----------------|:--------|:---------|
| dans le texte (hors `$...$`) | texte libre, maths autorisées avec leurs `$` | `\blank{continue sur $\mathbb{R}$}` | un trou vide `\blank{}` |
| dans une formule (`$...$`) | **uniquement des maths**, sans `$` | `$\blank{\mathbb{R}}$`, `$\blank{\sqrt9}$`, `$\blank{x+1}$` | `$\blank{continue sur $\mathbb{R}$}$` |

  Un `$` à l'intérieur d'un trou écrit dans une formule casse la formule : elle s'affiche **en rouge** au milieu du bloc.
- Si les questions sont **courtes, indépendantes et au nombre de 2 à 4**, encadrer la liste par `\begin{columns}...\end{columns}` — voir « Colonnes — énoncés à plusieurs questions ». Jamais pour la correction.

---

### Rédiger la correction pour un élève marocain

C'est la partie la plus lue de la fiche : l'élève y revient seul, sans professeur. Elle doit se lire **ligne par ligne**, comme un corrigé de manuel.

#### Les sept règles

| # | Règle | Pourquoi |
|:-:|:------|:---------|
| 1 | **Une idée par ligne.** Un calcul, ou une phrase, jamais les deux enchaînés. | L'élève lit avec un stylo à la main : il doit pouvoir s'arrêter à chaque ligne |
| 2 | **Aérer** : `\par\smallskip` entre deux étapes distinctes, `\par` pour un simple retour à la ligne. | Un pavé de cinq lignes n'est pas lu |
| 3 | **Nommer l'étape** quand elle n'est pas évidente : `\textbf{Calcul de la dérivée :}`. | L'élève doit savoir *pourquoi* on fait ce calcul maintenant |
| 4 | **Ouvrir chaque ligne par un connecteur** : *Or*, *Donc*, *D'où*, *Comme*, *Or $f$ est continue,* | C'est le connecteur qui porte le raisonnement |
| 5 | **Ne rien sauter.** Toute étape intermédiaire est écrite, même « évidente ». | L'élève ne peut pas deviner ce qui n'est pas écrit |
| 6 | **Résultat final encadré** : `$$\boxed{...}$$`, seul sur sa ligne. | Il doit se retrouver en un coup d'œil |
| 7 | **Aucun commentaire méta** : pas de « comme prévu », « c'est facile », « évidemment ». | Condescendant, et sans valeur mathématique |

> **Interdits rappelés** : `Étape 1 :`, `Étape 2 :` (règle absolue 8), le tiret long `—`
> (règle 4), `$\Rightarrow$` pour dire *donc* dans une phrase, `\checkmark` (règle 7),
> et le carré de fin de preuve — il est automatique (§ `proof`).

#### Où placer les sauts de ligne

| Situation dans la correction | Écriture |
|:-----------------------------|:---------|
| Deux calculs successifs, même raisonnement | `\par` |
| Changement d'étape (calcul → étude du signe → conclusion) | `\par\smallskip` |
| Introduction de la liste des questions | `\par\smallskip` avant `\begin{enumerate}` |
| Fin de la correction | rien : le `\boxed{}` final se pose seul sur sa ligne |

Le critère est toujours le même : **est-ce qu'un élève marquerait une pause ici en recopiant ?** Si oui, `\par\smallskip`. Si non, on ne coupe pas.

#### Avant / après

**À éviter** — un pavé d'une seule ligne, tout enchaîné. Même exercice que ci-dessous, énoncé abrégé :

```json
"content": "\\qst{...}\\par\\smallskip\\begin{enumerate}\\item Comme $f$ est continue sur $[0,2]$ et que $f(0)=3>0$ et $f(2)=-1<0$, le théorème des valeurs intermédiaires assure l'existence d'un $c$ dans $]0,2[$ tel que $f(c)=0$, et comme de plus $f$ est strictement décroissante sur $[0,2]$ puisque $f'(x)<0$ sur cet intervalle, ce $c$ est unique.\\end{enumerate}"
```

Trois fautes : deux étapes majeures (existence, unicité) dans la même phrase, aucune ligne d'appui, et le résultat final noyé dans le raisonnement.

**Correct** — une idée par ligne, un connecteur par ligne, résultat encadré :

```json
"content": "\\qst{Soit $f$ la fonction définie sur $[0,2]$ par $f(x)=x^2-4x+3$.\\par\\smallskip Montrer que l'équation $f(x)=0$ admet une unique solution dans $]0,2[$.}\\par\\smallskip\\begin{enumerate}\\item \\textbf{Existence.}\\par $f$ est continue sur $[0,2]$ comme fonction polynôme.\\par Or $f(0)=3>0$ et $f(2)=-1<0$.\\par Donc $0$ est compris entre $f(0)$ et $f(2)$.\\par\\smallskip D'après le théorème des valeurs intermédiaires, il existe $c\\in]0,2[$ tel que $f(c)=0$.\\par\\smallskip\\item \\textbf{Unicité.}\\par On calcule $f'(x)=\\blank{2x-4}$.\\par Or $2x-4<0$ pour tout $x\\in[0,2[$.\\par Donc $f$ est strictement décroissante sur $[0,2]$.\\par\\smallskip Une fonction strictement monotone ne prend pas deux fois la même valeur.\\par La solution $c$ est donc unique.\\par\\smallskip $$\\boxed{\\text{L'équation } f(x)=0 \\text{ admet une seule solution dans } ]0,2[}$$\\end{enumerate}"
```

Ce qui fait la différence, ligne par ligne : « Or » avant les valeurs de $f$, « Donc » avant la conclusion du TVI, une phrase séparée pour la stricte monotonie, et une dernière phrase qui **dit** l'unicité avant de l'encadrer.

#### Le vocabulaire du corrigé du BAC marocain

| Le corrigé doit dire | Et non |
|:---------------------|:-------|
| On calcule $f'(x)$ | Le calcul de la dérivée donne |
| Or $f(0)>0$ | Sachant que $f(0)$ est positif |
| Donc $f$ est croissante | Il en résulte la croissance de $f$ |
| D'où $c$ est unique | Ce qui achève la démonstration de l'unicité |
| On en déduit que | Par conséquent il vient que |

Ces tournures sont celles des corrigés officiels : courtes, toutes faites, reconnaissables. L'élève doit les retrouver le jour de l'examen.

#### Relire la correction comme un élève

Avant de valider, relire chaque correction en se posant **ces quatre questions** :

1. Est-ce que je peux suivre **sans avoir le cours sous les yeux** ?
2. Y a-t-il une ligne que je ne comprendrais pas **pourquoi** elle est là ?
3. Le résultat final se voit-il **sans le chercher** ?
4. Est-ce que je saurais **refaire** cet exercice seul, avec cette correction comme seul modèle ?

Une réponse « non » à l'une des quatre : la correction est à reprendre.

---

## 5 bis. Les types de blocs restants

Cette section complète le § 5. Les types ci-dessous sont **tous implémentés** : ils ont un badge, une couleur et un rendu propres. Les inventer ou en employer d'autres fait tomber le bloc dans le rendu « texte libre », sans badge ni encadré.

### Tableau récapitulatif

| Type | Rôle | Repliable ? | Titre-question ? | Bloc toujours visible ? |
|:-----|:-----|:-----------:|:----------------:|:-----------------------:|
| `text` | Ouvrir, relier | non | non | **oui** |
| `exploration` | Activité d'accroche guidée (trous seulement dans un tableau à compléter) | non | non | **oui** |
| `intuition` | Image mentale, figure, analogie | non | non | **oui** |
| `remark` | Nuance, complément | non | non | **oui** |
| `note` | Remarque neutre | non | non | **oui** |
| `rappel` | Prérequis rappelé | non | non | **oui** |
| `warning` | Erreur fréquente, piège | non | non | **oui** |
| `cela_permet_de` | Compétences d'usage | non | non | **oui** |
| `definition` | Concept nouveau | **oui** | **oui** | non |
| `theorem` | Résultat majeur | **oui** | **oui** | non |
| `proposition` | Résultat secondaire | **oui** | **oui** | non |
| `property` | Règle, formule | **oui** | **oui** | non |
| `lemma` | Résultat intermédiaire | **oui** | non | non |
| `corollary` | Conséquence immédiate | **oui** | non | non |
| `consequence` | Implication notable | **oui** | non | non |
| `method` | Recette pour un type de problème | **oui** | **oui** | non |
| `technique` | Technique de calcul ciblée | **oui** | non | non |
| `proof` | Démonstration | non | non | **oui** |
| `application` | Exercice actif (avec `exploration`, bloc à `\blank{}`) | non | non | **oui** |
| `problem` | Énoncé d'exercice encadré | **oui** | non | non |
| `hint` | Indice repliable | **oui** | non | non |
| `solution` | Solution repliable | **oui** | non | non |

> **Interdits.** `summary` et `strategy` sont supprimés du projet : utiliser
> `method` ou `technique` (§ 1, règle 10). `culture` **n'existe pas** : le
> contexte historique va dans le bloc `text`.

### La conséquence la plus importante : où mettre une figure

Sur un bloc **repliable** (`definition`, `theorem`, `property`, `method`…), tout média est rendu **à l'intérieur du panneau de révélation** : la figure reste cachée jusqu'au clic de l'élève. Pour qu'une figure soit visible d'emblée, la rattacher à un bloc de la colonne « toujours visible » — `text`, `exploration`, `intuition`, `remark`, `warning`, `application`. Voir § 7.

> **Exception `application`** : ce bloc est *toujours visible*, mais sa **correction est repliable**. La position de l'image y décide donc de sa visibilité — voir § 7, « Le cas d'un exercice ».

### `exploration` — l'activité d'accroche

Le document source contient souvent une « activité » ou une « découverte ». C'est le rôle de `exploration` : une situation concrète qui **fait découvrir** le résultat à venir.

```json
{
  "type": "exploration",
  "title": "",
  "content": "On considère la suite définie par $u_{n+1} = \\dfrac{1}{2}u_n + 3$ avec $u_0 = 0$.\\par\\smallskip Calculons les premiers termes : $u_1 = 3$, $u_2 = 4{,}5$, $u_3 = 5{,}25$.\\par\\smallskip Que remarque-t-on ? Les termes semblent se rapprocher de $6$."
}
```

Règles :

- **Aucun `\blank{}`** : on découvre, on ne s'évalue pas. C'est l'exercice *sans trous*.
- **Aucun `title`** — le badge suffit.
- Se place **en premier bloc** d'une section, avant la définition ou le théorème qu'il prépare.
- 2 à 4 phrases, un seul calcul guidé, et **la remarque attendue est écrite** : l'élève ne doit pas rester bloqué.

### `intuition` — l'image mentale

Un bloc court qui **traduit en mots simples** ce que le formalisme dit difficilement. Il ne remplace jamais la définition : il la précède ou la suit.

```json
{
  "type": "intuition",
  "content": "Une limite, c'est la valeur vers laquelle on s'approche sans forcément l'atteindre. Comme un coureur qui se rapproche de la ligne d'arrivée : il en est toujours plus près, sans jamais devoir la franchir."
}
```

- **Aucune formule** ou une seule, très courte.
- 1 à 3 phrases. Si ça devient long, c'est un `text`.
- Aucun `\blank{}`, aucun `title`.

### `method` et `technique` — la recette

| | `method` | `technique` |
|:--|:---------|:------------|
| Portée | Une **famille de problèmes** | Une **expression précise** |
| Exemple | « Comment étudier une suite récurrente $u_{n+1}=f(u_n)$ » | « Comment calculer $\displaystyle\int x\,e^{-x}\,\d x$ » |
| Titre | **Question obligatoire** | Pas de question imposée |
| Formation | Une `\begin{enumerate}` de 3 à 5 étapes | 2 à 4 étapes, ou une phrase |

```json
{
  "type": "method",
  "title": "Comment étudier une suite récurrente $u_{n+1} = f(u_n)$ ?",
  "content": "\\begin{enumerate}\\item Calculer $u_1$ et $u_2$ pour deviner le comportement.\\item Montrer par récurrence que $u_n$ reste dans un intervalle stable.\\item Étudier le signe de $u_{n+1}-u_n$ : il donne le sens de variation.\\item Si la suite converge et si $f$ est continue, la limite $\\ell$ vérifie $f(\\ell)=\\ell$.\\end{enumerate}"
}
```

Règles :

- Les étapes sont **ordonnées** : c'est un `enumerate`, jamais un `itemize`.
- Chaque étape commence par un **verbe à l'infinitif**.
- **Aucun `\blank{}`**, aucun exemple chiffré : la recette reste générale.
- Contenu **toujours aligné à gauche** par l'application — ne pas chercher à centrer.
- **Une étape = une ligne courte** : 22 mots au maximum. Si l'étape a besoin d'une explication, c'est le `text` du dessus qui la porte, pas la recette.
- **Pas de phrase de contexte.** Les hypothèses tiennent en une ligne d'ouverture, les étapes suivent immédiatement. Budget : 500 caractères, 5 étapes.
- **L'ouverture varie** : deux `method` d'une même fiche ne commencent pas par la même formule.

**Avant / après** — le même encadrement par dichotomie, réécrit de 361 à 284 caractères :

| Avant (verbeux) | Après |
|:----------------|:------|
| « Soit $f$ continue et strictement monotone sur $[a,b]$ avec $f(a)f(b)<0$. » | « $f$ continue et strictement monotone sur $[a,b]$, avec $f(a)f(b)<0$. » |
| « Si $f(a)f(m)<0$, la solution appartient à $]a,m[$ : on remplace $b$ par $m$. » | « si $f(a)f(m)<0$, remplacer $b$ par $m$ ; » |
| « À chaque étape, l'amplitude de l'encadrement est divisée par $2$. » | « L'amplitude de l'encadrement est divisée par $2$ à chaque étape. » |

Trois coupes, aucune perte : le « Soit » d'ouverture, le rappel « la solution appartient à… » que le remplacement dit déjà, et l'inversion « résultat *puis* action » ramenée à l'action seule.

### `remark` et `note` — la nuance

`remark` porte un badge « Remarque » coloré ; `note` est neutre. Les deux servent à ajouter une précision **qui ne mérite pas un bloc à part entière**.

- 1 à 3 phrases.
- Dans `remark` uniquement, `\itemsize{...}` permet **deux** idées autonomes, une macro par idée (§ 3).
- Aucun `\blank{}`, aucun `title`.

### `rappel` — le prérequis

Sert à **reposer une formule d'un chapitre précédent** que l'élève doit avoir sous les yeux. Une formule, pas un cours : si le rappel dépasse deux lignes, c'est que la notion est à revoir dans sa fiche d'origine.

### `lemma`, `corollary`, `consequence`, `proposition` — les variantes du théorème

Mêmes règles de rédaction que `theorem` (§ 5) : hypothèses explicites, formule centrale dans `$$\boxed{...}$$`, aucun `\blank{}`, bloc repliable.

| Type | À utiliser quand |
|:-----|:-----------------|
| `proposition` | Le résultat est vrai et utile, mais **secondaire** dans le chapitre |
| `lemma` | Le résultat **ne sert qu'à** démontrer un autre énoncé |
| `corollary` | C'est une **conséquence immédiate** du théorème qui précède |
| `consequence` | C'est une **implication notable**, tournée vers l'usage |

### `problem`, `hint`, `solution` — l'exercice long

Ces trois types forment un ensemble : un énoncé encadré (`problem`), un indice et une solution, **tous repliables**. Ils servent à un exercice long qui ne tient pas dans un `application`.

- Ne pas y mettre de `\blank{}` : les trous interactifs sont réservés à `application` et `exploration`.
- `hint` et `solution` suivent le `problem` concerné.
- Si l'exercice tient en 3 à 5 étapes courtes, un `application` est préférable : il est interactif.

---

## 6. Traiter le document source (PDF, scan, photos)

Le document source est un **cours de manuel**, pas une source de données propre. Il contient des renvois, des encadrés, des numérotations, des figures et parfois des fautes. Le travail du robot consiste à en extraire la **mathématique** et à la remettre en forme — jamais à recopier un extrait.

### Reconnaître le type de source

| Type de source | Ce qu'on peut en tirer | Précautions |
|:---------------|:-----------------------|:------------|
| **PDF texte** (sélectionnable) | Le texte et les formules, par copie ou extraction | Les symboles sont souvent perdus ou déformés (voir ci-dessous) |
| **PDF scanné** (image dans un PDF) | Rien par copie : il faut **lire visuellement** | Lire les formules à l'œil, une par une, et les réécrire en LaTeX |
| **Photos / captures** | Rien par copie non plus | Même règle ; attention aux ombres et aux pages coupées |
| **Word / LaTeX fourni** | Le texte et parfois les formules | Vérifier que les formules sont bien dans `$...$` et non en texte plat |

> **Règle absolue.** Dans tous les cas, **on réécrit**. Aucun paragraphe du PDF n'entre dans le JSON tel quel. Voir « Reformulation pédagogique » (§ 4).

### Les pièges de l'extraction — à reconnaître d'un coup d'œil

Un PDF ne transmet pas des maths, il transmet des glyphes disposés. Voici ce qu'on récupère et ce qu'il faut écrire :

| Ce qu'on lit dans l'extraction | Ce que c'est | À écrire |
|:-------------------------------|:-------------|:---------|
| `âˆ’`, `â‰¤`, `â‰¥`, `Ã—`, `âˆž` | `−`, `≤`, `≥`, `×`, `∞` lus en mauvais encodage | `-`, `\leq`, `\geq`, `\times`, `+\infty` |
| `x2`, `xn+1` | un exposant perdu | `$x^2$`, `$x_{n+1}$` |
| `a/b`, `a b` (barre absente) | une fraction aplatie | `$\dfrac{a}{b}$` |
| `f(x) dx` sans symbole | une intégrale amputée | `$\displaystyle\int_a^b f(x)\,\d x$` |
| `<=`, `>=`, `=>`, `!=` | des opérateurs tapés en clavier | `\leq`, `\geq`, `\Longrightarrow`, `\neq` |
| `lim`, `somme`, `int` en toutes lettres | des symboles perdus | `\displaystyle\lim_{n\to+\infty}`, `\sum`, `\int` |
| `.` isolé en début de ligne | une puce de liste perdue | `\item` dans un `\begin{itemize}` |
| Numéros de page, « Chapitre 3 », en-têtes | du bruit de mise en page | Rien : on ne les recopie pas |
| « Voir exercice 12 p. 45 » | un renvoi interne au manuel | Rien, ou l'exercice lui-même s'il est fourni |

> **Détecter un signe suspect :** tout caractère qui ressemble à `Ã`, `â`, `Â` ou `â€` est un signe d'encodage cassé. Dans le doute, **relire la formule à la source** et la réécrire entièrement en LaTeX plutôt que de la corriger caractère par caractère.

### Ce qu'on ne recopie jamais tel quel

| Élément du PDF | Traitement |
|:---------------|:-----------|
| Numérotation du manuel (« 1) », « a. ») | Remplacée par la structure JSON : sections, blocs, `\item` |
| Encadrés de couleur, icônes, pastilles | Remplacés par le **type de bloc** approprié (`theorem`, `warning`, `method`…) |
| Notes marginales, annotations manuscrites | Ignorées, sauf si elles corrigent une erreur du cours |
| Renvois internes (« cf. § 3 », « voir p. 45 ») | Ignorés : la fiche est autonome |
| Publicités, sommaire, page de garde | Ignorés |
| Table des matières | Ignorée ; c'est la structure des sections qui la remplace |

### Extraire les figures — la décision en trois questions

Une figure du PDF n'est presque jamais réutilisable telle quelle : sa résolution est faible, son fond est blanc opaque, et ses libellés sont dans une police qui n'a rien à voir avec celle de l'application. Le robot décide à partir de trois questions :

| Question | Si oui | Si non |
|:---------|:-------|:-------|
| **La figure porte-t-elle une information qu'aucune phrase ne remplace ?** | On la garde sous forme de figure | On la supprime et on écrit la phrase qui manquait |
| **Est-ce un graphique dans un repère** (courbe, tangente, asymptote) ? | **On la redessine en SVG** — voir § 7 | On peut envisager une image |
| **Est-ce une photographie ou un portrait ?** | On peut réutiliser l'image (Wikimedia Commons pour les portraits) | On la redessine en SVG |

> **Interdit.** Découper une capture d'écran du PDF pour la coller dans `data/`. Une capture apporte un fond blanc, une police d'un autre siècle, et ne se corrige ni ne se traduit plus. Voir § 7.

---

## 7. Les figures d'une fiche

### Quand une figure est nécessaire

Une figure ne se met pas « parce que c'est joli ». Il y a **quatre cas** où elle apporte quelque chose qu'aucune phrase ne dit aussi vite :

| Cas | Exemple | Ce que la figure montre |
|:----|:--------|:------------------------|
| **Lecture graphique** | Asymptote, sens de variation, extremum | Ce que « la courbe se rapproche de la droite » veut dire |
| **Construction** | Tangente et nombre dérivé | Les deux déplacements et leur rapport |
| **Comparaison** | Deux courbes réciproques, deux méthodes | Ce qui est symétrique, ce qui ne l'est pas |
| **Cas d'un théorème** | Trois solutions au lieu d'une (TVI) | Pourquoi le théorème ne dit pas *unicité* |

Pour tout le reste, **une phrase bien écrite vaut mieux qu'un schéma**. Une fiche sans aucune figure est préférable à une fiche décorée.

### Les trois voies

| Voie | Quand | Comment |
|:-----|:------|:--------|
| **SVG fait main / généré** | Toute courbe dans un repère, toute figure mathématique | **`docs/GUIDE_SVG_TIKZ.md`** |
| **Image réutilisée** | Portrait d'un savant, photographie, objet réel | Wikimedia Commons, `width` 14–16 %, `float-right` (bloc `intro`) |
| **Aucune figure** | Le propos se dit en une phrase | C'est le cas le plus fréquent |

> **Le guide de référence est `docs/GUIDE_SVG_TIKZ.md`.** Son § 0 est la liste des consignes à relire avant d'écrire une figure ; il couvre les polices Computer Modern embarquées, la palette du projet, la grille, l'aire de tracé, le placement des étiquettes et les commandes de validation. Ne pas tenter de dessiner une courbe sans l'avoir lu.

### Les quatre règles qui se paient cash

| # | Règle | Ce qui casse sinon |
|:-:|:------|:-------------------|
| 1 | **La prose ne va jamais dans l'image** — elle va dans `media.caption` | Les polices embarquées n'ont **aucun caractère accentué** : « fonction dérivable » dans la figure s'affiche en police système, au milieu du dessin |
| 2 | **La figure se rattache à un bloc toujours visible** (`text`, `warning`, `remark`, `application`) | Sur un bloc repliable (`definition`, `theorem`…), elle reste **cachée** jusqu'au clic de l'élève |
| 3 | **`width` suit la largeur du `viewBox`** : `width % = viewBox × 0,1468`, plafonné à 100 % | Les libellés d'une figure passent 40 % plus gros que ceux de sa voisine |
| 4 | **Le `caption` est interdit en quiz** | Il donne la réponse à la place de l'élève |

### Le cas d'un exercice

Dans un `application`, l'énoncé peut s'appuyer sur une figure : elle se place au niveau du bloc, et l'énoncé renvoie à elle par la phrase, jamais par un numéro (« la courbe ci-dessous », pas « la figure 3 »).

**La position choisit la zone, pas seulement le côté :**

| `media.position` | Où tombe la figure | Visible d'emblée ? |
|:-----------------|:-------------------|:------------------|
| `top`, `left`, `right`, `float-left`, `float-right`, `inline`, `inline-right` | dans l'**énoncé / la question** | oui |
| `bottom` | **en bas de la correction** | non — elle apparaît avec la correction |

La taille s'adapte seule : vignette dans l'énoncé (≈ 30 % en habillage, 28 % en colonne), taille pleine en bas de correction. Une `width` explicite reste prioritaire.

```json
{
  "type": "application",
  "difficulty": 3,
  "content": "\\qst{On considère la courbe ci-dessous.\\par\\smallskip ...}",
  "media": {
    "src": "/data/2eme-bac-sc-math/limites-continuite/revisions/figures/continuite-tvi-existence.svg",
    "alt": "Courbe continue croissant de f(a) à f(b) et coupant la droite y = k au point d'abscisse c.",
    "position": "top",
    "width": "65%",
    "style": { "border": false, "shadow": false, "rounded": true }
  }
}
```

Points de vigilance :

- le champ **`alt`** décrit ce que la figure permet de **lire**, jamais la réponse ;
- la figure ne doit pas **donner le résultat** de la question (c'est la version graphique du `caption` interdit) ;
- `bottom` **cache la figure jusqu'à la correction** : ne l'utiliser que si la figure est un support de correction, jamais si l'énoncé y renvoie (« la courbe ci-dessous ») ;
- une figure trop chargée pour un énoncé est à simplifier, pas à agrandir.

---

## 8. Listes, tableaux, colonnes — la mise en page d'un exercice

> Cette section est le **guichet unique** de la mise en page. Les règles de syntaxe détaillées sont au § 3 (« Listes » et « Colonnes ») ; ici, on décide **quoi** utiliser.

### La question à se poser d'abord

> **Est-ce que cette mise en page aide l'élève à lire, ou est-ce qu'elle m'aide moi à ranger ?**

Une mise en page ne sert jamais à « faire propre ». Elle sert quand elle fait gagner à l'élève **une seconde de lecture** ou quand elle lui **évite un défilement**. Si aucun des deux, on écrit une phrase.

### Le tableau de décision

| Ce que contient l'exercice | Outil | Pourquoi pas autre chose |
|:---------------------------|:------|:-------------------------|
| 2 à 4 questions **courtes et indépendantes** | `\begin{columns}` autour d'un `\begin{enumerate}` | Gain de place réel : l'élève voit tout l'énoncé sans défiler |
| Des questions **qui s'enchaînent** (la 2 utilise la 1) | `\begin{enumerate}` simple, **pas de colonnes** | La lecture en colonnes casse l'enchaînement |
| Un **calcul réparti en étapes** dans la correction | `\begin{enumerate}` sans étiquette | L'ordre porte le sens |
| Deux **sens** d'une équivalence | `\begin{enumerate}` + `\textbf{Sens direct.}` / `\textbf{Réciproque.}` | Le numéro ne dit pas quel sens on démontre |
| Une **liste de cas ou de propriétés** de même nature | `\begin{itemize}` | Aucun ordre n'est signifié |
| Un **tableau de valeurs**, de signes, de variations | `\begin{array}` (§ ci-dessous) | Un tableau s'aligne ; une liste ne le fait pas |
| Un **tableau à compléter** (activité, exercice) | `\begin{array}` + `\blank{}` dans les cellules de résultat | L'élève remplit la table au lieu de la lire — réservé à `exploration` et `application` |
| **Deux méthodes** à comparer, côte à côte | `\begin{columns}\column{...}\column{...}` | La comparaison est justement le propos |
| Une seule question, un seul calcul | **Rien** : une phrase et `\par\smallskip` | Deux lignes de texte ne font pas une liste |

### Les tableaux — `array`

Un tableau n'est **pas** une mise en page : c'est un **objet mathématique** dont les colonnes portent un sens (gauche / droite, avant / après, signe / variation).

```json
"content": "Voici le tableau de signes de $f'(x)$ :\\par\\smallskip$$\\begin{array}{|c|ccccccc|}\\hline x & -\\infty & & -1 & & 1 & & +\\infty \\\\\\hline f'(x) & & - & 0 & + & 0 & - & \\\\\\hline f(x) & & \\searrow & 2 & \\nearrow & -2 & \\searrow & \\\\\\hline\\end{array}$$"
```

Règles :

- **`|` aux extrémités** (`{|c|...|}`) pour le cadre vertical, `\hline` pour les traits horizontaux, et `\def\arraystretch` **jamais** écrit à la main : il est injecté par l'application (§ 3).
- **Une ligne par ligne du tableau**, et `\\` à la fin de chacune — l'oubli du dernier `\\` est la faute la plus fréquente.
- **Une ligne qui commence par `[` s'écrit `\\ {}[…]`** : après `\\`, KaTeX lit un `[` collé comme un **espacement de ligne** (`\\[2pt]`). `\\[0,1] & …` échouerait avec `Invalid size` — le moteur insère une parade automatique au rendu, mais la forme explicite est la règle. Un crochet fermant (`]0,1[`) n'est pas concerné, ni `\\ \hline[0,1]`. Signalé par `npm run validate:content` (règle 14).
- **Un tableau d'activité ou d'exercice d'application cache ses valeurs clés** derrière des trous (`& \blank{0} &`, ou `\boxed{\blank{[0,2]}}` dans une cellule) : l'élève remplit la table au lieu de la lire. Un tableau de **cours** (définition, théorème, propriété, méthode) n'en contient jamais — on ne devine pas un résultat qu'on n'a pas encore découvert (§ 8 « Trous pédagogiques » de `GUIDE_TABLEAUX_VARIATIONS.md`).
- Les **cellules vides** sont normales et voulues : elles réservent la place au-dessus du signe.
- Un tableau se place **en display** (`$$...$$`), seul dans son paragraphe.
- **Un tableau de variations ne se remplace pas par une phrase** : c'est le seul endroit où trois informations (signe, sens, valeurs) se lisent simultanément.

### Réparer un tableau — diagnostic et remèdes

Un tableau cassé ne se plaint pas : il **disparaît** (remplacé par une tache rouge) ou affiche ses commandes en clair au milieu du bloc. Les pannes ci-dessous sont réelles, vérifiées contre KaTeX, et leur cause est exacte.

| Ce que voit l'élève | Cause exacte | Remède |
|:--------------------|:-------------|:-------|
| Tout le tableau, en rouge | `\cline`, `\multicolumn`, `\multirow` : **KaTeX ne les connaît pas** (`Undefined control sequence`) | `\cline{2-2}` → `\hline` (trait complet) ou **deux `array`** (le calcul d'un côté, le quotient de l'autre) ; pour une cellule fusionnée, repenser le tableau : une colonne en moins, ou deux tableaux |
| La commande en clair, puis la fin du bloc perdue | `\hline` **collé** à la commande suivante — KaTeX lit `\hlineP` comme un nom de commande | Une **espace** après `\hline` : `\hline P(X=k)=0` |
| Une cellule seule, en rouge | Accolade orpheline (`x^3 -} x^2`, `\frac{x^2 -} 1}{x-1}`) | Recompter les accolades de la cellule ; laisser `tmp/fix-katex-errors.mjs` la réécrire |
| Une cellule seule, en rouge | `$` écrit **dans** une cellule : un `array` est déjà en mode mathématique (`Can't use function '$'`) | Retirer les `$` : `& a &`, jamais `& $a$ &` |
| Une erreur sur une commande qui existe pourtant | Maths ou gras dans `\text{...}`, qui n'accepte que du texte | Sortir les maths : `\textbf{Si } A \subset B`, et non `\text{\textbf{Si } A \subset B}` |
| Colonnes décalées | Un `&` manquant — panne **silencieuse**, aucun message | Autant de cellules que de colonnes, sur **chaque** ligne |
| Dernière ligne sans trait | `\\` oublié en fin de ligne | `\\` à la fin de chaque ligne, **y compris la dernière** |
| Cadre vertical absent, tableau écrasé | `|` absents du préambule, `\def\arraystretch` oublié | `{|c|ccccccc|}` et `\def\arraystretch{1.7}` (signes) ou `{2.0}` (variations), avant `\begin{array}` |

**La procédure en trois temps** (§ 9) :

1. **Localiser** — `node tmp/check-math-katex.mjs <fiche.json>` : il rend chaque formule, affiche le message KaTeX exact et la classe du correctif à appliquer ;
2. **Réparer** — `node tmp/fix-katex-errors.mjs <fiche.json>` (sans risque, en dry-run) puis `--apply` : chaque correction candidate est **rendue par KaTeX avant écriture**, donc une formule qui compile n'est jamais touchée ;
3. **Re-contrôler** — `node tmp/audit-revision.mjs <fiche.json>`, puis `npm run validate:content` (règles 14 et 15 : `\\[` ambigu, environnement déséquilibré).

> **Quand le tableau n'est pas réparable, c'est qu'il ne fallait pas un tableau.** Si ses colonnes n'ont pas de sens mathématique — gauche/droite, avant/après, signe/variation — et qu'il ne sert qu'à **aligner du texte**, le remplacer par une liste ou des phrases : c'est la première cause des tableaux qui cassent, parce qu'ils sont écrits pour la mise en page au lieu d'être écrits pour la lecture.

La table complète des tableaux de signes et de variations (strut, flèches, couleurs, valeur interdite, trous autorisés) et la version longue de ces réparations vivent dans **`docs/GUIDE_TABLEAUX_VARIATIONS.md`** — § 9 checklist, § 10 anti-patterns, § 14 réparation.

### L'abus de mise en page — ce qu'il faut arrêter

| Abus | Ce qui se passe | Correctif |
|:-----|:----------------|:----------|
| Trois niveaux de listes imbriquées | Illisible sur téléphone, l'indentation mange la largeur | Aplatir : une seule liste, ou des phrases |
| `itemize` pour deux éléments | Une puce pour deux items fait « liste vide » | Deux phrases avec `\par\smallskip` |
| `enumerate` quand l'ordre n'existe pas | Fausse idée d'étape | `itemize`, ou une phrase |
| Colonnes pour la **correction** | Le raisonnement est coupé en deux | Correction toujours en liste simple |
| Colonnes avec une question longue | La colonne devient un couloir | Une seule question, pleine largeur |
| Tableau pour aligner du **texte** | Un tableau pour ranger, pas pour signifier | Une liste ou des phrases |
| Liste sans phrase d'introduction | Le bloc commence par « 1. », sec | Ouvrir par une phrase finissant par « : » puis `\par\smallskip` |

### Le réflexe final

Avant de valider un bloc `application`, le **lire comme il s'affichera** : sur un écran de téléphone, une liste de quatre items tient sur un écran ; un tableau de variations, non — et c'est normal, l'élève fait défiler. Ce qui n'est **pas** normal, c'est de faire défiler pour deux lignes de calcul.

---

## 9. Vérifier le rendu avant de livrer

Un JSON valide n'est pas un JSON qui s'affiche bien. Le rendu échoue **en silence** : rien ne bloque l'écriture du fichier, et l'élève découvre le problème. Cette section est le protocole de vérification.

### Les quatre passes

| Passe | Question | Outil |
|:------|:---------|:------|
| 1. **Structure** | Le fichier est-il valide, complet, déclaré ? | `npm run validate:content` |
| 2. **Formules** | Chaque formule compile-t-elle ? | `node tmp/check-math-katex.mjs <fiche.json>` |
| 3. **Écriture** | Les blocs tiennent-ils dans leur budget, sans laïus recopié ? | `node tmp/audit-revision.mjs <fiche.json>` |
| 4. **Rendu** | Est-ce que ça se lit bien à l'écran ? | La relecture ci-dessous, et l'application |

```bash
npm run validate:content
# 71 chapitres · 498 exercices — 0 erreur(s), 16 avertissement(s)

node tmp/check-math-katex.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json
# formules contrôlées : 438
# échecs             : 0

node tmp/audit-revision.mjs public/data/<classe>/<chapitre>/revisions/<fiche>.json
# ERREURS        : 0
# AVERTISSEMENTS : 3
```

Les **avertissements** de `validate:content` ne sont pas à ignorer : ils signalent souvent un fichier atteignable par deux chemins, ou un identifiant ambigu — donc un contenu que l'élève risque de ne pas trouver.

> **Pourquoi `check-math-katex` est indispensable.** Une formule invalide ne casse rien : le fichier s'écrit, la page s'affiche, et la formule apparaît **en rouge** au milieu du bloc. Le contrôle rend chaque formule avec KaTeX en mode strict, `\blank{X}` remplacé par `X`, et couvre **tout** le JSON — `content`, `title` et `caption`.

Le même contrôle s'applique **aux exemples de ce guide**, qui sont recopiés tels quels par le robot :

```bash
node tmp/check-guide-examples.mjs docs/GUIDE_MASTER_REVISION.md
# formules contrôlées : 106
# échecs             : 0
```

### Les fautes qui cassent le rendu en silence

| Faute dans le JSON | Ce que l'élève voit | Où c'est écrit |
|:-------------------|:--------------------|:---------------|
| `\enumerate{...}` ou `\itemize{...}` | Le texte brut de la macro, en clair | § 3 « Listes » |
| `\begin{enumerate}` sans `\end{enumerate}` | Le bloc entier ne se rend plus | § 3 « Listes » |
| `\def\arraystretch{...}` écrit dans le contenu | KaTeX échoue : double définition | § 3 « Commandes interdites partout » |
| Un `$` orphelin | Toute la fin de la phrase s'affiche en LaTeX brut | § 4 |
| `\blank{}` dans un cours, ou hors d'un tableau d'activité | Le trou ne s'affiche pas comme un trou, ou interrompt une notion pas encore posée | § 5 `application` |
| `\blank{texte}` écrit dans une formule, avec un `$` à l'intérieur | La formule casse, en rouge | § 5 `application` |
| Tableau de cours contenant un `\blank{}` | Le cours s'interrompt : l'élève doit deviner un résultat qu'il n'a pas encore | § 8 « tableaux » |
| `\textbf{}` à l'intérieur de `$...$` | La formule casse | § 4 |
| `$\Rightarrow$` pour dire *donc* dans une phrase | Un symbole au milieu d'une phrase française | § 4 « Formulation » |
| Un tiret long `—` | Rendu interdit par la charte | Règle absolue 4 |
| `\checkmark` ou `✓` | Rendu interdit par la charte | Règle absolue 7 |
| `\mathqst{}` dans un `content` | La mise en valeur s'affiche au mauvais endroit | § 4 « `\mathqst` » |
| `"position": "center"` | La figure remonte **au-dessus** du texte, sans erreur | § 7 |
| `media.src` en chemin relatif | L'image est cassée | § 7 |
| Figure sur un bloc repliable | La figure reste invisible jusqu'au clic | § 7 |
| `caption` dans un quiz | La légende donne la réponse | § 7 |
| Accent dans une figure SVG | Repli en police système, au milieu du dessin | § 7 |
| Ligne de tableau commençant par `[` collé à `\\` | KaTeX lit un espacement (`Invalid size`) — réparé au rendu, mais à écrire explicitement | § 8 « tableaux » |
| `\cline`, `\multicolumn`, `\multirow` dans un tableau | **Tout le tableau disparaît** : KaTeX ne connaît pas ces commandes | § 8 « Réparer un tableau » |
| `\hline` collé à la commande suivante (`\hlineP(X=k)`) | La commande s'affiche en clair et la fin du bloc est perdue | § 8 « Réparer un tableau » |
| Un `&` manquant dans une ligne de tableau | Les colonnes se décalent, **sans aucun message** | § 8 « Réparer un tableau » |
| `\end{enumerate}` visible en clair dans la fiche | Environnement déséquilibré, ou sous-liste mal fermée | § 3 « Listes » |
| Deux titres de suite commençant par « Comment » | Le procédé devient visible, l'élève ne lit plus | § 4 « Variété » |
| Tous les `warning` ouverts par la même phrase | La formule devient une étiquette ignorée | § 3 « warning » |
| La même amorce `\textbf{Idée :}` recopiée dans dix exercices | La phrase n'est plus lue — et elle devient fausse dès que l'exercice change de thème | § 4 « laïus » |
| Un bloc au-delà de son budget | L'élève saute le pavé | § 4 « Budget de longueur » |
| Un `warning` de plus de 200 caractères | Le garde-fou (« Attention ») devient un paragraphe | § 3 « warning » |

### La relecture « image complète »

La troisième passe ne se fait pas bloc par bloc — sinon on ne voit rien — mais **sur la fiche entière**, exactement comme un élève la parcourt. Six questions :

| # | Question | Signal d'alarme |
|:-:|:---------|:----------------|
| 1 | **La progression est-elle continue ?** | Un bloc suppose une notion jamais posée |
| 2 | **Les notations sont-elles stables ?** | $f$ puis $g$, $\alpha$ puis $a$, pour le même objet |
| 3 | **Les titres sont-ils variés et tous en question ?** | Deux « Comment… » de suite, un titre plat |
| 4 | **Les `warning` parlent-ils tous avec la même voix ?** | Un « Erreur fréquente : » rescapé au milieu de six phrases rédigées |
| 5 | **Chaque figure est-elle utile, visible, et commentée dans le texte ?** | Une figure jamais citée, ou une figure sur un bloc repliable |
| 6 | **Chaque `cela_permet_de` suit-il la connaissance qu'il exploite ?** | Des compétences qui ne correspondent à aucun résultat voisin |

> **Le test du parcours.** Lire la fiche en ne lisant **que les titres**, du début à la fin. Si la suite des titres ne raconte pas le chapitre, si elle bégaie ou si elle saute une étape, la structure est à revoir — le contenu des blocs, lui, peut être excellent.

### La relecture « comme un élève »

Dernière passe, question par question, sur les blocs `application` :

1. Est-ce que je comprends **ce qu'on me demande** sans relire l'énoncé ?
2. La correction me permet-elle de **refaire seul** l'exercice ?
3. Le **résultat final** se voit-il sans le chercher ?
4. Ai-je rencontré un mot que je **ne connaissais pas** et qui n'était pas expliqué ?
5. Si j'ai décroché à la ligne 3, est-ce que je **peux reprendre** à la ligne 4 ?

Une réponse « non » : reprendre le bloc concerné avant de livrer la fiche.
