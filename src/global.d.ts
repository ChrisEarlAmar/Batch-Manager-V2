import type { AppInfo, ProcessDraft, ProcessItem, Profile, Settings } from './types'

export {}

declare global {
  interface Window {
    api: {
      getAppInfo: () => Promise<AppInfo>

      getSettings: () => Promise<Settings>
      updateSettings: (patch: Partial<Settings>) => Promise<Settings>

      listProcesses: () => Promise<ProcessItem[]>
      addProcess: (partial: ProcessDraft) => Promise<ProcessItem>
      updateProcess: (id: string, patch: Partial<ProcessDraft>) => Promise<ProcessItem>
      removeProcess: (id: string) => Promise<boolean>
      startProcess: (id: string) => Promise<boolean>
      stopProcess: (id: string) => Promise<boolean>
      restartProcess: (id: string) => Promise<boolean>
      startAll: (profileId: string | null) => Promise<boolean>
      stopAll: (profileId: string | null) => Promise<boolean>

      listProfiles: () => Promise<Profile[]>
      addProfile: (name: string) => Promise<Profile>
      updateProfile: (id: string, patch: Partial<Pick<Profile, 'name'>>) => Promise<Profile>
      removeProfile: (id: string) => Promise<boolean>

      getScrollback: (id: string) => Promise<string>
      writeTerminal: (id: string, data: string) => void
      resizeTerminal: (id: string, cols: number, rows: number) => void
      openLogFile: (id: string) => Promise<boolean>

      pickBatchFile: () => Promise<string | null>
      pickDirectory: (defaultPath?: string) => Promise<string | null>

      minimizeWindow: () => void
      toggleMaximizeWindow: () => void
      closeWindow: () => void
      isWindowMaximized: () => Promise<boolean>

      onProcessesChanged: (callback: (items: ProcessItem[]) => void) => () => void
      onTerminalData: (callback: (payload: { id: string; data: string }) => void) => () => void
      onToast: (callback: (toast: { kind: string; title: string; body: string; at: number }) => void) => () => void
      onWindowMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
    }
  }
}
