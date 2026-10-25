import { parseAll, type Approach, type ParseError, type ParseState } from '../approaches'

export type Frame = { t: number; state: ParseState }

type Tree = { [key: string]: unknown }

// Reuses unchanged subtrees of the previous frame and slices growing strings from the final state (engines keep slices as views).
// shortcut: a changed spec still copies its elements map, O(frames × elements) pointers; use a persistent map if specs grow past ~100 KB.
function share(next: unknown, prev: unknown, final: unknown): unknown {
  if (typeof next === 'string') return next !== prev && typeof final === 'string' && final.startsWith(next) ? final.slice(0, next.length) : next
  if (!next || typeof next !== 'object') return next
  const [n, p, f] = [next as Tree, (prev && typeof prev === 'object' ? prev : {}) as Tree, (final && typeof final === 'object' ? final : {}) as Tree]
  const out: Tree = Array.isArray(next) ? ([] as unknown as Tree) : {}
  let same = p === prev && Array.isArray(next) === Array.isArray(prev) && Object.keys(n).length === Object.keys(p).length
  for (const key of Object.keys(n)) {
    // defineProperty, not assignment, so an own "__proto__" key stays a key.
    Object.defineProperty(out, key, { value: share(n[key], p[key], f[key]), enumerable: true, writable: true, configurable: true })
    same &&= out[key] === p[key] && Object.hasOwn(p, key)
  }
  return same ? prev : out
}

const errorOf = (e: unknown): ParseError => ({ at: 'parser', message: e instanceof Error ? e.message : String(e) })
const withErrors = (state: ParseState, errors: ParseError[]) => ({ ...state, errors: [...state.errors, ...errors] })

// A parser error keeps the last state, appends the error and stops reading; shared by live runs and replay.
export function fold(approach: Approach) {
  const parser = approach.createParser()
  let parsed: ParseState = { renderable: false, errors: [] }
  let failure: ParseError[] = []
  return {
    get failed() {
      return failure.length > 0
    },
    async push(text: string): Promise<ParseState> {
      if (failure.length) return withErrors(parsed, failure)
      try {
        parsed = await parser.push(text)
      } catch (e) {
        failure = [errorOf(e)]
        return withErrors(parsed, failure)
      }
      return parsed
    },
    async end(): Promise<ParseState> {
      const end = await parser.end().catch((e: unknown) => withErrors(parsed, [errorOf(e)]))
      return withErrors(end, failure)
    },
  }
}

export async function frames(approach: Approach, deltas: [number, string][]): Promise<Frame[]> {
  const final = await parseAll(approach, deltas.map((d) => d[1]).join('')).catch(() => undefined)
  const parse = fold(approach)
  const out: Frame[] = []
  const add = (t: number, next: ParseState) => out.push({ t, state: share(next, out.at(-1)?.state, final) as ParseState })
  for (const [t, text] of deltas) {
    add(t, await parse.push(text))
    if (parse.failed) break
  }
  add(out.at(-1)?.t ?? 0, await parse.end())
  return out
}

const empty: ParseState = { renderable: false, errors: [] }

// Index of the last frame with t <= playhead, -1 before the first.
export function frameIndexAt(frames: Frame[], playhead: number) {
  let [lo, hi] = [0, frames.length]
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t <= playhead) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

export const stateAt = (frames: Frame[], playhead: number) => frames[frameIndexAt(frames, playhead)]?.state ?? empty

// Advances playhead.current by wall-clock time × speed each animation frame until end; seeks can write playhead.current meanwhile.
// Cancelling counts the time since the last frame, so pausing or changing speed loses none.
export function runClock(playhead: { current: number }, end: number, speed: number, onTick: (t: number) => void) {
  let last = performance.now()
  const advance = (now: number) => {
    playhead.current = Math.min(end, playhead.current + Math.max(0, now - last) * speed)
    last = now
    onTick(playhead.current)
  }
  const step = (now: number) => {
    advance(now)
    id = playhead.current < end ? requestAnimationFrame(step) : 0
  }
  let id = requestAnimationFrame(step)
  return () => {
    if (!id) return
    cancelAnimationFrame(id)
    id = 0
    advance(performance.now())
  }
}

// Seeking backwards bumps the epoch so renderers with their own state (SpecView's store) remount instead of keeping later state.
export const nextEpoch = (epoch: number, from: number, to: number) => (to < from ? epoch + 1 : epoch)

// Applies the result only while still current; returns the cancel for an effect cleanup.
export function whenCurrent<T>(promise: Promise<T>, apply: (value: T) => void) {
  let current = true
  promise.then((value) => current && apply(value))
  return () => {
    current = false
  }
}
