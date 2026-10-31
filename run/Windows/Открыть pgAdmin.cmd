@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."

where node >nul 2>nul
if errorlevel 1 goto missingNode

for /f "delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto invalidNode
if %NODE_MAJOR% LSS 24 goto oldNode

if not exist .env (
  echo Сначала запустите «Запустить CoachPRO.cmd», чтобы создать .env.
  goto failed
)

if not exist ".local\pgadmin-venv\Scripts\python.exe" (
  echo Сначала установите pgAdmin по инструкции в README.md.
  goto failed
)

echo pgAdmin: http://127.0.0.1:5050
echo Логин и пароль: PGADMIN_DEFAULT_EMAIL и PGADMIN_DEFAULT_PASSWORD в .env
node --env-file=.env scripts/pgadmin.js
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
