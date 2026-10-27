import type { RunSummary } from './run.ts'

export type Group = { key: string; n: number; validPct: number; strictPct: number; ttfrMs: number | null; totalMs: number | null; outputTokens: number | null; visibleTokens: number | null; charsPerVisibleToken: number | null; tokensPerSec: number | null; writingTokensPerSec: number | null; startupMs: number | null; waitMs: number | null; thinkingMs: number | null; reasoningTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null; outputChars: number | null; coverage: number | null; fidelity: number | null }

type Metrics = RunSummary['metrics']

const minus = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : a - b)

export const writingMs = (m: Metrics) => minus(m.totalMs, m.ttftMs)
// Reasoning tokens precede the first visible text, so they are left out of the writing window's rate.
export function writingTokensPerSec(m: Metrics) {
  const ms = writingMs(m)
  return m.outputTokens && ms ? (m.outputTokens - (m.reasoningTokens ?? 0)) / (ms / 1000) : null
}
// null when reasoning tokens were not reported, so the split is unknown.
export const visibleTokens = (m: Metrics) => minus(m.outputTokens, m.reasoningTokens)
export const waitMs = (m: Metrics) => minus(m.ttftMs, m.startupMs)
export const thinkingMs = (m: Metrics) => minus(m.ttftMs, m.firstByteMs)

export function median(values: (number | null | undefined)[]): number | null {
  const s = values.filter((v): v is number => v != null).sort((a, b) => a - b)
  if (!s.length) return null
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function spread(values: (number | null | undefined)[]): { median: number; min: number; max: number } | null {
  const s = values.filter((v): v is number => v != null).sort((a, b) => a - b)
  return s.length ? { median: median(s)!, min: s[0], max: s.at(-1)! } : null
}

// Rep indexes still to run for a cell; runs saved without `rep` fill the lowest free indexes.
export function missingReps(taken: (number | undefined)[], repeats: number): number[] {
  const tagged = new Set(taken.filter((r) => r != null))
  let untagged = taken.filter((r) => r == null).length
  const missing: number[] = []
  for (let rep = 0; rep < repeats; rep++) {
    if (tagged.has(rep)) continue
    if (untagged) untagged--
    else missing.push(rep)
  }
  return missing
}

export function summarize(key: string, runs: RunSummary[]): Group {
  const done = runs.filter((r) => !r.metrics.aborted)
  return {
    key,
    n: runs.length,
    validPct: runs.length ? (100 * runs.filter((r) => r.metrics.valid).length) / runs.length : 0,
    strictPct: runs.length ? (100 * runs.filter((r) => !r.metrics.aborted && r.metrics.errors.length === 0).length) / runs.length : 0,
    ttfrMs: median(done.map((r) => r.metrics.ttfrMs)),
    totalMs: median(done.map((r) => r.metrics.totalMs)),
    outputTokens: median(done.map((r) => r.metrics.outputTokens)),
    visibleTokens: median(done.map((r) => visibleTokens(r.metrics))),
    charsPerVisibleToken: median(done.map(({ metrics: m }) => {
      const visible = visibleTokens(m)
      return m.outputChars != null && visible ? m.outputChars / visible : null
    })),
    cachedInputTokens: median(done.map((r) => r.metrics.cachedInputTokens)),
    cacheWriteTokens: median(done.map((r) => r.metrics.cacheWriteTokens)),
    outputChars: median(done.map((r) => r.metrics.outputChars)),
    coverage: median(done.map((r) => r.metrics.coverage)),
    fidelity: median(done.map((r) => r.metrics.fidelity)),
    tokensPerSec: median(done.map((r) => (r.metrics.outputTokens && r.metrics.totalMs ? r.metrics.outputTokens / (r.metrics.totalMs / 1000) : null))),
    writingTokensPerSec: median(done.map((r) => writingTokensPerSec(r.metrics))),
    startupMs: median(done.map((r) => r.metrics.startupMs)),
    waitMs: median(done.map((r) => waitMs(r.metrics))),
    thinkingMs: median(done.map((r) => thinkingMs(r.metrics))),
    reasoningTokens: median(done.map((r) => r.metrics.reasoningTokens)),
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
