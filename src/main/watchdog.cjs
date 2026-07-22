// Runs as a separate, detached process (spawned via the Electron binary in
// ELECTRON_RUN_AS_NODE mode, so no extra Node.js install is required). Its
// only job: notice if the main app disappears without a clean shutdown
// (crash, Task Manager "End Task", forced TerminateProcess) and force-kill
// whatever child process trees were still running, so nothing is left as a
// zombie behind a closed window. On a normal quit, main.cjs empties the pid
// file before exiting, so this cleanup pass is a harmless no-op.
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const [, , parentPidArg, pidFileArg] = process.argv;
const parentPid = Number(parentPidArg);
const pidFile = pidFileArg;
const POLL_MS = 1500;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function readTrackedPids() {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function cleanup() {
  for (const entry of readTrackedPids()) {
    const pid = entry && entry.pid;
    if (!pid) continue;
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (_err) {
      // Already gone, or we lack permission - nothing more this watchdog can do.
    }
  }
}

function poll() {
  if (!parentPid || !isAlive(parentPid)) {
    cleanup();
    process.exit(0);
    return;
  }
  setTimeout(poll, POLL_MS);
}

if (!parentPid || !pidFile) {
  process.exit(1);
} else {
  poll();
}
