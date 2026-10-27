import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { models, type Provider } from '../src/models.ts'
import { isCli, killAllClis, probeClis, type CliProvider } from './cli.ts'
import { run } from './run.ts'
import { runsApi } from './runs.ts'

const keyEnv: Record<Exclude<Provider, CliProvider>, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
}

let clis: Promise<CliProvider[]> | undefined
const availableClis = () => (clis ??= probeClis())

const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
// Loopback Host on every request stops DNS-rebinding pages, which send their own (foreign) Host with or without Origin.
const allowed = (origin: string | undefined, host: string) =>
  URL.canParse(`http://${host}`) && loopback.has(new URL(`http://${host}`).hostname) && (!origin || (URL.canParse(origin) && new URL(origin).host === host))

export const app = new Hono()
  // Blocks drive-by requests from other sites/ports: foreign Origins, and non-JSON bodies that skip CORS preflight.
  .use('/api/*', async (c, next) => {
    if (!allowed(c.req.header('origin'), c.req.header('host') ?? new URL(c.req.url).host)) return c.json({ error: 'cross-origin request' }, 403)
    if (c.req.method !== 'GET' && !c.req.header('content-type')?.startsWith('application/json'))
      return c.json({ error: 'expected application/json' }, 415)
    await next()
  })
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/models', async (c) => {
    const ready = await availableClis()
    return c.json(models.filter((m) => (isCli(m.provider) ? ready.includes(m.provider) : process.env[keyEnv[m.provider]])))
  })
  .post('/api/run', run)
  .route('/api/runs', runsApi(fileURLToPath(new URL('../runs', import.meta.url))))

if (import.meta.main) {
  availableClis()
  // Default SIGINT/SIGTERM handling (node --watch restarts) skips 'exit' listeners.
  process.on('exit', killAllClis)
  process.once('SIGINT', () => process.exit(130))
  process.once('SIGTERM', () => process.exit(143))
  serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 8787 }, ({ port }) => console.log(`API on :${port}`))
}
