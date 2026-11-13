@echo off
rem Ashen Banners: starts the game server and opens the game in your browser.
rem Your campaign and your characters are saved in the "saves" folder next to this file,
rem so closing the browser or this window never loses progress.
cd /d "%~dp0"
if not exist node_modules call npm install
rem already running (another window)? then just open the game
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5190/api/save/ping; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:5190
  exit /b
)
title Ashen Banners (close this window to stop the game server)
npx vite --port 5190 --strictPort --open
