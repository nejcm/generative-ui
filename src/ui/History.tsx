import { Fragment, useEffect, useState } from 'react'
import { approachById, parseAll, type Approach, type ParseState } from '@/approaches'
import { batchUsd, runCost, usd } from '@/lib/cost'
import type { Run, RunSummary } from '@/lib/run'
import { models } from '@/models'
import { presets } from '@/prompts'
import { ApBadge, Collapsible, Errors, Pips, secs, statusOf, words } from './bits'
import { Choice } from './Choice'
import { Replay } from './Replay'
import { Result, stripOf } from './Result'

const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function loadBatch(batchId: string) {
  const batch = await getJson<RunSummary[]>(`/api/runs?batchId=${encodeURIComponent(batchId)}`)
  return Promise.all(batch.slice(0, 4).reverse().map((r) => getJson<Run>(`/api/runs/${r.id}`)))
}

const presetLabel = (id?: string) => presets.find((p) => p.id === id)?.label ?? 'Free text'
const modelLabel = (id: string) => models.find((m) => m.id === id)?.label ?? id

export function History({ onOpenBatch }: { onOpenBatch: (runs: Run[]) => void }) {
  const [presetId, setPresetId] = useState('')
  const [runs, setRuns] = useState<RunSummary[]>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<{
    run: Run
    approach: Approach
    state: ParseState
  }>()

  useEffect(() => {
    getJson<RunSummary[]>(`/api/runs${presetId ? `?presetId=${encodeURIComponent(presetId)}` : ''}`)
      .then(setRuns)
      .catch((e: Error) => setError(e.message))
  }, [presetId])

  async function show(id: string) {
    const run = await getJson<Run>(`/api/runs/${id}`)
    const approach = approachById(run.approach)!
    setSelected({
      run,
      approach,
      state: await parseAll(approach, run.rawOutput),
    })
  }

  const costOf = (r: RunSummary) => runCost(models.find((m) => m.id === r.modelId), r.metrics.costUsd)
  const act = (fn: () => Promise<void>) => () => fn().catch((e: Error) => setError(e.message))
  const openBatch = (batchId: string) => act(async () => onOpenBatch(await loadBatch(batchId)))
  const batches = [...new Set(runs?.map((r) => r.batchId))].map((id) => runs!.filter((r) => r.batchId === id).reverse())

  const sel = selected?.run
  const selStatus = sel ? statusOf(false, true, selected.state.renderable, sel.metrics) : 'idle'
  return (
    <div className="flex flex-col gap-3.5">
      <div className="page-h">
        <div>
          <h1>History</h1>
          <p>{runs ? `${runs.length} saved runs in ${batches.length} batches.` : 'Loading saved runs…'}</p>
        </div>
        <div className="acts w-64">
          <Choice
            label="Preset filter"
            value={presetId}
            options={[{ value: '', label: 'All presets' }, ...presets.map((p) => ({ value: p.id, label: p.label }))]}
            onChange={setPresetId}
          />
        </div>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="hist">
        <section className="panel overflow-x-auto" aria-label="Runs">
          <table className="htable">
            <thead>
              <tr>
                <th>#</th>
                <th>Approach</th>
                <th>Model</th>
                <th className="num">TTFR</th>
                <th className="num">Cost</th>
                <th className="num">Errors</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((group) => (
                <Fragment key={group[0].batchId}>
                  <tr className="batch">
                    <td colSpan={7}>
                      <div className="flex items-center gap-3">
                        <span>
                          {presetLabel(group[0].presetId)} · {group.length} {group.length === 1 ? 'run' : 'runs'}
                        </span>
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {new Date(group[0].createdAt).toLocaleString()} · {batchUsd(group.map(costOf))}
                        </span>
                        <button type="button" className="btn btn-sm ml-auto" onClick={openBatch(group[0].batchId)}>
                          Open in Lab
                        </button>
                      </div>
                    </td>
                  </tr>
                  {group.map((r, i) => (
                    <tr key={r.id} className={`run${sel?.id === r.id ? ' on' : ''}`} onClick={act(() => show(r.id))} aria-selected={sel?.id === r.id}>
                      <td className="muted">{i + 1}</td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <ApBadge approach={approachById(r.approach)!} />
                          {approachById(r.approach)?.label.split(' · ')[1]}
                        </span>
                      </td>
                      <td>{modelLabel(r.modelId)}</td>
                      <td className="num">{secs(r.metrics.ttfrMs)}</td>
                      <td className="num">{usd(costOf(r))}</td>
                      <td className={`num${r.metrics.errorCount ? ' v-bad' : ''}`}>{r.metrics.aborted ? 'stopped' : r.metrics.errorCount}</td>
                      <td>
                        <Pips rating={r.rating} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {runs?.length === 0 && <p className="ph">No runs yet. Runs are saved here when they finish in the Lab.</p>}
        </section>
        <aside className="panel aside" aria-label="Run details">
          {sel ? (
            <>
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
                    ['First token', secs(sel.metrics.ttftMs)],
                    ['Total', secs(sel.metrics.totalMs)],
                    ['Tokens out', sel.metrics.outputTokens?.toLocaleString('en-US') ?? '–'],
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
              {sel.deltas ? (
                <Replay key={sel.id} run={sel} status={selStatus} />
              ) : (
                <Result key={sel.id} approach={selected.approach} state={selected.state} raw={sel.rawOutput} compact strip={stripOf(selStatus, sel.metrics.errors)} />
              )}
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
              <button type="button" className="btn" onClick={openBatch(sel.batchId)}>
                Open batch in Lab
              </button>
            </>
          ) : (
            <p className="muted">Select a run to see its output, metrics and replay.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
