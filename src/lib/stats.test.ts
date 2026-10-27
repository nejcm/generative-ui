import { describe, expect, it } from 'vitest'
import { groupBy, median, missingReps, spread, thinkingMs, topErrors, waitMs, writingTokensPerSec } from './stats.ts'
import type { RunSummary } from './run.ts'

const run = (over: Partial<RunSummary['metrics']> & { approach?: RunSummary['approach'] } = {}): RunSummary => {
  const { approach = 'html', ...metrics } = over
  return {
    id: 'x', createdAt: '2026-01-01T00:00:00.000Z', batchId: 'b', approach, modelId: 'm', settings: {}, prompt: 'p', systemHash: '0'.repeat(64), systemOverridden: false, strictOutput: null,
    metrics: { ttftMs: 1, ttfrMs: 1000, totalMs: 2000, inputTokens: 10, outputTokens: 200, costUsd: null, valid: true, errorCount: 0, errors: [], aborted: false, ...metrics },
  }
}

describe('stats', () => {
  it('median handles odd, even, empty and nulls', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([null, undefined])).toBeNull()
  })

  it('groups with valid %, medians and tokens/s; ignores aborted runs for timing', () => {
    const [g] = groupBy([run(), run({ valid: false }), run({ aborted: true, totalMs: 99999 })], () => 'all')
    expect(g.n).toBe(3)
    expect(g.validPct).toBeCloseTo(66.67, 1)
    expect(g.totalMs).toBe(2000)
    expect(g.tokensPerSec).toBe(100)
  })

  it('writing tok/s counts visible output over the time after the first token', () => {
    const m = run({ ttftMs: 3000, totalMs: 5000, outputTokens: 600, reasoningTokens: 200, startupMs: 500, firstByteMs: 1000 }).metrics
    expect(writingTokensPerSec(m)).toBe(200)
    expect(waitMs(m)).toBe(2500)
    expect(thinkingMs(m)).toBe(2000)
    // Old opencode runs arrived as one delta at the end: no writing window.
    expect(writingTokensPerSec(run({ ttftMs: 2000, totalMs: 2000 }).metrics)).toBeNull()
    expect(writingTokensPerSec(run({ ttftMs: null }).metrics)).toBeNull()
    expect(waitMs(run().metrics)).toBeNull()
    const [g] = groupBy([run({ ttftMs: 1000, totalMs: 3000 }), run({ ttftMs: 1000, totalMs: 2000 })], () => 'all')
    expect(g).toMatchObject({ writingTokensPerSec: 150, startupMs: null, thinkingMs: null, reasoningTokens: null })
    expect(g.tokensPerSec).toBeCloseTo(83.33, 2)
  })

  it('spread gives median, min and max, skipping nulls', () => {
    expect(spread([3, null, 1, 2])).toEqual({ median: 2, min: 1, max: 3 })
    expect(spread([5])).toEqual({ median: 5, min: 5, max: 5 })
    expect(spread([null])).toBeNull()
  })

  it('missingReps skips done reps and lets untagged runs fill the lowest free ones', () => {
    expect(missingReps([], 3)).toEqual([0, 1, 2])
    expect(missingReps([1], 3)).toEqual([0, 2])
    expect(missingReps([undefined], 3)).toEqual([1, 2])
    expect(missingReps([undefined, 0], 3)).toEqual([2])
    expect(missingReps([undefined, undefined], 1)).toEqual([])
  })

  it('counts repeated errors per approach, most common first', () => {
    const e = [{ at: 'a', message: 'bad prop' }]
    const top = topErrors([run({ errors: e }), run({ errors: e }), run({ errors: [{ at: 'b', message: 'other' }] })])
    expect(top.map((t) => t.count)).toEqual([2, 1])
  })

  it('measurement medians omit old and aborted runs while preserving zero scores', () => {
    const [g] = groupBy([
      run(),
      run({ cachedInputTokens: 100, cacheWriteTokens: 0, outputChars: 80, coverage: 0, fidelity: 1 }),
      run({ cachedInputTokens: 300, cacheWriteTokens: 200, outputChars: 120, coverage: 1, fidelity: 0.5 }),
      run({ aborted: true, outputChars: 999, coverage: 0 }),
    ], () => 'all')
    expect(g).toMatchObject({ cachedInputTokens: 200, cacheWriteTokens: 100, outputChars: 100, coverage: 0.5, fidelity: 0.75 })
    expect(groupBy([run()], () => 'old')[0]).toMatchObject({ cachedInputTokens: null, cacheWriteTokens: null, outputChars: null, coverage: null, fidelity: null })
  })
})
