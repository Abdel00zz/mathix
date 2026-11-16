# Liaison tablette professeur ↔ PC professeur

> Ce guide explique **comment les deux appareils du professeur (tablette et PC)
> sont liés**, ce qui est synchronisé entre eux, et la démarche pas à pas pour
> mettre en route une séance. Il complète
> [`ARCHITECTURE_ESPACE_PROFESSEUR.md`](ARCHITECTURE_ESPACE_PROFESSEUR.md) et
> [`SCRCPY_PROJECTION.md`](SCRCPY_PROJECTION.md).

---

## 1. Le principe : un seul compte, deux appareils autorisés

Le professeur a **un seul compte** (`role: 'prof'`), mais peut l'utiliser sur
**plusieurs appareils** (le PC de la régie et la tablette de classe).

- L'**administrateur** ouvre la liste des utilisateurs et clique sur **`+ Prof`**.
- Cela génère un **lien d'appareil à usage unique**, à ouvrir sur chaque appareil.
- Chaque ouverture pose un **cookie `HttpOnly`** (`mathplus_account_session`)
  signé côté serveur : JavaScript ne le voit jamais.
- Le rôle est **relu côté serveur** à chaque appel sensible (`/api/users?action=me`),
  jamais accordé par le client.

> Conséquence : la tablette et le PC sont liés parce qu'ils partagent le **même
> compte** et donc le **même espace Redis**, pas parce qu'ils se parlent en pair
> à pair.

```
  Admin  ──(+ Prof)──►  lien appareil (usage unique)
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                      ▼
   PC prof (régie)                        Tablette prof (classe)
   cookie account_session                  cookie account_session
        │                                      │
        └────────────►  Upstash Redis  ◄───────┘
                        (isolé par prof)
```

---

## 2. Le canal de synchronisation (Redis)

Tout l'état partagé vit dans **Upstash Redis**, isolé par l'identité du
professeur (`prof:classroom:{owner}:…`). Il n'y a **pas de connexion directe**
entre les deux appareils : chacun écrit/lit Redis via l'API.

| Clé | Rôle | Qui écrit | Qui lit |
|-----|------|-----------|---------|
| `session` | état de la séance (statut, chapitre, programmation, Meet) | PC (pilotage) et tablette (chapitre) | les deux |
| `roster` | liste d'élèves (registre) | PC | tablette |
| `live` | tour courant / réponses | tablette | PC |
| `present` | élèves déclarés présents | PC | les deux |
| `answerStatus` | correct / incorrect par élève | tablette (évaluation) | les deux |
| `profPage` / `profPrefs` | personnalisation (compte) | PC | tablette |

> **Transport** : le canal de base est le **polling Redis** (fiable sur tout
> réseau). Une option **« Synchronisation rapide »** (PC : Paramètres →
> Synchronisation ; tablette : modale Paramètres) réduit le polling à ~1,2 s pour
> un ressenti quasi temps réel sur le WiFi de la classe.
> Elle reste optionnelle et ne remplace pas Redis. (Un canal WebSocket/WebRTC
> exigerait un serveur persistant — non disponible sur Vercel serverless — et
> resterait de toute façon une option complémentaire.)

> **Le même WiFi n'est pas un raccourci** : même côte à côte sur le réseau de la
> classe, les deux appareils ne se parlent pas. Chaque paquet monte chez Vercel,
> passe par Upstash Redis et redescend. Le WiFi local n'améliore que la latence
> du trajet. La **seule** liaison réellement locale est `adb`/`scrcpy` (§7), qui
> ouvre un vrai socket tablette ↔ PC sur le LAN — mais pour projeter l'écran,
> pas pour transporter l'état de la séance.


> **Indicateur** : le **sidebar** de la tablette prof (barre du bas en portrait,
> rail latéral en paysage) affiche la **pastille de statut** — verte (en cours,
> pulsation), ambre (pause), rouge (terminée), grise (prête) — pilotée par le
> statut de séance lu depuis le PC. La bannière n'affiche plus de pastille.

---

## 3. Le circuit de la séance (PC → tablette)

1. Sur le **PC**, la **barre du haut** de la console porte le pilotage :
   `Démarrer / Pause / Arrêter`.
2. Chaque action appelle `POST /api/professor?action=session-set` → Redis.
3. La **tablette** relit l'état (`getSessionState`, toutes les 4–5 s, mis en
   pause quand l'onglet est masqué) et affiche le bandeau « Séance en cours /
   en pause / terminée ».

**Ce qui transite** : `status`, `chapterId`, `chapterTitle`, `scheduledAt`,
`meetLink`, `startedAt`.

**Bascule de niveau (classe enseignée)** — attention, deux états distincts :

