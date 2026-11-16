# Intégration des annales FMP (2019–2025)

## Sources contrôlées

- `Concours par theme _FMP .pdf` : 128 pages d’énoncés classés par thème.
- `Solutions et Techniques Concnours FMP.pdf` : 28 pages de méthodes et corrigés correspondants.

Les références ont été croisées par code (`C.1`, `F.1`, etc.), année et numéro de QCM. L’extraction textuelle PDF peut déformer des fractions, radicaux, exposants et barres de module : toute formule ambiguë a été vérifiée visuellement avant transcription.

## Banque importée

Les deux PDF apportent **117 QCM FMP** aux annales Médecine : les 114 questions des sept thèmes principaux, plus trois questions d’équations et inéquations (`E.1` à `E.3`) conservées dans le thème applicatif `analyse`.

| Thème FMP | Domaine dans l’application | Nombre |
| --- | --- | ---: |
| `C` | Nombres complexes | 26 |
| `F` | Fonctions | 34 |
| `L` | Limites et continuité | 4 |
| `S` | Suites | 17 |
| `I` | Intégrales | 20 |
| `G` | Géométrie de l’espace | 6 |
| `P` | Probabilités | 7 |
| `E` | Équations et inéquations | 3 |

| Année | QCM FMP importés |
| --- | ---: |
| 2019 | 15 |
| 2020 | 20 |
| 2021 | 20 |
| 2022 | 20 |
| 2023 | 14 |
| 2024 | 14 |
| 2025 | 14 |

Le sous-ensemble FMP 2019–2025 contient **304 QCM** : 281 dans les annales annuelles et 23 dans les deux banques thématiques. La banque Médecine complète compte désormais 403 QCM après l'ajout de 99 QCM historiques sourcés séparément.

## Politique de transcription et de correction

Chaque question FMP possède `sourceReference`, `officialQuestionCode`, une explication et une réponse unique. Les énoncés et choix sont stockés en LaTeX textuel, pas en images ; toute formule est placée entre `$...$` et chaque antislash est doublé dans le JSON.

Quelques sources sont mathématiquement ambiguës ou incohérentes. La banque privilégie alors l’énoncé et le calcul exact, avec un statut `answerValidation` explicite :

- F.8 et I.5 (2020) ajoutent une option `F` « Aucune des propositions A à E n’est correcte », car le résultat exact est absent des cinq choix sources.
- S.1 et P.1 (2019), S.16 (2024) et F.33 (2025) corrigent une conclusion erronée ou un calcul incompatible dans le corrigé PDF.
- Les questions à plusieurs assertions vraies (notamment F.4, S.2, F.24 et F.30) sont reformulées en QCM à réponse unique sans modifier le contenu mathématique.

## Contrôles effectués

- 622 QCM de concours contrôlés (155 ENSA, 403 Médecine, 64 ENSAM) ;
- JSON valide, identifiants uniques, type `mcq` et exactement une réponse correcte pour chaque question ;
- 6 049 segments LaTeX/KaTeX validés, sans formule hors délimiteur ;
- compteurs des annales et des thèmes synchronisés avec `schools.json`.

Les données sont intégrées directement aux banques annuelles dans `public/data/concours/medecine/`.
