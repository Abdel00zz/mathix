# Guide Complet : Gestion du Contenu MathPlus

> Ce guide explique **l'architecture des manifestes en cascade**, **où placer** chaque type de contenu, **comment mettre à jour le registre**, et **comment maintenir** la cohérence des données.

---

## 1. Architecture des données en cascade

Tout le contenu pédagogique est dans `public/data/`. Il repose sur un système **fluide et intelligent** divisé en deux niveaux de registres (Index de Classe -> Manifeste de Chapitre) :

```
public/data/
├── classes/                         ← INDEX (Routeurs - 1 fichier par classe)
│   ├── 1ere-bac-sc-math.json
│   ├── 2eme-bac-sc-math.json
│   └── ...
│
├── 1ere-bac-sc-math/                ← CONTENU de la classe
│   ├── arithmetique/
│   │   ├── manifest.json            ← REGISTRE DU CHAPITRE (Source de vérité)
│   │   ├── exercises/               ← Exercices JSON
│   │   │   ├── ex_1.json
│   │   │   └── ...
│   │   ├── quiz/                    ← Quiz (1 seul fichier)
│   │   │   └── arithmetique_quiz.json
│   │   └── revisions/               ← Fiches de révision
│   │       └── fiche_arithmetique_z_cours.json
│   ├── barycentre/
│   │   ├── manifest.json
│   │   ├── exercises/
│   │   └── ...
│   └── pictures/                    ← Images partagées pour toute la classe
│       └── ex_4_courbe.png
│
└── ...
```

### Règle fondamentale

> Le **registre du chapitre** (`[chapitre]/manifest.json`) est la **source de vérité absolue** de son contenu. L'index de classe ne sert qu'à pointer vers ce manifeste via `manifestPath`. Un fichier JSON qui existe sur le disque mais n'est pas déclaré dans le manifeste de son chapitre **n'apparaîtra jamais** dans l'app.

---

## 2. Les registres : anatomie complète

L'application charge l'index de classe pour afficher le Dashboard, puis charge le manifeste du chapitre uniquement lorsque l'utilisateur y entre (chargement dynamique).

### A. L'index de classe (Le Routeur)
Fichier : `public/data/classes/1ere-bac-sc-math.json`

```json
{
  "id": "1ere-bac-sc-math",
  "title": "1ère Bac Sciences Mathématiques",
  "chapters": [
    {
      "id": "arithmetique",
      "title": "Arithmétique dans ℤ",
      "section": "algebre",
      "quizCount": 15,
      "manifestPath": "data/1ere-bac-sc-math/arithmetique/manifest.json",
      "revisions": [
        {
          "path": "data/1ere-bac-sc-math/arithmetique/revisions/fiche_arithmetique_z_cours.json"
        }
      ],
      "quizzes": [
        {
          "id": "quiz-arithmetique",
          "path": "data/1ere-bac-sc-math/arithmetique/quiz/arithmetique_quiz.json"
        }
      ]
    }
  ]
}
```

### B. Le registre du chapitre (La Source de vérité)
Fichier : `public/data/1ere-bac-sc-math/arithmetique/manifest.json`

```json
{
  "id": "arithmetique",
  "title": "Arithmétique dans ℤ",
  "section": "algebre",
  "quizCount": 15,
  "revisions": [
    {
      "id": "rev-arith-1",
      "title": "Fiche Complète : Arithmétique",
      "path": "data/1ere-bac-sc-math/arithmetique/revisions/fiche_arithmetique_z_cours.json"
    }
  ],
  "exercises": [
    {
      "id": "ex-arith-z-01",
      "path": "data/1ere-bac-sc-math/arithmetique/exercises/ex_1.json"
    },
    {
      "id": "ex-arith-z-02",
      "path": "data/1ere-bac-sc-math/arithmetique/exercises/ex_2.json"
    }
  ],
  "quizzes": [
    {
      "id": "quiz-arithmetique",
      "path": "data/1ere-bac-sc-math/arithmetique/quiz/arithmetique_quiz.json"
    }
  ]
}
```

---

## 3. Où placer chaque type de contenu

### Exercices

**Emplacement :** `public/data/[classe]/[chapitre]/exercises/`

**Nommage :** `ex_N.json` (numérotation simple) ou `ex_[nom]_NN.json`

> Voir [GUIDE_CREATION_EXERCICES.md](GUIDE_CREATION_EXERCICES.md) pour la structure complète (context, subQuestions, media, etc.)

