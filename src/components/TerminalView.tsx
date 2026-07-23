import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'

const XTERM_THEME = {
  background: '#0a0908',
  foreground: '#f3efec',
  cursor: '#ff5f36',
  cursorAccent: '#0a0908',
  selectionBackground: 'rgba(255, 95, 54, 0.35)',
  black: '#151210',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f5a524',
  blue: '#60a5fa',
  magenta: '#e879a6',
  cyan: '#ff9f5c',
  white: '#cdc7c2',
  brightBlack: '#5f574f',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fcd34d',
  brightBlue: '#93c5fd',
  brightMagenta: '#f0a8c8',
  brightCyan: '#ffbf8a',
  brightWhite: '#fdfbfa',
}

export function TerminalView({ id }: { id: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      // Only the active tab is ever mounted (see App.tsx), so this is the
      // one xterm buffer resident in memory at a time — a few thousand
      // lines is plenty without letting a chatty process bloat RAM.
      scrollback: 3000,
      theme: XTERM_THEME,
      allowTransparency: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    termRef.current = term
    fitRef.current = fitAddon

    let disposed = false

    window.api.getScrollback(id).then((scrollback) => {
      if (disposed || !scrollback) return
      term.write(scrollback)
    })

    const unsubscribeData = window.api.onTerminalData(({ id: incomingId, data }) => {
      if (incomingId === id) term.write(data)
    })

    const dataDisposable = term.onData((data) => {
      window.api.writeTerminal(id, data)
    })

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.api.resizeTerminal(id, cols, rows)
    })

    const doFit = () => {
      try {
        fitAddon.fit()
      } catch {
        /* container may be zero-sized momentarily during layout */
      }
    }

    requestAnimationFrame(doFit)

    const resizeObserver = new ResizeObserver(() => doFit())
    resizeObserver.observe(containerRef.current)

    return () => {
      disposed = true
      unsubscribeData()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [id])

  return (
    <div className="terminal-view">
      <div className="absolute top-2 right-3.5 z-10 flex gap-1.5">
        <Button size="sm" variant="secondary" title="Clear view" onClick={() => termRef.current?.clear()}>
          Clear
        </Button>
        <Button size="icon-sm" variant="secondary" title="Open log file" onClick={() => window.api.openLogFile(id)}>
          <ScrollText />
        </Button>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
