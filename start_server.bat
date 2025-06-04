@echo off
echo 正在啟動 GPU 資料庫網站...
echo.
echo 使用端口: 10001
echo 可訪問網址:
echo   本機: http://localhost:10001
echo   區域網路: http://140.134.39.21:10001
echo   虛擬機: http://192.168.56.1:10001
echo.
echo 按 Ctrl+C 停止服務器
echo.

cd /d "%~dp0"
npm start
