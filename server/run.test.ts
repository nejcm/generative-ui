import { Hono } from 'hono'
import { afterEach, expect, test, vi } from 'vitest'
import { readNdjson, type RunEvent } from '../src/lib/ndjson.ts'
import { run } from './run.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('Anthropic requests cache the system block and forward cache usage', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test')
  const requests: { system: unknown }[] = []
  vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)))
    const usage = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 1024 }
    const chunks = [
      { type: 'message_start', message: { id: 'm1', model: 'claude-haiku-5-5', role: 'assistant', usage } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { ...usage, output_tokens: 3 } },
      { type: 'message_stop' },
    ]
    return new Response(chunks.map((chunk) => `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  })
  const api = new Hono().post('/', run)
  const res = await api.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId: 'r1', modelId: 'claude-haiku-5-5', settings: {}, system: 'System prompt', prompt: 'Login form', output: { kind: 'text' } }),
  })
  const events: RunEvent[] = []
  for await (const event of readNdjson(res.body!)) events.push(event)
  expect(requests[0].system).toEqual([{ type: 'text', text: 'System prompt', cache_control: { type: 'ephemeral' } }])
  expect(events[0]).toEqual({ t: 'usage', inputTokens: 1034, outputTokens: 3, cachedInputTokens: 1024, cacheWriteTokens: 0 })
  expect(events[1]).toMatchObject({ t: 'done', startupMs: 0, firstByteMs: expect.any(Number) })
})
