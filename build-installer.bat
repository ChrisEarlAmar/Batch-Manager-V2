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
echo.
echo  If the error mentions "EPERM" / "Access is denied" while
echo  renaming a "win-unpacked.tmp" folder, that is Windows
echo  Defender (or another antivirus/EDR) locking the freshly
echo  extracted Electron files, not a problem with this project.
echo  Try running this script again, or ask your IT admin to
echo  exclude this project folder from real-time scanning.
echo ============================================
pause
exit /b 1
