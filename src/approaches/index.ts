import { flatStrict } from './flat-strict'
import { html } from './html'
import { jsonRender } from './json-render'
import type { Approach } from './types'

export type { Approach, ParseError, ParseState, Parser } from './types'

export const approaches: Approach[] = [jsonRender, flatStrict, html]
