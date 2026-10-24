import type { Model } from '../models.ts'

export type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number }

export const usd = (cost: number | null) => (cost === null ? '–' : `$${cost.toFixed(4)}`)

// Sum of a batch; ≥ when some runs have unknown cost.
export function batchUsd(costs: (number | null)[]) {
  const known = costs.filter((c) => c !== null)
  return `${known.length < costs.length ? '≥' : ''}$${known.reduce((a, b) => a + b, 0).toFixed(4)}`
}

// shortcut: ignores Haiku 5.5's higher price for prompts over 100k tokens, add tiers if prompts get that long
export function cost({ price }: Model, { inputTokens, outputTokens, cachedInputTokens = 0, cacheWriteTokens = 0 }: Usage): number {
  const cachedRate = price.cachedInPerMTok ?? price.inPerMTok
  const writeRate = price.cacheWritePerMTok ?? price.inPerMTok
  const uncached = inputTokens - cachedInputTokens - cacheWriteTokens
  return (uncached * price.inPerMTok + cachedInputTokens * cachedRate + cacheWriteTokens * writeRate + outputTokens * price.outPerMTok) / 1e6
}
