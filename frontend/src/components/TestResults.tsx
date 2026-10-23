import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Clock, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { ErrorCard, ErrorInfo } from './ErrorExplain'

export type TestResult = {
  index: number; hidden: boolean; status: 'ok' | 'wrong' | 'error' | 'timeout'; timeMs?: number
  input?: string; expected?: string; actual?: string; stderr?: string; error?: ErrorInfo | null
}

const VERDICT: Record<string, string> = { ok: 'верно', wrong: 'неверный вывод', error: 'ошибка в программе', timeout: 'слишком долго' }

// ---------- Строки с невидимыми символами ----------

type Line = { text: string; nl: boolean }

/** Делит текст на строки; ensureNl — дописать финальный перенос (print всегда его ставит). */
function splitLines(text: string, ensureNl: boolean): Line[] {
  let t = text.replace(/\r\n/g, '\n')
  if (ensureNl && t && !t.endsWith('\n')) t += '\n'
  const parts = t.split('\n')
  const lines = parts.map((s, i) => ({ text: s, nl: i < parts.length - 1 }))
  if (lines.length && lines[lines.length - 1].text === '' && !lines[lines.length - 1].nl) lines.pop()
  return lines
}

function LineView({ line }: { line: Line }) {
  const m = /[ \t]+$/.exec(line.text)
  const body = m ? line.text.slice(0, m.index) : line.text
  const tail = m ? m[0].replace(/ /g, '·').replace(/\t/g, '→') : ''
  return <>{body}{tail && <span className="ws" title="Пробелы в конце строки">{tail}</span>}{line.nl && <span className="nl" title="Перенос строки">↵</span>}</>
}

function OutBlock({ label, text, ensureNl, hl, tone }: { label: string; text: string; ensureNl?: boolean; hl?: number | null; tone?: 'ok' | 'bad' | 'warn' }) {
  const lines = splitLines(text, !!ensureNl)
  return (
    <div className={`tblock ${tone ?? ''}`}>
      <div className="lbl">{label}</div>
      <pre>{lines.length === 0
        ? <span className="emptyout">(пусто)</span>
        : lines.map((l, i) => <span key={i} className={`ln ${hl === i ? 'hl' : ''}`}><LineView line={l} />{'\n'}</span>)}</pre>
    </div>
  )
}

// ---------- Где вывод расходится с ожидаемым ----------

// Та же нормализация, что у проверки exact: rstrip каждой строки и пустые строки в конце
const norm = (s: string) => {
  const ls = s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  while (ls.length && ls[ls.length - 1] === '') ls.pop()
  return ls
}
const short = (s: string) => (s.length > 40 ? s.slice(0, 40) + '…' : s)

function firstDiff(expected: string, actual: string): { line: number | null; msg: string } {
  const E = norm(expected), A = norm(actual)
  if (A.length === 0) return { line: null, msg: 'Программа ничего не вывела.' }
  for (let i = 0; i < Math.min(E.length, A.length); i++) {
    if (E[i] === A[i]) continue
    let why = `ожидалось «${short(E[i])}», получено «${short(A[i])}»`
    if (E[i].trim() === A[i].trim()) why = 'лишние или недостающие пробелы в начале строки'
    else if (E[i].replace(/\s+/g, ' ') === A[i].replace(/\s+/g, ' ')) why = 'разное число пробелов между словами'
    else if (E[i].toLowerCase() === A[i].toLowerCase()) why = 'отличаются большие и маленькие буквы'
    return { line: i, msg: `Строка ${i + 1} отличается: ${why}.` }
  }
  if (A.length < E.length) return { line: A.length, msg: `Не хватает строк: ожидалось ${E.length}, получено ${A.length}.` }
  if (A.length > E.length) return { line: E.length, msg: `Лишние строки: ожидалось ${E.length}, получено ${A.length}.` }
  return { line: null, msg: 'Вывод отличается расстановкой пробелов.' }
}

// ---------- Карточка теста ----------

