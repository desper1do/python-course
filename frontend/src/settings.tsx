import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from './api'

export type Settings = { codeSize: number; theorySize: number; uiSize: number }
const DEFAULTS: Settings = { codeSize: 24, theorySize: 22, uiSize: 20 }
const Ctx = createContext<{ s: Settings; bump: (d: number) => void }>({ s: DEFAULTS, bump: () => {} })

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api('/settings').then((d) => setS({ ...DEFAULTS, ...d })).catch(() => {}).finally(() => setReady(true))
  }, [])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--ui', s.uiSize + 'px'); r.setProperty('--theory', s.theorySize + 'px'); r.setProperty('--code', s.codeSize + 'px')
  }, [s])
  const bump = (d: number) => {
    const c = (v: number) => Math.min(40, Math.max(16, v + d))
    const n = { codeSize: c(s.codeSize), theorySize: c(s.theorySize), uiSize: c(s.uiSize) }
    setS(n); api('/settings', 'PUT', n).catch(() => {})
  }
  if (!ready) return null
  return <Ctx.Provider value={{ s, bump }}>{children}</Ctx.Provider>
}
export const useSettings = () => useContext(Ctx)
