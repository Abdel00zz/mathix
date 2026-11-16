export interface ChapterContent {
    id: number;
    section: string;
    title: string;
    contents: string[];
    capacities: string[];
}

// Données 1BSM - Programme Officiel (Première année Bac Sciences Mathématiques)
export const CHAPTERS_1BSM: ChapterContent[] = [
    // ==================== GÉOMÉTRIE ====================
    {
        id: 1,
        section: 'Géométrie',
        title: 'Le barycentre dans le plan',
        contents: [
            'Barycentre de $n$ points ($2 \\le n \\le 4$) ; centre de gravité ;',
            'Propriété caractéristique du barycentre ; invariance ; associativité ;',
            'Coordonnées du barycentre dans un repère donné.'
        ],
        capacities: [
            'Utiliser le barycentre pour simplifier une expression vectorielle ;',
            'Utiliser le barycentre pour établir l\'alignement de trois points d\'un plan ;',
            'Utiliser le barycentre pour déterminer des lieux géométriques.'
        ]
    },
    {
        id: 2,
        section: 'Géométrie',
        title: 'Analytique du produit scalaire et applications',
        contents: [
            'Expression analytique du produit scalaire dans un repère orthonormé ;',
            'Expression analytique de la norme d\'un vecteur et de la distance de deux points ;',
            'Expression de $\\cos\\theta$ et expression de $\\sin\\theta$ ;',
            'Inégalité de Cauchy-Schwartz et inégalité triangulaire ;',
            'La droite dans le plan (étude analytique) : Vecteur normal à une droite ; Équation cartésienne d\'une droite définie par un point et un vecteur normal ; Distance d\'un point à une droite ;',
            'Le cercle (étude analytique) : Équation cartésienne d\'un cercle ; Représentation paramétrique d\'un cercle ; Étude de l\'ensemble $\\{M(x,y) \\mid x^2 + y^2 + ax + by + c = 0\\}$ ; Étude de la position relative d\'un cercle et d\'une droite ; Équation cartésienne d\'une droite tangente à un cercle en un point donné.'
        ],
        capacities: [
            'Exprimer le parallélisme et l\'orthogonalité de deux droites ;',
            'Utiliser le produit scalaire pour calculer des distances, des aires et des mesures d\'angles ;',
            'Déterminer le centre et le rayon d\'un cercle défini à l\'aide d\'une équation cartésienne ;',
            'Passer d\'une équation cartésienne à une représentation paramétrique et inversement ;',
            'Utiliser l\'analytique du produit scalaire pour résoudre des problèmes géométriques et algébriques.'
        ]
    },
    {
        id: 3,
        section: 'Géométrie',
        title: 'La rotation dans le plan',
        contents: [
            'Définition d\'une rotation ; la rotation réciproque d\'une rotation ; décomposition d\'une rotation comme composée de deux symétries axiales ;',
            'Propriétés : Conservation de la distance, de la mesure des angles orientés, du barycentre, de l\'équipollence, du parallélisme et de l\'orthogonalité ;',
            'Image par une rotation d\'une droite, d\'un segment, d\'un cercle, d\'un angle et de l\'intersection de deux figures géométriques ;',
            'Composée de deux rotations.'
        ],
        capacities: [
            'Utiliser une rotation donnée dans une situation géométrique ;',
            'Construire les images de figures usuelles par une rotation donnée ;',
            'Reconnaître une rotation et l\'utiliser pour résoudre des problèmes géométriques.'
        ]
    },
    {
        id: 4,
        section: 'Géométrie',
        title: 'Géométrie dans l\'espace',
        contents: [
            'Calcul vectoriel dans l\'espace ;',
            'Vecteurs colinéaires ; définition vectorielle d\'une droite ;',
            'Définition vectorielle d\'un plan ; vecteurs coplanaires ;',
            'Coordonnées d\'un point dans un repère, coordonnées d\'un vecteur dans une base ; coordonnées de $\\vec{u} + \\vec{v}$ et de $\\lambda\\vec{u}$ ; coordonnées de $\\overrightarrow{AB}$ ;',
            'Déterminant de trois vecteurs ;',
            'Représentation paramétrique d\'une droite ; positions relatives de deux droites ;',
            'Représentation paramétrique d\'un plan ;',
            'Équation cartésienne d\'un plan ; positions relatives de deux plans ;',
            'Deux équations cartésiennes d\'une droite.'
        ],
        capacities: [
            'Maîtriser les règles du calcul vectoriel dans l\'espace ;',
            'Reconnaître et exprimer la colinéarité de deux vecteurs ;',
            'Reconnaître et exprimer la coplanarité de trois vecteurs ;',
            'Appliquer l\'alignement et la coplanarité pour résoudre des problèmes géométriques ;',
            'Exprimer les notions et les propriétés de la géométrie affine et de la géométrie vectorielle à l\'aide des coordonnées ;',
            'Choisir la représentation convenable (cartésienne ou paramétrique) pour étudier les positions relatives de droites et de plans et pour interpréter les résultats.'
        ]
    },
    {
        id: 5,
        section: 'Géométrie',
        title: 'Produit scalaire dans l\'espace : applications',
        contents: [
            'Vecteur normal à un plan ;',
            'Équation cartésienne d\'un plan défini par un point et un vecteur normal à ce plan ;',
            'Distance d\'un point à un plan ;',
            'Étude analytique de la sphère ;',
            'Étude de l\'ensemble des points $M(x,y,z)$ tels que : $x^2 + y^2 + z^2 + ax + by + cz + d = 0$ ;',
            'Intersection d\'une sphère et d\'un plan ; plan tangent à une sphère en un point donné ; intersection d\'une sphère et d\'une droite ;',
            'Applications dans la résolution de problèmes géométriques.'
        ],
        capacities: [
            'Déterminer un plan défini par un point et un vecteur normal à ce plan ;',
            'Déterminer la droite passant par un point et orthogonale à un plan ;',
            'Déterminer une équation cartésienne d\'une sphère définie par son centre et son rayon ;',
            'Déterminer une représentation paramétrique d\'une sphère ;',
            'Reconnaître l\'ensemble des points $M$ de l\'espace tels que : $\\overrightarrow{MA} \\cdot \\overrightarrow{MB} = 0$.'
        ]
    },
    {
        id: 6,
        section: 'Géométrie',
        title: 'Produit vectoriel',
        contents: [
            'Orientation de l\'espace ; trièdre ; repère et base orientés ;',
            'Définition géométrique du produit vectoriel et interprétation de sa norme ;',
            'Propriétés : antisymétrie ; bilinéarité ;',
            'Coordonnées du produit vectoriel de deux vecteurs dans une base orthonormée directe ;',
            'Distance d\'un point à une droite.'
        ],
        capacities: [
            'Calculer l\'aire d\'un triangle en utilisant le produit vectoriel ;',
            'Déterminer une équation d\'un plan défini par trois points non alignés ;',
            'Appliquer le produit vectoriel dans la résolution de problèmes géométriques et physiques.'
        ]
    },

    // ==================== ALGÈBRE ====================
    {
        id: 7,
        section: 'Algèbre',
        title: 'Notions de logique',
        contents: [
            'Propositions ; opérations sur les propositions ; fonctions propositionnelles ;',
            'Les quantificateurs ; les propositions quantifiées ; les lois logiques ;',
            'Les raisonnements mathématiques : raisonnement par l\'absurde ; raisonnement par contraposée ; raisonnement par disjonction des cas ; raisonnement par équivalence ; raisonnement par récurrence.'
        ],
        capacities: [
            'Transformer un énoncé mathématique en écriture symbolique en utilisant les connecteurs et les quantificateurs logiques et inversement ;',
            'Utiliser le type de raisonnement convenable selon la situation étudiée ;',
            'Rédiger des raisonnements et des démonstrations mathématiques claires et logiquement correctes.'
        ]
    },
    {
        id: 8,
        section: 'Algèbre',
        title: 'Les ensembles',
        contents: [
            'Définition d\'un ensemble par compréhension et par extension, partie d\'un ensemble ;',
            'Ensemble des parties d\'un ensemble ; la notation $P(E)$ ;',
            'Inclusion ; égalité ; complémentaire ;',
            'Intersection, réunion et différence de deux ensembles, lois de Morgan ;',
            'Propriétés de l\'intersection et de la réunion ;',
            'Produit cartésien de deux ensembles.'
        ],
        capacities: [
            'Déterminer un ensemble par compréhension ou par extension ;',
            'Maîtriser la relation entre les règles de la logique et les opérations sur les ensembles.'
        ]
    },
    {
        id: 9,
        section: 'Algèbre',
        title: 'Les applications',
        contents: [
            'Égalité de deux applications ;',
            'Image et image réciproque d\'une partie par une application ;',
            'Application injective, application surjective ; application bijective ; application réciproque d\'une bijection ;',
            'Composée de deux applications ;',
            'Restriction et prolongement d\'une application.'
        ],
        capacities: [
            'Déterminer l\'image et l\'image réciproque d\'un ensemble par une application ;',
            'Déterminer la bijection et la bijection réciproque d\'une application et son utilisation dans la résolution de problèmes ;',
            'Déterminer la composée de deux applications et la décomposition d\'une application en deux applications en vue d\'explorer ses propriétés.'
        ]
    },
    {
        id: 10,
        section: 'Algèbre',
        title: 'Arithmétique dans $\\mathbb{Z}$',
        contents: [
            'La division euclidienne et ses propriétés ;',
            'Les nombres premiers ; la décomposition en produit de facteurs premiers ;',
            'Le plus petit commun multiple (PPCM ; $a \\lor b$) ; le plus grand commun diviseur (PGCD ; $a \\land b$) ; propriétés ;',
            'Algorithme d\'Euclide ;',
            'Congruence modulo $n$ ; l\'ensemble $\\mathbb{Z}/n\\mathbb{Z}$ et opérations.'
        ],
        capacities: [
            'Appliquer l\'algorithme d\'Euclide pour la détermination du PGCD de deux nombres entiers ;',
            'Reconnaître l\'ensemble $\\mathbb{Z}/n\\mathbb{Z}$ et les règles de calcul modulo $n$ ;',
            'Utiliser la congruence modulo $n$ dans l\'étude de la divisibilité et inversement.'
        ]
    },

    // ==================== ANALYSE ====================
    {
        id: 11,
        section: 'Analyse',
        title: 'Dénombrement',
        contents: [
            'Ensemble fini ; cardinal d\'un ensemble fini : la notation $\\text{card}$ ;',
            'Principe général du dénombrement, cardinal du produit cartésien ;',
            'Cardinal de l\'ensemble des applications d\'un ensemble fini vers un autre ensemble fini ;',
            'Cardinal de l\'ensemble des parties d\'un ensemble fini ;',
            'Cardinal de la réunion et de l\'intersection de deux ensembles finis ;',
            'Nombre d\'arrangements ; la notation $A_n^p$ ;',
            'Nombre de permutations ; la notation $n!$ ;',
            'Nombre de combinaisons ; la notation $C_n^p$ ;',
            'Propriétés des nombres $C_n^p$ ;',
            'Formule du binôme.'
        ],
        capacities: [
            'Utiliser l\'arbre des choix dans des situations combinatoires ;',
            'Utiliser le modèle combinatoire (ou de dénombrement) adéquat à la situation étudiée ;',
            'Application du dénombrement dans la résolution de problèmes variés.'
        ]
    },
    {
        id: 12,
        section: 'Analyse',
        title: 'Généralités sur les fonctions numériques (rappel et compléments)',
        contents: [
            'Fonction majorée ; fonction minorée ; fonction bornée ; fonction périodique ;',
            'Comparaison de deux fonctions, interprétation géométrique ;',
            'Extrémums d\'une fonction numérique ;',
            'Monotonie d\'une fonction numérique ;',
            'Composée de deux fonctions numériques ;',
            'Monotonie de la composée de deux fonctions numériques monotones ;',
            'Représentation graphique des fonctions : $x \\mapsto \\sqrt{x+a}$, $x \\mapsto ax^2$, $x \\mapsto E(x)$.'
        ],
        capacities: [
            'Comparer deux expressions en utilisant différentes techniques ;',
            'Déduire les variations ou les extrémums ou le signe d\'une fonction à partir de sa représentation graphique ou à partir de son tableau de variation ;',
            'Déterminer les variations des fonctions $f + \\lambda$ et $\\lambda f$ à partir des variations de la fonction $f$ ;',
            'Discuter les solutions d\'une équation de type $f(x) = c$ et $f(x) = g(x)$ à partir de la représentation graphique ;',
            'Étude d\'équations et d\'inéquations en utilisant et en représentant les fonctions.'
        ]
    },
    {
        id: 13,
        section: 'Analyse',
        title: 'Généralités sur les suites numériques',
        contents: [
            'Suites numériques ;',
            'Suites récurrentes ;',
            'Suites majorées, suites minorées, suites bornées ;',
            'Monotonie d\'une suite ;',
            'Suites arithmétiques ;',
            'Suites géométriques.'
        ],
        capacities: [
            'Utiliser le raisonnement par récurrence ;',
            'Étudier une suite numérique (majoration, minoration, monotonie) ;',
            'Reconnaître une suite arithmétique ou géométrique ;',
            'Calculer la somme de $n$ termes consécutifs d\'une suite arithmétique ou géométrique ;',
            'Reconnaître une situation de suite arithmétique ou géométrique ;',
            'Utiliser une suite arithmétique ou géométrique pour résoudre des problèmes.'
        ]
    },
    {
        id: 14,
        section: 'Analyse',
        title: 'Trigonométrie',
        contents: [
            'Formules de transformation ;',
            'Transformation de l\'expression : $a\\cos x + b\\sin x$.'
        ],
        capacities: [
            'Maîtriser les différentes formules de transformation ;',
            'Résoudre les équations et les inéquations trigonométriques se ramenant à la résolution d\'équations et d\'inéquations fondamentales ;',
            'Représenter et lire les solutions d\'une équation et d\'une inéquation sur le cercle trigonométrique.'
        ]
    },
    {
        id: 15,
        section: 'Analyse',
        title: 'Limite d\'une fonction numérique',
        contents: [
            'Limite finie en un point ; limite infinie en un point ;',
            'Limite finie en $+\\infty$ et en $-\\infty$ ; limite infinie en $+\\infty$ et en $-\\infty$ ;',
            'Limite à gauche, limite à droite ;',
            'Opérations sur les limites ;',
            'Limites de fonction polynôme, de fonction rationnelle et limites de fonction de la forme $\\sqrt{f}$ où $f$ est une fonction usuelle ;',
            'Les limites : $\\lim\\limits_{x\\to 0} \\frac{\\sin x}{x}$, $\\lim\\limits_{x\\to 0} \\frac{1-\\cos x}{x^2}$, $\\lim\\limits_{x\\to 0} \\frac{\\sin(ax)}{x}$ ;',
            'Limites et ordre.'
        ],
        capacities: [
            'Calculer les limites des fonctions polynômes, des fonctions rationnelles et des fonctions irrationnelles ;',
            'Calculer les limites de fonctions trigonométriques simples en utilisant les limites usuelles ;',
            'Résoudre des inéquations de type $|f(x)-l| < \\varepsilon$ et de type $f(x) > A$.'
        ]
    },
    {
        id: 16,
        section: 'Analyse',
        title: 'Dérivation',
        contents: [
            'Dérivabilité en un point ; nombre dérivé ; interprétation géométrique ; tangente à une courbe ; approximation d\'une fonction dérivable par une fonction affine en un point ;',
            'Dérivabilité à droite ; dérivabilité à gauche ; interprétation géométrique ; demi-tangente ; tangente ou demi-tangente verticale ; point anguleux ;',
            'Dérivabilité sur un intervalle ; dérivée première ; dérivée seconde ; dérivées successives ;',
            'Dérivation de $f+g$, $\\lambda f$, $f \\times g$, $\\frac{1}{f}$, $\\frac{f}{g}$, $f^n$ ($n \\in \\mathbb{Z}$), $f(ax+b)$ et $\\sqrt{f}$ ;',
            'Équation différentielle : $y\'\' + \\omega^2 y = 0$.'
        ],
        capacities: [
            'Approcher une fonction au voisinage d\'un point ;',
            'Reconnaître que le nombre dérivé de la fonction en $x_0$ est le coefficient directeur de la tangente à cette courbe au point d\'abscisse $x_0$ ;',
            'Reconnaître les dérivées des fonctions de référence ;',
            'Maîtriser les techniques de calcul de la dérivée de fonctions ;',
            'Déterminer une équation de la tangente à une courbe en un point et construire cette tangente ;',
            'Déterminer la monotonie d\'une fonction à partir de l\'étude du signe de sa dérivée ;',
            'Déterminer le signe d\'une fonction à partir de son tableau de variation ou de sa courbe représentative ;',
            'Résoudre des problèmes concernant des valeurs minimales et des valeurs maximales ;',
            'Appliquer la dérivation dans le calcul de certaines limites.'
        ]
    },
    {
        id: 17,
        section: 'Analyse',
        title: 'Représentation graphique d\'une fonction numérique',
        contents: [
            'Branches infinies ; droites asymptotes ; directions asymptotiques ;',
            'Point d\'inflexion ; concavité de la courbe d\'une fonction ;',
            'Éléments de symétrie de la courbe d\'une fonction.'
        ],
        capacities: [
            'Résoudre graphiquement des équations et des inéquations ;',
            'Utiliser la périodicité et les éléments de symétrie d\'une courbe pour réduire le domaine d\'étude d\'une fonction ;',
            'Utiliser le signe de la dérivée seconde pour étudier la concavité d\'une courbe et déterminer ses points d\'inflexion ;',
            'Étudier et représenter des fonctions polynômes, des fonctions rationnelles et des fonctions irrationnelles ;',
            'Étudier et représenter des fonctions trigonométriques simples.'
        ]
    }
];

