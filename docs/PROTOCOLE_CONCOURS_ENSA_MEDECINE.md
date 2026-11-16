# Protocole concours — ENSA et Médecine

Ce document décrit le **contrat réellement appliqué par l'application** pour les concours ENSA et Médecine : organisation des fichiers, sélection des questions, structures JSON utilisables et syntaxe LaTeX.

Pour toute création ou modification de données concours, appliquer aussi [`guide_concours.json`](./guide_concours.json) : il est normatif et impose exclusivement `"type": "mcq"`. Les exemples historiques de types génériques présents plus bas expliquent le moteur commun, mais sont interdits dans les banques concours.

Il distingue volontairement le code actuel des guides plus anciens. Lorsqu'ils divergent, c'est le code qui détermine ce qui apparaît à l'élève.

## 1. Ce qui existe aujourd'hui

| Concours | Banque effective | Annales | Banque thématique additionnelle | Simulation | Temps officiel |
|---|---:|---:|---:|---:|---:|
| ENSA | 155 questions | 110 | 45 | 30 questions | 45 s/question |
| Médecine | 403 questions | 380 | 23 | 20 questions | 60 s/question |

ENSA comporte trois thèmes : `analyse`, `algebre`, `probabilites`.

Médecine comporte cinq thèmes : `analyse`, `algebre`, `complexes`, `geometrie-espace`, `probabilites`.

Les entrées génériques dont le compteur vaut zéro restent référencées mais ne sont pas proposées dans le catalogue. Les annales historiques disponibles sont enregistrées avec leur libellé exact (année et centre), afin de ne pas les confondre avec ces espaces réservés.

## 2. Circuit réel de chargement

Le point d'entrée est toujours [`public/data/concours/schools.json`](../public/data/concours/schools.json), pas le manifeste de l'école.

1. Le tableau de bord lit `schools.json` pour afficher les écoles, thèmes, annales et compteurs.
2. Pour une **annale**, le service lit uniquement le chemin de l'année défini dans `schools.json`.
3. Pour un **thème** ou une **simulation complète**, il charge toutes les annales de l'école, puis ses `fallbackQuizPaths`, puis les quiz du `manifest.json`.
4. Les questions ayant le même `id` sont dédoublonnées à l'échelle de l'école.
5. Une simulation complète répartit d'abord les questions entre les thèmes, puis complète aléatoirement le solde. Les questions et l'ordre de leurs choix sont ensuite mélangés.

Conséquences pratiques :

- Une annale nouvelle doit obligatoirement être ajoutée à `schools.json`. La placer seulement dans le dossier ou dans `manifest.json` ne la rend pas sélectionnable.
- Les `annales` présents dans chaque `manifest.json` sont descriptifs : le service ne les utilise pas pour choisir une session annuelle.
- Les chemins `fallbackQuizPaths` de Médecine et les `quizzes` de son manifeste pointent actuellement vers les mêmes deux fichiers. Cela ne crée pas de doublon visible, car l'`id` dédoublonne les questions.
- Chaque `id` doit donc être unique dans toute la banque d'une école, et non seulement dans un fichier.
- Le champ `theme` est fonctionnel : il doit être le slug exact, en minuscules. Par exemple `"analyse"`, jamais `"Analyse"`. Une majuscule empêcherait l'apparition de la question dans le filtre de thème.

### Registre d'école : structure active

Exemple minimal pour une école déjà existante. Les compteurs servent à l'affichage rapide : ils doivent refléter les données réelles.

```json
{
  "id": "ensa",
  "name": "ENSA",
  "fullName": "Ecoles Nationales des Sciences Appliquées",
  "color": "#2563eb",
  "icon": "GraduationCap",
  "themes": [
    { "id": "analyse", "name": "Analyse" },
    { "id": "algebre", "name": "Algèbre & Géométrie" },
    { "id": "probabilites", "name": "Probabilités" }
  ],
  "annales": [
    {
      "year": "2026",
      "path": "data/concours/ensa/ensa_2026.json",
      "count": 20
    }
  ],
  "questionsPerExam": 30,
  "timePerQuestion": 45,
  "description": "Concours d'accès aux ENSA — QCM Mathématiques",
  "themeCounts": {
    "analyse": 70,
    "algebre": 55,
    "probabilites": 30
  },
  "totalQuestions": 155
}
```

