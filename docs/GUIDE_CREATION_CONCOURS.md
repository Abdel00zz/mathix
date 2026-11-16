# Guide de Création des Quiz Concours Post-Bac

## Architecture des fichiers

```
public/data/concours/
├── schools.json                    ← Registre central des écoles
├── ensa/
│   ├── manifest.json               ← Métadonnées ENSA
│   └── quiz/
│       ├── ensa_analyse_quiz.json
│       ├── ensa_algebre_quiz.json
│       └── ensa_probabilites_quiz.json
├── ensam/
│   ├── manifest.json
│   └── quiz/
│       ├── ensam_analyse_quiz.json
│       └── ensam_algebre_quiz.json
└── medecine/
    ├── manifest.json
    └── quiz/
        ├── med_analyse_quiz.json
        └── med_probabilites_quiz.json
```

## Comment ajouter une nouvelle école

### 1. Créer le dossier

```
public/data/concours/{school-id}/
├── manifest.json
└── quiz/
    └── {school-id}_{theme}_quiz.json
```

### 2. Créer le manifest.json

```json
{
  "id": "enim",
  "name": "ENIM",
  "fullName": "Ecole Nationale de l'Industrie Minérale",
  "description": "Concours d'accès à l'ENIM — QCM Mathématiques",
  "color": "#7c3aed",
  "questionsPerExam": 25,
  "timePerQuestion": 50,
  "quizzes": [
    {
      "id": "enim-analyse",
      "theme": "analyse",
      "title": "Analyse",
      "path": "data/concours/enim/quiz/enim_analyse_quiz.json"
    }
  ]
}
```

### 3. Enregistrer dans schools.json

Ajouter un objet dans le tableau `schools` de `public/data/concours/schools.json` :

```json
{
  "id": "enim",
  "name": "ENIM",
  "fullName": "Ecole Nationale de l'Industrie Minérale",
  "color": "#7c3aed",
  "icon": "Factory",
  "manifestPath": "data/concours/enim/manifest.json",
  "themes": [
    {
      "id": "analyse",
      "name": "Analyse",
      "quizPath": "data/concours/enim/quiz/enim_analyse_quiz.json",
      "chapters": ["limites-continuite", "suites-numeriques", "derivation-etude"]
    }
  ],
  "years": ["2025", "2024"],
  "questionsPerExam": 25,
  "timePerQuestion": 50,
  "description": "Concours d'accès à l'ENIM — QCM Mathématiques"
}
```

**Champs importants :**
- `id` : Identifiant unique, utilisé dans les URLs et le stockage
- `color` : Couleur hex pour le thème visuel de l'école
- `quizPath` : Chemin vers le fichier quiz dédié (prioritaire)
- `chapters` : Chapitres de 2ème Bac Sc Math utilisés en fallback si le quizPath est vide ou absent

### 4. L'icône dans ConcoursView.tsx

Ajouter l'icône dans `SCHOOL_ICONS` dans `components/Views/ConcoursView.tsx` :

```tsx
const SCHOOL_ICONS: Record<string, React.ReactNode> = {
  ensa: <GraduationCap size={22} />,
  ensam: <Wrench size={22} />,
  medecine: <Heart size={22} />,
  enim: <Factory size={22} />,  // ← Ajouter ici
};
```

---

## Format des questions QCM

### Structure de base

```json
{
  "questions": [
    {
      "id": "ensa-an-01",
      "type": "mcq",
      "category": "Limites",
      "difficulty": "concours",
      "prompt": "Texte de la question avec $\\LaTeX$...",
      "options": [
        { "id": "a", "text": "Réponse A", "isCorrect": true },
        { "id": "b", "text": "Réponse B", "isCorrect": false },
        { "id": "c", "text": "Réponse C", "isCorrect": false },
        { "id": "d", "text": "Réponse D", "isCorrect": false }
      ],
      "explanation": "Explication détaillée avec le raisonnement..."
    }
  ]
}
```

### Types de questions supportés

