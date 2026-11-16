# Rapport d’audit — Session Pro, mode PC

**Projet :** monProf / mathPlus  
**Date de l’audit :** 22 août 2026  
**Périmètre :** console professeur sur PC, accès aux classes, séance live, élèves, planification, notifications et Studio de contenus.

## 1. Résumé exécutif

Le problème principal n’est pas seulement visuel. Il vient du modèle de navigation et de droits :

> La console confond le niveau scolaire, la classe réelle, la classe consultée, la classe de la séance et la classe éditable.

Cette confusion se retrouve dans l’interface :

- le bouton **Gérer** change la classe de la séance puis ouvre directement le Studio ;
- consulter ou éditer un autre niveau peut donc modifier le contexte de la tablette ;
- les fonctionnalités ne sont pas clairement rattachées à une classe accessible ;
- les droits dépendent parfois de l’état de la séance au lieu d’une autorisation explicite ;
- la page Planification n’est pas un agenda, mais un unique formulaire date + lien Meet ;
- l’interface PC laisse beaucoup d’espace vide tout en concentrant de très petits textes et badges dans une colonne étroite.

La direction recommandée est la suivante :

> Le professeur **accède** à une classe. La classe devient le contexte de travail visible et persistant. Les fonctionnalités disponibles dépendent ensuite de ses capacités dans cette classe. **Gérer** n’est jamais un synonyme d’ouvrir, consulter ou utiliser.

### Décision produit à retenir

| Intention | Libellé recommandé | Effet |
|---|---|---|
| Ouvrir une classe | **Accéder** | Ouvre l’espace sans mutation métier et sans effet sur la tablette |
| Lire ou prévisualiser | **Consulter** | Ouvre une ressource sans l’attacher à une séance |
| Exploiter pendant un cours | **Utiliser en séance** | Attache ou présente la ressource dans une séance existante |
| Lancer un cours | **Démarrer une séance** | Démarre l’événement planifié, ou crée une séance ad hoc |
| Modifier un contenu privé | **Modifier** | Ouvre un brouillon si la capacité existe |
| Administrer la classe | **Gérer** | Réservé aux membres, paramètres et structure selon capacité |

### Cible en une page

**Navigation globale agrégée**

    Aujourd’hui · Agenda · Classes · Bibliothèque · Messages

- **Agenda** et **Messages** regroupent toutes les classes autorisées ;
- **Bibliothèque** contient les ressources globales et personnelles ;
- après Accéder, les vues de groupe sont automatiquement filtrées.

**Dans un groupe**

    Aperçu · Élèves · Contenus · Suivi · Plus

- **Plus** contient Messages et Paramètres lorsque les capacités existent ;
- une seule action primaire reste visible : **Démarrer une séance** ;
- **Gérer** n’apparaît que pour une vraie action de structure ;
- l’attribution des droits reste réservée à l’administrateur, sauf capacité plateforme explicite.

**Trois écrans structurants**

    AUJOURD’HUI
    ┌──────────────────────────┬───────────────┐
    │ Prochaine séance         │ Alertes       │
    │ Chronologie de la journée│ Brouillons    │
    │ Actions rapides          │ Appareils     │
    └──────────────────────────┴───────────────┘

    GROUPE
    ┌──────────────────────────────────────────┐
    │ 2BAC-PC-A · 31 élèves   [Démarrer] […]  │
    ├──────────────────────────────────────────┤
    │ Aperçu · Élèves · Contenus · Suivi · +  │
    ├──────────────────────────────────────────┤
    │ Vue métier filtrée sur ce groupe         │
    └──────────────────────────────────────────┘

    LIVE
    ┌──────────────────────────────────────────┐
    │ Groupe · chapitre · chrono [Pause][Fin] │
    ├──────────────────────────┬───────────────┤
    │ Activité / ressource     │ Présents      │
    │ principale              │ Appareil      │
    └──────────────────────────┴───────────────┘

**Ordre de réalisation**

1. hotfix de sécurité sur le modèle actuel ;
2. création de ClassGroup, Membership et LessonSession avec migration ;
3. nouvelle navigation Accéder / Utiliser en séance / Gérer ;
4. refonte visuelle, responsive et accessibilité.

## 2. Méthode et niveau de confiance

L’audit combine :

- lecture des composants React, services et routes API ;
- inspection des règles de classe et d’autorisation ;
- rendu local des vrais composants Pro à **1440 × 900 px** avec des données de démonstration ;
- vérification des parcours Accueil, Séance, Classe, Planification, Notifications, Rotation et Studio ;
- comparaison avec des principes présents dans des plateformes scolaires et agendas actuels.

Les données de démonstration ont uniquement servi à afficher les états visuels. Les constats de sécurité et de structure proviennent du code serveur réel.

## 3. Diagnostic synthétique

| Domaine | État actuel | Risque | Cible |
|---|---|---:|---|
| Contexte de classe | Caché dans le rail/footer | Élevé | En-tête persistant et route de classe |
| Accès à une classe | Bouton Gérer | Élevé | Bouton Accéder, sans effet sur la séance |
| Séance live | Liée au contexte de navigation | Critique | Entité séparée, démarrage explicite |
| Autorisations | Rôle prof global + règles dispersées | Critique | Capacités par groupe, refus par défaut |
| Élèves/présences | Données partiellement globales au prof | Critique | Groupe et séance explicitement scopés |
| Planification | Une seule date future | Élevé | Agenda multi-séances jour/semaine/liste |
| Accueil | Compteurs et chemins JSON | Moyen | Aujourd’hui, prochaines séances, alertes |
| Mise en page PC | Colonne étroite + grand vide | Moyen | Grille 12 colonnes, largeur 1200–1440 px |
| Typographie | Nombreux textes de 10–11 px | Moyen | Corps 14–16 px, secondaire 12–14 px |
| Studio | Deux rails et identité visuelle séparée | Moyen | Un catalogue contextuel, mode visuel par défaut |
| Tests Pro | Pratiquement absents | Élevé | Matrice rôle × classe × action |

## 4. Problèmes fonctionnels et de structure

### P0 — Le bouton Gérer mélange navigation, séance et édition

