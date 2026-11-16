# Guide — Base de Données & Classes (MathPlus V1.003)

> Source de vérité unique sur les classes, les identifiants, les fonctionnalités disponibles par classe, et la structure complète du dossier `/public/data/`.

---

## 1. Vue d'ensemble du système de données

Toutes les données statiques de contenu (chapitres, exercices, quiz, révisions, DS, examens, problèmes, olympiades, concours) sont servies depuis `/public/data/` sous forme de fichiers JSON.

Le point d'entrée racine est **`/public/data/manifest.json`** : il liste les 5 classes et les 3 concours de grandes écoles. Chaque classe pointe vers son fichier de définition dans `data/classes/<classId>.json`.

```
/public/data/
├── manifest.json           ← Racine : liste des classes + concours
├── classInfo.json          ← Métadonnées d'affichage (coefficient, heures, évaluations)
├── olympiad-index.json     ← Index global des olympiades (toutes classes)
├── quizzes/                ← Quizzes globaux hors-classe
│   └── quiz_limites.json
├── classes/                ← Fichiers de définition par classe
│   ├── tronc-commun-sc.json
│   ├── 1ere-bac-sc-ex.json
│   ├── 1ere-bac-sc-math.json
│   ├── 2eme-bac-sc-ex.json
│   └── 2eme-bac-sc-math.json
├── tronc-commun-sc/        ← Contenu Tronc Commun
├── 1ere-bac-sc-ex/         ← Contenu 1ère Bac Sc. Ex.
├── 1ere-bac-sc-math/       ← Contenu 1ère Bac Sc. Math.
├── 2eme-bac-sc-ex/         ← Contenu 2ème Bac Sc. Ex.
├── 2eme-bac-sc-math/       ← Contenu 2ème Bac Sc. Math.
└── concours/               ← Annales ENSA / ENSAM / Médecine
    ├── schools.json
    ├── ensa/
    ├── ensam/
    └── medecine/
```

---

## 2. Les 5 Classes — Identifiants & Caractéristiques

| `classId` | Titre complet | Coefficient | Heures/semaine | DS | Examen National |
|---|---|---|---|---|---|
| `tronc-commun-sc` | Tronc Commun Scientifique | 4 | 5h | 3–4 DS | ✗ |
| `1ere-bac-sc-ex` | 1ère Bac Sciences Expérimentales | 7 | 5h | 3 DS | ✗ |
| `1ere-bac-sc-math` | 1ère Bac Sciences Mathématiques | 9 | 7–8h | 4 DS | ✗ |
| `2eme-bac-sc-ex` | 2ème Bac Sciences Expérimentales | 7 | 5h | 3 DS | ✓ (coeff. 7) |
| `2eme-bac-sc-math` | 2ème Bac Sciences Mathématiques | 9 | 8–9h | 4 DS | ✓ (coeff. 9) |

> Source : `public/data/classInfo.json` et `public/data/manifest.json`

---

## 3. Tableau Comparatif des Fonctionnalités par Classe

| Fonctionnalité | `tronc-commun-sc` | `1ere-bac-sc-ex` | `1ere-bac-sc-math` | `2eme-bac-sc-ex` | `2eme-bac-sc-math` |
|---|:---:|:---:|:---:|:---:|:---:|
| Cours & Révisions | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exercices | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quiz | ✅ | ✅ | ✅ | ✅ | ✅ |
| DS (Devoirs Surveillés) | ✅ (données OK) | ⚠️ (index seul) | ✅ (données OK) | ✅ (données OK) | ⚠️ (pas de dossier ds/) |
| Examen National | ✗ | ✗ | ✗ | ✅ 2017–2025 | ✅ 2024 |
| Problèmes enrichis | ✗ | ✗ | ✅ 14 problèmes | ⚠️ (données mais UI off) | ✅ 1 problème |
| Olympiades | ✅ 2014–2025 | ✗ | ✅ 2014–2025 | ✗ | ✗ |
| Cadre Référentiel | ✗ | ✗ | ✗ | ✅ | ✅ |

> **⚠️ = données partielles ou désactivées côté service**

### Logique de détection dans le code (`useDashboardData.ts`)

