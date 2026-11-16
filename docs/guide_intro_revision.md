# Guide de Création — Bloc Introduction (type `"intro"`)

> Ce guide décrit comment rédiger un bloc d'introduction pour les fiches de révision.
> Avant de rédiger, **analyser** la fiche de révision, les quiz et les exercices du chapitre
> afin d'avoir une vision claire et globale du contenu pédagogique.

---

## 1. Objectif du bloc intro

Le bloc intro est le **premier contact** de l'élève avec le chapitre.
Il doit en 3–4 phrases donner :

| Zone          | Contenu                                      | Ton                  |
|---------------|----------------------------------------------|----------------------|
| **Gauche**    | Objectif du chapitre + difficulté principale | Pédagogique, direct  |
| **Droite**    | Savant historique + héritage moderne          | Culturel, inspirant  |

La séparation gauche / droite est **automatique** : le composant coupe le texte
à la dernière phrase complète avant la commande `\savant{}`.

---

## 2. Structure JSON

```json
{
  "type": "intro",
  "content": "Texte motivation... \\savant{Nom du Savant} texte histoire...",
  "media": {
    "src": "https://upload.wikimedia.org/.../Portrait.jpg",
    "type": "image",
    "position": "float-right",
    "width": "14%",
    "caption": "Prénom Nom (année–année)"
  }
}
```

### Champs obligatoires

| Champ              | Type     | Description                                          |
|--------------------|----------|------------------------------------------------------|
| `type`             | `string` | Toujours `"intro"`                                   |
| `content`          | `string` | Texte complet (motivation + histoire, voir §3)       |
| `media.src`        | `string` | URL Wikimedia Commons du portrait du savant           |
| `media.type`       | `string` | Toujours `"image"`                                   |
| `media.position`   | `string` | `"float-right"` (ou `"right"`)                       |
| `media.width`      | `string` | `"14%"` à `"16.5%"` — taille du portrait             |
| `media.caption`    | `string` | `"Prénom Nom (naissance–décès)"`                     |

### Placement dans le fichier

Le bloc intro est toujours dans la **première section** du fichier :

```json
{
  "sections": [
    {
      "id": "intro",
      "category": "course",
      "title": "",
      "blocks": [
        { "type": "intro", ... }
      ]
    },
    ...
  ]
}
```

---

## 3. Commandes de texte disponibles

Ces commandes fonctionnent **dans le champ `content`**, en dehors des délimiteurs `$...$`.

### Commandes spécifiques à l'intro

| Commande             | Rendu                                          | Usage                                   |
|----------------------|------------------------------------------------|-----------------------------------------|
| `\objectif{texte}`  | **TEXTE** indigo, gras, majuscule, tracking    | L'objectif principal du chapitre        |
| `\defi{texte}`      | **texte** rouge, semi-gras                     | La difficulté ou enjeu du chapitre      |
| `\savant{Nom}`      | **Nom** vert teal, semi-gras, tracking         | Nom du mathématicien / savant           |

### Commandes générales utilisables

| Commande             | Rendu                         |
|----------------------|-------------------------------|
| `\motivation{texte}` | Texte bleu, medium            |
| `\histoire{texte}`   | Bloc encadré ambre (div)      |
| `$...$`              | Formule KaTeX inline          |
| `$$...$$`            | Formule KaTeX display (éviter dans intro) |

### Commandes INTERDITES dans l'intro

| Commande             | Raison                                        |
|----------------------|-----------------------------------------------|
| `\blueb{}`           | Commande cassée, non supportée                |
| `\redb{}`            | Commande cassée, non supportée                |
| `\greenb{}`          | Commande cassée, non supportée                |
| `\textbf{}` hors `$` | Utiliser `\objectif{}` ou `\defi{}` à la place |
| `\def\arraystretch`  | Commande LaTeX brute, non supportée           |
| `\method{}`          | Réservé aux blocs méthode uniquement          |
| `\mathqst{}`         | Réservé aux `title` des blocs (définition, propriété, théorème, méthode, conséquence, corollaire) |

---

## 4. Règles de rédaction

### 4.1. Longueur

- **3 à 4 phrases** maximum (total motivation + histoire)
- Zone gauche : **2 à 3 phrases** (objectif + difficulté)
- Zone droite : **1 à 2 phrases** (savant + héritage)

### 4.2. Structure du texte

Le texte `content` suit **toujours** ce plan :

