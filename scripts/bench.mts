// Headless benchmark: runs the model × effort × approach × preset matrix against a running dev API and saves each run via POST /api/runs.
// Usage: node scripts/bench.mts <batchId> [--repeats N] [--presets a,b] [--provider p] [--match substring] [--limit N] [--api | --gateway] [--concurrency N] [--per-plan N] [--delay-ms N]
// --api runs the fixed API-billed matrix (anthropic, openai, opencode-go) instead of the CLI models; --gateway runs every AI Gateway model at its lowest and highest effort, skipping xhigh and max.
// Needs jiti (transitive dependency) to load the app's TS modules with the `@` alias.
import { createJiti } from 'jiti'

const root = new URL('../src', import.meta.url).pathname
const jiti = createJiti(import.meta.url, { alias: { '@': root }, jsx: true })
const load = (path: string) => jiti.import<any>(`${root}/${path}`)
const [{ record }, { approaches }, { catalog }, { models }, { fixtures, presets }, { readNdjson }, { strictOutputOf }] = await Promise.all(
  ['lib/recorder.ts', 'approaches/index.ts', 'catalog/catalog.tsx', 'models.ts', 'prompts.ts', 'lib/ndjson.ts', 'lib/run.ts'].map(load),
)

const API = 'http://127.0.0.1:8787'
const QUOTA = /usage limit|quota|rate limit/i

const args = process.argv.slice(2)
const batchId = args[0]
const flag = (name: string) => args[args.indexOf(`--${name}`) + 1]
const has = (name: string) => args.includes(`--${name}`)
if (!batchId || batchId.startsWith('--')) throw new Error('usage: node scripts/bench.mts <batchId> [--repeats N] [--presets a,b] [--provider p] [--match s] [--limit N]')
const repeats = Number(has('repeats') ? flag('repeats') : 1)
const presetIds = (has('presets') ? flag('presets') : has('api') || has('gateway') ? presets.map((p: any) => p.id).join(',') : 'login,dashboard,comparison').split(',')
const concurrency = has('concurrency') ? Number(flag('concurrency')) : 3
const perPlan = has('per-plan') ? Number(flag('per-plan')) : Infinity
const delayMs = has('delay-ms') ? Number(flag('delay-ms')) : 0
const API_MATRIX: Record<string, (string | undefined)[]> = {
  'claude-haiku-5-5': ['low', 'medium'],
  'claude-sonnet-5-5': ['low', 'medium'],
  'claude-opus-5-5': ['low'],
  'gpt-6-luna': ['low', 'medium', 'high'],
  'gpt-6.1-sol': ['low'],
  'qwen3.8-flash-opencode-go': ['low'],
  'glm-5.3-flash-opencode-go': ['high'],
  'deepseek-v4.1-flash-opencode-go': ['high'],
  'minimax-m3-opencode-go': [undefined],
}

