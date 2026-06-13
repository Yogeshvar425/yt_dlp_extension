@echo off
:: Ignore any arguments passed by the custom protocol handler (e.g., yt-dlp-server://start)
cd /d "%~dp0"

:: Check if the server is already running on port 8000
netstat -ano | findstr "127.0.0.1:8000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    :: Server is already running, exit silently
    exit /b 0
)

:: Server is NOT running, start it via VBS (hidden window)
wscript //nologo "%~dp0start_server.vbs"

:: Give the server a moment to boot
timeout /t 3 /noq >nul
