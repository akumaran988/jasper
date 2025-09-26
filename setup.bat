@echo off
REM Cross-platform setup script for Windows
echo [SETUP] Starting Jasper setup for Windows...
node setup.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Setup failed with error code %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)
echo [SETUP] Setup completed successfully!
pause