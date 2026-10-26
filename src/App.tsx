import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BarChart3, Check, Copy, FlaskConical, History as HistoryIcon, Moon, Plug, Plus, Square, Sun, X } from 'lucide-react'
import { approachById, approaches } from '@/approaches'
import { DEMO, getJson, whenCurrent } from '@/lib/async'
import { usd } from '@/lib/cost'
import { pageFromPath, type Page } from '@/lib/page'
import type { Run, RunSummary } from '@/lib/run'
import type { RunRequest } from '@/lib/recorder'
import { models as registry, type Model, type Provider } from '@/models'
import { presets } from '@/prompts'
import { ApBadge, Indicator, live, Pips, secs, Seg, shortOf, type LaneSummary } from './ui/bits'
import { History, loadBatch } from './ui/History'
import { Stats } from './ui/Stats'
import { Pane, type PaneConfig } from './ui/Pane'
import { PromptBar } from './ui/PromptBar'
import { Timeline } from './ui/Timeline'

const PANES_KEY = 'playground.panes'
const newPane = (approach: PaneConfig['approach']): PaneConfig => ({
  key: crypto.randomUUID(),
  approach,
  modelId: '',
  // Benchmark: high effort bought latency, not validity. Pane ignores it for models without a "low" level.
  settings: { effort: 'low' },
})
const pageTitle: Record<Page, string> = {
  lab: 'Lab',
  history: 'History',
  stats: 'Stats',
}
const providers: [Provider, string][] = [
  ['anthropic', 'Anthropic API'],
  ['openai', 'OpenAI API'],
  ['claude-code', 'Claude Code CLI'],
  ['codex', 'Codex CLI'],
  ['opencode', 'OpenCode CLI'],
]

