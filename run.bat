@echo off
echo === STARTING NAM THANH TRANSPORT ===

echo [1/3] Starting Docker MongoDB...
docker compose up -d
timeout /t 5 /nobreak

echo [2/3] Installing API dependencies...
cd /d p:\app_taixe\apps\api
call npm install
if errorlevel 1 (echo npm install failed && pause && exit /b 1)

echo [3/3] Seeding database...
call npm run seed

echo === DONE! Run 'npm run dev' in apps/api and apps/web ===
pause