| État | Où il vit | Effet sur la tablette |
|------|-----------|-----------------------|
| **classe consultée** | local au PC (rail des classes) | **aucun** |
| **classe de la séance** (`session.classId`) | Redis | la tablette bascule son contenu (`effectiveClassId`) |

Choisir une classe dans le rail de gauche n'écrit **rien** dans Redis : c'est un
simple changement de contexte de travail sur le PC. Seul **`Démarrer`** écrit
`classId` dans la séance (`serializeSessionStart`) — c'est là que la tablette
suit. `Pause`, `Reprendre` et `Arrêter` n'envoient que le statut, jamais la
classe. Et une bascule A → B est **refusée** (`409
active_session_class_conflict`) pendant qu'une séance A tourne : pour changer de
niveau, il faut arrêter la séance courante puis en démarrer une sur l'autre
classe. Cette séparation est volontaire (voir
[`RAPPORT_AUDIT_SESSION_PRO_PC.md`](RAPPORT_AUDIT_SESSION_PRO_PC.md) §15.1) :
consulter une autre classe pendant une séance ne doit pas déplacer la classe des
élèves.


---

## 4. Le circuit du chapitre (tablette → PC)

Le chapitre travaillé est choisi sur la **tablette** (c'est elle qui est en
classe) :

1. Le prof (tablette) ouvre un chapitre et lance **quiz**, **exercices** ou
   **révision**.
2. Au lancement, la tablette enregistre le chapitre dans la séance :
   `setSessionState({ chapterId, chapterTitle })`.
3. Le **PC** (qui poll `getSessionState`) voit le chapitre apparaître, ce qui
   alimente :
   - la **synthèse d'impression** (« Imprimer la séance ») ;
   - la **programmation** de la séance (notifications aux élèves) ;
   - le **chapitre** affiché dans la modale Paramètres de la tablette.

> Sans ce branchement, « Imprimer la séance » restait vide (spinner) : le PC
> n'avait aucun chapitre à archiver. C'est corrigé par `recordSessionChapter`.

---

## 5. Le circuit des notifications (prof → élèves)

| Action (PC) | Endpoint | Effet |
|-------------|----------|-------|
| **Démarrer** la séance | `session-set` (`running`) | push « Séance en cours » aux **absents** |
| **Programmer** (date + Meet) | `session-schedule` | job programmé → cron → push à l'heure précise |
| **Envoyer** un message (modèles) | `session-notify` | push immédiat aux élèves (tous ou absents) |

Les modèles de notification sont **personnalisables** dans les paramètres PC
(`profPage.notifyTemplates`) et réutilisés sur les deux appareils.

---

## 6. La personnalisation (PC → tablette)

Les paramètres se règlent sur le **PC**, à deux endroits distincts :

**Section « Paramètres » du rail** — ce qui change l'expérience de la tablette
pendant la séance :

- **Révision** : taille de texte, thème papier, solutions, **titres des blocs**,
  mode lecture pas à pas.
  - *Titres des blocs* décoché : le titre-question des propriétés, définitions,
    théorèmes et méthodes disparaît **et** leur contenu s'affiche d'emblée dans
    son encadré, sans bouton « Afficher » — la fiche se lit à plat, badge puis
    contenu. Les indices, solutions et énoncés d'exercice gardent leur repli,
    qui porte leur sens.
- **Quiz / Exercices** : corrections, mélange des questions, zone de réponse,
  une question par page.
- **Canvas** : zones de dessin elles-mêmes, boutons d'ouverture, blancs
  interactifs, barre d'outils.
- **Couleurs** : thème du dashboard tablette.
- **Synchronisation** : synchro rapide (~1,2 s au lieu de 4–5 s).

**Menu « ⋮ » de la barre du haut → « Réglages avancés »** — ce qui ne concerne
pas le pilotage :

- **Ma page** : bannière « Je suis ton professeur », chapitres mis en avant.
- **Notifications** : modèles de notification.
- **Contenu** : transfert de contenus.

Ils sont remontés via `onUpdateProfile` (`profPage` / `profPrefs`) → Redis → et
**relus par la tablette** au chargement / à la mise à jour du profil.

Sur la **tablette**, la modale Paramètres (mode prof) porte cinq onglets —
**Séance**, **Ma page**, **Contenu**, **Affichage**, **Système** — et l'onglet
**Contenu** donne accès aux réglages de révision, de quiz, d'exercices et de
canvas : les réglages de séance peuvent donc être ajustés directement sur la
tablette, sans passer par le PC.

---

## 7. Projection de l'écran (scrcpy)

Pour **voir l'écran de la tablette sur le PC** (miroir + éventuel enregistrement),
utiliser `scrcpy` via le script `scrcpy-projection.ps1` :

