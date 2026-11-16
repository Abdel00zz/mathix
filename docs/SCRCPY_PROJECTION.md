# Projection de la tablette élève sur le PC professeur (scrcpy)

> Objectif : afficher (et éventuellement enregistrer) l'écran de la **tablette**
> sur le **PC du professeur** pendant une séance, via [scrcpy](https://github.com/genymobile/scrcpy),
> un outil libre de duplication d'écran Android (miroir + contrôle) **sans rien
> installer sur la tablette**.

Le navigateur (PWA) ne peut pas piloter un outil de bureau : la projection passe
par un **script PowerShell** lancé sur le PC du professeur, à côté de l'app.
Le script est fourni : [`scrcpy-projection.ps1`](../../scrcpy-projection.ps1).

---

## 1. Téléchargement et installation (Windows)

> **Lien direct** : <https://github.com/Genymobile/scrcpy/releases>
> (télécharger `scrcpy-win64-vX.X.zip` — l'archive contient déjà `adb.exe`).

Trois méthodes au choix.

### Méthode A — Installation automatique (recommandée, via le script)

Le script télécharge et extrait scrcpy vers **`C:\outils\scrcpy`** puis l'ajoute
au `PATH` utilisateur :

```powershell
.\scrcpy-projection.ps1 -Install
```

Aucune dépendance préalable : il interroge l'API GitHub, récupère la dernière
release `scrcpy-win64-vX.X.zip`, l'extrait et l'installe.

### Méthode B — Scoop (une ligne)

```powershell
# Installer Scoop si absent (une ligne)
irm get.scoop.sh | iex

# Installer scrcpy (+ adb en dépendance)
scoop install scrcpy
```

### Méthode C — Archive officielle (portable)

1. Ouvrir <https://github.com/Genymobile/scrcpy/releases>.
2. Télécharger `scrcpy-win64-vX.X.zip` (dernière version).
3. Extraire dans `C:\outils\scrcpy` (l'archive contient **déjà** `adb.exe`).
4. Ajouter `C:\outils\scrcpy` au `PATH` (ou lancer le script depuis ce dossier).

> Vérifier : `scrcpy --version` et `adb version` doivent répondre.

---

## 2. Activer le débogage USB sur la tablette

1. Réglages → **À propos de la tablette** → taper 7 fois sur **Numéro de build**.
2. Réglages → **Options pour les développeurs** → activer **Débogage USB**.
3. Brancher la tablette au PC par câble USB et **accepter** l'invite
   « Autoriser le débogage USB ? » sur la tablette (cocher « Toujours »).
4. Vérifier : `adb devices` doit afficher la tablette en `device` (pas `unauthorized`).

---

## 3. Utilisation du script

### Lanceur rapide (`.bat`)

Double-cliquez sur **`scrcpy-projection.bat`** (à la racine du projet) : il ouvre
PowerShell dans le bon dossier, avec les commandes prêtes à copier. Vous pouvez
aussi lui passer des arguments pour lancer directement :

```bat
scrcpy-projection.bat -Mode Usb -Audio
scrcpy-projection.bat -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\captures\seance.mp4"
```

### Paramètres du script

Le script `scrcpy-projection.ps1` accepte des paramètres :

| Paramètre | Valeurs | Rôle |
|-----------|---------|------|
| `-Mode` | `Usb` (défaut) / `Wifi` | Mode de connexion |
| `-Device` | `192.168.1.20:5555` | IP:port en mode Wifi |
| `-Qualite` | `Haute` (défaut) / `Moyenne` / `Basse` | Débit vidéo (8/4/2 Mbit/s) |
| `-Audio` | commutateur | Active l'audio de la tablette (scrcpy 2.0+) |
| `-Enregistrement` | `C:\captures\seance.mp4` | Chemin du fichier d'enregistrement (vide = pas d'enregistrement) |
| `-MaxSize` | `1920` (défaut) | Résolution maximale de l'écran miroir |
| `-Titre` | `Tablette élève — MathPlus` | Titre de la fenêtre |
| `-Install` | commutateur | Télécharge + extrait scrcpy vers `C:\outils\scrcpy` et l'ajoute au PATH |

### Exemples

```powershell
# USB, qualité haute, audio, sans enregistrement
.\scrcpy-projection.ps1 -Mode Usb -Qualite Haute -Audio

# Wifi, qualité moyenne, avec enregistrement
.\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\captures\seance-2026-08-17.mp4"

# Diffusion seule, qualité basse (réseau faible)
.\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Basse
```

---

## 4. Mode WiFi (sans câble)

1. Connecter une fois la tablette en **USB** et vérifier `adb devices`.
2. Basculer adb en mode TCP/IP :
   ```powershell
   adb tcpip 5555
   ```
3. Débrancher le câble, noter l'**IP de la tablette** (Réglages → Wi-Fi → réseau actif).
4. Lancer la projection en WiFi :
   ```powershell
   .\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555
   ```
5. Pour revenir en USB : `adb usb`.

> Le PC et la tablette doivent être sur le **même réseau**. Le port `5555`
> reste ouvert jusqu'au redémarrage d'adb ; le refermer : `adb disconnect`.

---

## 5. Emplacement d'enregistrement, qualité et audio

- **Enregistrement** : `-Enregistrement "C:\captures\seance-<date>.mp4"`. Le fichier
  est écrit **sur le PC** (format MP4, vidéo H.264/AV1 + audio si `-Audio`).
  Sans `-Enregistrement`, seule la diffusion est affichée.
- **Qualité** : `Haute` = 8 Mbit/s (vidéo nette, câble), `Moyenne` = 4 Mbit/s,
  `Basse` = 2 Mbit/s (WiFi contraint). Le débit est le principal levier de
  fluidité/qualité.
- **Audio** : nécessite scrcpy **2.0+**. `-Audio` relaie le son de la tablette
  (`--audio-source=output`) et l'incorpore à l'enregistrement.
- **Résolution** : `-MaxSize` limite la dimension maximale (ex. `1280` pour un
  PC peu puissant).

---

## 6. Dépannage

| Symptôme | Cause / solution |
|----------|------------------|
| `adb devices` = `unauthorized` | Accepter l'invite sur la tablette, rebrancher |
| `adb devices` = vide | Pilotes USB / câble data (pas « charge seule ») |
| `scrcpy introuvable` | scrcpy absent du `PATH` (cf. §1) |
| WiFi ne se connecte pas | IP incorrecte / pas le même réseau / `adb tcpip 5555` non fait |
| Fenêtre noire / lag | Baisser `-Qualite` ou `-MaxSize` |
| Pas d'audio | scrcpy < 2.0 : mettre à jour |

---

## 7. Intégration au projet

### Dans l'application (console professeur, vue « Projection »)

Une carte **« Projection tablette (scrcpy) »** est intégrée à la console
professeur (rail latéral → vue **Projection**) :
- la commande prête à l'emploi (affichée + **Copier (USB)** / **Copier (WiFi)**) ;
- les liens **Télécharger scrcpy** et **Documentation** (ouvrent GitHub) ;
- le rappel d'installation (`scoop install scrcpy` ou l'archive) et le lien vers
  ce guide.

Le navigateur ne pouvant pas lancer un binaire local, l'intégration reste « copie
de commande » : on clique, on colle dans PowerShell, et la projection démarre.

### Notes

- Le script est **indépendant** de l'application (il ne modifie ni le code ni le
  build). Il se lance dans PowerShell, en parallèle de l'onglet **Séance**.
- Pour une séance enregistrée, associer le `.mp4` produit au chapitre en cours
  (l'archive PDF de la séance reste l'onglet « Imprimer la séance »).
- `scrcpy` permet aussi le **contrôle** depuis le PC (souris/clavier) : utile
  pour guider un élève, mais désactivé par défaut ici pour laisser la main à
  l'élève sur sa tablette.
