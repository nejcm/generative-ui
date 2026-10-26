import type { Usage } from './cost.ts'

// ms since the request started: CLI ready for the prompt, first model activity, first reasoning delta.
export type Phases = { startupMs?: number; firstByteMs?: number; firstReasoningMs?: number }

export type RunEvent =
  | { t: 'delta'; text: string }
  | ({ t: 'usage' } & Usage)
  | { t: 'done'; ttftMs: number | null; totalMs: number } & Phases
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
