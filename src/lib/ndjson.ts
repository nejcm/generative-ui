import type { Usage } from './cost.ts'

export type RunEvent =
  | { t: 'delta'; text: string }
  | ({ t: 'usage' } & Usage)
  | { t: 'done'; ttftMs: number | null; totalMs: number }
  | { t: 'error'; message: string }

export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<RunEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const bytes of body) {
    buffer += decoder.decode(bytes, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) if (line.trim()) yield JSON.parse(line)
  }
  buffer += decoder.decode()
  if (buffer.trim()) yield JSON.parse(buffer)
}
