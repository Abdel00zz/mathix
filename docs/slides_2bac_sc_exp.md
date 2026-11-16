# Fiches de Révision - 2ème Bac Sciences Expérimentales (Mathématiques)

## TVI : Existence et Unicité
**Règle / Formule :**
$$ f \text{ continue}, \; f(a)\times f(b)<0 \implies \exists\,c\in]a,b[, \; f(c)=0 $$

**Conseil :**
Le TVI prouve l'**existence** d'une racine. Pour prouver son **unicité**, il est obligatoire d'invoquer la stricte monotonie de la fonction.

---

## Limites et indéterminations
**Règle / Formule :**
$$ \lim_{x \to +\infty} \dfrac{\infty}{\infty} \implies \text{Factoriser par le terme de plus haut degré} $$

**Conseil :**
Pour lever une indétermination polynomiale à l'infini, isole le **terme dominant**. Les fractions restantes tendront vers $0$, clarifiant la limite.

---

## Limite avec radicaux
**Règle / Formule :**
$$ \lim_{x \to +\infty} (\sqrt{x^2+x}-x) = \frac{1}{2} $$

**Conseil :**
En présence d'une différence de racines causant la forme $\infty - \infty$, l'utilisation de l'**expression conjuguée** est la technique reine.

---

## Branche parabolique et Asymptote oblique
**Règle / Formule :**
$$ a = \lim_{x \to \infty} \dfrac{f(x)}{x}, \quad b = \lim_{x \to \infty} (f(x)-ax) $$

**Conseil :**
Pour prouver qu'une droite $y = ax + b$ est asymptote, assure-toi d'étudier séquentiellement $a$ puis la différence donnant $b$.

---

## Signe de la dérivée
**Règle / Formule :**
$$ \forall x \in \mathbb{R}, \quad e^x > 0 \quad \text{et} \quad x^2+1 > 0 $$

**Conseil :**
Identifie immédiatement les termes stricts positifs avant de dresser ton tableau. Cela te permet d'isoler la seule partie qui change de signe.

---

## Extremum local
**Règle / Formule :**
$$ f'(x_0)=0 \text{ et change de signe} \implies (x_0, f(x_0)) \text{ est un extremum} $$

**Conseil :**
Une dérivée nulle ne suffit pas à créer un sommet. Il faut un **changement de signe** pour valider qu'il s'agit d'un minimum ou d'un maximum.

---

## Démonstration par récurrence
**Règle / Formule :**
$$ P(n) \text{ vraie} \implies P(n+1) \text{ vraie} $$

**Conseil :**
Déclare explicitement ta variable : "Soit $n$ tel que $P(n)$ soit vraie". Ensuite, démontre $P(n+1)$ pas à pas.

---

## Suite récurrente et point fixe
**Règle / Formule :**
$$ u_{n+1} = f(u_n) \implies l = f(l) $$

**Conseil :**
Démontre la stabilité de l'intervalle, prouve la convergence de la suite, puis utilise la continuité de $f$ pour résoudre $f(l) = l$.

---

## Comportement d'une suite géométrique
**Règle / Formule :**
$$ -1 < q < 1 \implies \lim_{n \to +\infty} q^n = 0 $$

**Conseil :**
L'avenir de la suite $q^n$ dépend de sa raison. Assure-toi de connaître et de justifier les bornes $-1$ et $1$ lors du calcul de la limite.

---

## Intégration par parties (IPP)
**Règle / Formule :**
$$ \int_{a}^{b} u(x)v'(x)\,dx = \Big[ u(x)v(x) \Big]_{a}^{b} - \int_{a}^{b} u'(x)v(x)\,dx $$

**Conseil :**
Choisis judicieusement $u$ (Arcus, Logarithme, Polynôme, Exponentielle). N'oublie pas de justifier la continuité des dérivées.

---

## Calcul de l'aire plane
**Règle / Formule :**
$$ \mathcal{A} = \left( \int_a^b |f(x)-g(x)|\,dx \right) \times \|\vec{i}\| \times \|\vec{j}\| $$

**Conseil :**
Une aire s'exprime toujours en **unités d'aire**. Détermine la position relative des courbes pour enlever la valeur absolue sans erreur.

---

## Nombres complexes : Nature d'un triangle
**Règle / Formule :**
$$ \dfrac{z_C-z_A}{z_B-z_A} = i \implies \text{Triangle rectangle et isocèle en } A $$

**Conseil :**
L'affixe d'un ratio traduit la géométrie : son **module** détermine le rapport des longueurs, tandis que son **argument** donne l'angle orienté.

---

## Similitudes planes formelles
**Règle / Formule :**
$$ z' - \omega = a(z - \omega) $$

**Conseil :**
La forme complexe révèle toute la transformation : l'affixe $\omega$ pointe le centre, $|a|$ donne le rapport géométrique, et $\arg(a)$ l'angle de rotation.

---

## Probabilités : La Loi binomiale
**Règle / Formule :**
$$ P(X=k) = C_n^k \, p^k \, (1-p)^{n-k} $$

**Conseil :**
Commence par justifier le schéma de Bernoulli : répétition de $n$ épreuves indépendantes. Puis, identifie les paramètres $n$ et $p$ avant d'appliquer la formule.

---

## Probabilités totales et conditionnelles
**Règle / Formule :**
$$ P(B) = P(A_1 \cap B) + P(A_2 \cap B) + \dots + P(A_n \cap B) $$

**Conseil :**
Construis un arbre pondéré. Additionne les probabilités des branches complètes pour trouver la probabilité cible, c'est la formule des probabilités totales.

---

## Équations différentielles du premier ordre
**Règle / Formule :**
$$ y' + a y = 0 \implies y(x) = C \, e^{-ax} $$

**Conseil :**
L'ensemble fondamental des solutions est constitué des exponentielles. La constante $C$ est fixée ultérieurement via les conditions initiales du problème.

---

## Équations différentielles du second ordre
**Règle / Formule :**
$$ ay'' + by' + c = 0 \implies \text{Résoudre } ar^2 + br + c = 0 $$

**Conseil :**
Ton point de départ est toujours l'équation caractéristique. Le signe de son **discriminant** $\Delta$ dictera la structure de la solution finale (réelle ou sinusoïdale).

---

## Excellence rédactionnelle
**Règle / Formule :**
$$ \text{Données } \implies \text{ Théorème } \implies \text{ Argument décisif} $$

**Conseil :**
Une copie académique ne liste pas de calculs vagues. Structure avec des mots-clefs : **« Or »**, **« Puisque »**, **« D'après le théorème… »**.

---

## Gérer un blocage à l'examen
**Règle / Formule :**
$$ \text{Astuce : Admettre et avancer} $$

**Conseil :**
Si tu bloques plus de 5 minutes, marque clairement : **« On admet que le résultat R est vrai »** et poursuis. Ne sacrifie jamais la rentabilité temporelle.