// Données 2BSE - Programme Officiel (Deuxième année Bac Sciences Mathématiques)
// Note : Les chapitres sont organisés selon la structure habituelle du programme marocain
export const CHAPTERS_2BSE: ChapterContent[] = [
    // ==================== ANALYSE ====================
    {
        id: 1,
        section: 'Analyse',
        title: 'Suites Numériques',
        contents: [
            'Limites des suites numériques de référence ($n$, $n^2$, $\\sqrt{n}$, $1/n$, etc.) ;',
            'Suite convergente ; Critères de convergence ;',
            'Opérations sur les limites ; Limites et ordre ;',
            'Suites récurrentes de la forme $u_{n+1} = f(u_n)$.'
        ],
        capacities: [
            'Utiliser les suites géométriques et arithmétiques pour étudier des exemples ;',
            'Utiliser les critères de convergence pour déterminer les limites ;',
            'Déterminer la limite d\'une suite convergente $u_{n+1} = f(u_n)$ où $f$ est continue sur $I$ et $f(I) \\subset I$.'
        ]
    },
    {
        id: 2,
        section: 'Analyse',
        title: 'Continuité et Étude de Fonctions',
        contents: [
            'Continuité en un point, sur un intervalle (polynômes, rationnelles, trigonométriques) ;',
            'Image d\'un segment ou d\'un intervalle par une fonction continue ;',
            'Théorème des valeurs intermédiaires ;',
            'Fonction réciproque d\'une fonction continue strictement monotone ;',
            'Dérivée de la fonction composée et de la fonction réciproque ;',
            'Puissances rationnelles et dérivée de $x \\mapsto \\sqrt[n]{x}$.'
        ],
        capacities: [
            'Appliquer le TVI pour l\'étude d\'équations ou de signes ;',
            'Utiliser la dichotomie pour des valeurs approchées ;',
            'Déterminer la monotonie d\'une fonction (dérivée, graphique) ;',
            'Étudier et représenter la fonction réciproque ;',
            'Étudier des fonctions irrationnelles simples.'
        ]
    },
    {
        id: 3,
        section: 'Analyse',
        title: 'Fonctions Primitives',
        contents: [
            'Fonctions primitives d\'une fonction continue sur un intervalle ;',
            'Primitives de sommes, produits par un réel ;',
            'Formules usuelles.'
        ],
        capacities: [
            'Déterminer les fonctions primitives des fonctions usuelles ;',
            'Utiliser les formules de dérivation (lecture croisée du tableau).'
        ]
    },
    {
        id: 4,
        section: 'Analyse',
        title: 'Fonctions Logarithmes',
        contents: [
            'Fonction logarithme népérien (ln) : définition, propriétés algébriques, étude ;',
            'Dérivée logarithmique ; Primitives de $u\'/u$ ;',
            'Fonction logarithme de base $a$ et logarithme décimal.'
        ],
        capacities: [
            'Maîtriser le calcul algébrique sur les logarithmes ;',
            'Résoudre équations, inéquations et systèmes avec logarithmes ;',
            'Maîtriser les limites logarithmiques essentielles ;',
            'Étudier et représenter des fonctions comportant le ln.'
        ]
    },
    {
        id: 5,
        section: 'Analyse',
        title: 'Fonctions Exponentielles',
        contents: [
            'Fonction exponentielle népérienne (exp) : définition, propriétés, nombre $e$ ;',
            'Primitives de $u\'e^u$ ;',
            'Fonction exponentielle de base $a$ ($a^x$).'
        ],
        capacities: [
            'Résoudre équations et inéquations avec exponentielles ;',
            'Maîtriser les limites fondamentales ;',
            'Étudier et représenter des fonctions avec exponentielles (et logarithmes).'
        ]
    },
    {
        id: 6,
        section: 'Analyse',
        title: 'Équations Différentielles',
        contents: [
            'Équation $y\' = ay + b$ ;',
            'Équation $y\'\' + ay\' + by = 0$ ;'
        ],
        capacities: [
            'Résoudre l\'équation $y\' = ay + b$ ;',
            'Résoudre l\'équation du second ordre ;',
            'Utiliser ces équations dans des situations de la spécialité (Physique, Chimie...).'
        ]
    },
    {
        id: 7,
        section: 'Analyse',
        title: 'Calcul Intégral',
        contents: [
            'Intégrale sur un segment ; Propriétés (Chasles, linéarité, ordre, valeur moyenne) ;',
            'Techniques : primitives, intégration par parties (IPP) ;',
            'Calcul d\'aires et de volumes.'
        ],
        capacities: [
            'Calculer l\'intégrale à l\'aide des primitives ou par IPP ;',
            'Calculer l\'aire d\'un domaine plan ;',
            'Calculer le volume d\'un solide de révolution.'
        ]
    },

    // ==================== GÉOMÉTRIE ====================
    {
        id: 8,
        section: 'Géométrie',
        title: 'Produit Scalaire dans l\'Espace',
        contents: [
            'Définition, propriétés, repère orthonormé ;',
            'Expression analytique, norme, distance ;',
            'Plan (point + vecteur normal), Sphère (équation cartésienne et paramétrique) ;',
            'Positions relatives (Sphère/Plan, Sphère/Droite).'
        ],
        capacities: [
            'Déterminer un plan défini par un point et un vecteur normal ;',
            'Déterminer l\'équation d\'une sphère ;',
            'Étudier le parallélisme et l\'orthogonalité dans l\'espace.'
        ]
    },
    {
        id: 9,
        section: 'Géométrie',
        title: 'Produit Vectoriel',
        contents: [
            'Orientation, trièdre, définition géométrique ;',
            'Coordonnées dans une base orthonormée directe ;',
            'Distance d\'un point à une droite.'
        ],
        capacities: [
            'Calculer l\'aire d\'un triangle ;',
            'Déterminer l\'équation d\'un plan défini par trois points non alignés ;',
            'Appliquer le produit vectoriel pour résoudre des problèmes géométriques.'
        ]
    },

    // ==================== ALGÈBRE ====================
    {
        id: 10,
        section: 'Algèbre',
        title: 'Nombres Complexes',
        contents: [
            'Écriture algébrique, conjugué, module, argument ;',
            'Forme trigonométrique et notation exponentielle ($e^{i\\theta}$) ;',
            'Interprétation géométrique (affixe, vecteur, angle, alignement) ;',
            'Transformations : translation, homothétie, rotation ;',
            'Équations du second degré dans $\\mathbb{C}$.'
        ],
        capacities: [
            'Maîtriser le calcul sur les complexes ;',
            'Passer entre les formes algébrique, trigonométrique et exponentielle ;',
            'Linéariser des polynômes trigonométriques ;',
            'Résoudre des problèmes géométriques (alignement, orthogonalité, cocyclicité) ;',
            'Résoudre l\'équation $az^2 + bz + c = 0$.'
        ]
    },

    // ==================== PROBABILITÉS ====================
    {
        id: 11,
        section: 'Probabilités',
        title: 'Calcul de Probabilités',
        contents: [
            'Rappels de dénombrement ;',
            'Probabilité d\'un événement, équiprobabilité ;',
            'Probabilité conditionnelle, indépendance ;',
            'Variable aléatoire, loi de probabilité, espérance, variance ;',
            'Loi binomiale.'
        ],
        capacities: [
            'Calculer la probabilité d\'événements (réunion, intersection, contraire) ;',
            'Utiliser le modèle de dénombrement adéquat ;',
            'Reconnaître l\'indépendance ;',
            'Déterminer la loi d\'une variable aléatoire.'
        ]
    }
];

