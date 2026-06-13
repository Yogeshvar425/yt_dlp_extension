@echo off
setlocal enabledelayedexpansion

echo Checking for server running on port 8000...
set "ProcessId="

:: Find process ID listening on 127.0.0.1:8000
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr "127.0.0.1:8000"') do (
    set ProcessId=%%a
)

:: If not found, check 0.0.0.0:8000
if "!ProcessId!"=="" (
    for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr "0.0.0.0:8000"') do (
        set ProcessId=%%a
    )
)

if "!ProcessId!"=="" (
    echo Server does not appear to be running on port 8000.
) else (
    echo Found server process ID: !ProcessId!
    echo Stopping server...
    taskkill /F /PID !ProcessId!
    echo Server stopped successfully.
)

pause
