# Guide des titres de blocs — Fiches de révision

> Ce guide décrit la convention de titrage pour chaque type de bloc dans les fiches `fiche_*_cours.json`.
> Les titres doivent être **directs, significatifs, sans point d'interrogation** à la fin.
> Ils s'adressent à un public international, y compris des élèves non francophones natifs.

---

## Principe général

| ❌ À éviter | ✅ À utiliser |
|---|---|
| Titre sous forme de question : `"Quand peut-on ...?"` | Titre nominatif direct : `"Existence de la fonction réciproque"` |
| Titre vague : `"Propriétés"` | Titre ciblé : `"Stabilité par opérations"` |
| Titre avec `?` en fin | Titre sans point d'interrogation |
| Titre trop long | Titre court (3–7 mots max) |

---

## Convention par type de bloc

### `"type": "definition"`

Le titre doit nommer **ce qui est défini**, avec le mot-clé mathématique central.

**Format :** `Nom du concept — précision éventuelle`

| Exemple à reformuler | Titre correct |
|---|---|
| `"Que signifie être continue en a ?"` | `"Continuité en un point"` |
| `"Comment définir x^(p/q) ?"` | `"Puissance rationnelle x^(p/q)"` |
| `"Comment définir la racine n-ième ?"` | `"Racine n-ième — définition"` |
| `"Qu'est-ce qu'un vecteur ?"` | `"Vecteur — définition"` |
| `"Quand dit-on que f admet une limite ?"` | `"Limite finie en un point"` |

---

### `"type": "theorem"`

Le titre doit porter le **nom propre du théorème** ou décrire le **résultat garanti**.

**Format :** `Nom du théorème` ou `Résultat — condition`

| Exemple à reformuler | Titre correct |
|---|---|
| `"L'équation f(x)=λ admet-elle une solution ?"` | `"Théorème des valeurs intermédiaires (TVI)"` |
| `"Quand est-on sûr que la solution est unique ?"` | `"Solution unique — monotonie stricte"` |
| `"La composée est-elle continue ?"` | `"Composée de fonctions continues"` |
| `"Comment calculer la limite d'une composée ?"` | `"Limite d'une composée"` |
| `"Que devient un intervalle par f continue ?"` | `"Image d'un intervalle — théorème fondamental"` |

---

### `"type": "property"`

Le titre décrit **ce que la propriété affirme** ou **à quoi elle sert**.

**Format :** `Sujet — ce qui est affirmé` ou `Adjectif + substantif`

| Exemple à reformuler | Titre correct |
|---|---|
| `"Quelles fonctions usuelles sont continues ?"` | `"Fonctions usuelles continues"` |
| `"Que peut-on dire des opérations sur les fonctions continues ?"` | `"Stabilité par opérations"` |
| `"Comment simplifier si la fonction est monotone ?"` | `"Image d'un segment par une fonction monotone"` |
| `"Les règles des puissances s'étendent-elles aux rationnels ?"` | `"Règles de calcul — puissances rationnelles"` |
| `"Comment lever une indétermination ?"` | `"Expression conjuguée — lever une indétermination"` |

---

### `"type": "method"`

Le titre doit décrire **la technique ou la procédure**, pas poser une question.

**Format :** `Nom de la méthode — contexte d'application`

| Exemple à reformuler | Titre correct |
|---|---|
| `"Comment étudier la continuité par morceaux ?"` | `"Continuité d'une fonction par morceaux"` |
| `"Comment appliquer le TVI ?"` | `"Application du TVI — 4 étapes"` |
| `"Comment résoudre x^n = a ?"` | `"Résolution de x^n = a — parité de n"` |
| `"Comment simplifier racines et puissances ?"` | `"Simplification — racines et puissances"` |
| `"Comment montrer la continuité sur un domaine ?"` | `"Montrer la continuité sur un domaine"` |

---

### `"type": "culture"`

Le titre doit **annoncer le domaine réel** et l'application, de façon attractive.

**Format :** `Domaine réel : verbe d'action + concept`

| Exemple | Titre correct |
|---|---|
| *(pas de titre)* | `"Médecine et IA : détecter l'épilepsie par la continuité"` |
| `"Les maths dans le monde"` | `"Bitcoin & Blockchain : la suite géométrique au cœur de la crypto"` |
| `"Applications"` | `"SpaceX : l'intégrale qui calcule les trajectoires de fusées"` |

---

### `"type": "warning"`, `"remark"`, `"note"`, `"intuition"`

Ces types **n'ont généralement pas de titre** — le composant affiche automatiquement le badge correspondant (⚠ Attention, 💡 Intuition, etc.).

Si un titre est nécessaire, il doit être très court (2–4 mots) et descriptif.

---

### `"type": "intro"`

La section intro a toujours `"title": ""` (vide). Le bloc intro lui-même n'a **pas de champ `title`**.

Voir le [guide_intro_revision.md](guide_intro_revision.md) pour la structure complète.

---

## Titres de sections (paragraphes)

Les sections ont un champ `"title"` qui apparaît comme **titre numéroté** en grand dans la révision.

**Format :** Nom du concept mathématique, en français académique concis.

| Exemple | Titre correct |
|---|---|
| `"Étude de la continuité"` | `"Continuité en un point"` |
| `"Analyse des fonctions réciproques"` | `"Fonctions réciproques"` |
| `"Introduction aux suites"` | `"Définition et types de suites"` |

---

## Checklist de validation des titres

Avant de soumettre ou modifier une fiche, vérifier :

- [ ] Aucun titre ne se termine par `?`
- [ ] Chaque `definition` a un titre qui nomme le concept
- [ ] Chaque `theorem` porte le nom du théorème ou du résultat
- [ ] Chaque `property` décrit ce qui est affirmé
- [ ] Chaque `method` décrit la technique (pas une question)
- [ ] Les `culture` ont un titre domaine + concept
- [ ] Les titres sont courts (3–7 mots)
- [ ] Pas de verbe conjugué au début (`"Montrons que..."`, `"Calculons..."`)
- [ ] Pas de `"Comment..."`, `"Quand..."`, `"Que..."`, `"Quelle..."` en début de titre

---

## Exemples complets — extrait `continuite`

```json
{ "type": "definition",  "title": "Continuité en un point" }
{ "type": "definition",  "title": "Continuité à droite et à gauche" }
{ "type": "theorem",     "title": "Prolongement par continuité" }
{ "type": "theorem",     "title": "Composée de fonctions continues" }
{ "type": "theorem",     "title": "Théorème des valeurs intermédiaires (TVI)" }
{ "type": "theorem",     "title": "Solution unique — monotonie stricte" }
{ "type": "property",    "title": "Fonctions usuelles continues" }
{ "type": "property",    "title": "Stabilité par opérations" }
{ "type": "property",    "title": "Image d'un segment par une fonction monotone" }
{ "type": "method",      "title": "Continuité d'une fonction par morceaux" }
{ "type": "method",      "title": "Application du TVI — 4 étapes" }
{ "type": "culture",     "title": "Médecine et IA : détecter l'épilepsie par la continuité" }
```
