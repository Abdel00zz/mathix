# Import des annales Médecine LaTeX

## Règle éditoriale appliquée

Le contrat actif [`guide_concours.json`](./guide_concours.json) impose un seul format publiable : un QCM (`"type": "mcq"`) avec exactement une réponse correcte. Les sources ont donc été classées avant toute intégration ; aucune question ouverte ni QCM à réponses multiples n'a été transformé artificiellement.

Le convertisseur reproductible est [`scripts/import_medecine_tex_annales.mjs`](../scripts/import_medecine_tex_annales.mjs). Il conserve la provenance, les références de question et le corrigé source, puis normalise les raccourcis LaTeX vers des commandes KaTeX portables.

## Annales intégrées

| Source LaTeX | Banque générée | QCM publiés | Éléments isolés |
| --- | --- | ---: | --- |
| `01_oujda_2017_2018.tex` | `med_oujda_2017_2018.json` | 9 | Q5 : réponses B et D correctes |
| `02_oujda_2016_2017.tex` | `med_oujda_2016_2017.json` | 8 | Q4 : B et E ; Q5 : B, C et D |
| `04_rabat_2016.tex` | `med_rabat_2016.json` | 11 | Q2 : B et C correctes |
| `05_marrakech_2015.tex` | `med_marrakech_2015.json` | 10 | — |
| `06_oujda_2015_2016.tex` | `med_oujda_2015_2016.json` | 10 | — |
| `08_epreuve_2012_2013.tex` | `med_epreuve_2012_2013.json` | 10 | — |
| `10_epreuve_2012.tex` | `med_epreuve_2012.json` | 10 | — |
| `12_epreuve_2010_2011.tex` | `med_epreuve_2010_2011.json` | 10 | — |
| `17_epreuve_2009_2010.tex` | `med_epreuve_2009_2010.json` | 10 | — |
| `18_marrakech_2009.tex` | `med_marrakech_2009.json` | 11 | Q3 : aucune proposition source correcte |

Total intégré : **99 QCM Médecine historiques**.

Les cinq éléments isolés sont volontairement exclus du flux Concours. Ils nécessitent une réécriture éditoriale explicite avec des choix exclusifs ou une proposition corrigée, puis une validation mathématique humaine avant toute publication.

## Sources conservées hors banque QCM

Les huit sources ci-dessous sont des épreuves rédigées ou ouvertes ; elles ne sont pas des intrus et ne doivent pas être forcées dans la banque QCM.

- `03_casablanca_2016_2017.tex`
- `07_casablanca_2015_2016.tex`
- `09_casablanca_2012.tex`
- `11_casablanca_2011.tex`
- `13_casablanca_2010.tex`
- `14_rabat_juillet_2010.tex`
- `15_rabat_2010.tex`
- `16_casablanca_2009.tex`

Elles restent exploitables ultérieurement dans un module d'exercices rédigés, mais leur intégration au concours nécessiterait la création et la validation de distracteurs QCM — opération non automatique et non réalisée ici.

## Raccordement application

Les dix banques sont déclarées comme annales historiques distinctes dans `schools.json` et dans le manifeste Médecine. Les libellés contiennent le centre lorsqu'il est connu afin de ne pas mélanger des sessions différentes de la même année. Le tri des annales utilise maintenant la première année du libellé, ce qui conserve l'ordre chronologique des sessions académiques.