```typescript
const is2bac = ['2eme-bac-sc-ex', '2eme-bac-sc-math'].includes(classId);
const hasDs = ['tronc-commun-sc', '1ere-bac-sc-math', '1ere-bac-sc-ex', '2eme-bac-sc-ex', '2eme-bac-sc-math'].includes(classId);
const hasExamen = is2bac;
const hasOlympiad = ['tronc-commun-sc', '1ere-bac-sc-math'].includes(classId);
```

```typescript
// problemeService.ts
isSupported(classId: string): boolean {
  return ['1ere-bac-sc-math', '2eme-bac-sc-math'].includes(classId);
}
```

```typescript
// olympiadService.ts — path override (1ere-bac-sc-math pointe sur 1er-bac-sc-math/)
const olympiadDataPath: Record<string, string> = {
  '1ere-bac-sc-math': '1er-bac-sc-math',   // ← dossier physique différent du classId !
  'tronc-commun-sc': 'tronc-commun-sc',
};
```

---

## 4. Détail par Classe

### 4.1 Tronc Commun Scientifique (`tronc-commun-sc`)

**Dossier :** `public/data/tronc-commun-sc/`

#### Chapitres

| `chapterId` | Titre | Section |
|---|---|---|
| `arithmetique-n` | Arithmétique dans ℕ | algebre-geometrie |
| `ensembles-nombres` | Les ensembles de nombres | algebre-geometrie |
| `ordre-ir` | L'ordre dans ℝ | algebre-geometrie |
| `polynomes` | Les polynômes | algebre-geometrie |
| `equations-inequations` | Équations et inéquations | algebre-geometrie |
| `calcul-vectoriel` | Calcul vectoriel | algebre-geometrie |
| `droite-plan` | Droite dans le plan | algebre-geometrie |
| `projection-plan` | Projections dans le plan | algebre-geometrie |
| `produit-scalaire` | Produit scalaire | algebre-geometrie |
| `transformations-plan` | Transformations du plan | algebre-geometrie |
| `calcul-trigo` | Calcul trigonométrique | algebre-geometrie |
| `geometrie-espace` | Géométrie dans l'espace | algebre-geometrie |
| `generalites-fonctions` | Généralités sur les fonctions | analyse |
| `statistiques` | Statistiques | analyse |

**Structure d'un chapitre :**
```
tronc-commun-sc/<chapterId>/
├── manifest.json       ← index exercices + quizzes
├── exercises/          ← fichiers ex_01.json, ex_02.json...
├── quiz/               ← <chapterId>_quiz.json
└── revisions/          ← fiche_<ch>_cours.json
```

#### Devoirs Surveillés — Données disponibles ✅

```
ds/
├── index.json          ← liste tous les DS par semestre
├── semestre1/
│   ├── ds1_v1.json     (thèmes : ensembles, ordre dans ℝ)
│   ├── ds2_v1.json     (thèmes : polynômes, équations)
│   └── ds3_v1.json     (thèmes : calcul vectoriel, droite plan)
└── semestre2/
    ├── ds1_v1.json     (thèmes : calcul trigo, produit scalaire)
    ├── ds2_v1.json     (thèmes : ...)
    └── ...
```

#### Olympiades — Données disponibles ✅

```
olympiad/
├── manifest.json       ← index (12 années)
├── 2014.json ... 2025.json
```
- Années couvertes : **2014 à 2025** (12 épreuves)
- Badges : `national` (Maroc) et `international` (IMO)
- Durée : 180–240 min | 20–42 points
- **Note :** chemin physique = `tronc-commun-sc/olympiad/` (identique au classId)

---

### 4.2 1ère Bac Sciences Expérimentales (`1ere-bac-sc-ex`)

**Dossier :** `public/data/1ere-bac-sc-ex/`

#### Chapitres

| `chapterId` | Titre |
|---|---|
| `logique` | La logique mathématique |
| `generalites-fonctions` | Généralités sur les fonctions numériques |
| `suites` | Les suites numériques |
| `derivation` | Dérivation |
| `etude-fonctions` | Étude de fonctions |
| `limites` | Limites |
| `calcul-trigo` | Calcul trigonométrique |
| `produit-scalaire-plan` | Produit scalaire dans le plan |
| `produit-scalaire-espace` | Produit scalaire dans l'espace |
| `barycentre` | Le barycentre |
| `rotation-plan` | Rotation dans le plan |
| `vecteurs-espace` | Vecteurs dans l'espace |

