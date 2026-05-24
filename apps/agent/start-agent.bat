@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Copy .env.example to .env and fill Supabase + printer settings.
  exit /b 1
)

echo Starting PrintDesk agent...
npm run dev
