@echo off
REM Shortcut para ejecutar dev.ps1 directamente como "dev" o "dev.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" %*
