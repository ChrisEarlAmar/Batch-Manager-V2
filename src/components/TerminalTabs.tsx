import { ShieldAlert, X } from 'lucide-react'
import type { ProcessItem, ProcessStatus } from '../types'
import { cn } from '@/lib/utils'

const DOT_COLOR: Record<ProcessStatus, string> = {
  running: 'bg-status-running',
  starting: 'bg-status-starting',
  stopping: 'bg-status-stopping',
  stopped: 'bg-status-stopped',
  crashed: 'bg-status-crashed',
}

export function TerminalTabs({
  processes,
  openIds,
  activeId,
  onSelect,
  onClose,
}: {
  processes: ProcessItem[]
  openIds: string[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <div className="flex flex-1 items-stretch overflow-x-auto overflow-y-hidden">
      {openIds.map((id) => {
        const proc = processes.find((p) => p.id === id)
        if (!proc) return null
        const active = activeId === id
        return (
          <div
            key={id}
            onClick={() => onSelect(id)}
            className={cn(
              'relative flex max-w-[200px] cursor-pointer items-center gap-2 border-r border-border px-3 text-xs whitespace-nowrap text-muted-foreground',
              active && 'bg-background text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-primary',
            )}
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', DOT_COLOR[proc.status])} />
            <span className="truncate">{proc.name}</span>
            {proc.runElevated && (
              <span title="Runs elevated (UAC)" className="shrink-0">
                <ShieldAlert className="size-3 text-status-starting" />
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation()
                onClose(id)
              }}
              title="Close tab (process keeps running)"
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-2.5" />
            </span>
          </div>
        )
      })}
    </div>
  )
}
