@echo off
title TikTok Pricing Tool - Local Server
echo ======================================================
echo   TikTok Pricing Tool - Local Deployment (Scheme A)
echo ======================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed!
    echo Please install it from https://nodejs.org/
    pause
    exit /b
)

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
)

echo [2/3] Building production version (Obfuscating source)...
call npm run build

echo [3/3] Starting local server at http://localhost:3000
echo.
echo Press Ctrl+C to stop the server.
echo.
npx serve -s dist -l 3000
pause
