@echo off
echo === STOPPING (data preserved) ===
docker compose stop
echo MongoDB stopped. Data is SAFE in .\data\mongodb\
pause
