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

export async function frames(approach: Approach, deltas: [number, string][]): Promise<Frame[]> {
  const final = await parseAll(approach, deltas.map((d) => d[1]).join('')).catch(() => undefined)
  const parser = approach.createParser()
  const out: Frame[] = []
  let parsed: ParseState = { renderable: false, errors: [] }
  let failure: ParseError[] = []
  const add = (t: number, next: ParseState) => out.push({ t, state: share(next, out.at(-1)?.state, final) as ParseState })
  // Same as Pane: a parser error keeps the last state, appends the error and stops reading.
  const errorOf = (e: unknown): ParseError => ({ at: 'parser', message: e instanceof Error ? e.message : String(e) })
  const withErrors = (state: ParseState, errors: ParseError[]) => ({ ...state, errors: [...state.errors, ...errors] })
  for (const [t, text] of deltas) {
    try {
      parsed = await parser.push(text)
    } catch (e) {
      failure = [errorOf(e)]
      add(t, withErrors(parsed, failure))
      break
    }
    add(t, parsed)
  }
  const end = await parser.end().catch((e: unknown) => withErrors(parsed, [errorOf(e)]))
  add(out.at(-1)?.t ?? 0, withErrors(end, failure))
  return out
}
