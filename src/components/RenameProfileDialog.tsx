import { useState } from 'react'
import type { Profile } from '../types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RenameProfileDialog({
  profile,
  onClose,
  onSubmit,
}: {
  profile: Profile
  onClose: () => void
  onSubmit: (id: string, name: string) => Promise<void>
}) {
  // Mounted only while a target profile is set (see Sidebar.tsx), so this
  // only ever needs to initialize once per open.
  const [name, setName] = useState(profile.name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return setError('Name is required.')
    setError(null)
    setSaving(true)
    try {
      await onSubmit(profile.id, trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0 sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Rename Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 px-5 py-4">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} type="button">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
