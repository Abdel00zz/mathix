# Guide Architecture MathPlus — De A à Z

> Vue complète de l'application : dashboard, quiz, exercices, révision, sidebar, et flux de données.

---

## Table des matières

- [Guide Architecture MathPlus — De A à Z](#guide-architecture-mathplus--de-a-à-z)
  - [Table des matières](#table-des-matières)
  - [1. Vue d'ensemble](#1-vue-densemble)
  - [2. Point d'entrée — `App.tsx`](#2-point-dentrée--apptsx)
  - [3. Navigation entre les vues (`useAppNavigation`)](#3-navigation-entre-les-vues-useappnavigation)
  - [4. Le Dashboard](#4-le-dashboard)
    - [4.1 DashboardHeader](#41-dashboardheader)
    - [4.2 DashboardSectionTabs](#42-dashboardsectiontabs)
    - [4.3 ChapterModule](#43-chaptermodule)
    - [4.4 ExamenModule / ProblemeModule / OlympiadModule](#44-examenmodule--problememodule--olympiadmodule)
    - [4.5 ControlBlade (sidebar)](#45-controlblade-sidebar)
  - [5. Le Quiz](#5-le-quiz)
    - [5.1 QuizSessionView](#51-quizsessionview)
    - [5.2 useQuizLogic](#52-usequizlogic)
    - [5.3 QuizCore](#53-quizcore)
    - [5.4 Types de questions](#54-types-de-questions)
  - [6. Les Exercices](#6-les-exercices)
    - [6.1 ExerciseSessionView](#61-exercisesessionview)
    - [6.2 useExerciseData](#62-useexercisedata)
    - [6.3 ExerciseArticle et sous-composants](#63-exercisearticle-et-sous-composants)
    - [6.4 ExerciseEngine](#64-exerciseengine)
  - [7. La Révision (Fiche de cours)](#7-la-révision-fiche-de-cours)
    - [7.1 RevisionView](#71-revisionview)
    - [7.2 useRevisionSheet](#72-userevisionsheet)
    - [7.3 Blocs de révision](#73-blocs-de-révision)
    - [7.4 Visibilité des blocs](#74-visibilité-des-blocs)
  - [8. Les Modales](#8-les-modales)
  - [9. Données et services — De A à Z](#9-données-et-services--de-a-à-z)
    - [9.1 Types globaux (`types.ts`)](#91-types-globaux-typests)
    - [9.2 Stockage local (`storageService`)](#92-stockage-local-storageservice)
    - [9.3 Synchronisation cloud (`cloudSyncService`)](#93-synchronisation-cloud-cloudsyncservice)
    - [9.4 API Vercel (`/api/`)](#94-api-vercel-api)
    - [9.5 Chargement du contenu (`contentService`)](#95-chargement-du-contenu-contentservice)
    - [9.6 Progression globale (`useGlobalProgress`)](#96-progression-globale-useglobalprogress)
  - [10. Flux complet d'une session utilisateur](#10-flux-complet-dune-session-utilisateur)
  - [Résumé des fichiers clés](#résumé-des-fichiers-clés)

---

## 1. Vue d'ensemble

MathPlus est une **Progressive Web App (PWA)** React/TypeScript destinée aux élèves du lycée marocain (TC, 1BAC, 2BAC). Elle propose :

| Section | Rôle |
|---|---|
| **Dashboard** | Hub principal : chapitres, examens nationaux, problèmes, olympiades |
| **Révision** | Fiche de cours JSON structurée avec blocs filtrables |
| **Quiz** | QCM, Vrai/Faux, Ordre, Erreurs, Input — avec timer et score |
| **Exercices** | Exercices corrigés avec système de mastery (haut / moyen / bas) |
| **Concours** | Hub de préparation aux concours (CPGE, etc.) |
| **Sidebar** | `ControlBlade` — accès aux réglages, notifications, orientation, déconnexion |

```
App.tsx
├── LoginView
├── DashboardView
│   ├── DashboardHeader
│   ├── DashboardSectionTabs  ← navigation entre sections
│   ├── ChapterModule (× n)
│   ├── ExamenModule
│   ├── ProblemeModule
│   ├── OlympiadModule
│   └── ControlBlade (sidebar)
├── QuizSessionView
│   └── QuizCore
├── ExerciseSessionView
│   └── ExerciseArticle
├── RevisionView
│   ├── RevisionSectionBlock (× n)
│   ├── TableOfContents
│   └── SkillChecklist
└── ConcoursView / ConcoursHubView / ConcoursQuizView
```

---

## 2. Point d'entrée — `App.tsx`

**Fichier :** `App.tsx`

`App.tsx` est le composant racine. Il orchestre :

- **Les hooks globaux** :
  - `useGlobalProgress()` — état utilisateur + progression (localStorage + cloud)
  - `useAppSettings()` — réglages d'affichage (thème, visibilité des blocs)
  - `useAppNavigation()` — machine d'états des vues (`view: AppView`)
  - `useAutoUpdate()` — détection silencieuse de mises à jour du service worker

- **Le rendu conditionnel** :
  ```tsx
  switch (view) {
    case 'login':      → <LoginView />
    case 'dashboard':  → <DashboardView />
    case 'quiz':       → <QuizSessionView />
    case 'session':    → <ExerciseSessionView />
    case 'revision':   → <RevisionView />
    case 'concours':   → <ConcoursView />
    // ...
  }
  ```

- **Le chargement du manifeste** : `contentService.fetchRootManifest()` est appelé une seule fois quand la vue est `dashboard` ou `concours`.

- **Le splash HTML** : `window.__hideSplash()` est appelé dès que `isLoaded === true`.

---

## 3. Navigation entre les vues (`useAppNavigation`)

**Fichier :** `hooks/useAppNavigation.ts`

Ce hook centralise toutes les transitions de vue. Il expose :

| Fonction | Transition |
|---|---|
| `handleSelectChapter(chapter)` | Sélectionne un chapitre dans le dashboard |
| `handleStartSession()` | `dashboard` → `session` (exercices) |
| `handleStartQuiz()` | `dashboard` → `quiz` |
| `handleOpenRevision(path)` | `dashboard` → `revision` |
| `handleBackToDashboard()` | N'importe où → `dashboard` |
| `handleStartExamen(examen)` | `dashboard` → `examen-session` |
| `handleStartDs(ds)` | `dashboard` → `ds-session` |
| `handleStartProbleme(entry)` | `dashboard` → `probleme-view` |
| `handleOpenCadreReferentiel()` | `dashboard` → `cadre-referentiel` |

**Gestion de l'historique natif :**
- Chaque transition pousse un état dans `window.history` via `pushHistoryState()`.
- Le bouton retour natif du navigateur est intercepté via `popstate`.
- Les vues invalides (ex: `revision` sans chapitre sélectionné) redirigent automatiquement vers `dashboard`.

**Types de vues (`AppView`) :**
```ts
type AppView =
  | 'login' | 'dashboard' | 'session' | 'quiz' | 'revision'
  | 'concours' | 'concours-hub' | 'concours-quiz'
  | 'examen-session' | 'ds-session' | 'probleme-view' | 'cadre-referentiel';
```

---

## 4. Le Dashboard

**Fichier :** `components/Views/DashboardView.tsx`

`DashboardView` reçoit :
- `user` — profil de l'utilisateur (nom, classe, mode)
- `globalProgress` — dictionnaire `chapterId → ChapterProgress`
- Des callbacks : `onSelectChapter`, `onStartSession`, `onStartQuiz`, `onOpenRevision`, etc.

Il charge le contenu via `useDashboardData(classId, globalProgress)` qui retourne :
- `chapters` — liste des chapitres disponibles pour la classe
- `allClassExercises` — tous les exercices de la classe
- `is2bac` — booléen pour afficher la section Examens Nationaux
- `hasOlympiad` — booléen pour afficher la section Olympiades

### 4.1 DashboardHeader

**Fichier :** `components/Dashboard/DashboardHeader.tsx`

Affiche :
- **Suréline éditoriale** selon la classe (`Baccalauréat · Sciences Mathématiques`, etc.)
- **Titre principal** dynamique selon la section active
- **Description personnalisée** avec le prénom, le nombre de chapitres et le temps d'étude

### 4.2 DashboardSectionTabs

**Fichier :** `components/Dashboard/DashboardSectionTabs.tsx`

Barre de navigation horizontale entre les sections du dashboard :

| Tab ID | Titre | Couleur | Condition d'affichage |
|---|---|---|---|
| `chapitres` | Chapitres | `#1A1714` | Toujours visible |
| `examens` | Examens Nationaux | `#C4502A` | `is2bac` et handler disponible |
| `problemes` | Problèmes | `#6D5F08` | Classe supportée |
| `olympiad` | Olympiades | `#1F6F64` | Classe supportée |

- Un slider CSS suit l'onglet actif avec animation fluide via `ResizeObserver`.
- L'onglet actif est persisté dans `sessionStorage` sous la clé `dashboard_active_section`.

### 4.3 ChapterModule

**Fichier :** `components/Dashboard/ChapterModule.tsx`

Carte de chapitre avec :

- **4 thèmes de couleur** cycliques (bleu, vert, teal, jaune)
- **Barre de progression** animée (`useAnimatedPercentage`)
- **Badges** : nombre de questions quiz, nombre d'exercices, présence d'une fiche
- **3 boutons d'action** :

| Bouton | Couleur | Déverrouillage |
|---|---|---|
| **Leçon** (révision) | Beige/noir | Toujours disponible |
| **Quiz** | Bleu | Révision ≥ 10% |
| **Exercices** | Vert | Quiz ≥ 50% **ou** quiz soumis |

- Le chapitre peut être marqué `isUpcoming` (à venir) : les boutons sont désactivés.
- Tooltip au survol des boutons verrouillés pour expliquer la condition.

### 4.4 ExamenModule / ProblemeModule / OlympiadModule

**Fichiers :**
- `components/Dashboard/ExamenModule.tsx`
- `components/Dashboard/ProblemeModule.tsx`
- `components/Dashboard/OlympiadModule.tsx`

Modules secondaires du dashboard, affichés selon la section active :
- **ExamenModule** : liste des examens nationaux par année, avec session (Normale / Rattrapage)
- **ProblemeModule** : problèmes ouverts de type devoir surveillé
- **OlympiadModule** : épreuves olympiques avec difficulté et thème

### 4.5 ControlBlade (sidebar)

**Fichier :** `components/UI/ControlBlade.tsx`

Panneau vertical latéral (desktop) ou barre horizontale (mobile) avec 5 icônes :

| Icône | Action | ID Modal |
|---|---|---|
| `Settings` | Ouvre les réglages | `settings` |
| `Compass` | Ouvre l'orientation | `orientation` |
| `Mail` | Ouvre les notifications | `notification` |
| `HelpCircle` | Ouvre l'aide | `help` |
| `LogOut` | Déconnecte l'utilisateur (rouge) | — |

- **Long press (3 secondes)** sur `LogOut` : déconnexion silencieuse sans confirmation (pour les cas bloqués).
- Le badge rouge sur `Mail` indique les notifications non lues (`useNotificationBadge()`).
- `activeModal` est transmis pour mettre en surbrillance le bouton de la modale ouverte.

---

## 5. Le Quiz

### 5.1 QuizSessionView

**Fichier :** `components/Views/QuizSessionView.tsx`

Gère le cycle de vie complet d'une session quiz :
- **Loading** → **En cours** → **Confirmation de soumission** → **Résumé**
- Navigation clavier : `ArrowRight` (si répondu), `ArrowLeft`
- Modale de confirmation si des questions sont sans réponse
- Passage en mode révision après soumission (`startReview`)
- Réessai des mauvaises réponses (`retryMistakes`)

**Props clés :**
- `onSubmitScore(score, total, answersSnapshot)` — remonte le score vers `useGlobalProgress`
- `onSaveProgress(index, history, totalQuestions)` — sauvegarde mid-session

### 5.2 useQuizLogic

**Fichier :** `hooks/useQuizLogic.ts`

Cerveau du quiz. Gère :
- Chargement des questions via `quizService`
- Timer par question (`timeLimit` en secondes)
- Validation d'une réponse → mise à jour de `results`
- Calcul du score final
- États : `'loading' | 'active' | 'summary' | 'error'`

### 5.3 QuizCore

**Fichier :** `components/Quiz/QuizCore.tsx`

Rendu d'une question individuelle :
- Timer visuel `TimerDisplay` (rouge si ≤ 20% du temps)
- Affichage du prompt LaTeX via `MathRenderer`
- Délégation vers le bon sous-composant selon le type
- Phrases de feedback après validation (aléatoires, 6 variantes correct / 6 incorrect)

### 5.4 Types de questions

| Type | Composant | Description |
|---|---|---|
| `mcq` | `QuizOptions` | QCM avec 3-4 choix (A, B, C, D) |
| `boolean` | `QuizOptions` | Vrai ou Faux |
| `order` | `QuizOrderQuestion` | Remettre des éléments dans l'ordre |
| `error` | `QuizErrorQuestion` | Identifier l'étape incorrecte dans un raisonnement |
| `input` | `QuizCore` inline | Saisie libre d'une réponse courte |

**Structure `QuizQuestion` :**
```ts
interface QuizQuestion {
  id: string;
  type: 'mcq' | 'boolean' | 'order' | 'error' | 'input';
  prompt: string;           // LaTeX supporté
  explanation?: string;     // Affiché après validation
  timeLimit?: number;       // Secondes (0 = sans limite)
  difficulty?: string;
  options?: QuizOption[];   // Pour mcq/boolean
  items?: { id, content }[];  // Pour order
  steps?: { id, text, isError, correction }[];  // Pour error
  correctAnswers?: string[];  // Pour input
  groupId?: string;         // Questions groupées (prompt partagé)
}
```

---

## 6. Les Exercices

### 6.1 ExerciseSessionView

**Fichier :** `components/Views/ExerciseSessionView.tsx`

Vue complète d'une session d'exercices :
- Filtre les exercices du chapitre courant
- Navigation entre exercices (prev/next) avec animation de transition
- Support du swipe tactile (geste horizontal)
- Bouton d'impression `PrintableChapterExercises` (mode paysage, sans UI)
- Mode examen (`isExamenMode`) : reçoit des exercices pré-chargés via `preloadedExercises`

**Système de feedback (`EvaluationBar`) :**

Chaque exercice expose deux actions dans la barre de validation :

| Bouton | Valeur enregistrée | Comportement |
|---|---|---|
| **Valider l'exercice** | `'high'` | Ouvre un champ HH:MM pour saisir la durée travaillée, puis appelle `onEvaluate('high', duration)` |
| **Passer** | `'skipped'` | Enregistre directement `onEvaluate('skipped', 0)` sans saisie de durée |

Il n'y a plus de choix `medium` ou `low` dans l'interface. Le type `MasteryLevel` conserve ces valeurs dans `types.ts` pour la compatibilité ascendante (anciennes données) mais elles ne sont plus proposées à l'utilisateur.

**Saisie de durée :**  
Lorsque l'élève clique sur "Valider", un widget HH:MM apparaît (inputs `heures` et `minutes` avec focus automatique). Il peut confirmer avec `✓` ou ignorer la durée avec `✗` (appelle `onEvaluate('high', null)`). La durée est ensuite stockée dans `exerciseDurations[exerciseId]` (en minutes).

### 6.2 useExerciseData

**Fichier :** `hooks/useExerciseData.ts`

Charge les exercices JSON depuis `/public/data/{classId}/...` via `contentService`. Retourne :
- `exercises` — liste complète des exercices de la classe
- `loading` — booléen de chargement
- `loadErrors` — erreurs JSON/réseau détaillées
- `progressStats` — `{ total, completed, percentage }`

### 6.3 ExerciseArticle et sous-composants

**Fichier :** `components/Exercise/ExerciseArticle.tsx`

Article complet d'un exercice avec :
- En-tête : numéro, thème, contexte, badge source examen
- Corps : questions et sous-questions imbriquées
- Bouton d'indice `HintButton` / panneau `HintPanel`
- Rendu du texte enrichi `RichText` (LaTeX + markdown)
- Graphes associés `GraphThumbnail`

**Sous-composants :**

| Composant | Rôle |
|---|---|
| `ContextBlock` | Affiche un contexte narratif avant les questions |
| `ExerciseBadge` | Badge coloré (source: examen, DS, chapitre) |
| `HintButton` | Bouton "Indice" (compte le nombre de demandes) |
| `HintPanel` | Panneau déroulant des indices |
| `PartHeader` | En-tête de partie (Partie I, II, etc.) |
| `QuestionNumber` | Numéro de question stylisé |
| `QuestionRenderer` | Orchestre le rendu d'une question (texte + sous-questions) |
| `RichText` | Texte LaTeX/Markdown → HTML avec `katexService` |
| `SessionTimer` | Indicateur de statut d'une session DS : **EN DIRECT** (dans les 2h), **À venir** (date future), **Terminé** — s'active uniquement si l'exercice a un champ `sessionDate` |
| `SubQuestionLabel` | Étiquette de sous-question (a, b, c...) |
| `TextBlock` | Bloc de texte simple |
| `PrintButton` | Déclencheur d'impression |

### 6.4 ExerciseEngine

**Fichier :** `components/Exercise/engine/ExerciseEngine.ts`

Moteur de logique pur (sans React) qui gère :
- La structure hiérarchique question → sous-questions
- Le calcul de progression par exercice
- La validation de l'état `isCompleted`

---

## 7. La Révision (Fiche de cours)

### 7.1 RevisionView

**Fichier :** `components/Views/RevisionView.tsx`

Rendu d'une fiche de cours JSON avec :
- Filtrage des blocs selon les réglages de visibilité (`AppSettings`)
- Numérotation globale automatique des blocs (définitions, théorèmes, etc.)
- Table des matières `TableOfContents` (sticky, navigation par section)
- Panneau de sommaire unique avec recherche et navigation par section
- Calcul et remontée du `revisionProgress` en temps réel via `computeRevisionProgress`
- Sauvegarde des blancs révélés (`onSaveBlank`)

**Structure JSON d'une fiche :**
```json
{
  "header": { "title", "subtitle", "context" },
  "sections": [
    {
      "id": "section_id",
      "category": "course | method",
      "title": "...",
      "blocks": [ { "type": "...", "content": "...", ... } ]
    }
  ]
}
```

### 7.2 useRevisionSheet

**Fichier :** `hooks/useRevisionSheet.ts`

Charge le fichier JSON de révision via `contentService.fetchRevisionSheet(path)`. Gère le cache et les erreurs de schéma.

### 7.3 Blocs de révision

Types de blocs disponibles dans une section :

| Type | Rendu visuel | Filtrable |
|---|---|---|
| `intro` | Texte d'introduction + image float | Non |
| `definition` | Encadré bleu numéroté | Non |
| `theorem` | Encadré violet numéroté | Non |
| `property` | Encadré vert | Non |
| `method` | Encadré orange avec étapes | Oui (`visibility.method`) |
| `example` | Encadré exemple | Oui (`visibility.example`) |
| `application` | Exercice d'application avec `\blank{}` et `\question{}` | Oui |
| `warning` | Encadré rouge "Point de vigilance" | Non |
| `remark` / `note` | Encadré gris remarque | Oui (`visibility.remark`) |
| `proof` | Démonstration dépliable | Oui (`visibility.proof`) |
| `exploration` | Activité interactive | Oui (`visibility.exploration`) |
| `intuition` | Explication intuitive | Oui (`visibility.intuition`) |
| `summary` | Tableau récapitulatif | Oui (`visibility.summary`) |
| `text` | Texte libre | Non |

> **Types retirés de la taxonomie** : `method_principle`, `method_steps` et
> `method_example` n'étaient utilisés nulle part dans les données et n'avaient
> ni style ni libellé — ils étaient rendus comme du texte libre. Ils ont été
> supprimés de `REVISION_BLOCK_TYPES` (source unique : `src/types.ts`).
>
> Le type `culture` est documenté dans certains guides de rédaction mais **n'est
> pas implémenté** : ni `ENV_LABELS`, ni `ENV_STYLES`, ni réglage de visibilité.
> Un bloc `"type": "culture"` s'affiche donc comme du texte libre — utiliser
> `remark` (ou `intuition`) en attendant une implémentation.

**Macros LaTeX spéciales dans les blocs :**

| Macro | Rendu |
|---|---|
| `\blank{texte}` | Texte caché (case à remplir), révélable au clic |
| `\question{texte}` | Texte en couleur de question |
| `\mathqst{texte}` | Mot-clé mis en valeur dans un titre |
| `\objectif{texte}` | Objectif en couleur accent |
| `\defi{texte}` | Terme de défi |
| `\savant{nom}` | Nom de scientifique stylisé |
| `\textbf{texte}` | Gras |
| `\itemsize{texte}` | Item de liste |

### 7.4 Visibilité des blocs

**Interface `RevisionBlockVisibilitySettings` :**
```ts
{
  method?: boolean;
  example?: boolean;
  proof?: boolean;
  remark?: boolean;
  note?: boolean;
  intuition?: boolean;
  summary?: boolean;
  culture?: boolean;
  exploration?: boolean;
}
```

Les réglages sont configurables dans la `SettingsModal` et persistés dans `AppSettings`. La catégorie `method` d'une section entière est également filtrée si `visibility.method === false`.

---

## 8. Les Modales

Toutes les modales sont montées dans `DashboardView` et contrôlées par `activeModal`.

| Modal | Fichier | Rôle |
|---|---|---|
| `OrientationModal` | `Modals/OrientationModal.tsx` | Sélection du mode (scolaire / concours) et de la classe |
| `HelpModal` | `Modals/HelpModal.tsx` | Guide d'utilisation de l'application |
| Ancienne `NotificationModal` | Supprimée lors du nettoyage du 16/11/2026 | Aucun consommateur ; les services push et le panneau administrateur restent présents |
| `SettingsModal` | `Modals/SettingsModal.tsx` | Réglages de visibilité des blocs, thème, profil |
| `ConcoursOrientationModal` | `Modals/ConcoursOrientationModal.tsx` | Orientation spécifique au mode concours |

**Gestion de l'URL :**
- L'ouverture d'une modale pousse `#modal-{id}` dans l'historique.
- Le retour natif ferme la modale (via `popstate`).

---

## 9. Données et services — De A à Z

### 9.1 Types globaux (`types.ts`)

**Fichier :** `types.ts`

Types principaux :

```ts
// Profil utilisateur
interface UserProfile {
  name: string;
  firstName?: string;
  classId: string;       // ex: "2bac-sc-ex"
  className: string;
  uniqueId?: string;     // UUID pour isoler les données
  mode?: 'scolaire' | 'concours';
}

// Progression d'un chapitre
interface ChapterProgress {
  revisionProgress: number;          // 0-100
  lastActiveSection?: string;
  revealedBlanks?: string[];         // IDs des blancs révélés
  masteredSkills?: string[];         // IDs des compétences cochées
  quiz: {
    isSubmitted: boolean;
    score: number;
    highScore: number;
    attempts: number;
    history?: QuizResult[];
    durationSeconds?: number;
  };
  exercises: Record<string, {
    isCompleted: boolean;
    mastery: MasteryLevel;           // 'high'|'medium'|'low'|'skipped'|null
    lastHintIndex?: number;
  }>;
  exerciseFeedback?: Record<string, MasteryLevel>;  // valeurs effectives: 'high' | 'skipped'
  exerciseDurations?: Record<string, number | null>; // durée en minutes (null = non renseignée)
  isChapterSubmitted?: boolean;
  submittedAt?: number;
}

// État global de l'application
interface GlobalState {
  version: string;
  user: UserProfile | null;
  progress: Record<string, ChapterProgress>;  // Clé = "{classId}_{chapterId}"
  xp: number;
  streak: number;
  lastActive: number;
}
```

**Clé de progression scopée :**  
La progression est indexée par `{classId}_{chapterId}` (ex: `2bac-sc-ex_ch01`). Cela permet à plusieurs profils sur le même appareil d'avoir des données isolées.

### 9.2 Stockage local (`storageService`)

**Fichier :** `services/storageService.ts`

Le stockage est **divisé en 4 tranches** dans `localStorage` pour éviter les micro-freezes :

| Clé localStorage | Contenu |
|---|---|
| `planet-math:app:v6.0` | Core : user, xp, streak, lastActive |
| `planet-math:progress:quiz:v1` | Quiz de tous les chapitres |
| `planet-math:progress:exercises:v1` | Exercices de tous les chapitres |
| `planet-math:progress:revision:v1` | Révision, blancs, compétences |

**Optimisations v6.0 :**
- Sérialisation différée via `requestIdleCallback` (évite les freezes UI)
- Debounce de 500ms avant écriture
- Les 4 tranches sont reconstituées au chargement via `buildProgressSlices()`

### 9.3 Synchronisation cloud (`cloudSyncService`)

**Fichier :** `services/cloudSyncService.ts`

Synchronise `localStorage` ↔ Upstash Redis via l'API `/api/progress`.

**Stratégie de merge (locale vs cloud) :**

| Dimension | Stratégie |
|---|---|
| `revisionProgress` | `Math.max(local, cloud)` |
| `quiz.score / highScore` | `Math.max(local, cloud)` |
| `quiz.attempts` | `Math.max(local, cloud)` |
| `quiz.isSubmitted` | `local \|\| cloud` |
| `quiz.history` | La liste la plus longue |
| `exercises` | Union : exercice complété si l'un ou l'autre |
| `exerciseFeedback` | Meilleur mastery (high > medium > low > skipped) |
| `revealedBlanks / masteredSkills` | Union des deux tableaux (dédupliqué) |
| `isChapterSubmitted` | `local \|\| cloud` |

**Déclencheurs de sync :**
- Toutes les 3 minutes (sync périodique)
- Debounce 15s après chaque modification
- `beforeunload` : via `navigator.sendBeacon` (survit à la fermeture d'onglet)
- `visibilitychange` (mobile : app en arrière-plan)

### 9.4 API Vercel (`/api/`)

Fonctions serverless déployées sur Vercel :

| Fichier | Méthode | Rôle |
|---|---|---|
| `/api/progress.ts` | GET / POST | Lecture et écriture de la progression dans Redis avec deep merge |
| `/api/users.ts` | POST | Inscription d'un nouvel utilisateur + email de confirmation |
| `/api/send-email.ts` | POST | Envoi de rapports par email via Resend |
| `/api/push.ts` | POST | Envoi de notifications push Web Push |
| `/api/cron/` | — | Jobs planifiés (nettoyage, rappels) |

**Variables d'environnement requises :**
```
KV_REST_API_URL          ← Upstash Redis URL
KV_REST_API_TOKEN        ← Upstash Redis token
RESEND_API_KEY           ← API key Resend (emails)
```

**Format de la clé Redis :**
```
progress:{uniqueId}      ← progression complète de l'utilisateur
```

### 9.5 Chargement du contenu (`contentService`)

**Fichier :** `services/contentService.ts`

Charge les fichiers JSON de contenu depuis `/public/data/` :

```
/public/data/
  manifest.json                ← Manifeste racine (liste des classes)
  {classId}/
    class.json                 ← Liste des chapitres, métadonnées
    {chapterId}/
      exercises/
        {exercise}.json        ← Exercice individuel
      revisions/
        {fiche}.json           ← Fiche de révision
      quiz/
        {quiz}.json            ← Questions de quiz
```

**Cache multi-niveau :**
1. Cache JS en mémoire (Map) — le plus rapide
2. Cache API (`caches.open('mathplus-data-cache-v7')`) — survit aux rechargements
3. Réseau — uniquement si absent du cache

**Stratégie Stale-While-Revalidate :**  
La réponse du cache est servie immédiatement, et le réseau met à jour le cache en arrière-plan.

**Validation de schéma :**  
Chaque fichier chargé est validé (`validateExerciseSchema`, `validateRevisionSchema`). Les erreurs lancent une `ContentError` typée (`JSON_SYNTAX`, `SCHEMA_VALIDATION`, `NETWORK`, `LATEX_STRUCTURE`).

**Résolution des chemins média :**  
Les chemins relatifs dans les `src` des médias (images, vidéos) sont automatiquement résolus par rapport au chemin du fichier JSON parent.

### 9.6 Progression globale (`useGlobalProgress`)

**Fichier :** `hooks/useGlobalProgress.ts`

Hook central qui expose toutes les mutations de l'état :

| Fonction | Rôle |
|---|---|
| `login(user)` | Connecte l'utilisateur, charge le cloud, migre les clés |
| `logout()` | Réinitialise l'état local |
| `submitQuiz(score, total, snapshot)` | Enregistre le résultat final du quiz |
| `saveQuizProgress(index, history, total)` | Sauvegarde mid-session |
| `updateExerciseProgress(uniqueId, mastery)` | Met à jour la maîtrise d'une sous-question |
| `updateExerciseFeedback(exerciseId, mastery, duration)` | Feedback global sur un exercice |
| `updateRevisionProgress(chapterId, pct, sectionId)` | Met à jour le % de révision lu |
| `saveRevealedBlank(blankId)` | Mémorise un blanc révélé dans la fiche |
| `toggleSkillMastery(skillId, mastered)` | Coche/décoche une compétence |
| `updateProfile(updates)` | Modifie le profil utilisateur |

**Isolation multi-profil :**  
Toutes les clés de progression sont préfixées par `{classId}_` via `scopeKey()`. Au login, les anciennes clés non-scopées sont migrées automatiquement.

**Sync cross-onglets :**  
Le `profileBroadcast` (BroadcastChannel API) propage les changements de profil entre les onglets ouverts.

---

## 10. Flux complet d'une session utilisateur

```
1. CHARGEMENT
   index.html → sw.js (service worker) → App.tsx
   storageService.loadState() → state initial
   if (state.user) → vue 'dashboard', sinon 'login'

2. LOGIN
   LoginView → onLogin(user)
   useGlobalProgress.login()
     → cloudSyncService.loadFromCloud(uniqueId)
     → merge local + cloud
     → setState (GlobalState mis à jour)
   App.tsx : view → 'dashboard'

3. DASHBOARD
   useDashboardData(classId) → contentService.fetchClassData()
   → chapters[] affichés dans ChapterModule
   ControlBlade : accès aux modales (Réglages, Orientation, Notifications, Aide)

4. RÉVISION (Leçon)
   ChapterModule.onOpenRevision(path)
   → useAppNavigation.handleOpenRevision()
   → view = 'revision'
   RevisionView : useRevisionSheet(path)
     → contentService.fetchRevisionSheet()
     → rendu des blocs filtrés
   Progression : computeRevisionProgress() → updateRevisionProgress()

5. QUIZ
   ChapterModule.onStartQuiz()  [débloqué si révision ≥ 10%]
   → view = 'quiz'
   QuizSessionView : useQuizLogic()
     → quizService.loadQuestions(chapterId)
     → timer par question
     → validation → results[]
   Soumission : onSubmitScore() → useGlobalProgress.submitQuiz()

6. EXERCICES
   ChapterModule.onStartSession()  [débloqué si quiz ≥ 50% ou soumis]
   → view = 'session'
   ExerciseSessionView : useExerciseData()
     → contentService.fetchExercises(classId, chapterId)
     → navigation prev/next entre exercices
   Feedback : onFeedbackUpdate(id, mastery) → updateExerciseFeedback()

7. SAUVEGARDE AUTOMATIQUE
   Chaque mutation → storageService.saveState() (debounce 500ms, idle callback)
   Toutes les 3min → cloudSyncService.forceSave() → POST /api/progress
   beforeunload → cloudSyncService.beaconSave() (sendBeacon)

8. DÉCONNEXION
   ControlBlade → onLogout()
   useGlobalProgress.logout() → state réinitialisé
   view = 'login'
```

---

## Résumé des fichiers clés

| Fichier | Rôle |
|---|---|
| `App.tsx` | Racine, routing par `view` |
| `types.ts` | Tous les types TypeScript |
| `hooks/useGlobalProgress.ts` | État global + mutations |
| `hooks/useAppNavigation.ts` | Machine d'états des vues |
| `hooks/useAppSettings.ts` | Réglages d'affichage |
| `hooks/useQuizLogic.ts` | Logique quiz (timer, résultats) |
| `hooks/useExerciseData.ts` | Chargement exercices |
| `hooks/useRevisionSheet.ts` | Chargement fiche révision |
| `hooks/useDashboardData.ts` | Chargement données dashboard |
| `services/storageService.ts` | localStorage en 4 tranches |
| `services/cloudSyncService.ts` | Sync Redis bi-directionnelle |
| `services/contentService.ts` | Fetch JSON + cache + validation |
| `services/quizService.ts` | Chargement questions quiz |
| `api/progress.ts` | API serverless : progression Redis |
| `api/users.ts` | API serverless : inscription + email |
| `components/Views/DashboardView.tsx` | Dashboard principal |
| `components/Views/QuizSessionView.tsx` | Session quiz |
| `components/Views/ExerciseSessionView.tsx` | Session exercices |
| `components/Views/RevisionView.tsx` | Fiche de révision |
| `components/Dashboard/ChapterModule.tsx` | Carte de chapitre |
| `components/Dashboard/DashboardSectionTabs.tsx` | Onglets du dashboard |
| `components/UI/ControlBlade.tsx` | Sidebar (réglages, logout...) |
| `components/Quiz/QuizCore.tsx` | Rendu d'une question quiz |
| `components/Exercise/ExerciseArticle.tsx` | Article d'exercice complet |
| `components/Revision/RevisionSectionBlock.tsx` | Section de fiche |
