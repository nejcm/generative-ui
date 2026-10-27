// Bundles saved runs as static JSON for the Pages demo. Usage: node scripts/export-demo.mts [--max 100] [--skip id1,id2]
// Runs are regrouped into one batch per (preset, model, effort), so "open in Lab" compares approaches on one model.
import { createJiti } from 'jiti'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const root = new URL('../src', import.meta.url).pathname
const { RunRecord } = await createJiti(import.meta.url, { alias: { '@': root } }).import<any>(`${root}/lib/run.ts`)
const src = new URL('../runs/', import.meta.url).pathname
const out = new URL('../public/demo/', import.meta.url).pathname
const max = Number(process.argv[process.argv.indexOf('--max') + 1]) || 100
const skip = process.argv.includes('--skip') ? process.argv[process.argv.indexOf('--skip') + 1].split(',') : []

const transportFailure = (r: any) => r.metrics.errors.some((e: any) => e.at === 'transport')
const runs: any[] = readdirSync(src)
  .filter((f) => f.endsWith('.json'))
  .map((f) => RunRecord.parse(JSON.parse(readFileSync(src + f, 'utf8'))))
  .filter((r: any) => !r.metrics.aborted && !transportFailure(r) && !skip.includes(r.modelId))
  .map(({ notes: _n, rating: _r, ...r }: any) => ({ ...r, batchId: [r.presetId ?? 'custom', r.modelId, r.settings.effort ?? 'default'].join('_').replace(/[^\w-]/g, '-') }))

const groups = Map.groupBy(runs, (r) => r.batchId)
const modelOf = (g: any[]) => g[0].modelId
let total = runs.length
// Trim to --max by dropping whole groups from whichever model has the most runs, keeping the model mix balanced.
while (total > max) {
  const perModel = new Map<string, number>()
  for (const g of groups.values()) perModel.set(modelOf(g), (perModel.get(modelOf(g)) ?? 0) + g.length)
  const biggest = [...perModel].sort((a, b) => b[1] - a[1])[0][0]
  const [id, g] = [...groups].filter(([, g]) => modelOf(g) === biggest).sort((a, b) => a[1].length - b[1].length)[0]
  groups.delete(id)
  total -= g.length
}
const kept = [...groups.values()].flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))

rmSync(out, { recursive: true, force: true })
mkdirSync(out + 'runs', { recursive: true })
for (const r of kept) writeFileSync(`${out}runs/${r.id}.json`, JSON.stringify(r))
writeFileSync(out + 'runs.json', JSON.stringify(kept.map(({ system: _s, rawOutput: _o, deltas: _d, ...summary }) => summary)))
console.log(`${kept.length} runs in ${groups.size} batches -> public/demo`)
