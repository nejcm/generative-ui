// Markdown tables for a benchmark batch. Usage: node scripts/bench-stats.mts <batchId> [--all]
// Runs with a transport error (quota, dropped connection) are not model results and are excluded unless --all.
import { createJiti } from 'jiti'
import { readdirSync, readFileSync } from 'node:fs'

const root = new URL('../src', import.meta.url).pathname
const { groupBy, topErrors } = await createJiti(import.meta.url, { alias: { '@': root } }).import<any>(`${root}/lib/stats.ts`)
const dir = new URL('../runs/', import.meta.url).pathname
const batchId = process.argv[2]
if (!batchId) throw new Error('usage: node scripts/bench-stats.mts <batchId> [--all]')

const batch: any[] = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(dir + f, 'utf8')))
  .filter((r) => r.batchId === batchId)
  .map(({ system: _s, rawOutput: _o, deltas: _d, ...r }) => r)
const failed = (r: any) => r.metrics.errors.some((e: any) => e.at === 'transport')
const runs = process.argv.includes('--all') ? batch : batch.filter((r) => !failed(r))

const sec = (v: number | null, d = 1) => (v == null ? '–' : (v / 1000).toFixed(d))
const pct = (v: number | null) => (v == null ? '–' : (100 * v).toFixed(0))
const p90 = (rs: any[]) => {
  const a = rs.map((r) => r.metrics.totalMs).sort((x, y) => x - y)
  return a.length ? a[Math.ceil(0.9 * a.length) - 1] : null
}
const model = (r: any) => r.modelId.replace('-subscription', '').replace('-opencode-go', '')
const provider = (r: any) => (r.modelId.endsWith('opencode-go') ? 'opencode-go' : r.modelId.startsWith('claude') ? 'claude-code' : 'codex')

function table(title: string, keyOf: (r: any) => string) {
  const byKey = new Map<string, any[]>()
  for (const r of runs) byKey.set(keyOf(r), [...(byKey.get(keyOf(r)) ?? []), r])
  console.log(`\n### ${title}\n\n| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % | fidelity % |\n|---|---|---|---|---|---|---|---|---|---|`)
  for (const g of groupBy(runs, keyOf))
    console.log(`| ${g.key} | ${g.n} | ${g.validPct.toFixed(0)} | ${sec(g.ttfrMs)} | ${sec(g.totalMs)} | ${sec(p90(byKey.get(g.key)!))} | ${g.outputTokens?.toFixed(0) ?? '–'} | ${g.tokensPerSec?.toFixed(0) ?? '–'} | ${pct(g.coverage)} | ${pct(g.fidelity)} |`)
}

console.log(`batch ${batchId}: ${batch.length} runs, ${batch.length - runs.length} excluded for transport errors, ${batch.filter((r) => r.metrics.aborted).length} aborted`)
const noUsage = Object.groupBy(runs.filter((r) => r.metrics.outputTokens == null), model)
console.log(`no usage reported: ${Object.entries(noUsage).map(([m, rs]) => `${m} ${rs!.length}`).join(', ') || 'none'}`)
table('By approach', (r) => r.approach)
table('By provider', provider)
table('By model', model)
table('By effort (mixed models)', (r) => r.settings.effort ?? 'none')
table('By preset', (r) => r.presetId)
table('Model × approach', (r) => `${model(r)} · ${r.approach}`)
table('Model × effort', (r) => `${model(r)} · ${r.settings.effort ?? 'none'}`)
table('Approach × preset', (r) => `${r.approach} · ${r.presetId}`)
console.log('\n### Top errors\n')
for (const e of topErrors(runs, 12)) console.log(`- ${e.count}× ${e.approach}: ${e.message}`)
