# STATES AND NODES — États persistés, Contrôleurs, Nœuds DOM & Tokens CSS

Ce document référence chaque structure d’état et chaque nœud DOM/CSS critique de [`Apprendre.html`](../Apprendre.html).

---

## 1. États persistés (`localStorage`)

Gérés dans [`maquette/js/app.js`](../js/app.js) avec migration transparente au premier lancement depuis les anciennes clés (`OLD_SET = 'mathflow_student_settings_v2'`, `OLD_ST = 'mathflow_student_state_v2'`).

### A. Profil et Préférences (`localStorage['ap-p']`)

| Clé | Type | Valeur par défaut (`DEFAULT_PROFILE`) | Contraintes / Normalisation (`normalizeProfile`) |
| :--- | :--- | :--- | :--- |
| `th` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Contrôle `document.documentElement.dataset.theme` (supprimé si `'auto'`). |
| `cls` | `string` | `'2eme-bac-sc-ex'` | Tout ID filière alphanumérique `[a-z0-9_-]` déclaré dans `manifest.json`. |
| `fn` | `string` | `''` | Prénom affiché dans `#hi` (`Bonjour <fn>` ou `Bonjour Ali`) et initiale `#av`. |
| `ln` | `string` | `''` | Nom de famille élève. |
| `sc` | `string` | `''` | Établissement scolaire. |
| `docFont` | `'literata' \| 'serif' \| 'sans'` | `'literata'` | Appliqué sur `html[data-doc-font]`. |
| `docScale` | `number` | `1` | Borné entre `0.85` et `1.4` ; injecté dans `--doc-scale`, `--reading-doc-scale`, `--mf-doc-scale`. |
| `tiersTemps` | `boolean` | `false` | Active la majoration de temps (+1/3) dans `QuizPage`. |
| `soundEnabled` | `boolean` | `false` | Active la synthèse sonore WebAudio dans `MathFlowApp.playTone`. |
| `lexiconAutoHighlight` | `boolean` | `true` | Active le surlignage automatique des termes mathématiques dans les fiches. |
| `reduceMotion` | `boolean` | `false` | Désactive `document.startViewTransition` et passe `scrollIntoView` en `auto`, expose `html[data-reduce-motion]`. |
| `quizTimePerQuestion` | `number` | `120` | Plancher minimum `15` secondes par question. |

### B. Progression élève (`localStorage['ap']`)

Structure `DEFAULT_STATE` :
```json
{
  "q": {},
  "e": {},
  "l": {},
  "lastVisited": null
}
```

| Branche | Format de clé | Format de valeur | Écriture / Lecture |
| :--- | :--- | :--- | :--- |
| `S.q` | `chapterId`, `chapterId:quizId` ou `concours-<schoolId>-<quizId>` | Tableau `[1 \| 0 \| -1 \| null, ...]` par question (`1` correct, `0` faux, `-1` passé) | `QuizPage.persistProgress` / `ProgrammePage.countChapterQuizDone` |
| `S.e` | `<classId>:<chapterId>` (ou examen) | Tableau `[0 \| 1 \| 2 \| null, ...]` par exercice (`0` À revoir, `1` Presque, `2` Maîtrisé) | `ExercicePage.persistRatings` / `ProgrammePage.mountLearn` |
| `S.l` | Clé de scroll (`lesson:<chapId>:<sheetId>` ou `probleme:<id>`) | Pourcentage entier `0..100` (passage à `100` si scroll ≥ 97 %) | `LeconSearch.saveScroll` / `LeconSearch.restoreScroll` / `ProgrammePage.getLessonPct` |
| `S.lastVisited` | Objet unique | `{ hash, url, title, chapterTitle, kind, type, chapterId }` | `MathFlowApp.recordLastVisited` / Carte *Reprendre* dans `#continue-wrap` |

### C. Verrous et déblocages (`localStorage['ap-u']`, [`unlocks.js`](../js/core/unlocks.js))
- Clé par chapitre : `<classId>:<chapterId>` → `{ quiz: boolean, exercises: boolean }` (persistance « sticky » une fois le seuil franchi ; remis à zéro sur `state:reset`).
- Règles alignées sur [`chapterProgress.ts`](../../src/utils/chapterProgress.ts) : `Leçon ≥ 10 %` débloque `Quiz` (`QUIZ_UNLOCK_THRESHOLD = 10`) ; `Quiz ≥ 15 %` (ou soumis) débloque `Exercices` (`EXERCISE_UNLOCK_THRESHOLD = 15`). Le chapitre `mise-a-niveau` reste toujours débloqué.
- Garde directe dans `quiz-page.js` et `exercice-page.js` via `MathFlowUnlocks.verifyStepAccess()`.

---

## 2. États éphémères des contrôleurs (Session mémoire)

