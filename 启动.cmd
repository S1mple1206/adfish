@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Please run npm install first. Node.js 22.12 or newer is required.
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "" "node_modules\electron\dist\electron.exe" .
