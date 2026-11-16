# Guide Pratique : Systeme de Notifications & Push — Math+

> Guide complet pour comprendre, configurer et etendre le systeme de notifications push, in-app et email de la plateforme Math+.

---

## Table des matieres

1. [Architecture Generale](#1-architecture-generale)
2. [Circuit Push : du Cron au Smartphone](#2-circuit-push--du-cron-au-smartphone)
3. [Notifications Calendrier (start_date / end_date)](#3-notifications-calendrier)
4. [Ajouter une Nouvelle Classe](#4-ajouter-une-nouvelle-classe)
5. [Ajouter du Contenu Special (Concours, Examens)](#5-ajouter-du-contenu-special)
6. [Systeme In-App (notificationService)](#6-systeme-in-app)
7. [Email de Notification (Inscription)](#7-email-de-notification)
8. [API Admin : Lister les Utilisateurs](#8-api-admin)
9. [Variables d'Environnement](#9-variables-denvironnement)
10. [Optimisation & Bonnes Pratiques](#10-optimisation)
11. [Depannage](#11-depannage)
12. [Exemples Concrets](#12-exemples-concrets)

---

## 1. Architecture Generale

```
+-------------------+       +------------------+       +------------------+
|   NAVIGATEUR      |       |   VERCEL API     |       |   UPSTASH REDIS  |
|                   |       |                  |       |                  |
| pushService.ts    | POST  | /api/push/       |  SET  | push:subscribers |
| (subscribe)  ---------> | subscribe.ts  ---------> | push:{hash}      |
|                   |       |                  |       |                  |
| Services push     |       | /api/users/      |  SET  | users:all        |
| (PushBanner)      |       | register.ts  ---------> | user:phone:...   |
+-------------------+       +------------------+       +------------------+
                                    |
                                    |  CRON 17h UTC
                                    v
                            +------------------+
                            | /api/cron/       |
                            | reminders.ts     |
                            |                  |
                            | 1. Lire Redis    |
                            | 2. Fetch manifest|
                            | 3. Calculer date |
                            | 4. webpush.send  |
                            +------------------+
                                    |
                                    v
                            +------------------+
                            | SERVICE WORKER   |
                            | sw-push.js       |
                            |                  |
                            | -> Notification  |
                            |    native OS     |
                            +------------------+
```

### Fichiers cles

| Fichier | Role |
|---------|------|
| `services/pushService.ts` | Client : abonnement, permission, sync backend |
| `services/notificationService.ts` | Client : notifications in-app (badge, modal) |
| `public/sw-push.js` | Service Worker : reception push, affichage natif |
| `api/push/subscribe.ts` | Backend : stocker abonnement dans Redis |
| `api/push/send.ts` | Backend : envoyer push a tous/un eleve |
| `api/push/unsubscribe.ts` | Backend : supprimer abonnement |
| `api/cron/reminders.ts` | Cron : push quotidien calendrier + motivation |
| `api/users/register.ts` | Backend : inscription + email + unicite |
| `api/users/list.ts` | Backend : liste admin des inscrits |
| `vercel.json` | Config cron schedule + rewrites |
| `vite.config.ts` | Injection sw-push.js dans le Service Worker |

---

## 2. Circuit Push : du Cron au Smartphone

### Etape 1 — L'eleve active les notifications

Dans la modale "Messages", le bandeau en bas propose "Activer les notifications".

```
Clic "Activer"
    -> Notification.requestPermission()
    -> PushManager.subscribe(VAPID_PUBLIC_KEY)
    -> POST /api/push/subscribe { subscription, studentName, classId }
    -> Redis: push:{hash} = { subscription, classId, ... }
    -> Redis: push:subscribers.add(push:{hash})
```

**Important** : Le `classId` est envoye avec l'abonnement. C'est ce qui permet au cron de savoir quelles notifications envoyer a quel eleve.

### Etape 2 — Le cron s'execute (17h UTC chaque jour)

```
Vercel Cron -> GET /api/cron/reminders (Authorization: Bearer CRON_SECRET)

1. Redis: SMEMBERS push:subscribers -> liste des cles
2. Pour chaque cle: GET push:{hash} -> { subscription, classId }
3. Grouper par classId
4. Pour chaque classe:
   a. Fetch https://{VERCEL_URL}/data/classes/{classId}.json
   b. Pour chaque chapitre avec start_date/end_date:
      - Fetch manifest individuel si necessaire
      - Calculer daysBetween(today, start_date)
      - Generer notifications (J-2, J-1, J, mi-parcours, fin)
   c. Pour chaque chapitre avec session_dates ou exercices avec sessionDate:
      - Collecter toutes les dates de seance
      - Generer notifications (demain, aujourd'hui, en direct)
5. Envoyer via webpush.sendNotification()
6. Si aucune notif prioritaire: envoyer rappel motivationnel
7. Nettoyer abonnements expires (410/404)
```

### Etape 3 — Le smartphone recoit la notification

```
sw-push.js:
  push event -> self.registration.showNotification(title, { body, icon, tag })
  notificationclick -> clients.openWindow(url) ou focus tab existant
```

---

## 3. Notifications Calendrier

### Les 6 types de notification automatiques

| Moment | Declencheur | Titre | Priorite |
|--------|-------------|-------|----------|
| **J-2** | 2 jours avant `start_date` | "Nouveau chapitre dans 2 jours" | Haute |
| **J-1** | 1 jour avant | "C'est demain !" | Haute |
| **J** | Le jour de `start_date` | "C'est parti !" | Haute |
| **Mi-parcours** | 50% de la duree ecoulee | "As-tu fait le quiz ?" | Normale |
| **J-2 fin** | 2 jours avant `end_date` | "Plus que 2 jours" | Haute |
| **Fin** | Le jour de `end_date` | "Chapitre termine" | Normale |

### Comment ca marche dans le manifest

```json
// public/data/1ere-bac-sc-math/arithmetique/manifest.json
{
  "id": "arithmetique",
  "title": "Arithmetique dans Z",
  "start_date": "2026-03-28",
  "end_date": "2026-04-07",
  "revisions": [...],
  "exercises": [...],
  "quizzes": [...]
}
```

Le cron cherche `start_date` / `end_date` dans :
1. D'abord le manifest de classe (`data/classes/{classId}.json` → champ direct)
2. Sinon le manifest du chapitre (`manifestPath` → fichier JSON individuel)

### Format des dates

```
start_date: "YYYY-MM-DD"   (ex: "2026-03-28")
end_date:   "YYYY-MM-DD"   (ex: "2026-04-07")
```

**Attention** : ne PAS utiliser le format `MM/DD/YYYY` ou `DD-MM-YYYY`. Le seul format accepte est **ISO `YYYY-MM-DD`**.

---

## 3b. Notifications Seances de Correction (sessionDate)

Le systeme detecte les dates de seance de correction de 3 manieres :

### Sources des dates de seance

| Source | Champ | Format | Exemple |
|--------|-------|--------|---------|
| Manifest de classe | `session_dates` (array) | ISO 8601 UTC | `"2026-01-25T20:00:00.000Z"` |
| Manifest de chapitre | `session_dates` (array) | ISO 8601 UTC | idem |
| Exercice individuel | `sessionDate` (string) | ISO 8601 UTC | `"2026-01-25T19:00:00.000Z"` |

### Notifications generees

| Moment | Declencheur | Titre | Push |
|--------|-------------|-------|------|
| **Demain** | 6h a 30h avant la seance | "Correction demain" | Oui |
| **Aujourd'hui** | 0 a 6h avant | "Correction aujourd'hui a XXh" | Oui |
| **En direct** | 0 a 2h apres le debut | "Correction en direct" | Oui |

### Ajouter une seance dans le manifest chapitre

```json
// public/data/classes/1ere-bac-sc-math.json -> chapitre limites
{
  "id": "limites",
  "title": "Limites d'une fonction numerique",
  "session_dates": [
    "2026-01-25T20:00:00.000Z",
    "2026-01-26T20:00:00.000Z",
    "2026-01-28T20:00:00.000Z"
  ],
  ...
}
```

### Ajouter une seance dans un exercice

```json
// public/data/1ere-bac-sc-math/limites/exercises/ex_01.json
{
  "id": "ex_01",
  "topic": "Limites : Techniques de Base",
  "sessionDate": "2026-01-25T19:00:00.000Z",
  "questions": [...]
}
```

### Timezone

Les dates sont stockees en **UTC** (suffixe `Z`). L'affichage dans les notifications utilise le fuseau **Africa/Casablanca** (GMT+1) pour que l'heure affichee corresponde au Maroc.

### Circuit complet d'une seance

```
1. Prof ajoute "sessionDate": "2026-04-10T19:00:00.000Z" dans ex_01.json
2. Deploy sur Vercel
3. Cron 17h UTC (9 avril) :
   -> Fetch exercice, detecte sessionDate demain
   -> Push: "Correction demain — Limites a 20h00. Termine tes exercices !"
4. Cron 17h UTC (10 avril) :
   -> diffHours = 2h avant la seance
   -> Push: "Correction aujourd'hui a 20h00 !"
5. L'eleve ouvre l'app pendant la seance :
   -> In-app: "Session en direct — Correction en cours"
```

---

## 4. Ajouter une Nouvelle Classe

### Etape 1 : Creer le manifest de classe

```
public/data/classes/ma-nouvelle-classe.json
```

```json
{
  "id": "ma-nouvelle-classe",
  "title": "Ma Nouvelle Classe",
  "chapters": [
    {
      "id": "chapitre-1",
      "title": "Premier Chapitre",
      "manifestPath": "data/ma-nouvelle-classe/chapitre-1/manifest.json",
      "revisions": [{ "path": "data/ma-nouvelle-classe/chapitre-1/revisions/cours.json" }],
      "quizzes": [{ "id": "quiz-1", "path": "data/ma-nouvelle-classe/chapitre-1/quiz/quiz.json" }]
    }
  ]
}
```

### Etape 2 : Ajouter au manifest racine

```json
// public/data/manifest.json
{
  "classes": [
    ...classes existantes,
    {
      "id": "ma-nouvelle-classe",
      "title": "Ma Nouvelle Classe",
      "path": "data/classes/ma-nouvelle-classe.json"
    }
  ]
}
```

### Etape 3 : Ajouter les dates dans les chapitres

```json
// public/data/ma-nouvelle-classe/chapitre-1/manifest.json
{
  "id": "chapitre-1",
  "title": "Premier Chapitre",
  "start_date": "2026-09-15",
  "end_date": "2026-09-30",
  ...
}
```

### C'est tout !

Le cron detecte automatiquement la nouvelle classe quand un eleve s'y inscrit (`classId` dans Redis). Pas besoin de modifier le code.

---

## 5. Ajouter du Contenu Special

### Concours / Examens nationaux

Pour notifier les eleves d'un concours ou examen, deux approches :

#### Approche A : Via le calendrier chapitre (recommandee)

Creer un "chapitre" special dans le manifest de classe :

```json
{
  "id": "concours-olympiades-2026",
  "title": "Olympiades de Mathematiques 2026",
  "start_date": "2026-05-10",
  "end_date": "2026-05-10",
  "revisions": [
    { "path": "data/1ere-bac-sc-math/concours/olympiades_prep.json" }
  ]
}
```

Notifications automatiques :
- **J-2** : "Olympiades dans 2 jours — revise les points cles !"
- **J** : "Olympiades aujourd'hui — bon courage !"

#### Approche B : Via l'API Push directe (pour messages ponctuels)

```bash
curl -X POST https://votre-app.vercel.app/api/push/send \
  -H "Content-Type: application/json" \
  -H "x-push-secret: VOTRE_PUSH_SECRET" \
  -d '{
    "title": "Examen Regional demain !",
    "body": "N oublie pas de reviser les chapitres 1 a 5. Bonne chance !",
    "url": "/",
    "tag": "exam-regional-2026",
    "type": "exam"
  }'
```

Parametres disponibles :

| Champ | Type | Description |
|-------|------|-------------|
| `title` | string | Titre de la notification |
| `body` | string | Corps du message |
| `url` | string | Page a ouvrir au clic (defaut: `/`) |
| `tag` | string | Identifiant pour deduplication |
| `type` | string | Libre : `exam`, `concours`, `urgent`, etc. |
| `targetStudent` | string | Optionnel : nom d'un eleve specifique |

#### Approche C : Examens periodiques (corrections en session)

Utiliser `sessionDate` dans les exercices pour declencher des notifications de session LIVE :

```json
// Dans un fichier exercice .json
{
  "id": "exam-blanc-01",
  "sessionDate": "2026-04-15T18:00:00.000Z",
  "questions": [...]
}
```

Le `notificationService` genere automatiquement :
- **2h avant** : "Correction dans 2h" (HAUTE priorite)
- **Pendant** : "Session en direct — Correction disponible" (URGENTE)

---

## 6. Systeme In-App

### Generateurs automatiques

Le `notificationService` cote client genere des notifications intelligentes :

| Generateur | Declencheur | Exemple |
|-----------|-------------|---------|
| `generateFromChapterSchedule()` | Ouverture dashboard | "Le chapitre X commence demain" |
| `generateRetentionReminders()` | Ouverture dashboard | "Retablissement de memoire : chapitre X (retention 42%)" |
| `generateFromContentChanges()` | Ouverture dashboard | "3 nouveaux exercices dans le chapitre X" |
| `generateFromProgress()` | Ouverture dashboard | "Trajectoire ascendante : +12pts sur 2 chapitres" |
| `generateFromSessionDates()` | Ouverture dashboard | "Correction dans 2h" |
| `onQuizCompleted()` | Fin de quiz | "Score parfait : 100% !" |

### Deduplication

Chaque notification a un `fingerprint` (ex: `reminder:retention-limites`). Si une notification avec le meme fingerprint existe dans les 4 dernieres heures, elle n'est pas re-creee.

### Retention Ebbinghaus

Formule : **R(t) = e^(-t/S)**

| Score quiz | Stabilite S | Premier rappel optimal |
|-----------|-------------|----------------------|
| >= 90% | 28 jours | ~19 jours |
| >= 75% | 21 jours | ~15 jours |
| >= 60% | 14 jours | ~10 jours |
| >= 45% | 7 jours | ~5 jours |
| < 45% | 4 jours | ~3 jours |

Notification declenchee quand la retention estimee tombe sous **55%**. Maximum **2 rappels par session** pour eviter la fatigue.

---

## 7. Email de Notification

### Inscription d'un nouvel eleve

A chaque **nouvelle inscription** (pas les reconnexions), un email est envoye via Resend :

```
De: MathPlus <onboarding@resend.dev>
A: bdh.malek@gmail.com (RECIPIENT_EMAIL)
Sujet: "Nouvel inscrit : Ahmed — 1ere Bac Sciences Math"

Contenu HTML :
+----------------------------------+
| Math+  NOUVELLE INSCRIPTION      |
+----------------------------------+
| Nom      : Ahmed                 |
| Telephone: +212 612 345 678      |
| Classe   : 1ere Bac Sc Math      |
| Date     : mardi 25 mars 2026    |
+----------------------------------+
| Total inscrits: 47  |  Classe: 12|
+----------------------------------+
```

### Pas d'email si reconnexion

Le systeme detecte les reconnexions (meme nom + meme telephone) et ne renvoie pas d'email.

---

## 8. API Admin

### Lister tous les inscrits

```bash
# Tous les eleves
curl "https://votre-app.vercel.app/api/users?action=list" \
  -H "x-admin-secret: VOTRE_ADMIN_SECRET"

# Filtrer par classe
curl "https://votre-app.vercel.app/api/users?action=list&classId=1ere-bac-sc-math" \
  -H "x-admin-secret: VOTRE_ADMIN_SECRET"
```

**Reponse** :

```json
{
  "users": [
    {
      "name": "Ahmed",
      "phone": "+212612345678",
      "classId": "1ere-bac-sc-math",
      "className": "1ere Bac Sciences Mathematiques",
      "registeredAt": 1711324800000,
      "lastActive": 1711324800000
    }
  ],
  "count": 1
}
```

### Envoyer un push a tous

```bash
curl -X POST https://votre-app.vercel.app/api/push/send \
  -H "Content-Type: application/json" \
  -H "x-push-secret: VOTRE_PUSH_SECRET" \
  -d '{"title": "Annonce", "body": "Message important", "tag": "annonce-1"}'
```

---

## 9. Variables d'Environnement

### Requises sur Vercel

| Variable | Source | Role |
|----------|--------|------|
| `KV_REST_API_URL` | Upstash (auto via Vercel Storage) | URL Redis |
| `KV_REST_API_TOKEN` | Upstash (auto) | Token Redis |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Cle publique push |
| `VAPID_PRIVATE_KEY` | Idem | Cle privee push |
| `VAPID_CONTACT` | Votre email | Contact VAPID |
| `CRON_SECRET` | Choisir un secret | Proteger le cron |
| `PUSH_SECRET` | Choisir un secret | Proteger exclusivement l'API push |
| `ADMIN_SECRET` | Choisir un secret distinct | Proteger exclusivement la console admin |
| `ACCOUNT_SESSION_SECRET` | Choisir un secret distinct | Signer les sessions de compte et liens appareil |
| `PROF_SESSION_SECRET` | Ancien secret, migration seulement | Convertir temporairement les anciennes sessions professeur |
| `RESEND_API_KEY` | resend.com | Envoi d'emails |
| `RECIPIENT_EMAIL` | Votre email | Recevoir les inscriptions |

### Optionnelles

| Variable | Defaut | Role |
|----------|--------|------|
| `FROM_EMAIL` | `MathPlus <onboarding@resend.dev>` | Expediteur email |
| `APP_URL` | `https://{VERCEL_URL}` | URL de base pour fetch manifests |

---

## 10. Optimisation

### Performance du cron

- **Groupement par classe** : les abonnes sont groupes par `classId` pour ne fetcher chaque manifest qu'une seule fois
- **Cache en memoire** : `classManifestCache` evite les fetches doubles dans un meme run
- **Nettoyage auto** : les abonnements expires (410/404) sont supprimes a chaque execution

### Eviter la fatigue de notification

- **In-app** : max 5 notifications actives, 80 total, TTL 14 jours
- **Push calendaire** : un seul push par evenement (tag unique par chapitre+event)
- **Rappels motivationnels** : uniquement si aucune notif calendaire ET inactif > 2h
- **Ebbinghaus** : max 2 rappels par session
- **Dedup** : fingerprint + fenetre temporelle (4h par defaut)

### Bonnes pratiques pour les dates

```
FAIRE :
  "start_date": "2026-09-15"     <- ISO YYYY-MM-DD
  "end_date": "2026-09-30"

NE PAS FAIRE :
  "start_date": "15/09/2026"     <- Format FR
  "start_date": "09-15-2026"     <- Format US
  "start_date": "15 septembre"   <- Texte
```

### Optimiser les manifests pour les notifications

Pour chaque chapitre que vous voulez notifier, assurez-vous d'avoir :

```json
{
  "id": "identifiant-unique",
  "title": "Titre lisible (sans LaTeX)",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}
```

**Note** : le titre dans les notifications push est nettoye des commandes LaTeX (`$...$` supprime). Gardez les titres lisibles.

---

## 11. Depannage

### L'eleve ne recoit pas de push

1. **Verifier la permission** : `Notification.permission` doit etre `'granted'`
2. **Verifier l'abonnement** : `localStorage.getItem('mathplus:push-subscription')` doit exister
3. **Verifier Redis** : `SMEMBERS push:subscribers` doit contenir la cle
4. **Verifier le classId** : la donnee Redis doit avoir un `classId` non vide
5. **Verifier les dates** : le chapitre doit avoir un `start_date` et aujourd'hui doit correspondre a un declencheur (J-2, J-1, J, etc.)

### Erreur 500 sur /api/users/register

- **Cause probable** : `KV_REST_API_URL` ou `KV_REST_API_TOKEN` manquant dans Vercel
- **Verifier** : Vercel → Settings → Environment Variables
- **Apres ajout** : **Redeploy** obligatoire

### Le cron ne s'execute pas

- **Verifier** `vercel.json` contient bien le cron
- **Verifier** `CRON_SECRET` est defini dans les env vars
- **Tester manuellement** :
  ```bash
  curl -H "Authorization: Bearer VOTRE_CRON_SECRET" \
    https://votre-app.vercel.app/api/cron/reminders
  ```

### Email non recu

- **Verifier** `RESEND_API_KEY` est defini (Production)
- **Verifier** le domaine de `FROM_EMAIL` est autorise dans Resend
- **En dev** : utiliser `onboarding@resend.dev` (domaine de test Resend)

---

## 12. Exemples Concrets

### Scenario 1 : Ajouter les dates pour toute une classe

```json
// public/data/classes/2eme-bac-sc-ex.json
{
  "id": "2eme-bac-sc-ex",
  "chapters": [
    {
      "id": "suites",
      "title": "Suites numeriques",
      "start_date": "2026-09-15",
      "end_date": "2026-10-01",
      "manifestPath": "data/2eme-bac-sc-ex/suites/manifest.json",
      ...
    },
    {
      "id": "limites",
      "title": "Limites et continuite",
      "start_date": "2026-10-02",
      "end_date": "2026-10-20",
      ...
    }
  ]
}
```

Les notifications se chainent automatiquement :
- 29 sept : "Plus que 2 jours pour Suites"
- 1 oct : "Suites termine"
- 30 sept : "Nouveau chapitre Limites dans 2 jours"
- 2 oct : "Limites commence aujourd'hui !"

### Scenario 2 : Preparer un examen blanc

```json
{
  "id": "examen-blanc-sem1",
  "title": "Examen Blanc - Semestre 1",
  "start_date": "2026-12-15",
  "end_date": "2026-12-15",
  "revisions": [
    { "path": "data/2eme-bac-sc-ex/examens/prep_sem1.json" }
  ]
}
```

Notification unique le J-2 + J : "Examen Blanc dans 2 jours", "Examen Blanc aujourd'hui".

### Scenario 3 : Push manuel pour annonce urgente

```bash
curl -X POST https://mathplus-v1.vercel.app/api/push/send \
  -H "Content-Type: application/json" \
  -H "x-push-secret: votre_secret" \
  -d '{
    "title": "Report de la seance",
    "body": "La seance de mardi est reportee a jeudi 18h. Bon courage !",
    "tag": "annonce-report-mars",
    "url": "/"
  }'
```

### Scenario 4 : Consulter les inscrits d'une classe

```bash
curl "https://mathplus-v1.vercel.app/api/users?action=list&classId=1ere-bac-sc-math" \
  -H "x-admin-secret: votre_secret_admin"
```

Reponse :
```json
{
  "users": [
    { "name": "Ahmed", "phone": "+212612345678", "className": "1ere Bac Sc Math", "registeredAt": 1711324800000 },
    { "name": "Fatima", "phone": "+212698765432", "className": "1ere Bac Sc Math", "registeredAt": 1711238400000 }
  ],
  "count": 2
}
```

---

## Resume : Checklist pour une nouvelle classe

- [ ] Creer `public/data/classes/{classId}.json`
- [ ] Ajouter l'entree dans `public/data/manifest.json`
- [ ] Creer les dossiers de contenu (revisions, quiz, exercices)
- [ ] Ajouter `start_date` et `end_date` dans chaque chapitre
- [ ] Deployer sur Vercel
- [ ] Les notifications push s'activent automatiquement pour les eleves inscrits dans cette classe

**Aucune modification de code n'est necessaire.** Le systeme detecte automatiquement les nouvelles classes et chapitres via les manifests JSON.
