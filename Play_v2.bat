@echo off
rem Double-click to play the v2 "Slasher" branch locally on port 8092 (the old game's Play.bat uses 8080, so both can run together).
cd /d "%~dp0"
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8092 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:8092
  exit /b
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8092"
echo Elemental Commit v2 is running at http://localhost:8092
echo Close this window to stop the server.
npx --yes http-server -p 8092 -c-1 .
