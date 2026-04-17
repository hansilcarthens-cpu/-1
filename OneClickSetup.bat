@echo off
echo ======================================================
echo   TikTok Pricing Tool - One-Click Installer
echo ======================================================
echo.
echo [1/3] Checking environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install it from https://nodejs.org/
    pause
    exit /b
)

echo [2/3] Installing dependencies (this may take a few minutes)...
call npm install

echo [3/3] Building the Desktop Application...
call npm run electron:build

echo.
echo ======================================================
echo   SUCCESS: Build complete!
echo   Check the "release" folder for your .exe file.
echo ======================================================
pause
