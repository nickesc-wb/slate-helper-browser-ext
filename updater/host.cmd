@echo off
rem Chrome starts native messaging hosts as an .exe or a batch file, so this
rem runs host.ps1. Its stdin/stdout are the extension's message channel.
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0host.ps1"
