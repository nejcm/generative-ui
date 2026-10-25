import { useEffect, useRef, useState } from 'react'
import { approachById, approaches, parseAll, type Approach, type ParseState } from '@/approaches'
import { catalog } from '@/catalog/catalog'
import { ChevronLeft, ChevronRight, Square } from 'lucide-react'
import { runCost } from '@/lib/cost'
import { whenCurrent } from '@/lib/playback'
import { record, type RunRequest } from '@/lib/recorder'
import type { Run } from '@/lib/run'
import { models as registry, type Model } from '@/models'
import { fixtures } from '@/prompts'
import { Choice } from './Choice'
import { MetricsStrip } from './MetricsStrip'
import { Replay } from './Replay'
import { ApBadge, Collapsible, Errors, Indicator, live, Seg, statusOf, words, type LaneSummary } from './bits'
import { Result, stripOf, type OutputView } from './Result'
import { SystemPromptPanel } from './SystemPromptPanel'

export type PaneConfig = {
  key: string
  approach: Approach['id']
  modelId: string
  settings: { temperature?: number; effort?: string }
  systemOverride?: string
}

type Props = {
  config: PaneConfig
  models: Model[]
  draft: Omit<RunRequest, 'batchId'>
  batch?: RunRequest
  stopTick: number
  loaded?: Run
  onChange: (config: PaneConfig) => void
  view?: 'focus' | 'compare' | 'hidden'
  index?: number
  count?: number
  mode?: 'focus' | 'compare'
  onMode?: (mode: 'focus' | 'compare') => void
  onNav?: (delta: number) => void
  onFocus?: () => void
  onSummary?: (summary: LaneSummary) => void
}

const json = { 'content-type': 'application/json' }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const priceLine = (m?: Model) => (m ? (m.price ? `$${m.price.inPerMTok} in · $${m.price.outPerMTok} out per MTok` : (m.plan ?? 'subscription')) : '')
const settingsLine = (s: Run['settings']) => [s.effort ? `effort ${s.effort}` : 'default effort', s.temperature != null && `temp ${s.temperature}`].filter(Boolean).join(' · ')

