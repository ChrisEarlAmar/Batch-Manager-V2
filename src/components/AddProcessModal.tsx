import { useState } from 'react'
import type { ProcessDraft, ProcessItem, Profile } from '../types'
import { ACCENT_PALETTE } from '../types'
import { IconFile, IconFolder } from './icons'

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
  profiles,
  onClose,
  onSubmit,
}: {
  editing: ProcessItem | null
  profiles: Profile[]
  onClose: () => void
  onSubmit: (draft: ProcessDraft, editingId: string | null) => Promise<void>
}) {
  // Mounted only while open (see App.tsx), so a fresh instance is created
  // each time — the lazy initializer below is all the "reset" this needs.
  const [draft, setDraft] = useState<ProcessDraft>(() =>
    editing
      ? {
          name: editing.name,
          script: editing.script,
          workingDirectory: editing.workingDirectory,
          autoStart: editing.autoStart,
          restartOnCrash: editing.restartOnCrash,
          profileId: editing.profileId,
          color: editing.color ?? ACCENT_PALETTE[0],
        }
      : EMPTY_DRAFT,
  )
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editing ? 'Edit Process' : 'Add Process'}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              placeholder="Laravel Queue Worker"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label>Batch file</label>
            <div className="input-with-btn">
              <input
                className="input"
                placeholder="C:\Projects\App\queue-worker.bat"
                value={draft.script}
                onChange={(e) => set('script', e.target.value)}
              />
              <button className="btn" onClick={handleBrowseScript} type="button">
                <IconFile /> Browse
              </button>
            </div>
          </div>

          <div className="field">
            <label>Working directory</label>
            <div className="input-with-btn">
              <input
                className="input"
                placeholder={dirnameOf(draft.script) || 'C:\\Projects\\App'}
                value={draft.workingDirectory}
                onChange={(e) => set('workingDirectory', e.target.value)}
              />
              <button className="btn" onClick={handleBrowseDir} type="button">
                <IconFolder /> Browse
              </button>
            </div>
          </div>

          <div className="field">
            <label>Profile</label>
            <select
              className="input"
              value={draft.profileId ?? ''}
              onChange={(e) => set('profileId', e.target.value || null)}
            >
              <option value="">No profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Accent color</label>
            <div className="color-swatches">
              {ACCENT_PALETTE.map((c) => (
                <div
                  key={c}
                  className={`color-swatch${draft.color === c ? ' selected' : ''}`}
                  style={{ background: c, color: c }}
                  onClick={() => set('color', c)}
                />
              ))}
            </div>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={draft.autoStart} onChange={(e) => set('autoStart', e.target.checked)} />
            Start automatically when the app launches
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.restartOnCrash}
              onChange={(e) => set('restartOnCrash', e.target.checked)}
            />
            Restart automatically if it crashes
          </label>
          <div className="checkbox-hint">Auto-restart pauses itself after 5 crashes within a minute.</div>

          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={saving} type="button">
            {editing ? 'Save Changes' : 'Add Process'}
          </button>
        </div>
      </div>
    </div>
  )
}
