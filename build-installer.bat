@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Process Manager - Build Windows Installer
echo ============================================
echo.

if not exist "node_modules" (
    echo Installing dependencies first...
    call npm install
    if errorlevel 1 goto :fail
    echo.
)

echo Building renderer and packaging the installer...
call npm run electron:build
if errorlevel 1 goto :fail

echo.
echo ============================================
echo  Build succeeded.
echo  Installer output: release\
echo ============================================
pause
exit /b 0

:fail
echo.
echo ============================================
echo  Build FAILED. See the output above for details.
echo ============================================
pause
exit /b 1
