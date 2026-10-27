import type { Spec } from '@json-render/core'
import { parsePartialJson } from 'ai'
import { createsCycle, finalSpecErrors, SpecView, validateElement } from '@/catalog/catalog'
import { componentProps } from '@/catalog/schema'
import { componentLines, decodeProp, droppableProps } from './props'
import { designBrief, fixtureBlock, stripFences, type Approach, type ParseError, type ParseState, type Parser } from './types'

// Props as {key, value} strings: a per-type props union breaks Anthropic strict-mode limits
// (≤16 union-typed and ≤24 optional params per request): platform.claude.com/docs/en/build-with-claude/structured-outputs
export const PROPS_VARIANT = 'kv-list'

const kv = {
  type: 'object',
  properties: { key: { type: 'string' }, value: { type: 'string' } },
  required: ['key', 'value'],
  additionalProperties: false,
}

export const flatSchema = {
  type: 'object',
  properties: {
    root: { type: 'string' },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: Object.keys(componentProps) },
          props: { type: 'array', items: kv },
          children: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'type', 'props', 'children'],
        additionalProperties: false,
      },
    },
  },
  required: ['root', 'elements'],
  additionalProperties: false,
}

type FlatElement = { id?: unknown; type?: unknown; props?: unknown; children?: unknown }

type Kv = { key: string; value: string }
const isKv = (e: unknown): e is Kv => typeof (e as Kv)?.key === 'string' && typeof (e as Kv)?.value === 'string'

const wireError = ({ props, children }: FlatElement) =>
  !Array.isArray(props) || !props.every(isKv)
    ? 'props must be a list of {key, value} strings'
    : !Array.isArray(children) || !children.every((c) => typeof c === 'string')
      ? 'children must be a list of element ids'
      : undefined

// Count of leading `elements` items that finished streaming: items followed by a comma, plus a closed last
// object/array. A primitive last item may still be growing (`12` → `123`), so it waits for the comma.
export function completedElements(text: string) {
  const stack: string[] = []
  let inString = false
  let commas = 0
  let lastClosed = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') {
      if (stack.pop() === '[' && stack.length === 1) return Infinity
      if (stack.length === 2) lastClosed = true
    } else if (ch === ',' && stack.length === 2 && stack[1] === '[') {
      commas++
      lastClosed = false
    }
  }
  return commas + (lastClosed ? 1 : 0)
}

// Values are strings on the wire; use the JSON-decoded value only where the prop schema accepts it.
function toProps(type: unknown, entries: Kv[]): Record<string, unknown> {
  return Object.fromEntries(entries.map(({ key, value }) => [key, decodeProp(type, key, value)]))
}

export function flatToSpec(value: unknown, { complete, closed, final }: { complete: boolean; closed: number; final: boolean }): ParseState {
  const errors: ParseError[] = []
  const flat = (typeof value === 'object' && value !== null ? value : {}) as { root?: unknown; elements?: unknown }
  const list: FlatElement[] = Array.isArray(flat.elements) ? flat.elements : []
  const ready = complete ? list : list.slice(0, closed)
  const elements: Spec['elements'] = {}
  const seen = new Set<string>()
  const rejected = new Set<string>()

  ready.forEach((raw, i) => {
    if (typeof raw?.id !== 'string') return errors.push({ at: `elements[${i}]`, message: 'element has no string id' })
    if (seen.has(raw.id)) return errors.push({ at: raw.id, message: 'duplicate id' })
    seen.add(raw.id)
    const wire = wireError(raw)
    const props = wire ? {} : toProps(raw.type, raw.props as Kv[])
    for (const key of droppableProps(raw.type, props)) {
      errors.push({ at: raw.id, message: `dropped invalid optional prop ${key}: ${JSON.stringify(props[key]).slice(0, 80)}`, severity: 'warning' })
      delete props[key]
    }
    const element = wire ? undefined : { type: String(raw.type), props, children: raw.children as string[] }
    let error = wire ?? validateElement(element)
    if (!error) {
      elements[raw.id] = element!
      if (createsCycle(elements, raw.id)) {
        delete elements[raw.id]
        error = 'children form a cycle'
      }
    }
    if (error) {
      rejected.add(raw.id)
      errors.push({ at: raw.id, message: error })
    }
  })

  const root = typeof flat.root === 'string' && (complete || 'elements' in flat) ? flat.root : ''
  const spec: Spec = { root, elements }
  if (final) {
    if (!complete) errors.push({ at: 'output', message: 'JSON is truncated or invalid' })
    errors.push(...finalSpecErrors(spec, rejected))
  }
  for (const element of Object.values(elements))
    element.children = element.children!.filter((c) => !rejected.has(c) && (!final || Object.hasOwn(elements, c)))
  return { spec, renderable: Object.hasOwn(elements, root), errors }
}

function createParser(): Parser {
  let text = ''
  // shortcut: re-parses the whole text on every chunk (O(n²)), fine for few-KB outputs; go incremental if it shows in TTFR
  const parse = async (final: boolean) => {
    const json = stripFences(text)
    const { value, state } = await parsePartialJson(json)
    return flatToSpec(value, { complete: state === 'successful-parse', closed: completedElements(json), final })
  }
  return {
    push(chunk) {
      text += chunk
      return parse(false)
    },
    end: () => parse(true),
  }
}

export const flatStrict: Approach = {
  id: 'flat-strict',
  label: 'B · flat element list (strict JSON)',
  systemPrompt: ({ catalog, fixture }) =>
    [
      'You are a UI generator. Respond with one JSON object only: no prose, no markdown, no code fences.',
      `It must match this JSON Schema (props variant: ${PROPS_VARIANT}):`,
      JSON.stringify(flatSchema),
      '',
      'RULES:',
      '- `elements` is a flat list. `root` is the id of the top element; `children` lists child ids in display order.',
      '- Write `root` first, then elements parent-before-child, so the UI can render while streaming.',
      '- Each prop is {"key": <prop name>, "value": <string>}. Strings go in as-is; numbers, booleans and arrays go in as JSON text, e.g. {"key":"rows","value":"[[\\"Ada\\",120]]"}.',
      '- Omit optional props you do not need. Leaf elements use "children": [].',
      '- Only use the components below. Include realistic sample content.',
      '',
      'AVAILABLE COMPONENTS:',
      ...componentLines(catalog.prompt()),
    ].join('\n') + designBrief + fixtureBlock(fixture),
  output: { kind: 'json-schema', schema: flatSchema },
  createParser,
  Renderer: ({ state }) => <SpecView spec={state.spec ?? null} />,
}
