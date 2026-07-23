// Runs in the sandboxed preload context. Exposes a narrow, typed surface
// on window.api instead of handing the renderer raw ipcRenderer access.
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function on(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  listProcesses: () => ipcRenderer.invoke('processes:list'),
  addProcess: (partial) => ipcRenderer.invoke('processes:add', partial),
  updateProcess: (id, patch) => ipcRenderer.invoke('processes:update', id, patch),
  removeProcess: (id) => ipcRenderer.invoke('processes:remove', id),
  startProcess: (id) => ipcRenderer.invoke('processes:start', id),
  stopProcess: (id) => ipcRenderer.invoke('processes:stop', id),
  restartProcess: (id) => ipcRenderer.invoke('processes:restart', id),
  startAll: (profileId) => ipcRenderer.invoke('processes:start-all', profileId),
  stopAll: (profileId) => ipcRenderer.invoke('processes:stop-all', profileId),

  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  addProfile: (name) => ipcRenderer.invoke('profiles:add', name),
  updateProfile: (id, patch) => ipcRenderer.invoke('profiles:update', id, patch),
  removeProfile: (id) => ipcRenderer.invoke('profiles:remove', id),

  getScrollback: (id) => ipcRenderer.invoke('terminal:get-scrollback', id),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  openLogFile: (id) => ipcRenderer.invoke('terminal:open-log', id),

  pickBatchFile: () => ipcRenderer.invoke('dialog:pick-batch-file'),
  pickDirectory: (defaultPath) => ipcRenderer.invoke('dialog:pick-directory', defaultPath),
  // File.path was removed in modern Electron; webUtils.getPathForFile is the
  // supported way to recover a real filesystem path from a drag-and-dropped File.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  onProcessesChanged: (callback) => on('processes:changed', callback),
  onTerminalData: (callback) => on('terminal:data', callback),
  onToast: (callback) => on('app:toast', callback),
  onWindowMaximizedChanged: (callback) => on('window:maximized-changed', callback),
});
