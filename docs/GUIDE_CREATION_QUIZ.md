# Guide de Génération de Quiz Mathématiques — Instructions Robot
### Version 3.0 — Optimisé LLM · Toutes leçons · KaTeX

---

## MISSION

Tu génères un quiz JSON à partir d'un cours de mathématiques (PDF, image, texte).
Ton rôle : transformer une leçon en **parcours cognitif progressif** qui :
- Révèle les ambiguïtés fréquentes
- Souligne l'importance des résultats-clés
- Corrige les erreurs courantes avant qu'elles s'installent
- Guide l'élève des fondations vers la maîtrise

> **Règle absolue** : Zéro invention. Chaque question, formule, propriété vient du document source. Si ce n'est pas dans le cours, ça n'existe pas dans le JSON.

---

## ÉTAPE 1 — BALAYAGE ET CARTOGRAPHIE

Avant d'écrire la première question, lis l'intégralité du cours et construis cette carte mentale :

### Extraction obligatoire

| Élément | Action |
|---|---|
| **Titre et niveau du chapitre** | Identifier la place dans la progression scolaire |
| **Définitions encadrées** | Ce sont les piliers — ils génèrent les Q1–Q4 |
| **Propriétés / Théorèmes** | Les résultats dont l'élève doit sentir l'importance |
| **Méthodes étape par étape** | Source des questions d'ordonnancement |
| **Exemples résolus** | Révèlent les erreurs classiques à reproduire |
| **Conditions et restrictions** | Domaines de définition, cas particuliers — source d'ambiguïtés calculées |
| **Mises en garde explicites** | Questions de type Vrai/Faux ciblées |

### Les 3 questions à se poser avant de commencer

1. **Quels sont les 3–5 concepts sans lesquels l'élève ne peut rien faire dans ce chapitre ?**
   → Ce sont les piliers du quiz. Ils doivent apparaître dès les premières questions.

2. **Où les élèves font-ils systématiquement des erreurs dans ce type de chapitre ?**
   → Ces points deviennent des chasses à l'erreur ou des questions à ambiguïté calculée.

3. **Quels résultats semblent évidents mais cachent une condition cachée ou un cas limite ?**
   → Questions de synthèse niveau 🔴, les plus formatrices pédagogiquement.

---

## ÉTAPE 2 — ARCHITECTURE DU QUIZ

### Progression obligatoire

```
Q1  – Q6   🟢 FONDATIONS    Définitions, reconnaissance, propriétés directes
Q7  – Q13  🟡 CONSTRUCTION  Calculs, combinaisons, choix de méthode
Q14 – Q19  🔴 MAÎTRISE      Synthèse, ambiguïtés, chasses à l'erreur
Q20 – Q24  ⚫ DÉPASSEMENT   Généralisations, cas limites, ponts vers la suite
```

### Principe de chaque palier

**🟢 Fondations** — L'élève reconnaît. Pas de calcul complexe. Une erreur ici = cours non lu.
*Exemples : "Quelle est la définition de..." / "Cette affirmation est-elle vraie ?"*

**🟡 Construction** — L'élève combine 2–3 éléments. Calculs standards. Les distracteurs exploitent les confusions naturelles.
*Exemples : "Calculer f'(x) en appliquant..." / "Dans quelle situation cette méthode s'applique-t-elle ?"*

**🔴 Maîtrise** — Plusieurs propriétés mobilisées ensemble. Ambiguïtés calculées. Chasses à l'erreur réalistes. Qui réussit ici maîtrise vraiment le chapitre.
*Exemples : "Identifier l'étape incorrecte..." / "Cette affirmation est-elle vraie en général ?"*

**⚫ Dépassement** — Raisonnement par analogie, généralisation, cas limite. Distingue celui qui comprend de celui qui récite.
*Exemples : "Si on généralise cette propriété à... que peut-on dire ?"*

### Cible : 21 à 24 questions

| Palier | Questions | Min | Max |
|---|---|---|---|
| 🟢 Fondations | Q1–Q6 | 5 | 6 |
| 🟡 Construction | Q7–Q13 | 6 | 8 |
| 🔴 Maîtrise | Q14–Q19 | 5 | 6 |
| ⚫ Dépassement | Q20–Q24 | 3 | 5 |

