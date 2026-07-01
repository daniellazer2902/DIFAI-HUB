@echo off
setlocal
cd /d "%~dp0"

rem ============================================================
rem  DIFAI-IDE - lanceur Windows
rem  Build l'application puis la lance (electron-vite preview).
rem  Premiere execution : installe les dependances + rebuild node-pty.
rem ============================================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [DIFAI-IDE] npm introuvable. Installez Node.js 18+ ^(https://nodejs.org^) puis relancez.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [DIFAI-IDE] Installation des dependances ^(premiere fois, peut prendre une minute^)...
  call npm install
  if errorlevel 1 ( echo [DIFAI-IDE] Echec de npm install. & pause & exit /b 1 )
  echo [DIFAI-IDE] Reconstruction de node-pty pour Electron...
  call npm run rebuild
  if errorlevel 1 ( echo [DIFAI-IDE] Echec du rebuild de node-pty. & pause & exit /b 1 )
)

echo [DIFAI-IDE] Build...
call npm run build
if errorlevel 1 ( echo [DIFAI-IDE] Echec du build. & pause & exit /b 1 )

echo [DIFAI-IDE] Lancement...
call npm start

endlocal
