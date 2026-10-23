// «Что это значит?» — общее для консоли и вкладки «Тесты».
export type ErrorInfo = { type: string; line?: number | null; message?: string }

const EXPLAIN: Record<string, string> = {
  SyntaxError: 'Python не понимает, как записана строка. Проверь скобки, кавычки, двоеточия.',
  IndentationError: 'Неправильные отступы: внутри блока строки сдвигаются на 4 пробела.',
  NameError: 'Такого имени нет. Возможно, опечатка или переменная ещё не создана.',
  TypeError: 'Операция не подходит к типам. Например, нельзя сложить число и строку.',
  ValueError: 'Значение не подходит. Например, int("abc") не превратится в число.',
  ZeroDivisionError: 'Делить на ноль нельзя.',
  EOFError: 'Программа просит ввод, а данных больше нет. Возможно, лишний input().',
  IndexError: 'Такого номера нет в последовательности.',
}

export function ErrorCard({ e }: { e: ErrorInfo }) {
  return (
    <div className="errcard">
      <b>Что это значит? {e.type}{e.line ? `, строка ${e.line}` : ''}</b>
      <div>{EXPLAIN[e.type] ?? 'Прочитай последнюю строку ошибки: там написано, что не так.'}</div>
    </div>
  )
}