**Répartition par type sur 22 questions :**
- QCM (`mcq`) : ~12 questions (55 %)
- Vrai/Faux (`boolean`) : ~5 questions (22 %)


---

## ÉTAPE 3 — STRUCTURE JSON

```json
{
  "questions": [
    {
      "id": "q1",
      "type": "mcq | boolean | order | error",
      "difficulty": "easy | medium | hard",
      "category": "Définition | Propriété | Méthode | Application | Synthèse | Dépassement",
      "prompt": "Énoncé en KaTeX...",
      ...
    }
  ]
}
```

---

## ÉTAPE 4 — TYPES DE QUESTIONS

### QCM (`mcq`) — 55 % des questions

```json
{
  "id": "q1",
  "type": "mcq",
  "difficulty": "easy",
  "category": "Définition",
  "prompt": "Énoncé de la question",
  "options": [
    { "id": "a", "text": "Bonne réponse", "isCorrect": true },
    { "id": "b", "text": "Distracteur 1", "isCorrect": false },
    { "id": "c", "text": "Distracteur 2", "isCorrect": false },
    { "id": "d", "text": "Distracteur 3", "isCorrect": false }
  ],
  "explanation": "Justification pédagogique complète."
}
```

**Règles QCM :**
- Exactement 4 options (a, b, c, d), 1 seule correcte
- Chaque distracteur correspond à une **erreur nommée et réaliste** (voir section Distracteurs)
- L'explication enseigne — elle ne se contente pas de valider

#### Sous-type : QCM à ambiguïté calculée (niveau 🔴)

Ajouter le champ `"ambiguity_note"` pour documenter la source de l'ambiguïté :

```json
{
  "id": "q14",
  "type": "mcq",
  "difficulty": "hard",
  "category": "Propriété",
  "ambiguity_note": "Condition de domaine oubliée par la majorité des élèves.",
  "prompt": "Énoncé volontairement ambigu ou à condition cachée",
  "options": [...],
  "explanation": "..."
}
```

Sources d'ambiguïtés fréquentes à exploiter :
- Propriété vraie *en général* mais fausse *dans un cas particulier*
- Ordre des quantificateurs ("pour tout x" vs "il existe x")
- Formule valide seulement sous une condition que l'élève oublie de vérifier
- Deux réponses semblant correctes au premier regard

---

### Vrai/Faux (`boolean`) — 22 % des questions

```json
{
  "id": "q5",
  "type": "boolean",
  "difficulty": "easy",
  "category": "Propriété",
  "prompt": "Affirmation précise et non ambiguë",
  "isTrue": true,
  "explanation": "..."
}
```

**Règles :**
- Une seule idée par question
- ~50 % vraies, ~50 % fausses dans l'ensemble du quiz
- Les fausses reproduisent une **erreur réaliste**, jamais une absurdité

---





---

## ÉTAPE 5 — CONSTRUIRE DES DISTRACTEURS EFFICACES

Un bon distracteur n'est pas absurde — c'est une réponse qui correspond à **une erreur spécifique et prévisible**.

| Type d'erreur | Stratégie |
|---|---|
| Erreur de signe | Changer un + en − ou inverser une fraction |
| Oubli d'une règle de composition | Appliquer la règle externe sans dériver l'intérieur |
| Confusion entre deux formules proches | Ex. : $\ln(a+b)$ au lieu de $\ln(ab)$ |
| Coefficient manquant ou doublé | Omettre le facteur de la dérivée externe |
| Mauvaise condition de domaine | Ignorer une restriction du type $x > 0$ |
| Inversion de sens | Confondre $f$ et $f^{-1}$, ou $f'$ et $f$ |
| Généralisation abusive | Étendre une propriété hors de son domaine de validité |

> **Test du distracteur** : un élève qui ne maîtrise pas le cours doit naturellement être attiré par ce distracteur.

---

## ÉTAPE 6 — SYNTAXE KATEX DANS LE JSON

**Règle d'échappement** : dans un fichier JSON, chaque `\` LaTeX devient `\\`.

