@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 正在准备知序，请稍候...
  call npm install
)
if not exist dist (
  call npm run build
)
start "" http://localhost:4174/teacher-copilot/
call npm run desktop
