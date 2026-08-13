@echo off
setlocal
if not exist "node_modules" (
    echo "No required modules found, starting module installation process..."
    npm install
)

:loop
echo Starting Bot Zalo D Q T - V1.5.5 Developed by N D Q x L Q T
start "Node - Bot Zalo DQT" /wait node bot.js
echo.
echo Bot da dung, dang khoi dong lai sau 3 giay...
timeout /t 3 /nobreak >nul
goto loop
