@echo off
echo ==============================================================================
echo  Starting AMD Instinct AI Business Assessment Platform (Backend + UI)
echo ==============================================================================
echo.
echo Local Web App:     http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.

set PYTHON_EXE="C:\Users\berka\AppData\Local\Python\pythoncore-3.14-64\python.exe"
if exist %PYTHON_EXE% (
    %PYTHON_EXE% -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
)
pause