export function Pane(props: Props) {
  const { config, models, draft, batch, stopTick, loaded, onChange, view = 'focus', index = 0, count = 1, mode = 'focus', onMode, onNav, onFocus, onSummary } = props
  const approach = approachById(config.approach) ?? approaches[0]
  const model = models.find((m) => m.id === config.modelId) ?? models[0]
  const effort = config.settings.effort && model?.supports.effort?.includes(config.settings.effort) ? config.settings.effort : undefined
  const [result, setResult] = useState<{
    approach: Approach
    state: ParseState
  }>()
  const [metrics, setMetrics] = useState<Partial<Run['metrics']>>({})
  const [shownModelId, setShownModelId] = useState<string>()
  const [saved, setSaved] = useState<Pick<Run, 'id' | 'rating' | 'notes'>>()
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState('')
  const [replay, setReplay] = useState<Run>()
  const [raw, setRaw] = useState('')
  const [gotDelta, setGotDelta] = useState(false)
  const [startedAt, setStartedAt] = useState<number>()
  const [now, setNow] = useState(0)
  const [outView, setOutView] = useState<OutputView>('rendered')
  const controllerRef = useRef<AbortController>(undefined)
  const cancelLoad = useRef<() => void>(undefined)
  const seenBatch = useRef(batch)

  async function start(req: RunRequest) {
    if (!model) return
    controllerRef.current?.abort()
    cancelLoad.current?.()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => controllerRef.current === controller
    const fixture = req.fixtureId ? fixtures[req.fixtureId] : undefined
    const system = config.systemOverride ?? approach.systemPrompt({ catalog, fixture })
    const { temperature } = config.settings
    const settings = {
      temperature: model.supports.temperature ? temperature : undefined,
      effort,
    }
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    setRunning(true)
    setRunKey(id)
    setReplay(undefined)
    setResult({ approach, state: { renderable: false, errors: [] } })
    setMetrics({})
    setShownModelId(model.id)
    setSaved(undefined)
    setNotice('')
    setRaw('')
    setGotDelta(false)
    setStartedAt(performance.now())
    const run = await record(
      { id, createdAt, request: req, approach, model, settings, system, systemOverridden: config.systemOverride !== undefined },
      ({ raw, state, gotDelta, ttfrMs }) => {
        if (!isCurrent()) return
        setRaw(raw)
        setGotDelta(gotDelta)
        setResult({ approach, state })
        if (ttfrMs !== undefined) setMetrics({ ttfrMs })
      },
      { signal: controller.signal },
    )
    if (isCurrent()) {
      setMetrics(run.metrics)
      setRunning(false)
    }
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: json,
      body: JSON.stringify(run),
    }).catch((e: unknown) => message(e))
    if (!isCurrent()) return
    if (typeof res !== 'string' && res.ok) setSaved({ id })
    else setNotice(`Run not saved: ${typeof res === 'string' ? res : ((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)}`)
  }

  async function patch(update: { rating?: number; notes?: string }) {
    if (!saved) return
    const res = await fetch(`/api/runs/${saved.id}`, {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify(update),
    }).catch(() => undefined)
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
    cancelLoad.current = whenCurrent(parseAll(shown, loaded.rawOutput), (state) => {
      setRunKey(loaded.id)
      setReplay(loaded.deltas ? loaded : undefined)
      setResult({ approach: shown, state })
      setMetrics(loaded.metrics)
      setShownModelId(loaded.modelId)
      setSaved({ id: loaded.id, rating: loaded.rating, notes: loaded.notes })
      setRaw(loaded.rawOutput)
      setGotDelta(loaded.rawOutput.length > 0)
      setStartedAt(undefined)
    })
    return cancelLoad.current
  }, [loaded])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [running])

  const shownModel = registry.find((m) => m.id === shownModelId)
  const set = (settings: PaneConfig['settings']) => onChange({ ...config, settings: { ...config.settings, ...settings } })
  const shownApproach = result?.approach ?? approach
  const status = statusOf(running, gotDelta, Boolean(result?.state.renderable), metrics)
  const runCostShown = runCost(shownModel, metrics.costUsd ?? null)
  const elapsedMs = running && startedAt !== undefined ? Math.max(0, now - startedAt) : undefined
  const errors = metrics.errors ?? result?.state.errors ?? []
  const strip = stripOf(status, errors)
  const settings = settingsLine({ effort, temperature: model?.supports.temperature ? config.settings.temperature : undefined })

  const summaryKey = JSON.stringify([status, metrics.ttfrMs, metrics.totalMs, metrics.errorCount, shownModelId ?? model?.id, shownApproach.id, saved, settings, startedAt])
  useEffect(() => {
    onSummary?.({ status, metrics, approach: shownApproach.id, modelId: shownModelId ?? model?.id, startedAt, savedId: saved?.id, rating: saved?.rating, cost: runCostShown, settings })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reports only when the summary content changes, not on every render
  }, [summaryKey])

  if (view === 'hidden') return null

  const output = replay ? (
    <Replay key={replay.id} run={replay} view={outView} status={status} />
  ) : (
    <Result
      key={runKey}
      approach={shownApproach}
      state={result?.state ?? { renderable: false, errors: [] }}
      raw={raw}
      view={outView}
      live={live(status)}
      compact={view === 'compare'}
      strip={strip}
    />
  )

  if (view === 'compare')
    return (
      <div className="min-w-0">
        <button type="button" className="pane-h" onClick={onFocus}>
          <span className="lbl">{index + 1}</span>
          <ApBadge approach={shownApproach} />
          <span className="name">{(shownModel ?? model)?.label}</span>
          <span className="ml-auto">
            <Indicator status={status} />
          </span>
        </button>
        {output}
      </div>
    )

  const runButton = running ? (
    <button type="button" className="btn" onClick={() => controllerRef.current?.abort()}>
      <Square size={12} /> Stop run
    </button>
  ) : (
    <button type="button" className="btn" disabled={!model || !draft.prompt.trim()} onClick={() => start({ ...draft, batchId: crypto.randomUUID() })}>
      Run only this
    </button>
  )

  return (
    <section className="panel stage" aria-label={`Run ${index + 1}`}>
      <div className="stage-h">
        <ApBadge approach={shownApproach} large />
        <div className="who">
          <b>
            Run {index + 1} of {count} · {(shownModel ?? model)?.label ?? 'no model'}
          </b>
          <small>{priceLine(shownModel ?? model)}</small>
        </div>
        <Indicator status={status} />
        <div className="acts">
          {onMode && (
            <Seg
              label="Stage mode"
              value={mode}
              options={[
                { value: 'focus', label: 'Focus' },
                { value: 'compare', label: 'Compare' },
              ]}
              onChange={onMode}
            />
          )}
          {onNav && (
            <>
              <button type="button" className="btn btn-ico" aria-label="Previous run" disabled={index === 0} onClick={() => onNav(-1)}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="btn btn-ico" aria-label="Next run" disabled={index === count - 1} onClick={() => onNav(1)}>
                <ChevronRight size={14} />
              </button>
            </>
          )}
          {runButton}
        </div>
      </div>
      <div className="cfg">
        <label>
          <span className="lbl">Approach</span>
          <Choice
            label="Approach"
            value={approach.id}
            options={approaches.map((a) => ({ value: a.id, label: a.label }))}
            onChange={(id) => onChange({ ...config, approach: id, systemOverride: undefined })}
          />
        </label>
        <label>
          <span className="lbl">Model</span>
          {model ? (
            <Choice label="Model" value={model.id} options={models.map((m) => ({ value: m.id, label: m.label }))} onChange={(modelId) => onChange({ ...config, modelId })} />
          ) : (
            <span className="muted">No models</span>
          )}
        </label>
        <label>
          <span className="lbl">Effort</span>
          {model?.supports.effort?.length ? (
            <Choice
              label="Effort"
              value={effort ?? ''}
              options={[{ value: '', label: 'default' }, ...model.supports.effort.map((e) => ({ value: e, label: e }))]}
              onChange={(e) => set({ effort: e || undefined })}
            />
          ) : (
            <span className="inp muted inline-flex items-center">n/a</span>
          )}
        </label>
        <label>
          <span className="lbl">Temperature</span>
          <input
            type="number"
            aria-label="Temperature"
            className="inp tnum"
            placeholder={model?.supports.temperature ? 'default' : 'n/a'}
            disabled={!model?.supports.temperature}
            min={0}
            max={2}
            step={0.1}
            value={model?.supports.temperature ? (config.settings.temperature ?? '') : ''}
            onChange={(e) =>
              set({
                temperature: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      </div>
      {model && !model.price && (
        <p className="caveat">
          Runs via your local CLI: start-up latency skews TTFT/TTFR,{' '}
          {model.provider === 'opencode'
            ? 'OpenCode adds environment details (working directory, model name) to the system prompt and sends each reply whole, opencode tool permissions are denied but plugins from an org well-known config you added can still run, runs refuse to start while a managed config exists (/etc/opencode, macOS /Library, Windows ProgramData), Go bills your credit balance past its quota if Extra Usage is on,'
            : 'the harness adds its own context, runs are read-only sandboxed but not tool-free,'}{' '}
          and usage counts against your plan.
        </p>
      )}
      <MetricsStrip metrics={metrics} cost={runCostShown} elapsedMs={elapsedMs} />
      <div className="flex flex-col gap-2">
        <div className="out-h">
          <Seg
            label="Output view"
            value={outView}
            options={[
              { value: 'rendered', label: 'Rendered' },
              { value: 'raw', label: 'Raw stream' },
              { value: 'split', label: 'Split' },
            ]}
            onChange={setOutView}
          />
          <span className="meta">{raw ? `${raw.length.toLocaleString('en-US')} chars streamed` : ''}</span>
        </div>
        {output}
      </div>
      <div className="foot">
        <div>
          <SystemPromptPanel
            generated={approach.systemPrompt({
              catalog,
              fixture: draft.fixtureId ? fixtures[draft.fixtureId] : undefined,
            })}
            override={config.systemOverride}
            onOverride={(systemOverride) => onChange({ ...config, systemOverride })}
          />
          {errors.length > 0 && (
            <Collapsible key={runKey} defaultOpen title={<span className="v-bad">{errors.length === 1 ? '1 error' : `${errors.length} errors`}</span>}>
              <Errors errors={errors} />
            </Collapsible>
          )}
        </div>
        <div className="judge">
          {notice && <div className="notice">{notice}</div>}
          <span className="lbl">Your rating</span>
          <div className="rates">
            <div role="group" aria-label="Rating" className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`rate${saved?.rating === n ? ' on' : ''}`}
                  disabled={!saved}
                  aria-pressed={saved?.rating === n}
                  aria-label={`Rate ${n}, ${words[n]}`}
                  onClick={() => patch({ rating: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="muted">{saved?.rating ? words[saved.rating] : saved ? 'Not rated' : ''}</span>
          </div>
          <input
            key={saved?.id}
            aria-label="Notes"
            placeholder="Notes on this output"
            className="inp"
            disabled={!saved}
            defaultValue={saved?.notes}
            onBlur={(e) => e.target.value !== (saved?.notes ?? '') && patch({ notes: e.target.value })}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            {saved ? `Saved to history · ${saved.id.slice(0, 8)}` : running ? 'Rating opens when the run is saved.' : status === 'idle' ? 'Run this lane to rate it.' : ''}
          </span>
        </div>
      </div>
    </section>
  )
}
