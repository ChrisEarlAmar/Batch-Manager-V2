import { useCallback, useEffect, useState } from 'react'
import { FileCode, Play, RotateCcw, Square, Terminal } from 'lucide-react'
import type { AppInfo, ProcessDraft, ProcessItem, Profile, ToastMessage } from './types'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TerminalTabs } from './components/TerminalTabs'
import { TerminalView } from './components/TerminalView'
import { AddProcessModal } from './components/AddProcessModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ToastStack } from './components/ToastStack'
import { Button } from '@/components/ui/button'

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
  const [pendingScript, setPendingScript] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<ProcessItem | null>(null)
  const [dragDepth, setDragDepth] = useState(0)

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `t${++toastSeq}`
    // Capped so a crash-restart storm can't grow this unbounded before the
    // 6s auto-dismiss timers catch up.
    setToasts((list) => [...list.slice(-4), { ...toast, id }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000)
  }, [])

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
      pushToast({ kind: (toast.kind as ToastMessage['kind']) || 'info', title: toast.title, body: toast.body, at: toast.at })
    })

    return () => {
      unsubProcesses()
      unsubToast()
    }
  }, [pushToast])

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

  async function handleRenameProfile(id: string, name: string) {
    await window.api.updateProfile(id, { name })
    refreshProfiles()
  }

  async function handleDeleteProfile(id: string) {
    await window.api.removeProfile(id)
    refreshProfiles()
    // processes:changed already arrives separately to clear their profileId;
    // this just stops filtering on a profile that no longer exists.
    setActiveProfileId((cur) => (cur === id ? null : cur))
  }

  function openAddProcess(script?: string) {
    setEditingProcess(null)
    setPendingScript(script ?? null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setPendingScript(null)
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragDepth(0)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!/\.(bat|cmd)$/i.test(file.name)) {
      pushToast({ kind: 'warning', title: 'Unsupported file', body: 'Drop a .bat or .cmd file to add it as a process.', at: Date.now() })
      return
    }
    const filePath = window.api.getPathForFile(file)
    openAddProcess(filePath)
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
    <div
      className="relative flex h-screen flex-col bg-background"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar appInfo={appInfo} />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          processes={processes}
          profiles={profiles}
          activeProfileId={activeProfileId}
          selectedId={activeTabId}
          onChangeProfile={setActiveProfileId}
          onAddProfile={handleAddProfile}
          onRenameProfile={handleRenameProfile}
          onDeleteProfile={handleDeleteProfile}
          onOpenAddProcess={() => openAddProcess()}
          onOpenTerminal={openTerminal}
          onStart={(id) => window.api.startProcess(id)}
          onStop={(id) => window.api.stopProcess(id)}
          onRestart={(id) => window.api.restartProcess(id)}
          onRemove={(proc) => setConfirmRemove(proc)}
          onEdit={(proc) => {
            setEditingProcess(proc)
            setPendingScript(null)
            setModalOpen(true)
          }}
          onStartAll={(profileId) => window.api.startAll(profileId)}
          onStopAll={(profileId) => window.api.stopAll(profileId)}
        />

        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {openTabs.length > 0 && (
            <div className="flex h-9.5 shrink-0 items-stretch border-b border-border bg-card">
              <TerminalTabs
                processes={processes}
                openIds={openTabs}
                activeId={activeTabId}
                onSelect={setActiveTabId}
                onClose={closeTab}
              />
              {activeProcess && (
                <div className="flex shrink-0 items-center gap-1 border-l border-border px-2.5">
                  {activeProcess.status === 'stopped' || activeProcess.status === 'crashed' ? (
                    <Button size="icon-sm" variant="ghost" title="Start" onClick={() => window.api.startProcess(activeProcess.id)}>
                      <Play />
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Stop"
                      disabled={activeProcess.status === 'stopping'}
                      onClick={() => window.api.stopProcess(activeProcess.id)}
                    >
                      <Square />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Restart"
                    disabled={activeProcess.status === 'stopped'}
                    onClick={() => window.api.restartProcess(activeProcess.id)}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="relative min-h-0 flex-1 bg-[#0a0908]">
            {openTabs.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2.5 px-10 text-center text-muted-foreground">
                <Terminal className="size-10" />
                <h3 className="text-[15px] font-semibold text-foreground/80">No terminal open</h3>
                <p className="max-w-80 text-[12.5px] leading-relaxed">
                  Select a process from the sidebar and click its terminal icon (or the card itself) to view live
                  output here.
                </p>
              </div>
            )}
            {/* Only the active tab's xterm instance is mounted — each one holds a
                real scrollback buffer plus a canvas, so keeping every open tab
                alive at once scales renderer RAM with tab count for no benefit.
                The underlying process and its own output buffer in the main
                process are unaffected, so switching tabs just replays scrollback. */}
            {activeTabId && <TerminalView key={activeTabId} id={activeTabId} />}
          </div>
        </main>
      </div>

      {modalOpen && (
        <AddProcessModal
          editing={editingProcess}
          initialScript={pendingScript}
          profiles={profiles}
          onClose={closeModal}
          onSubmit={handleModalSubmit}
        />
      )}

      {dragDepth > 0 && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary/50 px-10 py-8">
            <FileCode className="size-9 text-primary" />
            <p className="text-sm font-medium">Drop a .bat or .cmd file to add it as a process</p>
          </div>
        </div>
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
