@echo off
setlocal
cd /d "%~dp0"
title Pixel Workroom

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

rem Alten Server auf Port 3333 beenden
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3333 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul

rem Browser oeffnen, sobald der Server oben ist
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3333"

echo.
echo Pixel Workroom laeuft auf http://localhost:3333  (Fenster schliessen = beenden)
echo.
node src\server.mjs
pause