**Structure d'un chapitre :**
```
1ere-bac-sc-ex/<chapterId>/
├── manifest.json       ← { exercises: [...], quizzes: [...], quizCount }
├── exercises/          ← ex_01.json, ex_02.json...
└── quiz/               ← <chapterId>_quiz.json
```
> **Pas de `revisions/`** dans les chapitres de cette classe (pas de section dans `classes/1ere-bac-sc-ex.json`).

#### Devoirs Surveillés — Index uniquement ⚠️

```
ds/
└── index.json          ← définit S1 (2 DS) + S2 (1 DS), exerciseCount: 0
```
- Les dossiers `semestre1/` et `semestre2/` **n'existent pas encore** physiquement.
- Les chemins sont déclarés dans l'index mais les JSON de DS ne sont pas créés.

| Semestre | DS définis | Thèmes déclarés |
|---|---|---|
| S1 – DS1 | V1 | Logique, Généralités fonctions |
| S1 – DS2 | V1 | Barycentre, Produit scalaire |
| S2 – DS1 | V1 | Suites numériques, Dérivation |

---

### 4.3 1ère Bac Sciences Mathématiques (`1ere-bac-sc-math`)

**Dossier :** `public/data/1ere-bac-sc-math/`

#### Chapitres

| `chapterId` | Titre | Section |
|---|---|---|
| `logique` | Logique et raisonnements mathématiques | algebre-geometrie |
| `ensembles-app` | Ensembles et applications | algebre-geometrie |
| `arithmetique` | Arithmétique | algebre-geometrie |
| `barycentre` | Le barycentre dans le plan | algebre-geometrie |
| `produit-scalaire` | Produit scalaire dans le plan | algebre-geometrie |
| `produit-scalaire-espace` | Produit scalaire dans l'espace | algebre-geometrie |
| `produit-vectoriel` | Produit vectoriel | algebre-geometrie |
| `vecteurs-espace` | Vecteurs dans l'espace | algebre-geometrie |
| `rotation` | Rotations | algebre-geometrie |
| `denombrement` | Dénombrement | algebre-geometrie |
| `generalites-fonctions` | Généralités sur les fonctions numériques | analyse |
| `limites` | Limites | analyse |
| `derivation` | Dérivation | analyse |
| `etude-fonctions` | Étude de fonctions | analyse |
| `suites` | Suites numériques | analyse |
| `trigonometrie` | Trigonométrie | analyse |

**Structure d'un chapitre :**
```
1ere-bac-sc-math/<chapterId>/
├── manifest.json
├── exercises/
├── quiz/
└── revisions/              ← fiche_<ch>_cours.json
```

#### Devoirs Surveillés — Données complètes ✅

```
ds/
├── index.json
├── semestre1/
│   ├── ds1_v1.json     (logique, ensembles et applications)
│   ├── ds2_v1.json     (généralités fonctions, limites)
│   └── ds3_v1.json     (dérivation, barycentre)
└── semestre2/
    ├── ds1_v1.json     (suites, trigonométrie)
    ├── ds2_v1.json     (...)
    └── ds3_v1.json     (...)
```

#### Problèmes enrichis — 14 problèmes ✅

```
problemes/
├── index.json
├── prob_fleche.json            — Trajectoire parabolique (analyse, moyen)
├── prob_empreintes.json        — Empreintes digitales (dénombrement, moyen)
├── prob_lacet.json             — Combinatoire lacets (dénombrement, facile)
├── prob_mille_feuille.json     — Suites géométriques (suites, facile)
├── prob_materiau_enroule.json  — Suites arithmétiques (suites, moyen)
├── prob_phares.json            — Parabole/réflexion (analyse, difficile)
├── prob_planeur.json           — Planeurs (analyse)
├── prob_poissons.json          — Probabilités (probabilites)
├── prob_population.json        — Modélisation (suites)
├── prob_robots.json            — Combinatoire (dénombrement)
├── prob_temperature.json       — Analyse (analyse)
├── prob_virus.json             — Probabilités (probabilites)
├── prob_pascal_fermat.json     — Histoire des maths (probabilites)
└── prob_drones.json            — Vecteurs (vecteurs)
```

