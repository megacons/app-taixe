@echo off
echo === NAM THANH TRANSPORT - START ===
echo.

echo [1/2] Starting MongoDB...
docker compose up -d
if errorlevel 1 (
  echo ERROR: Docker failed. Make sure Docker Desktop is running!
  pause
  exit /b 1
)

echo Waiting for MongoDB to be ready...
timeout /t 8 /nobreak >nul

echo [2/2] Starting API server...
echo Run in a NEW terminal: cd apps\api ^&^& npm run dev
echo Run in a NEW terminal: cd apps\web ^&^& npm run dev

echo.
echo === READY ===
echo API:   http://localhost:5000/health
echo Web:   http://localhost:3000
echo MongoDB: localhost:27017
echo.
pause
