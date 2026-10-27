import { Fragment, useEffect, useRef, useState } from 'react'
import { approachById, parseAll, type Approach, type ParseState } from '@/approaches'
import { getJson, whenCurrent } from '@/lib/async'
import { batchUsd, runCost, usd } from '@/lib/cost'
import type { Run, RunSummary } from '@/lib/run'
import { thinkingMs, writingMs, writingTokensPerSec } from '@/lib/stats'
import { models } from '@/models'
import { presets } from '@/prompts'
import { ApBadge, Collapsible, Errors, Pips, secs, statusOf, words } from './bits'
import { Choice } from './Choice'
import { Replay } from './Replay'
import { Result, stripOf } from './Result'

// Oldest first; the Lab has room for the latest four.
const PAGE = 100
const loadRuns = (runs: RunSummary[]) => Promise.all(runs.slice(-4).map((r) => getJson<Run>(`/api/runs/${r.id}`)))

export async function loadBatch(batchId: string) {
  const batch = await getJson<RunSummary[]>(`/api/runs?batchId=${encodeURIComponent(batchId)}`)
  return loadRuns(batch.reverse())
}

const tokens = (n?: number | null) => n?.toLocaleString('en-US') ?? '–'
const rate = (v: number | null) => (v == null ? '–' : String(Math.round(v)))
const presetLabel = (id?: string) => presets.find((p) => p.id === id)?.label ?? 'Custom'
export const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id
const configOf = (r: RunSummary) => `${presetLabel(r.presetId)} · ${modelLabel(r.modelId)} · ${r.settings.effort ?? 'default'}`

