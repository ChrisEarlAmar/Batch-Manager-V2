import { useState } from 'react'
import type { ProcessItem, Profile } from '../types'
import { ProcessCard } from './ProcessCard'
import { IconPlay, IconStop, IconPlus, IconLayers } from './icons'

export function Sidebar({
  processes,
  profiles,
  activeProfileId,
  selectedId,
  onChangeProfile,
  onAddProfile,
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

  const visible = processes.filter((p) => !activeProfileId || p.profileId === activeProfileId)
  const runningCount = processes.filter((p) => p.status === 'running').length

  function submitProfile() {
    const name = profileName.trim()
    if (name) onAddProfile(name)
    setProfileName('')
    setAddingProfile(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <span className="sidebar-title">Processes</span>
          <button className="icon-btn" onClick={onOpenAddProcess} title="Add process">
            <IconPlus />
          </button>
        </div>

        <div className="profile-bar">
          <span className={`profile-chip${activeProfileId === null ? ' active' : ''}`} onClick={() => onChangeProfile(null)}>
            All
          </span>
          {profiles.map((p) => (
            <span
              key={p.id}
              className={`profile-chip${activeProfileId === p.id ? ' active' : ''}`}
              onClick={() => onChangeProfile(p.id)}
            >
              {p.name}
            </span>
          ))}
          {addingProfile ? (
            <input
              autoFocus
              className="input"
              style={{ height: 24, width: 110, fontSize: 12, padding: '0 8px' }}
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
            <span className="profile-chip" onClick={() => setAddingProfile(true)} title="New profile">
              <IconPlus width={10} height={10} />
            </span>
          )}
        </div>

        <div className="profile-actions-row">
          <button className="btn" onClick={() => onStartAll(activeProfileId)}>
            <IconPlay /> Start All
          </button>
          <button className="btn" onClick={() => onStopAll(activeProfileId)}>
            <IconStop /> Stop All
          </button>
        </div>
      </div>

      <div className="sidebar-scroll">
        {visible.length === 0 && (
          <div className="empty-state" style={{ padding: '30px 12px' }}>
            <IconLayers width={28} height={28} />
            <p>No processes {activeProfileId ? 'in this profile' : 'configured'} yet. Add one to get started.</p>
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

      <div className="sidebar-footer">
        <span>{processes.length} process{processes.length === 1 ? '' : 'es'}</span>
        <span>{runningCount} running</span>
      </div>
    </aside>
  )
}
