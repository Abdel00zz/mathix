# Audit de la banque FMP 2019-2025

## Source et couverture

Les deux PDF fournis constituent une banque de 117 questions FMP réellement
traçables, toutes converties en objets JSON `mcq` textuels.

| Année | Questions |
| --- | ---: |
| 2019 | 15 |
| 2020 | 20 |
| 2021 | 20 |
| 2022 | 20 |
| 2023 | 14 |
| 2024 | 14 |
| 2025 | 14 |

Répartition : 26 complexes, 75 analyse (fonctions, limites, suites et
intégrales), 6 géométrie de l’espace, 7 probabilités et 3 équations.

Dans le corpus FMP 2019–2025, les fichiers génériques 2012-2018 restent des
repères sans source FMP fournie. Les annales historiques disponibles par centre
sont maintenant importées dans des banques distinctes ; voir
`IMPORT_ANNALES_MEDECINE_LATEX.md`. Les quiz de secours non sourcés restent
retirés de la sélection concours.

## Structure retenue

Chaque question FMP conserve :

- un identifiant stable (`med-fmp-2024-f30`) ;
- `sourceReference` et `officialQuestionCode` pour la traçabilité ;
- l’énoncé et les choix officiels sous forme de texte, sans URL d’image ;
- `theme`, `category`, une explication issue du corrigé et une clé validée ;
- `answerValidation` pour signaler une clé corrigée, un QCM à réponses
  multiples, ou une normalisation nécessaire lorsque la source ne contient
  aucune bonne proposition.

Les formules déjà délimitées par `$...$` sont validées par KaTeX. Le texte
mathématique provenant directement du PDF reste volontairement en Unicode
lorsque l’extraction ne permet pas de reconstituer une fraction avec certitude :
cela évite d’introduire du LaTeX faux ou cassé.

## Anomalies détectées et traitement

| Référence | Constat | Traitement dans la banque |
| --- | --- | --- |
| FMP 2019 S.1 | La limite est 0, non `+∞`. | Réponse A corrigée. |
| FMP 2019 P.1 | La conditionnelle vaut `2/3`, non `10/42`. | Réponse E corrigée. |
| FMP 2023 F.20 | La limite vaut 0. | Réponse B corrigée. |
| FMP 2024 S.16 | La récurrence correcte correspond à E ; C/D sont doublons. | Réponse E corrigée. |
| FMP 2025 F.33 | La solution est absente des choix proposés. | Réponse E corrigée. |
| FMP 2019 F.4, S.2, E.2 ; FMP 2023 F.24 ; FMP 2024 F.30, S.15 | Plusieurs propositions sont vraies. | Toutes les réponses mathématiquement valides sont acceptées et signalées. |
| FMP 2020 F.8, I.5 | Aucune proposition imprimée ne correspond à l’énoncé. | Une option explicite « aucune des propositions » a été ajoutée et documentée. |

## Contrôle reproductible

`scripts/build_medecine_fmp_from_pdfs.py` régénère les JSON à partir des deux
PDF. `scripts/validate-concours-data.mjs` vérifie les identifiants, le type QCM,
les choix, l’unicité des réponses (ou les exceptions explicitement déclarées),
l’absence de dépendances image et les segments KaTeX.
