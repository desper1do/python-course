import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square, CheckCircle2, RotateCcw, Check, ChevronLeft, ChevronRight, Lightbulb, Terminal, ListChecks } from 'lucide-react'
import { api, Lesson, Task } from '../api'
import { APP_NAME } from '../config'
import ConfirmButton from '../components/ConfirmButton'
import TestResults from '../components/TestResults'
import { ErrorCard } from '../components/ErrorExplain'
import Markdown from '../components/Markdown'
import Editor from '../components/Editor'
import Console, { ConsoleApi, ExitInfo } from '../components/Console'
import Splitter from '../components/Splitter'
import { LAYOUT_DEFAULTS, useSettings } from '../settings'

const STATUS_TEXT: Record<string, string> = { solved: 'решена', started: 'в процессе', new: 'не начата' }
const LEVEL_TEXT: Record<number, string> = { 1: 'Разбираем вместе', 2: 'По образцу', 3: 'Сама', 4: 'Со звёздочкой' }

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
  const { s: settings, set: setSettings } = useSettings()
  const lessonRef = useRef<HTMLDivElement>(null)
  const rsplitRef = useRef<HTMLDivElement>(null)
  // Редактор и нижняя панель (вместе с её вкладками) — не меньше ~120px каждый
  const editorBounds = (): [number, number] => {
    const h = rsplitRef.current?.clientHeight || 800
    const lowerMin = 120 + (rsplitRef.current?.querySelector<HTMLElement>('.btabs')?.offsetHeight ?? 54)
    return [Math.min(50, (120 / h) * 100), Math.max(50, ((h - lowerMin) / h) * 100)]
  }

  const [err, setErr] = useState('')
  const reload = useCallback(() => api<Lesson>(`/lessons/${id}`).then(setLesson).catch((e) => setErr(e.message)), [id])
  useEffect(() => { reload() }, [reload])

  const task = lesson?.tasks.find((t) => t.id === tab)
  const key = task ? `task:${task.id}` : `sandbox:${id}`

  useEffect(() => {
    if (!lesson) return
    // Ответ мог прийти после переключения на другую вкладку — такой игнорируем,
    // иначе в задачу попадёт чужой код и автосохранение его запишет.
    let alive = true
    setLoaded(false); setResult(null); setExit(null)
    api<{ code: string | null }>(`/code/${key}`).then((r) => {
      if (!alive) return
      setCode(r.code ?? task?.starter ?? ''); setLoaded(true)
    })
    return () => { alive = false }
  }, [key, !!lesson])

  useEffect(() => {
    if (!lesson) return
    const n = parseInt(id, 10)
    document.title = `${Number.isNaN(n) ? 'Урок' : `Урок ${n}`} — ${lesson.meta.title ?? id} · ${APP_NAME}`
  }, [lesson?.meta.title, id])

  const save = (k: string, c: string) => api(`/code/${k}`, 'PUT', { code: c }).catch(() => {})
  // Заменить код целиком (сброс, «В редактор») и сразу сохранить, не дожидаясь debounce
  const replaceCode = (k: string, c: string) => {
    clearTimeout(saveTimer.current)
    setCode(c)
    save(k, c)
  }
  const toggleDone = async () => {
    await api(`/lessons/${id}/done`, 'PUT', { done: !lesson?.manual })
    reload()
  }
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
  const view = task?.has_tests ? bottom : 'console'
  const shown = result ?? (task?.last_result ? { results: task.last_result } : null)

  return (
    <div className="lesson" ref={lessonRef} style={{ '--split': `${settings.split}%` } as CSSProperties}>
      <section className="left">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab theory ${tab === 'theory' ? 'on' : ''}`} onClick={() => setTab('theory')}>Теория</button>
          <span className="vsep" />
          {lesson.tasks.map((t, i) => (
            <button key={t.id} role="tab" className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}
              title={`Задача ${i + 1}: ${t.title} — ${STATUS_TEXT[t.status] ?? STATUS_TEXT.new}`}>
              {i + 1}
              {t.status === 'solved' ? <Check size={18} strokeWidth={3} className="mark-ok" /> : t.status === 'started' ? <span className="mark-dot" /> : null}
            </button>
          ))}
        </div>
        <div className="lscroll">
          {!task ? (
            <>
              <div className="lhead">
                <h1>{lesson.meta.title}</h1>
                {lesson.meta.subtitle && <div className="sub">{lesson.meta.subtitle}</div>}
              </div>
              <Markdown text={lesson.markdown} onToEditor={(c) => replaceCode(`sandbox:${id}`, c)} />
              <div className="done-row">
                {lesson.manual
                  ? <button className="btn" onClick={toggleDone}><CheckCircle2 size={20} className="ic-ok" /> Отмечен пройденным — снять отметку</button>
                  : <button className="btn" onClick={toggleDone}><CheckCircle2 size={20} className="ic-ok" /> Отметить урок пройденным</button>}
              </div>
            </>
          ) : (
            <TaskView task={task} num={idx + 1} onExample={(inp) => run(inp.split('\n').filter((_, i, a) => i < a.length - (inp.endsWith('\n') ? 1 : 0)))}
              prev={idx > 0 ? lesson.tasks[idx - 1].id : 'theory'} next={idx < lesson.tasks.length - 1 ? lesson.tasks[idx + 1].id : null} go={setTab} />
          )}
        </div>
      </section>
      <Splitter dir="v" label="Ширина колонок" value={settings.split} def={LAYOUT_DEFAULTS.split}
        bounds={() => [25, 70]} container={() => lessonRef.current}
        apply={(v) => lessonRef.current?.style.setProperty('--split', `${v}%`)}
        commit={(v) => setSettings({ split: v })} />
      <section className="right">
        <div className="toolbar">
          <span className="file"><span className="dot" />main.py</span>
          {task && (
            <ConfirmButton className="btn ghost icon" title="Вернуть код к начальному" confirmLabel="Вернуть"
              question="Вернуть код к начальному? Твой код будет потерян." onConfirm={() => replaceCode(key, task.starter ?? '')}>
              <RotateCcw size={20} />
            </ConfirmButton>
          )}
          <button className="btn stop" disabled={!running} onClick={() => con.current?.stop()} title="Остановить программу"><Square size={18} className="ic" /><span className="lbl">Стоп</span></button>
          {task?.has_tests && <button className="btn" onClick={check} title="Ctrl+Shift+Enter"><Check size={20} className="ic-ok" strokeWidth={3} /><span className="lbl">Проверить</span></button>}
          <button className="btn primary" disabled={running} onClick={() => run()} title="Ctrl+Enter"><Play size={20} fill="currentColor" /><span className="lbl">Запустить</span></button>
        </div>
        <div className="rsplit" ref={rsplitRef} style={{ '--esplit': `${settings.editorSplit}%` } as CSSProperties}>
          <div className="editor-wrap">{loaded && <Editor key={key} value={code} onChange={onChange} onRun={() => run()} onCheck={check} />}</div>
          <Splitter dir="h" label="Высота редактора" value={settings.editorSplit} def={LAYOUT_DEFAULTS.editorSplit}
            bounds={editorBounds} container={() => rsplitRef.current}
            apply={(v) => rsplitRef.current?.style.setProperty('--esplit', `${v}%`)}
            commit={(v) => setSettings({ editorSplit: v })} />
          <div className="lower">
            <div className="btabs">
              <button className={`btab ${view === 'console' ? 'on' : ''}`} onClick={() => setBottom('console')}><Terminal size={20} /> Консоль</button>
              {task?.has_tests && (
                <button className={`btab ${view === 'tests' ? 'on' : ''}`} onClick={() => setBottom('tests')}>
                  <ListChecks size={20} /> Тесты {shown?.results && <TestsBadge results={shown.results} />}
                </button>
              )}
              {running && <span className="run-state"><span className="dot" /> Программа работает</span>}
            </div>
            <div className="bottom">
              <div style={{ display: view === 'console' ? 'flex' : 'none' }} className="fill">
                <Console ref={con} onState={setRunning} onExit={setExit} />
                {exit?.error && <ErrorCard e={exit.error} />}
              </div>
              {view === 'tests' && <TestResults result={shown} />}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function TestsBadge({ results }: { results: any[] }) {
  const ok = results.filter((r) => r.status === 'ok').length
  return <span className={`badge ${ok === results.length ? 'ok' : 'bad'}`}>{ok}/{results.length}</span>
}

function TaskView({ task, num, onExample, prev, next, go }: { task: Task; num: number; onExample: (i: string) => void; prev: string; next: string | null; go: (t: string) => void }) {
  const [hints, setHints] = useState(0)
  useEffect(() => setHints(0), [task.id])
  const hs = task.hints ?? []
  return (
    <div>
      <div className="task-head">
        <div className="task-meta">
          <span className="eyebrow">Задача {num}</span>
        </div>
        <h2>{task.title}</h2>
        <div className="task-meta" style={{ marginTop: 10 }}>
          {task.level && <span className={`tag ${task.level === 4 ? 'star' : ''}`}>{LEVEL_TEXT[task.level] ?? `Уровень ${task.level}`}</span>}
          {task.required === false && task.level !== 4 && <span className="tag star">Дополнительная</span>}
          {task.status === 'solved' && <span className="tag done">✓ Решена</span>}
        </div>
      </div>
      <Markdown text={task.statement} />
      {task.input_format && <><div className="section-label">Входные данные</div><Markdown text={task.input_format} /></>}
      {task.output_format && <><div className="section-label">Выходные данные</div><Markdown text={task.output_format} /></>}
      {task.examples?.map((e, i) => (
        <div key={i} className="example">
          <div className="exhead">Пример {task.examples!.length > 1 ? i + 1 : ''}<button className="chipbtn" onClick={() => onExample(e.input)}><Play size={15} /> Запустить на примере</button></div>
          <div className="excols"><div><div className="lbl">Ввод</div><pre>{e.input}</pre></div><div><div className="lbl">Вывод</div><pre>{e.output}</pre></div></div>
        </div>
      ))}
      {hs.slice(0, hints).map((h, i) => <div key={i} className="hint"><b>Подсказка {i + 1}/{hs.length}</b><Markdown text={h} /></div>)}
      <div className="nav">
        {hints < hs.length && <button className="btn" onClick={() => setHints(hints + 1)}><Lightbulb size={20} /> Подсказка {hints + 1}/{hs.length}</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={() => go(prev)}><ChevronLeft size={20} /> Назад</button>
        {next && <button className="btn" onClick={() => go(next)}>Дальше <ChevronRight size={20} /></button>}
      </div>
    </div>
  )
}
