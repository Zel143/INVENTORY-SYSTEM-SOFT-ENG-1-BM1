@echo off
echo ========================================
echo StockSense - Portable Node.js Runner
echo ========================================
echo.

REM Check if portable node exists
if not exist "node\node.exe" (
    echo ERROR: Portable Node.js not found!
    echo.
    echo Please download and extract Node.js portable to: node\
    echo Download from: https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip
    echo.
    pause
    exit /b 1
)

echo Found Node.js: node\node.exe
echo.

REM Set PATH to use portable Node.js
SET PATH=%CD%\node;%PATH%
SET NODE_PATH=%CD%\node_modules

REM Install dependencies using direct path
if not exist "node_modules\express" (
    echo Installing dependencies...
    echo This may take 2-3 minutes...
    echo.
    "%CD%\node\npm.cmd" install
    echo.
    if errorlevel 1 (
        echo.
        echo WARNING: Some packages may have warnings (normal)
        echo Continuing anyway...
        echo.
    )
)

REM Initialize database
if not exist "stocksense.db" (
    echo Creating database...
    "%CD%\node\node.exe" init-database.js
    echo.
    if errorlevel 1 (
        echo ERROR: Database initialization failed!
        pause
        exit /b 1
    )
)

REM Start server
echo.
echo ========================================
echo Starting StockSense server...
echo ========================================
echo.
echo Open your browser to: http://localhost:3000/index.html
echo Login credentials: admin / admin
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.
"%CD%\node\node.exe" server.js

pause