function TestCard({ r, open, toggle }: { r: TestResult; open: boolean; toggle: () => void }) {
  const ok = r.status === 'ok'
  const n = r.index + 1
  const hasData = r.input !== undefined
  const diff = r.status === 'wrong' && hasData ? firstDiff(r.expected ?? '', r.actual ?? '') : null
  const Icon = ok ? Check : r.status === 'timeout' ? Clock : r.status === 'error' ? AlertTriangle : X
  return (
    <div className={`tcard ${ok ? 'ok' : 'bad'} ${open ? 'open' : ''}`}>
      <button className="thead" onClick={toggle} aria-expanded={open}>
        {open ? <ChevronDown size={20} className="chev" /> : <ChevronRight size={20} className="chev" />}
        <span className="ico"><Icon size={20} strokeWidth={3} /></span>
        {ok && !open
          ? <span className="tname">Тест {n} · {r.hidden ? 'скрытый' : 'пример'} ✓</span>
          : <><span className="tname">Тест {n}</span><span className="tag">{r.hidden ? 'скрытый' : 'пример'}</span></>}
        <span className="spacer" />
        <span className="verdict">{VERDICT[r.status] ?? r.status}</span>
        {r.timeMs !== undefined && <span className="ms">{r.timeMs} мс</span>}
      </button>
      {open && (
        <div className="tbody">
          {!hasData ? (
            <div className="muted">{r.hidden ? 'Данные скрыты.' : 'Подробностей нет: нажми «Проверить» ещё раз.'}</div>
          ) : (
            <>
              <div className="tblocks">
                <OutBlock label="Ввод" text={r.input ?? ''} />
                <OutBlock label="Ожидалось" text={r.expected ?? ''} ensureNl hl={diff?.line} tone={diff ? 'warn' : undefined} />
                {r.status === 'error' ? (
                  <>
                    {r.actual ? <OutBlock label="Вывод до ошибки" text={r.actual} /> : null}
                    <div className="tblock bad wide"><div className="lbl">Ошибка</div><pre className="errtext">{r.stderr || '(нет текста ошибки)'}</pre></div>
                  </>
                ) : r.status === 'timeout' ? (
                  <div className="tblock warn wide"><div className="lbl">Время вышло</div><pre className="warntext">{r.stderr || 'Программа работала слишком долго. Возможно, бесконечный цикл.'}</pre></div>
                ) : (
                  <OutBlock label="Получено" text={r.actual ?? ''} hl={diff?.line} tone={ok ? 'ok' : 'bad'} />
                )}
              </div>
              {diff && <div className="tdiff"><X size={18} strokeWidth={3} /> {diff.msg}</div>}
              {r.status === 'error' && r.error && <div className="tcard-err"><ErrorCard e={r.error} /></div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// По умолчанию развёрнуты только упавшие тесты; пройденные свёрнуты в одну строку
const defaultOpen = (r: TestResult) => r.status !== 'ok'

export default function TestResults({ result }: { result: { loading?: boolean; results?: TestResult[] } | null }) {
  const results = result?.results ?? []
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setOpen(Object.fromEntries(results.map((r) => [r.index, defaultOpen(r)]))) }, [result])
  // После проверки сразу показываем первый упавший тест
  useEffect(() => {
    const c = box.current, el = c?.querySelector<HTMLElement>('.tcard.bad')
    const head = c?.querySelector<HTMLElement>('.tsummary')
    if (c && el) c.scrollTop = el.offsetTop - (head?.offsetHeight ?? 0) - 24
  }, [result])

  if (!result) return <div className="empty"><div><b>Тесты ещё не запускались</b>Нажми «Проверить», когда программа готова.</div></div>
  if (result.loading) return <div className="empty"><div><Loader2 size={28} /><b>Проверяю…</b></div></div>

  const passed = results.filter((r) => r.status === 'ok').length
  const all = passed === results.length && results.length > 0
  const anyClosed = results.some((r) => !(open[r.index] ?? defaultOpen(r)))
  const setAll = (v: boolean) => setOpen(Object.fromEntries(results.map((r) => [r.index, v])))

  return (
    <div className="tests" ref={box}>
      <div className={`tsummary ${all ? 'ok' : ''}`}>
        {all ? <CheckCircle2 size={24} /> : <X size={24} strokeWidth={3} className="ic-bad" />}
        <span>Пройдено {passed} из {results.length}{all ? ' — задача решена!' : ''}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => setAll(anyClosed)}>{anyClosed ? 'Развернуть все' : 'Свернуть все'}</button>
      </div>
      {results.map((r) => (
        <Fragment key={r.index}>
          <TestCard r={r} open={open[r.index] ?? defaultOpen(r)} toggle={() => setOpen((o) => ({ ...o, [r.index]: !(o[r.index] ?? defaultOpen(r)) }))} />
        </Fragment>
      ))}
    </div>
  )
}
