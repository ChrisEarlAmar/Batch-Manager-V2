# Electron Local Process Manager / Terminal Dashboard Specification

Build a Windows desktop application using Electron that acts like a
lightweight ConEmu/Laragon-style process manager and terminal dashboard.

## Purpose

Manage local development processes, especially Laravel services:

-   php artisan queue:work
-   php artisan reverb:start
-   php artisan schedule:work
-   npm run dev / Vite
-   custom batch scripts

The application should configure local `.bat` files, start them, monitor
them, display output, and manage their lifecycle.

## Technology

Use:

-   Electron
-   React (or existing frontend framework)
-   xterm.js for terminal display
-   node-pty for real terminal sessions
-   Electron IPC
-   app.getPath("userData") for configuration storage

Windows-focused application.

## Core Concept

A process is a configured command or batch file that can be started and
monitored.

Example:

-   Name: Laravel Queue Worker
-   Script: C:`\Projects`{=tex}`\App`{=tex}`\queue`{=tex}-worker.bat
-   Working Directory: C:`\Projects`{=tex}`\App`{=tex}
-   Auto Start: true
-   Restart On Crash: true

Each process runs inside a PTY terminal session.

## UI

Main layout:

-   Left sidebar: process list
-   Main area: terminal tabs

Process list shows:

-   Name
-   Status
-   PID
-   Uptime
-   Current state

States:

-   Starting
-   Running
-   Stopping
-   Stopped
-   Crashed

Actions:

-   Start
-   Stop
-   Restart
-   Open Terminal
-   Remove

## Terminal Tabs

Support multiple terminal tabs like VS Code.

Requirements:

-   Multiple processes run simultaneously
-   Closing a tab does not stop the process
-   Terminal view can be reopened later
-   Sessions remain connected

Use xterm.js + node-pty.

Support:

-   ANSI colors
-   Resizing
-   Ctrl+C
-   Interactive commands
-   Live output

## Storage

Store configuration in:

`app.getPath("userData")`

Example process configuration:

``` json
{
  "processes": [
    {
      "id": "queue-worker",
      "name": "Laravel Queue Worker",
      "script": "C:\Projects\App\queue.bat",
      "workingDirectory": "C:\Projects\App",
      "autoStart": true,
      "restartOnCrash": true
    }
  ]
}
```

## Startup

When the application launches:

1.  Load saved configuration
2.  Find auto-start processes
3.  Start them
4.  Update status
5.  Allow opening terminal tabs

## Uptime Tracking

Track:

-   startedAt
-   current uptime
-   total runtime
-   start count
-   crash count
-   last exit code

Display examples:

`Uptime: 02:15:32`

## Process Management

Start:

-   Create PTY
-   Launch batch file

Stop:

-   Send Ctrl+C
-   Wait
-   Force kill if required

Restart:

-   Stop
-   Start again

Crash handling:

-   Detect unexpected exits
-   Record exit code
-   Restart if enabled

## Administrator Support

If Electron runs as Administrator, child processes should inherit
elevation.

Display administrator status in the UI.

## Profiles

Support future project profiles:

Example:

Laravel Project A: - Queue Worker - Reverb - Vite

Laravel Project B: - Queue Worker - Scheduler

## Add Process Screen

Fields:

-   Name
-   Batch file path
-   Working directory
-   Auto start
-   Restart on crash

Allow selecting `.bat` files.

## Logging

Maintain logs:

    logs/
      queue-worker.log
      reverb.log

Store:

-   stdout
-   stderr
-   timestamps

## Code Structure

Keep Electron main and renderer separated.

Use preload.js with contextBridge.

Suggested structure:

    src/
      main/
        processManager.js
        terminalManager.js
        configManager.js

      renderer/
        components/
          ProcessList
          TerminalTabs
          TerminalView

      preload/
        api.js

## Development Phases

### Phase 1

-   Electron app
-   Process configuration
-   Start batch files
-   Status display
-   Uptime
-   Terminal tabs

### Phase 2

-   Auto startup
-   Crash restart
-   Logs
-   Profiles

### Phase 3

-   Polished UI
-   Tray application
-   Notifications
-   Service management

Prioritize reliability of process management before visual polish.