const transport = async (body: unknown, signal: AbortSignal) => {
  const res = await fetch(`${API}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
  return { events: readNdjson(res.body), strictOutput: strictOutputOf(res.headers) }
}

const cell = (modelId: string, effort: string | undefined, approach: string, presetId: string) => [modelId, effort ?? '-', approach, presetId].join('|')

// High is skipped where a model offers low/medium/high; models with other level sets (e.g. high/max) run all of them.
const effortsOf = (m: any): (string | undefined)[] => {
  const all: string[] = m.supports.effort ?? []
  if (all.length === 0) return [undefined]
  return all.length === 3 && all.includes('low') && all.includes('high') ? all.filter((e) => e !== 'high') : all
}

const gatewayEffortsOf = (m: any): (string | undefined)[] => {
  const all = m.supports.effort.filter((e: string) => e !== 'max' && e !== 'xhigh')
  return all.length ? (all.length > 2 ? [all[0], all.at(-1)] : all) : [undefined]
}

const existing = (await fetch(`${API}/api/runs?batchId=${batchId}`).then((r) => r.json())) as { modelId: string; settings: { effort?: string }; approach: string; presetId?: string }[]
const have = new Map<string, number>()
for (const r of existing) {
  const key = cell(r.modelId, r.settings.effort, r.approach, r.presetId ?? '')
  have.set(key, (have.get(key) ?? 0) + 1)
}

const cliModels = models.filter((m: any) => !m.hidden && (has('gateway') ? m.provider === 'gateway' : has('api') ? m.id in API_MATRIX : ['claude-code', 'codex', 'opencode'].includes(m.provider)) && (!has('provider') || m.provider === flag('provider')) && (!has('match') || m.id.includes(flag('match'))))
let queue: any[] = []
for (const model of cliModels)
  for (const effort of has('api') ? API_MATRIX[model.id] : has('gateway') ? gatewayEffortsOf(model) : effortsOf(model))
    for (const approach of approaches)
      for (const presetId of presetIds) {
        const missing = repeats - (have.get(cell(model.id, effort, approach.id, presetId)) ?? 0)
        for (let i = 0; i < missing; i++) queue.push({ model, effort, approach, preset: presets.find((p: any) => p.id === presetId) })
      }
// Shuffle so providers interleave and no single plan's rate limit is hit in a burst.
for (let i = queue.length - 1; i > 0; i--) {
  const k = Math.floor(Math.random() * (i + 1))
  ;[queue[i], queue[k]] = [queue[k], queue[i]]
}
if (has('limit')) queue = queue.slice(0, Number(flag('limit')))
console.log(`${queue.length} runs to do (${existing.length} already in ${batchId})`)

// OpenCode has separate plans (Go, free) behind one provider, and gateway models separate hosts, so quota is tracked per plan or host.
const planOf = (m: any) => (m.provider === 'opencode' ? m.modelName.split('/')[0] : (m.host ?? m.provider))
const exhausted = new Set<string>()
const active = new Map<string, number>()
let done = 0
let invalid = 0
let skipped = 0

// Takes the last queued job whose plan is under --per-plan; waits while every queued plan is at its limit.
async function nextJob() {
  while (queue.length) {
    const i = queue.findLastIndex((j) => (active.get(planOf(j.model)) ?? 0) < perPlan)
    if (i >= 0) return queue.splice(i, 1)[0]
    await new Promise((r) => setTimeout(r, 200))
  }
}

async function worker() {
  for (let job; (job = await nextJob()); ) {
    const { model, effort, approach, preset } = job
    const plan = planOf(model)
    active.set(plan, (active.get(plan) ?? 0) + 1)
    try {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      if (exhausted.has(planOf(model))) {
        skipped++
        continue
      }
      const fixture = preset.fixtureId ? fixtures[preset.fixtureId] : undefined
      const run = await record(
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          request: { batchId, prompt: preset.prompt, presetId: preset.id, fixtureId: preset.fixtureId },
          approach,
          model,
          settings: { effort },
          system: approach.systemPrompt({ catalog, fixture }),
          systemOverridden: false,
        },
        () => {},
        { signal: new AbortController().signal, transport },
      )
      const limit = run.metrics.errors.find((e: any) => e.at === 'transport' && QUOTA.test(e.message))
      if (limit) {
        // Not a model result: discard it and stop spending requests on this provider; rerun later to fill the gap.
        exhausted.add(planOf(model))
        console.log(`${planOf(model)} stopped: ${limit.message}`)
        continue
      }
      const res = await fetch(`${API}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(run) })
      if (!res.ok) console.log('SAVE FAILED', res.status, await res.text())
      done++
      if (!run.metrics.valid) invalid++
      console.log(`[${done}] ${model.id} ${effort ?? '-'} ${approach.id} ${preset.id} ${(run.metrics.totalMs / 1000).toFixed(1)}s valid=${run.metrics.valid} ${run.metrics.errors[0]?.message.slice(0, 90) ?? ''}`)
    } finally {
      active.set(plan, active.get(plan)! - 1)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
console.log(`finished: ${done} saved, ${invalid} invalid, ${skipped} skipped for exhausted providers (${[...exhausted].join(', ') || 'none'})`)
