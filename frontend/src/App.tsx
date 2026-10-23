import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useSettings } from './settings'
import Home from './pages/Home'
import LessonPage from './pages/LessonPage'

function useHash() {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return h
}

export default function App() {
  const h = useHash()
  const { bump } = useSettings()
  const m = h.match(/^#\/lesson\/([\w-]+)/)
  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="brand">Python → МЦКО</a>
        <span className="spacer" />
        <button className="btn" title="Меньше" onClick={() => bump(-2)}><Minus size={20} /> A</button>
        <button className="btn" title="Больше" onClick={() => bump(2)}><Plus size={20} /> A</button>
      </header>
      <main>{m ? <LessonPage key={m[1]} id={m[1]} /> : <Home />}</main>
    </div>
  )
}
