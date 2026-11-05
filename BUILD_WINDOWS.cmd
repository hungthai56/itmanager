@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js khong duoc tim thay. Cai Node.js LTS truoc. & pause & exit /b 1)
call npm install || (pause & exit /b 1)
call npm run dist:win || (pause & exit /b 1)
echo.
echo File cai dat nam trong thu muc release
pause