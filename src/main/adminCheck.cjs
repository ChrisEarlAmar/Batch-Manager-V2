// One-shot check for the account/elevation context this process is running
// in. Child processes spawned from an elevated Electron app inherit that
// elevation automatically on Windows, so isAdmin is purely for surfacing
// status in the UI.
//
// UAC elevation ("Run as Administrator") on a user's own account reuses that
// same account's profile - app.getPath('userData') resolves identically
// either way, so config/logs/etc never move. The one case where elevation
// *does* genuinely point at a different profile is UAC prompting for a
// separate administrator account's credentials (common on managed/corporate
// machines where the interactive user isn't a local admin at all) - that's
// a real Windows account change, not an app bug, but it's worth surfacing
// clearly rather than leaving it to look like data mysteriously moved.
'use strict';

const { execFileSync } = require('child_process');

function getSessionInfo() {
  const currentUser =
    process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME || null;

  if (process.platform !== 'win32') {
    return { isAdmin: false, currentUser, consoleUser: null, isDifferentUser: false };
  }

  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$isAdmin = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); ' +
          '$consoleUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName; ' +
          'Write-Output "$isAdmin|$consoleUser"',
      ],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );

    const [isAdminRaw, consoleUserRaw] = out.trim().split('|');
    const isAdmin = isAdminRaw?.trim().toLowerCase() === 'true';
    const consoleUser = consoleUserRaw?.trim() || null;
    const isDifferentUser = Boolean(isAdmin && currentUser && consoleUser && currentUser.toLowerCase() !== consoleUser.toLowerCase());

    return { isAdmin, currentUser, consoleUser, isDifferentUser };
  } catch (err) {
    console.error('[adminCheck] failed to determine elevation/session status', err);
    return { isAdmin: false, currentUser, consoleUser: null, isDifferentUser: false };
  }
}

module.exports = { getSessionInfo };
