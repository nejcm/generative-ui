import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { RunPatch, RunRecord, runId, type Run, type RunSummary } from '../src/lib/run.ts'

// createdAt is fixed-width (ms precision, Z), so the id is everything after the 24-char timestamp and a dash.
const fileName = (run: Run) => `${run.createdAt.replace(/[:.]/g, '-')}-${run.id}.json`
const idOf = (file: string) => file.slice(25, -'.json'.length)

export function runsApi(dir: string) {
  const files = async () => (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse()
  const find = async (id: string) => (await files()).find((f) => idOf(f) === id)
  const read = async (file: string): Promise<Run> => JSON.parse(await readFile(join(dir, file), 'utf8'))
  const write = async (file: string, run: Run) => {
    await writeFile(join(dir, `${file}.tmp`), JSON.stringify(run, null, 2))
    await rename(join(dir, `${file}.tmp`), join(dir, file))
  }
  // One read-modify-write at a time, so overlapping PATCHes can't lose an update or race on the .tmp file.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T,>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task)
    queue = result.catch(() => undefined)
    return result
  }

  return new Hono()
    .get('/', async (c) => {
      const { batchId, presetId } = c.req.query()
      const runs = (await Promise.all((await files()).map((f) => read(f).catch(() => console.warn(`skipping unreadable run ${f}`))))).filter((r) => r !== undefined)
      const summaries: RunSummary[] = runs
        .filter((r) => (!batchId || r.batchId === batchId) && (!presetId || r.presetId === presetId))
        .map(({ system: _s, rawOutput: _o, ...summary }) => summary)
      return c.json(summaries)
    })
    .get('/:id', async (c) => {
      const file = runId.safeParse(c.req.param('id')).success && (await find(c.req.param('id')))
      return file ? c.json(await read(file)) : c.json({ error: 'not found' }, 404)
    })
    .post('/', async (c) => {
      const parsed = RunRecord.extend({ createdAt: z.iso.datetime({ precision: 3 }) }).safeParse(await c.req.json().catch(() => undefined))
      if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400)
      return serial(async () => {
        if (await find(parsed.data.id)) return c.json({ error: 'run exists' }, 409)
        await mkdir(dir, { recursive: true })
        await write(fileName(parsed.data), parsed.data)
        return c.json({ id: parsed.data.id }, 201)
      })
    })
    .patch('/:id', async (c) => {
      const id = c.req.param('id')
      const patch = RunPatch.safeParse(await c.req.json().catch(() => undefined))
      if (!patch.success) return c.json({ error: z.prettifyError(patch.error) }, 400)
      return serial(async () => {
        const file = runId.safeParse(id).success && (await find(id))
        if (!file) return c.json({ error: 'not found' }, 404)
        await write(file, { ...(await read(file)), ...patch.data })
        return c.json({ id })
      })
    })
}
