import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square, CheckCircle2, RotateCcw, Check, X, Clock } from 'lucide-react'
import { api, Lesson, Task } from '../api'
import Markdown from '../components/Markdown'
import Editor from '../components/Editor'
import Console, { ConsoleApi, ExitInfo } from '../components/Console'

const statusMark = (t: Task) => (t.status === 'solved' ? ' ✓' : t.status === 'started' ? ' …' : '')

export default function LessonPage({ id }: { id: string }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [tab, setTab] = useState<string>('theory')
  const [code, setCode] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [bottom, setBottom] = useState<'console' | 'tests'>('console')
  const [result, setResult] = useState<any>(null)
  const [exit, setExit] = useState<ExitInfo | null>(null)
  const con = useRef<ConsoleApi>(null)
  const saveTimer = useRef<number>()

  const [err, setErr] = useState('')
  const reload = useCallback(() => api<Lesson>(`/lessons/${id}`).then(setLesson).catch((e) => setErr(e.message)), [id])
  useEffect(() => { reload() }, [reload])

  const task = lesson?.tasks.find((t) => t.id === tab)
  const key = task ? `task:${task.id}` : `sandbox:${id}`

  useEffect(() => {
    if (!lesson) return
    setLoaded(false); setResult(null); setExit(null)
    api<{ code: string | null }>(`/code/${key}`).then((r) => {
      setCode(r.code ?? task?.starter ?? ''); setLoaded(true)
    })
  }, [key, !!lesson])

  const save = (k: string, c: string) => api(`/code/${k}`, 'PUT', { code: c }).catch(() => {})
  const onChange = (v: string) => {
    setCode(v)
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => save(key, v), 600)
  }
  useEffect(() => {
    const g = () => { if (loaded) fetch(`/api/code/${key}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }) }
    addEventListener('beforeunload', g)
    return () => removeEventListener('beforeunload', g)
  }, [key, code, loaded])

  const run = (preset?: string[]) => { setBottom('console'); con.current?.run(code, task?.id, preset) }
  const check = async () => {
    if (!task?.has_tests) return
    await save(key, code)
    setBottom('tests')
    setResult({ loading: true })
    const r = await api('/check', 'POST', { taskId: task.id, code })
    setResult(r); reload()
  }

  if (err) return <div className="pad"><div className="errcard">Урок не загрузился: {err}. <a href="#/">К списку</a></div></div>
  if (!lesson) return <div className="pad">Загрузка…</div>
  const idx = lesson.tasks.findIndex((t) => t.id === tab)

  return (
    <div className="lesson">
      <section className="left">
        <div className="lhead">
          <h1>{lesson.meta.title}</h1>
          {lesson.meta.subtitle && <div className="muted">{lesson.meta.subtitle}</div>}
        </div>
        <div className="tabs">
          <button className={tab === 'theory' ? 'on' : ''} onClick={() => setTab('theory')}>Теория</button>
          {lesson.tasks.map((t, i) => (
            <button key={t.id} className={`${tab === t.id ? 'on' : ''} ${t.status}`} onClick={() => setTab(t.id)}>
              Задача {i + 1}{statusMark(t)}
            </button>
          ))}
        </div>
        <div className="lscroll">
          {!task ? (
            <>
              <Markdown text={lesson.markdown} onToEditor={(c) => { setTab('theory'); setCode(c); if (loaded) save(`sandbox:${id}`, c) }} />
              <button className="btn" onClick={() => api(`/lessons/${id}/done`, 'PUT', { done: true })}><CheckCircle2 size={20} /> Отметить урок пройденным</button>
            </>
          ) : (
            <TaskView task={task} onExample={(inp) => run(inp.split('\n').filter((_, i, a) => i < a.length - (inp.endsWith('\n') ? 1 : 0)))}
              prev={idx > 0 ? lesson.tasks[idx - 1].id : 'theory'} next={idx < lesson.tasks.length - 1 ? lesson.tasks[idx + 1].id : null} go={setTab} />
          )}
        </div>
      </section>
      <section className="right">
        <div className="toolbar">
          <span className="file">main.py</span>
          <button className="btn primary" disabled={running} onClick={() => run()}><Play size={20} /> Запустить</button>
          {task?.has_tests && <button className="btn ok" onClick={check}><Check size={20} /> Проверить</button>}
          <button className="btn danger" disabled={!running} onClick={() => con.current?.stop()}><Square size={20} /> Стоп</button>
          {task && <button className="btn" title="Сбросить к шаблону" onClick={() => { if (confirm('Вернуть шаблон? Твой код будет заменён.')) onChange(task.starter ?? '') }}><RotateCcw size={20} /></button>}
        </div>
        <div className="editor-wrap">{loaded && <Editor key={key} value={code} onChange={onChange} onRun={() => run()} onCheck={check} />}</div>
        <div className="btabs">
          <button className={bottom === 'console' ? 'on' : ''} onClick={() => setBottom('console')}>Консоль</button>
          <button className={bottom === 'tests' ? 'on' : ''} onClick={() => setBottom('tests')}>Тесты</button>
        </div>
        <div className="bottom">
          <div style={{ display: bottom === 'console' ? 'block' : 'none' }} className="fill">
            <Console ref={con} onState={setRunning} onExit={setExit} />
            {exit?.error && <ErrorCard e={exit.error} />}
          </div>
          {bottom === 'tests' && <Tests result={result ?? (task?.last_result ? { results: task.last_result } : null)} />}
        </div>
      </section>
    </div>
  )
}

const EXPLAIN: Record<string, string> = {
  SyntaxError: 'Python не понимает, как записана строка. Проверь скобки, кавычки, двоеточия.',
  IndentationError: 'Неправильные отступы: внутри блока строки сдвигаются на 4 пробела.',
  NameError: 'Такого имени нет. Возможно, опечатка или переменная ещё не создана.',
  TypeError: 'Операция не подходит к типам. Например, нельзя сложить число и строку.',
  ValueError: 'Значение не подходит. Например, int("abc") не превратится в число.',
  ZeroDivisionError: 'Делить на ноль нельзя.',
  EOFError: 'Программа просит ввод, а данных больше нет.',
  IndexError: 'Такого номера нет в последовательности.',
}
function ErrorCard({ e }: { e: { type: string; line?: number | null; message: string } }) {
  return (
    <div className="errcard">
      <b>Что это значит? {e.type}{e.line ? `, строка ${e.line}` : ''}</b>
      <div>{EXPLAIN[e.type] ?? 'Прочитай последнюю строку ошибки: там написано, что не так.'}</div>
    </div>
  )
}

function Tests({ result }: { result: any }) {
  if (!result) return <div className="pad muted">Нажми «Проверить».</div>
  if (result.loading) return <div className="pad"><Clock size={20} /> Проверяю…</div>
  return (
    <div className="tests">
      {result.solved && <div className="banner ok">Задача решена!</div>}
      {result.results.map((r: any) => (
        <div key={r.index} className={`test ${r.status}`}>
          <div>{r.status === 'ok' ? <Check size={22} /> : <X size={22} />} Тест {r.index + 1}{r.hidden ? ' (скрытый)' : ''}: {r.status === 'ok' ? 'верно' : r.status === 'timeout' ? 'слишком долго' : r.status === 'error' ? 'ошибка в программе' : 'неверный вывод'}</div>
          {!r.hidden && r.status !== 'ok' && (
            <pre>{`Ввод:\n${r.input}\nОжидалось:\n${r.expected}\nПолучено:\n${r.actual}`}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

function TaskView({ task, onExample, prev, next, go }: { task: Task; onExample: (i: string) => void; prev: string; next: string | null; go: (t: string) => void }) {
  const [hints, setHints] = useState(0)
  useEffect(() => setHints(0), [task.id])
  const hs = task.hints ?? []
  return (
    <div>
      <h2>{task.title}</h2>
      <Markdown text={task.statement} />
      {task.input_format && <><h3>Входные данные</h3><Markdown text={task.input_format} /></>}
      {task.output_format && <><h3>Выходные данные</h3><Markdown text={task.output_format} /></>}
      {task.examples?.map((e, i) => (
        <div key={i} className="example">
          <div className="exhead"><b>Пример {i + 1}</b><button className="btn sm" onClick={() => onExample(e.input)}><Play size={16} /> Запустить на примере</button></div>
          <div className="excols"><div><span className="muted">Ввод</span><pre>{e.input}</pre></div><div><span className="muted">Вывод</span><pre>{e.output}</pre></div></div>
        </div>
      ))}
      {hs.slice(0, hints).map((h, i) => <div key={i} className="hint"><b>Подсказка {i + 1}/{hs.length}.</b> <Markdown text={h} /></div>)}
      <div className="nav">
        {hints < hs.length && <button className="btn" onClick={() => setHints(hints + 1)}>Подсказка {hints + 1}/{hs.length}</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => go(prev)}>← Назад</button>
        {next && <button className="btn" onClick={() => go(next)}>Дальше →</button>}
      </div>
    </div>
  )
}