### Quiz

**Emplacement :** `public/data/[classe]/[chapitre]/quiz/`

**Nommage :** `[chapitre]_quiz.json` (1 seul fichier par chapitre)

> Voir [GUIDE_CREATION_QUIZ.md](GUIDE_CREATION_QUIZ.md) pour le format des questions.

### Révisions

**Emplacement :** `public/data/[classe]/[chapitre]/revisions/`

**Nommage :**
- Cours : `fiche_[theme]_cours.json`

> Voir [GUIDE_CREATION_REVISION.md](GUIDE_CREATION_REVISION.md)

---

## 4. Mettre à jour le registre

### Ajouter un exercice

1. Créer le fichier : `public/data/[classe]/[chapitre]/exercises/ex_N.json`
2. Ouvrir le **manifeste du chapitre** : `public/data/[classe]/[chapitre]/manifest.json`
3. Ajouter l'entrée dans le tableau `exercises` :
   ```json
   {
     "id": "ex-[chapitre]-NN",
     "path": "data/[classe]/[chapitre]/exercises/ex_N.json"
   }
   ```
4. Tester dans l'app. (Il n'y a **pas besoin** de toucher à l'index de classe principal).

### Ajouter une fiche de révision

1. Créer le fichier de cours.
2. L'ajouter à la fois dans le **manifeste du chapitre** (`revisions` incluant `id` et `title`) ET dans **l'index de classe** (`revisions` incluant `path`), pour que les raccourcis du Dashboard fonctionnent instantanément.

### Ajouter un chapitre entier

1. Créer le dossier et son manifeste :
   ```
   public/data/[classe]/[nouveau-chapitre]/manifest.json
   ```
2. Remplir ce `manifest.json` avec la structure de base :
   ```json
   {
     "id": "nouveau-chapitre",
     "title": "Titre du Chapitre",
     "section": "algebre",
     "quizCount": 0,
     "revisions": [],
     "exercises": [],
     "quizzes": []
   }
   ```
3. Déclarer le chapitre dans **l'index de classe** (`public/data/classes/[classe].json`) :
   ```json
   {
     "id": "nouveau-chapitre",
     "title": "Titre du Chapitre",
     "section": "algebre",
     "quizCount": 0,
     "manifestPath": "data/[classe]/nouveau-chapitre/manifest.json",
     "revisions": [],
     "quizzes": []
   }
   ```

---

## 5. Détecter et nettoyer les doublons

Un fichier sur le disque sans entrée dans le `manifest.json` du chapitre est un fichier "fantôme".
Si un `path` dans le `manifest.json` pointe vers un fichier inexistant, l'application plantera au téléchargement de cet exercice. Toujours vérifier que les chemins du manifeste correspondent exactement aux fichiers sur le disque.

**Méthode rapide** — comparer avec jq :

```bash
# Les chemins enregistrés dans le manifeste :
jq -r '.exercises[].path' public/data/1ere-bac-sc-math/arithmetique/manifest.json
```

---

## 6. Réorganiser les exercices par difficulté

L'application charge les exercices **dans l'ordre du tableau `exercises`** du manifeste du chapitre. Pour réorganiser la session d'un élève, il suffit de réordonner les objets dans ce fichier.

| Niveau | Description | Placer en... |
|--------|-------------|-------------|
| **Fluide** | Application directe du cours, calculs simples | **Début** du tableau |
| **Technique** | Nécessite une méthode précise, plusieurs étapes | **Milieu** du tableau |
| **Avancé** | Problème ouvert, raisonnement complexe, synthèse | **Fin** du tableau |

---

## Règles d'or
- **Édition locale :** Touchez au `manifest.json` du chapitre pour ajouter/supprimer/trier des exercices.
- **Chemins absolus depuis public :** Tous les attributs `path` et `manifestPath` doivent commencer par `data/` (et non `/data/`).

## Guides liés

- [GUIDE_CREATION_EXERCICES.md](GUIDE_CREATION_EXERCICES.md) — Structure JSON d'un exercice
- [GUIDE_CREATION_QUIZ.md](GUIDE_CREATION_QUIZ.md) — Structure JSON d'un quiz
- [GUIDE_CREATION_REVISION.md](GUIDE_CREATION_REVISION.md) — Structure JSON d'une fiche de révision
- [GUIDE_IMAGES.md](GUIDE_IMAGES.md) — Gestion des images
