import type { ToastKind, ToastMessage } from '../types'
import { cn } from '@/lib/utils'

const BORDER_COLOR: Record<ToastKind, string> = {
  error: 'border-l-status-crashed',
  warning: 'border-l-status-starting',
  success: 'border-l-status-running',
  info: 'border-l-primary',
}

export function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  if (!toasts.length) return null
  return (
    <div className="fixed right-4 bottom-4 z-100 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-in slide-in-from-right-3 fade-in rounded-lg border border-l-4 border-border bg-popover px-3 py-2.5 shadow-lg duration-200',
            BORDER_COLOR[t.kind],
          )}
        >
          <div className="text-[12.5px] font-semibold">{t.title}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t.body}</div>
        </div>
      ))}
    </div>
  )
}