Dans **ProfHomePanel.tsx:112-118**, le bouton affiché sur une classe s’appelle Gérer. Son action appelle **openClass**, qui :

1. change immédiatement le niveau de la séance ;
2. ouvre directement le Studio.

Voir **ProfConsoleApp.tsx:170-181**.

Conséquences :

- un professeur qui veut seulement consulter une classe peut reconfigurer sa tablette ;
- le changement de classe efface le chapitre actif côté séance ;
- le mot Gérer promet une administration de classe, alors que l’action réelle combine accès, édition et pilotage ;
- l’écriture est optimiste : la nouvelle classe est affichée localement avant la réponse serveur et l’erreur est ignorée.

**Correction :**

- introduire **workspaceGroupId** pour le groupe consulté ;
- conserver **activeSession.classGroupId** pour la séance réellement en cours ;
- faire de **Accéder** une navigation locale et réversible ;
- n’écrire dans l’état live que lors de **Démarrer une séance** ou **Basculer la séance** ;
- demander confirmation avant de basculer une séance déjà en cours.

### P0 — Une classe de séance peut étendre les droits d’édition

La route **session-set** accepte un classId sans vérifier l’affectation du professeur, dans **api/professor.ts:402-458**.

Ensuite, **api/content.ts:95-132** ajoute la classe de séance aux classes éditables. La classe active devient ainsi une source d’autorisation.

Cela crée une chaîne dangereuse :

1. choisir ou forcer une autre classe comme classe de séance ;
2. cette classe entre dans la liste des chemins éditables ;
3. publier du contenu hors du périmètre attribué.

**Correction :**

- créer une fonction serveur unique **authorizeClassAction(accountId, classGroupId, capability)** ;
- ne jamais déduire un droit depuis une navigation, une préférence locale ou une séance ;
- vérifier cette fonction sur chaque route sensible ;
- conserver la classe de séance comme donnée métier, jamais comme permission.

### P0 — profClasses a plusieurs sens contradictoires

Le panneau administrateur permet de choisir **Aucun**, mais :

- dans **api/professor.ts:133-143**, une liste vide signifie accès à tous les niveaux ;
- dans **ProfHomePanel.tsx:36-40**, une liste vide affiche également toutes les classes ;
- dans **api/content.ts:104-132**, une liste vide est traitée différemment et conserve au moins la classe du compte et celle de la séance.

Il est donc impossible de représenter proprement aucun droit.
Même avec une liste non vide, **api/content.ts:128-132** ajoute encore la
classe principale du compte et la classe de séance aux chemins éditables :
les seules cases cochées par l’administrateur ne définissent donc pas réellement
le périmètre.

**Convention cible :**

- liste vide = aucun accès ;
- liste explicite = classes autorisées ;
- accès global = propriété distincte, par exemple allClasses: true ;
- migration des profils existants obligatoire ;
- refus par défaut côté serveur.

### P0 — Les données live sont globales au professeur

Les clés Redis de **api/professor.ts:104-113** sont basées sur l’identité du professeur, sans groupe ni classe :

- roster ;
- live ;
- answered ;
- answerStatus ;
- present ;
- session.

Changer de niveau peut donc conserver la liste, les présents, la rotation ou les réponses du niveau précédent.

**Correction :**

- effectif canonique : ClassMembership ;
- ordre d’affichage facultatif : classGroup:{classGroupId}:displayOrder ;
- état live par séance : session:{sessionId}:live ;
- rotation par séance : session:{sessionId}:rotation[membershipId] ;
- présence par séance : session:{sessionId}:attendance ;
- réponses par séance : session:{sessionId}:answers ;
- historique par séance, jamais par professeur seul.

### P0 — Les notifications programmées peuvent viser trop large

La programmation actuelle enregistre un unique targetClass correspondant au niveau dans **api/professor.ts:478-518**. Le cron résout ensuite tous les abonnés de ce niveau dans **api/cron/reminders.ts:370-406**.

Une notification planifiée par un professeur peut donc toucher d’autres groupes du même niveau.

**Correction :**

- cibler des memberships de groupe, pas un niveau ;
- enregistrer teacherId, classGroupId, audience et exclusions ;
- produire une prévisualisation avant envoi : classe, destinataires, date et message ;
- journaliser l’audience réellement résolue.

### P0 — La lecture des contenus personnalisés n’est pas filtrée par groupe

Dans **api/content.ts:147-206**, un élève lié à un professeur lit le namespace global de ce professeur. Le chemin demandé n’est filtré ni par groupe — qui n’existe pas encore dans le modèle — ni même par le niveau classId de l’élève.

**Correction :**

- publier une version vers un ou plusieurs groupes explicites ;
- filtrer le manifeste et chaque lecture par membership ;
- ne jamais exposer tout le namespace du professeur à un élève.

### P0 — Un secret administrateur résiduel peut changer la destination d’une publication

Dans **profContentService.ts:33-40**, la présence de
sessionStorage.mathplus_admin_secret fait publier vers le namespace officiel.
Or le bouton Fermer de l’administration dans **AdminConsole.tsx:323-330**
retourne à l’application sans supprimer ce secret.

Un professeur qui revient au Studio dans le même onglet peut donc publier dans
le contenu officiel au lieu de son espace privé.

**Correction :**

- ne jamais inférer l’acteur depuis un secret résiduel de sessionStorage ;
- passer explicitement un client admin ou professeur au Studio ;
- effacer le contexte administrateur à la sortie ;
- afficher la destination de publication : Brouillon personnel, Groupe X ou Officiel ;
- réserver Officiel à une capacité plateforme auditée.

### P0 — Le partage d’image ne valide pas suffisamment le destinataire

La branche **shared-save** de **api/professor.ts:757-785** accepte un
studentAccountId sans vérifier systématiquement que le compte est un élève lié
au professeur, membre du groupe actif et autorisé.

**Correction :**

- charger le destinataire côté serveur ;
- vérifier rôle, membership, professeur et groupe ;
- afficher la portée exacte avant envoi : élève privé ou groupe entier ;
- refuser tout identifiant ne correspondant pas à la ressource autorisée.

### P1 — classId représente plusieurs concepts différents

