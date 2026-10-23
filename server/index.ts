import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { models, type Provider } from '../src/models.ts'
import { run } from './run.ts'
import { runsApi } from './runs.ts'

const keyEnv: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
}

const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
// Loopback Host also stops DNS-rebinding pages, whose Origin and Host match but name a foreign host.
const sameOrigin = (origin: string | undefined, host: string | undefined) =>
  !origin || (URL.canParse(origin) && new URL(origin).host === host && loopback.has(new URL(origin).hostname))

export const app = new Hono()
  // Blocks drive-by requests from other sites/ports: foreign Origins, and non-JSON bodies that skip CORS preflight.
  .use('/api/*', async (c, next) => {
    if (!sameOrigin(c.req.header('origin'), c.req.header('host'))) return c.json({ error: 'cross-origin request' }, 403)
    if (c.req.method !== 'GET' && !c.req.header('content-type')?.startsWith('application/json'))
      return c.json({ error: 'expected application/json' }, 415)
    await next()
  })
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/models', (c) => c.json(models.filter((m) => process.env[keyEnv[m.provider]])))
  .post('/api/run', run)
  .route('/api/runs', runsApi(fileURLToPath(new URL('../runs', import.meta.url))))

if (import.meta.main) serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8787 }, ({ port }) => console.log(`API on :${port}`))
