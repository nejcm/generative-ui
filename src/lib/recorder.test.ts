import { afterEach, expect, test, vi } from 'vitest'
import { approaches, type ParseState } from '@/approaches'
import type { Model } from '@/models'
import type { RunEvent } from './ndjson'
import { frames } from './playback'
import { record, type Progress, type RunInput, type Transport } from './recorder'

const html = approaches.find((a) => a.id === 'html')!
const model: Model = {
  id: 'm',
  provider: 'anthropic',
  modelName: 'm',
  label: 'M',
  price: { inPerMTok: 1, outPerMTok: 2, source: 'test', checkedAt: '2026-10-25' },
  supports: { strictJson: false, temperature: false },
}
const input = (approach = html): RunInput => ({
  id: 'r1',
  createdAt: '2026-10-25T00:00:00.000Z',
  request: { batchId: 'b1', prompt: 'p' },
  approach,
  model,
  settings: {},
  system: 'sys',
  systemOverridden: false,
})
const failing = {
  ...html,
  createParser: () => {
    const parser = html.createParser()
    let pushes = 0
    return { push: (text: string) => (++pushes === 2 ? Promise.reject(new Error('boom')) : parser.push(text)), end: () => parser.end() }
  },
}
const delta = (text: string): RunEvent => ({ t: 'delta', text })
const usage: RunEvent = { t: 'usage', inputTokens: 1000, outputTokens: 500 }
const done: RunEvent = { t: 'done', ttftMs: 5, totalMs: 100 }

// Each event is [clock ms when it arrives, event]; abortAt aborts before that index, as a cancelled fetch would.
function scripted(script: [number, RunEvent][], abortAt?: number) {
  let clock = 0
  const controller = new AbortController()
  const transport: Transport = async (_, signal) => ({
    strictOutput: true,
    events: (async function* () {
      for (const [i, [t, event]] of script.entries()) {
        if (i === abortAt) controller.abort()
        if (signal.aborted) throw new DOMException('aborted', 'AbortError')
        clock = t
        yield event
      }
    })(),
  })
  return { transport, now: () => clock, signal: controller.signal }
}
const run = (script: [number, RunEvent][], approach = html, abortAt?: number, onProgress: (p: Progress) => void = () => {}) =>
  record(input(approach), onProgress, scripted(script, abortAt))

test('happy path records metrics, cost, ttfr and valid', async () => {
  const progress: Progress[] = []
  const result = await run([[10, delta('<p>hi')], [20, delta('</p>')], [30, usage], [40, done]], html, undefined, (p) => progress.push(p))
  expect(result.rawOutput).toBe('<p>hi</p>')
  expect(result.deltas).toEqual([[10, '<p>hi'], [20, '</p>']])
  expect(result.strictOutput).toBe(true)
  expect(result.systemHash).toMatch(/^[0-9a-f]{64}$/)
  expect(result.metrics).toMatchObject({ ttftMs: 5, ttfrMs: 10, totalMs: 100, inputTokens: 1000, outputTokens: 500, outputChars: 9, costUsd: 0.002, valid: true, errors: [], aborted: false })
  expect(progress.at(-1)).toEqual({ raw: '<p>hi</p>', state: { html: '<p>hi</p>', renderable: true, errors: [] }, gotDelta: true, ttfrMs: 10 })
})

test('phases from done and reasoning tokens from usage are recorded', async () => {
  const result = await run([[10, delta('<p>hi</p>')], [20, { ...usage, reasoningTokens: 50 }], [30, { ...done, startupMs: 1, firstByteMs: 2, firstReasoningMs: 3 }]])
  expect(result.metrics).toMatchObject({ startupMs: 1, firstByteMs: 2, firstReasoningMs: 3, reasoningTokens: 50, outputTokens: 500 })
})

test('raw progress arrives before a slow parse resolves', async () => {
  let resolve: (state: ParseState) => void = () => {}
  const slow = { ...html, createParser: () => ({ ...html.createParser(), push: () => new Promise<ParseState>((r) => (resolve = r)) }) }
  const progress: Progress[] = []
  const pending = run([[10, delta('<p>hi')], [20, done]], slow, undefined, (p) => progress.push(p))
  await vi.waitFor(() => expect(progress).toEqual([{ raw: '<p>hi', state: { renderable: false, errors: [] }, gotDelta: true }]))
  resolve({ html: '<p>hi', renderable: true, errors: [] })
  expect((await pending).metrics.ttfrMs).toBe(10)
})

test('an empty delta counts as a delta, and no delta never does', async () => {
  const progress: Progress[] = []
  await run([[10, delta('')], [20, done]], html, undefined, (p) => progress.push(p))
  expect(progress.map((p) => p.gotDelta)).not.toContain(false)
  progress.length = 0
  await run([[20, done]], html, undefined, (p) => progress.push(p))
  expect(progress.map((p) => p.gotDelta)).toEqual([false])
})

test('warnings keep a run valid and are counted', async () => {
  const markup = approaches.find((a) => a.id === 'markup')!
  const result = await run([[10, delta('<Stack gap="lg" className="x"/>')], [20, done]], markup)
  expect(result.metrics).toMatchObject({ valid: true, errorCount: 1, warningCount: 1 })
})

test('a parser throw is a parser error, keeps the raw output and is not a transport error', async () => {
  const result = await run([[10, delta('<p>hi')], [20, delta('</p>')], [30, delta('<p>more')], [40, done]], failing)
  expect(result.rawOutput).toBe('<p>hi</p><p>more')
  expect(result.metrics.errors).toEqual([{ at: 'parser', message: 'boom' }])
  expect(result.metrics.valid).toBe(false)
})

test('an error event is a transport error', async () => {
  const result = await run([[10, delta('<p>hi')], [20, { t: 'error', message: 'rate limited' }]])
  expect(result.metrics.errors).toEqual([{ at: 'transport', message: 'rate limited' }])
  expect(result.metrics.valid).toBe(false)
})

test('EOF without done is a transport error timed by the clock', async () => {
  const result = await run([[10, delta('<p>hi')], [25, usage]])
  expect(result.metrics.errors).toEqual([{ at: 'transport', message: 'stream ended without done' }])
  expect(result.metrics).toMatchObject({ valid: false, totalMs: 25, ttftMs: null })
})

test('abort mid-stream is aborted and invalid with no transport error', async () => {
  const result = await run([[10, delta('<p>hi')], [20, delta('</p>')], [30, done]], html, 1)
  expect(result.rawOutput).toBe('<p>hi')
  expect(result.metrics).toMatchObject({ aborted: true, valid: false, errors: [], totalMs: 10 })
})

afterEach(() => vi.unstubAllGlobals())

test('a non-OK response keeps the server error message', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ error: 'model not available' }, { status: 400 }))
  const result = await record(input(), () => {}, { signal: new AbortController().signal, now: () => 0 })
  expect(result.metrics.errors).toContainEqual({ at: 'transport', message: 'model not available' })
  expect(result).toMatchObject({ rawOutput: '', metrics: { valid: false, ttfrMs: null } })
})

test('record and frames agree on the final errors for a throwing parser', async () => {
  const script: [number, RunEvent][] = [[10, delta('<p>hi')], [20, delta('</p>')], [30, delta('<p>more')], [40, done]]
  const result = await run(script, failing)
  const last = (await frames(failing, result.deltas!)).at(-1)!
  expect(last.state.errors).toEqual(result.metrics.errors)
})
