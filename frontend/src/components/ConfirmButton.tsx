import { ReactNode, useEffect, useRef, useState } from 'react'

// Кнопка с маленьким подтверждением рядом (вместо window.confirm, который
// браузер может молча заблокировать после «Запретить диалоги»).
export default function ConfirmButton({ children, question, confirmLabel = 'Да', onConfirm, className, title }: {
  children: ReactNode; question: string; confirmLabel?: string; onConfirm: () => void; className?: string; title?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    yes.current?.focus()
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('mousedown', close); addEventListener('keydown', esc)
    return () => { removeEventListener('mousedown', close); removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="menu-wrap" ref={box}>
      <button className={className} title={title} aria-expanded={open} onClick={() => setOpen(!open)}>{children}</button>
      {open && (
        <div className="menu confirm" role="dialog">
          <div className="q">{question}</div>
          <div className="actions">
            <button className="btn ghost" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn primary" ref={yes} onClick={() => { setOpen(false); onConfirm() }}>{confirmLabel}</button>
          </div>
        </div>
      )}
    </div>
  )
}