export const CHAPTERS_TCS: ChapterContent[] = [
    { id: 1, section: 'Algèbre', title: 'Arithmétique dans $\\mathbb{N}$', contents: ['Nombres pairs et impairs, multiples et diviseurs ;', 'Nombres premiers et décomposition en produit de facteurs premiers ;', '$\\text{PGCD}(a,b)$, $\\text{PPCM}(a,b)$ et algorithme d\'Euclide.'], capacities: ['Utiliser la parité et la décomposition en facteurs premiers ;', 'Calculer le PGCD et le PPCM de deux entiers naturels.'] },
    { id: 2, section: 'Algèbre', title: 'Les ensembles de nombres $\\mathbb{N}, \\mathbb{Z}, \\mathbb{D}, \\mathbb{Q}, \\mathbb{R}$', contents: ['Inclusions $\\mathbb{N} \\subset \\mathbb{Z} \\subset \\mathbb{D} \\subset \\mathbb{Q} \\subset \\mathbb{R}$ ;', 'Puissances, racines carrées, écriture scientifique et identités remarquables.'], capacities: ['Reconnaître la nature d\'un nombre et maîtriser le calcul algébrique dans $\\mathbb{R}$ ;', 'Factoriser et simplifier des expressions algébriques.'] },
    { id: 3, section: 'Algèbre', title: 'L\'ordre dans $\\mathbb{R}$', contents: ['Ordre et opérations, intervalles de $\\mathbb{R}$ ;', 'Valeur absolue $|x|$, distance et encadrements ;', 'Approximations décimales.'], capacities: ['Comparer deux réels et encadrer une somme, un produit ou un quotient ;', 'Traduire $|x-a| \\le r$ sous forme d\'intervalle.'] },
    { id: 4, section: 'Algèbre', title: 'Les polynômes', contents: ['Degré, égalité et opérations sur les polynômes ;', 'Racine d\'un polynôme et division euclidienne par $x-\\alpha$.'], capacities: ['Effectuer la division euclidienne de $P(x)$ par $x-\\alpha$ ;', 'Factoriser un polynôme de degré 2 ou 3 connaissant une racine.'] },
    { id: 5, section: 'Algèbre', title: 'Équations, inéquations et systèmes', contents: ['Trinôme $ax^2+bx+c$, discriminant $\\Delta$, signe du trinôme ;', 'Systèmes linéaires de 2 équations à 2 inconnues (méthode de Cramer).'], capacities: ['Résoudre des équations et inéquations du second degré ;', 'Résoudre algébriquement et graphiquement un système $2\\times 2$.'] },
    { id: 6, section: 'Analyse', title: 'Généralités sur les fonctions numériques', contents: ['Ensemble de définition $D_f$, parité et monotonie ;', 'Extrémums et étude des fonctions $ax^2+bx+c$ et $\\frac{ax+b}{cx+d}$.'], capacities: ['Déterminer $D_f$, étudier la parité et dresser le tableau de variations ;', 'Représenter graphiquement une parabole ou une hyperbole.'] },
    { id: 7, section: 'Analyse', title: 'Calcul trigonométrique', contents: ['Cercle trigonométrique, radian et abscisses curvilignes ;', 'Rapports trigonométriques, angles associés et équations élémentaires.'], capacities: ['Simplifier des expressions trigonométriques ;', 'Résoudre $\\cos x=a$, $\\sin x=b$ et $\\tan x=c$ sur un intervalle donné.'] },
    { id: 8, section: 'Géométrie', title: 'Calcul vectoriel et projection dans le plan', contents: ['Somme vectorielle, relation de Chasles, colinéarité et milieu ;', 'Projection sur une droite et théorème de Thalès vectoriel.'], capacities: ['Exprimer un vecteur comme combinaison linéaire et démontrer l\'alignement ou le parallélisme.'] },
    { id: 9, section: 'Géométrie', title: 'La droite dans le plan', contents: ['Coordonnées dans un repère, déterminant $\\det(\\vec{u},\\vec{v})$ ;', 'Représentation paramétrique et équation cartésienne $ax+by+c=0$.'], capacities: ['Déterminer une équation de droite et étudier la position relative de deux droites.'] },
    { id: 10, section: 'Géométrie', title: 'Transformations et produit scalaire dans le plan', contents: ['Symétries, translation et homothétie $h(\\Omega,k)$ ;', 'Produit scalaire $\\vec{u}\\cdot\\vec{v}$, théorème d\'Al-Kashi et théorème de la médiane.'], capacities: ['Déterminer l\'image de figures par homothétie ou translation ;', 'Calculer des longueurs et des angles via le produit scalaire.'] },
    { id: 11, section: 'Géométrie', title: 'Géométrie dans l\'espace', contents: ['Positions relatives de droites et de plans ;', 'Parallélisme et orthogonalité dans l\'espace.'], capacities: ['Démontrer le parallélisme ou l\'orthogonalité et déterminer des sections planes.'] },
    { id: 12, section: 'Statistiques', title: 'Statistiques descriptives', contents: ['Effectifs, fréquences cumulées, moyenne $\\bar{x}$, médiane et mode ;', 'Étendue, écart moyen, variance et écart-type $\\sigma$.'], capacities: ['Représenter une série statistique et interpréter les paramètres de position et de dispersion.'] }
];

