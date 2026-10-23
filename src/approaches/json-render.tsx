import { applySpecStreamPatch, parseSpecStreamLine, type Spec, type SpecStreamLine } from '@json-render/core'
import { finalSpecErrors, SpecView, validateElement } from '@/catalog/catalog'
import { fixtureBlock, type Approach, type ParseError, type Parser } from './types'

// Not createSpecStreamCompiler: its push() applies patches before we can validate them and silently drops bad lines.
function createParser(): Parser {
  let spec: Spec = { root: '', elements: {} }
  let buffer = ''
  let lineNo = 0
  const errors: ParseError[] = []
  const rejected = new Set<string>()

  const apply = (patch: SpecStreamLine): string | undefined => {
    const next = structuredClone(spec)
    try {
      applySpecStreamPatch(next as unknown as Record<string, unknown>, patch)
    } catch (e) {
      return `patch failed: ${e instanceof Error ? e.message : String(e)}`
    }
    const [, top, id] = patch.path.split('/')
    if (top === 'root') {
      if (typeof next.root !== 'string') return 'root must be an element id'
    } else if (top === 'elements' && id) {
      const error = next.elements[id] && validateElement(next.elements[id])
      if (error) {
        rejected.add(id)
        return error
      }
      rejected.delete(id)
    } else if (top !== 'state') {
      return `unsupported path ${patch.path}`
    }
    spec = next
  }

  const line = (text: string) => {
    lineNo++
    const trimmed = text.trim()
    if (!trimmed || trimmed.startsWith('```')) return
    const patch = parseSpecStreamLine(trimmed)
    const error = patch ? apply(patch) : `not a JSON patch: ${trimmed.slice(0, 80)}`
    if (error) errors.push({ at: `line ${lineNo}`, message: error })
  }

  const state = () => ({ spec, renderable: Boolean(spec.elements[spec.root]), errors: [...errors] })

  return {
    async push(chunk) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      lines.forEach(line)
      return state()
    },
    async end() {
      line(buffer)
      buffer = ''
      errors.push(...finalSpecErrors(spec, rejected))
      return state()
    },
  }
}

export const jsonRender: Approach = {
  id: 'json-render',
  label: 'A · json-render SpecStream',
  systemPrompt: ({ catalog, fixture }) => catalog.prompt() + fixtureBlock(fixture),
  output: { kind: 'text' },
  createParser,
  Renderer: ({ state }) => <SpecView spec={state.spec ?? null} />,
}
