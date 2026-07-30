// Runs as a SEPARATE, UAC-elevated process (launched via
// `powershell Start-Process -Verb RunAs` from elevatedTerminalManager.cjs,
// through Electron's own binary in ELECTRON_RUN_AS_NODE mode - no extra
// install required). A ShellExecute-elevated child does not inherit stdio
// handles the way a normal CreateProcess child does, so there is no way to
// pipe its output back directly; instead this process connects out to a
// named pipe the (non-elevated) main app is listening on, and bridges
// node-pty's I/O over that pipe as newline-delimited JSON messages.
//
// This process owns its own pty lifecycle end to end, including graceful
// and force stop: the non-elevated main app has no way to signal or kill an
// elevated process tree directly (that's the whole point of the elevation
// boundary), so "stop" is a message this process acts on itself, not
// something done to it from outside.
'use strict';

const net = require('net');
const path = require('path');
const pty = require('node-pty');
const { execFile } = require('child_process');

const [, , pipeName, script, workingDirectory] = process.argv;

const GRACEFUL_STOP_TIMEOUT_MS = 4000;
const ORPHAN_GRACE_MS = 5000;

let ptyProcess = null;
let socket = null;
let stopRequested = false;
let confirmTimer = null;
let stopTimer = null;
let disconnectTimer = null;

function send(msg) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(JSON.stringify(msg) + '\n');
  } catch (_) {
    /* pipe already gone; nothing more we can do */
  }
}

function killTree(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => resolve());
  });
}

function cleanupAndExit() {
  if (confirmTimer) clearTimeout(confirmTimer);
  if (stopTimer) clearTimeout(stopTimer);
  if (disconnectTimer) clearTimeout(disconnectTimer);
  process.exit(0);
}

function startPty() {
  const cwd = workingDirectory && workingDirectory.trim() ? workingDirectory : path.dirname(script);

  try {
    ptyProcess = pty.spawn('cmd.exe', ['/d', '/c', script], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
  } catch (err) {
    send({ type: 'spawn-error', message: err.message });
    cleanupAndExit();
    return;
  }

  send({ type: 'ready', pid: ptyProcess.pid });

  ptyProcess.onData((data) => send({ type: 'data', chunk: data }));

  ptyProcess.onExit(({ exitCode, signal }) => {
    send({ type: 'exit', exitCode, signal: signal ?? null });
    cleanupAndExit();
  });
}

function handleMessage(msg) {
  if (!ptyProcess) return;
  switch (msg.type) {
    case 'input':
      try {
        ptyProcess.write(msg.data);
      } catch (_) {
        /* pty already gone */
      }
      break;
    case 'resize':
      try {
        ptyProcess.resize(msg.cols, msg.rows);
      } catch (_) {
        /* pty already gone */
      }
      break;
    case 'stop':
      stopRequested = true;
      try {
        ptyProcess.write('\x03');
      } catch (_) {
        /* already gone */
      }
      // Same cmd.exe "Terminate batch job (Y/N)?" quirk handled in
      // terminalManager.cjs - see that file for the full explanation.
      confirmTimer = setTimeout(() => {
        try {
          ptyProcess.write('Y\r\n');
        } catch (_) {
          /* already gone */
        }
      }, 400);
      stopTimer = setTimeout(() => {
        killTree(ptyProcess.pid);
      }, GRACEFUL_STOP_TIMEOUT_MS);
      break;
    case 'kill':
      killTree(ptyProcess.pid);
      break;
  }
}

function connect() {
  socket = net.connect(pipeName, () => {
    startPty();
  });

  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch (_) {
        /* ignore a malformed line rather than take the whole bridge down */
      }
    }
  });

  socket.on('close', () => {
    if (stopRequested) return; // already tearing down cleanly via the stop sequence above
    // An unexpected disconnect means the main app crashed or restarted. This
    // pty is now orphaned with no way to reconnect - a restart creates a
    // brand new pipe with a new random name this process has no way to
    // learn. A short grace window absorbs a benign blip; beyond that, clean
    // up rather than leave a fully elevated process running unattended.
    disconnectTimer = setTimeout(() => {
      if (ptyProcess) killTree(ptyProcess.pid).then(() => process.exit(0));
      else process.exit(0);
    }, ORPHAN_GRACE_MS);
  });

  socket.on('error', () => {
    /* 'close' always follows 'error'; handled there */
  });
}

if (!pipeName || !script) {
  process.exit(1);
} else {
  connect();
}