Thèmes déclarés dans l'index : `suites`, `vecteurs`, `denombrement`, `probabilites`, `analyse`

#### Olympiades — 12 épreuves ✅

```
olympiad/                       ← physiquement dans data/1er-bac-sc-math/olympiad/
├── manifest.json
├── 2014.json ... 2025.json
```
> ⚠️ **Attention au chemin :** le `classId` est `1ere-bac-sc-math` mais le dossier physique est `1er-bac-sc-math/` (sans le `e`). Le service corrige via `olympiadDataPath`.

- Années couvertes : **2014 à 2025** (12 épreuves)

---

### 4.4 2ème Bac Sciences Expérimentales (`2eme-bac-sc-ex`)

**Dossier :** `public/data/2eme-bac-sc-ex/`

#### Chapitres

| `chapterId` | Titre | Section |
|---|---|---|
| `continuite` | Continuité d'une fonction numérique | analyse |
| `derivation-etude-fonctions` | Dérivation et étude de fonctions | analyse |
| `suites` | Les suites numériques | analyse |
| `logarithmes` | Les fonctions logarithmiques | analyse |
| `exponentielles` | Les fonctions exponentielles | analyse |
| `fonctions-primitives` | Fonctions primitives | analyse |
| `calcul-integral` | Calcul intégral | analyse |
| `equations-diff` | Équations différentielles | analyse |
| `etude-fonctions` | Étude de fonctions (générale) | analyse |
| `primitives` | Primitives | analyse |
| `complexes` | Nombres complexes | algebre-geometrie |
| `probabilites` | Probabilités | probabilites |
| `geometrie-espace` | Géométrie dans l'espace | geometrie |
| `geometrie-analytique-espace` | Géométrie analytique dans l'espace | geometrie |

**Structure d'un chapitre :**
```
2eme-bac-sc-ex/<chapterId>/
├── manifest.json
├── exercises/
├── quiz/
└── revisions/              ← fiche_<ch>_cours.json
```

#### Devoirs Surveillés — Données complètes ✅

```
ds/
├── index.json
├── semestre1/
│   ├── ds1_v1.json     (continuité, dérivabilité)
│   ├── ds1_v2.json     (continuité, dérivabilité — version 2)
│   ├── ds2_v1.json     (suites numériques, logarithmes)
│   └── ds3_v1.json     (exponentielles, fonctions primitives)
└── semestre2/
    ├── ds1_v1.json
    ├── ds2_v1.json
    └── ds3_v1.json
```
- S1 : 4 devoirs (DS1 avec 2 versions, DS2 et DS3)
- S2 : 3 devoirs
- Durée : 120 min | 20 points chacun

#### Examen National — 18 annales (2017–2025) ✅

```
examen/
├── index.json                  ← liste + thèmes de distribution
├── cadre_referentiel.json      ← référentiel officiel (format RevisionSheet)
├── nat_2017_normale.json
├── nat_2017_rattrapage.json
├── nat_2018_normale.json
├── nat_2018_rattrapage.json
...
├── nat_2024_normale.json
├── nat_2024_rattrapage.json
├── nat_2025_normale.json
└── nat_2025_rattrapage.json
```

> Présence également d'un dossier `examens/` (résidu) contenant uniquement `cadre_referentiel.json`.

**Distribution des thèmes (index.json) :**

| Thème | Nb par examen |
|---|---|
| Analyse (étude de fonctions) | 1 |
| Probabilités | 1 |
| Nombres Complexes | 1 |
| Géométrie dans l'Espace | 1 |
| Suites Numériques | (variable) |

#### Problèmes — 1 problème (UI désactivée) ⚠️

```
problemes/
├── index.json
└── prob_empreintes.json        — Empreintes digitales (dénombrement, moyen)
```
> `problemeService.isSupported('2eme-bac-sc-ex')` retourne **`false`** → la section Problèmes n'apparaît **pas** dans le Dashboard pour cette classe malgré les données.

---

### 4.5 2ème Bac Sciences Mathématiques (`2eme-bac-sc-math`)