Le classId du catalogue correspond en réalité à un **niveau de programme** : Tronc Commun, 1ère Bac, 2ème Bac, etc. Il ne représente pas une classe réelle comme 2BAC-PC-A.

Le même identifiant sert actuellement pour :

- le contenu scolaire ;
- l’affectation du professeur ;
- les élèves ;
- la séance ;
- le push ;
- la progression ;
- le Studio.

Il faut séparer :

| Entité | Exemple | Responsabilité |
|---|---|---|
| ProgramLevel | 2ème Bac Sciences PC | Catalogue et programme |
| ClassGroup | 2BAC-PC-A, 2026–2027 | Groupe réel d’élèves |
| Membership | Professeur/élève dans le groupe | Rôle et capacités locales |
| LessonSession | Séance du 25/08 à 10 h | État live et présence |

### P1 — Deux listes d’élèves coexistent

Les élèves inscrits utilisent un accountId. Le registre de rotation utilise une seconde liste de paires id/nom, persistée et synchronisée séparément.

Conséquences :

- doublons ;
- changement de nom non propagé ;
- présence, progression et rotation pouvant viser des identités différentes.

**Correction :**

- une seule source : ClassMembership ;
- la rotation référence membershipId ;
- un invité temporaire doit être un type explicite, pas une copie de nom.

### P1 — La classe active ne se propage pas partout

Le dashboard tablette calcule un effectiveClassId dans
**DashboardView.tsx:119-128**, mais certaines sections continuent à utiliser
user.classId : historique et réglages (**DashboardView.tsx:459-488,
660-664**), ainsi que les modules Examen, Problèmes et Olympiades
(**ExamenModule.tsx:145**, **ProblemeModule.tsx:61**,
**OlympiadModule.tsx:51**).

La progression globale reste également scopée sur la classe du compte dans
**useGlobalProgress.ts:626-631**. Après un changement de contexte, cartes et
indicateurs peuvent donc associer le programme accédé à la progression d’un
autre niveau.

**Correction :**

- fournir un contexte de classe unique ;
- interdire la lecture directe de user.classId dans les fonctionnalités contextualisées ;
- tester systématiquement un compte professeur dont le niveau principal diffère du groupe accédé.

### P1 — La planification n’est pas un agenda

La vue actuelle contient :

- une date et une heure ;
- un lien Google Meet facultatif ;
- une unique séance future.

Une nouvelle programmation remplace la précédente. Il manque :

- la liste des séances ;
- les vues jour, semaine et liste ;
- la durée ;
- le chapitre ou la ressource ;
- la salle ou la visio ;
- la récurrence ;
- les rappels ;
- les conflits ;
- l’annulation et le report ;
- l’audience.

**Modèle cible :**

| Champ | Exemple |
|---|---|
| id | ses_20260825_10h |
| classGroupId | 2BAC-PC-A |
| levelId | 2bac-sc-pc |
| chapterId | fonctions |
| title | Étude de fonctions |
| startAt / endAt | 10:00 / 11:30 |
| status | scheduled, running, completed, cancelled |
| location | Salle 4 |
| meetingUrl | Lien Meet |
| recurrence | chaque mardi |
| reminders | 24 h et 15 min avant |

### P1 — Risque de perte de brouillon

La garde existe pour la déconnexion et la fermeture de l’onglet, mais pas pour tous les changements de classe ou de fichier.

**Correction :**

- faire passer toute transition de document par un route guard commun ;
- enregistrer automatiquement un brouillon local ;
- afficher Brouillon enregistré à 14:32 ;
- séparer Enregistrer le brouillon et Publier ;
- restaurer le dernier brouillon après rechargement.

### P1 — Navigation éclatée

La console combine plusieurs états indépendants :

- hash global de l’application ;
- mode PC/tablette ;
- panneau Accueil/Séance/Classe/Contenus ;
- sous-section Élèves/Planification/Notifications/Rotation ;
- classe du Studio ;
- document ouvert.

Cela produit une navigation difficile à partager, restaurer et tester.
Un cas concret existe déjà : **useAppNavigation.ts:43-46** accepte le hash
#studio pour tout utilisateur authentifié, alors que **App.tsx:351-353** ne rend
rien si le rôle n’est pas professeur. Un élève ou un rôle révoqué peut arriver
sur un écran vide au lieu d’être redirigé.

**Correction : routes canoniques**

- /prof/today
- /prof/agenda
- /prof/classes
- /prof/classes/:classGroupId/overview
- /prof/classes/:classGroupId/students
- /prof/classes/:classGroupId/content
- /prof/classes/:classGroupId/tracking
- /prof/sessions/:sessionId/live

## 5. Audit visuel du mode PC

### 5.1 Accueil

**Constat observé :**

- trois cartes statistiques occupent le haut : Niveaux, Contenus publiés, Niveaux actifs ;
- les chemins JSON techniques dominent la liste ;
- aucun titre de page clair ;
- aucune notion de journée, prochaine séance, brouillon ou alerte ;
- le bouton Gérer est répété sans contexte de permission.

Le compteur Contenus publiés est également ambigu : le manifeste fusionne les contenus officiels et ceux du professeur, sans exposer leur provenance.

**Rectification :**

- titre **Aujourd’hui** ;
- prochaine séance et bouton Démarrer ;
- agenda des prochaines 24 heures ;
- classes récemment utilisées ;
- brouillons et contenus récemment modifiés ;
- absences ou élèves à suivre ;
- chemins JSON uniquement dans un mode Avancé.

### 5.2 Page Séance

**Constat observé :**

- deux actions Démarrer sont visibles dans l’état vide ;
- la carte scrcpy, PowerShell, ADB et installation occupe une place importante ;
- cette information technique concurrence la tâche principale : faire cours ;
- le contexte de classe reste discret.

**Rectification :**

- une seule action primaire : **Démarrer la séance** ;
- afficher groupe, chapitre, durée, présents et statut tablette ;
- déplacer l’installation scrcpy dans **Paramètres > Appareils et projection** ;
- conserver seulement une action **Projeter** et un indicateur Connecté/Non connecté ;
- une fois la séance lancée, passer dans une vue live dédiée.

### 5.3 Page Classe / Élèves

**Constat observé :**

