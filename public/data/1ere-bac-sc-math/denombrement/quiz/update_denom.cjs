const fs = require('fs');
const file = 'C:\\\\Users\\\\bdhma\\\\Coding\\\\mathplus V1.003\\\\public\\\\data\\\\1ere-bac-sc-math\\\\denombrement\\\\quiz\\\\denombrement_quiz.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const explanations = [
  "C'est une convention mathématique fondamentale : l'ensemble vide, noté $\\emptyset$, ne contient par définition aucun élément. Sa taille (son cardinal) est donc logiquement et abstraitement fixée à $0$.",
  "Le principe additif est la base absolue du comptage ! Si vous divisez votre problème en deux ensembles $A$ et $B$ qui n'ont AUCUN point commun (intersection vide), le nombre total de solutions est simplement l'addition stricte des deux groupes : $+$. ",
  "C'est l'essence du principe multiplicatif, symbolisé par un arbre de choix. Si vous avez $n_1$ choix pour l'entrée, ET $n_2$ choix pour le plat principal, le mot 'ET' déclenche la grande loi mathématique de la multiplication.",
  "La répétition est le mot clé. Pour remplir $p$ cases, et si on a toujours le choix entre les mêmes $n$ éléments pour chaque case (comme un cadenas à code avec 10 chiffres pour chaque molette), on va multiplier les choix par eux-mêmes $p$ fois, d'où $n \\times n \\dots = n^p$.",
  "Le piège majeur ! Une permutation d'un ensemble de $n$ éléments est un arrangement SANS répétition de l'intégralité de ces $n$ éléments. On les utilise tous une et une seule fois (comme anagrammer un mot de lettres distinctes). Cela donne $A_n^n = n!$.",
  "Un arrangement sans répétition (comme le loto ou la course PMU avec ordre final) c'est une combinaison OÙ l'ordre compte. On tire $p$ éléments parmi $n$. Le calcul est $n(n-1)...(n-p+1)$, ce qui se compacte en $\\frac{n!}{(n-p)!}$.",
  "Pour obtenir une combinaison $C_n^p$ (sous-ensemble en vrac, ordre inutile) on retire l'ordre aux arrangements correspondants en les divisant par le nombre de permutations possibles des $p$ éléments choisis, d'où l'apparition au dénominateur du facteur correctif $p!$.",
  "Le secret pour ne plus jamais se tromper : si inverser deux éléments change la nature du résultat (ex: un mot de passe ou un podium), c'est l'ORDRE, donc un ARRANGEMENT. Sinon (une main de poker ou le loto), c'est en vrac, on parle de COMBINAISON.",
  "La hiérarchie mentale du dénombrement se passe toujours ainsi. 1ère barrière: L'ordre importe-t-il ? (Un mot vs Une équipe). 2ème barrière : A-t-on le droit de réutiliser un élément (La valise à code vs L'élection d'un bureau).",
  "Tirer 3 élèves parmi 10 pour former une équipe sportive revient strictement, mathématiquement et logiquement, à pointer du doigt les 7 élèves qui vont... rester sur le banc de touche ! Les combinaisons sont symétriques par rapport au milieu : p ou n-p.",
  "La formule du Triangle de Pascal ($C_n^p + C_n^{p+1} = C_{n+1}^{p+1}$) est un joyau algébrique et un outil itératif formidable. Chaque coefficient est calculé par la stricte addition des deux coefficients placés directement ou en diagonale au-dessus de lui.",
  "Le Crible de Poincaré pour deux ensembles vous oblige à ne pas 'compter double' ! Si on ajoute simplement tous les éléments de A et tous ceux de B, l'intersection (les éléments qui sont dans les deux camps à la fois) a été comptée 2 fois. Il faut impérativement la retrancher une fois.",
  "Un produit cartésien $E \\times F$ représente la formation de couples stricts (x, y). Pour dessiner cela, imaginez un grand damier ou un tableau à double entrée. Le nombre de cases du tableau est le produit exact du nombre de colonnes par le nombre de lignes.",
  "Chaque élément face à l'ensemble $E$ de taille $n$ a un statut binaire très tranché : soit il est 'IN' (dans le sous-ensemble), soit il est 'OUT'. Cela fait $2$ choix possibles par élément. Principe multiplicatif : $2 \\times 2 \\dots \\times 2 = 2^n$.",
  "Développer Newton à la main est une mécanique bien huilée ! On sort le triangle de Pascal (ou la calculatrice) pour trouver les combinaisons $C_n^k$, on remplace les facteurs $a$ et $b$ correspondants, et l'exposant de l'un grimpe pendant que l'autre descend.",
  "Le paramètre clé du bînome de Newton, c'est que la SOMME des exposants de a et de b à chaque étape vaut toujours strictement et indéfectiblement $n$. Les facteurs de multiplication sont pilotés par les coefficients binomiaux (les fameux $C_n^k$).",
  "Un 'comité' de personnes est un ensemble non hiérarchique : le fait de choisir Ali puis Omar est exactement identique à trouver Omar puis Ali assis autour de la table. Pas d'ordre = pas d'arrangements ! On utilise exclusivement la combinaison.",
  "L'anagramme avec lettres identiques détruit l'unicité. Les 3 lettres 'A' pourraient se mélanger entre elles ($3!$ fois) sans que le mot global ne soit modifié à nos yeux. On doit diviser le total faramineux par le produit des factorielles des lettres répétées pour écraser ces 'faux-semblants'.",
  "Pour 3 ensembles, on applique la formule d'inclusion-exclusion globale : on additionne les 3 cercles $A+B+C$, on retire les 3 intersections doubles qui ont été comptées de trop, mais ce faisant (attention !), on a supprimé une fois de trop le centre du diagramme, on doit donc rajouter $+ \\text{Card}(A \\cap B \\cap C)$.",
  "Un code (PIN, cadenas, wifi) ou un 'mot' au sens large suit le modèle de l'arrangement avec répétition. Sur les 4 molettes du cadenas, le chiffre va de 0 à 9, soit toujours 10 options indépendantes. Le principe multiplicatif claque : $10 \\times 10 \\times 10 \\times 10 = 10\\,000$ mots possibles."
];

for (let i = 0; i < data.questions.length && i < explanations.length; i++) {
  data.questions[i].explanation = explanations[i];
}
fs.writeFileSync(file, JSON.stringify(data, null, 4));
console.log('Denombrement quiz explanations updated successfully!');
