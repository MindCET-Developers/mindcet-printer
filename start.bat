@echo off
title AutoPrint Email Server Launcher
chcp 65001 > nul
cls

echo =======================================================================
echo          ___         _        ___        _         _    
echo         / _ \  __ _ ^| ^|_  ___ / _ \ _ _ ^(_)_ _  _^|_^|_  
echo        / _ _ \/ _` ^|^|  _\/ _ \  __/  _\/ ^| ^| ' \^(_^|  _\ 
echo       /_/   \_\__,_^| \__/\___/_/   /_/  \__^|_^|_^|_^|\__\___/
echo                                                            
echo        Automatic Email Printer - Local Automation Server
echo =======================================================================
echo.
echo [AutoPrint] Starting local background printing queue...
echo [AutoPrint] Running Express Server on: http://localhost:5001
echo [AutoPrint] Opening your default web browser to the dashboard...
echo.
echo =======================================================================
echo  אנא השאר חלון זה פתוח כל עוד אתה רוצה שההדפסה האוטומטית תפעל ברקע.
echo  ניתן למזער את החלון. לסגירה, פשוט סגור חלון זה.
echo =======================================================================
echo.

:: Wait 1.5 seconds and launch the default browser
timeout /t 2 /nobreak > nul
start http://localhost:5001

:: Run node server
node server.js

pause
