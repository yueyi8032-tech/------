@echo off
setlocal
where node.exe >nul 2>nul
if not errorlevel 1 (
  node.exe %*
  exit /b
)
set "SISHI_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%SISHI_NODE%" (
  "%SISHI_NODE%" %*
  exit /b
)
echo Node.js 22 or newer is required. Download it from https://nodejs.org/
exit /b 1
