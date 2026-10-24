export type Provider = 'anthropic' | 'openai' | 'claude-code' | 'codex'

export type Effort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Model = {
  id: string
  provider: Provider
  modelName: string
  label: string
  // Absent for subscription models, which are billed by the user's plan.
  price?: { inPerMTok: number; outPerMTok: number; cachedInPerMTok?: number; cacheWritePerMTok?: number; source: string; checkedAt: string }
  supports: { strictJson: boolean; effort?: Effort[]; temperature: boolean }
}

const anthropicPricing = 'https://platform.claude.com/docs/en/about-claude/pricing'
const openaiPricing = 'https://developers.openai.com/api/docs/pricing'

const apiModels: Model[] = [
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    modelName: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    price: { inPerMTok: 0.1, outPerMTok: 0.5, cachedInPerMTok: 0.01, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    modelName: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    price: { inPerMTok: 2, outPerMTok: 10, cachedInPerMTok: 0.1, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    modelName: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    price: { inPerMTok: 4, outPerMTok: 20, cachedInPerMTok: 0.2, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    modelName: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    price: { inPerMTok: 0.1, outPerMTok: 0.5, cachedInPerMTok: 0.01, cacheWritePerMTok: 0.125, source: openaiPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    modelName: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    price: { inPerMTok: 2, outPerMTok: 10, cachedInPerMTok: 0.1, cacheWritePerMTok: 2.5, source: openaiPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  },
]

const viaCli =
  (provider: Provider, strictJson: boolean) =>
  (m: Model): Model => ({
    ...m,
    id: `${m.id}-subscription`,
    provider,
    label: `${m.label} · subscription`,
    price: undefined,
    supports: { strictJson, effort: ['low', 'medium', 'high', 'xhigh', 'max'], temperature: false },
  })

// claude --json-schema lets the model skip its StructuredOutput tool, so it is prompt-only; codex --output-schema constrains.
export const models: Model[] = [
  ...apiModels,
  ...apiModels.filter((m) => m.provider === 'anthropic').map(viaCli('claude-code', false)),
  ...apiModels.filter((m) => m.provider === 'openai').map(viaCli('codex', true)),
]
