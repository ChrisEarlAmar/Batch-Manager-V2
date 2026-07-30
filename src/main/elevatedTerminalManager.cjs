// Non-elevated counterpart to terminalManager.cjs, for processes flagged
// runElevated. Mirrors its public shape (spawn/write/resize/getScrollback/
// stop/kill/dispose/disposeAll/isAlive) so processManager can treat both
// interchangeably - but everything happens across a real Windows privilege
// boundary instead of a direct child process:
//
//   this (non-elevated) process
//     -> spawns a non-elevated powershell.exe
//     -> which runs Start-Process -Verb RunAs (the actual UAC prompt)
//     -> which starts elevatedRunner.cjs, fully elevated
//     -> which connects back to a named pipe we're listening on
//     -> and bridges its own node-pty session over that pipe as
//        newline-delimited JSON messages (see elevatedRunner.cjs)
//
// ShellExecute-elevated children don't inherit stdio handles the way a
// normal CreateProcess child does, which is why this can't just be "spawn
// with an elevated flag" the way the regular terminalManager works - there
// is no direct parent/child relationship to read output from or write
// input to, so the named pipe is doing that job instead.
//
// Because of that same privilege boundary, this side can never *force*
// anything on an elevated session the way terminalManager.kill() can for a
// normal one (taskkill from here targeting an elevated PID fails with
// Access Denied) - stop/kill here are requests the elevated runner acts on
// itself. See the comments on stop() below for the practical effect of that.
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn: spawnChild } = require('child_process');

const SCROLLBACK_CAP_BYTES = 256 * 1024;
const ELEVATION_TIMEOUT_MS = 120 * 1000; // generous - this is a human clicking a real UAC prompt
const STOP_NO_RESPONSE_WARNING_MS = 15 * 1000;

const RUNNER_SCRIPT = path.join(__dirname, 'elevatedRunner.cjs');

const sessions = new Map(); // id -> { socket, server, scrollback, pid, stopWarnTimer }

function isAlive(id) {
  return sessions.has(id);
}

function appendScrollback(entry, data) {
  entry.scrollback += data;
  if (entry.scrollback.length > SCROLLBACK_CAP_BYTES) {
    entry.scrollback = entry.scrollback.slice(entry.scrollback.length - SCROLLBACK_CAP_BYTES);
  }
}

function quoteForStartProcessArg(value) {
  // Start-Process -ArgumentList does NOT add quotes around array elements
  // containing spaces when it builds the target process's actual command
  // line - the outer PowerShell '...' only protects PowerShell's own
  // parsing of the -ArgumentList array itself. Each element needs its own
  // embedded "..." so the target's argv parser (CommandLineToArgvW) splits
  // it back into one argument instead of several. Confirmed with a direct
  // test before relying on it here - this exact gap silently truncated any
  // path containing a space on the first attempt.
  return `'"${String(value).replace(/'/g, "''")}"'`;
}

function send(entry, msg) {
  if (!entry.socket || entry.socket.destroyed) return;
  try {
    entry.socket.write(JSON.stringify(msg) + '\n');
  } catch (_) {
    /* pipe already gone */
  }
}

function cleanupEntry(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  if (entry.stopWarnTimer) clearTimeout(entry.stopWarnTimer);
  try {
    entry.server.close();
  } catch (_) {
    /* already closed */
  }
  sessions.delete(id);
}

