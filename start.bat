@echo off
title ClipLab Studio
cd /d "%~dp0"
set "PHP_BIN=php"
where php >nul 2>nul
if errorlevel 1 (
  if exist "C:\xampp\php\php.exe" (
    set "PHP_BIN=C:\xampp\php\php.exe"
  ) else (
    echo.
    echo  PHP was not found. Install PHP 8+ or XAMPP, then run this file again.
    echo  Download: https://windows.php.net/download  or  https://www.apachefriends.org
    echo.
    pause
    exit /b 1
  )
)
echo.
echo  ClipLab Studio is running at  http://localhost:8765
echo  Keep this window open while you edit. Close it to stop the server.
echo.
start "" "http://localhost:8765"
"%PHP_BIN%" -d upload_max_filesize=4G -d post_max_size=4G -d memory_limit=1024M -d max_execution_time=0 -d max_input_time=0 -S localhost:8765
pause
