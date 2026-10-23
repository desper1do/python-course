import { useEffect, useState } from 'react'
import { ArrowRight, Clock } from 'lucide-react'
import { api } from '../api'
import { APP_NAME, AUTHOR_NAME, AUTHOR_ROLE, LINKS } from '../config'

const LABEL: Record<string, string> = { new: 'Не начат', progress: 'В процессе', done: 'Пройден' }

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default function Home() {
  const [cur, setCur] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/curriculum').then(setCur).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { document.title = APP_NAME }, [])
  if (err) return <div className="pad"><div className="errcard">Не удалось загрузить уроки: {err}</div></div>
  if (!cur) return <div className="pad muted">Загрузка…</div>

  const lessons: any[] = cur.lessons
  const solved = lessons.reduce((a, l) => a + (l.solved ?? 0), 0)
  const total = lessons.reduce((a, l) => a + (l.total ?? 0), 0)
  const next = lessons.find((l) => l.status === 'progress') ?? lessons.find((l) => l.status === 'new')
  const num = (l: any) => String(lessons.indexOf(l) + 1)

  return (
    <div className="home">
      <div className="home-inner">
        <div className="hero">
          <div>
            <h1>{APP_NAME}</h1>
            <div className="sub">{lessons.length} {lessons.length === 1 ? 'урок' : lessons.length < 5 ? 'урока' : 'уроков'} · один урок в неделю</div>
          </div>
          <div className="overall">
            <div className="row"><span>Решено задач</span><span>{solved} из {total}</span></div>
            <div className="bar"><i style={{ width: `${pct(solved, total)}%` }} /></div>
          </div>
        </div>

        {next && (
          <a className="continue" href={`#/lesson/${next.id}`}>
            <span className="grow">{next.status === 'progress' ? 'Продолжить' : 'Начать'}: Урок {num(next)} — {next.title}</span>
            <ArrowRight size={24} />
          </a>
        )}

        {cur.blocks.map((b: any) => {
          const ls = lessons.filter((l) => l.block === b.id)
          if (!ls.length) return null
          return (
            <section key={b.id}>
              <div className="block-title">{b.title} <span>{ls.filter((l) => l.status === 'done').length} из {ls.length} пройдено</span></div>
              <div className="cards">
                {ls.map((l) => (
                  <a key={l.id} href={`#/lesson/${l.id}`} className="card">
                    <div className="head">
                      <span className="num">Урок {num(l)}</span>
                      <span className={`status ${l.status}`} title={l.manual && !l.auto_done ? 'Урок отмечен пройденным вручную' : undefined}>
                        <span className="dot" />{LABEL[l.status]}{l.manual && !l.auto_done ? ' · вручную' : ''}
                      </span>
                    </div>
                    <h3>{l.title}</h3>
                    <div className="foot">
                      <div className={`bar ${l.status === 'done' ? 'ok' : ''}`}><i style={{ width: `${pct(l.solved, l.total)}%` }} /></div>
                      <span className="count">{l.solved}/{l.total}</span>
                      {l.minutes && <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock size={18} />{l.minutes} мин</span>}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )
        })}
        {/* Уроки без блока (ещё не разнесены в curriculum.yaml) */}
        {lessons.some((l) => !cur.blocks.find((b: any) => b.id === l.block)) && (
          <section>
            <div className="block-title">Без блока</div>
            <div className="cards">
              {lessons.filter((l) => !cur.blocks.find((b: any) => b.id === l.block)).map((l) => (
                <a key={l.id} href={`#/lesson/${l.id}`} className="card"><span className="num">Урок {num(l)}</span><h3>{l.title}</h3></a>
              ))}
            </div>
          </section>
        )}
      </div>
      <footer className="footer">
        <div className="footer-inner">
          <span>{AUTHOR_ROLE}: <b>{AUTHOR_NAME}</b></span>
          {LINKS.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
          <span className="spacer" />
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  )
}
