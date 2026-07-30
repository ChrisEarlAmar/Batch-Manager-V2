// Orchestrates process lifecycle on top of terminalManager (PTY mechanics)
// and configManager (persistence): start/stop/restart, crash detection with
// bounded auto-restart backoff, uptime/stat tracking, and broadcasting state
// to every renderer window.
'use strict';

const fs = require('fs');
const { randomUUID } = require('crypto');
const { Notification } = require('electron');
const configManager = require('./configManager.cjs');
const terminalManager = require('./terminalManager.cjs');
const elevatedTerminalManager = require('./elevatedTerminalManager.cjs');
const logger = require('./logger.cjs');

const CRASH_WINDOW_MS = 60 * 1000;
const CRASH_SUPPRESS_THRESHOLD = 5;
const AUTOSTART_STAGGER_MS = 400;
const REMOVE_STOP_TIMEOUT_MS = 8000;

const runtime = new Map(); // id -> runtime state (not persisted)
const pendingRemovals = new Map(); // id -> resolve() for a remove() awaiting graceful stop
let getWindows = () => [];
let iconPath = null;
let pidFilePath = null;

function defaultRuntime() {
  return {
    status: 'stopped',
    pid: null,
    startedAt: null,
    stopRequested: false,
    restartPending: false,
    restartTimer: null,
    crashTimestamps: [],
    autoRestartSuppressed: false,
    // Which manager actually owns the live session, captured at the moment
    // it was started. Deliberately NOT re-derived from the process's current
    // `runElevated` config on every call: if the user flips that setting
    // while the process is still running from before the change, stop/write/
    // resize must keep targeting whichever manager actually has the session,
    // not whichever the (now different) config says to use.
    usingElevated: false,
  };
}

function ensureRuntime(id) {
  let rt = runtime.get(id);
  if (!rt) {
    rt = defaultRuntime();
    runtime.set(id, rt);
  }
  return rt;
}

function pickManager(rt) {
  return rt && rt.usingElevated ? elevatedTerminalManager : terminalManager;
}

function ensureStats(id) {
  const state = configManager.getState();
  if (!state.stats[id]) {
    state.stats[id] = { totalRuntimeMs: 0, startCount: 0, crashCount: 0, lastExitCode: null };
  }
  return state.stats[id];
}

function findConfig(id) {
  return configManager.getState().processes.find((p) => p.id === id) || null;
}

function toItem(proc) {
  const rt = ensureRuntime(proc.id);
  const stats = ensureStats(proc.id);
  return {
    ...proc,
    status: rt.status,
    pid: rt.pid,
    startedAt: rt.startedAt,
    totalRuntimeMs: stats.totalRuntimeMs,
    startCount: stats.startCount,
    crashCount: stats.crashCount,
    lastExitCode: stats.lastExitCode,
    autoRestartSuppressed: rt.autoRestartSuppressed,
  };
}

function list() {
  return configManager.getState().processes.map(toItem);
}

// Kept on disk so the watchdog helper (a separate process) can find and
// force-kill any still-running child trees if this app disappears without
// going through the normal shutdown path.
function writePidFile() {
  if (!pidFilePath) return;
  const entries = [];
  for (const [id, rt] of runtime.entries()) {
    if (rt.pid) entries.push({ id, pid: rt.pid });
  }
  try {
    fs.writeFileSync(pidFilePath, JSON.stringify(entries), 'utf8');
  } catch (err) {
    console.error('[processManager] failed to write pid file', err);
  }
}

function broadcastList() {
  const payload = list();
  for (const win of getWindows()) {
    if (!win.isDestroyed()) win.webContents.send('processes:changed', payload);
  }
  writePidFile();
}

function broadcastData(id, data) {
  for (const win of getWindows()) {
    if (!win.isDestroyed()) win.webContents.send('terminal:data', { id, data });
  }
}

function broadcastToast(kind, title, body) {
  for (const win of getWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app:toast', { kind, title, body, at: Date.now() });
  }
}

function notifyOS(title, body) {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({ title, body, icon: iconPath || undefined, silent: false });
    n.show();
  } catch (err) {
    console.error('[processManager] notification failed', err);
  }
}

function init({ windowsProvider, appIconPath, pidFile }) {
  getWindows = windowsProvider;
  iconPath = appIconPath;
  pidFilePath = pidFile || null;
  logger.init(configManager.paths().logsDir);
}

function add(partial) {
  const name = (partial.name || '').trim();
  const script = (partial.script || '').trim();
  if (!name) throw new Error('Name is required');
  if (!script) throw new Error('Batch file path is required');

  const proc = {
    id: randomUUID(),
    name,
    script,
    workingDirectory: (partial.workingDirectory || '').trim(),
    autoStart: !!partial.autoStart,
    restartOnCrash: !!partial.restartOnCrash,
    profileId: partial.profileId || null,
    color: partial.color || null,
    runElevated: !!partial.runElevated,
    createdAt: Date.now(),
  };

  const state = configManager.getState();
  state.processes.push(proc);
  ensureStats(proc.id);
  configManager.save();
  broadcastList();
  return toItem(proc);
}

