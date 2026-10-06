cd /d "%~dp0"
@echo off
setlocal

set "ZIP=project_upload.zip"

if exist "%ZIP%" del "%ZIP%"

powershell -NoProfile -Command ^
  "Compress-Archive -Path 'index.html','sw.js','TECH_DOCS.md','cypress.config.js','tests','content','css','src' -DestinationPath '%ZIP%' -Force"

echo.
echo Created: %ZIP%
pause