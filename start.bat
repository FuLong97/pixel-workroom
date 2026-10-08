@echo off
setlocal
cd /d "%~dp0"
title Pixel Workroom
if "%PORT%"=="" set PORT=3333

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte installieren: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Abhaengigkeiten...
  call npm install
  if errorlevel 1 ( echo npm install fehlgeschlagen. & pause & exit /b 1 )
)

where claude >nul 2>nul
if errorlevel 1 echo Hinweis: "claude" CLI nicht gefunden. Der Build-Knopf braucht Claude Code ^(npm i -g @anthropic-ai/claude-code^).

rem Einen aelteren Workroom auf diesem Port beenden, damit wirklich der NEUE Code laeuft.
rem PowerShell statt netstat: netstat schreibt auf englischem Windows "LISTENING" und auf deutschem
rem "ABHOEREN" - mit einer Textsuche wurde der alte Server auf deutschem Windows nie gefunden.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>nul
timeout /t 1 /nobreak >nul

rem Browser oeffnen, sobald der Server oben ist
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"

echo.
echo Pixel Workroom laeuft auf http://localhost:%PORT%  (Fenster schliessen = beenden)
echo.
node src\server.mjs
echo.
echo Der Server wurde beendet. Scrolle nach oben, falls dort eine Fehlermeldung steht.
pause
