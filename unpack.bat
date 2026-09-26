
@echo off
cd /d "%~dp0"
setlocal
set "VAGABOND_DOWNLOADS=%USERPROFILE%\Downloads"
set "VAGABOND_DEST=D:\Dropbox\PROJECTS\VAGABOND\vagabond"

powershell.exe -NoProfile -Command "$ErrorActionPreference = 'Stop'; $zip = Get-ChildItem -LiteralPath $env:VAGABOND_DOWNLOADS -Filter '*.zip' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not $zip) { Write-Host 'No ZIP files found in Downloads.' -ForegroundColor Red; exit 1 }; Write-Host ('Newest ZIP: ' + $zip.FullName); Write-Host ('Destination: ' + $env:VAGABOND_DEST); $answer = Read-Host 'Extract and overwrite existing files? (Y/N)'; if ($answer -notmatch '^(?i:y|yes)$') { Write-Host 'Cancelled.'; exit 2 }; Expand-Archive -LiteralPath $zip.FullName -DestinationPath $env:VAGABOND_DEST -Force; Write-Host 'Extraction complete. Matching files were overwritten.' -ForegroundColor Green"

if errorlevel 1 (
  echo Extraction was cancelled or failed.
) else (
  echo Done.
)
pause
