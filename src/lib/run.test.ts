import { expect, test } from 'vitest'
import { RunRecord, strictOutputOf } from './run'

test('strict output is unknown unless the server said so', () => {
  expect(strictOutputOf(new Headers())).toBeNull()
  expect(strictOutputOf(new Headers({ 'x-strict-output': 'true' }))).toBe(true)
  expect(strictOutputOf(new Headers({ 'x-strict-output': 'false' }))).toBe(false)
})

const run = {
  id: 'r1',
  createdAt: '2026-10-24T04:03:05.123Z',
  batchId: 'b1',
  approach: 'html',
  modelId: 'm',
  settings: {},
  prompt: 'p',
  system: 's',
  systemHash: 'a'.repeat(64),
  systemOverridden: false,
  strictOutput: null,
  rawOutput: '<p>hi</p>',
  metrics: { ttftMs: null, ttfrMs: null, totalMs: 1, inputTokens: null, outputTokens: null, costUsd: null, valid: true, errorCount: 0, errors: [], aborted: false },
}

test('deltas are optional but must join to rawOutput', () => {
  expect(RunRecord.safeParse(run).success).toBe(true)
  expect(RunRecord.safeParse({ ...run, deltas: [[0, '<p>'], [12, 'hi</p>']] }).success).toBe(true)
  expect(RunRecord.safeParse({ ...run, deltas: [[0, '<p>'], [12, 'ho</p>']] }).success).toBe(false)
  expect(RunRecord.safeParse({ ...run, deltas: [[-1, '<p>hi</p>']] }).success).toBe(false)
})

test.each(['json-render', 'flat-strict', 'html', 'markup'])('measurement metrics are optional for old %s runs and preserved on new runs', (approach) => {
  const legacy = { ...run, approach }
  expect(RunRecord.parse(legacy).metrics).toEqual(run.metrics)
  const metrics = { ...run.metrics, cachedInputTokens: 1200, cacheWriteTokens: 0, reasoningTokens: 40, startupMs: 600, firstByteMs: 3100, firstReasoningMs: 3200, outputChars: run.rawOutput.length, coverage: 0.75, fidelity: 1 }
  expect(RunRecord.parse({ ...legacy, metrics }).metrics).toEqual(metrics)
  expect(RunRecord.safeParse({ ...run, metrics: { ...metrics, coverage: 1.1 } }).success).toBe(false)
  expect(RunRecord.safeParse({ ...run, metrics: { ...metrics, fidelity: -0.1 } }).success).toBe(false)
  expect(RunRecord.safeParse({ ...run, metrics: { ...metrics, outputChars: -1 } }).success).toBe(false)
  expect(RunRecord.safeParse({ ...run, metrics: { ...metrics, unknown: 1 } }).success).toBe(false)
})
