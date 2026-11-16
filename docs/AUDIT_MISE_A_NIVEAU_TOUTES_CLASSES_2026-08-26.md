# Audit des contenus « Mise à niveau » - toutes les classes

Date de l'audit : 26 août 2026  
Périmètre : `public/data/classes` et tous les dossiers `public/data/*/mise-a-niveau`

## Résumé exécutif

Le projet déclare 8 classes. Cinq d'entre elles possèdent un chapitre « Mise à niveau » et trois classes du collège n'en possèdent pas.

Sur les 5 chapitres existants :

- aucun ne contient d'exercice : **0 exercice au total** ;
- 4 fiches de révision sur 5 sont des coquilles identiques de 2 blocs avec le texte « Contenu à compléter par votre professeur » ;
- 3 quiz existent et sont structurellement valides : 31, 26 et 38 questions, soit **95 questions au total** ;
- 2 chapitres n'ont aucun quiz : Tronc Commun Scientifique et 1ère Bac Sciences Expérimentales ;
- seul le chapitre de 2ème Bac Sciences Mathématiques possède une fiche de révision réellement rédigée.

La validation automatisée globale passe avec 0 erreur. Elle vérifie la cohérence technique des fichiers présents, mais elle ne détecte pas l'absence pédagogique d'exercices, de quiz ou le contenu de remplacement dans les fiches.

## Tableau de couverture

| Classe | Chapitre | Exercices | Révision | Quiz | État global |
|---|---:|---:|---:|---:|---|
| 1ère année collégiale | absent | - | - | - | À décider |
| 2ème année collégiale | absent | - | - | - | À décider |
| 3ème année collégiale | absent | - | - | - | À décider |
| Tronc Commun Scientifique | présent | 0 | coquille, 2 blocs | 0 | Critique |
| 1ère Bac Sciences Expérimentales | présent | 0 | coquille, 2 blocs | 0 | Critique |
| 1ère Bac Sciences Mathématiques | présent | 0 | coquille, 2 blocs | 31 questions | Élevé |
| 2ème Bac Sciences Expérimentales | présent | 0 | coquille, 2 blocs | 26 questions | Élevé |
| 2ème Bac Sciences Mathématiques | présent | 0 | complète, 7 sections et 61 blocs | 38 questions | Moyen |

« À décider » signifie que l'absence n'est pas forcément une erreur : il faut décider si le produit doit proposer une mise à niveau au collège avant de créer ces chapitres.

## Manques par classe

### Tronc Commun Scientifique - critique

Contenu présent : un manifeste et une fiche de révision minimale.

Manques :

1. Aucun exercice n'est déclaré.
2. Aucun quiz n'est déclaré.
3. La fiche de révision ne contient aucun cours exploitable. Elle possède seulement une introduction générique et un bloc de remplacement.
4. Aucun diagnostic ne permet d'identifier les lacunes venant du collège.

À produire en priorité :

- une fiche couvrant calcul numérique, fractions et puissances, identités remarquables, équations et inéquations simples, proportionnalité, repérage et bases géométriques ;
- un quiz diagnostique équilibré par thème ;
- une première banque d'exercices gradués avec corrections.

### 1ère Bac Sciences Expérimentales - critique

Contenu présent : un manifeste et une fiche de révision minimale.

Manques :

1. Aucun exercice n'est déclaré.
2. Aucun quiz n'est déclaré.
3. La fiche est identique à celle du Tronc Commun et contient encore le texte de remplacement.
4. Il n'existe donc ni rappel structuré ni diagnostic d'entrée en 1ère Bac.

À produire en priorité :

- une révision des prérequis du Tronc Commun : calcul algébrique, équations, inéquations, fonctions de base, vecteurs, géométrie analytique et trigonométrie ;
- un quiz diagnostique ;
- des exercices courts classés par prérequis.

### 1ère Bac Sciences Mathématiques - élevé

Contenu présent : un quiz valide de 31 questions.

Le quiz couvre 12 catégories : Algèbre, Arithmétique, Ensembles de nombres, Équations, Fonctions, Inégalités, Polynômes, Racines carrées, Transformations de courbes, Trigonométrie, Trinômes et Valeur absolue.

Manques :

1. Aucun exercice n'est déclaré.
2. La fiche de révision est une coquille de 2 blocs et ne traite aucune des 12 catégories du quiz.
3. Le parcours est déséquilibré : l'élève peut être évalué sur 31 questions sans disposer d'une fiche de préparation correspondante.

À produire en priorité : une fiche organisée selon les 12 catégories du quiz, puis une banque d'exercices par catégorie et par difficulté.

### 2ème Bac Sciences Expérimentales - élevé

Contenu présent : un quiz diagnostique valide de 26 questions, dans l'ordre Limites, Dérivation, Étude de fonction, Suites numériques et Trigonométrie.

Répartition :

- Limites : 6 questions ;
- Dérivation : 5 questions ;
- Étude de fonction : 5 questions ;
- Suites numériques : 5 questions ;
- Trigonométrie : 5 questions.

Manques :

1. Aucun exercice n'est déclaré.
2. La fiche de révision est une coquille de 2 blocs.
3. Les cinq thèmes évalués dans le quiz ne sont pas enseignés ou rappelés dans la fiche associée.