const EDITABLE_FIELDS = ['name', 'script', 'workingDirectory', 'autoStart', 'restartOnCrash', 'profileId', 'color', 'runElevated'];

function update(id, patch) {
  const proc = findConfig(id);
  if (!proc) throw new Error('Process not found');
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      proc[field] = patch[field];
    }
  }
  configManager.save();
  broadcastList();
  return toItem(proc);
}

// Stops the process gracefully (Ctrl+C -> confirm -> force-kill fallback,
// same machinery as a manual Stop) and only deletes its config/stats once it
// has actually exited, so removing a process never leaves it running headless.
async function remove(id) {
  const rt = ensureRuntime(id);
  if (rt.restartTimer) {
    clearTimeout(rt.restartTimer);
    rt.restartTimer = null;
  }
  rt.restartPending = false; // don't let an in-flight restart resurrect this

  if (pickManager(rt).isAlive(id)) {
    await new Promise((resolve) => {
      pendingRemovals.set(id, resolve);
      stop(id);
      // Safety net: terminalManager's own force-kill fallback already fires
      // by ~4s, but if that somehow doesn't resolve the exit event, don't
      // leave the UI hanging on a remove forever.
      setTimeout(() => {
        if (pendingRemovals.has(id)) {
          pendingRemovals.delete(id);
          resolve();
        }
      }, REMOVE_STOP_TIMEOUT_MS);
    });
  }

  runtime.delete(id);
  const state = configManager.getState();
  state.processes = state.processes.filter((p) => p.id !== id);
  delete state.stats[id];
  configManager.save();
  logger.close(id);
  broadcastList();
}

async function start(id) {
  const proc = findConfig(id);
  if (!proc) return;
  const rt = ensureRuntime(id);
  if (rt.status === 'running' || rt.status === 'starting' || terminalManager.isAlive(id) || elevatedTerminalManager.isAlive(id)) return;

  rt.stopRequested = false;
  rt.autoRestartSuppressed = false;
  rt.crashTimestamps = [];
  // Captured now, not read fresh on every later call - see the comment on
  // defaultRuntime()'s usingElevated field for why.
  rt.usingElevated = !!proc.runElevated;
  rt.status = 'starting';
  broadcastList();

  const manager = pickManager(rt);

  try {
    const pid = await manager.spawn(
      id,
      { script: proc.script, workingDirectory: proc.workingDirectory },
      {
        onData: (data) => {
          logger.append(id, data);
          broadcastData(id, data);
        },
        onExit: (exitCode, signal) => handleExit(id, exitCode, signal),
      },
    );

    // Elevated spawns can sit waiting on a UAC prompt for a while; a stop
    // requested during that wait can't reach anything yet (there's no live
    // session to signal until the runner connects), so it's silently
    // stranded until we check for it here, right as the session becomes
    // real. Tear it straight back down instead of leaving an unwanted
    // process running just because the prompt was eventually accepted.
    if (rt.stopRequested) {
      rt.pid = pid;
      rt.status = 'stopping';
      broadcastList();
      manager.stop(id);
      return;
    }

    rt.pid = pid;
    rt.status = 'running';
    rt.startedAt = Date.now();
    ensureStats(id).startCount += 1;
    logger.markEvent(id, `started (pid ${pid})`);
    configManager.save();
    broadcastList();
  } catch (err) {
    rt.status = 'crashed';
    rt.pid = null;
    broadcastList();
    broadcastToast('error', proc.name, `Failed to start: ${err.message}`);
  }
}

function stop(id) {
  const rt = ensureRuntime(id);
  if (rt.restartTimer) {
    clearTimeout(rt.restartTimer);
    rt.restartTimer = null;
  }
  const manager = pickManager(rt);
  if (!manager.isAlive(id)) {
    if (rt.status !== 'stopped') {
      rt.status = 'stopped';
      broadcastList();
    }
    return;
  }
  rt.stopRequested = true;
  rt.status = 'stopping';
  broadcastList();
  logger.markEvent(id, 'stop requested');
  manager.stop(id, () => {
    // Only elevatedTerminalManager ever actually calls this back - a normal
    // session's own force-kill fallback means it always resolves within a
    // few seconds on its own. An elevated process tree can't be force-killed
    // from this (non-elevated) side, so if the runner hasn't confirmed by
    // now there's nothing left to do but tell the user to go look.
    const proc = findConfig(id);
    broadcastToast(
      'warning',
      proc ? proc.name : id,
      'Still waiting for the elevated process to confirm it stopped — check Task Manager if this persists.',
    );
  });
}

function restart(id) {
  const rt = ensureRuntime(id);
  if (pickManager(rt).isAlive(id)) {
    rt.restartPending = true;
    stop(id);
  } else {
    start(id);
  }
}

