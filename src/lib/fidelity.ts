import type { ParseState } from '../approaches/types'
import { visibleText } from './visible-text.ts'

export function fidelity(state: ParseState, requires?: string[]): number | undefined {
  if (!requires?.length) return undefined
  const visible = visibleText(state).toLowerCase()
  return requires.filter((word) => visible.includes(word.toLowerCase())).length / requires.length
}
