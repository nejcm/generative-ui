import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Run } from '../src/lib/run.ts'
import { runsApi } from './runs.ts'

let dir: string
let api: ReturnType<typeof runsApi>
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'runs-'))
  api = runsApi(join(dir, 'runs'))
})
afterEach(() => rm(dir, { recursive: true }))

const run = (over: Partial<Run> = {}): Run => ({
  id: 'r1',
  createdAt: '2026-10-24T04:03:05.123Z',
  batchId: 'b1',
  approach: 'html',
  modelId: 'claude-haiku-5-5',
  settings: {},
  presetId: 'login',
  prompt: 'a login form',
  system: 'sys',
  systemHash: 'a'.repeat(64),
  systemOverridden: false,
  rawOutput: '<p>hi</p>',
  metrics: { ttftMs: 100, ttfrMs: 150, totalMs: 900, inputTokens: 10, outputTokens: 20, costUsd: 0.001, valid: true, errorCount: 0, errors: [], aborted: false },
  ...over,
})
const send = (method: string, path: string, body: unknown) =>
  api.request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const list = async (query = '') => ((await (await api.request(`/${query}`)).json()) as Run[]).map((r) => r.id)

test('POST writes one file named <timestamp>-<id>.json under the runs dir', async () => {
  expect((await send('POST', '/', run())).status).toBe(201)
  expect(await readdir(join(dir, 'runs'))).toEqual(['2026-10-24T04-03-05-123Z-r1.json'])
  expect((await send('POST', '/', run())).status).toBe(409)
})

test('POST rejects invalid records, traversal ids and extra fields', async () => {
  for (const body of [run({ id: '../../etc/x' }), run({ batchId: '../b' }), { ...run(), extra: 1 }, run({ createdAt: '2026-10-24' }), 'nope'])
    expect((await send('POST', '/', body)).status).toBe(400)
  expect(await readdir(dir)).toEqual([])
})

test('GET lists summaries newest first and filters by batchId and presetId', async () => {
  await send('POST', '/', run({ id: 'r1' }))
  await send('POST', '/', run({ id: 'r2', batchId: 'b2', createdAt: '2026-10-24T05:00:00.000Z' }))
  await send('POST', '/', run({ id: 'r3', batchId: 'b2', presetId: 'pricing', createdAt: '2026-10-24T06:00:00.000Z' }))
  expect(await list()).toEqual(['r3', 'r2', 'r1'])
  expect(await list('?batchId=b2')).toEqual(['r3', 'r2'])
  expect(await list('?presetId=login')).toEqual(['r2', 'r1'])
  expect(await list('?batchId=b2&presetId=login')).toEqual(['r2'])
  const [summary] = (await (await api.request('/?batchId=b1')).json()) as object[]
  expect(summary).not.toHaveProperty('rawOutput')
  expect(await (await api.request('/r1')).json()).toEqual(run())
})

test('GET on an empty runs dir is an empty list', async () => {
  expect(await list()).toEqual([])
})

test('PATCH updates rating and notes only', async () => {
  await send('POST', '/', run())
  expect((await send('PATCH', '/r1', { rating: 4, notes: 'tidy' })).status).toBe(200)
  const saved = JSON.parse(await readFile(join(dir, 'runs', '2026-10-24T04-03-05-123Z-r1.json'), 'utf8'))
  expect(saved).toMatchObject({ rating: 4, notes: 'tidy', rawOutput: '<p>hi</p>' })
  expect((await send('PATCH', '/r1', { rating: 6 })).status).toBe(400)
  expect((await send('PATCH', '/r1', { rawOutput: 'x' })).status).toBe(400)
  expect((await send('PATCH', '/nope', { rating: 1 })).status).toBe(404)
  expect(await readdir(join(dir, 'runs'))).toHaveLength(1)
})

test('path traversal in :id never reaches the filesystem', async () => {
  await send('POST', '/', run())
  for (const id of ['..%2F..%2Fetc%2Fpasswd', '..%5C..%5Cwin.ini', 'r1.json', 'a%00b', '.r1']) {
    expect((await api.request(`/${id}`)).status).toBe(404)
    expect((await send('PATCH', `/${id}`, { rating: 1 })).status).toBe(404)
  }
})