function spawn(id, { script, workingDirectory }, { onData, onExit, onWarning }) {
  if (sessions.has(id)) {
    return Promise.reject(new Error(`Terminal session for "${id}" is already running`));
  }

  const cwd = workingDirectory && workingDirectory.trim() ? workingDirectory : path.dirname(script);

  // Same reasoning as terminalManager.cjs: fail fast with a specific message
  // rather than paying for a UAC round trip just to discover the file isn't
  // there. Elevation can in principle see a different filesystem view than
  // this process, so the elevated runner independently re-checks too.
  if (!fs.existsSync(script)) {
    return Promise.reject(new Error(`Batch file not found: ${script}`));
  }
  if (!fs.existsSync(cwd)) {
    return Promise.reject(new Error(`Working directory not found: ${cwd}`));
  }

  const electronExe = process.execPath;
  const pipeName = `\\\\.\\pipe\\process-manager-elevated-${crypto.randomBytes(12).toString('hex')}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const entry = { socket: null, server: null, scrollback: '', pid: null, stopWarnTimer: null };

    const finishError = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(elevationTimeout);
      try {
        entry.server.close();
      } catch (_) {
        /* ignore */
      }
      sessions.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const server = net.createServer((socket) => {
      entry.socket = socket;
      let buf = '';
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch (_) {
            continue;
          }
          if (msg.type === 'ready') {
            entry.pid = msg.pid;
            clearTimeout(elevationTimeout);
            if (!settled) {
              settled = true;
              resolve(msg.pid);
            }
          } else if (msg.type === 'data') {
            appendScrollback(entry, msg.chunk);
            onData(msg.chunk);
          } else if (msg.type === 'exit') {
            if (entry.stopWarnTimer) clearTimeout(entry.stopWarnTimer);
            cleanupEntry(id);
            onExit(msg.exitCode, msg.signal);
          } else if (msg.type === 'spawn-error') {
            finishError(new Error(msg.message));
          }
        }
      });
      socket.on('close', () => {
        if (!sessions.has(id)) return; // already cleaned up via a normal 'exit' message
        // The elevated runner disconnected without ever reporting an exit -
        // most likely it (or its pty) was killed out from under the pipe.
        // We can't inspect or force anything on it from here; treat the
        // disconnect itself as the exit signal so the UI doesn't hang.
        cleanupEntry(id);
        onExit(null, null);
      });
    });

    server.on('error', (err) => finishError(err));

    server.listen(pipeName, () => {
      entry.server = server;
      sessions.set(id, entry);

      const argList = [RUNNER_SCRIPT, pipeName, script, cwd].map(quoteForStartProcessArg).join(',');
      const psCommand =
        `try { Start-Process -FilePath ${quoteForStartProcessArg(electronExe)} -ArgumentList ${argList} -Verb RunAs -WindowStyle Hidden } ` +
        `catch { Write-Error $_.Exception.Message; exit 1 }`;

      const trigger = spawnChild('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psCommand], {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });

      let stderr = '';
      trigger.stderr?.on('data', (d) => (stderr += d.toString('utf8')));
      trigger.on('error', (err) => finishError(err));
      trigger.on('exit', (code) => {
        // A non-zero exit here means Start-Process itself failed - almost
        // always the user dismissing/denying the UAC prompt. A *successful*
        // elevation leaves this trigger process exiting 0 well before the
        // elevated target (and the pty inside it) is done running, so this
        // is not a signal that the real work finished, only that the
        // elevation attempt itself did or didn't get off the ground.
        if (code !== 0 && !settled) {
          finishError(new Error(stderr.trim() || 'The elevation request was denied or could not be started.'));
        }
      });
    });

    const elevationTimeout = setTimeout(() => {
      finishError(new Error('Elevation request timed out waiting for a response to the UAC prompt.'));
    }, ELEVATION_TIMEOUT_MS);

    void onWarning; // reserved: surfaced via the stop() no-response path below, not at spawn time
  });
}

function write(id, data) {
  const entry = sessions.get(id);
  if (!entry) return;
  send(entry, { type: 'input', data });
}

function resize(id, cols, rows) {
  const entry = sessions.get(id);
  if (!entry || !cols || !rows) return;
  send(entry, { type: 'resize', cols, rows });
}

function getScrollback(id) {
  const entry = sessions.get(id);
  return entry ? entry.scrollback : '';
}

// Requests a graceful stop; the elevated runner performs the actual
// Ctrl+C -> confirm -> force-kill sequence itself, since only it can
// reliably signal its own elevated process tree. If it doesn't confirm
// within a generous window - a stuck runner, a severed pipe - there is
// nothing this side can forcibly do about it; onWarning lets the caller
// tell the user a manual check (e.g. Task Manager) may be needed instead of
// leaving the UI silently stuck on "stopping".
function stop(id, onWarning) {
  const entry = sessions.get(id);
  if (!entry) return;
  send(entry, { type: 'stop' });
  entry.stopWarnTimer = setTimeout(() => {
    if (sessions.has(id) && typeof onWarning === 'function') {
      onWarning();
    }
  }, STOP_NO_RESPONSE_WARNING_MS);
}

function kill(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  send(entry, { type: 'kill' });
}

function dispose(id) {
  const entry = sessions.get(id);
  if (!entry) return;
  send(entry, { type: 'kill' });
  cleanupEntry(id);
}

function disposeAll() {
  const ids = Array.from(sessions.keys());
  ids.forEach((id) => {
    const entry = sessions.get(id);
    if (entry) send(entry, { type: 'kill' });
  });
  // Don't block app shutdown waiting on elevated sessions indefinitely -
  // the elevated runner's own orphan-detection (see elevatedRunner.cjs)
  // is the real backstop once our pipe goes away with this process anyway.
  return new Promise((resolve) => {
    setTimeout(() => {
      ids.forEach((id) => cleanupEntry(id));
      resolve();
    }, 2000);
  });
}

module.exports = { spawn, write, resize, getScrollback, stop, kill, dispose, disposeAll, isAlive };
