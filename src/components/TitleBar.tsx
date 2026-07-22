import { useEffect, useState } from 'react'
import type { AppInfo } from '../types'
import { IconMaximize, IconMinimize, IconRestore, IconShield, IconClose } from './icons'

export function TitleBar({ appInfo }: { appInfo: AppInfo | null }) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.isWindowMaximized().then(setIsMaximized)
    return window.api.onWindowMaximizedChanged(setIsMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <img src="/app-icon.png" alt="" />
        <span>Process Manager</span>
      </div>
      {appInfo?.isAdmin && (
        <div className="titlebar-badge" title="Running with administrator privileges">
          <IconShield width={11} height={11} />
          Administrator
        </div>
      )}
      <div className="titlebar-spacer" />
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={() => window.api.minimizeWindow()} aria-label="Minimize">
          <IconMinimize />
        </button>
        <button className="titlebar-btn" onClick={() => window.api.toggleMaximizeWindow()} aria-label="Maximize">
          {isMaximized ? <IconRestore /> : <IconMaximize />}
        </button>
        <button className="titlebar-btn close" onClick={() => window.api.closeWindow()} aria-label="Close">
          <IconClose width={13} height={13} />
        </button>
      </div>
    </div>
  )
}
