import type { ProcessItem, ProcessStatus } from '../types'
import { IconClose } from './icons'

const DOT_COLOR: Record<ProcessStatus, string> = {
  running: 'var(--status-running)',
  starting: 'var(--status-starting)',
  stopping: 'var(--status-stopping)',
  stopped: 'var(--status-stopped)',
  crashed: 'var(--status-crashed)',
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
    <div className="tab-strip">
      {openIds.map((id) => {
        const proc = processes.find((p) => p.id === id)
        if (!proc) return null
        return (
          <div key={id} className={`tab${activeId === id ? ' active' : ''}`} onClick={() => onSelect(id)}>
            <span className="status-dot" style={{ background: DOT_COLOR[proc.status] }} />
            <span className="tab-name">{proc.name}</span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onClose(id)
              }}
              title="Close tab (process keeps running)"
            >
              <IconClose width={10} height={10} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
