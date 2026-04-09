@echo off
setlocal
title Rockett DnD Overlay - Stream Launcher

set "ROOT_DIR=%~dp0"
set "CHAT_BRIDGE_DIR=%ROOT_DIR%chat-bridge"
set "WEB_PORT=3000"
set "RELAY_PORT=8787"
set "GUILD_SITE_PORT=8788"
set "RELAY_URL=ws://127.0.0.1:%RELAY_PORT%"
set "OVERLAY_URL=http://localhost:%WEB_PORT%/index.html?transport=local&ws=%RELAY_URL%"
set "OVERLAY_URL_DISPLAY=http://localhost:%WEB_PORT%/index.html?transport=local^&ws=%RELAY_URL%"
set "GUILD_SITE_URL=http://127.0.0.1:%GUILD_SITE_PORT%/guild-shop/"

echo.
echo ==========================================
echo   Rockett DnD Overlay - Stream Launcher
echo ==========================================
echo.

:: ── Step 1: Verify fixed local ports are free ─────────────────────────────
echo [1/6] Checking local ports...
call :ensure_port_free %WEB_PORT% "web server"
if errorlevel 1 goto :startup_failed
call :ensure_port_free %RELAY_PORT% "relay"
if errorlevel 1 goto :startup_failed
call :ensure_port_free %GUILD_SITE_PORT% "guild site"
if errorlevel 1 goto :startup_failed

:: ── Step 2: Install dependencies if needed ──────────────────────────────
echo.
echo [2/6] Checking dependencies...
cd /d "%CHAT_BRIDGE_DIR%"
if errorlevel 1 (
  echo [ERROR] Could not open chat-bridge folder.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] node_modules not found — installing...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo [OK] Dependencies installed.
) else (
  echo [OK] Dependencies present.
)

if not exist "node_modules\.bin\http-server.cmd" (
  echo [INFO] Local web server dependency missing -- installing package updates...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed while adding local web server dependencies.
    pause
    exit /b 1
  )
  echo [OK] Local web server dependency installed.
)

:: ── Step 3: Validate project files ───────────────────────────────────────
echo.
echo [3/6] Running project checks...
call npm run check
if errorlevel 1 (
  echo [ERROR] Project checks failed.
  pause
  exit /b 1
)

:: ── Step 4: Start the relay in its own window ────────────────────────────
echo.
echo [4/6] Starting chat relay...
echo       (Twitch chat + Streamlabs scene detection + local guild site)
start "Rockett Chat Relay" /D "%CHAT_BRIDGE_DIR%" cmd /k npm start
call :wait_for_port %RELAY_PORT% "relay"
if errorlevel 1 goto :startup_failed
call :wait_for_port %GUILD_SITE_PORT% "guild site"
if errorlevel 1 goto :startup_failed

:: ── Step 5: Start the fixed local overlay server ──────────────────────────
echo.
echo [5/6] Starting local overlay web server...
echo       Serving project root on http://localhost:%WEB_PORT%/
start "Rockett Overlay Server" /D "%CHAT_BRIDGE_DIR%" cmd /k npm run serve-overlay
call :wait_for_port %WEB_PORT% "web server"
if errorlevel 1 goto :startup_failed

:: ── Step 6: Open the fixed local overlay URL ──────────────────────────────
echo.
echo [6/6] Opening local pages...
echo       Overlay: %OVERLAY_URL_DISPLAY%
echo       Guild Hall: %GUILD_SITE_URL%
powershell -NoProfile -Command "Start-Process '%OVERLAY_URL%'"
powershell -NoProfile -Command "Start-Process '%GUILD_SITE_URL%'"

echo.
echo [OK] Local launcher started.
echo      Relay window: Rockett Chat Relay
echo      Web server window: Rockett Overlay Server
echo      Overlay URL: %OVERLAY_URL_DISPLAY%
echo      Guild Hall URL: %GUILD_SITE_URL%
echo      Close both windows to stop local testing.
pause
exit /b 0

:ensure_port_free
set "CHECK_PORT=%~1"
set "CHECK_NAME=%~2"
netstat -ano | findstr /R /C:":%CHECK_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [ERROR] Port %CHECK_PORT% is already in use for %CHECK_NAME%.
  echo         Stop the existing process and run this launcher again.
  exit /b 1
)

echo [OK] Port %CHECK_PORT% is free for %CHECK_NAME%.
exit /b 0

:wait_for_port
set "WAIT_PORT=%~1"
set "WAIT_NAME=%~2"
set /a WAIT_RETRIES=0

:wait_for_port_loop
netstat -ano | findstr /R /C:":%WAIT_PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [OK] Port %WAIT_PORT% is live for %WAIT_NAME%.
  exit /b 0
)

set /a WAIT_RETRIES+=1
if %WAIT_RETRIES% GEQ 15 (
  echo [ERROR] %WAIT_NAME% did not start on port %WAIT_PORT%.
  echo         Check the "%WAIT_NAME%" window for startup errors.
  exit /b 1
)

timeout /t 1 /nobreak >nul
goto :wait_for_port_loop

:startup_failed
echo.
echo [ERROR] Local startup aborted.
pause
exit /b 1
