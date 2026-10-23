import { flatStrict } from './flat-strict'
import { html } from './html'
import { jsonRender } from './json-render'
import type { Approach } from './types'

export type { Approach, ParseError, ParseState, Parser } from './types'

export const approaches: Approach[] = [jsonRender, flatStrict, html]

export const approachById = (id: string) => approaches.find((a) => a.id === id)

export async function parseAll(approach: Approach, rawOutput: string) {
  const parser = approach.createParser()
  if (rawOutput) await parser.push(rawOutput)
  return parser.end()
}