**Dossier :** `public/data/2eme-bac-sc-math/`

#### Chapitres

| `chapterId` | Titre | Section |
|---|---|---|
| `limites-continuite` | Limites et continuité | analyse |
| `derivation-etude` | Dérivation et étude de fonctions | analyse |
| `fonctions-logarithmes` | Fonctions logarithmiques | analyse |
| `fonctions-exponentielles` | Fonctions exponentielles | analyse |
| `suites-numeriques` | Suites numériques | analyse |
| `calcul-integral` | Calcul intégral | analyse |
| `calcul-probabilites` | Calcul des probabilités | probabilites |
| `equations-differentielles` | Équations différentielles | analyse |
| `complexes` | Nombres complexes | algebre |
| `arithmetique` | Arithmétique | algebre |
| `structures-algebriques` | Structures algébriques | algebre |
| `groupe-anneau-corps` | Groupe, anneau, corps | algebre |
| `lois-composition-interne` | Lois de composition interne | algebre |
| `espaces-vectoriels-reels` | Espaces vectoriels réels | algebre |

**Structure d'un chapitre :**
```
2eme-bac-sc-math/<chapterId>/
├── manifest.json
├── exercises/
├── quiz/
└── revisions/
```

#### Devoirs Surveillés — Non disponibles ⚠️

> Le dossier `ds/` **n'existe pas** pour cette classe. Le hook `hasDs` l'inclut mais la requête `/data/2eme-bac-sc-math/ds/index.json` échoue silencieusement (`catch(() => null)`).

#### Examen National — 2 annales (2024 seulement) ✅

```
examen/
├── index.json                  ← { examens: [nat-sm-2024-n, nat-sm-2024-r] }
├── cadre_referentiel.json
├── nat_2024_normale.json
└── nat_2024_rattrapage.json
```

**Distribution des thèmes :**

| Thème |
|---|
| Analyse |
| Probabilités |
| Nombres Complexes |
| Géométrie dans l'Espace |
| Arithmétique |
| Algèbre & Structures |

#### Problèmes — 1 problème ✅

```
problemes/
├── index.json
└── prob_empreintes.json        — Empreintes digitales (dénombrement, moyen)
```

---

## 5. Concours Grandes Écoles

Les concours sont **indépendants des classes** et accessibles via la vue `concours-hub`. Ils sont définis dans `manifest.json` à la clé `"concours"` et dans `public/data/concours/schools.json`.

### Structure globale

```
public/data/concours/
├── schools.json        ← liste centralisée des 3 concours (icône, couleur, thèmes, annales)
├── ensa/
│   ├── manifest.json
│   ├── ensa_2019.json ... ensa_2023.json
│   └── quiz/
│       ├── ensa_analyse_quiz.json
│       ├── ensa_algebre_quiz.json
│       └── ensa_probabilites_quiz.json
├── ensam/
│   ├── manifest.json
│   ├── ensam_2019.json ... ensam_2023.json
│   └── quiz/
│       ├── ensam_analyse_quiz.json
│       ├── ensam_algebre_quiz.json
│       └── ensam_probabilites_quiz.json
└── medecine/
    ├── manifest.json
    ├── med_2012.json ... med_2023.json
    └── quiz/
        ├── med_analyse_quiz.json
        └── med_probabilites_quiz.json
```

### Tableau des concours

| `id` | Nom | Annales disponibles | Questions/examen | Temps/question | Thèmes |
|---|---|---|---|---|---|
| `ensa` | ENSA — Ecoles Nationales des Sciences Appliquées | 2019–2023 (5) | 30 | 45 s | Analyse, Algèbre & Géo, Probabilités |
| `ensam` | ENSAM — Arts et Métiers | 2019–2023 (5) | 30 | 45 s | Analyse, Algèbre, Probabilités |
| `medecine` | Faculté de Médecine et de Pharmacie | 2012–2023 (12) | 20 | 60 s | Analyse, Probabilités & Statistiques |

---

## 6. Structure Détaillée d'un Chapitre

Chaque chapitre dans un dossier de classe suit cette structure :