function loadPanes(): PaneConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PANES_KEY) ?? 'null')
    if (Array.isArray(stored) && stored.length >= 2) return stored
  } catch {
    // unreadable storage falls back to defaults
  }
  return [newPane('json-render'), newPane('flat-strict'), newPane('html')]
}

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return min < 1 ? 'now' : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`
}

function finding(panes: PaneConfig[], summaries: Record<string, LaneSummary>) {
  const lanes = panes.map((p) => summaries[p.key]).filter(Boolean)
  const running = lanes.filter((l) => live(l.status)).length
  if (running) return `${running} of ${panes.length} lanes streaming.`
  const ran = lanes.filter((l) => l.metrics.totalMs != null)
  if (!ran.length) return 'Run every lane on one prompt at once and compare how fast each reaches its first render.'
  const first = ran.filter((l) => l.metrics.ttfrMs != null).sort((a, b) => a.metrics.ttfrMs! - b.metrics.ttfrMs!)[0]
  const valid = ran.filter((l) => l.metrics.valid).length
  if (!first) return `No lane rendered anything; ${valid} of ${ran.length} valid.`
  const model = registry.find((m) => m.id === first.modelId)?.label ?? first.modelId
  return `${shortOf(approachById(first.approach)!)} on ${model} rendered first, at ${secs(first.metrics.ttfrMs)}. ${valid} of ${ran.length} valid.`
}

function toggleTheme(dark: boolean) {
  const theme = dark ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme
  localStorage.setItem('theme', theme)
}

export default function App() {
  const [page, setPage] = useState(() => pageFromPath(location.pathname, import.meta.env.BASE_URL))
  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(location.pathname, import.meta.env.BASE_URL))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function navigate(next: Page) {
    const path = `${import.meta.env.BASE_URL}${next === 'lab' ? '' : next}`
    if (location.pathname !== path) window.history.pushState(null, '', `${path}${location.search}${location.hash}`)
    setPage(next)
  }

  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const [provOpen, setProvOpen] = useState(false)
  useEffect(() => {
    if (!provOpen) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest('.pop-wrap')) setProvOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [provOpen])
  const [models, setModels] = useState<Model[] | undefined>(DEMO ? [] : undefined)
  const [panes, setPanes] = useState(loadPanes)
  const [loaded, setLoaded] = useState<Record<string, Run>>({})
  const [draft, setDraft] = useState<Omit<RunRequest, 'batchId'>>({
    prompt: '',
  })
  const [batch, setBatch] = useState<RunRequest>()
  const [stopTick, setStopTick] = useState(0)
  const [summaries, setSummaries] = useState<Record<string, LaneSummary>>({})
  const [focusKey, setFocusKey] = useState<string>()
  const [mode, setMode] = useState<'focus' | 'compare'>('focus')
  const [hiddenInCompare, setHiddenInCompare] = useState<string[]>([])
  const [recent, setRecent] = useState<RunSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (DEMO) return
    fetch('/api/models')
      .then((r) => r.json())
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PANES_KEY, JSON.stringify(panes))
    } catch {
      // convenience only
    }
  }, [panes])

  const savedKey = Object.values(summaries)
    .map((s) => `${s.savedId}:${s.rating}`)
    .join()
  useEffect(() => whenCurrent(getJson<RunSummary[]>('/api/runs'), setRecent, () => setRecent([])), [savedKey, page])

  function openBatch(runs: Run[], showLab = true) {
    const configs = runs.map((run) => ({
      key: crypto.randomUUID(),
      approach: run.approach,
      modelId: run.modelId,
      settings: run.settings as PaneConfig['settings'],
      systemOverride: run.systemOverridden ? run.system : undefined,
    }))
    const next = configs.length >= 2 ? configs : [...configs, newPane('html')]
    setPanes(next)
    setLoaded(Object.fromEntries(configs.map((c, i) => [c.key, runs[i]])))
    setDraft({
      prompt: runs[0].prompt,
      presetId: runs[0].presetId,
      fixtureId: runs[0].fixtureId,
    })
    setFocusKey(next[0].key)
    if (showLab) navigate('lab')
  }

  const openBatchId = (batchId: string) => loadBatch(batchId).then(openBatch, (e: Error) => setError(e.message))
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!DEMO || autoOpened.current || !recent.length) return
    autoOpened.current = true
    loadBatch(recent[0].batchId).then((runs) => openBatch(runs, false), (e: Error) => setError(e.message))
  })
  const focusIndex = Math.max(
    0,
    panes.findIndex((p) => p.key === focusKey),
  )
  const focused = panes[focusIndex]
  const anyLive = panes.some((p) => live(summaries[p.key]?.status))
  const canRun = Boolean(models?.length) && Boolean(draft.prompt.trim())
  const move = (i: number, delta: number) =>
    setPanes((ps) => {
      const next = [...ps]
      ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
      return next
    })

  const batches = [...new Map(recent.map((r) => [r.batchId, r])).values()].slice(0, 6)
  const toRate = DEMO ? 0 : recent.filter((r) => r.rating == null && !r.metrics.aborted).length

  return (
    <div className="gul shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="20" height="20">
              <rect x="5" y="7" width="22" height="4.5" rx="1.5" fill="#FFB224" />
              <rect x="5" y="13.75" width="15" height="4.5" rx="1.5" fill="currentColor" />
              <rect x="5" y="20.5" width="9" height="4.5" rx="1.5" fill="currentColor" />
            </svg>
          </span>
          <div>
            <b>Generative UI Lab</b>
            <small className="mono">{location.host}</small>
          </div>
        </div>
        <nav className="snav" aria-label="Pages">
          {(
            [
              ['lab', FlaskConical, null],
              ['history', HistoryIcon, toRate ? `${toRate} to rate` : null],
              ['stats', BarChart3, null],
            ] as const
          ).map(([id, Icon, count]) => (
            <button key={id} type="button" className={page === id ? 'on' : undefined} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}>
              <Icon size={16} />
              {pageTitle[id]}
              {count && <span className="cnt">{count}</span>}
            </button>
          ))}
        </nav>
        {batches.length > 0 && (
          <>
            <div className="sgroup">Recent batches</div>
            {batches.map((r) => (
              <button key={r.batchId} type="button" className="srow" title="Open batch in Lab" onClick={() => openBatchId(r.batchId)}>
                <span className="mono muted">{recent.filter((x) => x.batchId === r.batchId).length}</span>
                <span>{presets.find((p) => p.id === r.presetId)?.label ?? r.prompt}</span>
                <span className="muted">{ago(r.createdAt)}</span>
              </button>
            ))}
          </>
        )}
        <div className="sfoot">
          <div className="pop-wrap">
            <button type="button" aria-expanded={provOpen} onClick={() => setProvOpen((o) => !o)}>
              <Plug size={16} />
              Providers
            </button>
            {provOpen && (
              <div className="sub" role="menu" aria-label="Providers">
                {models &&
                  providers.map(([id, label]) => {
                    const on = models.some((m) => m.provider === id)
                    return (
                      <div key={id} className={on ? undefined : 'muted'}>
                        {on ? <Check size={13} className="v-ok" /> : <X size={13} />}
                        {label}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              toggleTheme(dark)
              setDark(!dark)
            }}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <nav className="crumbs" aria-label="Breadcrumbs">
            <span>Generative UI Lab</span>
            <span>/</span>
            <strong>{pageTitle[page]}</strong>
          </nav>
          <div className="mnav">
            <Seg
              label="Pages"
              value={page}
              options={[
                { value: 'lab', label: pageTitle.lab },
                { value: 'history', label: pageTitle.history },
                { value: 'stats', label: pageTitle.stats },
              ]}
              onChange={navigate}
            />
          </div>
        </header>
        <main className="sheet">
          {DEMO && (
            <div className="notice info" role="note">
              This is a static demo showcasing saved runs from a benchmark. It can't call models. Open a batch from the sidebar or History to compare approaches, or clone the repo to run your own prompts.
            </div>
          )}
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
          <div hidden={page !== 'lab'} className="flex flex-col gap-3.5">
            <div className="page-h">
              <div>
                <h1>Lab</h1>
                <p>{finding(panes, summaries)}</p>
              </div>
              <div className="acts">
                <button type="button" className="btn" disabled={!anyLive} onClick={() => setStopTick((t) => t + 1)}>
                  <Square size={12} /> Stop all
                </button>
                <button type="button" className="btn btn-pri" disabled={!canRun} onClick={() => setBatch({ ...draft, batchId: crypto.randomUUID() })}>
                  Run {panes.length} at once
                </button>
              </div>
            </div>
            {models?.length === 0 ? (
              <section className="panel" style={{ padding: 14 }}>
                <h2 style={{ fontSize: 14, fontWeight: 600 }}>No models available</h2>
                <p className="caveat" style={{ margin: '4px 0 8px' }}>
                  Add a provider key to .env and restart, or log in to the claude, codex or opencode CLI.
                </p>
                <pre className="sys">{'ANTHROPIC_API_KEY=sk-ant-…\nOPENAI_API_KEY=sk-…'}</pre>
              </section>
            ) : null}
            <PromptBar draft={draft} onChange={setDraft} />
            <Timeline panes={panes} summaries={summaries} focusKey={focused?.key} onFocus={setFocusKey} />
            <div className="lab">
              <div className="rail">
                <div className="rail-h">
                  <h2>Lanes</h2>
                  <span className="muted">{panes.length} of 4</span>
                  <button type="button" className="btn btn-sm ml-auto" disabled={panes.length >= 4} onClick={() => setPanes((ps) => [...ps, newPane('json-render')])}>
                    <Plus size={13} /> Add lane
                  </button>
                </div>
                {panes.map((config, i) => {
                  const s = summaries[config.key]
                  const approach = approachById(s?.approach ?? config.approach) ?? approaches[0]
                  const model = registry.find((m) => m.id === (s?.modelId ?? config.modelId))
                  const on = mode === 'focus' && config.key === focused?.key
                  return (
                    <div key={config.key} className={`ritem${on ? ' on' : ''}`}>
                      <button
                        type="button"
                        className="ritem-main"
                        aria-current={on ? 'true' : undefined}
                        onClick={() => {
                          setFocusKey(config.key)
                          setMode('focus')
                        }}
                      >
                        <span className="ritem-row">
                          <span className="lbl">{i + 1}</span>
                          <ApBadge approach={approach} />
                          <span className="name">{model?.label ?? 'Choose a model'}</span>
                          <span className="ml-auto">{s && <Indicator status={s.status} />}</span>
                        </span>
                        <span className="ritem-sub">
                          {shortOf(approach)} · {s?.settings ?? 'default effort'}
                        </span>
                        {s && s.metrics.totalMs != null && (
                          <span className="ritem-m">
                            <span>TTFR {secs(s.metrics.ttfrMs)}</span>
                            <span>{secs(s.metrics.totalMs)}</span>
                            <span>{usd(s.cost)}</span>
                            {s.metrics.errorCount ? <span className="v-bad">{s.metrics.errorCount} err</span> : null}
                            {s.savedId && <Pips rating={s.rating} />}
                          </span>
                        )}
                      </button>
                      {live(s?.status) && (
                        <div className="prog">
                          <span />
                        </div>
                      )}
                      {on && (
                        <div className="ritem-tools">
                          <button type="button" className="btn btn-sm btn-ico btn-ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp size={13} />
                          </button>
                          <button type="button" className="btn btn-sm btn-ico btn-ghost" aria-label="Move down" disabled={i === panes.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            disabled={panes.length >= 4}
                            onClick={() => setPanes((ps) => [...ps.slice(0, i + 1), { ...config, key: crypto.randomUUID() }, ...ps.slice(i + 1)])}
                          >
                            <Copy size={13} /> Duplicate
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ico btn-ghost"
                            aria-label="Remove lane"
                            disabled={panes.length <= 2}
                            onClick={() => setPanes((ps) => ps.filter((p) => p.key !== config.key))}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="flex min-w-0 flex-col gap-3.5">
                {mode === 'compare' && (
                  <Scorecard
                    panes={panes}
                    summaries={summaries}
                    hidden={hiddenInCompare}
                    onToggle={(key) => setHiddenInCompare((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
                    onFocus={(key) => {
                      setFocusKey(key)
                      setMode('focus')
                    }}
                    onMode={setMode}
                  />
                )}
                <div className={mode === 'compare' ? 'cmp-grid' : 'contents'}>
                  {panes.map((config, i) => (
                    <Pane
                      key={config.key}
                      config={config}
                      models={models ?? []}
                      draft={draft}
                      batch={batch}
                      stopTick={stopTick}
                      loaded={loaded[config.key]}
                      view={mode === 'compare' ? (hiddenInCompare.includes(config.key) ? 'hidden' : 'compare') : config.key === focused?.key ? 'focus' : 'hidden'}
                      index={i}
                      count={panes.length}
                      mode={mode}
                      onMode={setMode}
                      onNav={(d) => setFocusKey(panes[i + d]?.key)}
                      onFocus={() => {
                        setFocusKey(config.key)
                        setMode('focus')
                      }}
                      onSummary={(s) => setSummaries((all) => ({ ...all, [config.key]: s }))}
                      onChange={(next) => setPanes((ps) => ps.map((p) => (p.key === next.key ? next : p)))}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {page === 'history' && <History onOpenBatch={openBatch} />}
          {page === 'stats' && <Stats />}
        </main>
      </div>
    </div>
  )
}

type Column = {
  label: string
  value: (s: LaneSummary) => number | null | undefined
  format: (n: number) => string
  higher?: boolean
}
const columns: Column[] = [
  { label: 'TTFR', value: (s) => s.metrics.ttfrMs, format: (n) => secs(n) },
  {
    label: 'First token',
    value: (s) => s.metrics.ttftMs,
    format: (n) => secs(n),
  },
  { label: 'Total', value: (s) => s.metrics.totalMs, format: (n) => secs(n) },
  {
    label: 'Tokens out',
    value: (s) => s.metrics.outputTokens,
    format: (n) => n.toLocaleString('en-US'),
  },
  {
    label: 'Cost',
    value: (s) => (typeof s.cost === 'number' ? s.cost : null),
    format: (n) => usd(n),
  },
]

function Scorecard(props: {
  panes: PaneConfig[]
  summaries: Record<string, LaneSummary>
  hidden: string[]
  onToggle: (key: string) => void
  onFocus: (key: string) => void
  onMode: (mode: 'focus' | 'compare') => void
}) {
  const { panes, summaries, hidden, onToggle, onFocus, onMode } = props
  const best = columns.map((c) => Math.min(...panes.map((p) => (summaries[p.key] ? (c.value(summaries[p.key]) ?? Infinity) : Infinity))))
  return (
    <>
      <div className="stage-h">
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Compare {panes.length} runs</h2>
        <span className="muted">Best per column in bold, the rest as the gap to it.</span>
        <div className="acts">
          <Seg
            label="Stage mode"
            value="compare"
            options={[
              { value: 'focus', label: 'Focus' },
              { value: 'compare', label: 'Compare' },
            ]}
            onChange={onMode}
          />
        </div>
      </div>
      <section className="score" aria-label="Scorecard">
        <div className="score-g score-h">
          <span>
            <span className="sr-only">Show</span>
          </span>
          <span>#</span>
          <span>Run</span>
          {columns.map((c) => (
            <span key={c.label}>{c.label}</span>
          ))}
          <span>Valid</span>
          <span>Errors</span>
          <span>Rating</span>
        </div>
        {panes.map((p, i) => {
          const s = summaries[p.key]
          const approach = approachById(s?.approach ?? p.approach)!
          const model = registry.find((m) => m.id === s?.modelId)
          return (
            <div key={p.key} className={`score-g score-r${hidden.includes(p.key) ? ' off' : ''}${live(s?.status) ? ' live' : ''}`}>
              <input type="checkbox" aria-label={`Show run ${i + 1}`} checked={!hidden.includes(p.key)} onChange={() => onToggle(p.key)} />
              <span className="lbl">{i + 1}</span>
              <button type="button" className="sc-run" onClick={() => onFocus(p.key)}>
                <ApBadge approach={approach} />
                <span>{model?.label ?? '–'}</span>
              </button>
              {columns.map((c, ci) => {
                const v = s ? c.value(s) : null
                const isBest = v != null && v === best[ci] && Number.isFinite(best[ci])
                return (
                  <span key={c.label} className={`sc${isBest ? ' best' : ''}`}>
                    <span className="v">{v == null ? '–' : c.format(v)}</span>
                    {v != null && <span className="d">{isBest ? 'best' : `+${c.format(v - best[ci])}`}</span>}
                  </span>
                )
              })}
              <span className="sc">{s?.metrics.valid == null ? '–' : s.metrics.valid ? <span className="v-ok">valid</span> : <span className="v-bad">invalid</span>}</span>
              <span className="sc">{s?.metrics.errorCount ?? '–'}</span>
              <span className="sc">{s?.savedId ? <Pips rating={s.rating} /> : '–'}</span>
            </div>
          )
        })}
      </section>
    </>
  )
}
