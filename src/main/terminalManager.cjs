// Owns the node-pty sessions themselves: spawning the .bat file inside a
// real cmd.exe pty, buffering scrollback so a closed tab can be reopened
// without losing history, and tearing sessions down (graceful, then forced).
'use strict';

const path = require('path');
const pty = require('node-pty');
const { execFile } = require('child_process');

const SCROLLBACK_CAP_BYTES = 512 * 1024; // ~512KB per process, plenty for a dev console
const GRACEFUL_STOP_TIMEOUT_MS = 4000;

const sessions = new Map(); // id -> { pty, scrollback, cols, rows, stopTimer }

function isAlive(id) {
  return sessions.has(id);
}

function appendScrollback(entry, data) {
  entry.scrollback += data;
  if (entry.scrollback.length > SCROLLBACK_CAP_BYTES) {
    entry.scrollback = entry.scrollback.slice(entry.scrollback.length - SCROLLBACK_CAP_BYTES);
  }
}

function spawn(id, { script, workingDirectory }, { onData, onExit }) {
  if (sessions.has(id)) {
    throw new Error(`Terminal session for "${id}" is already running`);
  }

  const cwd = workingDirectory && workingDirectory.trim() ? workingDirectory : path.dirname(script);
  const cols = 100;
  const rows = 30;

  const ptyProcess = pty.spawn('cmd.exe', ['/d', '/c', script], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const entry = { pty: ptyProcess, scrollback: '', cols, rows, stopTimer: null, confirmTimer: null };
  sessions.set(id, entry);

  ptyProcess.onData((data) => {
    appendScrollback(entry, data);
    onData(data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (entry.stopTimer) clearTimeout(entry.stopTimer);
    if (entry.confirmTimer) clearTimeout(entry.confirmTimer);
    sessions.delete(id);
    onExit(exitCode, signal);
  });

  return ptyProcess.pid;
}

function write(id, data) {
  const entry = sessions.get(id);
  if (!entry) return;
  entry.pty.write(data);
}

function resize(id, cols, rows) {
  const entry = sessions.get(id);
  if (!entry || !cols || !rows) return;
  try {
    entry.pty.resize(cols, rows);
    entry.cols = cols;
    entry.rows = rows;
  } catch (err) {
    // pty may have just exited; safe to ignore
  }
}

function getScrollback(id) {
  const entry = sessions.get(id);
  return entry ? entry.scrollback : '';
}

function killTree(pid) {
  return new Promise((resolve) => {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => resolve());
  });
}

// Sends Ctrl+C for a graceful stop, then force-kills the whole process tree
// if the pty hasn't exited within GRACEFUL_STOP_TIMEOUT_MS. Interactive CLIs
// (queue workers, vite, reverb) generally shut down cleanly on Ctrl+C, but a
// force fallback is required for reliability per the spec.
function stop(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  const pid = entry.pty.pid;
  try {
    entry.pty.write('\x03');
  } catch (_) {
    /* already gone */
  }
  // cmd.exe intercepts Ctrl+C on a running .bat with its own
  // "Terminate batch job (Y/N)?" confirmation instead of forwarding the
  // signal, which would otherwise stall every stop until the force-kill
  // timeout. Auto-answering is harmless when no prompt appears (the child
  // has almost always already received and handled the Ctrl+C by then).
  entry.confirmTimer = setTimeout(() => {
    if (sessions.has(id)) {
      try {
        entry.pty.write('Y\r\n');
      } catch (_) {
        /* already gone */
      }
    }
  }, 400);
  entry.stopTimer = setTimeout(() => {
    if (sessions.has(id)) {
      killTree(pid);
    }
  }, GRACEFUL_STOP_TIMEOUT_MS);
}

function kill(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  killTree(entry.pty.pid);
}

function dispose(id) {
  const entry = sessions.get(id);
  if (entry) {
    if (entry.stopTimer) clearTimeout(entry.stopTimer);
    if (entry.confirmTimer) clearTimeout(entry.confirmTimer);
    try {
      killTree(entry.pty.pid);
    } catch (_) {
      /* ignore */
    }
    sessions.delete(id);
  }
}

function disposeAll() {
  return Promise.all(Array.from(sessions.keys()).map((id) => killTree(sessions.get(id).pty.pid)));
}

module.exports = { spawn, write, resize, getScrollback, stop, kill, dispose, disposeAll, isAlive };
