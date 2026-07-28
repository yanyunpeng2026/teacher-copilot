@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "NODE_EXE=node"
set "PNPM_CMD=npm"
"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  set "PNPM_CMD=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
)
"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo 未检测到运行环境，请先安装 Node.js 22。
  pause
  exit /b 1
)
if not exist node_modules (
  echo 正在准备知序，请稍候...
  call "%PNPM_CMD%" install --ignore-scripts
)
if not exist dist (
  "%NODE_EXE%" node_modules\typescript\bin\tsc -b
  "%NODE_EXE%" node_modules\vite\bin\vite.js build
)
"%NODE_EXE%" server\server.mjs
