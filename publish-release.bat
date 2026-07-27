@echo off
setlocal
cd /d "%~dp0"

rem ----------------------------------------------------------------
rem Publishes an already-built installer (from release\, produced by
rem build-installer.bat / npm run electron:build) to a GitHub Release,
rem so the README's download link always resolves to the newest build.
rem
rem Can be run standalone (e.g. to republish without rebuilding), or
rem called from build-installer.bat right after a successful build -
rem pass --called-from-build to suppress the pause-at-end in that case.
rem
rem This is entirely best-effort: if the GitHub CLI isn't installed or
rem isn't signed in, it explains how to fix that and exits quietly
rem rather than erroring.
rem
rem The installer itself is NOT committed to git: at 100MB+ it would
rem sit right at (or over) GitHub's 100MB per-file push limit, and
rem would permanently bloat the repo by a full copy on every rebuild.
rem Release assets live outside the git history and have no such limit.
rem ----------------------------------------------------------------

echo ============================================
echo  Process Manager - Publish to GitHub Releases
echo ============================================
echo.

where gh >nul 2>&1
if errorlevel 1 (
    echo GitHub CLI ^(gh^) not found - skipping publish.
    echo Install it from https://cli.github.com/, run "gh auth login" once,
    echo then run this script again to publish.
    goto :done
)

gh auth status >nul 2>&1
if errorlevel 1 (
    echo GitHub CLI is installed but not signed in - skipping publish.
    echo Run "gh auth login" once, then run this script again.
    goto :done
)

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
set "TAG=v%APP_VERSION%"
set "INSTALLER_EXE=release\Process Manager Setup %APP_VERSION%.exe"

if not exist "%INSTALLER_EXE%" (
    echo Could not find "%INSTALLER_EXE%".
    echo Run build-installer.bat ^(or npm run electron:build^) first.
    goto :done
)

rem Uploaded under a fixed, version-less filename so the README's
rem .../releases/latest/download/... link never has to change between
rem versions - only the release tag (%TAG%) varies.
set "STABLE_ASSET=release\ProcessManagerSetup.exe"
copy /Y "%INSTALLER_EXE%" "%STABLE_ASSET%" >nul

echo Publishing "%INSTALLER_EXE%" as release %TAG%...
gh release view "%TAG%" >nul 2>&1
if errorlevel 1 (
    gh release create "%TAG%" "%STABLE_ASSET%" --title "%TAG%" --generate-notes
) else (
    gh release upload "%TAG%" "%STABLE_ASSET%" --clobber
)

if errorlevel 1 (
    echo.
    echo Publish step failed. You can retry it, or publish manually with:
    echo   gh release upload %TAG% "%STABLE_ASSET%" --clobber
    goto :done
)

echo.
echo Published. Download link:
echo   https://github.com/ChrisEarlAmar/Batch-Manager-V2/releases/latest/download/ProcessManagerSetup.exe

:done
if /i not "%~1"=="--called-from-build" pause
exit /b 0
