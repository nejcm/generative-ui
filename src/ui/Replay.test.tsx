import { renderToString } from 'react-dom/server'
import { afterEach, expect, test, vi } from 'vitest'
import { approachById } from '@/approaches'
import { frames, nextEpoch, runClock, stateAt, whenCurrent } from '@/lib/playback'
import type { Run } from '@/lib/run'
import { Replay } from './Replay'

const html = approachById('html')!
const deltas: [number, string][] = [
  [300, '<html><body>'],
  [450, '<p>Hi</p>'],
  [700, '</body></html>'],
]
const run = {
  id: 'r1',
  approach: 'html',
  rawOutput: deltas.map((d) => d[1]).join(''),
  deltas,
  metrics: { totalMs: 800, errors: [] },
} as unknown as Run

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('nothing is renderable at playhead 0', async () => {
  expect(stateAt(await frames(html, deltas), 0).renderable).toBe(false)
})

test('seeking to t shows the frame at or before t', async () => {
  const result = await frames(html, deltas)
  expect(stateAt(result, 449).html).toBe('<html><body>')
  expect(stateAt(result, 450).html).toBe('<html><body><p>Hi</p>')
  expect(stateAt(result, 10_000)).toBe(result.at(-1)!.state)
})

let now = 0
const queued = new Map<number, FrameRequestCallback>()
let lastId = 0
const stubFrames = () => {
  now = 0
  queued.clear()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (queued.set(++lastId, cb), lastId))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id))
}
const frameAt = (t: number) => {
  now = t
  const callbacks = [...queued.values()]
  queued.clear()
  callbacks.forEach((cb) => cb(t))
}

test('2× speed halves the wall time to the end', () => {
  stubFrames()
  const wallTimeToEnd = (speed: number) => {
    const start = now
    let ended = 0
    runClock({ current: 0 }, 800, speed, (t) => t === 800 && (ended = now))
    while (queued.size) frameAt(now + 16)
    return ended - start
  }
  expect(wallTimeToEnd(1)).toBe(800)
  expect(wallTimeToEnd(2)).toBe(400)
})

test('the first frame counts the time since the clock started', () => {
  stubFrames()
  const playhead = { current: 0 }
  runClock(playhead, 10_000, 1, () => {})
  frameAt(5000)
  expect(playhead.current).toBe(5000)
})

test('cancel stops ticking and keeps elapsed time across a speed change', () => {
  stubFrames()
  const playhead = { current: 0 }
  const ticks: number[] = []
  const cancel = runClock(playhead, 10_000, 1, (t) => ticks.push(t))
  frameAt(100)
  now = 150
  cancel()
  cancel()
  expect(queued.size).toBe(0)
  frameAt(500)
  expect(ticks).toEqual([100, 150])
  runClock(playhead, 10_000, 2, (t) => ticks.push(t))
  expect(queued.size).toBe(1)
  frameAt(700)
  expect(playhead.current).toBe(150 + 200 * 2)
})

test('only backward seeks start a new renderer epoch', () => {
  expect(nextEpoch(3, 500, 0)).toBe(4)
  expect(nextEpoch(3, 500, 499)).toBe(4)
  expect(nextEpoch(3, 500, 500)).toBe(3)
  expect(nextEpoch(3, 500, 800)).toBe(3)
})

test('a result that resolves after cancel is dropped', async () => {
  const applied: string[] = []
  let resolveOld!: (v: string) => void
  const cancelOld = whenCurrent(new Promise<string>((r) => (resolveOld = r)), (v) => applied.push(v))
  cancelOld()
  whenCurrent(Promise.resolve('new'), (v) => applied.push(v))
  resolveOld('old')
  await new Promise((r) => setTimeout(r))
  expect(applied).toEqual(['new'])
})

test('old runs without deltas render nothing; new ones prepare frames first', () => {
  expect(renderToString(<Replay run={{ ...run, deltas: undefined }} />)).toBe('')
  expect(renderToString(<Replay run={run} />)).toContain('Preparing…')
})
