/**
 * MathFlow — Dictionnaires Mathématiques Bilingues FR ↔ AR par Chapitre
 */
(function (global) {
  'use strict';
  global.MATHFLOW_DATA_PARTS = global.MATHFLOW_DATA_PARTS || {};
  global.MATHFLOW_DATA_PARTS.lexiques = {
  "LEXIQUE_DERIVATION": [
    {
      "termeFr": "dérivable",
      "variantes": [
        "dérivables",
        "dérivabilité",
        "nombre dérivé",
        "dérivée"
      ],
      "termeAr": "قابلة للاشتقاق",
      "symbole": "f'(x_0)",
      "categorie": "analyse",
      "definitionFr": "Une fonction $f$ est dérivable en $x_0$ si le taux de variation $\\frac{f(x)-f(x_0)}{x-x_0}$ admet une limite finie quand $x \\to x_0$."
    },
    {
      "termeFr": "tangente",
      "variantes": [
        "tangentes",
        "demi-tangente",
        "demi-tangentes"
      ],
      "termeAr": "مماس المنحنى",
      "symbole": "(T) : y = f'(x_0)(x-x_0)+f(x_0)",
      "categorie": "geometrie",
      "definitionFr": "Droite limite passant par $M_0(x_0, f(x_0))$ et de coefficient directeur $f'(x_0)$."
    },
    {
      "termeFr": "strictement croissante",
      "variantes": [
        "croissante",
        "strictement décroissante",
        "décroissante",
        "monotone",
        "monotonie"
      ],
      "termeAr": "تزايدية قطعا",
      "symbole": "f'(x) > 0",
      "categorie": "analyse",
      "definitionFr": "Sur un intervalle $I$, si $f'(x) > 0$ (sauf en un nombre fini de points où $f'(x)=0$), alors $f$ est strictement croissante sur $I$."
    },
    {
      "termeFr": "point d'inflexion",
      "variantes": [
        "inflexion",
        "points d'inflexion"
      ],
      "termeAr": "نقطة انعطاف",
      "symbole": "f''(a) = 0",
      "categorie": "geometrie",
      "definitionFr": "Point $I(a, f(a))$ où la courbe $(C_f)$ change de concavité (la dérivée seconde $f''$ s'annule en changeant de signe)."
    },
    {
      "termeFr": "convexe",
      "variantes": [
        "convexité",
        "concave",
        "concavité"
      ],
      "termeAr": "محدب (أو مقعر)",
      "symbole": "f''(x) \\geq 0",
      "categorie": "analyse",
      "definitionFr": "$f$ est convexe sur $I$ si $f''(x) \\geq 0$ sur $I$ : sa courbe $(C_f)$ est située au-dessus de chacune de ses tangentes."
    },
    {
      "termeFr": "extremum",
      "variantes": [
        "extremums",
        "extrema",
        "minimum",
        "maximum"
      ],
      "termeAr": "مطارف الدالة",
      "symbole": "f'(c) = 0",
      "categorie": "analyse",
      "definitionFr": "Valeur maximale ou minimale locale atteinte en un point $c$ où $f'$ s'annule en changeant de signe."
    }
  ],
  "LEXIQUE_CONTINUITE": [
    {
      "termeFr": "continue",
      "variantes": [
        "continuité",
        "continues",
        "continu"
      ],
      "termeAr": "متصلة",
      "symbole": "\\lim_{x \\to x_0} f(x) = f(x_0)",
      "categorie": "analyse",
      "definitionFr": "Une fonction $f$ est continue en $x_0$ si $\\lim_{x \\to x_0} f(x) = f(x_0)$."
    },
    {
      "termeFr": "valeurs intermédiaires",
      "variantes": [
        "théorème des valeurs intermédiaires",
        "TVI"
      ],
      "termeAr": "مبرهنة القيم الوسيطية",
      "symbole": "f(a) \\times f(b) < 0",
      "categorie": "analyse",
      "definitionFr": "Si $f$ est continue sur $[a,b]$ et $f(a)\\cdot f(b) < 0$, alors l'équation $f(x)=0$ admet au moins une solution $\\alpha \\in ]a,b[$."
    },
    {
      "termeFr": "bijection",
      "variantes": [
        "bijective",
        "réciproque",
        "fonction réciproque"
      ],
      "termeAr": "تقابل (دالة عكسية)",
      "symbole": "f^{-1} : J \\to I",
      "categorie": "analyse",
      "definitionFr": "Toute fonction continue et strictement monotone sur un intervalle $I$ réalise une bijection de $I$ sur $J = f(I)$."
    },
    {
      "termeFr": "dichotomie",
      "variantes": [
        "encadrement",
        "amplitude"
      ],
      "termeAr": "طريقة التفرع الثنائي",
      "symbole": "|b - a| / 2^n",
      "categorie": "general",
      "definitionFr": "Méthode algorithmique consistant à diviser par $2$ à chaque étape la longueur de l'intervalle contenant la racine $\\alpha$."
    }
  ],
  "LEXIQUE_SUITES": [
    {
      "termeFr": "convergente",
      "variantes": [
        "convergence",
        "converge",
        "divergente"
      ],
      "termeAr": "متقاربة",
      "symbole": "\\lim_{n \\to +\\infty} u_n = \\ell",
      "categorie": "analyse",
      "definitionFr": "Une suite $(u_n)$ est convergente si elle admet une limite réelle finie $\\ell \\in \\mathbb{R}$ lorsque $n \\to +\\infty$."
    },
    {
      "termeFr": "majorée",
      "variantes": [
        "minorée",
        "bornée"
      ],
      "termeAr": "مكبورة (أو مصغورة)",
      "symbole": "\\forall n \\in \\mathbb{N},\\; u_n \\leq M",
      "categorie": "analyse",
      "definitionFr": "Toute suite croissante et majorée est convergente ; toute suite décroissante et minorée est convergente."
    },
    {
      "termeFr": "récurrence",
      "variantes": [
        "raisonnement par récurrence",
        "hérédité",
        "initialisation"
      ],
      "termeAr": "البرهان بالترجع",
      "symbole": "\\mathcal{P}(n) \\implies \\mathcal{P}(n+1)",
      "categorie": "logique",
      "definitionFr": "Principe de démonstration en deux étapes : initialisation au premier rang $n_0$ et hérédité de $n$ vers $n+1$."
    }
  ],
  "LEXIQUE_LOGARITHMES": [
    {
      "termeFr": "logarithme népérien",
      "variantes": [
        "logarithme",
        "népérien"
      ],
      "termeAr": "اللوغاريتم النيبيري",
      "symbole": "\\ln(x)",
      "categorie": "analyse",
      "definitionFr": "Primitive sur $]0, +\\infty[$ de la fonction $x \\mapsto \\frac{1}{x}$ qui s'annule en $1$."
    },
    {
      "termeFr": "domaine de définition",
      "variantes": [
        "ensemble de définition"
      ],
      "termeAr": "مجموعة التعريف",
      "symbole": "D_f = \\{x \\in \\mathbb{R} \\mid u(x) > 0\\}",
      "categorie": "analyse",
      "definitionFr": "L'expression $\\ln(u(x))$ est définie si et seulement si $u(x) > 0$ strictement."
    }
  ]
};
})(typeof globalThis !== 'undefined' ? globalThis : window);
