import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, expect, test, vi } from 'vitest'
import { readNdjson, type RunEvent } from '../src/lib/ndjson.ts'
import { app } from './index.ts'

const mock = vi.hoisted(() => ({ model: undefined as unknown }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => mock.model }))

afterEach(() => vi.unstubAllEnvs())

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 3, text: 3, reasoning: undefined },
}

const runBody = (output: object = { kind: 'text' }) =>
  JSON.stringify({ runId: 'r1', modelId: 'claude-haiku-5-5', settings: {}, system: 'sys', prompt: 'hi', output })

const post = (body: string, signal?: AbortSignal) =>
  app.request('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal })

test('GET /api/health', async () => {
  const res = await app.request('/api/health')
  expect(await res.json()).toEqual({ ok: true })
})

test('GET /api/models lists only models whose provider key is set', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test')
  vi.stubEnv('OPENAI_API_KEY', '')
  const ids = ((await (await app.request('/api/models')).json()) as { id: string }[]).map((m) => m.id)
  expect(ids).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
})

test('POST /api/run streams deltas, usage and done as NDJSON', async () => {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: '0' },
    { type: 'text-delta', id: '0', delta: '{"a":' },
    { type: 'text-delta', id: '0', delta: '1}' },
    { type: 'text-end', id: '0' },
    { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'end_turn' } },
  ]
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: new ReadableStream({ start: (c) => (parts.forEach((p) => c.enqueue(p)), c.close()) }) }),
  })
  mock.model = model
  const res = await post(runBody({ kind: 'json-schema', schema: { type: 'object' } }))
  expect(res.headers.get('content-type')).toBe('application/x-ndjson')
  expect(res.headers.get('x-strict-output')).toBe('true')
  const events: RunEvent[] = []
  for await (const e of readNdjson(res.body!)) events.push(e)
  expect(events.slice(0, 3)).toEqual([
    { t: 'delta', text: '{"a":' },
    { t: 'delta', text: '1}' },
    { t: 'usage', inputTokens: 10, outputTokens: 3 },
  ])
  expect(events[3]).toMatchObject({ t: 'done', ttftMs: expect.any(Number), totalMs: expect.any(Number) })
  expect(model.doStreamCalls[0].responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } })
})

test('aborting the request aborts the upstream model call', async () => {
  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(c) {
          c.enqueue({ type: 'text-start', id: '0' })
          c.enqueue({ type: 'text-delta', id: '0', delta: 'partial' })
          abortSignal?.addEventListener('abort', () => c.error(abortSignal.reason))
        },
      }),
    }),
  })
  mock.model = model
  const client = new AbortController()
  const res = await post(runBody(), client.signal)
  const events = readNdjson(res.body!)
  expect((await events.next()).value).toEqual({ t: 'delta', text: 'partial' })
  client.abort()
  await vi.waitFor(() => expect(model.doStreamCalls[0].abortSignal?.aborted).toBe(true))
})

test('a model error ends the stream with a single error event', async () => {
  mock.model = new MockLanguageModelV4({ doStream: async () => Promise.reject(new Error('boom')) })
  const events: RunEvent[] = []
  for await (const e of readNdjson((await post(runBody())).body!)) events.push(e)
  expect(events).toEqual([{ t: 'error', message: 'boom' }])
})

test('POST /api/run rejects an unknown model', async () => {
  const res = await post(JSON.stringify({ ...JSON.parse(runBody()), modelId: 'nope' }))
  expect(res.status).toBe(400)
})

test('mutating routes reject foreign origins and non-JSON bodies', async () => {
  const req = (headers: Record<string, string>) => app.request('http://localhost:5173/api/runs/x', { method: 'PATCH', headers, body: '{}' })
  expect((await req({ 'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:5173' })).status).toBe(403)
  expect((await req({ 'content-type': 'application/json', origin: 'null', host: 'localhost:5173' })).status).toBe(403)
  expect((await req({ 'content-type': 'text/plain', host: 'localhost:5173' })).status).toBe(415)
  expect((await req({ 'content-type': 'application/json', origin: 'http://localhost:5173', host: 'localhost:5173' })).status).toBe(404)
})

test('the Vite proxy keeps Host, so proxied same-origin requests pass and rebinding hosts do not', async () => {
  const { default: config } = await import('../vite.config.ts')
  expect(config.server?.proxy?.['/api']).toEqual({ target: 'http://127.0.0.1:8787' })
  const req = (origin: string, host: string) =>
    app.request('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json', origin, host }, body: '{}' })
  expect((await req('http://localhost:5173', 'localhost:5173')).status).toBe(400)
  expect((await req('http://localhost:5173', '127.0.0.1:8787')).status).toBe(403)
  expect((await req('http://evil.test:8787', 'evil.test:8787')).status).toBe(403)
})

test('originless requests still need a loopback Host', async () => {
  const get = (host: string) => app.request('/api/health', { headers: { host } })
  expect((await get('evil.test:8787')).status).toBe(403)
  expect((await get('localhost:5173')).status).toBe(200)
  expect((await get('127.0.0.1:8787')).status).toBe(200)
})
