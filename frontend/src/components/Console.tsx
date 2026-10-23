import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { ITheme, Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettings } from '../settings'
import { alpha, CODE_FONTS, palette, Palette } from '../themes'

export type ConsoleApi = {
  run: (code: string, taskId?: string, preset?: string[]) => void
  stop: () => void
  clear: () => void
}
export type ExitInfo = { code: number; reason: string; error?: { type: string; line?: number; message: string } | null }

const RST = '\x1b[0m'
const fg = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`
}
// Цвета потоков: ввод — акцент, ошибки — err, служебные строки — muted
const colors = (p: Palette) => ({ input: fg(p.accent), err: fg(p.err), warn: fg(p.warn), dim: fg(p.muted), ok: fg(p.ok) })

const termTheme = (p: Palette): ITheme => ({
  background: p.bg, foreground: p.text, cursor: p.accent, cursorAccent: p.bg,
  selectionBackground: alpha(p.accent, p.dark ? 0.3 : 0.22),
  black: p.text, red: p.err, green: p.ok, yellow: p.warn, blue: p.fn, magenta: p.kw, cyan: p.fn, white: p.text,
})

const Console = forwardRef<ConsoleApi, { onState: (running: boolean) => void; onExit: (e: ExitInfo) => void }>(function Console({ onState, onExit }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal>()
  const fit = useRef<FitAddon>()
  const ws = useRef<WebSocket>()
  const line = useRef('')
  const running = useRef(false)
  const { s } = useSettings()
  const c = useRef(colors(palette(s.theme))); c.current = colors(palette(s.theme))
  const cbs = useRef({ onState, onExit }); cbs.current = { onState, onExit }

  const send = (o: unknown) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(o))
  const family = () => `${CODE_FONTS[s.codeFont].family}, ui-monospace, monospace`

  useEffect(() => {
    const t = new Terminal({
      fontFamily: family(), fontSize: s.codeSize - 2, fontWeight: '500', fontWeightBold: '700', lineHeight: 1.25,
      cursorBlink: false, cursorStyle: 'bar', cursorWidth: 2, cursorInactiveStyle: 'none',
      convertEol: true, theme: termTheme(palette(s.theme)),
    })
    const f = new FitAddon()
    t.loadAddon(f); t.open(host.current!); f.fit()
    term.current = t; fit.current = f
    // Подгонка под размер (в т.ч. при перетаскивании разделителей): не чаще раза за кадр
    let raf = 0
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { try { f.fit() } catch { /* скрыта */ } }) })
    ro.observe(host.current!)
    // Шрифт мог догрузиться позже — перемеряем ячейки
    document.fonts?.ready.then(() => { t.options.fontFamily = family(); f.fit() })
    t.onData((d) => {
      if (!running.current) return
      for (const ch of d) {
        if (ch === '\r') { t.write('\r\n'); send({ type: 'stdin', data: line.current + '\n' }); line.current = '' }
        else if (ch === '\x7f') { if (line.current) { line.current = line.current.slice(0, -1); t.write('\b \b') } }
        else if (ch >= ' ') { line.current += ch; t.write(c.current.input + ch + RST) }
      }
    })
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/run`)
    ws.current = sock
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data)
      const k = c.current
      if (m.type === 'stdout') t.write(m.data)
      else if (m.type === 'echo') t.write(k.input + m.data + RST)
      else if (m.type === 'stderr') t.write(k.err + m.data + RST)
      else if (m.type === 'exit') {
        running.current = false; line.current = ''; cbs.current.onState(false)
        if (m.message) t.write(`\r\n${k.warn}${m.message}${RST}\r\n`)
        t.write(`\r\n${k.dim}[Программа завершена, код ${m.code}, ${m.timeMs} мс]${RST}\r\n`)
        cbs.current.onExit({ code: m.code, reason: m.reason, error: m.error })
      }
    }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); sock.close(); t.dispose() }
  }, [])

  useEffect(() => {
    const t = term.current
    if (!t) return
    t.options.fontSize = s.codeSize - 2
    t.options.fontFamily = family()
    t.options.theme = termTheme(palette(s.theme))
    fit.current?.fit()
  }, [s.codeSize, s.codeFont, s.theme])

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

  // Отступы — на внешней обёртке: FitAddon меряет host вместе с padding и иначе обрезает край
  return <div className="console"><div className="console-host" ref={host} /></div>
})
export default Console
