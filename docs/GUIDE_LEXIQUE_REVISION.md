# Guide du lexique de révision

Le lexique transforme certains mots du cours en points d'appui bilingues. Un bon mot de lexique n'est pas seulement un mot traduit : c'est un terme qui aide l'élève à construire le concept, lever une ambiguïté ou relier une idée abstraite à une image mentale claire.

## Objectif

Le lexique doit aider l'élève à :

- reconnaître les mots centraux d'un chapitre ;
- comprendre le sens mathématique exact d'un mot courant ;
- distinguer deux notions proches ;
- retenir une traduction arabe utile sans casser la lecture du cours ;
- retrouver rapidement le rôle d'un symbole ou d'une notation.

Il ne faut pas transformer chaque phrase en dictionnaire. Le lexique est efficace quand il reste sélectif.

## Où le placer

Ajouter une clé `lexique` au niveau racine du fichier JSON de révision, juste après `header` et avant `sections`.

```json
{
  "header": {
    "title": "Nombres complexes",
    "subtitle": "Calculer et représenter avec les écritures complexes",
    "context": "2BAC Sciences"
  },
  "lexique": [
    {
      "term": "Module",
      "arabic": "معيار",
      "category": "concept",
      "symbol": "|z|",
      "definition": "Distance du point associé à z à l'origine du plan complexe.",
      "variants": ["modules", "module d'un complexe", "module de z"]
    }
  ],
  "sections": []
}
```

Si une fiche de méthodes possède aussi un `lexique`, il est fusionné avec celui de la fiche de cours. Les doublons sont retirés selon le couple `term + category`.

## Schéma

Chaque entrée peut contenir :

- `term` : mot ou groupe de mots détecté automatiquement dans le texte.
- `arabic` : traduction courte en arabe.
- `category` : famille sémantique, par exemple `concept`, `consigne`, `connecteur`.
- `symbol` : symbole associé si utile, par exemple `|z|`, `\\mathbb{R}`, `f^{-1}`.
- `definition` : phrase courte qui explique le rôle du terme dans le chapitre.
- `variants` : formes proches que le détecteur doit reconnaître.

Champs obligatoires : `term`, `arabic`, `definition`.

## Choisir les bons mots

Un terme mérite d'entrer dans le lexique s'il a au moins une de ces qualités :

- Il porte une idée centrale : `module`, `argument`, `primitive`, `continuité`, `barycentre`.
- Il est souvent confondu : `image`, `antécédent`, `inverse`, `réciproque`.
- Il change de sens en mathématiques : `suite`, `raison`, `sens`, `limite`, `ordre`.
- Il structure une méthode : `isoler`, `factoriser`, `encadrer`, `substituer`.
- Il aide à lire une formule : `partie réelle`, `coefficient directeur`, `valeur absolue`.
- Il revient plusieurs fois dans la fiche ou dans les exercices.

Éviter :

- les mots trop génériques : `faire`, `trouver`, `calculer`, sauf s'ils ont un sens de consigne précis ;
- les mots vus une seule fois sans importance conceptuelle ;
- les variables seules : `x`, `n`, `a`, `b` ;
- les expressions trop longues qui ne seront jamais relues exactement ;
- les synonymes approximatifs qui risquent de surligner un passage hors contexte.

## Niveau de précision

Le `term` doit être assez précis pour éviter les faux positifs.

Préférer :

```json
{ "term": "partie réelle", "variants": ["partie reelle", "Re(z)"] }
```

Éviter :

```json
{ "term": "partie", "variants": ["parties"] }
```

Le détecteur normalise les accents et les espaces. `partie réelle` peut donc reconnaître `partie reelle`. Les variantes restent utiles pour les abréviations, les pluriels, les graphies sans accents et les notations.

## Catégories recommandées

Utiliser peu de catégories, mais les utiliser avec cohérence.

- `concept` : notion mathématique à comprendre.
- `consigne` : verbe ou action attendue dans un exercice.
- `connecteur` : mot logique qui organise un raisonnement.

Exemples :

```json
[
  {
    "term": "Injective",
    "arabic": "حقنية",
    "category": "concept",
    "definition": "Une application est injective lorsque deux éléments distincts ne peuvent pas avoir la même image.",
    "variants": ["injection", "injectivite", "injectivité"]
  },
  {
    "term": "Montrer que",
    "arabic": "برهن أن",
    "category": "consigne",
    "definition": "Consigne qui demande une justification complète, pas seulement un résultat.",
    "variants": ["demontrer que", "démontrer que", "prouver que"]
  },
  {
    "term": "Donc",
    "arabic": "إذن",
    "category": "connecteur",
    "definition": "Connecteur utilisé pour annoncer une conséquence logique de ce qui précède.",
    "variants": ["ainsi", "par consequent", "par conséquent"]
  }
]
```

## Règles de rédaction

La traduction arabe doit être courte. Si plusieurs traductions existent, choisir celle qui est la plus scolaire et la plus reconnaissable pour l'élève.

La `definition` doit rester en une phrase, maximum deux. Elle doit expliquer le rôle du mot dans le chapitre, pas recopier une définition longue du cours.

Le `symbol` est optionnel. Il est utile quand le terme est lié à une notation stable :

```json
{
  "term": "Ensemble des nombres réels",
  "arabic": "مجموعة الأعداد الحقيقية",
  "category": "concept",
  "symbol": "\\mathbb{R}",
  "definition": "Ensemble des nombres que l'on place sur la droite numérique.",
  "variants": ["nombres reels", "nombres réels", "ensemble des reels", "ensemble des réels", "R"]
}
```

Dans JSON, les backslashes LaTeX doivent être doublés : `\\mathbb{R}`.

## Injection dans le JSON

1. Ouvrir le fichier JSON de la fiche de révision.
2. Ajouter la clé `lexique` au niveau racine, après `header`.
3. Insérer les entrées sous forme de tableau JSON.
4. Vérifier que chaque entrée possède au minimum `term`, `arabic` et `definition`.
5. Ajouter `variants` seulement quand cela améliore réellement la détection.
6. Valider le JSON après modification.

Exemple minimal prêt à injecter :

```json
"lexique": [
  {
    "term": "Limite",
    "arabic": "نهاية",
    "category": "concept",
    "symbol": "\\lim",
    "definition": "Valeur vers laquelle une fonction ou une suite se rapproche quand la variable suit une direction donnée.",
    "variants": ["limites", "limite finie", "limite infinie"]
  },
  {
    "term": "Encadrement",
    "arabic": "حصر",
    "category": "concept",
    "definition": "Technique qui place une quantité entre deux expressions plus simples pour contrôler sa valeur.",
    "variants": ["encadrer", "encadre", "encadré", "encadree", "encadrée"]
  }
]
```

## Checklist avant validation

- Le mot aide vraiment à comprendre une notion, une notation ou une consigne.
- Le terme n'est ni trop large ni trop rare.
- Les variantes couvrent les pluriels, les accents manquants et les formes usuelles.
- La définition est courte, concrète et liée au chapitre.
- La traduction arabe est stable, scolaire et facile à reconnaître.
- Le JSON reste valide après ajout.
- Le lexique ne contient pas de doublon `term + category`.

Une fiche bien travaillée contient souvent entre 8 et 18 entrées de lexique. Moins si le chapitre est court, plus seulement si chaque terme apporte une vraie aide cognitive.
