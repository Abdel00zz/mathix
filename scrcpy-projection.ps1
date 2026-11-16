<#
  MathPlus — Projection de la tablette élève sur le PC professeur (scrcpy)

  Installation rapide (télécharge + extrait scrcpy vers C:\outils\scrcpy) :
    .\scrcpy-projection.ps1 -Install

  Utilisation :
    .\scrcpy-projection.ps1 -Mode Usb -Qualite Haute -Audio
    .\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\captures\seance.mp4"

  Alternative d'installation via Scoop :
    irm get.scoop.sh | iex    puis    scoop install scrcpy

  Prérequis : débogage USB activé sur la tablette (docs/SCRCPY_PROJECTION.md).
#>

param(
  [ValidateSet('Usb', 'Wifi')]
  [string]$Mode = 'Usb',

  # IP:port de la tablette en mode Wifi (ex. 192.168.1.20:5555)
  [string]$Device = '',

  [ValidateSet('Haute', 'Moyenne', 'Basse')]
  [string]$Qualite = 'Haute',

  # Active l'audio de la tablette (scrcpy 2.0+)
  [switch]$Audio,

  # Chemin du fichier .mp4 (vide = diffusion seule, sans enregistrement)
  [string]$Enregistrement = '',

  # Résolution maximale de l'écran miroir
  [int]$MaxSize = 1920,

  # Titre de la fenêtre
  [string]$Titre = 'Tablette élève — MathPlus',

  # Télécharge et extrait scrcpy (avec adb) vers C:\outils\scrcpy puis l'ajoute au PATH
  [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Installation automatique ─────────────────────────────────────────────────
function Install-Scrcpy {
  $InstallDir = 'C:\outils\scrcpy'

  if ((Test-Command 'scrcpy') -and (Test-Command 'adb')) {
    Write-Host 'scrcpy et adb sont déjà disponibles dans le PATH.' -ForegroundColor Green
    Write-Host "scrcpy : $((Get-Command scrcpy).Source)" -ForegroundColor DarkGray
    return
  }

  Write-Host 'Installation de scrcpy (téléchargement + extraction)…' -ForegroundColor Cyan

  # Résolution de la dernière release via l'API GitHub.
  try {
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest' -Headers @{ 'User-Agent' = 'mathplus-scrcpy' }
    $asset = $release.assets | Where-Object { $_.name -match '^scrcpy-win64-v.*\.zip$' } | Select-Object -First 1
    if (-not $asset) { throw 'Archive scrcpy-win64 introuvable dans la dernière release.' }
    $url = $asset.browser_download_url
    $version = $release.tag_name
  } catch {
    Write-Host "Impossible de joindre l'API GitHub ($($_.Exception.Message))." -ForegroundColor Red
    Write-Host 'Alternative rapide via Scoop :' -ForegroundColor Yellow
    Write-Host '  irm get.scoop.sh | iex' -ForegroundColor White
    Write-Host '  scoop install scrcpy' -ForegroundColor White
    exit 1
  }

  Write-Host "Dernière version : $version — $url" -ForegroundColor DarkGray

  $zip = Join-Path $env:TEMP 'scrcpy-win64.zip'
  $extract = Join-Path $env:TEMP 'scrcpy-extract'

  Invoke-WebRequest -Uri $url -OutFile $zip

  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  New-Item -ItemType Directory -Path $extract -Force | Out-Null
  Expand-Archive -Path $zip -DestinationPath $extract -Force

  # L'archive contient un unique dossier scrcpy-win64-vX.X/.
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  if (-not $inner) { throw "Contenu inattendu dans l'archive (aucun dossier)." }

  if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Copy-Item (Join-Path $inner.FullName '*') -Destination $InstallDir -Recurse -Force

  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue

  # Ajout au PATH utilisateur (pour que scrcpy + adb soient accessibles).
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($current -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable('Path', "$current;$InstallDir", 'User')
    $env:Path += ";$InstallDir"
  }

  Write-Host "scrcpy installé dans $InstallDir et ajouté au PATH utilisateur." -ForegroundColor Green
  Write-Host 'Rouvrez ce PowerShell (ou redémarrez) pour que le PATH soit pris en compte.' -ForegroundColor Yellow
}

if ($Install) {
  Install-Scrcpy
  exit 0
}

# ── 1. Vérifications ────────────────────────────────────────────────────────
if (-not (Test-Command 'scrcpy')) {
  Write-Host 'scrcpy est introuvable dans le PATH.' -ForegroundColor Red
  Write-Host 'Installez-le automatiquement :  .\scrcpy-projection.ps1 -Install' -ForegroundColor Yellow
  Write-Host 'Ou via Scoop :  irm get.scoop.sh | iex   puis   scoop install scrcpy' -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Command 'adb')) {
  Write-Host 'adb est introuvable dans le PATH (requis pour scrcpy).' -ForegroundColor Red
  Write-Host 'Installez scrcpy (il inclut adb) :  .\scrcpy-projection.ps1 -Install' -ForegroundColor Yellow
  exit 1
}

# ── 2. Connexion ────────────────────────────────────────────────────────────
if ($Mode -eq 'Wifi') {
  if (-not $Device) {
    Write-Host "En mode Wifi, fournissez -Device 'IP:5555'." -ForegroundColor Red
    exit 1
  }
  Write-Host "Connexion Wi-Fi à $Device ..." -ForegroundColor Cyan
  adb connect $Device
  Start-Sleep -Seconds 1
}

$devices = adb devices | Select-String -Pattern '\tdevice$'
if (-not $devices) {
  Write-Host "Aucune tablette détectée. Vérifiez le câble / le débogage USB / l'IP (adb devices)." -ForegroundColor Red
  exit 1
}
Write-Host 'Tablette détectée :' -ForegroundColor Green
$devices | ForEach-Object { Write-Host ("  " + $_.Line.Trim()) -ForegroundColor Green }

# ── 3. Arguments scrcpy ─────────────────────────────────────────────────────
$Args = @()
$Args += "--window-title=$Titre"
$Args += "--max-size=$MaxSize"
$Args += '--stay-awake'

switch ($Qualite) {
  'Haute'   { $Args += '--video-bit-rate=8M' }
  'Moyenne' { $Args += '--video-bit-rate=4M' }
  'Basse'   { $Args += '--video-bit-rate=2M' }
}

if ($Audio) {
  # Relaie le son de la tablette (et l'incorpore à l'enregistrement).
  $Args += '--audio-source=output'
} else {
  $Args += '--no-audio'
}

if ($Enregistrement) {
  $Args += "--record=$Enregistrement"
  Write-Host "Enregistrement : $Enregistrement" -ForegroundColor Cyan
}

Write-Host "Lancement de scrcpy (mode $Mode, qualité $Qualite)…" -ForegroundColor Cyan
Write-Host 'Quitter : fermer la fenêtre ou Ctrl+C.' -ForegroundColor DarkGray

# ── 4. Lancement ────────────────────────────────────────────────────────────
& scrcpy @Args

# Nettoyage Wifi à la sortie
if ($Mode -eq 'Wifi' -and $Device) {
  adb disconnect $Device | Out-Null
}
