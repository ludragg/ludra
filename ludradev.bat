@echo off
setlocal
title Ludra Dev
cd /d "%~dp0apps\desktop"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules\vite (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

node devkit\main.mjs --detach
if errorlevel 1 pause
