import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { indentUnit, syntaxHighlighting, bracketMatching } from '@codemirror/language'
import { pyHighlighter } from '../highlight'

// Все цвета — из CSS-переменных темы, поэтому смена темы не требует пересоздания редактора.
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: 'var(--code)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.6', fontVariantLigatures: 'none', fontFeatureSettings: '"liga" 0, "calt" 0' },
  '.cm-content': { padding: '12px 0', fontWeight: '500', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 20px 0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none', paddingLeft: '8px' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '2.2em' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '3px solid var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--sel) !important' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--accent)', borderRadius: '3px' },
})

export default function Editor({ value, onChange, onRun, onCheck }: {
  value: string; onChange: (v: string) => void; onRun: () => void; onCheck: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>()
  const cb = useRef({ onChange, onRun, onCheck }); cb.current = { onChange, onRun, onCheck }

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), highlightActiveLine(), bracketMatching(), python(),
          indentUnit.of('    '), syntaxHighlighting(pyHighlighter), EditorState.tabSize.of(4), theme,
          keymap.of([
            { key: 'Ctrl-Enter', run: () => (cb.current.onRun(), true) },
            { key: 'Ctrl-Shift-Enter', run: () => (cb.current.onCheck(), true) },
            indentWithTab, ...defaultKeymap, ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
  }, [])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  return <div className="editor" ref={host} />
}
