import { describe, expect, it } from 'vitest'
import { groupBy, median, topErrors } from './stats.ts'
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
