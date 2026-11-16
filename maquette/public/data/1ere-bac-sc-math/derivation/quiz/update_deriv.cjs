const fs = require('fs');
const file = 'C:\\\\Users\\\\bdhma\\\\Coding\\\\mathplus V1.003\\\\public\\\\data\\\\1ere-bac-sc-math\\\\derivation\\\\quiz\\\\derivation_quiz.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const explanations = [
  "Le célèbre 'Taux d'Accroissement'. C'est exactement la formule de la Vitesse Moyenne en physique : $(DistanceFinale - DistanceInitiale) / (TempsFinal - TempsInitial)$. La limite réduit cet intervalle de temps à zéro pour figer une Vitesse Instantanée : le nombre dérivé.",
  "Un nombre dérivé DOIT être un nombre fini (un réel L). Si la limite donne l'infini ($+\\infty$ ou $-\\infty$), alors la tangente dresse un mur vertical. La courbe existe, la tangente existe (verticale), mais la fonction, elle, perd son statut de 'dérivable'.",
  "Pour s'en souvenir : le nombre dérivé EST une pente. Si la voiture (la courbe) monte une côte, le nombre dérivé est positif. Si elle descend, il est négatif. Si elle roule sur du plat, le nombre dérivé vaut 0.",
  "Pour retrouver l'équation de la tangente de tête, partez de la formule classique $y = mx + p$. Ici, $m$ correspond à la dérivée $f'(a)$. Comme la droite passe par $A(a; f(a))$, on écrit simplement $y - f(a) = f'(a)(x - a)$.",
  "Règle de \"la chute de l'exposant\" : l'exposant $n$ tombe devant le $x$ pour devenir un coefficient multiplicateur, et le nouvel exposant en l'air perd une unité de force (il devient $n-1$).",
  "Le cercle trigonométrique aide beaucoup. La dérivée correspond à une rotation de $90^\\circ$ dans le sens horaire. Le sinus (axe vertical haut) \"tourne\" et tombe sur le cosinus (axe horizontal droit).",
  "La dérivée de la tangente admet deux formules parfaitement équivalentes. L'une $(1 + \\tan^2 x)$ est géniale pour retrouver un lien direct avec la tangente. L'autre $(1 / \\cos^2 x)$ est idéale, car le cosinus au carré garantit que la dérivée est strictement positive.",
  "Le piège universel ! La dérivée d'un produit N'EST PAS le produit des dérivées. Il faut appliquer la règle du 'chacun son tour' : le premier $(u)$ se dérive pendant que le second $(v)$ se repose, PLUS l'inverse.",
  "Même structure que le produit, mais avec un MOINS au numérateur et un énorme $v^2$ au dénominateur. Astuce : commencez TOUJOURS par dériver le numérateur en premier (le 'u' qui est en haut) : $u'v - uv' / v^2$.",
  "L'approximation affine est la fonction \"Zoom\". Si on zoome infiniment sur une courbe près d'un point, elle devient indiscernable de sa tangente droite. D'où la substitution complexe de $f(a+h)$ par le calcul très simple $f(a) + h \\times f'(a)$.",
  "C'est la définition du point de raccordement parfait. Pour qu'une fonction soit dérivable globalement en un point, il faut que sa dérivée venant de gauche (freinage) soit rigoureusement identique à sa dérivée vers la droite (accélération).",
  "Le fameux point anguleux (comme le point $x=0$ pour la fonction Valeur Absolue). Deux moitiés d'autoroute se croisent brusquement sans raccordement fluide. Les deux demi-tangentes existent, mais elles ont des angles de pente différents.",
  "Imaginez un tremplin de skateboard ou un toboggan vertical. \"+$ \\infty$\" avec \"$a^+$\" (taux positif + avancée par la droite) indique que la courbe part brusquement à la verticale absolue vers le haut (pente infinie).",
  "La règle de la chaîne (Fonction Composée) ! Dérivez l'enveloppe extérieure normale $f'$, mais SURTOUT n'oubliez jamais de multiplier à la fin par la dérivée du cœur intérieur (ici la dérivée de $ax+b$ qui est $a$).",
  "La trinité de la Cinématique. $f(t)$ est le Compteur Kilométrique. La dérivée première $f'(t)$ est le Compteur de Vitesse (km/h). La dérivée seconde $f''(t)$ est l'Accélération (pédale enfoncée ou frein).",
  "Le tableau de variation est la radiographie de la fonction. Dérivée dans les POSITIFS (+) = courbe qui MONTE (croissance stricte). Dérivée dans les NÉGATIFS (-) = courbe qui POUFFLE vers le bas (décroissance).",
  "Un cas très précis : si la courbe 'se repose' un seul milliardième de seconde (pente zéro en un point isolé, comme la fonction Cube en zéro) puis repart à la hausse, elle n'a jamais décliné. Elle reste donc 'strictement' croissante.",
  "Théorème de Fermat tempéré : tout sommet de montagne (ou fond de vallée) possède une piste de ski totalement plate. Donc sa tangente DOIT y être horizontale ($f'(a)=0$). L'inverse n'est par contre pas systématique !",
  "Le filtre anti-doute ! Pour qu'une montagne soit un vrai pic (extremum), la pente (la dérivée) DOIT être positive (on monte) avant le sommet ET négative (on descend) après. Le signal $f'$ doit obligatoirement changer de $+ \to -$ ou inversement.",
  "L'erreur est d'oublier que la dérivée usuelle de $\\sqrt{x}$ est unique en son genre, elle \"chute\" sous une fraction : $\\dfrac{1}{2\\sqrt{x}}$. À maîtriser parfaitement car très utilisée en Physique et en Géométrie.",
  "Les puissances négatives trompent l'œil. Lorsque $-2$ \"perd 1 unité\", il ne devient pas $-1$, il s'enfonce dans les abîmes vers $-3$. Donc $(x^{-2})' = -2x^{-3}$. Ce qui donne $-\\dfrac{2}{x^3}$ et détruit l'illusion du $x^2$.",
  "C'est l'équation de l'Harmonique parfait (le ressort qui oscille ou le pendule régulier). C'est pourquoi on y retrouve un mélange algébrique du cosinus et de sinus purs, avec $\\omega$ qui contrôle la pulsation (la vitesse de l'aller-retour).",
  "C'est la marche à suivre infaillible du scientifique : 1) Armer l'outil (dériver). 2) Chercher la cible (annuler l'outil). 3) Scruter le terrain (étudier le signe autour de la cible). 4) Tirer la conclusion finale (calculer l'extremum).",
  "L'extension surpuissante de la règle de la dérivée de $\\sqrt{x}$. On applique la formule classique $1 / 2\\sqrt{u}$, à laquelle on intègre en plein vol la règle de la chaîne en multipliant tout le bilan par la dérivée intime $u'$.",
  "Attention double piège ! Dériver un cosinus force l'apparition d'un SIGNE MOINS (car $\\cos$ devient $-\\sin$). Et comme l'intérieur est $(2x+1)$, la règle de composition fait \"recracher\" un 2 géant devant. D'où $-2 \\sin(2x+1)$."
];

for (let i = 0; i < data.questions.length && i < explanations.length; i++) {
  data.questions[i].explanation = explanations[i];
}
fs.writeFileSync(file, JSON.stringify(data, null, 4));
console.log('Derivation quiz explanations updated successfully!');
