import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { models, type Provider } from '../src/models.ts'
import { run } from './run.ts'

const keyEnv: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
}

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/models', (c) => c.json(models.filter((m) => process.env[keyEnv[m.provider]])))
  .post('/api/run', run)

if (import.meta.main) serve({ fetch: app.fetch, port: 8787 }, ({ port }) => console.log(`API on :${port}`))