`themes[].quizPath` et `themes[].chapters`, montrés dans une ancienne version du guide, ne sont pas lus par le service actuel. Utiliser `fallbackQuizPaths` si une banque thématique doit être déclarée dans le registre.

### Manifeste d'école : rôle réel

Le manifeste sert actuellement à déclarer des quiz thématiques additionnels. Les métadonnées sont utiles pour la cohérence éditoriale ; son tableau `quizzes` est lu par le service.

```json
{
  "id": "ensa",
  "name": "ENSA",
  "fullName": "Ecoles Nationales des Sciences Appliquées",
  "description": "Concours d'accès aux ENSA — QCM Mathématiques",
  "color": "#2563eb",
  "questionsPerExam": 30,
  "timePerQuestion": 45,
  "quizzes": [
    {
      "id": "ensa-analyse",
      "theme": "analyse",
      "title": "Analyse",
      "path": "data/concours/ensa/quiz/ensa_analyse_quiz.json"
    }
  ]
}
```

### Fichier d'annale ou de banque

Le chargeur lit seulement `questions`. Les métadonnées de tête sont recommandées pour rendre le fichier compréhensible, mais elles ne sont pas nécessaires au rendu.

```json
{
  "school": "ensa",
  "year": "2026",
  "title": "Concours ENSA 2026",
  "questions": []
}
```

## 3. Contrat commun à chaque question

Utiliser systématiquement les champs suivants :

| Champ | Rôle | Règle de rédaction |
|---|---|---|
| `id` | identité et dédoublonnage | unique dans toute l'école ; ex. `ensa-26-01` |
| `type` | composant d'interaction | toujours `mcq` pour les concours |
| `theme` | filtre et bilan final | slug exact du registre, minuscules |
| `category` | classement pédagogique | texte court et cohérent : `Limites`, `Complexes`, etc. |
| `difficulty` | métadonnée pédagogique | préférer `easy`, `medium`, `hard` ou `concours` |
| `prompt` | énoncé visible | texte français avec formules KaTeX |
| `explanation` | correction après validation | stratégie, calcul, piège et conclusion |

Le parseur accepte aussi `question` à la place de `prompt` et `is_correct` à la place de `isCorrect`, pour compatibilité. Les nouveaux contenus doivent employer `prompt` et `isCorrect` : c'est la forme lisible et stable.

### 3.1 QCM — forme recommandée

Le code sait afficher deux choix ou plus. Le standard éditorial reste toutefois **quatre choix, une unique réponse correcte** dès que des distracteurs mathématiques pertinents existent. Les anciens Vrai/Faux migrés gardent deux choix (`Vraie` / `Fausse`), mais utilisent eux aussi le type unique `mcq` et l'interface QCM.

```json
{
  "id": "ensa-26-01",
  "type": "mcq",
  "theme": "analyse",
  "category": "Limites",
  "difficulty": "concours",
  "prompt": "La limite $\\displaystyle\\lim_{x \\to 0} \\frac{\\sin(3x)}{\\tan(5x)}$ vaut :",
  "options": [
    { "id": "a", "text": "$\\frac{3}{5}$", "isCorrect": true },
    { "id": "b", "text": "$\\frac{5}{3}$", "isCorrect": false },
    { "id": "c", "text": "$1$", "isCorrect": false },
    { "id": "d", "text": "$0$", "isCorrect": false }
  ],
  "explanation": "Réflexe : utiliser $\\sin(3x) \\sim 3x$ et $\\tan(5x) \\sim 5x$ au voisinage de $0$. Le quotient tend donc vers $\\frac{3x}{5x}=\\frac{3}{5}$. Piège : $\\frac{5}{3}$ inverse le numérateur et le dénominateur."
}
```

Les identifiants d'options doivent être uniques dans la question. Ils ne doivent pas porter la bonne réponse de manière implicite : le service mélange l'ordre d'affichage avant chaque tentative.

