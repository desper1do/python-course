import { KeyboardEvent, PointerEvent, useRef } from 'react'

// Перетаскиваемый разделитель. Значение — проценты контейнера.
// Во время перетаскивания меняется только CSS-переменная на контейнере (apply),
// без перерисовки React; в настройки значение пишется один раз в конце (commit).
type Props = {
  dir: 'v' | 'h'                        // v — тянется влево-вправо, h — вверх-вниз
  value: number
  def: number                           // значение по двойному клику
  bounds: () => [number, number]        // допустимый диапазон, %
  container: () => HTMLElement | null   // относительно чего считать проценты
  apply: (pct: number) => void
  commit: (pct: number) => void
  label: string
}

const STEP = 2

export default function Splitter({ dir, value, def, bounds, container, apply, commit, label }: Props) {
  const live = useRef(value)
  const dragging = useRef(false)
  const moved = useRef(false)
  const el = useRef<HTMLDivElement>(null)

  const clamp = (v: number) => {
    const [lo, hi] = bounds()
    return Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10
  }
  const set = (v: number, save: boolean) => {
    live.current = clamp(v)
    apply(live.current)
    el.current?.setAttribute('aria-valuenow', String(Math.round(live.current)))
    if (save) commit(live.current)
  }
  const fromPointer = (e: PointerEvent) => {
    const r = container()?.getBoundingClientRect()
    if (!r) return live.current
    return dir === 'v' ? ((e.clientX - r.left) / r.width) * 100 : ((e.clientY - r.top) / r.height) * 100
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    live.current = value
    dragging.current = true
    moved.current = false
    // Захват указателя: события идут сюда, даже если курсор ушёл на xterm/CodeMirror
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing', dir === 'v' ? 'resizing-v' : 'resizing-h')
    el.current?.classList.add('drag')
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    moved.current = true
    set(fromPointer(e), false)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    document.body.classList.remove('resizing', 'resizing-v', 'resizing-h')
    el.current?.classList.remove('drag')
    if (moved.current) commit(live.current)  // простой клик (в т.ч. двойной) ничего не сохраняет
  }
  const key = (e: KeyboardEvent) => {
    const [lo, hi] = bounds()
    const back = dir === 'v' ? 'ArrowLeft' : 'ArrowUp'
    const fwd = dir === 'v' ? 'ArrowRight' : 'ArrowDown'
    const cur = clamp(value)
    let next: number | null = null
    if (e.key === back) next = cur - STEP
    else if (e.key === fwd) next = cur + STEP
    else if (e.key === 'Home') next = lo
    else if (e.key === 'End') next = hi
    if (next === null) return
    e.preventDefault()
    set(next, true)
  }

  const [lo, hi] = bounds()
  return (
    <div
      ref={el}
      className={`splitter ${dir}`}
      role="separator"
      aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuemin={Math.round(lo)}
      aria-valuemax={Math.round(hi)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label}: перетащи, двойной клик — по умолчанию`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onDoubleClick={() => set(def, true)}
      onKeyDown={key}
    >
      <span className="grip" aria-hidden="true"><i /><i /><i /></span>
    </div>
  )
}
