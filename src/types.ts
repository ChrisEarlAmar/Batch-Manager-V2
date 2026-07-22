export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface ProcessItem {
  id: string
  name: string
  script: string
  workingDirectory: string
  autoStart: boolean
  restartOnCrash: boolean
  profileId: string | null
  color: string | null
  createdAt: number

  status: ProcessStatus
  pid: number | null
  startedAt: number | null
  totalRuntimeMs: number
  startCount: number
  crashCount: number
  lastExitCode: number | null
  autoRestartSuppressed: boolean
}

export interface ProcessDraft {
  name: string
  script: string
  workingDirectory: string
  autoStart: boolean
  restartOnCrash: boolean
  profileId: string | null
  color: string | null
}

export interface Profile {
  id: string
  name: string
  createdAt: number
}

export interface AppInfo {
  isAdmin: boolean
  version: string
  platform: string
}

export interface Settings {
  minimizeToTray: boolean
  startMinimized: boolean
  launchOnStartup: boolean
}

export type ToastKind = 'error' | 'warning' | 'info' | 'success'

export interface ToastMessage {
  id: string
  kind: ToastKind
  title: string
  body: string
  at: number
}

export const ACCENT_PALETTE = [
  '#7c5cff',
  '#60ebff',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#f472b6',
  '#38bdf8',
  '#a3e635',
] as const
