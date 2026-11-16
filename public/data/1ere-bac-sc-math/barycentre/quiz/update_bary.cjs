const fs = require('fs');
const file = 'C:\\\\Users\\\\bdhma\\\\Coding\\\\mathplus V1.003\\\\public\\\\data\\\\1ere-bac-sc-math\\\\barycentre\\\\quiz\\\\barycentre_quiz.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const explanations = [
  "C'est la règle d'or du barycentre : il ne peut exister que si la somme de ses poids (masses) ne s'annule pas. Physiquement, on ne peut pas trouver le point d'équilibre d'un système dont la masse totale est nulle !",
  "La formule fondamentale $\\overrightarrow{AG} = \\frac{\\beta}{\\alpha + \\beta}\\overrightarrow{AB}$ est à connaître par cœur. Elle permet de placer G en partant de A. Ici, ça donne $3 / (1+3) = 3/4$.",
  "Règle de l'homogénéité : on peut multiplier ou diviser tous les coefficients par un même nombre non nul sans changer la position du barycentre. C'est comme convertir des kilos en grammes : le point d'équilibre reste strictement au même endroit.",
  "Un isobarycentre ('iso' signifiant 'égal') est le point d'équilibre parfait entre des masses identiques. Pour deux points, c'est obligatoirement le milieu géométrique du segment.",
  "Le théorème de réduction vectorielle est l'outil le plus puissant du chapitre. Il permet de fusionner plusieurs vecteurs partant d'un point $M$ quelconque vers les points de base, en un SEUL vecteur pointant vers $G$ (avec la somme des poids en coefficient).",
  "La formule des coordonnées est une simple moyenne pondérée. On multiplie l'abscisse de chaque point par son poids, et on divise le total par la somme des poids. $(2 \\times 2 + 1 \\times (-1)) / 3 = 1$.",
  "C'est une propriété géométrique absolue : par définition de la relation vectorielle $\\overrightarrow{AG} = k\\overrightarrow{AB}$, les vecteurs sont colinéaires, et puisqu'ils partagent le point A, les points A, B et G sont inévitablement alignés sur la même droite.",
  "Astuce classique : on réduit le membre de gauche avec le milieu $I$ (isobarycentre de $A (1)$ et $B (1)$). On obtient $\\|2\\overrightarrow{MI}\\| = AB$. Donc $2MI = AB$, soit $MI = AB/2$. L'ensemble des points à une distance fixe $R$ d'un point fixe $I$ est le cercle de centre $I$ et de rayon $R$.",
  "Technique de réduction double : à gauche on a $\\|2\\overrightarrow{MI}\\|$, à droite l'expression $\\overrightarrow{MA} - \\overrightarrow{MB}$ donne $\\overrightarrow{BA}$ par la relation de Chasles. On a donc $2MI = \\|\\overrightarrow{BA}\\| = AB$, d'où $MI = AB/2$, qui définit le cercle de diamètre $[AB]$.",
  "La règle de non-nullité de la masse s'applique quel que soit le nombre de points. La somme totale des coefficients doit différer de zéro. Ici $2 + x + 5 = x + 7$. L'explosion mathématique se produit uniquement pour $x = -7$.",
  "L'associativité (ou 'barycentre partiel') est la méthode incontournable pour construire un barycentre de 3 points. On regroupe deux points en leur barycentre partiel (affecté de la somme de leurs poids), puis on travaille avec le 3ème point.",
  "Dans un triangle $ABC$, l'isobarycentre des 3 sommets est exactement le point d'intersection des 3 médianes. Il est le point d'équilibre parfait si on pose des masses égales sur chaque sommet.",
  "Grâce au théorème d'associativité, on peut regrouper $(A,1)$ et $(C,1)$ au centre des diagonales, et $(B,1)$ et $(D,1)$ au même centre. Le barycentre final se trouve donc exactement au centre de symétrie du parallélogramme.",
  "La réduction d'une somme vectorielle est proportionnelle à la somme des poids ! $1+1+1+1 = 4$. C'est extrêmement pratique pour simplifier des expressions complexes dans l'espace ou le plan.",
  "Puisque la somme des poids est constante ($m + 1 - m = 1 \\neq 0$), le barycentre existe toujours. L'expression donnant $\\overrightarrow{AG_m} = (1-m)\\overrightarrow{AB}$ avec $m \\in \\mathbb{R}$ génère tous les vecteurs colinéaires possibles : c'est la droite entière.",
  "Propriété physique intuitive : si deux masses sont positives (ou toutes les deux négatives), le point d'équilibre se trouve forcément physiquement ENTRE ces deux masses, donc sur le segment fermé $[AB]$.",
  "Le piège ultime des normes vectorielles ! Une fois la réduction effectuée $\\|\\overrightarrow{MG}\\|$, on passe aux distances géométriques (en enlevant les barres et la flèche). On obtient la distance $MG$. C'est une distance variable selon la position de M, pas du tout la constante 1.",
  "Attention au signe négatif ! Somme des poids = $1+1-1=1$. Le calcul donne $x_G = \\frac{1(1) + 1(0) - 1(2)}{1} = -1$. De même $y_G = \\frac{1(0) + 1(1) - 1(2)}{1} = -1$. Le barycentre G atterrit au point de coordonnées $(-1, -1)$."
];

for (let i = 0; i < data.questions.length && i < explanations.length; i++) {
  data.questions[i].explanation = explanations[i];
}
fs.writeFileSync(file, JSON.stringify(data, null, 4));
console.log('Barycentre quiz explanations updated successfully!');
