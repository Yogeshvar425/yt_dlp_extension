@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   YT-DLP Extension — Native Messaging Host Installer
echo ============================================================
echo.

:: Get the directory where this script lives
set "SCRIPT_DIR=%~dp0"

:: ── Step 1: Get the Extension ID ─────────────────────────────────
echo To complete setup, you need your Chrome extension ID.
echo.
echo How to find it:
echo   1. Open Chrome  →  chrome://extensions
echo   2. Enable "Developer mode" (top-right toggle)
echo   3. Find "YT-DLP Downloader" and copy the ID
echo      (looks like: abcdefghijklmnopqrstuvwxyz...)
echo.
set /p EXT_ID="Paste your Extension ID here: "

if "%EXT_ID%"=="" (
    echo ERROR: No Extension ID provided. Aborting.
    pause
    exit /b 1
)

:: ── Step 2: Create the native host manifest with real paths ──────
set "MANIFEST_FILE=%SCRIPT_DIR%com.ytdlp.server.json"
set "BAT_PATH=%SCRIPT_DIR%native_host.bat"
:: Escape backslashes for JSON
set "BAT_PATH_ESC=%BAT_PATH:\=\\%"

echo Creating native messaging host manifest...
(
echo {
echo   "name": "com.ytdlp.server",
echo   "description": "YT-DLP Server Launcher",
echo   "path": "%BAT_PATH_ESC%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%MANIFEST_FILE%"
echo   Written: %MANIFEST_FILE%

:: ── Step 3: Register in the Windows Registry ─────────────────────
:: Escape backslashes for registry
set "MANIFEST_REG=%MANIFEST_FILE:\=\\%"

set "REG_FILE=%temp%\register_native_host.reg"

echo Windows Registry Editor Version 5.00 > "%REG_FILE%"
echo. >> "%REG_FILE%"
echo [HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.ytdlp.server] >> "%REG_FILE%"
echo @="%MANIFEST_REG%" >> "%REG_FILE%"

regedit.exe /s "%REG_FILE%"
echo   Registered in: HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ytdlp.server

echo.
echo ============================================================
echo   Done! Restart Chrome for the changes to take effect.
echo   The extension will now silently start the server —
echo   NO MORE "Open Script Host?" popup!
echo   The server auto-shuts down after 10 min of inactivity.
echo ============================================================
echo.
pause
