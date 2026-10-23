import { expect, test } from 'vitest'
import { models } from '../models.ts'
import { cost } from './cost.ts'

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