| LaTeX | JSON |
|---|---|
| `\frac{a}{b}` | `\\frac{a}{b}` |
| `\ln` | `\\ln` |
| `\sqrt{x}` | `\\sqrt{x}` |
| `\vec{u}` | `\\vec{u}` |
| `\lim_{x \to a}` | `\\lim_{x \\to a}` |
| `\mathbb{R}` | `\\mathbb{R}` |
| `\int_a^b f(x)\,dx` | `\\int_a^b f(x)\\,dx` |

**Formules display (centrées, grandes)** : entourer de `$$...$$`
**Formules inline** : entourer de `$...$`

---

## ÉTAPE 7 — CATÉGORIES

| Catégorie | Usage | Palier typique |
|---|---|---|
| `Définition` | Termes, concepts de base | 🟢 |
| `Propriété` | Théorèmes, formules, règles | 🟢 à 🟡 |
| `Méthode` | Techniques, algorithmes, étapes | 🟡 |
| `Application` | Calculs, mises en œuvre | 🟡 à 🔴 |
| `Synthèse` | Combinaison de plusieurs notions | 🔴 |
| `Dépassement` | Généralisations, cas limites | ⚫ |

---

## ÉTAPE 8 — FIGURES D'UNE QUESTION

Quand une question s'appuie sur un graphique, le média se place au niveau de la
question :

```json
{
  "media": {
    "src": "/data/2eme-bac-sc-math/mise-a-niveau/quiz/figures/qcm_lecture_graphique.svg",
    "alt": "Courbe de f avec son asymptote verticale x = 1 et son minimum en (3 ; 2).",
    "position": "bottom",
    "width": "62%",
    "style": { "border": false, "shadow": false, "rounded": true }
  }
}
```

**Pas de légende dans un quiz.** Le champ `caption` (et `captionStyle`) est
**interdit** : l'énoncé pose la question, la figure la fait comprendre — une
légende donnerait la réponse ou ferait doublon. Vérifier qu'aucun média de quiz
n'en porte.

**Le `alt` ne sert pas au quiz** : il est lu par les lecteurs d'écran. Il
**décrit ce qu'on peut lire**, jamais la réponse : « Courbe coupant la droite
y = k en trois points » et non « donc il y a trois solutions ».

**Créer la figure** : suivre `docs/GUIDE_SVG_TIKZ.md` (§ 0 = les consignes).
Une figure de quiz doit rester lisible seule, sans phrase d'accompagnement :
étiquettes mathématiques uniquement (`a`, `b`, `k`, `𝒞_f`), aucune annotation en
mots — c'est justement ce que la légende ferait à sa place.

Contrôles avant livraison :

```bash
node tmp/check-figures.mjs                                            # polices, fond, axes
node tmp/check-math-katex.mjs public/data/<classe>/<chapitre>/quiz/<quiz>.json
```

---

## CHECKLIST FINALE

Avant de livrer le JSON, vérifier chaque point :

- [ ] Balayage complet du document source (tous les blocs identifiés)
- [ ] 3 questions de cartographie répondues avant de commencer
- [ ] 21 à 24 questions au total
- [ ] Progression 🟢 → 🟡 → 🔴 → ⚫ respectée dans l'ordre des IDs
- [ ] Au moins 1 question d'ordonnancement (méthode du cours)
- [ ] Au moins 1 chasse à l'erreur (faute réaliste d'élève)
- [ ] Au moins 1 question à ambiguïté calculée (niveau 🔴, champ `ambiguity_note` présent)
- [ ] Chaque distracteur correspond à une erreur nommée
- [ ] KaTeX correctement échappé (`\\` dans le JSON)
- [ ] **Aucun média de quiz ne porte de `caption` ni de `captionStyle`**
- [ ] **`width` des figures proportionnelle au `viewBox`** (même échelle apparente)
- [ ] JSON valide (pas de virgule manquante, guillemets fermés)
- [ ] Chaque explication enseigne — elle ne se contente pas de valider
- [ ] Aucune invention — tout vient du document source
- [ ] Les questions de niveau 🔴 et ⚫ ciblent les ambiguïtés et les résultats importants mal compris