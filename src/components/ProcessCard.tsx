import { Play, Square, RotateCcw, Terminal, Trash2, Pencil, ShieldAlert } from 'lucide-react'
import type { ProcessItem, ProcessStatus } from '../types'
import { formatTotalRuntime, useUptime } from '../hooks/useUptime'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<ProcessStatus, string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  crashed: 'Crashed',
}

const STATUS_DOT: Record<ProcessStatus, string> = {
  running: 'bg-status-running',
  starting: 'bg-status-starting animate-pulse',
  stopping: 'bg-status-stopping animate-pulse',
  stopped: 'bg-status-stopped',
  crashed: 'bg-status-crashed',
}

export function ProcessCard({
  process: proc,
  selected,
  onOpen,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onEdit,
}: {
  process: ProcessItem
  selected: boolean
  onOpen: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onRemove: () => void
  onEdit: () => void
}) {
  const isLive = proc.status === 'running' || proc.status === 'stopping'
  const uptime = useUptime(proc.startedAt, isLive)
  const busy = proc.status === 'starting' || proc.status === 'stopping'
  const canStart = proc.status === 'stopped' || proc.status === 'crashed'

  return (
    <Card
      onClick={onOpen}
      role="button"
      tabIndex={0}
      className={cn(
        'group cursor-pointer gap-0 border-l-4 py-3 transition-colors hover:bg-accent/60',
        selected && 'bg-accent/50 ring-1 ring-primary/40',
      )}
      style={{ borderLeftColor: proc.color ?? 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2 px-4">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{proc.name}</div>
          <div className="truncate font-mono text-[10.5px] text-muted-foreground">{proc.script}</div>
        </div>
        <Badge variant={proc.status} className="shrink-0">
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[proc.status])} />
          {STATUS_LABEL[proc.status]}
        </Badge>
      </div>

      <div className="mt-2.5 flex items-center gap-2 px-4 font-mono text-[11px] text-muted-foreground">
        <span>PID {proc.pid ?? '—'}</span>
        <span className="text-border">·</span>
        <span>Up {uptime ?? '00:00:00'}</span>
        <span className="text-border">·</span>
        <span title="Total accumulated runtime">Total {formatTotalRuntime(proc.totalRuntimeMs)}</span>
      </div>

      {(proc.autoStart || proc.restartOnCrash || proc.runElevated || proc.autoRestartSuppressed || proc.crashCount > 0) && (
        <div className="mt-2 flex flex-wrap gap-1 px-4">
          {proc.runElevated && (
            <Badge
              variant="outline"
              className="border-status-starting/40 bg-status-starting/10 text-status-starting normal-case"
              title="Prompts for UAC every time this process starts"
            >
              <ShieldAlert className="size-3" />
              Elevated
            </Badge>
          )}
          {proc.autoStart && (
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 normal-case">
              Auto-start
            </Badge>
          )}
          {proc.restartOnCrash && (
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 normal-case">
              Auto-restart
            </Badge>
          )}
          {proc.autoRestartSuppressed && (
            <Badge variant="destructive" className="normal-case">
              Restart disabled
            </Badge>
          )}
          {proc.crashCount > 0 && (
            <Badge variant="outline" className="normal-case">
              {proc.crashCount} crash{proc.crashCount === 1 ? '' : 'es'}
            </Badge>
          )}
        </div>
      )}

      <div
        className="mt-3 flex gap-1.5 px-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[:focus-visible]:opacity-100 data-[selected=true]:opacity-100"
        data-selected={selected}
        onClick={(e) => e.stopPropagation()}
      >
        {canStart ? (
          <Button size="sm" variant="secondary" className="flex-1 text-status-running hover:text-status-running" onClick={onStart}>
            <Play /> Start
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="flex-1 hover:text-status-crashed" onClick={onStop} disabled={busy}>
            <Square /> Stop
          </Button>
        )}
        <Button size="icon-sm" variant="secondary" onClick={onRestart} disabled={proc.status === 'stopped'} title="Restart">
          <RotateCcw />
        </Button>
        <Button size="icon-sm" variant="secondary" onClick={onOpen} title="Open terminal">
          <Terminal />
        </Button>
        <Button size="icon-sm" variant="secondary" onClick={onEdit} title="Edit">
          <Pencil />
        </Button>
        <Button size="icon-sm" variant="secondary" className="hover:bg-destructive/15 hover:text-destructive" onClick={onRemove} title="Remove">
          <Trash2 />
        </Button>
      </div>
    </Card>
  )
}