export const CHAPTERS_1BSE: ChapterContent[] = [
    { id: 1, section: 'Algèbre', title: 'Notions de logique mathématique', contents: ['Propositions, quantificateurs ($\\forall, \\exists$) et connecteurs logiques ;', 'Raisonnements : contraposée, absurde, disjonction des cas et récurrence.'], capacities: ['Nier une proposition quantifiée et rédiger un raisonnement par récurrence.'] },
    { id: 2, section: 'Analyse', title: 'Généralités sur les fonctions numériques', contents: ['Fonctions majorées, minorées, bornées, extremums ;', 'Comparaison de fonctions, composée $g\\circ f$, fonctions $\\sqrt{x+a}$ et $ax^3$.'], capacities: ['Étudier le bornage et la monotonie d\'une fonction composée.'] },
    { id: 3, section: 'Analyse', title: 'Les suites numériques', contents: ['Suites bornées, monotonie ;', 'Suites arithmétiques et géométriques (terme général $u_n$ et somme $S_n$).'], capacities: ['Étudier la monotonie d\'une suite et exprimer $u_n$ en fonction de $n$.'] },
    { id: 4, section: 'Analyse', title: 'Calcul trigonométrique', contents: ['Formules d\'addition, de duplication et de linéarisation ;', 'Transformation de $a\\cos x+b\\sin x$ et équations trigonométriques.'], capacities: ['Transformer des expressions trigonométriques et résoudre $a\\cos x+b\\sin x=c$.'] },
    { id: 5, section: 'Analyse', title: 'Limites d\'une fonction numérique', contents: ['Limites finies et infinies en un point et en $\\pm\\infty$ ;', 'Opérations sur les limites, limites trigonométriques et théorèmes de comparaison.'], capacities: ['Calculer les limites en levant les formes indéterminées usuelles.'] },
    { id: 6, section: 'Analyse', title: 'La dérivation et ses applications', contents: ['Nombre dérivé $f\'(x_0)$, tangente, fonction dérivée et opérations ;', 'Signe de $f\'(x)$, variations, extremums et équation $y\'\'+\\omega^2y=0$.'], capacities: ['Calculer $f\'(x)$, déterminer la tangente et dresser le tableau de variations.'] },
    { id: 7, section: 'Analyse', title: 'Étude et représentation graphique des fonctions', contents: ['Branches infinies (asymptotes, branches paraboliques) ;', 'Concavité, points d\'inflexion et éléments de symétrie.'], capacities: ['Mener l\'étude complète d\'une fonction et construire sa courbe $C_f$.'] },
    { id: 8, section: 'Géométrie', title: 'Le barycentre dans le plan', contents: ['Barycentre de 2 à 4 points pondérés, homogénéité et associativité ;', 'Coordonnées du barycentre et réduction vectorielle.'], capacities: ['Utiliser le barycentre pour établir des alignements, concours de droites et lieux géométriques.'] },
    { id: 9, section: 'Géométrie', title: 'Produit scalaire dans le plan et rotation', contents: ['Expression analytique du produit scalaire, distance point-droite, équation d\'un cercle ;', 'Rotation dans le plan $R(\\Omega,\\alpha)$ et conservation des distances et angles orientés.'], capacities: ['Étudier analytiquement droites et cercles et utiliser une rotation dans un problème géométrique.'] },
    { id: 10, section: 'Géométrie', title: 'Vecteurs et géométrie analytique dans l\'espace', contents: ['Vecteurs coplanaires, repère de l\'espace, représentations paramétriques et équation cartésienne d\'un plan ;', 'Produit scalaire dans l\'espace, vecteur normal, distance point-plan et sphère.'], capacities: ['Déterminer l\'équation d\'un plan ou d\'une sphère et étudier leurs intersections.'] }
];

