@echo off
SET BACKUP_DIR=p:\app_taixe\backups
SET DATE_STR=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%
SET DATE_STR=%DATE_STR: =0%

IF NOT EXIST "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo Backing up MongoDB...
docker exec namthanh_mongodb mongodump ^
  --username admin ^
  --password namthanh2024 ^
  --authenticationDatabase admin ^
  --db namthanh_db ^
  --out /tmp/backup_%DATE_STR%

docker cp namthanh_mongodb:/tmp/backup_%DATE_STR% "%BACKUP_DIR%\backup_%DATE_STR%"

echo ✅ Backup saved to: %BACKUP_DIR%\backup_%DATE_STR%
pause
