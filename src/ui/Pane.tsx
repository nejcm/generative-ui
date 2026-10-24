import { useEffect, useRef, useState } from 'react'
import { approachById, approaches, parseAll, type Approach, type ParseState } from '@/approaches'
import { catalog } from '@/catalog/catalog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cost, runCost, type Usage } from '@/lib/cost'
import { sha256 } from '@/lib/hash'
import { readNdjson, type RunEvent } from '@/lib/ndjson'
import { strictOutputOf, type Run } from '@/lib/run'
import { models as registry, type Model } from '@/models'
import { fixtures } from '@/prompts'
import { Choice } from './Choice'
import { MetricsStrip } from './MetricsStrip'
import { Result } from './Result'
import { SystemPromptPanel } from './SystemPromptPanel'

export type PaneConfig = {
  key: string
  approach: Approach['id']
  modelId: string
  settings: { temperature?: number; effort?: string }
  systemOverride?: string
}

export type RunRequest = { batchId: string; prompt: string; presetId?: string; fixtureId?: string }

type Props = {
  config: PaneConfig
  models: Model[]
  draft: Omit<RunRequest, 'batchId'>
  batch?: RunRequest
  stopTick: number
  loaded?: Run
  onChange: (config: PaneConfig) => void
  onRemove?: () => void
}

