import { useState } from 'react'
import { Play, Square, Plus, Layers, Pencil, Trash2 } from 'lucide-react'
import type { ProcessItem, Profile } from '../types'
import { ProcessCard } from './ProcessCard'
import { RenameProfileDialog } from './RenameProfileDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

// Radix's ContextMenu and Dialog each independently lock/restore
// `document.body.style.pointerEvents` while open. Opening a Dialog directly
// from a ContextMenuItem's onSelect races the two: the Dialog mounts while
// the menu is still mid-close, captures "pointer-events: none" as its
// baseline to restore to, and leaves the whole page unclickable once it
// closes. Deferring to the next tick lets the menu fully unmount first.
function openAfterMenuCloses(fn: () => void) {
  setTimeout(fn, 0)
}

export function Sidebar({
  processes,
  profiles,
  activeProfileId,
  selectedId,
  onChangeProfile,
  onAddProfile,
  onRenameProfile,
  onDeleteProfile,
  onOpenAddProcess,
  onOpenTerminal,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onEdit,
  onStartAll,
  onStopAll,
}: {
  processes: ProcessItem[]
  profiles: Profile[]
  activeProfileId: string | null
  selectedId: string | null
  onChangeProfile: (id: string | null) => void
  onAddProfile: (name: string) => void
  onRenameProfile: (id: string, name: string) => Promise<void>
  onDeleteProfile: (id: string) => Promise<void>
  onOpenAddProcess: () => void
  onOpenTerminal: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
  onRemove: (proc: ProcessItem) => void
  onEdit: (proc: ProcessItem) => void
  onStartAll: (profileId: string | null) => void
  onStopAll: (profileId: string | null) => void
}) {
  const [addingProfile, setAddingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [renameTarget, setRenameTarget] = useState<Profile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

  const visible = processes.filter((p) => !activeProfileId || p.profileId === activeProfileId)
  const runningCount = processes.filter((p) => p.status === 'running').length

  function submitProfile() {
    const name = profileName.trim()
    if (name) onAddProfile(name)
    setProfileName('')
    setAddingProfile(false)
  }

  const chipClass = (active: boolean) =>
    cn(
      'rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
      active
        ? 'border-primary/45 bg-primary/12 text-foreground'
        : 'border-border bg-card text-muted-foreground hover:border-input hover:text-foreground',
    )

  const assignedCount = deleteTarget ? processes.filter((p) => p.profileId === deleteTarget.id).length : 0
  const runningAssignedCount = deleteTarget
    ? processes.filter((p) => p.profileId === deleteTarget.id && (p.status === 'running' || p.status === 'starting')).length
    : 0

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-2.5 p-3.5 pb-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Processes</span>
          <Button size="icon-sm" variant="secondary" onClick={onOpenAddProcess} title="Add process">
            <Plus />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => onChangeProfile(null)} className={chipClass(activeProfileId === null)}>
            All
          </button>

          {profiles.map((p) => (
            <ContextMenu key={p.id}>
              <ContextMenuTrigger asChild>
                <button onClick={() => onChangeProfile(p.id)} className={chipClass(activeProfileId === p.id)}>
                  {p.name}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => openAfterMenuCloses(() => setRenameTarget(p))}>
                  <Pencil /> Rename
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => openAfterMenuCloses(() => setDeleteTarget(p))}>
                  <Trash2 /> Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}

          {addingProfile ? (
            <Input
              autoFocus
              className="h-6 w-28 px-2 text-xs"
              value={profileName}
              placeholder="Profile name"
              onChange={(e) => setProfileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitProfile()
                if (e.key === 'Escape') {
                  setAddingProfile(false)
                  setProfileName('')
                }
              }}
              onBlur={submitProfile}
            />
          ) : (
            <button
              onClick={() => setAddingProfile(true)}
              title="New profile"
              className="flex items-center rounded-full border border-border bg-card px-2 py-1 text-muted-foreground transition-colors hover:border-input hover:text-foreground"
            >
              <Plus className="size-2.5" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onStartAll(activeProfileId)}>
            <Play /> Start All
          </Button>
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onStopAll(activeProfileId)}>
            <Square /> Stop All
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 pt-1 pb-3">
        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
            <Layers className="size-7" />
            <p className="text-xs">No processes {activeProfileId ? 'in this profile' : 'configured'} yet. Add one to get started.</p>
          </div>
        )}
        {visible.map((proc) => (
          <ProcessCard
            key={proc.id}
            process={proc}
            selected={selectedId === proc.id}
            onOpen={() => onOpenTerminal(proc.id)}
            onStart={() => onStart(proc.id)}
            onStop={() => onStop(proc.id)}
            onRestart={() => onRestart(proc.id)}
            onRemove={() => onRemove(proc)}
            onEdit={() => onEdit(proc)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <span>
          {processes.length} process{processes.length === 1 ? '' : 'es'}
        </span>
        <span>{runningCount} running</span>
      </div>

      {renameTarget && (
        <RenameProfileDialog profile={renameTarget} onClose={() => setRenameTarget(null)} onSubmit={onRenameProfile} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete profile"
        message={
          assignedCount === 0
            ? `Delete profile "${deleteTarget?.name}"? No processes are assigned to it.`
            : `Delete profile "${deleteTarget?.name}"? ${assignedCount} process${assignedCount === 1 ? '' : 'es'} will be unassigned (moved to "All") but keep running exactly as ${assignedCount === 1 ? 'it is' : 'they are'}${runningAssignedCount > 0 ? ` — including ${runningAssignedCount} running right now` : ''}. Nothing gets stopped.`
        }
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (!deleteTarget) return
          await onDeleteProfile(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </aside>
  )
}