### 3.2 Vrai/Faux

```json
{
  "id": "med-26-01",
  "type": "boolean",
  "theme": "analyse",
  "category": "Propriété",
  "difficulty": "easy",
  "prompt": "Pour $x>0$, on a $\\ln(x^2)=2\\ln(x)$.",
  "isTrue": true,
  "explanation": "On applique $\\ln(a^n)=n\\ln(a)$ lorsque $a>0$. La condition $x>0$ est indispensable."
}
```

### 3.3 Ordonner une méthode

`items` contient le désordre initial ; `correctOrder` est la liste exacte de ses identifiants dans l'ordre attendu. La vérification est stricte.

```json
{
  "id": "med-26-02",
  "type": "order",
  "theme": "complexes",
  "category": "Méthode",
  "difficulty": "medium",
  "prompt": "Ordonner les étapes permettant de calculer $z^n$ avec la forme exponentielle.",
  "items": [
    { "id": "a", "content": "Calculer le module et un argument de $z$." },
    { "id": "b", "content": "Écrire $z=re^{i\\theta}$." },
    { "id": "c", "content": "Appliquer $z^n=r^n e^{in\\theta}$." }
  ],
  "correctOrder": ["a", "b", "c"],
  "explanation": "On identifie d'abord la forme polaire, puis on applique directement la formule de De Moivre."
}
```

### 3.4 Repérer une erreur

Une seule étape doit avoir `"isError": true`. La correction de cette étape est affichée après validation si `correction` est fourni.

```json
{
  "id": "med-26-03",
  "type": "error",
  "theme": "analyse",
  "category": "Application",
  "difficulty": "hard",
  "prompt": "Repérer l'étape incorrecte dans ce calcul de limite.",
  "context": "On étudie $\\displaystyle\\lim_{x\\to+\\infty}(\\sqrt{x^2+1}-x)$.",
  "steps": [
    { "id": "s1", "text": "La forme est $+\\infty-\\infty$, donc elle est indéterminée.", "isError": false },
    { "id": "s2", "text": "Comme $x$ tend vers l'infini, l'expression vaut forcément $+\\infty$.", "isError": true, "correction": "Il faut multiplier par le conjugué ; l'infini et le zéro créent encore une forme indéterminée." },
    { "id": "s3", "text": "On peut ensuite utiliser le conjugué pour lever l'indétermination.", "isError": false }
  ],
  "explanation": "Une différence de deux grandeurs infinies ne se traite pas en gardant seulement le terme visuellement dominant."
}
```

## 4. Politique QCM unique

Les deux banques sont désormais entièrement homogènes : **155 QCM ENSA et 403 QCM Médecine**, soit 558 QCM. Les 20 Vrai/Faux, 11 questions d'ordre et 16 questions de détection d'erreur de Médecine ont été convertis en QCM sans perdre leur contenu :

- un Vrai/Faux devient un QCM « Vraie / Fausse » ;
- une question d'ordre devient un QCM proposant quatre séquences ;
- une question de détection d'erreur devient un QCM proposant les étapes du raisonnement.

Le moteur générique conserve encore les anciens types pour d'autres parties de l'application, mais **aucune nouvelle donnée concours ne doit employer** `boolean`, `order`, `error` ou `input`.

Deux fonctionnalités décrites dans d'anciens guides ne doivent pas être utilisées dans les données concours :

- `groupId` et `groupPrompt` sont définis dans les types et le composant visuel sait les afficher, mais `quizService.parseQuestion` ne les transmet pas depuis le JSON. Un énoncé partagé serait donc perdu.
- `timeLimit` est lu dans une question, mais le chronomètre concours privilégie le réglage de l'école (45 s ENSA, 60 s Médecine), puis le choix de l'élève. Ne pas compter sur un temps spécifique à une question de concours.

## 5. Syntaxe LaTeX / KaTeX à employer

### Règles essentielles

