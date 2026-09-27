cd /d "%~dp0"
@echo off
setlocal

set "ZIP=project_upload.zip"

if exist "%ZIP%" del "%ZIP%"

powershell -NoProfile -Command ^
  "Compress-Archive -Path 'index.html','TECH_DOCS.md','content','css','src' -DestinationPath '%ZIP%' -Force"

echo.
echo Created: %ZIP%
pause