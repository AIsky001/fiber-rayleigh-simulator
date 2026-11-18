@echo off
setlocal
rem UTF-8 source / CSV and COMSOL batch handling are implemented in PowerShell.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-comsol.ps1"
if errorlevel 1 (
  echo COMSOL run failed. See the log files in this folder.
  pause
  exit /b 1
)
echo COMSOL run complete.
pause
