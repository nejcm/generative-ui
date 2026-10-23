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

export const stripFences = (text: string) => text.replace(/^\s*```[\w-]*\n?/, '').replace(/\n?```\s*$/, '')
