@echo off
rem Double-click to install the Slate Helper updater (see install.ps1).
rem Pass -Uninstall to remove it.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
