export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    let m = String(r.status)
    try { m = (await r.json()).error ?? m } catch {}
    throw new Error(m)
  }
  return r.json()
}

export type Task = {
  id: string; type: string; title: string; level: number; required?: boolean
  statement: string; input_format?: string; output_format?: string; starter?: string
  examples?: { input: string; output: string }[]; hints?: string[]
  has_tests: boolean; status: string; attempts: number; last_result?: any[] | null
}
export type Lesson = { meta: { title: string; subtitle?: string; goal?: string }; markdown: string; tasks: Task[]; manual?: boolean }
