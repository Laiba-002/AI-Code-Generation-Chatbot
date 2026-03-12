@echo off
echo Starting Full-Stack Chatbot...
echo.

echo Checking if Ollama is running...
ollama list >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Ollama is not running!
    echo Please start Ollama first by running: ollama serve
    echo.
    pause
    exit /b 1
)

echo Ollama is running. Initializing database...
echo.

REM Initialize database
cd backend
python init_db.py
if %errorlevel% neq 0 (
    echo ERROR: Database initialization failed!
    pause
    exit /b 1
)
cd ..

echo Database initialized. Starting servers...
echo.

echo Starting Backend Server (Flask)...
start "Backend Server" cmd /k "cd backend && python app.py"

echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

echo Starting Frontend Server (React)...
start "Frontend Server" cmd /k "cd frontend && npm start"

echo.
echo Servers are starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Press any key to open the application in your browser...
pause >nul

start http://localhost:3000

echo.
echo Application started successfully!
echo Keep these terminal windows open while using the chatbot.
echo.
echo Demo Account:
echo Email: abdul@example.com
echo Password: password123
echo.
pause 