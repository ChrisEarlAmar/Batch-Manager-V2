import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, ShieldCheck } from 'lucide-react'
import type { AppInfo } from '../types'
import appIconUrl from '../assets/app-icon.png'
import { cn } from '@/lib/utils'

export function TitleBar({ appInfo }: { appInfo: AppInfo | null }) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.isWindowMaximized().then(setIsMaximized)
    return window.api.onWindowMaximizedChanged(setIsMaximized)
  }, [])

  return (
    <div className="titlebar-drag flex h-10 shrink-0 items-center gap-2.5 border-b border-border bg-card pr-2 pl-3.5">
      <div
        className="flex items-center gap-2 text-[13px] font-semibold tracking-tight"
        title={appInfo ? `Signed in as ${appInfo.currentUser ?? 'unknown'}\nData folder: ${appInfo.userDataPath}` : undefined}
      >
        <img src={appIconUrl} alt="" className="size-[18px] rounded-md" />
        <span>Process Manager</span>
      </div>

      {appInfo?.isAdmin && (
        <div
          className={cn(
            'titlebar-no-drag flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase',
            appInfo.isDifferentUser
              ? 'border-status-starting/40 bg-status-starting/10 text-status-starting'
              : 'border-primary/30 bg-primary/10 text-primary',
          )}
          title={
            appInfo.isDifferentUser
              ? `Elevated as ${appInfo.currentUser} — different from your logged-in account (${appInfo.consoleUser}). Data is stored under ${appInfo.currentUser}'s profile, not yours.`
              : 'Running with administrator privileges'
          }
        >
          <ShieldCheck className="size-3" />
          {appInfo.isDifferentUser ? 'Different Account' : 'Administrator'}
        </div>
      )}

      <div className="flex-1" />

      <div className="titlebar-no-drag flex h-full items-center">
        <button
          className="flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
          onClick={() => window.api.minimizeWindow()}
          aria-label="Minimize"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          className="flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-white/6 hover:text-foreground"
          onClick={() => window.api.toggleMaximizeWindow()}
          aria-label="Maximize"
        >
          {isMaximized ? <Copy className="size-3.5" /> : <Square className="size-3" />}
        </button>
        <button
          className={cn(
            'flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors',
            'hover:bg-destructive hover:text-destructive-foreground',
          )}
          onClick={() => window.api.closeWindow()}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
