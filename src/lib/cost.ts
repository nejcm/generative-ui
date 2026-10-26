import type { Model, Plan } from '../models.ts'

export type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number }

export type Cost = number | null | Plan

export const runCost = (model: Model | undefined, costUsd: number | null): Cost => (model && !model.price ? (model.plan ?? 'subscription') : costUsd)

export const usd = (cost: Cost) => (typeof cost === 'string' ? cost : cost === null ? '–' : `$${cost.toFixed(4)}`)

// Sum of a batch's priced runs; ≥ when some runs have unknown cost, including possible credit use.
export function batchUsd(costs: Cost[]) {
  const priced = costs.filter((c) => c !== 'subscription')
  if (!priced.length) return 'subscription'
  if (priced.every((c) => c === 'subscription or credits')) return 'subscription or credits'
  const known = priced.filter((c) => typeof c === 'number')
  return `${known.length < priced.length ? '≥' : ''}$${known.reduce((a, b) => a + b, 0).toFixed(4)}`
}

// shortcut: ignores Haiku 5.5's higher price for prompts over 100k tokens, add tiers if prompts get that long
export function cost({ price }: Model, { inputTokens, outputTokens, cachedInputTokens = 0, cacheWriteTokens = 0 }: Usage): number | null {
  if (!price) return null
  const cachedRate = price.cachedInPerMTok ?? price.inPerMTok
  const writeRate = price.cacheWritePerMTok ?? price.inPerMTok
  const uncached = inputTokens - cachedInputTokens - cacheWriteTokens
  return (uncached * price.inPerMTok + cachedInputTokens * cachedRate + cacheWriteTokens * writeRate + outputTokens * price.outPerMTok) / 1e6
}
