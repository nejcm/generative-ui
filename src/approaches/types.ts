import type { Spec } from '@json-render/core'
import type { FC } from 'react'
import type { catalog } from '@/catalog/catalog'

export type ParseError = { at: string; message: string }

export type ParseState = {
  spec?: Spec
  html?: string
  renderable: boolean
  errors: ParseError[]
}

// Async because flat-strict uses `parsePartialJson` from `ai`, which returns a Promise.
export type Parser = {
  push(chunk: string): Promise<ParseState>
  end(): Promise<ParseState>
}

export interface Approach {
  id: 'json-render' | 'flat-strict' | 'html'
  label: string
  systemPrompt(ctx: { catalog: typeof catalog; fixture?: unknown }): string
  output: { kind: 'text' } | { kind: 'json-schema'; schema: Record<string, unknown> }
  createParser(): Parser
  Renderer: FC<{ state: ParseState }>
}

export const fixtureBlock = (fixture: unknown) =>
  fixture === undefined ? '' : `\n\nDATA (build the UI around this content):\n${JSON.stringify(fixture, null, 2)}`

export const designBrief = `

DESIGN BRIEF (applies to every UI you produce):
- Build a complete, realistic screen, not a skeleton: a clear title and intro, grouped sections, and enough detail that it could ship.
- Cover exactly what the request names, with no extra pages or marketing sections.
- Use the supplied DATA in full: every field is there to be shown. Derive useful extras from it (shares, totals, deltas, rankings) instead of inventing unrelated numbers.
- Where it fits, add status badges, trend/change figures, secondary actions, helper text, and sensible empty or edge-case copy.
- Establish hierarchy with headings, size and weight; group related items; keep spacing and alignment consistent.
- Make charts readable: a title, labelled axes or values, and a legend for pie charts.
- Never use lorem ipsum or placeholder names like "Item 1".`

export const stripFences = (text: string) => text.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '')
