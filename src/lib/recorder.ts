import type { Approach, ParseState } from '@/approaches'
import type { Model } from '@/models'
import { fixtures, presets } from '@/prompts'
import { cost, type Usage } from './cost'
import { coverage } from './coverage'
import { fidelity } from './fidelity'
import { sha256 } from './hash'
import { readNdjson, type RunEvent } from './ndjson'
import { fold } from './playback'
import { strictOutputOf, type Run } from './run'

export type RunRequest = {
  batchId: string
  prompt: string
  presetId?: string
  fixtureId?: string
}

export type RunInput = {
  id: string
  createdAt: string
  request: RunRequest
  approach: Approach
  model: Model
  settings: Run['settings']
  system: string
  systemOverridden: boolean
}

export type Progress = { raw: string; state: ParseState; gotDelta: boolean; ttfrMs?: number }

export type RunBody = { runId: string; modelId: string; settings: Run['settings']; system: string; prompt: string; output: Approach['output'] }

export type Transport = (body: RunBody, signal: AbortSignal) => Promise<{ events: AsyncIterable<RunEvent>; strictOutput: boolean | null }>

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const fetchTransport: Transport = async (body, signal) => {
  const res = await fetch('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  return { events: readNdjson(res.body), strictOutput: strictOutputOf(res.headers) }
}

export async function record(
  input: RunInput,
  onProgress: (p: Progress) => void,
  { signal, transport = fetchTransport, now = () => performance.now() }: { signal: AbortSignal; transport?: Transport; now?: () => number },
): Promise<Run> {
  const { id, createdAt, request, approach, model, settings, system, systemOverridden } = input
  const parse = fold(approach)
  let state: ParseState = { renderable: false, errors: [] }
  let rawOutput = ''
  const deltas: [number, string][] = []
  let ttfrMs: number | null = null
  let usage: Usage | undefined
  let strictOutput: boolean | null = null
  let done: Extract<RunEvent, { t: 'done' }> | undefined
  let failure: string | undefined
  const started = now()
  const emit = () => onProgress({ raw: rawOutput, state, gotDelta: deltas.length > 0, ttfrMs: ttfrMs ?? undefined })
  const progress = (next: ParseState) => {
    state = next
    if (state.renderable && ttfrMs === null) ttfrMs = now() - started
    emit()
  }
  try {
    const stream = await transport({ runId: id, modelId: model.id, settings, system, prompt: request.prompt, output: approach.output }, signal)
    strictOutput = stream.strictOutput
    for await (const event of stream.events) {
      if (event.t === 'delta') {
        rawOutput += event.text
        deltas.push([Math.round(now() - started), event.text])
        emit()
        progress(await parse.push(event.text))
      } else if (event.t === 'usage') usage = event
      else if (event.t === 'done') done = event
      else failure = event.message
    }
  } catch (e) {
    if (!signal.aborted) failure = message(e)
  }
  // The server always ends with done or error, so a bare EOF means the connection dropped.
  if (!done && failure === undefined && !signal.aborted) failure = 'stream ended without done'
  progress(await parse.end())
  const errors = failure ? [...state.errors, { at: 'transport', message: failure }] : state.errors
  const aborted = signal.aborted
  const fixture = request.fixtureId ? fixtures[request.fixtureId] : undefined
  return {
    id,
    createdAt,
    batchId: request.batchId,
    approach: approach.id,
    modelId: model.id,
    settings,
    presetId: request.presetId,
    prompt: request.prompt,
    fixtureId: request.fixtureId,
    system,
    systemHash: await sha256(system),
    systemOverridden,
    strictOutput,
    rawOutput,
    deltas,
    metrics: {
      ttftMs: done?.ttftMs ?? null,
      ttfrMs,
      totalMs: done?.totalMs ?? now() - started,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      cachedInputTokens: usage?.cachedInputTokens,
      cacheWriteTokens: usage?.cacheWriteTokens,
      outputChars: rawOutput.length,
      coverage: fixture === undefined ? undefined : coverage(fixture, rawOutput),
      fidelity: fidelity(state, presets.find((p) => p.id === request.presetId)?.requires),
      costUsd: usage ? cost(model, usage) : null,
      valid: !aborted && errors.length === 0,
      errorCount: errors.length,
      errors,
      aborted,
    },
  }
}
