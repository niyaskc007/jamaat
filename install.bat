@echo off
REM Double-click this file in File Explorer to launch the Jamaat installer GUI.
REM
REM This wrapper just invokes install-gui.ps1 with -ExecutionPolicy Bypass so end users
REM don't have to fight Windows' default PowerShell script policy. The .bat itself does
REM no real work — all the logic lives in install-gui.ps1.

setlocal
cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 (
    echo PowerShell not found on PATH. Please install Windows PowerShell 5.1 or later.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-gui.ps1" %*
exit /b %errorlevel%
