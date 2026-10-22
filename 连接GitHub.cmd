@echo off
setlocal
cd /d "%~dp0"
set "SISHI_REPOSITORY=https://github.com/yueyi8032-tech/sishi-gesture-interaction.git"
where git.exe >nul 2>nul
if errorlevel 1 (
  echo Git is required. Install Git for Windows first.
  pause
  exit /b 1
)
git remote get-url origin >nul 2>nul
if errorlevel 1 git remote add origin "%SISHI_REPOSITORY%"
for /f "delims=" %%r in ('git remote get-url origin') do set "SISHI_ORIGIN=%%r"
if not "%SISHI_ORIGIN%"=="%SISHI_REPOSITORY%" (
  echo A different origin is configured. No changes were made.
  pause
  exit /b 1
)
git fetch origin main
if errorlevel 1 goto failed
git rev-parse --verify HEAD >nul 2>nul
if errorlevel 1 (
  rem Initialize only the empty local branch. All working files are preserved.
  git reset --mixed origin/main
  if errorlevel 1 goto failed
)
git branch --set-upstream-to=origin/main main
if errorlevel 1 goto failed
git status --short --branch
echo GitHub is connected. Use Source Control in VS Code to commit and sync.
pause
exit /b 0
:failed
echo GitHub connection did not finish. Keep this window open to review the error.
pause
exit /b 1
