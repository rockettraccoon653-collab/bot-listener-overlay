@echo off
setlocal
title Rockett DnD Overlay - Stream Launcher

echo.
echo ==========================================
echo   Rockett DnD Overlay - Stream Launcher
echo ==========================================
echo.

:: ── Step 1: Free port 8787 if something is already using it ──────────────
echo [1/3] Checking port 8787...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R "\<8787\>"') do (
  set PID=%%a
)
if defined PID (
  echo [INFO] Port 8787 in use by PID %PID% — stopping it...
  taskkill /PID %PID% /F >nul 2>&1
  timeout /t 1 /nobreak >nul
  echo [OK] Port freed.
) else (
  echo [OK] Port 8787 is free.
)

:: ── Step 2: Install dependencies if needed ──────────────────────────────
echo.
echo [2/3] Checking dependencies...
cd /d "%~dp0chat-bridge"
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

:: ── Step 3: Start the relay ──────────────────────────────────────────────
echo.
echo [3/3] Starting chat relay...
echo       (Twitch chat + Streamlabs scene detection)
echo.
echo ── Relay running ── Press Ctrl+C to stop ───────────────────────────────
echo.
call npm start

echo.
echo [INFO] Relay stopped.
pause