```
<classId>/<chapterId>/
├── manifest.json               ← Index du chapitre
├── exercises/
│   ├── ex_01.json              ← Exercice individuel
│   ├── ex_02.json
│   └── ...
├── quiz/
│   └── <chapterId>_quiz.json  ← Toutes les questions QCM du chapitre
└── revisions/                  ← Absent pour 1ere-bac-sc-ex
    └── fiche_<ch>_cours.json   ← Fiche de cours (RevisionSheet)
```

### `manifest.json` d'un chapitre

```json
{
  "id": "logique",
  "title": "La logique mathématique",
  "exercises": [
    { "id": "ex-logique-01", "path": "data/1ere-bac-sc-ex/logique/exercises/ex_01.json" },
    { "id": "ex-logique-02", "path": "data/1ere-bac-sc-ex/logique/exercises/ex_02.json" }
  ],
  "quizzes": [
    { "id": "quiz-logique-01", "path": "data/1ere-bac-sc-ex/logique/quiz/logique_quiz.json" }
  ],
  "quizCount": 6
}
```

---

## 7. Schémas des Fichiers JSON Clés

### 7.1 `manifest.json` (racine)

```json
{
  "meta": { "version": "4.4", "lastUpdated": "2026-04-01" },
  "classes": [
    { "id": "tronc-commun-sc", "title": "...", "path": "data/classes/tronc-commun-sc.json" }
  ],
  "concours": [
    { "id": "ensa", "name": "ENSA", "manifestPath": "data/concours/ensa/manifest.json" }
  ]
}
```

### 7.2 `classes/<classId>.json`

```json
{
  "id": "2eme-bac-sc-ex",
  "title": "2ème Bac Sciences Expérimentales",
  "chapters": [
    {
      "id": "continuite",
      "title": "Continuité d'une fonction numérique",
      "section": "analyse",
      "quizCount": 6,
      "session_dates": ["2025-12-22T20:00:00.000Z"],   ← optionnel (DS live)
      "manifestPath": "data/2eme-bac-sc-ex/continuite/manifest.json",
      "revisions": [
        {
          "path": "data/.../revisions/fiche_continuite_cours.json"
        }
      ],
      "quizzes": [
        { "id": "quiz-continuite-01", "path": "data/.../quiz/continuite_quiz.json" }
      ]
    }
  ]
}
```

> Le champ `session_dates` est utilisé par le composant `SessionTimer` pour afficher l'état EN DIRECT / À venir / Terminé d'un DS.

### 7.3 `ds/index.json`

```json
{
  "classId": "2eme-bac-sc-ex",
  "title": "Devoirs Surveillés — ...",
  "semestres": [
    {
      "id": "semestre1",
      "title": "Semestre 1",
      "devoirs": [
        {
          "id": "ds1-s1-v1",
          "title": "Devoir Surveillé N°1",
          "version": "V1",
          "number": 1,
          "semestre": 1,
          "duration": 120,
          "totalPoints": 20,
          "themes": ["continuité", "dérivabilité"],
          "path": "data/2eme-bac-sc-ex/ds/semestre1/ds1_v1.json",
          "exerciseCount": 2
        }
      ]
    }
  ]
}
```

### 7.4 `examen/index.json`

```json
{
  "classId": "2eme-bac-sc-ex",
  "title": "Examens Nationaux — Sciences Expérimentales",
  "themeDistribution": { "analyse": 1, "probabilites": 1, "nombres-complexes": 1, "geometrie-espace": 1 },
  "themes": [
    { "id": "analyse", "name": "Étude de fonctions" },
    { "id": "probabilites", "name": "Probabilités" }
  ],
  "examens": [
    {
      "id": "nat-2025-n",
      "title": "Session Normale 2025",
      "type": "national",
      "year": 2025,
      "session": "normale",
      "exerciseCount": 4,
      "path": "data/2eme-bac-sc-ex/examen/nat_2025_normale.json"
    }
  ]
}
```

### 7.5 `examen/<annale>.json` (ExamenData)