À produire en priorité : une fiche en cinq sections calée sur le quiz, puis des exercices ciblés par mécanisme et des exercices mixtes de synthèse.

### 2ème Bac Sciences Mathématiques - moyen

Contenu présent :

- une fiche complète de 7 sections et 61 blocs ;
- un quiz valide de 38 questions ;
- une couverture cohérente de la logique et rédaction, l'étude de fonction, les limites, la dérivation, les suites et la trigonométrie.

Manque principal : aucun exercice n'est déclaré. La continuité pédagogique s'arrête donc entre la révision et le quiz.

À produire en priorité : des exercices gradués pour chaque section de la fiche, incluant des applications directes, des pièges diagnostiques et des exercices mixtes.

### Classes du collège - décision produit requise

Les classes 1ère, 2ème et 3ème année collégiale ne déclarent aucun chapitre « Mise à niveau » et aucun dossier correspondant n'existe.

Avant de considérer cela comme un défaut, il faut décider si chaque niveau doit disposer :

- d'un diagnostic de début d'année ;
- d'une fiche de prérequis du niveau précédent ;
- d'une courte banque d'exercices de remédiation.

## Manques transversaux

### P0 - exercices absents partout

Les cinq manifestes existants déclarent `"exercises": []`. Il n'existe aucun fichier d'exercice dans les dossiers « Mise à niveau ».

Conséquence : l'élève passe directement de la lecture ou du quiz à aucun entraînement guidé. C'est le manque le plus systématique.

### P0 - deux parcours presque vides

Tronc Commun Scientifique et 1ère Bac Sciences Expérimentales ne possèdent ni exercice ni quiz, et leur fiche est un contenu de remplacement. Le chapitre est visible mais ne fournit pratiquement aucune activité pédagogique.

### P1 - quatre fiches dupliquées et incomplètes

Les fiches suivantes sont strictement identiques au niveau binaire :

- `public/data/tronc-commun-sc/mise-a-niveau/revisions/fiche_mise_a_niveau_cours.json` ;
- `public/data/1ere-bac-sc-ex/mise-a-niveau/revisions/fiche_mise_a_niveau_cours.json` ;
- `public/data/1ere-bac-sc-math/mise-a-niveau/revisions/fiche_mise_a_niveau_cours.json` ;
- `public/data/2eme-bac-sc-ex/mise-a-niveau/revisions/fiche_mise_a_niveau_cours.json`.

Chaque fiche comporte 1 section, 2 blocs et le texte « Contenu à compléter par votre professeur ».

### P1 - désalignement révision/quiz

1ère Bac Sciences Mathématiques et 2ème Bac Sciences Expérimentales disposent de quiz substantiels, mais leurs fiches ne couvrent aucun des thèmes évalués.

### P2 - couverture du collège non définie

L'absence des chapitres au collège doit faire l'objet d'une décision explicite. Si les diagnostics d'entrée font partie de la stratégie pédagogique du produit, trois chapitres complets restent à créer.

## Contrôles techniques effectués

- présence des manifestes référencés par les fichiers de classe ;
- présence des fiches et quiz référencés ;
- comptage des exercices, sections, blocs et questions ;
- détection des contenus de remplacement ;
- unicité des identifiants de questions ;
- présence d'un énoncé, d'une catégorie, d'une difficulté et d'une explication ;
- une seule bonne réponse pour chaque QCM ;
- présence de `isTrue` pour chaque Vrai/Faux ;
- correspondance entre `quizCount` et le nombre réel de questions ;
- exécution de `node scripts/validate-content.mjs --quiet`.

Résultats : les 95 questions existantes ne présentent aucune anomalie structurelle. La validation globale annonce 70 chapitres, 492 exercices et 0 erreur. Les 16 avertissements sont globaux et concernent principalement des identifiants de chapitre partagés entre classes ; ils ne signalent pas de fichier « Mise à niveau » cassé.

## Plan de réalisation recommandé

1. **P0 - rendre utiles les deux chapitres vides** : Tronc Commun Scientifique et 1ère Bac Sciences Expérimentales.
2. **P0 - créer un socle d'exercices** pour les cinq chapitres existants, avec au moins un exercice direct, un exercice de consolidation et un exercice mixte par thème.
3. **P1 - rédiger la fiche de 2ème Bac Sciences Expérimentales** selon les cinq thèmes et l'ordre de son quiz.
4. **P1 - rédiger la fiche de 1ère Bac Sciences Mathématiques** selon les 12 catégories déjà évaluées.
5. **P1 - compléter les exercices de 2ème Bac Sciences Mathématiques**, où la révision et le quiz sont déjà solides.
6. **P2 - décider de la couverture des trois classes du collège**, puis créer les chapitres si elle est retenue.

## Critères d'acceptation proposés

Un chapitre « Mise à niveau » peut être considéré comme complet lorsque :

- sa fiche ne contient aucun texte de remplacement et couvre tous les thèmes du quiz ;
- son quiz contient un diagnostic équilibré et toutes les questions ont une correction expliquée ;
- chaque thème possède au moins trois niveaux d'exercices : application, consolidation et synthèse ;
- les compteurs du fichier de classe et du manifeste correspondent aux fichiers réels ;
- la validation de contenu, le contrôle TypeScript et les tests du moteur de quiz passent sans erreur.
