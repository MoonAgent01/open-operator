@echo off
echo Starting Open Operator Integration...

echo.
echo [1/3] Starting Web UI backend...
start cmd /k "cd /d D:\AI Agent\web-ui && python webui.py"
timeout /t 5

echo.
echo [2/3] Starting Bridge Server...
start cmd /k "cd /d D:\AI Agent\open-operator\app\adapters\bridge-server && npm start"
timeout /t 3

echo.
echo [3/3] Starting Open Operator frontend...
start cmd /k "cd /d D:\AI Agent\open-operator && npm run dev"

echo.
echo All services started. Open http://localhost:3000 to use the integrated system.
echo.
echo For troubleshooting, see BROWSERBASE_INTEGRATION.md
echo.