- la zone principale est limitée à max-w-3xl sur un écran PC ;
- la majorité de l’écran reste vide ;
- chaque ligne élève concentre présence, téléphone, activité, quatre badges, rotation, partage et détail ;
- la plupart des métadonnées utilisent 10–11 px ;
- l’ordre peut changer automatiquement selon présence et progression ;
- un bug empêche l’en-tête Présents d’apparaître si le premier groupe de la liste contient déjà des présents, dans **ProfSessionPanel.tsx:1011-1019**.

**Rectification : séparer l’appel du suivi**

1. **Vue Présences**, conçue pour aller vite :
   - statut, élève, retard/absence, note rapide, menu ;
   - sélection Tous présents ;
   - autosave et annulation de la dernière action ;
   - aucun badge d’analytics dans la ligne.
2. **Vue Suivi**, conçue pour analyser :
   - dernière activité, progression synthétique, alerte ;
   - recherche, filtres et tri explicites ;
   - détail dans un panneau latéral.

Les deux utilisent une table desktop sémantique, un ordre stable et une largeur
utile de 1200–1280 px. Les actions secondaires restent dans un menu.

### 5.4 Planification

**Constat observé :**

La page n’affiche qu’un petit formulaire en haut d’une grande zone vide. Elle ne donne aucune vue temporelle.

**Rectification :**

- vue semaine par défaut ;
- bascule Jour / Semaine / Liste ;
- couleur par groupe ;
- panneau latéral Nouvelle séance ;
- liste À venir ;
- détection des conflits ;
- possibilité de démarrer une séance depuis l’événement.

### 5.5 Notifications

**Constat observé :**

- les modèles sont utiles ;
- la classe destinataire n’est pas rappelée près du bouton Envoyer ;
- le CTA indique seulement Envoyer à N ;
- la confirmation native ne fournit pas une vraie revue du message.

**Rectification :**

- composer à gauche, aperçu téléphone à droite ;
- rappel persistant du groupe et de l’audience ;
- choix Tous / Présents / Absents / Sélection ;
- confirmation intégrée avec message, date et destinataires ;
- historique des envois.

### 5.6 Studio de contenus

**Constat observé :**

- le rail global et le catalogue Studio occupent ensemble jusqu’à environ 520 px ;
- le Studio adopte un beige texturé et un bleu différents du reste de la console ;
- des titres mathématiques apparaissent en LaTeX brut dans le catalogue ;
- le JSON est le mode affiché par défaut lors de l’ouverture observée ;
- l’éditeur visuel existe, mais ses contrôles sont très discrets et la surface reste largement vide ;
- le fil d’Ariane expose des noms de fichiers techniques.

**Rectification :**

- mode visuel par défaut ; JSON dans Avancé ;
- un seul rail visible à la fois ;
- catalogue repliable ou panneau overlay sous 1100 px ;
- rendu des titres mathématiques dans la navigation ;
- fil d’Ariane humain : Classe > Chapitre > Révision ;
- barre d’actions stable : Brouillon, Prévisualiser, Publier ;
- même système visuel que le reste de l’espace Pro.

### 5.7 Cohérence et accessibilité

Problèmes relevés :

- textes informatifs en slate-400 sur blanc, souvent trop peu contrastés ;
- nombreux contrôles de 28–32 px ;
- champs identifiés surtout par placeholder ;
- recherche sans label explicite ;
- boutons Gérer ou Modifier répétés sans nom accessible contextualisé ;
- aucun système de focus-visible partagé ;
- modales sans gestion homogène d’Escape, du focus initial et du retour de focus ;
- nombreuses couleurs primaires concurrentes : indigo, émeraude, rose, cyan et bleu.

**Cible :**

- corps 14–16 px ;
- texte secondaire 12–14 px avec contraste suffisant ;
- contraste du texte normal d’au moins 4,5:1 ;
- contrôles courants de 40 px, actions importantes de 44 px ;
- indicateur de focus visible de 2 px minimum ;
- deux rayons principaux : 8 et 12 px ;
- une couleur de marque ; vert/ambre/rouge réservés aux statuts ;
- labels persistants et messages asynchrones annoncés.

WCAG 2.2 demande au niveau AA des cibles de 24 × 24 px ou un espacement
équivalent et un focus visible. Le critère Focus Appearance cité ci-dessous est
de niveau AAA : le contour de 2 px est donc retenu ici comme cible renforcée,
pas présenté comme une obligation AA. Pour une interface quotidienne
d’enseignant, viser 40–44 px reste plus confortable :

