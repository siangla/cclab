@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動 LangLab 伺服器...
echo 瀏覽器將開啟 http://localhost:8765
echo （保持此視窗開啟；關閉即停止伺服器）
start "" http://localhost:8765
where py >nul 2>nul && (py -m http.server 8765 & goto :eof)
where python >nul 2>nul && (python -m http.server 8765 & goto :eof)
where node >nul 2>nul && (npx --yes http-server -p 8765 & goto :eof)
echo.
echo 找不到 Python 或 Node.js，無法啟動伺服器。
echo 請先安裝 Python（https://www.python.org/downloads/），安裝時勾選 Add to PATH。
pause
