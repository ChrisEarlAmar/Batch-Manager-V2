import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { IconLog } from './icons'

const XTERM_THEME = {
  background: '#0b0d13',
  foreground: '#e9ebf2',
  cursor: '#8b6bff',
  cursorAccent: '#0b0d13',
  selectionBackground: 'rgba(139, 107, 255, 0.35)',
  black: '#12141c',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#5eebd8',
  white: '#c9cddb',
  brightBlack: '#5b6272',
  brightRed: '#fca5a5',
  brightGreen: '#6ee7b7',
  brightYellow: '#fcd34d',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#a5f3ec',
  brightWhite: '#f4f5f8',
}

export function TerminalView({ id, active }: { id: string; active: boolean }) {
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
      scrollback: 8000,
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
    <div className={`terminal-view${active ? '' : ' hidden'}`}>
      <div className="terminal-toolbar">
        <button className="icon-btn" title="Clear view" onClick={() => termRef.current?.clear()}>
          Clr
        </button>
        <button className="icon-btn" title="Open log file" onClick={() => window.api.openLogFile(id)}>
          <IconLog />
        </button>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
