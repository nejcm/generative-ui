import { useEffect, useState } from 'react'
import { approachById, parseAll, type Approach, type ParseState } from '@/approaches'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { batchUsd, usd } from '@/lib/cost'
import type { Run, RunSummary } from '@/lib/run'
import { models } from '@/models'
import { presets } from '@/prompts'
import { Choice } from './Choice'
import { Result } from './Result'

const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function History({ onOpenBatch }: { onOpenBatch: (runs: Run[]) => void }) {
  const [presetId, setPresetId] = useState('')
  const [runs, setRuns] = useState<RunSummary[]>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<{ run: Run; approach: Approach; state: ParseState }>()

  useEffect(() => {
    getJson<RunSummary[]>(`/api/runs${presetId ? `?presetId=${encodeURIComponent(presetId)}` : ''}`)
      .then(setRuns)
      .catch((e: Error) => setError(e.message))
  }, [presetId])

  async function show(id: string) {
    const run = await getJson<Run>(`/api/runs/${id}`)
    const approach = approachById(run.approach)!
    setSelected({ run, approach, state: await parseAll(approach, run.rawOutput) })
  }

  async function openBatch(batchId: string) {
    const batch = await getJson<RunSummary[]>(`/api/runs?batchId=${encodeURIComponent(batchId)}`)
    onOpenBatch(await Promise.all(batch.slice(0, 4).reverse().map((r) => getJson<Run>(`/api/runs/${r.id}`))))
  }

  const batchCost = (batchId: string) => batchUsd(runs!.filter((r) => r.batchId === batchId).map((r) => r.metrics.costUsd))

  const act = (fn: () => Promise<void>) => () => fn().catch((e: Error) => setError(e.message))

  return (
    <div className="flex flex-col gap-4">
      <div className="w-64">
        <Choice label="Preset filter" value={presetId} options={[{ value: '', label: 'All presets' }, ...presets.map((p) => ({ value: p.id, label: p.label }))]} onChange={setPresetId} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {['When', 'Preset', 'Approach', 'Model', 'TTFR', 'Cost', 'Batch cost', 'Errors', 'Rating', ''].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs?.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" data-state={selected?.run.id === r.id ? 'selected' : undefined} onClick={act(() => show(r.id))}>
              <TableCell>{new Date(r.createdAt).toLocaleString()}</TableCell>
              <TableCell>{presets.find((p) => p.id === r.presetId)?.label ?? 'Free text'}</TableCell>
              <TableCell>{approachById(r.approach)?.label ?? r.approach}</TableCell>
              <TableCell>{models.find((m) => m.id === r.modelId)?.label ?? r.modelId}</TableCell>
              <TableCell className="tabular-nums">{r.metrics.ttfrMs == null ? '–' : `${(r.metrics.ttfrMs / 1000).toFixed(2)}s`}</TableCell>
              <TableCell className="tabular-nums">{usd(r.metrics.costUsd)}</TableCell>
              <TableCell className="tabular-nums">{batchCost(r.batchId)}</TableCell>
              <TableCell>{r.metrics.aborted ? 'aborted' : r.metrics.errorCount}</TableCell>
              <TableCell>{r.rating ?? '–'}</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    act(() => openBatch(r.batchId))()
                  }}
                >
                  Open batch
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {runs?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
      {selected && (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{selected.run.prompt}</p>
          <Result key={selected.run.id} approach={selected.approach} state={selected.state} errors={selected.run.metrics.errors} />
        </section>
      )}
    </div>
  )
}
