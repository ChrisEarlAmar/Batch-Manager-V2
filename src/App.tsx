import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ProcessDraft, ProcessItem, Profile, ToastMessage } from './types'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalTabs } from './components/TerminalTabs'
import { TerminalView } from './components/TerminalView'
import { AddProcessModal } from './components/AddProcessModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ToastStack } from './components/ToastStack'
import { IconPlay, IconRestart, IconStop, IconTerminal } from './components/icons'

let toastSeq = 0

function App() {
  const [processes, setProcesses] = useState<ProcessItem[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProcess, setEditingProcess] = useState<ProcessItem | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<ProcessItem | null>(null)

  useEffect(() => {
    Promise.all([window.api.listProcesses(), window.api.listProfiles(), window.api.getAppInfo()]).then(
      ([procs, profs, info]) => {
        setProcesses(procs)
        setProfiles(profs)
        setAppInfo(info)
      },
    )

    const unsubProcesses = window.api.onProcessesChanged(setProcesses)
    const unsubToast = window.api.onToast((toast) => {
      const id = `t${++toastSeq}`
      setToasts((list) => [...list, { id, kind: (toast.kind as ToastMessage['kind']) || 'info', title: toast.title, body: toast.body, at: toast.at }])
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000)
    })

    return () => {
      unsubProcesses()
      unsubToast()
    }
  }, [])

  const openTerminal = useCallback((id: string) => {
    setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]))
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== id)
        if (activeTabId === id) {
          setActiveTabId(next.length ? next[next.length - 1] : null)
        }
        return next
      })
    },
    [activeTabId],
  )

  function refreshProfiles() {
    window.api.listProfiles().then(setProfiles)
  }

  async function handleAddProfile(name: string) {
    await window.api.addProfile(name)
    refreshProfiles()
  }

  async function handleModalSubmit(draft: ProcessDraft, editingId: string | null) {
    if (editingId) {
      await window.api.updateProcess(editingId, draft)
    } else {
      const created = await window.api.addProcess(draft)
      openTerminal(created.id)
    }
  }

  async function handleConfirmRemove() {
    if (!confirmRemove) return
    const id = confirmRemove.id
    await window.api.removeProcess(id)
    setOpenTabs((tabs) => tabs.filter((t) => t !== id))
    setActiveTabId((cur) => (cur === id ? null : cur))
    setConfirmRemove(null)
  }

  const activeProcess = processes.find((p) => p.id === activeTabId) ?? null

  return (
    <div className="app-shell">
      <TitleBar appInfo={appInfo} />

      <div className="app-body">
        <Sidebar
          processes={processes}
          profiles={profiles}
          activeProfileId={activeProfileId}
          selectedId={activeTabId}
          onChangeProfile={setActiveProfileId}
          onAddProfile={handleAddProfile}
          onOpenAddProcess={() => {
            setEditingProcess(null)
            setModalOpen(true)
          }}
          onOpenTerminal={openTerminal}
          onStart={(id) => window.api.startProcess(id)}
          onStop={(id) => window.api.stopProcess(id)}
          onRestart={(id) => window.api.restartProcess(id)}
          onRemove={(proc) => setConfirmRemove(proc)}
          onEdit={(proc) => {
            setEditingProcess(proc)
            setModalOpen(true)
          }}
          onStartAll={(profileId) => window.api.startAll(profileId)}
          onStopAll={(profileId) => window.api.stopAll(profileId)}
        />

        <main className="main-area">
          {openTabs.length > 0 && (
            <div className="tab-strip-row">
              <TerminalTabs
                processes={processes}
                openIds={openTabs}
                activeId={activeTabId}
                onSelect={setActiveTabId}
                onClose={closeTab}
              />
              {activeProcess && (
                <div className="tab-strip-actions">
                  {activeProcess.status === 'stopped' || activeProcess.status === 'crashed' ? (
                    <button className="btn ghost" title="Start" onClick={() => window.api.startProcess(activeProcess.id)}>
                      <IconPlay />
                    </button>
                  ) : (
                    <button
                      className="btn ghost"
                      title="Stop"
                      disabled={activeProcess.status === 'stopping'}
                      onClick={() => window.api.stopProcess(activeProcess.id)}
                    >
                      <IconStop />
                    </button>
                  )}
                  <button
                    className="btn ghost"
                    title="Restart"
                    disabled={activeProcess.status === 'stopped'}
                    onClick={() => window.api.restartProcess(activeProcess.id)}
                  >
                    <IconRestart />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="terminal-host">
            {openTabs.length === 0 && (
              <div className="empty-state">
                <IconTerminal width={40} height={40} />
                <h3>No terminal open</h3>
                <p>
                  Select a process from the sidebar and click its terminal icon (or the card itself) to view live
                  output here.
                </p>
              </div>
            )}
            {openTabs.map((id) => (
              <TerminalView key={id} id={id} active={activeTabId === id} />
            ))}
          </div>
        </main>
      </div>

      {modalOpen && (
        <AddProcessModal
          editing={editingProcess}
          profiles={profiles}
          onClose={() => setModalOpen(false)}
          onSubmit={handleModalSubmit}
        />
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove process"
        message={`Remove "${confirmRemove?.name}"? This stops it if running and deletes its saved configuration. Log files are kept.`}
        confirmLabel="Remove"
        danger
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemove(null)}
      />

      <ToastStack toasts={toasts} />
    </div>
  )
}

export default App
