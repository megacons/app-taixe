@echo off
echo Usage: restore-db.bat [backup_folder_name]
echo Example: restore-db.bat backup_20240801_1430

SET BACKUP_NAME=%1
SET BACKUP_DIR=p:\app_taixe\backups\%BACKUP_NAME%

IF "%BACKUP_NAME%"=="" (
  echo ❌ Please provide backup folder name
  pause
  exit /b 1
)

IF NOT EXIST "%BACKUP_DIR%" (
  echo ❌ Backup not found: %BACKUP_DIR%
  pause
  exit /b 1
)

echo Restoring from %BACKUP_DIR%...
docker cp "%BACKUP_DIR%" namthanh_mongodb:/tmp/restore_%BACKUP_NAME%

docker exec namthanh_mongodb mongorestore ^
  --username admin ^
  --password namthanh2024 ^
  --authenticationDatabase admin ^
  --db namthanh_db ^
  --drop ^
  /tmp/restore_%BACKUP_NAME%/namthanh_db

echo ✅ Restore completed!
pause
