@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

where node >nul 2>nul
if errorlevel 1 goto missingNode

for /f "delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto invalidNode
if %NODE_MAJOR% LSS 24 goto oldNode

node scripts/setup-env.js
if errorlevel 1 goto failed

if not exist node_modules (
  echo Сначала установите зависимости: pnpm install
  goto failed
)

echo CoachPRO: http://localhost:3000
echo Остановка: Ctrl+C. Данные PostgreSQL сохраняются.
node --env-file=.env scripts/dev.js
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%

:missingNode
echo Нужен Node.js 24 или новее, добавленный в PATH.
goto failed

:oldNode
echo Нужен Node.js 24 или новее.
goto failed

:invalidNode
echo Не удалось определить версию Node.js.
goto failed

:failed
pause
exit /b 1
