# Diagnostic LaTeX — HIPO.json

État vérifié le 13 septembre 2026. Le projet et le fichier HIPO ont évolué entre la première lecture et les vérifications finales. Les corrections de normalisation des tableaux et d'imbrication des listes sont déjà présentes dans le commit `d885eb1d` ; elles ne proviennent pas de la modification responsive du quiz.

## Tableaux : cause précise

Le moteur mathématique installé est KaTeX 0.16.47. Il prend en charge `array`. Le problème initial ne venait donc pas de l'absence de ce mot dans un dictionnaire.

Dans un tableau, la séquence LaTeX `\\[-1,2]` est ambiguë : le crochet immédiatement après le changement de ligne est lu comme son argument optionnel de dimension. Le test direct produit `KaTeX parse error: Invalid size: '-1,2'`.

Il faut séparer le début de la cellule du changement de ligne, par exemple avec `\\{}[-1,2]` ou `\\{[-1,2]}`. Un véritable espacement comme `\\[2pt]` reste valide et doit être conservé. Dans la version installée, l'ajout d'un espace simple évite aussi l'erreur sur le cas testé ; le groupe vide est plus explicite et résiste à une suppression des espaces.

Exemple en LaTeX décodé, à saisir dans un champ texte de l'éditeur :

```latex
$$
\begin{array}{c|c|c|c|c}
I & \text{Monotonie de }f & f(I) & \min_I f & \max_I f \\
\hline
{[-2,-1]} & {} & {} & {} & {} \\
{[-1,2]}  & {} & {} & {} & {} \\
{[2,4]}   & {} & {} & {} & {} \\
{[4,5]}   & {} & {} & {} & {}
\end{array}
$$
```

Dans un fichier JSON brut, chaque antislash doit être doublé : le changement de ligne LaTeX `\\` s'écrit `\\\\` dans la chaîne JSON. Le copier-coller du message contient des échappements supplémentaires, notamment `\min\\\_I`, absents du fichier actuel : `\min_I` exprime un indice, tandis que `\_` désigne un caractère underscore. Il ne faut pas multiplier les antislashs pour corriger le tableau.

À la vérification finale, `C:/Users/Think/Downloads/HIPO.json` contient déjà les séparateurs `\\{}[-1,2]`, `\\{}[2,4]`, `\\{}[4,5]` à la ligne 420. Le fichier s'analyse en JSON ; ses 682 expressions mathématiques délimitées, dont 6 tableaux `array`, passent le rendu direct avec les macros du projet. Cela teste les formules isolées, pas l'ensemble de la mise en page d'une fiche.

## Pourquoi deux fermetures de liste peuvent être correctes

Une sous-liste dans une liste exige deux fermetures consécutives : une pour la sous-liste et une pour la liste extérieure. HIPO présente ce cas aux lignes 188 et dans `sections[20].blocks[2].content`. Le comptage des environnements du fichier actuel ne trouve aucun déséquilibre. Il ne faut donc pas supprimer globalement les `\end{enumerate}` répétés.

L'ancien tokenizer utilisait une expression régulière non gloutonne qui arrêtait l'environnement extérieur à la première fermeture intérieure. La fermeture extérieure restait ensuite affichée comme du texte. Le correctif existant `readBalancedEnvironment`, appelé depuis `mathParser.ts`, retrouve la vraie fermeture en comptant la profondeur. Test du moteur actuel dans le navigateur : une liste imbriquée produit deux éléments `ol`, les marqueurs `1.`, `a.`, `2.`, et aucune fermeture affichée en clair.

## Dictionnaires et étapes du moteur

1. `MathRenderer` transmet le contenu à `renderSegment`.
2. `parser/regex.ts` et `parser/dictionaries.ts` repèrent les environnements, délimiteurs et macros de texte ; `parser/environments.ts` apparie les environnements imbriqués.
3. `parser/renderers.ts` crée les listes et autres structures HTML ; les expressions mathématiques sont transmises à KaTeX.
4. `MathRenderer.createMathNode` applique maintenant `repairLineBreakBrackets` pour les crochets après les changements de ligne.
5. `katexService.typeset` lance l'auto-rendu avec `KATEX_MACROS` et `throwOnError: false`.

Le dictionnaire structurel de l'application et celui des macros KaTeX ont des rôles différents. Déclarer un environnement structurel ne suffit pas à implémenter un compilateur LaTeX complet : plusieurs cas passent par le rendu par défaut de KaTeX.

Un tableau incorrect peut apparaître en code rouge sans exception remontant au composant, puisque `throwOnError` est désactivé. L'absence d'erreur JavaScript dans la console ne prouve donc pas le succès du rendu.

## Points encore présents, non modifiés dans cette intervention

- Une entité HTML brute telle que `&#x20;` dans une chaîne issue de JSON reste littérale : `appendHighlightedText` utilise `document.createTextNode`. Le test réel avec `content={'&#x20; Texte'}` rend `&#x20; Texte`. Attention : `content="&#x20; Texte"` dans du JSX est décodé par le compilateur JSX et ne reproduit pas le cas JSON. HIPO actuel ne contient aucune entité numérique de ce type. Pour cet exemple, remplacer l'entité par un espace dans le contenu source suffit ; ne pas décoder arbitrairement toutes les chaînes en HTML.
- Le validateur auxiliaire `mathWorker.ts` signale à tort `$$x^2$$` comme deux délimiteurs non fermés : `checkPaired` traite `open === close` comme une ouverture à chaque occurrence. Il accepte aussi un `\end{enumerate}` isolé, car sa vérification ne parcourt que les types d'environnements ouverts. Ces deux comportements ont été reproduits.
- Le rendu principal appelle `katexService.typeset`, pas `typesetWithValidation` ; ce validateur auxiliaire ne constitue donc pas une protection systématique du contenu. La validation métier de l'éditeur vérifie surtout le JSON et sa structure pédagogique.

Diagnostic reproductible, en lecture seule :

```powershell
node tmp/audit-hipo-latex.mjs 'C:\Users\Think\Downloads\HIPO.json'
```

Les 26 tests existants d'environnements, de marqueurs de liste et de normalisation passent, ainsi que les 11 tests ciblés du quiz. Le moteur LaTeX et le fichier HIPO n'ont pas été réécrits par cette intervention.
