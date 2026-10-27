export type Provider = 'anthropic' | 'openai' | 'gateway' | 'claude-code' | 'codex' | 'opencode'

export type Plan = 'subscription' | 'subscription or credits'

export type Model = {
  id: string
  provider: Provider
  modelName: string
  label: string
  // Absent for subscription models, which are billed by the user's plan.
  price?: { inPerMTok: number; outPerMTok: number; cachedInPerMTok?: number; cacheWritePerMTok?: number; source: string; checkedAt: string }
  plan?: Plan
  // AI Gateway upstream the run is pinned to.
  host?: string
  // Reasoning values in the runner's own names, in picker order.
  supports: { strictJson: boolean; effort?: string[]; temperature: boolean }
}

// Only the general levels; models offering two of them show just those.
const standardEffort = ['low', 'medium', 'high']

const anthropicPricing = 'https://platform.claude.com/docs/en/about-claude/pricing'
const openaiPricing = 'https://developers.openai.com/api/docs/pricing'

const apiModels: Model[] = [
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    modelName: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    price: { inPerMTok: 0.1, outPerMTok: 0.5, cachedInPerMTok: 0.01, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: standardEffort, temperature: false },
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    modelName: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    price: { inPerMTok: 2, outPerMTok: 10, cachedInPerMTok: 0.1, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: standardEffort, temperature: false },
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    modelName: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    price: { inPerMTok: 4, outPerMTok: 20, cachedInPerMTok: 0.2, source: anthropicPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: standardEffort, temperature: false },
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    modelName: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    price: { inPerMTok: 0.1, outPerMTok: 0.5, cachedInPerMTok: 0.01, cacheWritePerMTok: 0.125, source: openaiPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: standardEffort, temperature: false },
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    modelName: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    price: { inPerMTok: 2, outPerMTok: 10, cachedInPerMTok: 0.1, cacheWritePerMTok: 2.5, source: openaiPricing, checkedAt: '2026-10-24' },
    supports: { strictJson: true, effort: standardEffort, temperature: false },
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
    supports: { strictJson, effort: standardEffort, temperature: false },
  })

const gatewayPricing = 'https://ai-gateway.vercel.sh/v1/models'

// Pinned to one host, since price and quantization vary by upstream; prices and effort from `GET /v1/models/{id}/endpoints`.
const viaGateway = (
  name: string,
  label: string,
  host: string,
  effort: string[],
  temperature: boolean,
  [inPerMTok, outPerMTok, cachedInPerMTok, cacheWritePerMTok]: number[],
): Model => ({
  id: `${name.split('/')[1]}-gateway`,
  provider: 'gateway',
  modelName: name,
  label: `${label} · AI Gateway`,
  host,
  price: { inPerMTok, outPerMTok, cachedInPerMTok, cacheWritePerMTok, source: gatewayPricing, checkedAt: '2026-10-27' },
  supports: { strictJson: true, effort, temperature },
})

// Effort values are the general levels among the model's opencode variants (`GET /api/model`, opencode v2.0.32).
const opencodeGo = (name: string, label: string, effort: string[]): Model => ({
  id: `${name}-opencode-go`,
  provider: 'opencode',
  modelName: `opencode-go/${name}`,
  label: `${label} · OpenCode Go`,
  // Go bills the credit balance past its quota when Extra Usage is on, which the CLI cannot see or prevent.
  plan: 'subscription or credits',
  supports: { strictJson: false, effort, temperature: false },
})

// Free tier of the `opencode` provider: no quota to exhaust, but rate-limited and prompts may be retained by the host.
const opencodeFree = (name: string, label: string, effort: string[]): Model => ({
  id: `${name.replace(/-free$/, '')}-opencode-free`,
  provider: 'opencode',
  modelName: `opencode/${name}`,
  label: `${label} · OpenCode Free`,
  supports: { strictJson: false, effort, temperature: false },
})

// claude --json-schema lets the model skip its StructuredOutput tool, so it is prompt-only; codex --output-schema constrains.
export const models: Model[] = [
  ...apiModels,
  ...apiModels.filter((m) => m.provider === 'anthropic').map(viaCli('claude-code', false)),
  ...apiModels.filter((m) => m.provider === 'openai').map(viaCli('codex', true)),
  viaGateway('deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 'deepseek', ['low', 'high', 'max'], true, [0.15, 0.6, 0.003]),
  viaGateway('zai/glm-5.3-flash', 'GLM-5.3 Flash', 'zai', ['low', 'high', 'max'], true, [0.15, 0.5, 0.03]),
  viaGateway('moonshotai/kimi-k3', 'Kimi K3', 'moonshotai', ['low', 'high', 'max'], false, [3, 15, 0.3, 3]),
  viaGateway('minimax/minimax-m3', 'MiniMax M3', 'minimax', [], true, [0.3, 1.2, 0.06]),
  viaGateway('alibaba/qwen3.8-max', 'Qwen3.8 Max', 'alibaba', ['low', 'medium', 'xhigh'], true, [2, 6, 0.25, 2.5]),
  viaGateway('alibaba/qwen3.8-flash', 'Qwen3.8 Flash', 'alibaba', ['low', 'medium', 'xhigh'], true, [0.15, 0.47, 0.016, 0.2]),
  viaGateway('xiaomi/mimo-v2.6-flash', 'MiMo V2.6 Flash', 'xiaomi', ['low', 'medium', 'high'], true, [0.14, 0.28, 0.0028]),
  viaGateway('nvidia/nemotron-3-ultra-550b-a55b', 'Nemotron 3 Ultra', 'fireworks', ['low', 'medium', 'high'], true, [0.6, 2.4, 0.12]),
  opencodeGo('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', ['high', 'max']),
  opencodeGo('glm-5.3-flash', 'GLM-5.3 Flash', ['high', 'max']),
  opencodeGo('kimi-k3', 'Kimi K3', ['max']),
  opencodeGo('minimax-m3', 'MiniMax M3', []),
  opencodeGo('qwen3.8-max', 'Qwen3.8 Max', ['low', 'medium']),
  opencodeGo('qwen3.8-flash', 'Qwen3.8 Flash', ['low', 'medium']),
  opencodeFree('deepseek-v4.1-flash-free', 'DeepSeek V4.1 Flash', ['low', 'high', 'max']),
  opencodeFree('glm-5.3-flash-free', 'GLM-5.3 Flash', ['low', 'high', 'max']),
  opencodeFree('mimo-v2.6-flash-free', 'MiMo V2.6 Flash', []),
  opencodeFree('nemotron-3-ultra-free', 'Nemotron 3 Ultra', []),
  opencodeFree('big-pickle', 'Big Pickle', []),
]
