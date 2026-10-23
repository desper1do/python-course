import { Children, isValidElement, ReactNode, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Check, Copy, Play } from 'lucide-react'
import { highlightPython } from '../highlight'

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: { ...defaultSchema.attributes, code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]] },
}

// Врезки: цитата, начинающаяся с эмодзи, становится callout-блоком своего цвета
const CALLOUTS: [RegExp, string][] = [
  [/^(⚠️|⚠|❗|❌|🚫)/u, 'warn'],
  [/^(✅|✔️|🎉)/u, 'ok'],
  [/^(🎯|📌|💡|🤔|❓|🧠|ℹ️)/u, 'tip'],
]

function firstText(node: ReactNode): string {
  for (const ch of Children.toArray(node)) {
    if (typeof ch === 'string') { if (ch.trim()) return ch.trim() }
    else if (isValidElement(ch)) { const t = firstText((ch.props as any).children); if (t) return t }
  }
  return ''
}

function CodeBlock({ src, lang, onToEditor }: { src: string; lang?: string; onToEditor?: (code: string) => void }) {
  const [copied, setCopied] = useState(false)
  const isPy = lang === 'python' || lang === 'py'
  const copy = () => {
    navigator.clipboard?.writeText(src).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })
  }
  return (
    <div className={`codeblock ${lang === 'text' ? 'out' : ''}`}>
      {lang === 'text' && <div className="codelabel">Вывод</div>}
      {isPy && (
        <div className="codebar">
          <span className="lang">python</span>
          {onToEditor && <button className="chipbtn" onClick={() => onToEditor(src)} title="Подставить код в редактор"><Play size={15} /> В редактор</button>}
          <button className="chipbtn" onClick={copy} title="Скопировать">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Готово' : 'Копировать'}</button>
        </div>
      )}
      <pre>{isPy
        ? highlightPython(src).map((ln, i, all) => (
            <span key={i}>{ln.map((p, j) => (p.cls ? <span key={j} className={p.cls}>{p.text}</span> : p.text))}{i < all.length - 1 ? '\n' : ''}</span>
          ))
        : src}</pre>
    </div>
  )
}

export default function Markdown({ text, onToEditor }: { text: string; onToEditor?: (code: string) => void }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          pre({ children }: any) {
            const code = children?.props
            const lang = /language-(\w+)/.exec(code?.className || '')?.[1]
            const src = String(code?.children ?? '').replace(/\n$/, '')
            return <CodeBlock src={src} lang={lang} onToEditor={onToEditor} />
          },
          blockquote({ children }: any) {
            const t = firstText(children)
            const kind = CALLOUTS.find(([re]) => re.test(t))?.[1] ?? 'note'
            return <aside className={`callout ${kind}`}>{children}</aside>
          },
          table({ children }: any) {
            return <div className="tablewrap"><table>{children}</table></div>
          },
        }}
      >{text}</ReactMarkdown>
    </div>
  )
}
