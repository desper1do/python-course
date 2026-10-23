import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Copy, Play } from 'lucide-react'

const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: { ...defaultSchema.attributes, code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/]] },
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
            return (
              <div className="codeblock">
                {lang === 'python' && (
                  <div className="codebar">
                    {onToEditor && <button className="btn sm" onClick={() => onToEditor(src)}><Play size={16} /> В редактор</button>}
                    <button className="btn sm" onClick={() => navigator.clipboard?.writeText(src)}><Copy size={16} /> Копировать</button>
                  </div>
                )}
                <pre className={lang === 'text' ? 'out' : ''}>{src}</pre>
              </div>
            )
          },
        }}
      >{text}</ReactMarkdown>
    </div>
  )
}
