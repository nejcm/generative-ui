import type { ParseState, Parser } from './types'

// Feeds text in pseudo-random 1–40 char chunks (seeded, so failures reproduce) and records every state.
export async function replay(parser: Parser, text: string, seed: number) {
  let rng = seed
  const next = () => (rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const states: ParseState[] = []
  for (let i = 0; i < text.length; ) {
    const size = 1 + Math.floor(next() * 40)
    states.push(await parser.push(text.slice(i, i + size)))
    i += size
  }
  return { states, final: await parser.end() }
}