export function History({ onOpenBatch }: { onOpenBatch: (runs: Run[]) => void }) {
  const [presetId, setPresetId] = useState('')
  const [runs, setRuns] = useState<RunSummary[]>()
  const [shown, setShown] = useState(PAGE)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<{
    run: Run
    approach: Approach
    state: ParseState
  }>()

  const selecting = useRef<string>(undefined)

  useEffect(
    () => whenCurrent(getJson<RunSummary[]>(`/api/runs${presetId ? `?presetId=${encodeURIComponent(presetId)}` : ''}`), setRuns, (e) => setError(e.message)),
    [presetId],
  )

  async function toggle(id: string) {
    if (selected?.run.id === id) {
      selecting.current = undefined
      return setSelected(undefined)
    }
    selecting.current = id
    try {
      const run = await getJson<Run>(`/api/runs/${id}`)
      if (selecting.current !== id) return
      const approach = approachById(run.approach)!
      const state = await parseAll(approach, run.rawOutput)
      if (selecting.current !== id) return
      setSelected({ run, approach, state })
    } catch (e) {
      if (selecting.current === id) throw e
    }
  }

  const costOf = (r: RunSummary) =>
    runCost(
      models.find((m) => m.id === r.modelId),
      r.metrics.costUsd,
    )
  const act = (fn: () => Promise<void>) => () => fn().catch((e: Error) => setError(e.message))
  const openGroup = (group: RunSummary[]) => act(async () => onOpenBatch(await loadRuns(group)))
  const keyOf = (r: RunSummary) => `${r.batchId}|${configOf(r)}`
  const groups = [...new Set(runs?.map(keyOf))].map((key) => [key, runs!.filter((r) => keyOf(r) === key).reverse()] as const)

  const sel = selected?.run
  const selStatus = sel ? statusOf(false, true, selected.state.renderable, sel.metrics) : 'idle'
  return (
    <div className="flex flex-col gap-3.5">
      <div className="page-h">
        <div>
          <h1>History</h1>
          <p>{runs ? `${runs.length} saved runs in ${groups.length} groups. Select a run to see its output, metrics and replay.` : 'Loading saved runs…'}</p>
        </div>
        <div className="acts w-64">
          <Choice label="Preset filter" value={presetId} options={[{ value: '', label: 'All presets' }, ...presets.map((p) => ({ value: p.id, label: p.label }))]} onChange={(v) => {
              setPresetId(v)
              setShown(PAGE)
            }}
          />
        </div>
      </div>
      {error && <div className="notice">{error}</div>}
      <section className="panel hpanel" aria-label="Runs">
        <table className="htable">
          <thead>
            <tr>
              <th>#</th>
              <th>Preset</th>
              <th>Approach</th>
              <th>Model</th>
              <th className="num" title="Time to first render / first token / total">TTFR / TTFT / Total</th>
              <th className="num">Out tok</th>
              <th className="num">Writing tok/s</th>
              <th className="num">Cost</th>
              <th className="num">Errors</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {groups.slice(0, shown).map(([key, group]) => (
              <Fragment key={key}>
                <tr className="batch">
                  <td colSpan={10}>
                    <div className="flex items-center gap-3">
                      <span>
                        {configOf(group[0])} · {group.length} {group.length === 1 ? 'run' : 'runs'}
                      </span>
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {new Date(group[0].createdAt).toLocaleString()} · {batchUsd(group.map(costOf))}
                      </span>
                      <button type="button" className="btn btn-sm ml-auto" onClick={openGroup(group)}>
                        Open in Lab
                      </button>
                    </div>
                  </td>
                </tr>
                {group.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr
                      className={`run${sel?.id === r.id ? ' on' : ''}`}
                      tabIndex={0}
                      aria-expanded={sel?.id === r.id}
                      onClick={() => act(() => toggle(r.id))()}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                        e.preventDefault()
                        act(() => toggle(r.id))()
                      }}
                    >
                      <td className="muted">{i + 1}</td>
                      <td>{presetLabel(r.presetId)}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <ApBadge approach={approachById(r.approach)!} />
                          {approachById(r.approach)?.label.split(' · ')[1]}
                        </span>
                      </td>
                      <td>{modelLabel(r.modelId)}</td>
                      <td className="num">{secs(r.metrics.ttfrMs)} / {secs(r.metrics.ttftMs)} / {secs(r.metrics.totalMs)}</td>
                      <td className="num">{tokens(r.metrics.outputTokens)}</td>
                      <td className="num">{rate(writingTokensPerSec(r.metrics))}</td>
                      <td className="num">{usd(costOf(r))}</td>
                      <td className={`num${r.metrics.errorCount ? ' v-bad' : ''}`}>{r.metrics.aborted ? 'stopped' : r.metrics.errorCount}</td>
                      <td>
                        <Pips rating={r.rating} />
                      </td>
                    </tr>
                    {sel?.id === r.id && selected && (
                      <tr className="det">
                        <td colSpan={10}>
                          <div className="hdet">
                            <div className="hinfo">
                              <div className="flex items-center gap-2">
                                <ApBadge approach={selected.approach} large />
                                <div className="min-w-0">
                                  <b className="block truncate">{modelLabel(sel.modelId)}</b>
                                  <span className="muted" style={{ fontSize: 12 }}>
                                    {presetLabel(sel.presetId)} · {new Date(sel.createdAt).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              <p className="caveat">{sel.prompt}</p>
                              <div className="mgrid">
                                {(
                                  [
                                    ['TTFR', secs(sel.metrics.ttfrMs)],
                                    ['Total', secs(sel.metrics.totalMs)],
                                    ['Startup', secs(sel.metrics.startupMs)],
                                    ['First byte', secs(sel.metrics.firstByteMs)],
                                    ['Thinking', secs(thinkingMs(sel.metrics))],
                                    ['First token', secs(sel.metrics.ttftMs)],
                                    ['Writing', secs(writingMs(sel.metrics))],
                                    ['Writing tok/s', rate(writingTokensPerSec(sel.metrics))],
                                    ['Tokens out', tokens(sel.metrics.outputTokens)],
                                    ['Reasoning tokens', tokens(sel.metrics.reasoningTokens)],
                                    ['Cost', usd(costOf(sel))],
                                    ['Valid', sel.metrics.valid ? 'valid' : 'invalid'],
                                  ] as const
                                ).map(([label, value]) => (
                                  <div key={label}>
                                    <span className="lbl block">{label}</span>
                                    <span className="m-v">{value}</span>
                                  </div>
                                ))}
                              </div>
                              {sel.metrics.errors.length > 0 && (
                                <Collapsible key={sel.id} title={<span className="v-bad">{sel.metrics.errors.length === 1 ? '1 error' : `${sel.metrics.errors.length} errors`}</span>}>
                                  <Errors errors={sel.metrics.errors} />
                                </Collapsible>
                              )}
                              <div className="flex items-center gap-2">
                                <Pips rating={sel.rating} />
                                <span className="muted">{sel.rating ? words[sel.rating] : 'Not rated'}</span>
                              </div>
                              {sel.notes && <p className="caveat">{sel.notes}</p>}
                              <button type="button" className="btn self-start" onClick={openGroup(groups.find(([key]) => key === keyOf(sel))![1])}>
                                Open group in Lab
                              </button>
                            </div>
                            <div className="min-w-0">
                              {sel.deltas ? (
                                <Replay key={sel.id} run={sel} status={selStatus} />
                              ) : (
                                <Result key={sel.id} approach={selected.approach} state={selected.state} raw={sel.rawOutput} strip={stripOf(selStatus, sel.metrics.errors)} />
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {groups.length > shown && (
          <div className="flex items-center justify-center gap-3 border-t py-3">
            <span className="muted">
              Showing {shown} of {groups.length} groups
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, groups.length - shown)} more
            </button>
          </div>
        )}
        {runs?.length === 0 && <p className="ph">No runs yet. Runs are saved here when they finish in the Lab.</p>}
      </section>
    </div>
  )
}
