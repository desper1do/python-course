// Один набор CSS-классов подсветки для редактора и для блоков кода в теории.
// Цвета классов .tk-* задаются переменными темы в styles.css.
import { tags as t, tagHighlighter, highlightCode } from '@lezer/highlight'
import { parser } from '@lezer/python'

export const pyHighlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.self], class: 'tk-kw' },
  { tag: [t.string, t.special(t.string), t.docString], class: 'tk-str' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tk-num' },
  { tag: [t.comment, t.lineComment], class: 'tk-com' },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className), t.className], class: 'tk-def' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tk-fn' },
  { tag: [t.propertyName], class: 'tk-prop' },
])

export type Piece = { text: string; cls: string }

/** Разбивает Python-код на строки из подсвеченных кусочков. */
export function highlightPython(code: string): Piece[][] {
  const lines: Piece[][] = [[]]
  highlightCode(
    code, parser.parse(code), pyHighlighter,
    (text, cls) => lines[lines.length - 1].push({ text, cls }),
    () => lines.push([]),
  )
  return lines
}
