import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from './api'
import { applyTheme, CodeFontId, ThemeId, THEMES, CODE_FONTS } from './themes'

export type Settings = {
  codeSize: number; theorySize: number; uiSize: number; theme: ThemeId; codeFont: CodeFontId
  split: number        // ширина левой колонки урока, % окна (25–70)
  editorSplit: number  // высота редактора, % правой колонки под панелью кнопок
}
export const LAYOUT_DEFAULTS = { split: 42, editorSplit: 56 }
const DEFAULTS: Settings = { codeSize: 24, theorySize: 22, uiSize: 20, theme: 'dark', codeFont: 'jetbrains', ...LAYOUT_DEFAULTS }
type Ctx = { s: Settings; bump: (d: number) => void; set: (patch: Partial<Settings>) => void }
const Ctx = createContext<Ctx>({ s: DEFAULTS, bump: () => {}, set: () => {} })

function sanitize(d: Partial<Settings>): Settings {
  const s = { ...DEFAULTS, ...d }
  if (!(s.theme in THEMES)) s.theme = DEFAULTS.theme
  if (!(s.codeFont in CODE_FONTS)) s.codeFont = DEFAULTS.codeFont
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : def)
  s.split = num(s.split, 25, 70, DEFAULTS.split)
  s.editorSplit = num(s.editorSplit, 1, 99, DEFAULTS.editorSplit)
  return s
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api('/settings').then((d) => setS(sanitize(d))).catch(() => {}).finally(() => setReady(true))
  }, [])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--ui', s.uiSize + 'px'); r.setProperty('--theory', s.theorySize + 'px'); r.setProperty('--code', s.codeSize + 'px')
    applyTheme(s.theme, s.codeFont)
  }, [s])
  const set = (patch: Partial<Settings>) => {
    setS((prev) => ({ ...prev, ...patch }))
    api('/settings', 'PUT', patch).catch(() => {})
  }
  const bump = (d: number) => {
    const c = (v: number) => Math.min(40, Math.max(16, v + d))
    set({ codeSize: c(s.codeSize), theorySize: c(s.theorySize), uiSize: c(s.uiSize) })
  }
  if (!ready) return null
  return <Ctx.Provider value={{ s, bump, set }}>{children}</Ctx.Provider>
}
export const useSettings = () => useContext(Ctx)
