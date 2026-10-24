@echo off
rem Double-click to play locally: starts the dev server (if it isn't already running) and opens the game.
cd /d "%~dp0"
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:8080
  exit /b
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"
echo Elemental Commit is running at http://localhost:8080
echo Close this window to stop the server.
npx --yes http-server -p 8080 -c-1 .
