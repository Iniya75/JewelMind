@echo off
REM JewelMind - Unified Single Link Startup
REM This script starts all 3 servers needed for http://localhost:8000

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  🚀 JewelMind Alchemy - Single Link Startup           ║
echo ║                                                        ║
echo ║  Your app will be available at:                       ║
echo ║  🌐 http://localhost:8000                             ║
echo ╚════════════════════════════════════════════════════════╝
echo.

setlocal enabledelayedexpansion

REM Check if Python virtual environment exists
if not exist ".venv\Scripts\activate.bat" (
    echo ❌ ERROR: Virtual environment not found
    echo.
    echo Run this first:
    echo   python -m venv .venv
    echo   .venv\Scripts\activate.bat
    echo   pip install -r backend/requirements.txt
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo ❌ ERROR: Node modules not found
    echo.
    echo Run this first:
    echo   npm install
    echo.
    pause
    exit /b 1
)

echo ✅ Prerequisites verified
echo.
echo Starting services...
echo.

REM Activate venv
call .venv\Scripts\activate.bat

REM Start Backend Server (port 8001)
echo.
echo 1️⃣  Starting Backend Server on port 8001...
start "JewelMind Backend" cmd /k "cd backend && ..\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

REM Wait a bit for backend to start
timeout /t 2 /nobreak

REM Start Frontend Dev Server (port 8080)
echo 2️⃣  Starting Frontend Dev Server on port 8080...
start "JewelMind Frontend" cmd /k "npm run dev"

REM Wait a bit for frontend to start
timeout /t 2 /nobreak

REM Start Reverse Proxy (port 8000)
echo 3️⃣  Starting Reverse Proxy on port 8000...
start "JewelMind Proxy" cmd /k "node reverse-proxy.js"

REM Wait a bit for everything to start
timeout /t 3 /nobreak

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║  ✅ All services started!                             ║
echo ║                                                        ║
echo ║  📱 Open your browser and go to:                      ║
echo ║     🌐 http://localhost:8000                          ║
echo ║                                                        ║
echo ║  📊 You should see the JewelMind login page           ║
echo ║                                                        ║
echo ║  🛑 To stop: Close all 3 terminal windows             ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Open browser automatically
start http://localhost:8000

echo.
echo Waiting for services to stabilize...
timeout /t 5 /nobreak

echo.
echo If the page doesn't load:
echo   1. Check all 3 windows opened successfully
echo   2. Wait 10 seconds and refresh browser (F5)
echo   3. If MySQL error: Ensure MySQL is running on port 3307
echo.
pause