| Contrôleur | Objet d’état | Champs clés |
| :--- | :--- | :--- |
| `ProgrammePage` | Variables module | `mountToken` (anti-course async), `openChapterId`, `activeLibTab`, `libFilter`. |
| `LeconPage` | `activeState` + `mountToken` | `cleanups[]` (listeners détachés au `unmount`), `spy` (`IntersectionObserver`), `searchIdx`. |
| `QuizPage` | `st` (`QuizState`) | `bundle`, `activeQuiz`, `questions[]`, `drafts[]`, `answers[]`, `reviewIndices`, `remainingByIdx[]`, `index`, `elapsed`, `remaining`, `view` (`'question' \| 'summary'`), `paused`. |
| `ExercicePage` | `st` (`ExoState`) | `bundle`, `parsed[]`, `ratings[]`, `revealed[]`, `openHints` (`Set` conservant les panneaux `Indice` ouverts lors du basculement de mode), `mode` (`'pas-a-pas' \| 'examen'`), `index`, `elapsed`. |
| `MathFlowUiModals` | `confirmDialogEl` | Modale de confirmation réutilisée dynamiquement pour `openConfirmDialog`. |

---

## 3. Arbre des nœuds DOM critiques (`Apprendre.html` & vues injectées)

### A. Shell persistant (`Apprendre.html`)
- `<aside id="mf-sidebar">` ([`sidebar.js`](../js/core/sidebar.js), [`app-sidebar.css`](../css/app-sidebar.css)) : rail latéral rétractable desktop (`60px → 228px`) regroupant `Programme`, `Examens`, `Problèmes`, `Prépa`, `Orientation & Conseils`, `Aide`, `Paramètres` et `Portail MathPlus` (HTTP uniquement) — strictement sans messagerie ni notifications ; masqué en lecture/quiz/exercices.
- `nav.mnav` : barre basse mobile (`Programme`, `Examens`, `Problèmes`, `Prépa`, `Menu`).
- `<header>` : masqué globalement sur la nouvelle architecture pour conserver des en-têtes simples en texte continu dans chaque vue.
- `<main>` :
  - `section#learn` : `<h1 id="hi">`, `.sub` (filière active + `[data-switch-cls]`), `#continue-wrap`, `.sec > #total`, `ol#path` (accordéon des chapitres).
  - `section#lib` : hub `Examens nationaux`, `Problèmes` et `Prépa concours`.
  - `section#les` : vue fiche de révision/problème (`.top-bar`, `#rp` barre de progression lecture, `.sheet-tabs`, hero `<h1 class="lt">`, `#les-intro`, sections `.lsec > h2.lh > span.ltr ("A.") + span.lht`, blocs `.blk[data-k]`, solutions compactes `details.sol > summary`, popover `[popover]#toc` avec `#tqs` et `#toc-sections`, overlay `#focus-overlay-modal`).
  - `section#quiz` : barre `.top-bar` (`#q-t` minuteur, `#quiz-tiers-temps-badge`, `.top-title`), carte question, choix interactifs / saisie / tri, résumé final.
  - `section#exo` : barre `.top-bar` (`#tm` chronomètre, `.top-title`, `[data-exm]` bascule Pas à pas / Feuille d’examen), `.exo-print-hdr`, liste des questions `.exo-q-row` / `.exo-sub-row` structurées en `.exo-row-head` (`span.exo-row-label` + `.exo-row-content` + `.exo-row-aside` contenant `.exo-bareme` et `button.exo-hint-btn`), panneau `.exo-hint-panel[hidden] > .exo-hint-box`, corrigés `details.sol`, barre basse `.exo-foot`.
  - `section#soon` : repli générique avec lien `#learn`.

### B. Modales & Popovers globaux
- `<dialog id="set">` + `<form id="sf">` : thème (`th`), identité (`fn`, `ln`, `sc`), champs ajoutés par `ui-modals.js` (`cls` peuplé dynamiquement depuis `getAvailableClasses()`, `docFont`, `docScale`, checkboxes `tiersTemps`, `soundEnabled`, `lexiconAutoHighlight`, `reduceMotion`, `#rst`).
- `<dialog id="dlg">` : auto-évaluation exercice terminé (`lv` = `0 | 1 | 2`).
- `<dialog id="mf-confirm-dialog">` : boîte de confirmation modale générique.
- `#mf-lexicon-popover` : infobulle bilingue FR/AR + formule KaTeX déclenchée par `.lx` / `[data-lexicon-term]`.
- `#mf-media-lightbox` : visionneuse plein écran déclenchée par `[data-media-zoom]`.

---

## 4. Cartographie des attributs & tokens CSS (`maquette/css/`)

### Variables principales (`app-tokens-base.css`)
- **Surface papier & encre** : `--bg` (`#F6F4EF`), `--surface` (`#fff`), `--ink` (`#1A1C25`), `--muted` (`#666B78`), `--line` (`#DEDFE6`), `--accent` (`#1D2B66`), `--on-accent` (`#fff`), `--rule`, `--rule2`, `--margin` (lignes et marge rouge du cahier).
- **Couleurs sémantiques `light-dark()`** : `--g` (vert exemple), `--bl` (bleu propriété), `--v` (violet théorème), `--am` (ambre définition/astuce), `--r` (rouge attention), `--err`, `--ok`, `--ring`.
- **Codes `data-k` des blocs `.blk` (`app-views.css` + `lecon-renderer.js`)** :
  - `d` Définition, `t` Théorème, `p` Propriété/Proposition/Corollaire/Lemme, `m` Méthode/Technique/Stratégie, `e` Exemple/Application/Problème, `r` Remarque/Note/Cours, `a` Attention, `i` Intuition/Indice, `o` Objectif, `k` Rappel/À retenir, `c` Conséquence, `s` Note historique/Intro/Exploration, `y` Démonstration/Solution.
