import type { RunSummary } from './run.ts'

export type Group = { key: string; n: number; validPct: number; ttfrMs: number | null; totalMs: number | null; outputTokens: number | null; tokensPerSec: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null; outputChars: number | null; coverage: number | null; fidelity: number | null }

export function median(values: (number | null | undefined)[]): number | null {
  const s = values.filter((v): v is number => v != null).sort((a, b) => a - b)
  if (!s.length) return null
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function summarize(key: string, runs: RunSummary[]): Group {
  const done = runs.filter((r) => !r.metrics.aborted)
  return {
    key,
    n: runs.length,
    validPct: runs.length ? (100 * runs.filter((r) => r.metrics.valid).length) / runs.length : 0,
    ttfrMs: median(done.map((r) => r.metrics.ttfrMs)),
    totalMs: median(done.map((r) => r.metrics.totalMs)),
    outputTokens: median(done.map((r) => r.metrics.outputTokens)),
    cachedInputTokens: median(done.map((r) => r.metrics.cachedInputTokens)),
    cacheWriteTokens: median(done.map((r) => r.metrics.cacheWriteTokens)),
    outputChars: median(done.map((r) => r.metrics.outputChars)),
    coverage: median(done.map((r) => r.metrics.coverage)),
    fidelity: median(done.map((r) => r.metrics.fidelity)),
    tokensPerSec: median(done.map((r) => (r.metrics.outputTokens && r.metrics.totalMs ? r.metrics.outputTokens / (r.metrics.totalMs / 1000) : null))),
  }
}

export function groupBy(runs: RunSummary[], keyOf: (r: RunSummary) => string): Group[] {
  const groups = new Map<string, RunSummary[]>()
  for (const r of runs) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r])
  return [...groups].map(([key, rs]) => summarize(key, rs)).sort((a, b) => a.key.localeCompare(b.key))
}

export function topErrors(runs: RunSummary[], limit = 5): { message: string; count: number; approach: string }[] {
  const counts = new Map<string, { message: string; count: number; approach: string }>()
  for (const r of runs)
    for (const e of r.metrics.errors) {
      const message = e.message.split('\n')[0].replace(/✖\s*/g, '').slice(0, 100)
      const key = `${r.approach}\0${message}`
      const entry = counts.get(key) ?? { message, count: 0, approach: r.approach }
      entry.count++
      counts.set(key, entry)
    }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}