```json
{
  "id": "nat-2025-n",
  "title": "Examen National 2025 — Session Normale",
  "type": "national",
  "year": 2025,
  "session": "normale",
  "classId": "2eme-bac-sc-ex",
  "duration": 180,
  "coefficient": 7,
  "totalPoints": 20,
  "exercises": [
    {
      "id": "ex-nat-2025-n-01",
      "number": 1,
      "theme": "analyse",
      "difficulty": "moyen",
      "points": 5,
      "topic": "Étude d'une fonction",
      "context": "...",
      "questions": [
        {
          "id": "q1",
          "content": "...",
          "bareme": 1,
          "subQuestions": [...]
        }
      ]
    }
  ]
}
```

### 7.6 `problemes/index.json`

```json
{
  "classId": "1ere-bac-sc-math",
  "title": "Problèmes — 1ère Bac Sciences Mathématiques",
  "themes": [
    { "id": "suites", "name": "Suites" },
    { "id": "denombrement", "name": "Dénombrement" }
  ],
  "problemes": [
    {
      "id": "prob-fleche",
      "title": "La flèche atteindra-t-elle la cible ?",
      "subtitle": "Problème 1.1 — Trajectoire parabolique",
      "theme": "analyse",
      "difficulty": "moyen",
      "path": "data/1ere-bac-sc-math/problemes/prob_fleche.json"
    }
  ]
}
```

> Le contenu d'un problème (`prob_*.json`) est au format **RevisionSheet** (même schéma que les fiches de révision).

### 7.7 `olympiad/manifest.json`

```json
{
  "classId": "tronc-commun-sc",
  "title": "Olympiad — tronc-commun-sc",
  "gradeLevel": "tronc-commun-sc",
  "years": [2014, 2015, ..., 2025],
  "items": [
    {
      "id": "olympiad-tronc-commun-sc-2014",
      "year": 2014,
      "title": "Olympiade Internationale de Mathématiques (IMO) 2014 — Sujet officiel",
      "badge": "international",
      "source": "https://www.imo-official.org/problems.aspx",
      "duration": 240,
      "totalPoints": 42,
      "exerciseCount": 2,
      "path": "data/tronc-commun-sc/olympiad/2014.json"
    }
  ]
}
```

### 7.8 `cadre_referentiel.json` (format RevisionSheet)

```json
{
  "header": {
    "title": "Cadre Référentiel 2026",
    "subtitle": "2ème BAC Sciences Expérimentales",
    "context": "Mathématiques"
  },
  "sections": [
    { "id": "domaine_analyse", "category": "domain", "title": "Analyse" },
    { "id": "sous_domaine_suites", "category": "subdomain", "title": "Suites numériques" },
    { "id": "suite_arith_geo", "category": "method", "title": "Sais-tu utiliser les suites...?" }
  ]
}
```

---

## 8. Conventions de Nommage

### Identifiants de classe
```
tronc-commun-sc
1ere-bac-sc-ex
1ere-bac-sc-math
2eme-bac-sc-ex
2eme-bac-sc-math
```

### Fichiers d'exercices individuels
```
ex_01.json, ex_02.json, ...         ← exercices de chapitre
ds1_v1.json, ds1_v2.json, ds2_v1.json  ← DS (numéro_version)
nat_<YYYY>_normale.json             ← examen national session normale
nat_<YYYY>_rattrapage.json          ← examen national session rattrapage
<concours>_<YYYY>.json              ← annale de concours (ensa_2023.json)
<YYYY>.json                         ← olympiade (2024.json)
prob_<nom>.json                     ← problème enrichi
```

### Fichiers de quiz
```
<chapterId>_quiz.json               ← ex: continuite_quiz.json
<concours>_<theme>_quiz.json        ← ex: ensa_analyse_quiz.json
med_<theme>_quiz.json               ← ex: med_probabilites_quiz.json
```

### Fichiers de révision
```
fiche_<chapterId>_cours.json        ← ex: fiche_continuite_cours.json
```

---

## 9. Index Global des Olympiades (`olympiad-index.json`)

Ce fichier à la racine de `/public/data/` agrège toutes les olympiades de toutes les classes :

```json
{
  "version": "1.1.0",
  "generatedAt": "2026-04-27",
  "items": [
    {
      "classId": "1ere-bac-sc-math",
      "gradeLevel": "1ere-bac-sc-math",
      "id": "olympiad-1ere-bac-sc-math-2014",
      "year": 2014,
      "badge": "international",
      "path": "data/1er-bac-sc-math/olympiad/2014.json"   ← chemin réel (1er sans e)
    }
  ]
}
```

