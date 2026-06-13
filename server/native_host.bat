@echo off
:: Native Messaging Host — launched by Chrome.
:: Delegates to native_host.py which handles the actual messaging protocol.
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" "%~dp0native_host.py"
