# Quiz : actions visibles sur téléphone et tablette

Vérification du 13 septembre 2026. Modifications locales des quiz de chapitre et de concours ; aucune publication effectuée.

## Cause et correction

L'ancienne structure plaçait la barre d'actions après l'énoncé, les choix et l'explication, dans le `main` défilant. Elle ajoutait une hauteur minimale d'énoncé de 132 px, des choix d'au moins 68 px, plusieurs marges de 32 px et un padding final de 96 px sur téléphone. Réduire uniquement la police ne garantissait donc pas l'accès aux actions.

La nouvelle structure réserve trois zones : en-tête, contenu défilant, actions. La barre d'actions est une ligne flex non rétractable, extérieure au défilement. Elle ne recouvre aucun texte. Le contenu repart en haut au changement de question, mais conserve sa position lors de la validation.

Le budget vertical est :

`hauteur du contenu = hauteur dynamique du viewport − en-tête − barre d'actions − zones sûres du système`.

`100dvh` suit la hauteur disponible ; `min-height: 0` permet au contenu de rétrécir ; les unités de conteneur `cqh` adaptent les marges à la place laissée par l'en-tête. Sous 680 px de hauteur de conteneur, les espacements sont réduits davantage. Les fractions, tableaux et images conservent leur hauteur naturelle. Aucun texte n'est tronqué ou réduit par une transformation globale.

Les boutons d'action et les flèches de classement ont une cible minimale de 44 × 44 px. Les choix font au moins 48 px en mode compact et 52 px sinon ; leur hauteur augmente pour les réponses multilignes. Les textes de choix varient entre 16 et 18 px à taille racine normale. Le français reste LTR, même lorsque les actions sont en arabe RTL. La barre respecte les zones sûres et conserve une réserve latérale pour les outils du professeur sur tablette.

## Mesures dans le navigateur

Banc local `tmp/quiz-layout-audit.html` utilisant le vrai composant `QuizCore`, `MathRenderer`, KaTeX, les styles du projet et les polices Quicksand / IBM Plex Sans Arabic. Données de démonstration reprenant le QCM de la capture. En-tête de 52 px et barre d'actions d'environ 61 px. Dimensions en pixels CSS ; mesures arrondies.

| Viewport | Hauteur disponible pour lire | Contenu avec correction | Défilement nécessaire | Actions toutes visibles |
| --- | ---: | ---: | ---: | --- |
| 320 × 568 | 455 | 545 | 90 | Oui |
| 360 × 640 | 527 | 521 | 0 | Oui |
| 390 × 780 | 667 | 573 | 0 | Oui |
| 768 × 1024 | 911 | 515 | 0 | Oui |
| 1024 × 768 | 655 | 485 | 0 | Oui |
| 844 × 390 | 278 | 433 | 155 | Oui |

Pour 360 × 640 : `640 − 52 − 60,8 = 527,2 px`, pour environ 521 px de contenu. L'exemple tient donc avec la correction. Sur le plus petit écran et en paysage très court, les boutons restent visibles mais la correction doit défiler ; réduire davantage tous les caractères nuirait à la lecture.

Aucun débordement horizontal de la zone de lecture sur ces six cas.

## Vérifications effectuées

- Sélection, état désactivé de « Valider », validation, « Suivant », « Passer » et retour en haut de la question suivante.
- Cas QCM, formules avec fraction, vrai/faux, classement et recherche d'erreur : validation fonctionnelle et aucun élément `.katex-error` dans les cas testés.
- Arabe sur 320 × 568 : inversion des actions, trois commandes présentes avant sélection, absence de débordement horizontal.
- Question volontairement longue : sélection après défilement, correction atteignable jusqu'en bas ; son bord inférieur reste au-dessus des actions. « Suivant » reste visible et réinitialise le défilement.
- Six flèches de classement mesurées à 44 × 44 px.
- `npm run type-check` : réussi.
- Tests ciblés quiz et parseur : 37 tests réussis dans 5 fichiers.
- `npm run build` : réussi. Validation du contenu : 71 chapitres, 498 exercices, 0 erreur, 16 avertissements. Le build signale aussi deux avertissements d'import statique/dynamique existants.

Ces mesures sont des tests de viewport dans le navigateur de bureau, pas une exécution matérielle sur Android ou Safari iPad. Le clavier virtuel, les encoches réelles et une session professeur connectée avec stylet n'ont pas été exercés sur appareil.

## Fichiers principaux

- `src/components/Quiz/QuizCore.tsx` : séparation lecture/actions, position de lecture et cartes compactes.
- `src/styles/components/quiz-layout.css` : calculs de disposition, densité, zones sûres et cibles tactiles.
- `src/components/Quiz/QuizOptions.tsx`, `QuizOrderQuestion.tsx`, `QuizErrorQuestion.tsx` : choix compacts, alignement et navigation tactile.
- `src/components/Views/QuizSessionView.tsx`, `ConcoursQuizView.tsx` : conteneurs à hauteur bornée et en-têtes compacts.

Le banc sous `tmp/` sert uniquement au développement ; il n'est pas une entrée de production.
