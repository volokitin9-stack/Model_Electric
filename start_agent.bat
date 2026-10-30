@echo off
rem Windows launcher. Set your folder in config.json (copied from config.example.json).
cd /d "%~dp0"
if not exist config.json copy config.example.json config.json >nul
python -m pip install -q -r requirements.txt
start "" http://127.0.0.1:8765
python agent\folder_agent.py --config config.json
pause
