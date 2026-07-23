import { useState } from 'react'
import { Check, FileCode, FolderOpen } from 'lucide-react'
import type { ProcessDraft, ProcessItem, Profile } from '../types'
import { ACCENT_PALETTE } from '../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx > -1 ? p.slice(0, idx) : ''
}

const EMPTY_DRAFT: ProcessDraft = {
  name: '',
  script: '',
  workingDirectory: '',
  autoStart: false,
  restartOnCrash: true,
  profileId: null,
  color: ACCENT_PALETTE[0],
}

export function AddProcessModal({
  editing,
  initialScript,
  profiles,
  onClose,
  onSubmit,
}: {
  editing: ProcessItem | null
  initialScript?: string | null
  profiles: Profile[]
  onClose: () => void
  onSubmit: (draft: ProcessDraft, editingId: string | null) => Promise<void>
}) {
  // Mounted only while open (see App.tsx), so a fresh instance is created
  // each time — the lazy initializer below is all the "reset" this needs.
  const [draft, setDraft] = useState<ProcessDraft>(() => {
    if (editing) {
      return {
        name: editing.name,
        script: editing.script,
        workingDirectory: editing.workingDirectory,
        autoStart: editing.autoStart,
        restartOnCrash: editing.restartOnCrash,
        profileId: editing.profileId,
        color: editing.color ?? ACCENT_PALETTE[0],
      }
    }
    if (initialScript) {
      return {
        ...EMPTY_DRAFT,
        script: initialScript,
        workingDirectory: dirnameOf(initialScript),
        name: initialScript.split(/[\\/]/).pop()!.replace(/\.(bat|cmd)$/i, ''),
      }
    }
    return EMPTY_DRAFT
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ProcessDraft>(key: K, value: ProcessDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleBrowseScript() {
    const picked = await window.api.pickBatchFile()
    if (!picked) return
    setDraft((d) => ({
      ...d,
      script: picked,
      workingDirectory: d.workingDirectory || dirnameOf(picked),
      name: d.name || picked.split(/[\\/]/).pop()!.replace(/\.(bat|cmd)$/i, ''),
    }))
  }

  async function handleBrowseDir() {
    const picked = await window.api.pickDirectory(draft.workingDirectory || dirnameOf(draft.script))
    if (picked) set('workingDirectory', picked)
  }

  async function handleSubmit() {
    if (!draft.name.trim()) return setError('Name is required.')
    if (!draft.script.trim()) return setError('A batch file path is required.')
    setError(null)
    setSaving(true)
    try {
      await onSubmit(draft, editing?.id ?? null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-80px)] overflow-y-auto p-0 sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Process' : 'Add Process'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proc-name">Name</Label>
            <Input
              id="proc-name"
              placeholder="Laravel Queue Worker"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proc-script">Batch file</Label>
            <div className="flex gap-1.5">
              <Input
                id="proc-script"
                placeholder="Browse, or drop a .bat / .cmd file onto the window"
                value={draft.script}
                readOnly
                onClick={handleBrowseScript}
                title="Click Browse, or drop a .bat / .cmd file onto the window"
                className="cursor-pointer bg-muted/40 caret-transparent"
              />
              <Button variant="outline" onClick={handleBrowseScript} type="button" className="shrink-0">
                <FileCode /> Browse
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proc-dir">Working directory</Label>
            <div className="flex gap-1.5">
              <Input
                id="proc-dir"
                placeholder={dirnameOf(draft.script) || 'C:\\Projects\\App'}
                value={draft.workingDirectory}
                onChange={(e) => set('workingDirectory', e.target.value)}
              />
              <Button variant="outline" onClick={handleBrowseDir} type="button" className="shrink-0">
                <FolderOpen /> Browse
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Profile</Label>
            <Select value={draft.profileId ?? '__none__'} onValueChange={(v) => set('profileId', v === '__none__' ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No profile</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Accent color</Label>
            <div className="flex gap-2.5">
              {ACCENT_PALETTE.map((c) => {
                const selected = draft.color === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    aria-label={`Accent color ${c}`}
                    aria-pressed={selected}
                    className={cn(
                      'relative flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-white/10 transition-shadow',
                      selected
                        ? 'ring-2 ring-offset-2 ring-offset-popover ring-foreground'
                        : 'hover:ring-2 hover:ring-offset-2 hover:ring-offset-popover hover:ring-white/30',
                    )}
                    style={{ background: c }}
                  >
                    {selected && <Check className="size-4 text-white drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.6)]" strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12.5px]">
            <Checkbox checked={draft.autoStart} onCheckedChange={(v) => set('autoStart', v === true)} />
            Start automatically when the app launches
          </label>

          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={draft.restartOnCrash} onCheckedChange={(v) => set('restartOnCrash', v === true)} />
              Restart automatically if it crashes
            </label>
            <div className="pl-6 text-[11px] text-muted-foreground">
              Auto-restart pauses itself after 5 crashes within a minute.
            </div>
          </div>

          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} type="button">
            {editing ? 'Save Changes' : 'Add Process'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