```
[Phrase 1] Définir ce que le chapitre étudie avec \objectif{concept clé}.
[Phrase 2] Identifier la \defi{difficulté} principale de l'élève.
[Phrase 3] \savant{Nom} + contexte historique + applications modernes.
```

La **coupure automatique** se fait à la dernière phrase terminée par `. ` avant `\savant{`.
Donc la phrase contenant `\savant{}` va **toujours** dans la zone droite (histoire).

### 4.3. Ton et style

- **Pédagogique** : parler directement à l'élève, pas de jargon inutile
- **Concis** : chaque mot doit apporter de l'information
- **Motivant** : montrer pourquoi ce chapitre est utile
- **Honnête** : nommer clairement la difficulté sans dramatiser
- **Culturel** : relier les maths à l'histoire et au monde réel

### 4.4. Formules mathématiques

- Utiliser `$...$` pour les formules inline quand elles apportent de la clarté
- Une formule emblématique par intro maximum (ex : `$(e^x)' = e^x$`)
- Pas de formules longues ni de tableaux dans l'intro

---

## 5. Choix du savant et du portrait

### Critères de sélection

1. Le savant doit être **directement lié** au chapitre (inventeur, formalisateur)
2. Privilégier les **portraits classiques** disponibles sur Wikimedia Commons
3. Le portrait doit être un **tableau ou gravure ancienne** (pas de photo moderne)

### Format du caption

```
"Prénom Nom (année_naissance–année_décès)"
```

Exemples :
- `"Leonhard Euler (1707–1783)"`
- `"Leonardo Fibonacci (c. 1170–1250)"` — utiliser `c.` pour les dates approximatives

### Taille de l'image

- Standard : `"width": "14%"` (recommandé)
- Maximum : `"width": "16.5%"`
- Le portrait est affiché en **cercle** (106×106px desktop) dans la zone droite

---

## 6. Méthodologie avant rédaction

Avant d'écrire l'intro d'un chapitre, **analyser dans cet ordre** :

### Étape 1 — Lire la fiche de révision

- Parcourir **toutes les sections** du fichier `fiche_*_cours.json`
- Identifier les concepts clés, les théorèmes principaux
- Repérer ce qui est traité en profondeur vs. survolé

### Étape 2 — Lire les quiz

- Ouvrir les fichiers `quiz_*.json` du même chapitre
- Identifier les questions les plus fréquentes
- Repérer les pièges et erreurs typiques → base pour `\defi{}`

### Étape 3 — Lire les exercices

- Parcourir les `ex_*.json` du chapitre
- Identifier les compétences évaluées
- Repérer les exercices les plus difficiles → confirmer le choix de `\defi{}`

### Étape 4 — Synthétiser

- L'`\objectif{}` doit couvrir **le fil rouge** de la révision + quiz + exercices
- La `\defi{}` doit refléter **l'obstacle réel** que l'élève rencontre
- Le `\savant{}` doit être le mathématicien **le plus pertinent** pour ce chapitre

---

## 7. Exemples complets

### Exemple 1 — Exponentielles

```json
{
  "type": "intro",
  "content": "La fonction exponentielle est l'\\objectif{unique fonction égale à sa propre dérivée} vérifiant $\\exp(0)=1$, ce qui en fait la clé de tout modèle de croissance proportionnelle. On étudie ses propriétés algébriques, ses limites et les exponentielles de base $a$. La \\defi{difficulté} principale réside dans la résolution d'inéquations mêlant exponentielle et logarithme, où le sens de l'inégalité exige une attention particulière. \\savant{Leonhard Euler} a introduit cette fonction au XVIIIe siècle ; elle est aujourd'hui omniprésente en biologie, en finance et en physique nucléaire.",
  "media": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Leonhard_Euler.jpg",
    "type": "image",
    "position": "float-right",
    "width": "14%",
    "caption": "Leonhard Euler (1707–1783)"
  }
}
```

**Découpage automatique :**
- Gauche (motivation) : phrases 1–3 (objectif + difficulté)
- Droite (histoire) : phrase 4 (Euler + applications)

### Exemple 2 — Probabilités