const json = { 'content-type': 'application/json' }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Pane({ config, models, draft, batch, stopTick, loaded, onChange, onRemove }: Props) {
  const approach = approachById(config.approach) ?? approaches[0]
  const model = models.find((m) => m.id === config.modelId) ?? models[0]
  const effort = config.settings.effort && model?.supports.effort?.includes(config.settings.effort) ? config.settings.effort : undefined
  const [result, setResult] = useState<{ approach: Approach; state: ParseState }>()
  const [metrics, setMetrics] = useState<Partial<Run['metrics']>>({})
  const [shownModelId, setShownModelId] = useState<string>()
  const [saved, setSaved] = useState<Pick<Run, 'id' | 'rating' | 'notes'>>()
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState('')
  const controllerRef = useRef<AbortController>(undefined)
  const seenBatch = useRef(batch)

  async function start(req: RunRequest) {
    if (!model) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => controllerRef.current === controller
    const fixture = req.fixtureId ? fixtures[req.fixtureId] : undefined
    const system = config.systemOverride ?? approach.systemPrompt({ catalog, fixture })
    const { temperature } = config.settings
    const settings = { temperature: model.supports.temperature ? temperature : undefined, effort }
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const parser = approach.createParser()
    let state: ParseState = { renderable: false, errors: [] }
    let rawOutput = ''
    let ttfrMs: number | null = null
    let usage: Usage | undefined
    let strictOutput: boolean | null = null
    let done: Extract<RunEvent, { t: 'done' }> | undefined
    let failure: string | undefined

    setRunning(true)
    setRunKey(id)
    setResult({ approach, state })
    setMetrics({})
    setShownModelId(model.id)
    setSaved(undefined)
    setNotice('')
    const started = performance.now()
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ runId: id, modelId: model.id, settings, system, prompt: req.prompt, output: approach.output }),
        signal: controller.signal,
      })
      strictOutput = strictOutputOf(res.headers)
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
      for await (const event of readNdjson(res.body)) {
        if (event.t === 'delta') {
          rawOutput += event.text
          state = await parser.push(event.text)
          if (state.renderable && ttfrMs === null) {
            ttfrMs = performance.now() - started
            if (isCurrent()) setMetrics({ ttfrMs })
          }
          if (isCurrent()) setResult({ approach, state })
        } else if (event.t === 'usage') usage = event
        else if (event.t === 'done') done = event
        else failure = event.message
      }
    } catch (e) {
      if (!controller.signal.aborted) failure = message(e)
    }
    state = await parser.end().catch((e: unknown) => ({ ...state, errors: [...state.errors, { at: 'parser', message: message(e) }] }))
    if (state.renderable && ttfrMs === null) ttfrMs = performance.now() - started
    const errors = failure ? [...state.errors, { at: 'transport', message: failure }] : state.errors
    const aborted = controller.signal.aborted
    const run: Run = {
      id,
      createdAt,
      batchId: req.batchId,
      approach: approach.id,
      modelId: model.id,
      settings,
      presetId: req.presetId,
      prompt: req.prompt,
      fixtureId: req.fixtureId,
      system,
      systemHash: await sha256(system),
      systemOverridden: config.systemOverride !== undefined,
      strictOutput,
      rawOutput,
      metrics: {
        ttftMs: done?.ttftMs ?? null,
        ttfrMs,
        totalMs: done?.totalMs ?? performance.now() - started,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costUsd: usage ? cost(model, usage) : null,
        valid: !aborted && errors.length === 0,
        errorCount: errors.length,
        errors,
        aborted,
      },
    }
    if (isCurrent()) {
      setResult({ approach, state })
      setMetrics(run.metrics)
      setRunning(false)
    }
    const res = await fetch('/api/runs', { method: 'POST', headers: json, body: JSON.stringify(run) }).catch((e: unknown) => message(e))
    if (!isCurrent()) return
    if (typeof res !== 'string' && res.ok) setSaved({ id })
    else setNotice(`Run not saved: ${typeof res === 'string' ? res : ((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)}`)
  }

  async function patch(update: { rating?: number; notes?: string }) {
    if (!saved) return
    const res = await fetch(`/api/runs/${saved.id}`, { method: 'PATCH', headers: json, body: JSON.stringify(update) }).catch(() => undefined)
    if (res?.ok) setSaved((s) => s && { ...s, ...update })
    else setNotice('Rating not saved')
  }

  useEffect(() => {
    if (!batch || batch === seenBatch.current) return
    seenBatch.current = batch
    start(batch)
  })

  useEffect(() => {
    if (stopTick) controllerRef.current?.abort()
  }, [stopTick])

  useEffect(() => () => controllerRef.current?.abort(), [])

  useEffect(() => {
    if (!loaded) return
    const shown = approachById(loaded.approach)!
    parseAll(shown, loaded.rawOutput).then((state) => {
      setRunKey(loaded.id)
      setResult({ approach: shown, state })
      setMetrics(loaded.metrics)
      setShownModelId(loaded.modelId)
      setSaved({ id: loaded.id, rating: loaded.rating, notes: loaded.notes })
    })
  }, [loaded])

  const shownModel = registry.find((m) => m.id === shownModelId)
  const set = (settings: PaneConfig['settings']) => onChange({ ...config, settings: { ...config.settings, ...settings } })

  return (
    <Card className="min-w-0 flex-1">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex w-full gap-2">
          <Choice
            label="Approach"
            value={approach.id}
            options={approaches.map((a) => ({ value: a.id, label: a.label }))}
            onChange={(id) => onChange({ ...config, approach: id, systemOverride: undefined })}
          />
          {onRemove && (
            <Button variant="ghost" onClick={onRemove} aria-label="Remove pane">
              ✕
            </Button>
          )}
        </div>
        <div className="flex w-full gap-2">
          {model && (
            <Choice label="Model" value={model.id} options={models.map((m) => ({ value: m.id, label: m.label }))} onChange={(modelId) => onChange({ ...config, modelId })} />
          )}
          {model?.supports.temperature && (
            <Input
              type="number"
              aria-label="Temperature"
              placeholder="temp"
              min={0}
              max={2}
              step={0.1}
              className="w-20"
              value={config.settings.temperature ?? ''}
              onChange={(e) => set({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          )}
          {model?.supports.effort?.length ? (
            <Choice
              label="Effort"
              value={effort ?? ''}
              options={[{ value: '', label: 'default' }, ...model.supports.effort.map((e) => ({ value: e, label: e }))]}
              onChange={(e) => set({ effort: e || undefined })}
            />
          ) : null}
          {running ? (
            <Button variant="destructive" onClick={() => controllerRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button disabled={!model || !draft.prompt.trim()} onClick={() => start({ ...draft, batchId: crypto.randomUUID() })}>
              Run
            </Button>
          )}
        </div>
        {model && !model.price && (
          <p className="text-xs text-muted-foreground">
            Runs via your local CLI: start-up latency skews TTFT/TTFR,{' '}
            {model.provider === 'opencode'
              ? 'OpenCode adds environment details (working directory, model name) to the system prompt and sends each reply whole, all tools are denied, /etc/opencode and org well-known config still load, Go bills your credit balance past its quota if Extra Usage is on,'
              : 'the harness adds its own context (Codex may include your global AGENTS instructions), runs are read-only sandboxed but not tool-free,'}{' '}
            and usage counts against your plan.
          </p>
        )}
        <SystemPromptPanel
          generated={approach.systemPrompt({ catalog, fixture: draft.fixtureId ? fixtures[draft.fixtureId] : undefined })}
          override={config.systemOverride}
          onOverride={(systemOverride) => onChange({ ...config, systemOverride })}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <MetricsStrip metrics={metrics} cost={runCost(shownModel, metrics.costUsd ?? null)} saved={saved} onRate={(rating) => patch({ rating })} onNotes={(notes) => patch({ notes })} />
        {notice && <p className="text-xs text-destructive">{notice}</p>}
        {result && <Result key={runKey} approach={result.approach} state={result.state} errors={metrics.errors ?? result.state.errors} />}
      </CardContent>
    </Card>
  )
}