1. Toute formule doit être placée entre `$...$` (dans une phrase) ou `$$...$$` (formule isolée).
2. Dans un fichier JSON, **chaque antislash LaTeX s'écrit `\\`**. Ainsi, `\\frac` dans le JSON devient `\frac` pour KaTeX.
3. `$` ne s'échappe pas en JSON.
4. Pour un saut de ligne dans une explication, écrire `\n` dans la chaîne JSON. Pour un saut de ligne mathématique dans un `align*`, écrire `\\\\`.
5. Rester sur le KaTeX standard (`\\frac`, `\\sqrt`, `\\lim`, `\\sum`, `\\int`, `\\mathbb`, `\\overline`, `\\theta`, etc.) pour rendre les questions portables.

### Inline et display

```json
{
  "prompt": "Le module est $|z|=\\sqrt{a^2+b^2}$.",
  "explanation": "Calcul : $$|1-i\\sqrt{3}|=\\sqrt{1^2+(\\sqrt{3})^2}=2.$$"
}
```

La formule `$$...$$` doit être réservée à une étape importante ou longue. Dans un QCM, l'inline est généralement plus lisible.

### Formule sur plusieurs lignes

```json
{
  "explanation": "$$\\begin{align*} I &= \\int_0^1 2x\\,\\mathrm{d}x \\\\ &= [x^2]_0^1 \\\\ &= 1. \\end{align*}$$"
}
```

### Macros de l'application disponibles en plus de KaTeX

Le moteur définit notamment `\\R`, `\\N`, `\\Z`, `\\C`, `\\Proba{A}`, `\\ProbaC{A}{B}`, `\\Esper{X}`, `\\Var{X}`, `\\vect{u}`, `\\module{z}` et `\\argu{z}`. Elles sont pratiques, mais les commandes KaTeX standard restent préférables dans les annales afin de simplifier la relecture et la réutilisation.

### Erreur à éviter absolument

```json
{ "text": "\\frac{3}{5}" }
```

est invalide du point de vue du rendu : le texte contient une commande LaTeX mais aucune formule délimitée. La version correcte est :

```json
{ "text": "$\\frac{3}{5}$" }
```

Le contrôle des banques a trouvé 15 choix ainsi écrits sans délimiteurs, principalement dans `ensa_2024.json` (questions 04, 09, 12, 16 et 17), ainsi qu'un choix de `med_2019.json` (question 19). Ils risquent d'afficher le code `\\frac` ou `\\pi` au lieu de la formule.

## 6. Corrections réalisées et écarts restants

| Sujet | État actuel |
|---|---|
| ENSA 2019, questions 9 et 10 | réponses correctes restaurées (`3/10` et `1/3`) |
| Formules de choix sans délimiteurs | 15 corrections appliquées ; chaque commande mathématique de choix est désormais entre `$...$` |
| Typage des questions | 558 QCM, sans ancien type actif |
| Compteur ENSA Analyse | synchronisé à 72 questions dans `schools.json` |
| Questions groupées | guide documenté, données absentes et parseur incomplet ; ne pas les produire avant adaptation du parseur |

Après correction, tous les segments de formule des banques ENSA et Médecine passent la validation KaTeX, chaque question possède exactement une réponse correcte et chaque identifiant est unique.

## 7. Checklist avant livraison d'un fichier

- [ ] Le JSON est valide et encodé en UTF-8.
- [ ] Chaque `id` est nouveau dans toute l'école.
- [ ] Chaque `theme` correspond exactement à un `themes[].id` de `schools.json`.
- [ ] Chaque question a un `prompt`, une `category`, une `difficulty` et une `explanation` utiles.
- [ ] Tout QCM possède une seule réponse `isCorrect: true` et, par défaut, quatre options plausibles.
- [ ] Tout `order` a les mêmes identifiants dans `items` et dans `correctOrder`.
- [ ] Toute question `error` a exactement une étape `isError: true`.
- [ ] Chaque formule est entourée de `$...$` ou `$$...$$` et tous les antislashs sont doublés dans le JSON.
- [ ] Une nouvelle annale est déclarée avec le bon `count` dans `schools.json` ; `totalQuestions` et `themeCounts` sont recalculés.
- [ ] Les résultats mathématiques, les distracteurs et l'origine de l'annale sont revus par une personne compétente avant publication.
