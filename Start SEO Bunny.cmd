@echo off
cd /d "%~dp0"
if not exist ".next\BUILD_ID" (
  call npm run build
  if errorlevel 1 exit /b 1
)
call npm run start -- --hostname 127.0.0.1 --port 3210
pause
