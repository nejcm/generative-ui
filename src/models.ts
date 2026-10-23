export type Provider = 'anthropic' | 'openai' | 'google' | 'groq'

export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Model = {
  id: string
  provider: Provider
  modelName: string
  label: string
  price: { inPerMTok: number; outPerMTok: number; cachedInPerMTok?: number; source: string; checkedAt: string }
  supports: { strictJson: boolean; effort?: Effort[]; temperature: boolean }
}

const anthropicPricing = 'https://platform.claude.com/docs/en/about-claude/pricing'

export const models: Model[] = [
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
    id: 'gpt-5.4-mini',
    provider: 'openai',
    modelName: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    price: { inPerMTok: 0.75, outPerMTok: 4.5, cachedInPerMTok: 0.075, source: 'https://developers.openai.com/api/docs/pricing', checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['none', 'low', 'medium', 'high', 'xhigh'], temperature: false },
  },
  {
    id: 'gemini-3.8-flash',
    provider: 'google',
    modelName: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    // Source lists these through 2026-12-31; all three double from 2027-01-01.
    price: { inPerMTok: 0.75, outPerMTok: 3.75, cachedInPerMTok: 0.075, source: 'https://ai.google.dev/gemini-api/docs/pricing', checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: ['minimal', 'low', 'medium', 'high'], temperature: true },
  },
  {
    id: 'groq-gpt-oss-20b',
    provider: 'groq',
    modelName: 'openai/gpt-oss-20b',
    label: 'gpt-oss-20b (Groq)',
    price: { inPerMTok: 0.075, outPerMTok: 0.3, source: 'https://console.groq.com/docs/models', checkedAt: '2026-10-24' },
    // Groq strict mode doesn't stream (console.groq.com/docs/structured-outputs), so prompt-only.
    supports: { strictJson: false, effort: ['low', 'medium', 'high'], temperature: true },
  },
]
