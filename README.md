# Process Manager

A Windows desktop app for starting, monitoring, and managing local development
processes — Laravel queue workers, Reverb, the scheduler, Vite dev servers,
or any other `.bat`/`.cmd` script — from one dashboard with real terminal
sessions, instead of juggling a pile of terminal windows.

Built with Electron, React, and real PTY sessions (via `node-pty` +
`xterm.js`), so each managed process gets an actual interactive terminal:
live ANSI-colored output, resizing, Ctrl+C, and the ability to type into it
directly.

## Features

**Process management**
- Configure a process with a name, a `.bat`/`.cmd` file, a working directory,
  auto-start, and auto-restart-on-crash
- Start / Stop / Restart, with graceful shutdown (Ctrl+C, then a confirm
  keystroke for `Terminate batch job (Y/N)?`, then a force-kill of the whole
  process tree if it still won't die)
- Crash detection with bounded auto-restart: backs off over a few attempts,
  then disables itself after 5 crashes in a minute so a broken process can't
  loop forever
- Uptime, total accumulated runtime, start count, crash count, and last exit
  code, tracked per process
- Group processes into **profiles** (e.g. "Project A") and Start All / Stop
  All per profile or globally
- Drag a `.bat`/`.cmd` file onto the window to open "Add Process" pre-filled

**Terminal**
- Multiple terminal tabs, VS Code-style — closing a tab doesn't stop the
  process, and reopening it replays the buffered output
- Only the active tab's terminal is actually mounted in the renderer, so
  having many processes configured doesn't multiply memory use
- Per-process log files (stdout/stderr with timestamps) on disk, openable
  from the terminal toolbar

**Reliability**
- Single-instance lock — launching the app again just focuses the existing
  window
- A detached watchdog process outlives a hard crash of the app itself and
  force-kills any child process trees left running, so nothing turns into an
  orphaned background process
- Closing the window asks for confirmation and actually stops everything
  (no silent hide-to-tray by default)
- Reports whether the app is running elevated, since child processes inherit
  that elevation

**UI**
- Tailwind CSS v4 + shadcn/ui (Radix primitives), dark theme with a coral
  accent
- Custom frameless title bar with window controls
- DevTools and reload/inspect shortcuts are disabled in packaged builds

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron 43 |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix + `class-variance-authority`) |
| Terminal | `xterm.js` + `node-pty` (ConPTY on Windows) |
| Icons | `lucide-react` |
| Bundler | Vite 8 |
| Packaging | `electron-builder` (NSIS installer) |

## Getting started

Requires Node.js and Windows (the app shells out to `cmd.exe`/`taskkill` and
uses ConPTY, so it only targets Windows).

```bash
npm install
npm run electron:dev
```

This starts the Vite dev server and launches the Electron window against it,
with hot reload for the renderer.

Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server only (renderer, no Electron shell) |
| `npm run build` | Type-check + production build of the renderer into `dist/` |
| `npm run lint` | ESLint over the renderer source |
| `npm run electron:build` | Build the renderer, then package a Windows installer into `release/` |
| `npm run electron:pack` | Same, but unpacked only (`--dir`, no installer) — faster for testing |
| `npm run generate:icon` | Regenerate the app icon (procedural, no image assets needed) from `scripts/generate-icon.cjs` |

### Building the installer

Double-click `build-installer.bat`, or run `npm run electron:build`. Output
lands in `release/` (gitignored) as `Process Manager Setup <version>.exe`.

> If the build fails with an `EPERM`/access-denied error while renaming
> `win-unpacked.tmp`, that's antivirus locking the freshly-extracted Electron
> executables, not a project problem — just retry, or ask IT to exclude the
> project folder from real-time scanning if it keeps happening.

## Project structure

```
src/
  main/                    Electron main process (Node, not bundled by Vite)
    main.cjs               App/window lifecycle, tray, single-instance lock, quit confirmation
    processManager.cjs     Process lifecycle: start/stop/restart, crash + auto-restart logic, profiles
    terminalManager.cjs    node-pty sessions: spawn, graceful stop, scrollback buffer
    configManager.cjs      Reads/writes config.json (atomic, debounced)
    logger.cjs             Per-process log files
    adminCheck.cjs         Detects whether the app is running elevated
    watchdog.cjs           Detached helper that force-kills orphaned children if the app dies uncleanly
    ipc.cjs                All ipcMain handlers, wiring the above to the renderer
  preload/
    api.cjs                contextBridge surface exposed to the renderer as window.api
  components/              React components (sidebar, process cards, terminal tabs/view, modals)
    ui/                    shadcn/ui primitives (button, card, dialog, select, etc.)
  hooks/                    useUptime, etc.
  types.ts, global.d.ts     Shared types and the window.api type declaration

scripts/generate-icon.cjs   Procedurally draws and encodes the app icon (no image dependencies)
build/                      Generated installer icon (icon.ico)
```

Main and renderer are kept strictly separate: the renderer never touches
Node/Electron APIs directly, only through `window.api` (defined in
`src/preload/api.cjs`, typed in `src/global.d.ts`).

## Configuration & data storage

Everything is stored under `app.getPath('userData')`, which on Windows is
`%APPDATA%\batch-manager-v2\`:

- `config.json` — configured processes, profiles, per-process stats, and
  settings (e.g. `minimizeToTray`)
- `logs/<process-id>.log` — stdout/stderr for each process, appended across
  restarts
- `running-pids.json` — live PIDs of currently-running processes, read by
  the watchdog process if the app disappears unexpectedly

None of this is affected by rebuilding or reinstalling the app.

## Notes

- Windows-only by design (ConPTY, `cmd.exe`, `taskkill`).
- The production JS bundle is a single ~700KB chunk; code-splitting isn't
  set up since this is a desktop app loaded once per session, not a page
  weighing in over a network.
