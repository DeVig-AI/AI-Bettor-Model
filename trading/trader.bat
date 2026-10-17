@echo off
REM Runs a trader command with this folder's Python. Example: trader.bat probe
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Run setup first: powershell -ExecutionPolicy Bypass -File setup.ps1
  exit /b 1
)
.venv\Scripts\python.exe scripts\cli.py %*