```powershell
# USB
.\scrcpy-projection.ps1 -Mode Usb -Qualite Haute -Audio

# WiFi (même réseau)
.\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\captures\seance.mp4"
```

Voir [`SCRCPY_PROJECTION.md`](SCRCPY_PROJECTION.md) pour le téléchargement,
l'activation du débogage USB et le passage en WiFi.

---

## 8. Démarche pas à pas (mise en route d'une séance)

1. **Autoriser les appareils** : Admin → `+ Prof` → ouvrir le lien sur le PC
   **et** sur la tablette.
2. **Choisir la classe** dans le rail de gauche du PC. À ce stade la tablette ne
   bouge pas encore : c'est `Démarrer` (étape 6) qui lui transmet la classe.
3. **Préparer sur le PC** (rail de gauche : *Gérer les séances*, *Élèves*,
   *Studio édition*, *Paramètres*) :
   - section **Élèves** : déclarer les **élèves présents**, régler la rotation,
     préparer les messages ;
   - section **Gérer les séances** : programmer le prochain créneau (date/heure +
     lien Google Meet) et ouvrir le bloc **Projection**.
4. **Vérifier la synchro** : la barre du haut du PC signale la synchronisation ;
   sur la tablette, Paramètres → « Synchronisation avec le PC » doit afficher
   « Connecté au pilotage ».
5. **Lancer sur la tablette** : ouvrir le chapitre → quiz/exercice/révision
   (le chapitre remonte au PC).
6. **Piloter sur le PC** : `Démarrer` (barre du haut) → la classe consultée
   devient la classe de la séance, les élèves **absents** reçoivent la
   notification, les présents suivent la rotation.
7. **Envoyer un rappel** : section Élèves → « Textes prédéfinis » → Envoyer.
8. **Archiver** : section Gérer les séances → « Imprimer la séance »
   (disponible en pause ou terminée) → PDF (exercices + quiz remplis + zones
   manuscrites + présents).
9. **Projeter / enregistrer** : bloc Projection, lancer `scrcpy-projection.ps1`
   si besoin.

---

## 8 bis. La page « élèves présents » — quand elle s'ouvre

Sur la tablette, ouvrir une **révision**, un **quiz** ou un **exercice** en mode
prof affiche d'abord la page de séance : la liste des élèves **présents** avec
leur résultat sur l'activité. Elle sert à annoncer le contenu et à voir où en est
la classe avant de commencer.

Cette page **ne s'ouvre que si un appel a été fait** :

| Appel | Ce qui se passe au clic sur Révision / Quiz / Exercices |
|:------|:-------------------------------------------------------|
| Aucun élève déclaré présent | L'activité s'ouvre **directement** — pas de page intermédiaire |
| Un ou plusieurs présents | La page de séance s'affiche, filtrée sur les présents, puis « Commencer » lance l'activité |

L'appel se déclare des deux côtés :

- **PC** — rail de gauche → *Élèves* → cocher les présents, puis `Enregistrer`.
- **Tablette** — Paramètres → onglet **Séance** → **toucher un élève** pour le
  marquer présent ou absent. L'enregistrement suit le geste (aucun bouton
  « Enregistrer » à oublier).

Le mécanisme est **réactif** : la présence est publiée en mémoire dès le geste,
puis enregistrée, et un événement de séance (`mathplus:session-updated`) est émis
à chaque appel. Le tableau de bord **relit donc la décision à chaque clic** :
déclarer un élève — même après coup, même depuis l'autre appareil — réactive la
page de séance immédiatement, sans rechargement. Réciproquement, en retirant le
dernier présent, l'activité suivante s'ouvre directement.

> Si la page s'affiche alors qu'aucun élève n'a été appelé, c'est que la présence
> n'a pas encore pu être lue (hors ligne) : le professeur peut alors commencer
> normalement, ou fermer la page pour entrer dans l'activité.

---

## 9. Dépannage de la liaison

| Symptôme | Cause / solution |
|----------|------------------|
| La tablette n'a pas le mode prof | Lien d'appareil non ouvert sur cette tablette → Admin → `Appareil` |
| La tablette ne bascule pas de classe | Normal : choisir une classe dans le rail ne transmet rien. Il faut `Démarrer` une séance sur cette classe (et arrêter la précédente si une autre tourne — sinon `409 active_session_class_conflict`) |
| « Analyse de la séance… » vide | Aucun chapitre lancé depuis la tablette → lancer un quiz/exercice |
| La tablette ne reflète pas « Démarrer » | Vérifier le réseau / relire après ~5 s (polling) |
| Notifications non reçues | Élèves sans abonnement push, ou noms d'élèves incohérents entre `users:prof:*` et l'abonnement |
| Projection noire | Voir `SCRCPY_PROJECTION.md` (§6 dépannage) |
