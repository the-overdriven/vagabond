cd /d "%~dp0"
@echo off
setlocal

set "ZIP=project_upload.zip"

if exist "%ZIP%" del "%ZIP%"

powershell -NoProfile -Command ^
  "Compress-Archive -Path 'index.html','content','src' -DestinationPath '%ZIP%' -Force"

echo.
echo Created: %ZIP%
pause