function handleExit(id, exitCode) {
  const rt = ensureRuntime(id);
  const proc = findConfig(id);
  const stats = ensureStats(id);

  if (rt.startedAt) {
    stats.totalRuntimeMs += Date.now() - rt.startedAt;
  }
  stats.lastExitCode = exitCode;
  rt.pid = null;
  rt.startedAt = null;

  const pendingRemoval = pendingRemovals.get(id);
  if (pendingRemoval) {
    pendingRemovals.delete(id);
    pendingRemoval();
  }

  const wasStopRequested = rt.stopRequested;
  rt.stopRequested = false;

  if (wasStopRequested) {
    rt.status = 'stopped';
    logger.markEvent(id, `stopped (exit code ${exitCode})`);
    configManager.save();
    broadcastList();
    if (rt.restartPending) {
      rt.restartPending = false;
      start(id);
    }
    return;
  }

  rt.status = 'crashed';
  stats.crashCount += 1;
  logger.markEvent(id, `crashed (exit code ${exitCode})`);
  configManager.save();
  broadcastList();

  const label = proc ? proc.name : id;
  broadcastToast('error', label, `Process exited unexpectedly (code ${exitCode})`);
  notifyOS(`${label} crashed`, `Exited with code ${exitCode}`);

  if (!proc || !proc.restartOnCrash) return;

  const now = Date.now();
  rt.crashTimestamps = rt.crashTimestamps.filter((t) => now - t < CRASH_WINDOW_MS);
  rt.crashTimestamps.push(now);

  if (rt.crashTimestamps.length >= CRASH_SUPPRESS_THRESHOLD) {
    rt.autoRestartSuppressed = true;
    broadcastList();
    broadcastToast('warning', label, 'Crashed repeatedly — auto-restart disabled. Fix the issue and start it manually.');
    notifyOS(`${label}: auto-restart disabled`, 'Crashed too many times in a row');
    return;
  }

  const delay = 1500 * Math.min(rt.crashTimestamps.length, 4);
  rt.restartTimer = setTimeout(() => {
    rt.restartTimer = null;
    start(id);
  }, delay);
}

function matchesProfile(proc, profileId) {
  if (!profileId) return true;
  return proc.profileId === profileId;
}

function startAll(profileId) {
  const targets = configManager.getState().processes.filter((p) => matchesProfile(p, profileId));
  targets.forEach((proc, index) => {
    setTimeout(() => start(proc.id), index * AUTOSTART_STAGGER_MS);
  });
}

function stopAll(profileId) {
  const targets = configManager.getState().processes.filter((p) => matchesProfile(p, profileId));
  targets.forEach((proc) => stop(proc.id));
}

function autoStartConfigured() {
  const targets = configManager.getState().processes.filter((p) => p.autoStart);
  targets.forEach((proc, index) => {
    setTimeout(() => start(proc.id), index * AUTOSTART_STAGGER_MS);
  });
}

function shutdownAll() {
  for (const id of Array.from(runtime.keys())) {
    const rt = runtime.get(id);
    if (rt.restartTimer) clearTimeout(rt.restartTimer);
  }
  return Promise.all([terminalManager.disposeAll(), elevatedTerminalManager.disposeAll()]);
}

// --- Terminal I/O passthroughs -------------------------------------------
// ipc.cjs routes terminal:write/resize/get-scrollback through these instead
// of calling either terminal manager directly, since only this module tracks
// which one actually owns a given session's runtime state.

function writeTerminal(id, data) {
  pickManager(runtime.get(id)).write(id, data);
}

function resizeTerminal(id, cols, rows) {
  pickManager(runtime.get(id)).resize(id, cols, rows);
}

function getTerminalScrollback(id) {
  return pickManager(runtime.get(id)).getScrollback(id);
}

// --- Profiles -----------------------------------------------------------

function listProfiles() {
  return configManager.getState().profiles;
}

function addProfile(name) {
  const profile = { id: randomUUID(), name: (name || 'New Profile').trim(), createdAt: Date.now() };
  configManager.getState().profiles.push(profile);
  configManager.save();
  return profile;
}

function updateProfile(id, patch) {
  const profile = configManager.getState().profiles.find((p) => p.id === id);
  if (!profile) throw new Error('Profile not found');
  if (typeof patch.name === 'string') profile.name = patch.name.trim();
  configManager.save();
  return profile;
}

function removeProfile(id) {
  const state = configManager.getState();
  state.profiles = state.profiles.filter((p) => p.id !== id);
  state.processes.forEach((p) => {
    if (p.profileId === id) p.profileId = null;
  });
  configManager.save();
  broadcastList();
}

module.exports = {
  init,
  list,
  add,
  update,
  remove,
  start,
  stop,
  restart,
  startAll,
  stopAll,
  autoStartConfigured,
  shutdownAll,
  writeTerminal,
  resizeTerminal,
  getTerminalScrollback,
  listProfiles,
  addProfile,
  updateProfile,
  removeProfile,
};
