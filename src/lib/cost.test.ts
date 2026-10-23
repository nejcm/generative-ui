import { expect, test } from 'vitest'
import { models } from '../models.ts'
import { batchUsd, cost, usd } from './cost.ts'

const haiku = models.find((m) => m.id === 'claude-haiku-5-5')!
const groq = models.find((m) => m.id === 'groq-gpt-oss-20b')!

test('prices input and output per million tokens', () => {
  expect(cost(haiku, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(0.6, 9)
  expect(cost(haiku, { inputTokens: 8000, outputTokens: 600 })).toBeCloseTo(0.0011, 9)
})

test('bills cached input at the cached rate', () => {
  expect(cost(haiku, { inputTokens: 8000, outputTokens: 600, cachedInputTokens: 7500 })).toBeCloseTo(0.000425, 9)
})

test('falls back to the input rate when no cached price is listed', () => {
  expect(cost(groq, { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 500_000 })).toBeCloseTo(0.075, 9)
})

test('unknown run cost shows a dash; batch sums mark unknown parts with ≥', () => {
  expect(usd(null)).toBe('–')
  expect(usd(0.0012)).toBe('$0.0012')
  expect(batchUsd([0.001, null])).toBe('≥$0.0010')
  expect(batchUsd([0.001, 0.002])).toBe('$0.0030')
})
