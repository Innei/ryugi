@echo off
setlocal
set "NODE_EXE=%CODEX_MCP_NODE_PATH%"
if not defined NODE_EXE set "NODE_EXE=node"
"%NODE_EXE%" "%~dp0codex-hook.cjs" %*