| Type | Description | Champs requis |
|------|-------------|---------------|
| `mcq` | QCM classique (1 bonne réponse) | `options` avec `isCorrect` |
| `boolean` | Vrai/Faux | `isTrue` |
| `order` | Ordonner des étapes | `items`, `correctOrder` |
| `error` | Identifier l'erreur | `steps` avec `isError` |
| `input` | Réponse libre | `correctAnswers` |

### Convention de nommage des IDs

```
{school}-{theme_abbrev}-{numero}

Exemples :
  ensa-an-01   → ENSA, Analyse, question 1
  ensa-al-05   → ENSA, Algèbre, question 5
  ensam-an-12  → ENSAM, Analyse, question 12
  med-pr-03    → Médecine, Probabilités, question 3
```

---

## Rédaction des questions : bonnes pratiques

### Niveau de difficulté

Les questions concours doivent être de **niveau intermédiaire à avancé** :
- Basées sur le programme officiel marocain du 2ème Bac Sciences Mathématiques
- Combinaison de plusieurs notions dans une même question
- Pièges calculatoires typiques des concours (domaine de validité, signes, cas limites)

### Catégories par thème

**Analyse :** Limites, Continuité, Dérivation, Suites, Logarithme, Exponentielle, Intégration, Equations différentielles

**Algèbre :** Complexes, Arithmétique, Structures (groupes, anneaux, corps), Espaces vectoriels

**Probabilités :** Dénombrement, Probabilités, Probabilités conditionnelles, Bayes, Variables aléatoires

### Qualité des explications

L'explication doit :
1. **Donner la méthode** : quelle technique est utilisée
2. **Montrer le calcul** : étapes clés en LaTeX
3. **Nommer le théorème** : référencer le programme officiel
4. **Signaler les pièges** : pourquoi les mauvaises réponses sont tentantes

Exemple :
```
"On utilise les équivalents classiques en 0 : sin(3x) ~ 3x et tan(5x) ~ 5x.
Donc sin(3x)/tan(5x) ~ 3x/5x = 3/5.
Ces équivalents découlent du programme : lim_{u→0} sin(u)/u = 1."
```

---

## Circuit de chargement

```
1. ConcoursView → concoursService.loadSchools()
                  → fetch('/data/concours/schools.json')

2. User sélectionne école + thème + nb questions

3. ConcoursQuizView → concoursService.buildExam({schoolId, themeId, questionCount})
                      ├── Priorité 1: theme.quizPath → fetch quiz dédié
                      └── Priorité 2: theme.chapters → fetch quiz chapitres (fallback)

4. Questions shufflées (Fisher-Yates) → slice(0, questionCount)

5. Résultats → concoursService.computeBreakdown()
               → scores par thème avec barres de progression
```

### Mécanisme de fallback

Si `quizPath` est défini dans le thème, le service charge les questions depuis ce fichier dédié.
Sinon, il charge les questions depuis les quiz de chapitres du programme scolaire (`2eme-bac-sc-math`).

Cela permet de :
- Ajouter des questions spécifiques concours de haute qualité
- Compléter avec les questions du programme en attendant

---

## Progression

La progression concours est stockée dans `localStorage` clé `mathplus_concours_progress` :

```json
{
  "totalExams": 5,
  "bestScores": {
    "ensa": 73,
    "ensam": 68,
    "medecine": 85
  },
  "lastPlayed": 1711500000000
}
```

Elle est **séparée** de la progression scolaire (`mathplus_state`).

---

## Ajouter un nouveau thème à une école existante

1. Créer le fichier quiz : `data/concours/{school}/quiz/{school}_{theme}_quiz.json`
2. Ajouter dans `schools.json` un objet thème :
   ```json
   {
     "id": "geometrie",
     "name": "Géométrie",
     "quizPath": "data/concours/ensa/quiz/ensa_geometrie_quiz.json",
     "chapters": ["complexes"]
   }
   ```
3. Ajouter dans le `manifest.json` de l'école :
   ```json
   {
     "id": "ensa-geometrie",
     "theme": "geometrie",
     "title": "Géométrie",
     "path": "data/concours/ensa/quiz/ensa_geometrie_quiz.json"
   }
   ```

Aucune modification de code n'est nécessaire — le service charge dynamiquement.
