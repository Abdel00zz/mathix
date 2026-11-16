# Version professeur (PC) — Console & Studio

> Ce guide décrit la **version professeur côté PC** : l'espace de pilotage de
> séance, le studio de production de contenu, et — surtout — le **modèle
> d'isolation** qui garantit qu'un professeur travaille dans **son propre
> environnement**, sans jamais toucher le contenu des autres ni le contenu
> officiel par défaut.

---

## 1. Vue d'ensemble de l'interface PC prof

L'interface PC se compose de trois niveaux :

| Niveau | Rôle |
|--------|------|
| **Tableau de bord de gestion** | Choisir la classe à enseigner (**« Accéder »** / **« Séance sur »**), voir les niveaux et les contenus publiés. |
| **Console professeur** | Pilotage de la séance (rail latéral : *Pilotage, Programmer, Notifier, Projection, Élèves, Registre*) + **Studio** de production. |
| **Studio de production** | Édition de contenu (exercices, quiz, révisions) **de la classe accédée**, avec publication. |

> **Règle unique d'entrée de classe** : on ne change de classe que via
> **« Accéder »** sur le tableau de bord. Le studio n'a pas de sélecteur de
> classe : il suit la classe accédée (la classe de séance).

---

## 2. La distinction essentielle : séance ≠ contenu par défaut

C'est le point le plus important du modèle :

> **La « session prof X » n'affecte QUE la session du prof X sur sa tablette.
> Elle ne touche JAMAIS le contenu par défaut de la plateforme.**

Concrètement, trois choses sont séparées :

1. **La classe enseignée** (`session.classId`) — c'est un *choix* : le niveau
   affiché sur la tablette du prof pendant la séance. Choisir « 2BAC PC » ne
   modifie **rien** dans les fichiers de contenu.
2. **Le contenu par défaut** — les fichiers statiques `public/data/**/*.json`
   servis à tous les élèves. **Aucun professeur ne les écrit**.
3. **Les overrides (contenu personnalisé)** — chaque prof publie des versions
   **privées** dans son propre espace (voir §4). Elles ne se superposent au
   contenu officiel que **pour lui et ses élèves**.

---

## 3. Autorisations du professeur sur le contenu

Un professeur (non-admin) peut **créer, modifier, publier et supprimer** tout
contenu situé sous :

- sa **classe de compte** (`data/{classe du compte}/…`) ;
- la **classe qu'il enseigne** (`data/{classe de la séance}/…`), celle qu'il a
  choisie via « Accéder ».

→ **Le professeur a donc toutes les autorisations sur le contenu de SA
session** (la classe accédée), en plus de sa classe d'origine.

Ce qu'il **ne peut pas** :
- modifier une classe **étrangère** (ni compte, ni séance) → refus
  `403 « Contenu hors de votre classe »` ;
- modifier le **contenu officiel** : ses publications vont dans son espace
  privé (voir §4), jamais dans le manifeste administrateur.

> L'**admin** a accès à tout le catalogue et publie dans le namespace
> **officiel**.

> **Règle d'or (modèle d'exclusivité)** :
>
> - **Seul l'admin** peut modifier le **contenu par défaut** (officiel).
> - Dès qu'un utilisateur bénéficie du **mode « prof »**, son contenu est
>   **exclusif et restreint à lui et aux élèves associés à ce prof** —
>   il n'est visible ni par les autres professeurs, ni par le grand public,
>   et il ne remplace jamais le contenu officiel.

---

## 4. Environnement privé de chaque professeur (isolation)

Chaque professeur `X` est identifié par le **hash de son téléphone** :

```
owner(X) = "prof:" + sha256(téléphone).slice(0, 20)
```

Toutes ses données sont rangées **sous ce préfixe**, sans aucune clé partagée :

| Domaine | Clé privée du prof X | Partagée ? |
|---------|----------------------|------------|
| Séance / classe | `prof:classroom:{owner}:session·roster·live·answered·answerStatus·present` | ❌ non |
| Contenu publié (manifest) | `content:files:{owner}` | ❌ non |
| Contenu publié (fichiers) | `content:file:{owner}:{path}` | ❌ non |
| Historique de versions | `content:history:{owner}:{path}` | ❌ non |
| Compteur de version | `content:version:{owner}` | ❌ non |

**Lecture des overrides** (côté app) :
- Le manifest renvoyé au prof X = `{ officiel, …X }` — les publications de X
  **priment** sur l'officiel, uniquement pour X.
- L'élève de X lit le **namespace de X** (via `profId` → téléphone de X) : il
  voit donc les contenus personnalisés publiés par son professeur.
- Un autre professeur Y lit son **propre** namespace, pas celui de X.

**Résultat** : chaque prof a un **environnement de travail privé** (séance +
contenu). Une publication de X est invisible pour Y et ne modifie pas le
contenu officiel.

---

## 5. Circuits de synchronisation (PC ↔ tablette)

| Circuit | Sens | Mécanisme |
|---------|------|-----------|
| **Classe enseignée** | PC → tablette | « Accéder » → `session.classId` → la tablette bascule de niveau (polling 4 s / 1,2 s) |
| **Pilotage** | PC → tablette | `session-set` (démarrer/pause/arrêter) → Redis → pastille + interface tablette |
| **Chapitre travaillé** | tablette → PC | ouverture d'un chapitre → `session.chapterId` → archivage/impression |
| **Activité temps réel** | tablette → PC | `session-activity` (numéro d'exercice, question, paragraphe, traits) → carte « Séance » PC |
| **Présence / rotation** | PC ↔ tablette | `present` (PC) · `live`/`answerStatus` (tablette) |
| **Publication de contenu** | PC → tablette | overrides Redis → manifest relu (sync 5 s) + URL `?v=` → cache invalidé |

> La liaison est un **polling HTTP vers Redis** (aucune connexion directe
> PC↔tablette). « Synchronisation rapide (même réseau) » réduit le polling à
> ~1,2 s. La projection d'écran, elle, passe par **scrcpy** (outil local).

---

## 6. Points de vérification rapide

- [ ] « Accéder » à une classe → la tablette bascule sur ce niveau.
- [ ] Le prof édite une classe accédée → « Publier » fonctionne (classe de
      compte + classe de séance autorisées).
- [ ] Une publication de X n'apparaît **pas** chez Y, ni dans le contenu
      officiel.
- [ ] « Imprimer la séance » archive chapitre + exercices ouverts + quiz
      remplis + zones annotées + élèves présents.
- [ ] L'historique de séance (tablette) reflète planification, début, fin,
      présents et changements de niveau.
