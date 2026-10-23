import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { indentUnit, syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const hl = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: '#c4b8ff', fontWeight: '700' },
  { tag: [t.string], color: '#8be9b0' },
  { tag: [t.number, t.bool, t.null], color: '#ffcc66' },
  { tag: [t.comment], color: '#a9b4cc', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#7cc4ff' },
  { tag: [t.definition(t.variableName)], color: '#ffd9a0' },
])

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
          lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(), python(),
          indentUnit.of('    '), syntaxHighlighting(hl), EditorState.tabSize.of(4),
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
