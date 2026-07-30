// All ipcMain wiring lives here so main.cjs stays focused on app/window
// lifecycle. Each handler is a thin adapter over processManager/configManager.
'use strict';

const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell } = require('electron');
const configManager = require('./configManager.cjs');
const processManager = require('./processManager.cjs');
const terminalManager = require('./terminalManager.cjs');
const logger = require('./logger.cjs');

function register({ getMainWindow, getAppInfo }) {
  ipcMain.handle('app:get-info', () => getAppInfo());

  ipcMain.handle('settings:get', () => configManager.getState().settings);

  ipcMain.handle('settings:update', (_e, patch) => {
    const state = configManager.getState();
    state.settings = { ...state.settings, ...patch };
    configManager.save();
    return state.settings;
  });

  ipcMain.handle('processes:list', () => processManager.list());

  ipcMain.handle('processes:add', (_e, partial) => processManager.add(partial));

  ipcMain.handle('processes:update', (_e, id, patch) => processManager.update(id, patch));

  ipcMain.handle('processes:remove', async (_e, id) => {
    await processManager.remove(id);
    return true;
  });

  ipcMain.handle('processes:start', (_e, id) => {
    processManager.start(id);
    return true;
  });

  ipcMain.handle('processes:stop', (_e, id) => {
    processManager.stop(id);
    return true;
  });

  ipcMain.handle('processes:restart', (_e, id) => {
    processManager.restart(id);
    return true;
  });

  ipcMain.handle('processes:start-all', (_e, profileId) => {
    processManager.startAll(profileId || null);
    return true;
  });

  ipcMain.handle('processes:stop-all', (_e, profileId) => {
    processManager.stopAll(profileId || null);
    return true;
  });

  ipcMain.handle('profiles:list', () => processManager.listProfiles());
  ipcMain.handle('profiles:add', (_e, name) => processManager.addProfile(name));
  ipcMain.handle('profiles:update', (_e, id, patch) => processManager.updateProfile(id, patch));
  ipcMain.handle('profiles:remove', (_e, id) => {
    processManager.removeProfile(id);
    return true;
  });

  ipcMain.handle('terminal:get-scrollback', (_e, id) => terminalManager.getScrollback(id));

  ipcMain.on('terminal:write', (_e, id, data) => terminalManager.write(id, data));

  ipcMain.on('terminal:resize', (_e, id, cols, rows) => terminalManager.resize(id, cols, rows));

  ipcMain.handle('terminal:open-log', async (event, id) => {
    const logPath = logger.getLogPath(id);
    if (!fs.existsSync(logPath)) {
      event.sender.send('app:toast', {
        kind: 'info',
        title: 'No log file yet',
        body: 'This process has not produced any output yet — start it first.',
        at: Date.now(),
      });
      return false;
    }
    const errorMessage = await shell.openPath(logPath);
    if (errorMessage) {
      event.sender.send('app:toast', {
        kind: 'error',
        title: 'Could not open log file',
        body: errorMessage,
        at: Date.now(),
      });
      return false;
    }
    return true;
  });

  // A remembered/suggested folder can stop resolving for reasons outside our
  // control - deleted, renamed, or (notably) a OneDrive-redirected folder
  // that an elevated session's filesystem view can't see even though the
  // non-elevated session that originally browsed there could. Handing
  // Explorer a defaultPath it can't resolve doesn't just fall back quietly;
  // it can land the dialog in a broken-looking "No items match your search"
  // state. Walking up to the nearest ancestor that does exist keeps the
  // starting point close and always valid.
  function nearestExistingDir(dir) {
    let current = dir;
    while (current) {
      if (fs.existsSync(current)) return current;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
    return null;
  }

  function safeDefaultPath(candidate) {
    if (!candidate) return undefined;
    return nearestExistingDir(candidate) || undefined;
  }

  function getLastBrowsedDirectory() {
    return safeDefaultPath(configManager.getState().settings.lastBrowsedDirectory);
  }

  function setLastBrowsedDirectory(dir) {
    const state = configManager.getState();
    state.settings.lastBrowsedDirectory = dir;
    configManager.save();
  }

  ipcMain.handle('dialog:pick-batch-file', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select a batch file',
      defaultPath: getLastBrowsedDirectory(),
      properties: ['openFile'],
      filters: [
        { name: 'Batch / Command scripts', extensions: ['bat', 'cmd'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    setLastBrowsedDirectory(path.dirname(result.filePaths[0]));
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:pick-directory', async (_e, defaultPath) => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Select working directory',
      defaultPath: safeDefaultPath(defaultPath) || getLastBrowsedDirectory(),
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    setLastBrowsedDirectory(result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.on('window:minimize', () => getMainWindow()?.minimize());
  ipcMain.on('window:toggle-maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => getMainWindow()?.close());

  ipcMain.handle('window:is-maximized', () => getMainWindow()?.isMaximized() ?? false);
}

module.exports = { register };