export const CHAPTERS_2BSM: ChapterContent[] = [
    { id: 1, section: 'Algèbre', title: 'Arithmétique dans $\\mathbb{Z}$', contents: ['Divisibilité, division euclidienne, congruences modulo $n$ et anneau $\\mathbb{Z}/n\\mathbb{Z}$ ;', 'PGCD, PPCM, algorithme d\'Euclide, théorèmes de Bézout, de Gauss et de Fermat ;', 'Nombres premiers et décomposition unique.'], capacities: ['Résoudre des équations diophantiennes $ax+by=c$ et des systèmes de congruences ;', 'Appliquer Bézout, Gauss et Fermat dans des démonstrations arithmétiques.'] },
    { id: 2, section: 'Algèbre', title: 'Nombres Complexes', contents: ['Formes algébrique, trigonométrique, exponentielle $re^{i\\theta}$, formules d\'Euler et de Moivre ;', 'Racines $n$-ièmes de l\'unité et d\'un nombre complexe, équations du second degré dans $\\mathbb{C}$ ;', 'Écritures complexes des transformations planes (translation, homothétie, rotation).'], capacities: ['Calculer les racines $n$-ièmes et résoudre des équations dans $\\mathbb{C}$ ;', 'Interpréter géométriquement module et argument et caractériser les transformations planes.'] },
    { id: 3, section: 'Algèbre', title: 'Structures algébriques (Groupes, Anneaux, Corps)', contents: ['Lois de composition interne, groupe $(G,*)$, sous-groupes et morphismes de groupes ;', 'Anneaux $(A,+,\\times)$, corps $(K,+,\\times)$ et calcul matriciel dans $\\mathcal{M}_2(\\mathbb{R}), \\mathcal{M}_3(\\mathbb{R})$.'], capacities: ['Prouver qu\'un ensemble muni d\'une loi est un groupe ou un sous-groupe ;', 'Transporter une structure algébrique par isomorphisme.'] },
    { id: 4, section: 'Algèbre', title: 'Espaces vectoriels réels', contents: ['Structure de $\\mathbb{R}$-espace vectoriel et sous-espaces vectoriels ;', 'Combinaisons linéaires, familles libres, familles génératrices, bases et dimension finie.'], capacities: ['Caractériser un sous-espace vectoriel et démontrer qu\'une famille est une base.'] },
    { id: 5, section: 'Analyse', title: 'Limites et continuité', contents: ['Continuité ponctuelle et sur un intervalle, prolongement par continuité, image d\'un segment et TVI ;', 'Fonction réciproque $f^{-1}$, racine $n$-ième et fonction $\\arctan$.'], capacities: ['Utiliser le TVI pour l\'étude d\'équations et de suites implicites ;', 'Maîtriser les propriétés de la fonction réciproque et de $\\arctan$.'] },
    { id: 6, section: 'Analyse', title: 'Dérivation et étude des fonctions', contents: ['Dérivabilité de $g\\circ f$ et $f^{-1}$, dérivées successives ;', 'Théorème de Rolle, théorème des accroissements finis (TAF) et inégalité des accroissements finis (IAF) ;', 'Étude complète de fonctions, convexité et branches infinies.'], capacities: ['Appliquer le théorème de Rolle et l\'IAF pour établir des inégalités et étudier des suites ;', 'Mener l\'étude complète d\'une fonction numérique.'] },
    { id: 7, section: 'Analyse', title: 'Suites numériques', contents: ['Convergence, suites monotones, suites adjacentes ;', 'Suites récurrentes $u_{n+1}=f(u_n)$ et convergence via l\'IAF.'], capacities: ['Prouver que deux suites sont adjacentes et déterminer la limite d\'une suite récurrente.'] },
    { id: 8, section: 'Analyse', title: 'Fonctions logarithmiques et exponentielles', contents: ['Logarithme népérien $\\ln$, logarithme de base $a$, exponentielle $e^x$ et $a^x=e^{x\\ln a}$ ;', 'Limites fondamentales et croissances comparées.'], capacities: ['Étudier des fonctions et suites faisant intervenir $\\ln$ et $\\exp$.'] },
    { id: 9, section: 'Analyse', title: 'Équations différentielles', contents: ['Équations linéaires du 1er ordre $y\'+ay=b$ ;', 'Équations linéaires du 2nd ordre $y\'\'+ay\'+by=0$ à coefficients constants.'], capacities: ['Résoudre les équations différentielles du 1er et 2nd ordre avec conditions initiales.'] },
    { id: 10, section: 'Analyse', title: 'Calcul intégral et primitives', contents: ['Intégrale d\'une fonction continue, IPP et changement de variable ;', 'Fonction $F(x)=\\int_a^{u(x)} f(t)\\,dt$, sommes de Riemann, calcul d\'aires et de volumes.'], capacities: ['Calculer des intégrales par changement de variable ou IPP, dériver une intégrale dépendant d\'un paramètre et utiliser les sommes de Riemann.'] },
    { id: 11, section: 'Géométrie', title: 'Produit Scalaire et Vectoriel dans l\'Espace', contents: ['Produit scalaire dans l\'espace, plan défini par point et vecteur normal, sphère ;', 'Produit vectoriel $\\vec{u}\\wedge\\vec{v}$, aire d\'un triangle et distance point-droite.'], capacities: ['Déterminer l\'équation d\'un plan ou d\'une sphère et étudier leurs positions relatives.'] },
    { id: 12, section: 'Probabilités', title: 'Calcul de probabilités', contents: ['Probabilité conditionnelle, formule des probabilités totales et formule de Bayes ;', 'Indépendance, variables aléatoires discrètes, $E(X), V(X), \\sigma(X)$ et loi binomiale $\\mathcal{B}(n,p)$.'], capacities: ['Utiliser la formule des probabilités totales ou de Bayes et déterminer la loi d\'une variable aléatoire.'] }
];

export function getOrientationChaptersByClass(classId: string): ChapterContent[] {
    if (classId.includes('tronc-commun')) return CHAPTERS_TCS;
    if (classId.includes('1ere-bac-sc-ex')) return CHAPTERS_1BSE;
    if (classId.includes('1ere-bac-sc-math')) return CHAPTERS_1BSM;
    if (classId.includes('2eme-bac-sc-math')) return CHAPTERS_2BSM;
    return CHAPTERS_2BSE;
}
