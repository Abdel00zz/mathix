/* Data: Programme officiel & Orientations — 2ème Bac Sc. Ex. & 2ème Bac Sc. Math */
(function (global) {
  'use strict';
  const root = global.MathFlowOrientationData || (global.MathFlowOrientationData = { classes: {} });

  root.classes['2eme-bac-sc-ex'] = {
    id: '2eme-bac-sc-ex', shortLabel: '2ème Bac Sc. Ex.', title: '2ème Bac Sciences Expérimentales',
    domains: [
      { id: 'algebre', label: 'Algèbre' },
      { id: 'analyse', label: 'Analyse' },
      { id: 'geometrie', label: 'Géométrie' },
      { id: 'probabilites', label: 'Probabilités' }
    ],
    chapters: [
      { chId: 'complexes', domain: 'algebre', title: "Les nombres complexes",
        contents: ["Écriture algébrique $z=a+ib$, conjugué $\\bar{z}$, module $|z|$, argument $\\arg(z)$ et forme trigonométrique ;", "Notation exponentielle $re^{i\\theta}$, formules d'Euler et de Moivre (linéarisation) ;", "Équation $az^2+bz+c=0$ ($a,b,c\\in\\mathbb{R}$) ; écriture complexe de la translation, de l'homothétie et de la rotation."],
        capacities: ["Maîtriser le calcul algébrique, trigonométrique et exponentiel dans $\\mathbb{C}$ ;", "Traduire en termes complexes l'alignement, l'orthogonalité, la cocyclicité et reconnaître une transformation plane."] },
      { chId: 'continuite', domain: 'analyse', title: "Continuité d'une fonction numérique",
        contents: ["Continuité en un point, à droite, à gauche et sur un intervalle ; opérations et composée ;", "Image d'un intervalle et d'un segment par une fonction continue ; théorème des valeurs intermédiaires (TVI) ;", "Fonction réciproque $f^{-1}$ d'une fonction continue et strictement monotone ; fonction racine $n$-ième $\\sqrt[n]{x}$ et puissances rationnelles."],
        capacities: ["Utiliser le TVI pour prouver l'existence ou l'unicité d'une solution de $f(x)=k$ et l'encadrer par dichotomie ;", "Déterminer la bijection réciproque $f^{-1}$ et manipuler les racines $n$-ièmes."] },
      { chId: 'derivation-etude-fonctions', domain: 'analyse', title: "Dérivation et étude des fonctions",
        contents: ["Dérivabilité en un point, dérivabilité de $(g\\circ f)$, de $\\sqrt[n]{u}$ et de la fonction réciproque $(f^{-1})'$ ;", "Monotonie, extremums, concavité, points d'inflexion et branches infinies ;", "Plan d'étude complet d'une fonction numérique et résolution graphique."],
        capacities: ["Calculer $(f^{-1})'(y_0)$ sans expliciter $f^{-1}(x)$ et étudier la dérivabilité aux bornes ;", "Mener l'étude complète d'une fonction et construire $C_f$ et $C_{f^{-1}}$."] },
      { chId: 'suites', domain: 'analyse', title: "Les suites numériques",
        contents: ["Limite d'une suite, convergence des suites monotones bornées et limites de $q^n$ et $n^\\alpha$ ;", "Critères de convergence (gendarmes, comparaison) ;", "Suites de la forme $u_{n+1}=f(u_n)$ et $v_n=f(u_n)$ avec $f$ continue ($f(\\ell)=\\ell$)."],
        capacities: ["Démontrer qu'une suite récurrente $u_{n+1}=f(u_n)$ est monotone et bornée, puis déterminer sa limite."] },
      { chId: 'fonctions-primitives', domain: 'analyse', title: "Fonctions primitives",
        contents: ["Définition d'une primitive $F$ ($F'=f$) sur un intervalle et existence pour toute fonction continue ;", "Primitives des fonctions usuelles et des formes $u'u^r$, $u'/u$, $u'e^u$, $u'/\\sqrt{u}$."],
        capacities: ["Déterminer l'ensemble des primitives d'une fonction et l'unique primitive vérifiant $F(x_0)=y_0$."] },
      { chId: 'logarithmes', domain: 'analyse', title: "Fonctions logarithmiques",
        contents: ["Fonction logarithme népérien $\\ln$ (primitive de $1/x$ sur $]0,+\\infty[$ s'annulant en $1$), propriétés algébriques et dérivée $u'/u$ ;", "Limites fondamentales : $\\lim_{x\\to +\\infty}\\frac{\\ln x}{x^n}=0$, $\\lim_{x\\to 0^+} x^n\\ln x=0$, $\\lim_{x\\to 0}\\frac{\\ln(1+x)}{x}=1$ ;", "Logarithme décimal $\\log(x)=\\frac{\\ln x}{\\ln 10}$."],
        capacities: ["Résoudre des équations/inéquations logarithmiques et étudier des fonctions comportant $\\ln(u(x))$."] },
      { chId: 'exponentielles', domain: 'analyse', title: "Fonctions exponentielles",
        contents: ["Fonction exponentielle népérienne $\\exp(x)=e^x$ (réciproque de $\\ln$), propriétés algébriques et dérivée $u'e^u$ ;", "Limites fondamentales : $\\lim_{x\\to +\\infty}\\frac{e^x}{x^n}=+\\infty$, $\\lim_{x\\to -\\infty} x^n e^x=0$, $\\lim_{x\\to 0}\\frac{e^x-1}{x}=1$ ;", "Fonction exponentielle de base $a$ : $a^x = e^{x\\ln a}$ ($a>0, a\\neq 1$)."],
        capacities: ["Lever les indéterminations par croissances comparées et étudier des fonctions en $e^{u(x)}$."] },
      { chId: 'equations-diff', domain: 'analyse', title: "Les équations différentielles",
        contents: ["Équation différentielle linéaire du 1er ordre $y' = ay + b$ ;", "Équation différentielle du 2nd ordre $y'' + ay' + by = 0$ à coefficients réels constants."],
        capacities: ["Résoudre $y'=ay+b$ et $y''+ay'+by=0$ et déterminer la solution vérifiant des conditions initiales."] },
      { chId: 'calcul-integral', domain: 'analyse', title: "Calcul intégral",
        contents: ["Intégrale $\\int_a^b f(x)\\,dx = [F(x)]_a^b$, linéarité, relation de Chasles, positivité et valeur moyenne ;", "Technique d'intégration par parties ;", "Calcul d'aires planes (entre deux courbes) et de volumes de solides de révolution."],
        capacities: ["Calculer une intégrale à l'aide d'une primitive ou d'une intégration par parties ;", "Calculer l'aire d'un domaine plan en unités d'aire puis en $\\text{cm}^2$."] },
      { chId: 'geometrie-analytique-espace', domain: 'geometrie', title: "Géométrie dans l'espace (Produit scalaire & vectoriel)",
        contents: ["Produit scalaire analytique, plan défini par un point et un vecteur normal, distance d'un point à un plan ;", "Sphère : équation cartésienne, intersection sphère/plan et sphère/droite, plan tangent ;", "Produit vectoriel $\\vec{u}\\wedge\\vec{v}$, équation d'un plan $(ABC)$, aire d'un triangle et distance d'un point à une droite."],
        capacities: ["Déterminer un plan par un point et un vecteur normal et caractériser l'intersection d'une sphère et d'un plan ;", "Utiliser $\\vec{u}\\wedge\\vec{v}$ pour calculer une aire ou la distance d'un point à une droite."] },
      { chId: 'probabilites', domain: 'probabilites', title: "Dénombrement et Calcul de probabilités",
        contents: ["Rappels de dénombrement ($A_n^p, C_n^p$), langage des événements et hypothèse d'équiprobabilité ;", "Probabilité conditionnelle $P_A(B)$, indépendance de deux événements, probabilités totales ;", "Variable aléatoire discrète $X$, loi de probabilité, $E(X), V(X), \\sigma(X)$ et loi binomiale $\\mathcal{B}(n,p)$."],
        capacities: ["Construire un arbre pondéré et calculer des probabilités d'événements ;", "Déterminer la loi de probabilité d'une variable aléatoire et reconnaître des épreuves répétées de Bernoulli."] }
    ]
  };

  root.classes['2eme-bac-sc-math'] = {
    id: '2eme-bac-sc-math', shortLabel: '2ème Bac Sc. Math', title: '2ème Bac Sciences Mathématiques',
    domains: [
      { id: 'algebre', label: 'Algèbre' },
      { id: 'analyse', label: 'Analyse' },
      { id: 'geometrie', label: 'Géométrie' },
      { id: 'probabilites', label: 'Probabilités' }
    ],
    chapters: [
      { chId: 'arithmetique', domain: 'algebre', title: "Arithmétique dans $\\mathbb{Z}$",
        contents: ["Division euclidienne, PGCD, PPCM, algorithme d'Euclide et théorèmes de Bézout et de Gauss ;", "Congruences modulo $n$, anneau $\\mathbb{Z}/n\\mathbb{Z}$ et petit théorème de Fermat ;", "Nombres premiers, décomposition unique et systèmes de numération de base $b$."],
        capacities: ["Résoudre dans $\\mathbb{Z}^2$ des équations diophantiennes $ax+by=c$ et des systèmes de congruences ;", "Exploiter les théorèmes de Bézout, Gauss et Fermat dans des démonstrations arithmétiques."] },
      { chId: 'complexes', domain: 'algebre', title: "Les nombres complexes",
        contents: ["Formes algébrique, trigonométrique et exponentielle $re^{i\\theta}$ ; formules d'Euler et de Moivre ;", "Racines $n$-ièmes de l'unité et d'un nombre complexe non nul ; équations du second degré à coefficients dans $\\mathbb{C}$ ;", "Écriture complexe de la translation, l'homothétie, la rotation et composées."],
        capacities: ["Résoudre des équations algébriques dans $\\mathbb{C}$ et calculer les racines $n$-ièmes ;", "Traduire complexe ↔ géométrie (distances, angles orientés, alignement, cocyclicité, transformations)."] },
      { chId: 'structures-algebriques', domain: 'algebre', title: "Structures algébriques (Groupes, Anneaux, Corps)",
        contents: ["Loi de composition interne, associativité, commutativité, élément neutre, éléments symétrisables, partie stable ;", "Groupe $(G,*)$, sous-groupes et morphisme (isomorphisme) de groupes ;", "Anneau $(A,+,\\times)$, diviseurs de zéro, corps $(K,+,\\times)$ ; exemples dans $\\mathbb{Z}/n\\mathbb{Z}$ et $\\mathcal{M}_2(\\mathbb{R}), \\mathcal{M}_3(\\mathbb{R})$."],
        capacities: ["Démontrer qu'un ensemble muni d'une loi est un groupe ou un sous-groupe ;", "Transférer une structure algébrique par isomorphisme de groupes ou d'anneaux."] },
      { chId: 'espaces-vectoriels-reels', domain: 'algebre', title: "Espaces vectoriels réels",
        contents: ["Loi externe et structure de $\\mathbb{R}$-espace vectoriel, sous-espace vectoriel ;", "Combinaison linéaire, famille génératrice, famille libre, base et coordonnées d'un vecteur en dimension finie."],
        capacities: ["Caractériser un sous-espace vectoriel ;", "Montrer qu'une famille de vecteurs est libre, génératrice ou constitue une base."] },
      { chId: 'limites-continuite', domain: 'analyse', title: "Limites et continuité",
        contents: ["Continuité en un point, prolongement par continuité, image d'un intervalle et TVI ;", "Fonction réciproque d'une fonction continue strictement monotone, racine $n$-ième et fonction $\\arctan$."],
        capacities: ["Appliquer le TVI pour démontrer l'existence/unicité de solutions et étudier des suites implicites $f(x_n)=0$ ;", "Maîtriser les propriétés algébriques et analytiques de la fonction $\\arctan$."] },
      { chId: 'derivation-etude', domain: 'analyse', title: "Dérivation et étude des fonctions",
        contents: ["Dérivabilité de $g\\circ f$ et de $f^{-1}$ (dont $\\arctan'=\\frac{1}{1+x^2}$), dérivées successives ;", "Théorème de Rolle, théorème des accroissements finis (TAF) et inégalité des accroissements finis (IAF) ;", "Étude complète de fonctions, branches infinies et points d'inflexion."],
        capacities: ["Utiliser le théorème de Rolle et l'IAF pour établir des encadrements et étudier la convergence de suites ;", "Étudier et représenter des fonctions paramétrées ou faisant intervenir $\\arctan$, $\\ln$, $\\exp$."] },
      { chId: 'suites-numeriques', domain: 'analyse', title: "Les suites numériques",
        contents: ["Convergence, critères d'encadrement, suites monotones et suites adjacentes ;", "Suites récurrentes $u_{n+1}=f(u_n)$, convergence par l'IAF ($|u_{n+1}-\\ell|\\le k|u_n-\\ell|$) et suites implicites."],
        capacities: ["Prouver que deux suites sont adjacentes et en déduire leur convergence vers une limite commune ;", "Étudier la vitesse de convergence d'une suite récurrente via l'inégalité des accroissements finis."] },
      { chId: 'fonctions-logarithmes', domain: 'analyse', title: "Fonctions logarithmiques",
        contents: ["Logarithme népérien $\\ln$, dérivée logarithmique $u'/u$ et primitives ;", "Limites remarquables, croissances comparées et logarithme de base $a$ ($\\log_a$)."],
        capacities: ["Étudier des fonctions et suites définies avec $\\ln$ et établir des inégalités logarithmiques."] },
      { chId: 'fonctions-exponentielles', domain: 'analyse', title: "Fonctions exponentielles",
        contents: ["Exponentielle népérienne $e^x$, exponentielle de base $a$ ($a^x=e^{x\\ln a}$) et puissances réelles $x^\\alpha$ ;", "Croissances comparées et étude de familles de fonctions exponentielles."],
        capacities: ["Résoudre des problèmes d'analyse combinant exponentielles, suites et équations différentielles."] },
      { chId: 'equations-differentielles', domain: 'analyse', title: "Équations différentielles",
        contents: ["Équations linéaires du 1er ordre $y'+ay=b$ ;", "Équations linéaires du 2nd ordre $y''+ay'+by=0$ à coefficients constants."],
        capacities: ["Déterminer la solution générale et l'unique solution vérifiant des conditions initiales."] },
      { chId: 'calcul-integral', domain: 'analyse', title: "Calcul intégral",
        contents: ["Intégrale d'une fonction continue, relation de Chasles, linéarité, ordre et inégalité de la moyenne ;", "Intégration par parties et intégration par changement de variable affine ou $\\mathcal{C}^1$ ;", "Fonction définie par $F(x)=\\int_a^{u(x)} f(t)\\,dt$ (continuité, dérivabilité) et sommes de Riemann $\\frac{1}{n}\\sum_{k=0}^{n-1} f(a+k\\frac{b-a}{n})$."],
        capacities: ["Calculer des intégrales par parties ou changement de variable et dériver une fonction définie par une intégrale ;", "Déterminer la limite de suites de sommes à l'aide des sommes de Riemann ou d'encadrements d'intégrales."] },
      { chId: 'produit-scalaire-espace', domain: 'geometrie', title: "Produit Scalaire dans l'Espace",
        contents: ["Définition, propriétés, repère orthonormé ;", "Expression analytique, norme, distance ;", "Plan (point + vecteur normal), Sphère (équation cartésienne et paramétrique) ;", "Positions relatives (Sphère/Plan, Sphère/Droite)."],
        capacities: ["Déterminer un plan défini par un point et un vecteur normal ;", "Déterminer l'équation d'une sphère ;", "Étudier le parallélisme et l'orthogonalité dans l'espace."] },
      { chId: 'produit-vectoriel', domain: 'geometrie', title: "Produit Vectoriel",
        contents: ["Orientation de l'espace, trièdre direct, définition et propriétés de $\\vec{u}\\wedge\\vec{v}$ ;", "Expression analytique dans une base orthonormée directe ;", "Applications : aire d'un triangle, équation d'un plan, distance d'un point à une droite."],
        capacities: ["Calculer le produit vectoriel de deux vecteurs ;", "Déterminer l'intersection de deux plans et calculer la distance d'un point à une droite."] },
      { chId: 'calcul-probabilites', domain: 'probabilites', title: "Calcul de probabilités",
        contents: ["Espaces probabilisés finis, probabilité conditionnelle $P_A(B)$, formule des probabilités composées et totales, formule de Bayes ;", "Indépendance de deux événements et épreuves indépendantes répétées ;", "Variable aléatoire, fonction de répartition, espérance $E(X)$, variance $V(X)$, écart-type $\\sigma(X)$ et loi binomiale $\\mathcal{B}(n,p)$."],
        capacities: ["Modéliser une situation aléatoire complexe et utiliser la formule des probabilités totales ou de Bayes ;", "Déterminer la loi d'une variable aléatoire et calculer ses paramètres caractéristiques."] }
    ]
  };

  var unbacked2BacMath = { 'produit-scalaire-espace': 1, 'produit-vectoriel': 1 };
  ['2eme-bac-sc-ex', '2eme-bac-sc-math'].forEach(function (clsId) {
    var prog = root.classes[clsId];
    if (!prog || !Array.isArray(prog.chapters)) return;
    prog.chapters.forEach(function (ch) {
      if (clsId === '2eme-bac-sc-math' && unbacked2BacMath[ch.chId]) return;
      ch.chapterId = ch.chId;
      ch.targetKind = 'lesson';
    });
  });

  root.classInfo = {
    'tronc-commun-sc': [
      { label: 'Coefficient Général', value: '4' },
      { label: 'Volume Horaire', value: '5 h / semaine' },
      { label: 'Évaluations', value: '3 à 4 Devoirs Surveillés' }
    ],
    '1ere-bac-sc-ex': [
      { label: 'Coefficient Général', value: '7' },
      { label: 'Volume Horaire', value: '5 h / semaine' },
      { label: 'Évaluations', value: '3 Devoirs Surveillés' }
    ],
    '1ere-bac-sc-math': [
      { label: 'Coefficient Général', value: '9' },
      { label: 'Volume Horaire', value: '7 à 8 h / semaine' },
      { label: 'Évaluations', value: '4 Devoirs Surveillés' }
    ],
    '2eme-bac-sc-ex': [
      { label: 'Coefficient Général', value: '7' },
      { label: 'Volume Horaire', value: '5 h / semaine' },
      { label: 'Évaluations', value: '3 Devoirs Surveillés' },
      { label: 'Examen National', value: 'Coefficient 7' }
    ],
    '2eme-bac-sc-math': [
      { label: 'Coefficient Général', value: '9' },
      { label: 'Volume Horaire', value: '8 à 9 h / semaine' },
      { label: 'Évaluations', value: '4 Devoirs Surveillés' },
      { label: 'Examen National', value: 'Coefficient 9' }
    ]
  };

  root.getClassProgram = function (clsId) {
    return root.classes[clsId] || root.classes['2eme-bac-sc-math'] || root.classes['2eme-bac-sc-ex'];
  };
  root.getAllClasses = function () {
    return ['tronc-commun-sc', '1ere-bac-sc-ex', '1ere-bac-sc-math', '2eme-bac-sc-ex', '2eme-bac-sc-math']
      .map(function (id) { return root.classes[id]; }).filter(Boolean);
  };
  root.getClassInfo = function (clsId) {
    return root.classInfo[clsId] || root.classInfo['2eme-bac-sc-ex'];
  };
  root.getChapterHref = function (ch) {
    if (!ch || !ch.chapterId) return null;
    var slug = encodeURIComponent(ch.chapterId);
    return ch.targetKind === 'quiz' ? '#quiz-' + slug : '#lecon-' + slug;
  };
})(typeof window !== 'undefined' ? window : globalThis);
