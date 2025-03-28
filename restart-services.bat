@echo off
echo ===================================================
echo Starting Open Operator with Web UI Backend Integration
echo ===================================================
echo.

REM Set environment variables for the ports
set WEBUI_PORT=7788
set BRIDGE_PORT=7789
set FRONTEND_PORT=3000

REM Create port files for service discovery
echo %WEBUI_PORT% > .webui_port-port
echo %BRIDGE_PORT% > .bridge_port-port
echo %FRONTEND_PORT% > .frontend_port-port

echo Starting Web UI backend service...
start cmd /k "cd ..\web-ui && python webui.py"
timeout /t 5

echo Starting Bridge server...
start cmd /k "cd app\adapters\bridge-server && node server.js"
timeout /t 3

echo Starting Open Operator frontend...
start cmd /k "npm run dev"

echo.
echo All services started successfully!
echo.
echo - Web UI backend is running on port %WEBUI_PORT%
echo - Bridge server is running on port %BRIDGE_PORT%
echo - Frontend is running on port %FRONTEND_PORT%
echo.
echo Navigate to http://localhost:3000 in your browser to use the application.
echo.
echo To stop all services, close the terminal windows.
echo ===================================================