---

## 10. Services Associés

| Service | Fichier | Rôle |
|---|---|---|
| `contentService` | `services/contentService.ts` | Chargement chapitres, exercices, quiz (cache stale-while-revalidate) |
| `examenService` | `services/examenService.ts` | Chargement et génération aléatoire d'examens nationaux |
| `dsService` | `services/dsService.ts` | Chargement DS par semestre |
| `problemeService` | `services/problemeService.ts` | Chargement problèmes enrichis (RevisionSheet) |
| `olympiadService` | `services/olympiadService.ts` | Chargement épreuves olympiades |
| `concoursService` | `services/concoursService.ts` | Chargement annales + quiz de concours |
| `chapterStatsService` | `services/chapterStatsService.ts` | Stats agrégées par chapitre |

### Cache utilisé par les services

Tous les services data utilisent un cache mémoire (`Map`) avec TTL de **30 minutes** :

```typescript
const CACHE_TTL = 30 * 60_000; // 30 minutes
const indexCache = new Map<string, { data: ...; ts: number }>();
```

`contentService` ajoute également un cache HTTP via la **Cache API** (Service Worker) en stratégie stale-while-revalidate.

---

## 11. Récapitulatif — Carte des Données

```
public/data/
│
├── manifest.json                 ← RACINE : 5 classes + 3 concours
├── classInfo.json                ← Métadonnées affichage (coefficient, heures)
├── olympiad-index.json           ← Index global des olympiades
│
├── classes/
│   ├── tronc-commun-sc.json      ← 14 chapitres (section: algebre-geometrie, analyse)
│   ├── 1ere-bac-sc-ex.json       ← 12 chapitres (pas de revisions)
│   ├── 1ere-bac-sc-math.json     ← 16 chapitres
│   ├── 2eme-bac-sc-ex.json       ← 14 chapitres
│   └── 2eme-bac-sc-math.json     ← 14 chapitres
│
├── tronc-commun-sc/
│   ├── <14 chapitres>/           ← manifest + exercises + quiz + revisions
│   ├── ds/                       ← ✅ S1 (3 DS) + S2 (DS)
│   └── olympiad/                 ← ✅ 2014–2025 (12 épreuves)
│
├── 1ere-bac-sc-ex/
│   ├── <12 chapitres>/           ← manifest + exercises + quiz (pas revisions)
│   └── ds/                       ← ⚠️ index.json seulement (3 DS déclarés, non créés)
│
├── 1ere-bac-sc-math/
│   ├── <16 chapitres>/           ← manifest + exercises + quiz + revisions
│   ├── ds/                       ← ✅ S1 (3 DS) + S2 (3 DS)
│   ├── problemes/                ← ✅ 14 problèmes
│   └── olympiad/                 ← ✅ 2014–2025 (chemin physique: 1er-bac-sc-math/)
│
├── 2eme-bac-sc-ex/
│   ├── <14 chapitres>/           ← manifest + exercises + quiz + revisions
│   ├── ds/                       ← ✅ S1 (4 DS dont DS1 V1+V2) + S2 (3 DS)
│   ├── examen/                   ← ✅ 18 annales (2017–2025 normale+rattrapage)
│   ├── examens/                  ← ⚠️ résidu (cadre_referentiel.json seulement)
│   └── problemes/                ← ⚠️ 1 problème (données présentes, UI désactivée)
│
├── 2eme-bac-sc-math/
│   ├── <14 chapitres>/           ← manifest + exercises + quiz + revisions
│   ├── examen/                   ← ✅ 2 annales (2024 normale+rattrapage)
│   └── problemes/                ← ✅ 1 problème
│   (pas de ds/ — données non créées)
│
└── concours/
    ├── schools.json              ← liste centralisée des 3 concours
    ├── ensa/                     ← 5 annales (2019–2023) + 3 quizzes thématiques
    ├── ensam/                    ← 5 annales (2019–2023) + 3 quizzes thématiques
    └── medecine/                 ← 12 annales (2012–2023) + 2 quizzes thématiques
```

---

*Dernière mise à jour : basée sur l'exploration complète de `/public/data/` — MathPlus V1.003*
