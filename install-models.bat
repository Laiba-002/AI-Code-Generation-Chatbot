@echo off
echo Installing Ollama Models for Chatbot...
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

echo Ollama is running. Installing models...
echo.

echo Installing qwen2.5-coder:7b...
ollama run qwen2.5-coder:7b

echo Installing llama3.2:3b...
ollama run llama3.2:3b

echo Installing codellama:7b...
ollama run codellama:7b

echo Installing mistral:7b...
ollama run mistral:7b

echo Installing deepseek-r1...
ollama run deepseek-r1

echo Installing llama3.1:8b...
ollama run llama3.1:8b

echo Installing qwen3:8b...
ollama run qwen3:8b

echo.
echo All models installed successfully!
echo You can now run start.bat to start the chatbot.
echo.
pause 