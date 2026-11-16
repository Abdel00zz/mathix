@echo off
setlocal
cd /d "%~dp0"
title MathPlus - Projection tablette (scrcpy)
echo ==================================================
echo   MathPlus - Projection tablette via scrcpy
echo ==================================================
echo.
echo  Le script scrcpy-projection.ps1 se trouve dans ce dossier.
echo.
if "%~1"=="" (
  echo  PowerShell ouvert : lancez par exemple
  echo    .\scrcpy-projection.ps1 -Mode Usb -Audio
  echo.
  echo  Ou en WiFi :
  echo    .\scrcpy-projection.ps1 -Mode Wifi -Device 192.168.1.20:5555 -Qualite Moyenne -Audio -Enregistrement "C:\captures\seance.mp4"
  echo.
  powershell -NoExit -ExecutionPolicy Bypass
) else (
  echo  Lancement direct avec les arguments fournis...
  powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0scrcpy-projection.ps1" %*
)
endlocal
