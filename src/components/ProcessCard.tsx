import type { CSSProperties } from 'react'
import type { ProcessItem } from '../types'
import { formatTotalRuntime, useUptime } from '../hooks/useUptime'
import { IconPlay, IconStop, IconRestart, IconTerminal, IconTrash, IconEdit } from './icons'

const STATUS_LABEL: Record<ProcessItem['status'], string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  crashed: 'Crashed',
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

  const style = proc.color ? ({ '--accent-swatch': proc.color } as CSSProperties) : undefined

  return (
    <div
      className={`process-card${selected ? ' selected' : ''}`}
      style={style}
      onClick={onOpen}
      role="button"
      tabIndex={0}
    >
      <div className="process-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="process-name">{proc.name}</div>
          <div className="process-script">{proc.script}</div>
        </div>
        <span className={`status-pill status-${proc.status}`}>
          <span className="status-dot" />
          {STATUS_LABEL[proc.status]}
        </span>
      </div>

      <div className="process-card-meta">
        <span>PID {proc.pid ?? '—'}</span>
        <span className="divider">·</span>
        <span>Up {uptime ?? '00:00:00'}</span>
        <span className="divider">·</span>
        <span title="Total accumulated runtime">Total {formatTotalRuntime(proc.totalRuntimeMs)}</span>
      </div>

      <div className="process-card-flags">
        {proc.autoStart && <span className="flag-chip on">Auto-start</span>}
        {proc.restartOnCrash && <span className="flag-chip on">Auto-restart</span>}
        {proc.autoRestartSuppressed && <span className="flag-chip warn">Restart disabled</span>}
        {proc.crashCount > 0 && <span className="flag-chip">{proc.crashCount} crash{proc.crashCount === 1 ? '' : 'es'}</span>}
      </div>

      <div className="process-card-actions" onClick={(e) => e.stopPropagation()}>
        {canStart ? (
          <button className="card-action-btn primary" onClick={onStart} title="Start">
            <IconPlay /> Start
          </button>
        ) : (
          <button className="card-action-btn stop" onClick={onStop} disabled={busy} title="Stop">
            <IconStop /> Stop
          </button>
        )}
        <button className="card-action-btn" onClick={onRestart} disabled={proc.status === 'stopped'} title="Restart">
          <IconRestart />
        </button>
        <button className="card-action-btn" onClick={onOpen} title="Open terminal">
          <IconTerminal />
        </button>
        <button className="card-action-btn" onClick={onEdit} title="Edit">
          <IconEdit />
        </button>
        <button className="card-action-btn danger" onClick={onRemove} title="Remove">
          <IconTrash />
        </button>
      </div>
    </div>
  )
}
