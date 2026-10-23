import { useEffect, useState } from 'react'
import { api } from '../api'

const LABEL: Record<string, string> = { new: 'не начат', progress: 'в процессе', done: 'пройден' }

export default function Home() {
  const [cur, setCur] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/curriculum').then(setCur).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="pad"><div className="errcard">Не удалось загрузить уроки: {err}</div></div>
  if (!cur) return <div className="pad">Загрузка…</div>
  return (
    <div className="home">
      <h1>Уроки</h1>
      {cur.blocks.map((b: any) => (
        <section key={b.id}>
          <h2>{b.title}</h2>
          {cur.lessons.filter((l: any) => l.block === b.id).map((l: any) => (
            <a key={l.id} href={`#/lesson/${l.id}`} className={`lesson-row ${l.status}`}>
              <span className="num">{l.id.split('-')[0]}</span>
              <span className="grow">{l.title}</span>
              <span className="muted">{l.solved}/{l.total}</span>
              <span className={`pill ${l.status}`}>{LABEL[l.status]}</span>
            </a>
          ))}
        </section>
      ))}
    </div>
  )
}