- [W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C — Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

### 5.8 Internationalisation et arabe RTL

Les composants de **src/components/ProfStudio** utilisent majoritairement des
libellés français en dur, alors que l’application possède déjà un mode arabe
et RTL.

La refonte doit donc vérifier :

- rail et ordre des icônes en RTL ;
- breadcrumbs et boutons retour ;
- grille Agenda et sens de lecture ;
- tableaux, drawers et menus ;
- noms de classes très longs ;
- dates, heures et chiffres localisés ;
- absence de largeur fixe dépendant d’un libellé français.

## 6. Architecture d’information cible

### 6.1 Navigation globale

Le rail principal devrait contenir :

1. **Aujourd’hui**
2. **Agenda**
3. **Classes**
4. **Bibliothèque**
5. **Messages**

En bas :

- Appareils / Projection ;
- Paramètres ;
- Compte.

Le menu global ne doit pas mélanger une séance live avec la gestion d’une
classe. **Agenda** et **Messages** sont des vues multi-classes agrégées ;
**Bibliothèque** contient les ressources globales et personnelles.

### 6.2 Espace d’une classe

Après **Accéder**, un en-tête contextuel reste visible :

    2BAC-PC-A · 2026–2027
    31 élèves · Responsable : Nadia El Mansouri
    [Démarrer une séance] […]

Limiter la barre à quatre ou cinq onglets visibles :

- Vue d’ensemble ;
- Élèves ;
- Contenus ;
- Suivi ;
- Plus : Messages et Paramètres selon les capacités.

L’Agenda global peut être ouvert avec le filtre de ce groupe. **Contenus**
représente les publications du groupe, tandis que **Bibliothèque** reste la
source globale. Nouvelle activité est une action secondaire dans le menu Plus.

### 6.3 Vue Aujourd’hui

Disposition PC recommandée :

| Zone | Contenu |
|---|---|
| Colonne principale, 8/12 | Prochaine séance, chronologie de la journée, actions rapides |
| Colonne secondaire, 4/12 | Alertes, absences, brouillons, synchronisation tablette |

Ne pas commencer par des compteurs généraux. Commencer par ce que l’enseignant doit faire maintenant.

### 6.4 Agenda

Disposition recommandée :

- barre supérieure : date, Aujourd’hui, Jour/Semaine/Liste, filtres de classes ;
- grille horaire principale ;
- panneau latéral À venir ;
- bouton Nouvelle séance ;
- création rapide dans un drawer : groupe, titre/chapitre, début et fin ;
- section Options repliée : récurrence, salle/visio, rappels et audience ;
- couleur de groupe toujours doublée d’un nom ou code visible ;
- objectif : programmer une séance simple en moins de 30 secondes.

### 6.5 Séance live

La séance live est une surface temporaire et focalisée :

- groupe et chapitre toujours visibles ;
- chronomètre et statut ;
- présents ;
- activité courante ;
- commandes Pause / Terminer ;
- projection ;
- accès rapide aux ressources ;
- pas d’administration de structure pendant le live.

Avant le démarrage, afficher un pré-vol :

    Groupe : 2BAC-PC-A
    Chapitre : Étude de fonctions
    Présents : 28/31
    Tablette : connectée
    [Démarrer pour 2BAC-PC-A]

Une séance planifiée passe de scheduled à running en conservant le même
sessionId. Le démarrage rapide crée seulement une séance ad hoc.

### 6.6 Règles d’espace et responsive PC

Une interface aérée ne signifie pas étirer toutes les cartes :

- agenda et tableaux utilisent toute la grille utile ;
- formulaires : largeur 640–760 px ;
- texte éditorial : 65–75 caractères par ligne ;
- gutters : 24 px à 1024–1279, 32 px à partir de 1280 ;
- espacement entre sections : 24–32 px ;
- padding de carte : 16–24 px ;
- mode confortable par défaut, compact facultatif pour les grands tableaux.

Breakpoints fonctionnels :

| Largeur | Comportement |
|---|---|
| ≥ 1280 px | Rail complet, grille 2 colonnes |
| 1024–1279 px | Rail compact, colonne secondaire en drawer |
| < 1024 px ou fenêtre réduite | Une colonne, Agenda en liste, détail en drawer |

Tester aussi le zoom navigateur à 200 %, les libellés longs, le RTL et
l’absence de scroll horizontal global.

## 7. Modèle d’autorisations cible

### 7.1 Capacités

**Capacités locales au groupe**

- class.view
- content.view
- content.use_in_session
- session.run
- attendance.take
- progress.view_summary
- progress.view_detailed
- message.send
- schedule.manage
- content.create
- content.edit_own
- content.publish
- content.manage_group
- members.manage
- class.settings.manage

**Privilèges plateforme, hors ClassGrant**

- grants.manage
- official_content.manage

### 7.2 Matrice recommandée

| Profil local | Accéder | Consulter | Utiliser en séance | Piloter | Présences | Suivi | Planifier | Publier | Membres |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Élève membre | Oui | Oui | Non | Non | Non | Soi-même | Non | Non | Non |
| Prof intervenant | Oui | Oui | Oui | Oui | Oui | Selon capacité | Selon affectation | Non par défaut | Non |
| Responsable de classe | Oui | Oui | Oui | Oui | Oui | Détaillé | Oui | Oui | Oui |
| Admin plateforme sans membership | Non | Bibliothèque officielle | Non | Non | Non | Non | Non | Officiel seulement | Affectations |

Le suivi résumé contient des agrégats pédagogiques. Le suivi détaillé donne
accès aux données individuelles du groupe, mais pas automatiquement aux
coordonnées personnelles ni aux exports. Ces capacités doivent être distinctes.

Un administrateur plateforme n’obtient pas automatiquement le droit de piloter
un cours, faire l’appel ou envoyer un message. Il lui faut un membership local,
ou un mode support temporaire, explicite et audité.

### Règle essentielle

> Les menus et boutons peuvent masquer les fonctions indisponibles, mais chaque route serveur doit refaire la vérification. L’interface ne constitue jamais une sécurité.

## 8. Architecture technique cible

### 8.1 Entités

| Entité | Champs principaux |
|---|---|
| Organization | id, title, timezone |
| ProgramLevel | id, title, curriculum |
| ClassGroup | id, organizationId, levelId, title, schoolYear, status |
| ClassMembership | id, userId, classGroupId, localRole, status |
| ClassGrant | membershipId, capability, effect, grantedBy, startsAt, endsAt |
| LessonSession | id, classGroupId, teacherId, chapterId, scheduledStartAt, scheduledEndAt, startedAt, endedAt, timezone, status |
| Attendance | sessionId, membershipId, status |
| LiveAnswer | sessionId, membershipId, questionId, result |
| ContentItem | id, ownerId, levelId, type, status |
| ContentVersion | id, contentItemId, createdBy, payload, createdAt |
| ContentPublication | contentVersionId, classGroupId, availableFrom, unpublishedAt, status |
| Notification | id, classGroupId, audience, schedule, delivery |

Le cycle d’une séance comprend au minimum scheduled, running, paused,
completed et cancelled. Le levelId d’une séance est normalement dérivé du
ClassGroup ; s’il est conservé comme snapshot, cette duplication doit être
documentée.

Les capacités peuvent partir de presets de rôle local, puis recevoir des
exceptions temporaires pour les remplacements. La résolution doit être
documentée ; un deny explicite et valide doit primer sur un allow.

### 8.2 Frontend par fonctionnalités

Découper les deux principaux monolithes :

- **ProfSessionPanel.tsx : environ 1 281 lignes et plus de 30 états**
- **ProfStudioApp.tsx : environ 2 028 lignes et environ 50 états**

Structure proposée :

    src/features/prof/
      shell/
      today/
      agenda/
      classes/
      live-session/
      attendance/
      students/
      content-studio/
      messaging/
      devices/

Chaque fonctionnalité possède :

- ses composants ;
- son hook de données ;
- ses types ;
- ses tests ;
- son repository/service.

### 8.3 API

Créer un garde de ressource partagé :

    authorizeResourceAction({
      actor,
      action,
      resource
    })

Le serveur ne doit pas faire confiance au classGroupId envoyé par le client.
Il charge d’abord la séance, la publication, le destinataire ou le brouillon,
retrouve son groupe et son propriétaire stockés, puis compose membership,
capacité, ownership et privilège plateforme.

Toutes les routes de séance, présence, élèves, contenu, partage et notification
doivent utiliser cette autorisation.

Toute **commande métier mutante** — démarrage ou bascule de séance, publication,
envoi — doit être cohérente :

1. valider le droit ;
2. appliquer côté serveur ;
3. confirmer l’état serveur ;
4. mettre à jour le client ;
5. afficher une erreur contextualisée en cas d’échec.

La simple action Accéder reste une navigation sans mutation métier.

## 9. Inspirations pertinentes

Il ne faut pas recopier une plateforme, mais reprendre ses bons modèles mentaux :

- **Microsoft Teams Education** centre la navigation sur l’équipe-classe et réunit annonces, ressources épinglées, travaux à venir et fichiers récents dans une page d’accueil de classe. Cela soutient une page de classe orientée action plutôt qu’une liste de chemins techniques :  
  [Microsoft — Get organized in your class team](https://support.microsoft.com/en-US/teams/education/quick-start/get-organized-in-your-class-team)

- **Google Classroom** utilise des cartes de classes réordonnables sur l’accueil et synchronise cet ordre avec la navigation. À reprendre pour la page Classes, avec favoris et récents :  
  [Google Classroom — Organiser les classes](https://support.google.com/edu/classroom/answer/16642267?hl=fr)

- **Moodle** résume les événements à venir tout en donnant accès au calendrier complet et à la vue jour. À reprendre pour relier Aujourd’hui, À venir et Agenda :  
  [MoodleDocs — Upcoming events block](https://docs.moodle.org/en/Upcoming_events_block)

- **Teams Education Calendar** demande un titre, une date, une heure, des détails, une audience et permet la récurrence. Le formulaire actuel doit évoluer vers ce niveau de précision :  
  [Microsoft — Schedule and join a meeting](https://support.microsoft.com/en-us/education/teams/schedule-and-join-a-meeting)

- **Asana** sépare un accueil personnel orienté travail, une liste centralisée et
  des vues Liste/Calendrier avec filtres et vues enregistrées. À reprendre pour
  Aujourd’hui, les filtres persistants et la bascule Liste/Semaine :  
  [Asana — Views in My Tasks](https://help.asana.com/s/article/views-in-my-tasks?language=en_US)

## 10. Plan de rectification priorisé

### Phase 0 — Sécurité et intégrité, avant refonte visuelle

1. Centraliser l’autorisation sur le modèle actuel.
2. Bloquer l’escalade session vers contenu.
3. Fixer la convention profClasses.
4. Cibler les notifications sur les élèves réellement liés.
5. Filtrer les contenus au minimum par niveau et affectation actuels.
6. Supprimer le privilège admin résiduel du Studio.
7. Vérifier la cible d’un partage élève.
8. Ajouter les tests d’isolation, de révocation et de falsification d’identifiant.

### Phase 1 — Modèle métier

1. Séparer ProgramLevel, ClassGroup et LessonSession.
2. Introduire Membership comme source unique des élèves.
3. Préparer le backfill des groupes et memberships existants.
4. Déployer une double lecture/écriture temporaire et des métriques de migration.
5. Scoper roster, présence, live et réponses par groupe/séance.
6. Invalider les anciennes séances puis retirer les anciennes clés.
7. Séparer workspaceGroupId et activeSession.
8. Créer un agenda multi-séances.
9. Mettre en place les versions et publications par groupe.

La migration doit disposer d’un rollback documenté avant la suppression des
anciennes clés.

### Phase 2 — Nouvelle navigation PC

1. Rail Aujourd’hui / Agenda / Classes / Bibliothèque / Messages.
2. Bouton Accéder sur les cartes de classe.
3. En-tête de classe persistant.
4. Onglets contextuels filtrés par capacité.
5. Surface live séparée.
6. Déplacement de scrcpy vers Appareils.

### Phase 3 — Refonte visuelle et composants

1. Grille PC 12 colonnes et largeur utile 1200–1440 px.
2. Tables sémantiques séparées pour Présences et Suivi.
3. Agenda semaine + drawer de création.
4. Unification des couleurs, rayons et typographies.
5. Studio visuel par défaut, JSON avancé.
6. Dialogues et feedback accessibles.
7. Découpage des composants monolithiques.
8. Validation français, arabe RTL, zoom 200 % et fenêtres réduites.

## 11. Corrections par fichier

| Priorité | Fichier | Correction principale |
|---|---|---|
| P0 | api/professor.ts | Autoriser chaque action, valider session-set et les destinataires |
| P0 | api/content.ts | Ne plus dériver les droits de la séance, filtrer les lectures |
| P0 | api/cron/reminders.ts | Cibler un groupe/membership, pas un niveau |
| P0 | api/users.ts | Définir clairement aucun, liste et accès global |
| P0 | profContentService.ts / AdminConsole.tsx | Supprimer le contexte admin résiduel |
| P1 | api/professor.ts + migration | Scoper les clés par groupe et séance |
| P1 | ProfConsoleApp.tsx | Séparer classe consultée et séance, routes canoniques |
| P1 | ProfHomePanel.tsx | Remplacer Gérer par Accéder et refaire l’accueil |
| P1 | ProfSessionPanel.tsx | Découper séance, agenda, élèves, messages, appareils |
| P1 | ProfStudioApp.tsx | Réduire le double rail, préserver les brouillons |
| P1 | DashboardView.tsx | Propager le contexte de classe effectif |
| P2 | ProfSettingsModal.tsx | Scoper les réglages par classe/groupe |
| P2 | UI/design system | Tokens, focus, labels, dialogues, tailles de contrôle |

## 12. Critères d’acceptation

### Droits et isolation

- un professeur affecté uniquement à A ne lit ni roster, progression, présence
  ou publication privée de B, et n’écrit aucune ressource de B ;
- la bibliothèque officielle conserve sa propre politique globale ;
- la révocation de B prend effet immédiatement ;
- accéder à B ne modifie pas une séance live sur A ;
- deux groupes du même niveau ont des listes, présences et notifications séparées ;
- un élève de A ne lit jamais une publication destinée à B ;
- le serveur refuse une ressource de B même si le client falsifie classGroupId ;
- contourner l’interface produit les mêmes refus côté API ;
- aucun CTA Gérer n’est rendu sans la capacité correspondante.

### Navigation

- le contexte de classe est visible sur chaque écran contextuel ;
- Accéder ne produit aucune mutation métier et ne modifie pas la tablette ;
- Démarrer une séance nomme clairement le groupe ciblé ;
- un groupe est accessible en deux actions maximum depuis l’accueil ;
- une séance démarre en trois actions maximum après le choix du groupe ;
- le retour navigateur restaure la bonne classe et le bon onglet ;
- une URL de classe est partageable entre appareils autorisés ;
- filtres, position de lecture et document ouvert sont restaurés au retour.

### Agenda

- plusieurs séances futures peuvent coexister ;
- chaque événement possède groupe, début, fin et statut ;
- la récurrence et l’annulation sont gérées ;
- une notification ne vise que l’audience sélectionnée ;
- les conflits d’horaire sont visibles avant enregistrement ;
- une séance simple est planifiée en moins de 30 secondes ;
- démarrer une séance planifiée conserve le même sessionId.

### Séance et présence

- le pré-vol affiche groupe, chapitre, présents et appareil avant démarrage ;
- pause et reprise conservent le sessionId, les présents et l’activité ;
- Tous présents fonctionne en une action, puis les exceptions se corrigent sans
  ouvrir chaque fiche ;
- les présences sont autosauvegardées avec feedback ;
- une coupure réseau ne perd ni séance ni appel et la reprise est explicite ;
- toute action distante affiche classe et audience à côté du CTA.

### Interface

- aucune information essentielle sous 12 px ;
- une action primaire maximum par zone ;
- navigation clavier complète ;
- focus visible ;
- contrôles importants de 40–44 px ;
- à 1440 px, la largeur disponible est exploitée sans étirer les lignes de texte ;
- à 1024 px, le catalogue Studio passe en panneau repliable ;
- à 200 % de zoom, aucun scroll horizontal global n’apparaît ;
- les mêmes parcours sont utilisables en français et en arabe RTL.

## 13. Éléments solides à conserver

La refonte ne doit pas supprimer les points réussis :

- coque persistante ;
- raccourcis clavier ;
- Studio conservé monté ;
- statut Publié / Non publié ;
- avertissement avant déconnexion avec brouillon ;
- indicateur de synchronisation ;
- modèles de notifications ;
- état vide de séance clair ;
- possibilité d’ouvrir l’interface tablette séparément.

## 14. Conclusion

La console Pro possède déjà de nombreuses fonctions utiles, mais leur organisation repose sur le mauvais pivot. Le pivot ne doit pas être l’outil — Séance, Classe, Contenus — ni le rôle global prof. Il doit être :

1. la **classe réellement accédée** ;
2. les **capacités accordées dans cette classe** ;
3. une **séance live explicitement créée**, distincte de la navigation.

La priorité n’est donc pas de simplement agrandir les cartes ou ajouter de l’espace. Il faut d’abord séparer les concepts et sécuriser les droits, puis reconstruire l’interface autour de **Aujourd’hui, Agenda et Classes**.

La formulation finale recommandée est :

> **Accéder pour consulter. Utiliser en séance pour enseigner. Démarrer pour piloter. Gérer uniquement lorsqu’un droit de gestion existe.**

## 15. État de mise en œuvre — 22 août 2026

Ce rapport n’est plus uniquement prospectif. Le premier lot prioritaire a été
appliqué au code : séparation des contextes, sécurisation serveur, nouvelle
navigation PC, amélioration visuelle et découpage des principaux monolithes.

### 15.1 Droits et isolation appliqués

- la portée d’un professeur est maintenant explicite : `all`, `selected` ou
  `none` ;
- toute promotion vers le rôle professeur démarre en `none`, jusqu’à une
  attribution volontaire par l’administration ;
- les droits sont relus depuis le compte à chaque requête sensible ; une
  séance ou un ancien cookie ne prolonge pas un droit révoqué ;
- roster, rotation live, réponses et présences utilisent des clés Redis
  séparées par professeur **et par classe** ;
- la migration des anciennes clés n’a lieu que lorsque leur classe peut être
  prouvée ; un état ambigu reste volontairement non migré ;
- la classe consultée dans la console et la classe de la séance active sont
  deux états distincts ;
- `Accéder` ouvre localement une classe sans appeler `session-set` et sans
  modifier la tablette ;
- démarrer une nouvelle séance transmet la classe explicitement, tandis que
  pause, reprise, arrêt et lecture de séance ne l’injectent plus ;
- une bascule A → B est refusée pendant une séance A active, y compris pour la
  programmation, les présences, l’activité et les notifications ;
- les partages d’images vérifient le compte élève, son professeur lié et sa
  classe réelle ;
- un abonnement push est construit depuis une session élève authentifiée :
  les champs d’identité envoyés par le navigateur ne sont plus fiables ;
- les notifications immédiates et planifiées ne ciblent que les comptes
  canoniques encore liés au professeur et à la classe ;
- le cron revérifie le rôle et la portée du professeur au moment de l’envoi ;
- les contenus privés du professeur sont filtrés par classe et ne dépendent
  plus de la classe de séance ni d’un ancien contexte admin conservé dans
  l’onglet.

### 15.2 Refonte PC appliquée

La coque est désormais organisée autour des parcours métier :

1. **Aujourd’hui** — état de la séance et raccourcis utiles ;
2. **Agenda** — préparation de la prochaine séance ;
3. **Classes** — cartes, recherche, élèves et rotation ;
4. **Bibliothèque** — ressources pédagogiques ;
5. **Messages** — communication avec l’audience de la classe.

Les changements visuels et ergonomiques comprennent également :

- un rail responsive, compact à largeur réduite ;
- une barre d’état persistante avec classe consultée, classe de séance,
  synchronisation et état du document ;
- le libellé de classe au plus près des commandes de pilotage, planification
  et notification ;
- des contrôles principaux de 40 à 44 px, des focus visibles et des dialogues
  nommés ;
- des cartes de classe aérées avec le verbe `Accéder`, sans chemin JSON exposé ;
- la suppression des doublons Agenda et Messages dans la sous-navigation ;
- un catalogue Studio repliable sur écran compact ;
- la préservation des brouillons lors des changements de panneau et de la
  déconnexion ;
- une confirmation avant d’ouvrir un autre document modifié ;
- une protection contre les réponses réseau obsolètes lors d’ouvertures de
  documents successives ;
- des libellés mathématiques lisibles (`ℕ`, `ℝ`, exposants) dans le catalogue.

### 15.3 Découpage des grands fichiers

| Orchestrateur | Avant ce lot | Après | Découpage principal |
|---|---:|---:|---|
| `ProfConsoleApp.tsx` | environ 520 lignes | 350 lignes | rail, statut, dialogue brouillon, accueil du jour |
| `ProfSessionPanel.tsx` | 1 281 lignes | 142 lignes | 20 modules de séance, tous ≤ 181 lignes |
| `ProfStudioApp.tsx` | 2 028 lignes | 390 lignes | catalogue, document, ressources, modales et hooks, tous ≤ 209 lignes |
| `ProfSettingsModal.tsx` | 589 lignes | 145 lignes | 12 modules de réglages, tous ≤ 195 lignes |
| `AdminConsole.tsx` | environ 665–700 lignes | 376 lignes | 10 modules, tous ≤ 136 lignes |
| `api/professor.ts` | environ 830 lignes | 237 lignes | salle 251, séance 255, partage 167, clés 186 lignes |

Le résultat recherché est un orchestrateur lisible et des modules ayant une
responsabilité claire, sans changer les contrats publics des composants et
services.

### 15.4 Vérifications réalisées

- audit visuel de la console à 1 280 px ;
- audit compact à 1 024 px avec rail replié et catalogue Studio adapté ;
- parcours vérifiés : Aujourd’hui, Classes, détail d’une classe, Pilotage,
  Agenda, Messages et Bibliothèque ;
- journal réseau contrôlé : cliquer sur `Accéder` pour une autre classe ne
  produit aucun appel `session-set` ;
- TypeScript : réussi ;
- ESLint complet : réussi ;
- tests Vitest : **75/75 réussis** ;
- build Vite et génération PWA : réussis ;
- validation des contenus : **70 chapitres, 492 exercices, 0 erreur** et 16
  avertissements non bloquants ;
- `git diff --check` : réussi.

Le build conserve un avertissement préexistant : `pushService.ts` est importé
à la fois statiquement et dynamiquement. Il ne bloque ni la compilation ni le
fonctionnement.

### 15.5 Compatibilité volontairement fail-closed

Après déploiement :

- un ancien abonnement push sans `accountId` devra se resynchroniser depuis
  une session élève authentifiée avant de recevoir un message professeur ;
- un état classroom legacy sans classe démontrable ne sera pas copié ;
- un ancien job planifié sans audience explicite sera consommé sans envoi.

Ces choix peuvent demander une reconnexion ou une reconfiguration ponctuelle,
mais évitent une fuite vers la mauvaise classe.

### 15.6 Phase 2 encore nécessaire

Le lot ne prétend pas couvrir les évolutions structurelles les plus larges :

- créer de vrais `ClassGroup`, `Membership` et `LessonSession` afin de gérer
  plusieurs groupes distincts d’un même niveau ;
- remplacer la programmation unique par un agenda multi-séances avec durée,
  récurrence, annulation et conflits ;
- ajouter des URLs canoniques et un historique navigateur complet pour les
  classes, séances et documents ;
- terminer les audits systématiques à 200 % de zoom et en arabe RTL ;
- découper, dans un lot backend indépendant, les monolithes généraux qui ne
  sont pas propres à la console PC, notamment `api/users.ts` et
  `api/cron/reminders.ts`.

La base obtenue est néanmoins cohérente avec le principe cible : **les écrans
et les actions dépendent de la classe autorisée et explicitement choisie ; la
simple navigation ne change plus la séance métier.**

### 15.7 Lot UX complet — restyle appliqué après revue

Le premier habillage restait trop proche des écrans antérieurs. Une seconde
intervention a donc remplacé la présentation, et non seulement quelques
cartes, pour faire de Pro PC un véritable **poste de pilotage enseignant**.

- le rail latéral devient une navigation sombre, persistante et dépliable ;
  les cinq espaces métier sont immédiatement identifiables et l’état actif ne
  dépend plus de simples liens textuels ;
- l’espace de travail clair utilise une grille, des fonds très légers, des
  panneaux généreux et une hiérarchie constante (surtitre, titre, contexte,
  action) ;
- **Aujourd’hui** devient un tableau de bord de séance : carte live,
  prochain repère, raccourcis de classes, agenda et bibliothèque ;
- **Classes** devient un tableau de groupes avec recherche, indicateurs de
  présence/ressources et verbes d’action visibles ;
- **Pilotage**, **Agenda**, **Messages**, **Présences**, **Registre** et
  **Projection** ont chacun leur mise en page dédiée, leurs CTA arrondis et
  leurs informations de contexte au voisinage de l’action ;
- la **Bibliothèque** reprend le même contraste sombre/clair : en-tête Studio
  affirmé, catalogue latéral aéré et atelier central éditorial ;
- la fenêtre de réglages suit la nouvelle identité (fond obscur, panneau
  spacieux, catégories lisibles, action finale unique) ;
- les boutons importants sont homogénéisés : hauteur confortable, rayon
  cohérent, couleur réservée à l’action principale, focus et hover visibles.

Cette refonte ne modifie pas les règles métier : consulter une classe ne
démarre toujours aucune séance, et les contrôles de portée serveur restent les
garants des droits.

La revue a été effectuée à 1 280 px puis à 1 024 px : le rail se replie, peut
être déployé explicitement, le Studio reste navigable et les réglages restent
entièrement utilisables sans débordement global.
