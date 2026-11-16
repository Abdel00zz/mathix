/* Data: Programme officiel & Orientations — Tronc Commun Sc., 1ère Bac Sc. Ex. & 1ère Bac Sc. Math */
(function (global) {
  'use strict';
  const root = global.MathFlowOrientationData || (global.MathFlowOrientationData = { classes: {} });

  root.classes['tronc-commun-sc'] = {
    id: 'tronc-commun-sc', shortLabel: 'Tronc Commun Sc.', title: 'Tronc Commun Scientifique',
    domains: [
      { id: 'algebre', label: 'Algèbre' },
      { id: 'analyse', label: 'Analyse' },
      { id: 'geometrie', label: 'Géométrie' },
      { id: 'statistiques', label: 'Statistiques' }
    ],
    chapters: [
      { chId: 'arithmetique-n', domain: 'algebre', title: "Arithmétique dans $\\mathbb{N}$",
        contents: ["Nombres pairs et impairs ; multiples et diviseurs d'un entier ;", "Nombres premiers et décomposition en produit de facteurs premiers ;", "$\\text{PGCD}(a,b)$, $\\text{PPCM}(a,b)$ et algorithme d'Euclide."],
        capacities: ["Utiliser la parité et la décomposition en facteurs premiers pour résoudre des problèmes arithmétiques ;", "Déterminer le PGCD et le PPCM de deux entiers naturels."] },
      { chId: 'ensembles-nombres', domain: 'algebre', title: "Les ensembles de nombres $\\mathbb{N}, \\mathbb{Z}, \\mathbb{D}, \\mathbb{Q}, \\mathbb{R}$",
        contents: ["Inclusions $\\mathbb{N} \\subset \\mathbb{Z} \\subset \\mathbb{D} \\subset \\mathbb{Q} \\subset \\mathbb{R}$ et opérations dans $\\mathbb{R}$ ;", "Puissances à exposants entiers relatifs, écriture scientifique et racines carrées ;", "Identités remarquables usuelles (degré 2 et 3)."],
        capacities: ["Reconnaître la nature d'un nombre et maîtriser le calcul algébrique sur les radicaux et fractions ;", "Développer, factoriser et simplifier des expressions algébriques."] },
      { chId: 'ordre-ir', domain: 'algebre', title: "L'ordre dans $\\mathbb{R}$",
        contents: ["Ordre et opérations dans $\\mathbb{R}$, intervalles bornés et non bornés ;", "Valeur absolue $|x|$, distance $|x-y|$ et inégalité triangulaire ;", "Encadrements, approximations décimales par défaut et par excès."],
        capacities: ["Comparer deux réels et encadrer une somme, une différence, un produit ou un quotient ;", "Traduire $|x-a| \\le r$ en termes d'intervalle et de distance."] },
      { chId: 'polynomes', domain: 'algebre', title: "Les polynômes",
        contents: ["Définition d'un polynôme, degré $\\deg(P)$ et égalité de deux polynômes ;", "Opérations sur les polynômes, racine $\\alpha$ ($P(\\alpha)=0$) et division euclidienne par $x-\\alpha$."],
        capacities: ["Effectuer la division euclidienne de $P(x)$ par $x-\\alpha$ (méthode de Horner ou posée) ;", "Factoriser un polynôme de degré 2 ou 3 connaissant une racine."] },
      { chId: 'equations-inequations', domain: 'algebre', title: "Équations, inéquations et systèmes",
        contents: ["Équations et inéquations du 1er et 2nd degré à une inconnue (discriminant $\\Delta$, relations coefficients-racines) ;", "Tableaux de signes d'expressions factorisées ou quotients ;", "Systèmes linéaires de 2 équations à 2 inconnues (déterminant de Cramer) et régionnement du plan."],
        capacities: ["Résoudre des équations et inéquations du second degré et étudier le signe d'un trinôme $ax^2+bx+c$ ;", "Résoudre algébriquement et graphiquement un système linéaire $2\\times 2$."] },
      { chId: 'generalites-fonctions', domain: 'analyse', title: "Généralités sur les fonctions numériques",
        contents: ["Ensemble de définition $D_f$, représentation graphique $C_f$ et parité (paire/impaire) ;", "Sens de variation, taux d'accroissement, extremums sur un intervalle ;", "Étude des fonctions de référence : $x\\mapsto ax^2+bx+c$ (parabole) et $x\\mapsto \\frac{ax+b}{cx+d}$ (hyperbole)."],
        capacities: ["Déterminer $D_f$, étudier la parité et dresser le tableau de variations d'une fonction ;", "Tracer la courbe d'un trinôme ou d'une fonction homographique et résoudre graphiquement $f(x)=g(x)$."] },
      { chId: 'calcul-trigo', domain: 'analyse', title: "Calcul trigonométrique",
        contents: ["Cercle trigonométrique, radian, abscisse curviligne et mesure principale ;", "Cosinus, sinus et tangente d'un nombre réel ; angles associés ($-x, \\pi\\pm x, \\frac{\\pi}{2}\\pm x$) ;", "Équations et inéquations trigonométriques fondamentales ($\\cos x=a$, $\\sin x=b$, $\\tan x=c$)."],
        capacities: ["Simplifier des expressions trigonométriques à l'aide des relations fondamentales ;", "Résoudre des équations et inéquations trigonométriques sur $\\mathbb{R}$ ou sur un intervalle borné."] },
      { chId: 'calcul-vectoriel', domain: 'geometrie', title: "Calcul vectoriel dans le plan",
        contents: ["Égalité de deux vecteurs, somme vectorielle, relation de Chasles et produit par un scalaire ;", "Colinéarité de deux vecteurs, alignement de trois points et caractérisation vectorielle du milieu."],
        capacities: ["Exprimer un vecteur comme combinaison linéaire et démontrer l'alignement ou le parallélisme."] },
      { chId: 'projection-plan', domain: 'geometrie', title: "La projection dans le plan",
        contents: ["Projection sur une droite parallèlement à une droite, projection orthogonale ;", "Théorème de Thalès direct et réciproque sous forme vectorielle, conservation du coefficient de colinéarité."],
        capacities: ["Construire le projeté d'un point et appliquer la conservation du rapport de colinéarité."] },
      { chId: 'droite-plan', domain: 'geometrie', title: "La droite dans le plan",
        contents: ["Repère $(O;\\vec{i},\\vec{j})$, coordonnées d'un point/vecteur et condition de colinéarité $\\det(\\vec{u},\\vec{v})=0$ ;", "Représentation paramétrique et équation cartésienne $ax+by+c=0$ d'une droite (vecteur directeur)." ],
        capacities: ["Déterminer une équation cartésienne ou paramétrique de droite et étudier l'intersection de deux droites."] },
      { chId: 'transformations-plan', domain: 'geometrie', title: "Transformations dans le plan",
        contents: ["Symétrie axiale, symétrie centrale, translation de vecteur $\\vec{u}$ et homothétie $h(\\Omega,k)$ ;", "Propriété caractéristique vectorielle de l'homothétie $\\overrightarrow{\\Omega M'}=k\\overrightarrow{\\Omega M}$ et conservation de l'alignement et des angles."],
        capacities: ["Reconnaître une transformation plane et déterminer l'image de droites, segments et cercles."] },
      { chId: 'produit-scalaire', domain: 'geometrie', title: "Le produit scalaire dans le plan",
        contents: ["Formule trigonométrique $\\vec{u}\\cdot\\vec{v}=\\|\\vec{u}\\|\\|\\vec{v}\\|\\cos(\\vec{u},\\vec{v})$, symétrie et bilinéarité ;", "Orthogonalité, théorème d'Al-Kashi, théorème de la médiane et relations métriques dans le triangle rectangle."],
        capacities: ["Calculer des longueurs, des produits scalaires et des mesures d'angles dans un triangle."] },
      { chId: 'geometrie-espace', domain: 'geometrie', title: "La géométrie dans l'espace",
        contents: ["Axiomes d'incidence, positions relatives de droites et de plans dans l'espace ;", "Parallélisme et orthogonalité (droite/droite, droite/plan, plan/plan) ; solides usuels."],
        capacities: ["Déterminer la section plane d'un solide et prouver le parallélisme ou l'orthogonalité dans l'espace."] },
      { chId: 'statistiques', domain: 'statistiques', title: "Statistiques descriptives",
        contents: ["Population, caractère discret ou continu (classes), effectifs et fréquences cumulées ;", "Paramètres de position (mode, moyenne $\\bar{x}$, médiane) et de dispersion (étendue, écart moyen, variance $V$, écart-type $\\sigma$)."],
        capacities: ["Organiser des données, tracer des diagrammes et interpréter la moyenne, la médiane et l'écart-type."] }
    ]
  };

  root.classes['1ere-bac-sc-ex'] = {
    id: '1ere-bac-sc-ex', shortLabel: '1ère Bac Sc. Ex.', title: '1ère Bac Sciences Expérimentales',
    domains: [
      { id: 'algebre', label: 'Algèbre' },
      { id: 'analyse', label: 'Analyse' },
      { id: 'geometrie', label: 'Géométrie' }
    ],
    chapters: [
      { chId: 'logique', domain: 'algebre', title: "Notions de logique mathématique",
        contents: ["Propositions, fonctions propositionnelles et quantificateurs ($\\forall$, $\\exists$) ;", "Connecteurs logiques ($\\neg, \\land, \\lor, \\Rightarrow, \\Leftrightarrow$) et lois logiques ;", "Raisonnements : contraposée, absurde, disjonction des cas, contre-exemple et récurrence."],
        capacities: ["Nier une proposition quantifiée et rédiger rigoureusement un raisonnement par récurrence ou par l'absurde."] },
      { chId: 'generalites-fonctions', domain: 'analyse', title: "Généralités sur les fonctions numériques",
        contents: ["Fonction majorée, minorée, bornée ; extremums d'une fonction ;", "Comparaison de deux fonctions et interprétation graphique ;", "Composée $g\\circ f$, monotonie de $g\\circ f$, fonctions $x\\mapsto \\sqrt{x+a}$ et $x\\mapsto ax^3$."],
        capacities: ["Étudier le bornage et les variations d'une fonction composée à partir des fonctions de référence."] },
      { chId: 'suites', domain: 'analyse', title: "Les suites numériques",
        contents: ["Suites numériques (définition explicite ou par récurrence), suites majorées, minorées, bornées ;", "Monotonie d'une suite ; suites arithmétiques et suites géométriques (terme général $u_n$ et somme $S_n$)."],
        capacities: ["Étudier la monotonie d'une suite et calculer $u_n$ et $S_n$ via une suite auxiliaire arithmétique ou géométrique."] },
      { chId: 'calcul-trigo', domain: 'analyse', title: "Calcul trigonométrique",
        contents: ["Formules d'addition ($\\cos(a\\pm b), \\sin(a\\pm b), \\tan(a\\pm b)$) et de duplication ($\\cos 2a, \\sin 2a$) ;", "Transformation de $a\\cos x + b\\sin x$ et de sommes en produits ; équations et inéquations trigonométriques."],
        capacities: ["Linéariser ou factoriser une expression trigonométrique et résoudre $a\\cos x+b\\sin x=c$."] },
      { chId: 'limites', domain: 'analyse', title: "Limites d'une fonction numérique",
        contents: ["Limites finies et infinies en un point $x_0$ (droite/gauche) et en $\\pm\\infty$ ;", "Opérations sur les limites, limites de fonctions polynômes, rationnelles, irrationnelles et trigonométriques ($\\lim_{x\\to 0}\\frac{\\sin x}{x}=1$) ;", "Théorèmes de comparaison et des gendarmes."],
        capacities: ["Lever les formes indéterminées ($0/0, \\infty/\\infty, +\\infty-\\infty, 0\\times\\infty$) par factorisation, conjugué ou encadrement."] },
      { chId: 'derivation', domain: 'analyse', title: "La dérivation et ses applications",
        contents: ["Dérivabilité en $x_0$, nombre dérivé $f'(x_0)$, équation de la tangente et approximation affine ;", "Dérivabilité à droite et à gauche (demi-tangentes) ; dérivées des fonctions usuelles et opérations ($u\\cdot v, u/v, u^n, \\sqrt{u}$) ;", "Signe de $f'(x)$, variations de $f$, extremums locaux et équation différentielle $y''+\\omega^2 y=0$."],
        capacities: ["Calculer la dérivée d'une fonction, étudier ses variations et déterminer ses tangentes."] },
      { chId: 'etude-fonctions', domain: 'analyse', title: "Étude et représentation graphique des fonctions",
        contents: ["Branches infinies : asymptotes verticales, horizontales, obliques et branches paraboliques ;", "Concavité d'une courbe, point d'inflexion (signe de $f''$), axe et centre de symétrie."],
        capacities: ["Mener l'étude complète d'une fonction (polynôme, rationnelle, irrationnelle ou trigo) et tracer $C_f$."] },
      { chId: 'barycentre', domain: 'geometrie', title: "Le barycentre dans le plan",
        contents: ["Point pondéré, barycentre de 2, 3 ou 4 points, invariance par homogénéité ;", "Associativité du barycentre (barycentre partiel) et coordonnées dans un repère."],
        capacities: ["Utiliser le barycentre pour démontrer un alignement, un concours de droites ou déterminer un lieu géométrique."] },
      { chId: 'produit-scalaire-plan', domain: 'geometrie', title: "Produit scalaire dans le plan et applications",
        contents: ["Expression analytique $\\vec{u}\\cdot\\vec{v}=xx'+yy'$ en repère orthonormé, norme et distance ;", "Vecteur normal à une droite, distance d'un point à une droite ;", "Équation cartésienne et représentation paramétrique d'un cercle ; position droite/cercle."],
        capacities: ["Déterminer l'équation d'une droite ou d'un cercle, calculer la distance point-droite et trouver la tangente à un cercle."] },
      { chId: 'rotation-plan', domain: 'geometrie', title: "La rotation dans le plan",
        contents: ["Définition d'une rotation $R(\\Omega,\\alpha)$, réciproque et conservation de la distance et des angles orientés ;", "Image d'une droite, d'un segment, d'un cercle et du barycentre par une rotation."],
        capacities: ["Utiliser une rotation pour démontrer des propriétés géométriques de longueurs et d'angles."] },
      { chId: 'vecteurs-espace', domain: 'geometrie', title: "Les vecteurs de l'espace",
        contents: ["Calcul vectoriel dans l'espace, vecteurs colinéaires et définition vectorielle d'une droite ;", "Vecteurs coplanaires et définition vectorielle d'un plan ; parallélisme dans l'espace."],
        capacities: ["Exprimer un vecteur dans une base de l'espace et établir la coplanarité de quatre points."] },
      { chId: 'geometrie-analytique-espace', domain: 'geometrie', title: "Géométrie analytique dans l'espace",
        contents: ["Coordonnées dans un repère $(O;\\vec{i},\\vec{j},\\vec{k})$, déterminant de trois vecteurs ;", "Représentation paramétrique d'une droite et d'un plan ; équation cartésienne d'un plan ; deux équations d'une droite."],
        capacities: ["Étudier analytiquement le parallélisme et l'intersection de droites et de plans dans l'espace."] },
      { chId: 'produit-scalaire-espace', domain: 'geometrie', title: "Produit scalaire dans l'espace",
        contents: ["Expression analytique $xx'+yy'+zz'$ en repère orthonormé, orthogonalité et norme ;", "Vecteur normal à un plan, distance d'un point à un plan et étude analytique de la sphère."],
        capacities: ["Déterminer l'équation d'un plan défini par un point et un vecteur normal ;", "Étudier l'intersection d'une sphère et d'un plan ou d'une droite."] }
    ]
  };

  root.classes['1ere-bac-sc-math'] = {
    id: '1ere-bac-sc-math', shortLabel: '1ère Bac Sc. Math', title: '1ère Bac Sciences Mathématiques',
    domains: [
      { id: 'algebre', label: 'Algèbre' },
      { id: 'analyse', label: 'Analyse' },
      { id: 'geometrie', label: 'Géométrie' },
      { id: 'probabilites', label: 'Dénombrement' }
    ],
    chapters: [
      { chId: 'logique', domain: 'algebre', title: "Notions de logique",
        contents: ["Propositions, lois logiques, quantificateurs multiples et négation ;", "Raisonnements : déduction, contraposée, absurde, disjonction des cas, contre-exemple, récurrence simple et forte."],
        capacities: ["Traduire des énoncés à l'aide des quantificateurs et choisir la méthode de démonstration appropriée."] },
      { chId: 'ensembles-app', domain: 'algebre', title: "Les ensembles et les applications",
        contents: ["Ensemble des parties $\\mathcal{P}(E)$, inclusion, intersection, réunion, complémentaire, différence symétrique $A\\Delta B$, produit cartésien ;", "Applications : injectivité, surjectivité, bijectivité, application réciproque $f^{-1}$, image directe $f(A)$ et réciproque $f^{-1}(B)$, composition $g\\circ f$."],
        capacities: ["Démontrer l'égalité de deux ensembles et établir qu'une application est bijective en explicitant $f^{-1}$."] },
      { chId: 'arithmetique', domain: 'algebre', title: "Arithmétique dans $\\mathbb{Z}$",
        contents: ["Divisibilité dans $\\mathbb{Z}$, division euclidienne, congruence modulo $n$ ($a\\equiv b\\,[n]$) ;", "$\\text{PGCD}$, algorithme d'Euclide, nombres premiers entre eux, théorèmes de Bézout et de Gauss ;", "Nombres premiers, théorème fondamental de l'arithmétique et $\\text{PPCM}$."],
        capacities: ["Utiliser les congruences et les théorèmes de Bézout et Gauss pour résoudre dans $\\mathbb{Z}^2$ l'équation $ax+by=c$."] },
      { chId: 'generalites-fonctions', domain: 'analyse', title: "Généralités sur les fonctions",
        contents: ["Bornage, extremums, monotonie, parité et périodicité ;", "Fonction partie entière $E(x)$, composée $g\\circ f$ et transformations graphiques ($f(x+a)+b$, $|f(x)|$)."],
        capacities: ["Résoudre des équations et inéquations comportant la partie entière $E(x)$ et étudier une composée."] },
      { chId: 'suites', domain: 'analyse', title: "Les suites numériques",
        contents: ["Suites majorées, minorées, bornées, suites monotones ;", "Suites arithmétiques et géométriques, sommes $\\sum_{k=1}^n k$, $\\sum_{k=1}^n k^2$, suites récurrentes $u_{n+1}=au_n+b$ et homographiques."],
        capacities: ["Utiliser le raisonnement par récurrence et les suites auxiliaires pour expliciter $u_n$."] },
      { chId: 'trigonometrie', domain: 'analyse', title: "Calcul trigonométrique",
        contents: ["Formules d'addition, duplication, linéarisation et transformation de produits en sommes (et inversement) ;", "Transformation de $a\\cos x+b\\sin x=r\\cos(x-\\varphi)$, équations et inéquations trigonométriques."],
        capacities: ["Maîtriser les transformations trigonométriques et résoudre des équations et systèmes trigonométriques."] },
      { chId: 'limites', domain: 'analyse', title: "Limites d'une fonction numérique",
        contents: ["Définitions quantifiées de la limite (finie ou infinie), unicité et opérations ;", "Limites des fonctions polynômes, rationnelles, irrationnelles, trigonométriques et partie entière ; théorèmes de comparaison."],
        capacities: ["Calculer des limites en levant toutes les formes indéterminées classiques."] },
      { chId: 'derivation', domain: 'analyse', title: "La dérivation et ses applications",
        contents: ["Nombre dérivé, interprétation géométrique et cinématique, approximation affine ;", "Opérations sur les fonctions dérivables, dérivée de $g\\circ f$, dérivées successives $f^{(n)}$ ;", "Monotonie, extremums et équation différentielle $y''+\\omega^2 y=0$."],
        capacities: ["Déterminer la dérivée $n$-ième de fonctions usuelles et exploiter le signe de $f'$ dans des problèmes d'optimisation."] },
      { chId: 'etude-fonctions', domain: 'analyse', title: "Représentation graphique d'une fonction",
        contents: ["Branches infinies (asymptotes et directions asymptotiques), convexité, concavité et points d'inflexion ;", "Éléments de symétrie (axe $x=a$, centre $\\Omega(a,b)$) et domaine d'étude réduit."],
        capacities: ["Mener l'étude complète d'une fonction numérique et construire avec soin sa courbe $C_f$."] },
      { chId: 'barycentre', domain: 'geometrie', title: "Le barycentre dans le plan",
        contents: ["Barycentre de $n$ points pondérés ($2\\le n\\le 4$), homogénéité, réduction de $\\sum \\alpha_i \\overrightarrow{MA_i}$ et associativité ;", "Coordonnées du barycentre et lignes de niveau."],
        capacities: ["Utiliser l'associativité du barycentre pour démontrer des alignements, concours et lieux géométriques."] },
      { chId: 'produit-scalaire', domain: 'geometrie', title: "Analytique du produit scalaire dans le plan",
        contents: ["Expression analytique en repère orthonormé, inégalité de Cauchy-Schwarz ;", "Droite définie par un vecteur normal, distance point-droite, bissectrices ;", "Cercle, tangente, puissance d'un point et axe radical."],
        capacities: ["Résoudre analytiquement des problèmes d'angles, de distances et de tangence dans le plan."] },
      { chId: 'rotation', domain: 'geometrie', title: "La rotation dans le plan",
        contents: ["Rotation $R(\\Omega,\\theta)$, propriétés de conservation (distances, angles orientés, barycentre, figures) ;", "Composée de deux rotations et lien avec les translations."],
        capacities: ["Employer une rotation judicieusement choisie pour résoudre un problème de construction ou de lieu."] },
      { chId: 'vecteurs-espace', domain: 'geometrie', title: "Vecteurs de l'espace et géométrie analytique",
        contents: ["Vecteurs colinéaires, coplanaires, base et repère de l'espace, déterminant de 3 vecteurs ;", "Représentations paramétriques et équations cartésiennes de droites et de plans."],
        capacities: ["Étudier analytiquement et vectoriellement les positions relatives de droites et de plans."] },
      { chId: 'produit-scalaire-espace', domain: 'geometrie', title: "Produit scalaire dans l'espace",
        contents: ["Définition, expression analytique dans un repère orthonormé, norme et distance ;", "Plan défini par un point et un vecteur normal, distance d'un point à un plan ;", "Sphère (équation cartésienne et paramétrique) et positions relatives sphère/plan et sphère/droite."],
        capacities: ["Déterminer un plan normal, l'équation d'une sphère et l'intersection sphère/plan."] },
      { chId: 'produit-vectoriel', domain: 'geometrie', title: "Produit vectoriel",
        contents: ["Orientation de l'espace, trièdre direct, définition de $\\vec{u}\\wedge\\vec{v}$, antisymétrie et bilinéarité ;", "Coordonnées de $\\vec{u}\\wedge\\vec{v}$ en base orthonormée directe ;", "Aire d'un triangle, équation d'un plan $(ABC)$, distance d'un point à une droite."],
        capacities: ["Calculer $\\vec{u}\\wedge\\vec{v}$ pour trouver un vecteur normal, calculer une aire ou la distance point-droite."] },
      { chId: 'denombrement', domain: 'probabilites', title: "Le dénombrement",
        contents: ["Cardinal d'un ensemble fini, principe de la somme et principe multiplicatif ;", "Nombre d'applications $p$-listes ($n^p$), arrangements $A_n^p$, permutations $n!$ et combinaisons $C_n^p$ ;", "Propriétés des $C_n^p$ (triangle de Pascal) et formule du binôme de Newton $(a+b)^n$."],
        capacities: ["Choisir le modèle de tirage adéquat (avec/sans remise, simultané) et appliquer le binôme de Newton."] }
    ]
  };

  var quizOnly1BacEx = {
    logique: 1, 'generalites-fonctions': 1, suites: 1, 'calcul-trigo': 1, limites: 1,
    derivation: 1, 'etude-fonctions': 1, barycentre: 1, 'produit-scalaire-plan': 1,
    'rotation-plan': 1, 'vecteurs-espace': 1, 'produit-scalaire-espace': 1
  };
  ['tronc-commun-sc', '1ere-bac-sc-ex', '1ere-bac-sc-math'].forEach(function (clsId) {
    var prog = root.classes[clsId];
    if (!prog || !Array.isArray(prog.chapters)) return;
    prog.chapters.forEach(function (ch) {
      ch.chapterId = ch.chId;
      ch.targetKind = clsId === '1ere-bac-sc-ex' && quizOnly1BacEx[ch.chId] ? 'quiz' : 'lesson';
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
