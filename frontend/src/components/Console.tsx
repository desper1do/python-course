import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettings } from '../settings'

export type ConsoleApi = {
  run: (code: string, taskId?: string, preset?: string[]) => void
  stop: () => void
  clear: () => void
}
export type ExitInfo = { code: number; reason: string; error?: { type: string; line?: number; message: string } | null }

const RED = '\x1b[38;2;255;107;107m', GREEN = '\x1b[38;2;139;233;176m', YEL = '\x1b[38;2;255;204;102m', RST = '\x1b[0m'

const Console = forwardRef<ConsoleApi, { onState: (running: boolean) => void; onExit: (e: ExitInfo) => void }>(function Console({ onState, onExit }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal>()
  const fit = useRef<FitAddon>()
  const ws = useRef<WebSocket>()
  const line = useRef('')
  const running = useRef(false)
  const { s } = useSettings()
  const cbs = useRef({ onState, onExit }); cbs.current = { onState, onExit }

  const send = (o: unknown) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(o))

  useEffect(() => {
    const t = new Terminal({
      fontFamily: '"JetBrains Mono", monospace', fontSize: s.codeSize - 2, fontWeight: '500', fontWeightBold: '700',
      cursorBlink: true, cursorWidth: 3, convertEol: true, theme: { background: '#0b0d13', foreground: '#e8ebf2', cursor: '#8b7cff' },
    })
    const f = new FitAddon()
    t.loadAddon(f); t.open(host.current!); f.fit()
    term.current = t; fit.current = f
    const ro = new ResizeObserver(() => f.fit()); ro.observe(host.current!)
    t.onData((d) => {
      if (!running.current) return
      for (const ch of d) {
        if (ch === '\r') { t.write('\r\n'); send({ type: 'stdin', data: line.current + '\n' }); line.current = '' }
        else if (ch === '\x7f') { if (line.current) { line.current = line.current.slice(0, -1); t.write('\b \b') } }
        else if (ch >= ' ') { line.current += ch; t.write(GREEN + ch + RST) }
      }
    })
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/run`)
    ws.current = sock
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.type === 'stdout') t.write(m.data)
      else if (m.type === 'echo') t.write(GREEN + m.data + RST)
      else if (m.type === 'stderr') t.write(RED + m.data + RST)
      else if (m.type === 'exit') {
        running.current = false; line.current = ''; cbs.current.onState(false)
        if (m.message) t.write(`\r\n${YEL}${m.message}${RST}\r\n`)
        t.write(`\r\n${m.code === 0 ? GREEN : RED}[Программа завершена, код ${m.code}, ${m.timeMs} мс]${RST}\r\n`)
        cbs.current.onExit({ code: m.code, reason: m.reason, error: m.error })
      }
    }
    return () => { ro.disconnect(); sock.close(); t.dispose() }
  }, [])

  useEffect(() => { if (term.current) { term.current.options.fontSize = s.codeSize - 2; fit.current?.fit() } }, [s.codeSize])

  useImperativeHandle(ref, () => ({
    run(code, taskId, preset) {
      term.current?.clear(); term.current?.reset()
      running.current = true; line.current = ''; cbs.current.onState(true)
      term.current?.focus()
      send({ type: 'run', code, taskId, stdinPreset: preset })
    },
    stop() { send({ type: 'stop' }) },
    clear() { term.current?.reset() },
  }))

  return <div className="console" ref={host} />
})
export default Console
