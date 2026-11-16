# Architecture de l’espace professeur

## Objectif

Le rôle `prof` donne accès aux outils de création sans exposer les fonctions
d’administration des utilisateurs. Le badge visible dans React est informatif :
toute écriture sensible est autorisée à nouveau côté serveur.

## Attribution et session

1. L’administrateur ouvre la liste des utilisateurs et clique sur `+ Prof`.
2. `/api/users?action=role-set` attribue le rôle et rend immédiatement un lien
   d’appareil à usage unique. Il ne génère aucun code professeur et n’expose jamais le secret
   d’administration.
3. Si l’appareil a déjà été autorisé par l’administrateur, l’application relit
   le rôle depuis `/api/users?action=me` et active automatiquement le mode
   professeur. Une recherche de compte par téléphone ne crée aucun cookie
   d’autorisation et ne peut jamais devenir un accès professeur.
4. Le premier appareil ouvre le lien rendu au clic sur `+ Prof`. Pour un autre
   PC ou une autre tablette, l’administrateur utilise ensuite
   l’action `Appareil`. `/api/users?action=device-link` renouvelle un lien
   personnel, temporaire et à usage unique. Son ouverture autorise l’appareil
   sans champ de code.
5. La session de compte est placée dans un cookie `HttpOnly`, `Secure` en
   production et `SameSite=Strict`. JavaScript ne voit jamais le jeton ; il ne
   conserve qu’un cache non sensible du nom et de la classe pour l’interface.
6. Chaque appel sensible relit le compte dans Redis et vérifie l’expiration, la
   version de session, la classe et le rôle courant.

Le retrait du rôle bloque donc immédiatement les nouvelles écritures, sans
déconnecter le compte de ses fonctions élève. Un lien appareil ne donne jamais
accès à l’administration et ne contient pas `ADMIN_SECRET`.

## Studio PC

Les boutons `Gestion de classe` et `Studio de contenus` ouvrent `/prof/`, une
entrée séparée de l’administration. Les vues élèves, progression, notifications,
calendrier et pilotage restent réservées à l’administrateur.

Le Studio publie des overrides JSON dans Redis via `/api/content` :

- fiches de révision ;
- quiz ;
- exercices ;
- médias associés.

Les contenus statiques restent la base de repli. Supprimer un override restaure
immédiatement la version livrée avec l’application.

## Canvas professeur

- Les zones manuscrites de révision ne sont montées que pour un professeur.
- Sur PC (`lg` et plus), chaque image rendue dans le flux normal propose une zone
  canvas sous l’image.
- Les traits restent en cache local pour une réponse immédiate.
- `/api/professor` synchronise les documents et les images importées dans Redis.
- La résolution des conflits est `last-write-wins` grâce à `updatedAt`.
- Les images trop volumineuses restent locales afin de respecter la limite
  Upstash ; le pipeline d’import les compresse normalement bien en dessous.

## Classe en direct et quiz animé

La vue PC `Gestion de classe` permet au professeur de :

- créer et renommer une liste d’élèves ;
- conserver une numérotation stable et visible ;
- déplacer chaque élève avec les boutons haut/bas ;
- supprimer un nom et réinitialiser une nouvelle partie ;
- suivre l’élève interrogé et les passages déjà traités.

La sauvegarde PC est différée d’environ 650 ms. Pendant un quiz sur tablette,
l’état live est relu toutes les 5 secondes et la liste complète toutes les
30 secondes, avec mise en pause lorsque l’application est masquée. La question
`n` est affectée à l’élève `n modulo nombre d’élèves`, ce
qui crée une rotation déterministe et recommence au début de la liste si le quiz
contient davantage de questions que d’élèves.

Les boutons précédent/suivant du bandeau professeur utilisent directement la
navigation du quiz. Après validation, le nom courant passe en vert et son état
est renvoyé à la régie PC. Le stockage distingue :

- `roster` : liste éditable, possédée par le PC ;
- `live` : index courant, question courante et identifiants déjà traités.

Cette séparation évite qu’une mise à jour rapide de la tablette écrase une
modification de noms effectuée simultanément sur le PC.

## Variables d’environnement

| Variable | Rôle |
|---|---|
| `ACCOUNT_SESSION_SECRET` | Secret HMAC obligatoire pour les sessions de compte et les liens appareil |
| `PROF_SESSION_SECRET` | Repli migratoire temporaire pour convertir les anciennes sessions professeur |
| `ADMIN_SECRET` | Secret distinct, réservé à la console d’administration |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Connexion Upstash Redis |

En production, `ACCOUNT_SESSION_SECRET` doit être un secret aléatoire distinct
du secret administrateur. Le repli sur `PROF_SESSION_SECRET` sert uniquement à
la migration et doit être retiré après conversion des anciennes sessions. Toute
rotation du secret de compte invalide les sessions et liens en cours.

## Limites assumées

- Les cookies ne sont pas copiés entre deux appareils. Un nouvel appareil doit
  donc ouvrir une fois le lien facultatif créé par l’administrateur ; les
  appareils déjà reconnus se mettent à jour automatiquement.
- Le lien d’appareil est un justificatif d’accès à usage unique : il doit être
  transmis directement au professeur et ne jamais être publié.
- La liste, la rotation et les réponses utilisent des écritures atomiques ; une
  coédition simultanée de la même liste est détectée et bloquée au lieu d’écraser
  silencieusement les modifications d’un autre PC.
