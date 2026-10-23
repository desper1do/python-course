import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Columns2, Palette } from 'lucide-react'
import { LAYOUT_DEFAULTS, useSettings } from './settings'
import { CODE_FONTS, CodeFontId, THEMES, ThemeId } from './themes'
import Logo from './components/Logo'
import { APP_NAME } from './config'
import Home from './pages/Home'
import LessonPage from './pages/LessonPage'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return h
}

function AppearanceMenu() {
  const { s, set } = useSettings()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('mousedown', close); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="menu-wrap" ref={box}>
      <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Palette size={20} /> {THEMES[s.theme].label}
      </button>
      {open && (
        <div className="menu" role="menu">
          <h4>Тема</h4>
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const p = THEMES[id].p
            return (
              <button key={id} className={`opt ${s.theme === id ? 'on' : ''}`} onClick={() => set({ theme: id })}>
                <span className="swatch" style={{ background: p.bg, borderColor: p.line }}><i style={{ background: p.accent }} /></span>
                {THEMES[id].label}
                {s.theme === id && <Check size={20} className="tick" />}
              </button>
            )
          })}
          <div className="divider" />
          <h4>Шрифт кода</h4>
          {(Object.keys(CODE_FONTS) as CodeFontId[]).map((id) => (
            <button key={id} className={`opt ${s.codeFont === id ? 'on' : ''}`} onClick={() => set({ codeFont: id })}
              style={{ fontFamily: `${CODE_FONTS[id].family}, monospace` }}>
              {CODE_FONTS[id].label}
              {s.codeFont === id && <Check size={20} className="tick" />}
            </button>
          ))}
          <div className="divider" />
          <button className="opt" onClick={() => set(LAYOUT_DEFAULTS)}
            disabled={s.split === LAYOUT_DEFAULTS.split && s.editorSplit === LAYOUT_DEFAULTS.editorSplit}>
            <Columns2 size={20} /> Сбросить раскладку
            <span className="hint-r">{LAYOUT_DEFAULTS.split}/{100 - LAYOUT_DEFAULTS.split}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const h = useHash()
  const { s, bump } = useSettings()
  const m = h.match(/^#\/lesson\/([\w-]+)/)
  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand"><Logo /> {APP_NAME}</a>
        {m && <nav className="crumb"><a href="#/" className="btn ghost"><ChevronLeft size={20} /> Все уроки</a></nav>}
        <span className="spacer" />
        <div className="seg" title={`Код ${s.codeSize}px · теория ${s.theorySize}px`}>
          <button className="btn" title="Мельче" onClick={() => bump(-2)} disabled={s.uiSize <= 16 && s.codeSize <= 16}>A−</button>
          <span className="sep" />
          <button className="btn" title="Крупнее" onClick={() => bump(2)} disabled={s.uiSize >= 40 && s.codeSize >= 40}>A+</button>
        </div>
        <AppearanceMenu />
      </header>
      <main>{m ? <LessonPage key={m[1]} id={m[1]} /> : <Home />}</main>
    </div>
  )
}
