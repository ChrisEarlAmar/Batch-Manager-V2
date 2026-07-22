'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } = require('electron');

const configManager = require('./configManager.cjs');
const processManager = require('./processManager.cjs');
const logger = require('./logger.cjs');
const ipc = require('./ipc.cjs');
const { checkIsAdmin } = require('./adminCheck.cjs');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5327';

// Lets a Chromium DevTools client attach from outside the app in dev builds
// (e.g. `chrome://inspect` or navigating to http://localhost:9223/json).
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223');
}
const ICON_PNG = path.join(__dirname, '..', '..', 'public', 'app-icon.png');
const ICON_ICO = path.join(__dirname, '..', '..', 'build', 'icon.ico');
const WATCHDOG_SCRIPT = path.join(__dirname, 'watchdog.cjs');

let mainWindow = null;
let tray = null;
let isAdmin = false;
let quitting = false;

function getMainWindow() {
  return mainWindow;
}

function getAppInfo() {
  return {
    isAdmin,
    version: app.getVersion(),
    platform: process.platform,
  };
}

// Ctrl+Shift+I/J/C, F12, Ctrl+R, F5, Ctrl+Shift+R, Ctrl+U — all the usual
// browser DevTools/reload/view-source shortcuts. Left alone in dev so we can
// still debug the app; blocked in packaged builds since this is meant to
// present as a plain desktop app, not something end users can pop the
// Chromium inspector open on.
function isBlockedShortcut(input) {
  const key = (input.key || '').toLowerCase();
  if (key === 'f12') return true;
  if (key === 'f5') return true;
  if (input.control && !input.alt && (key === 'i' || key === 'j' || key === 'c') && input.shift) return true;
  if (input.control && !input.alt && key === 'r') return true;
  if (input.control && !input.alt && key === 'u') return true;
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 600,
    show: false,
    backgroundColor: '#0c0e14',
    frame: false,
    icon: nativeImage.createFromPath(process.platform === 'win32' ? ICON_ICO : ICON_PNG),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'api.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (quitting) return; // already confirmed via confirmAndQuit(); let it actually close
    event.preventDefault();
    const settings = configManager.getState().settings;
    if (settings.minimizeToTray) {
      mainWindow.hide();
      return;
    }
    confirmAndQuit();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-changed', false));

  // Links rendered by xterm's web-links addon should open in the user's
  // actual browser, not spawn a bare Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (isBlockedShortcut(input)) event.preventDefault();
    });
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

async function confirmAndQuit() {
  if (quitting) return;
  const running = processManager.list().filter((p) => p.status === 'running' || p.status === 'starting').length;
  const detail = running > 0 ? `${running} process${running === 1 ? '' : 'es'} will be stopped.` : 'No processes are currently running.';

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Quit Process Manager?',
    message: 'Quit Process Manager?',
    detail,
  });

  if (result.response === 1) {
    quitting = true;
    app.quit();
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(ICON_PNG).resize({ width: 32, height: 32 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Process Manager');

  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Dashboard',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      { label: 'Start All', click: () => processManager.startAll(null) },
      { label: 'Stop All', click: () => processManager.stopAll(null) },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => confirmAndQuit(),
      },
    ]);
    tray.setContextMenu(menu);
  };

  rebuildMenu();
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
}

function spawnWatchdog(pidFilePath) {
  try {
    const child = spawn(process.execPath, [WATCHDOG_SCRIPT, String(process.pid), pidFilePath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    child.unref();
  } catch (err) {
    console.error('[main] failed to spawn zombie-cleanup watchdog', err);
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.citihardware.processmanager');
  }

  // We rely entirely on the custom titlebar for window controls and never
  // show a native menu bar, so the default one (with its own Ctrl+R/F12/etc
  // accelerators) would only be a way to bypass the shortcut lockdown below.
  Menu.setApplicationMenu(null);

  isAdmin = checkIsAdmin();

  configManager.init();
  const pidFilePath = path.join(configManager.paths().userDataDir, 'running-pids.json');
  processManager.init({
    windowsProvider: () => BrowserWindow.getAllWindows(),
    appIconPath: ICON_PNG,
    pidFile: pidFilePath,
  });
  spawnWatchdog(pidFilePath);

  ipc.register({ getMainWindow, getAppInfo });

  createWindow();
  createTray();

  processManager.autoStartConfigured();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // The 'close' handler above intercepts the window closing (hide-to-tray)
  // whenever that setting is on, so reaching here means the user actually
  // wants to exit (tray Quit, or minimizeToTray disabled).
  if (process.platform !== 'darwin') app.quit();
});

let shuttingDown = false;
app.on('before-quit', async (event) => {
  quitting = true;
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  try {
    await processManager.shutdownAll();
  } catch (err) {
    console.error('[main] error during shutdown', err);
  }
  configManager.flush();
  logger.closeAll();
  app.exit(0);
});
