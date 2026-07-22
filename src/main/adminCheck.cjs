// One-shot check for whether this process is running elevated. Child
// processes spawned from an elevated Electron app inherit that elevation
// automatically on Windows, so this is purely for surfacing status in the UI.
'use strict';

const { execFileSync } = require('child_process');

function checkIsAdmin() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      ],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    return out.trim().toLowerCase() === 'true';
  } catch (err) {
    console.error('[adminCheck] failed to determine elevation status', err);
    return false;
  }
}

module.exports = { checkIsAdmin };