```json
{
  "type": "intro",
  "content": "Les probabilités permettent de \\objectif{quantifier l'incertitude} à l'aide de modèles comme la loi binomiale. La \\defi{difficulté} la plus redoutable est la probabilité conditionnelle $P_A(B)$ : l'information passée modifie le calcul et contredit souvent l'intuition empirique. \\savant{Andreï Kolmogorov} a axiomatisé cette théorie au XXe siècle, en faisant le fondement du machine learning, de la statistique et de la finance quantitative.",
  "media": {
    "src": "https://upload.wikimedia.org/wikipedia/commons/.../Kolmogorov.jpg",
    "type": "image",
    "position": "float-right",
    "width": "14%",
    "caption": "Andreï Kolmogorov (1903–1987)"
  }
}
```

---

## 8. Rendu visuel

```
┌──────────────────────────────────────┐  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                      │     ┌──────────┐
│  Texte motivation + difficulté       │  │  │  Portrait │       │
│  (font-serif, #3E3326, 1.1rem)       │     │  (cercle) │
│  leading-[1.9], text-justify         │  │  └──────────┘       │
│                                      │     Savant (1xxx–1xxx)
│  \objectif{} → indigo gras caps     │  │                     │
│  \defi{} → rouge semi-gras          │     Texte histoire
│                                      │  │  (font-serif, italic│
│                                      │     text-center)
└──────────────────────────────────────┘  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
         Zone gauche (flex-1)                Zone droite (280–320px)
                                             fond ambre doux
                                             bordure tiretée
```

### Styles appliqués

| Zone    | CSS principal                                                     |
|---------|-------------------------------------------------------------------|
| Gauche  | `font-serif text-[1.05rem] md:text-[1.1rem] leading-[1.9]`      |
| Droite  | `bg-amber-50/40 rounded-xl border-dashed` + portrait circulaire  |
| Portrait| `w-24 h-24 md:w-[106px] md:h-[106px] rounded-full object-cover`  |
| Caption | `text-[11px] text-slate-600 font-bold tracking-wider uppercase`  |

---

## 9. Checklist de validation

Avant de soumettre un bloc intro, vérifier :

- [ ] Le texte contient exactement **une** commande `\objectif{}`
- [ ] Le texte contient exactement **une** commande `\defi{}`
- [ ] Le texte contient exactement **une** commande `\savant{}`
- [ ] `\savant{}` est dans la **dernière ou avant-dernière phrase**
- [ ] Il y a un `. ` (point + espace) avant la phrase contenant `\savant{}`
- [ ] Le texte total fait **3 à 4 phrases**
- [ ] Le JSON est valide (pas de `"` non échappées, `\\` pour les commandes)
- [ ] L'image Wikimedia existe et est accessible
- [ ] Le caption est au format `"Prénom Nom (année–année)"`
- [ ] `"width"` est entre `"14%"` et `"16.5%"`
- [ ] Aucune commande interdite (`\blueb`, `\redb`, `\textbf` hors `$`)
- [ ] Les formules `$...$` sont correctes et courtes
- [ ] L'objectif couvre le contenu de la révision, des quiz ET des exercices
- [ ] La difficulté reflète un obstacle réel observé dans les quiz/exercices

---

## 10. Savants recommandés par chapitre

| Chapitre                    | Savant recommandé         | Contribution principale                    |
|-----------------------------|---------------------------|--------------------------------------------|
| Suites                      | Leonardo Fibonacci        | Suite de Fibonacci, récurrence              |
| Probabilités                | Andreï Kolmogorov         | Axiomatisation des probabilités             |
| Logarithmes                 | John Napier               | Invention du logarithme                     |
| Géométrie dans l'espace     | Gaspard Monge             | Géométrie descriptive                       |
| Géométrie analytique espace | René Descartes            | Repère cartésien                            |
| Fonctions primitives        | Isaac Barrow              | Lien dérivation–quadrature                  |
| Exponentielles              | Leonhard Euler            | Notation $e^x$, formalisation               |
| Étude de fonctions          | René Descartes            | Repère cartésien, méthode analytique        |
| Équations différentielles   | Pierre-Simon de Laplace   | Résolution analytique                       |
| Dérivabilité                | Isaac Newton              | Calcul différentiel, mécanique              |
| Dénombrement                | Blaise Pascal             | Triangle de Pascal, jeux de hasard          |
| Continuité                  | Karl Weierstrass          | Définition ε-δ de la continuité             |
| Nombres complexes           | Leonhard Euler            | Formule $e^{i\theta}$                      |
| Calcul intégral             | Gottfried Wilhelm Leibniz | Notation ∫, théorème fondamental            |
