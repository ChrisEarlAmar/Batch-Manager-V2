// Persists app configuration (processes, profiles, settings, stats) under
// app.getPath('userData') as a single JSON document. Writes are atomic
// (tmp file + rename) and debounced so rapid changes don't hammer disk.
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_VERSION = 1;
const SAVE_DEBOUNCE_MS = 300;

let userDataDir = null;
let configFile = null;
let logsDir = null;
let state = null;
let saveTimer = null;

function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    processes: [],
    profiles: [],
    stats: {},
    settings: {
      minimizeToTray: true,
      startMinimized: false,
      launchOnStartup: false,
    },
  };
}

function paths() {
  return { userDataDir, configFile, logsDir };
}

function init() {
  userDataDir = app.getPath('userData');
  configFile = path.join(userDataDir, 'config.json');
  logsDir = path.join(userDataDir, 'logs');

  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  if (fs.existsSync(configFile)) {
    try {
      const raw = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(raw);
      state = { ...defaultConfig(), ...parsed };
      state.processes = Array.isArray(parsed.processes) ? parsed.processes : [];
      state.profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      state.stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
      state.settings = { ...defaultConfig().settings, ...(parsed.settings || {}) };
    } catch (err) {
      console.error('[configManager] failed to parse config.json, backing up and resetting', err);
      try {
        fs.copyFileSync(configFile, configFile + `.corrupt-${Date.now()}.bak`);
      } catch (_) {
        /* ignore */
      }
      state = defaultConfig();
    }
  } else {
    state = defaultConfig();
  }

  return state;
}

function getState() {
  return state;
}

function writeNow() {
  if (!configFile) return;
  const tmpFile = configFile + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, configFile);
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeNow();
    } catch (err) {
      console.error('[configManager] failed to save config', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    writeNow();
  } catch (err) {
    console.error('[configManager] failed to flush config', err);
  }
}

module.exports = { init, getState, save, flush, paths, defaultConfig };
