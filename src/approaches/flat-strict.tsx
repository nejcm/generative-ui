import type { Spec } from '@json-render/core'
import { parsePartialJson } from 'ai'
import { finalSpecErrors, SpecView, validateElement } from '@/catalog/catalog'
import { componentProps, type ComponentName } from '@/catalog/schema'
import { fixtureBlock, stripFences, type Approach, type ParseError, type ParseState, type Parser } from './types'

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

const tryJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Values are strings on the wire; use the JSON-decoded value only where the prop schema accepts it.
function toProps(type: unknown, entries: unknown[]): Record<string, unknown> {
  const shape: Record<string, { safeParse(v: unknown): { success: boolean } }> =
    componentProps[type as ComponentName]?.shape ?? {}
  const pairs = entries.filter(
    (e): e is { key: string; value: string } =>
      typeof (e as { key?: unknown })?.key === 'string' && typeof (e as { value?: unknown })?.value === 'string',
  )
  return Object.fromEntries(
    pairs.map(({ key, value }) => {
      const decoded = tryJson(value)
      return [key, decoded !== undefined && shape[key]?.safeParse(decoded).success ? decoded : value]
    }),
  )
}

export function flatToSpec(value: unknown, { complete, final }: { complete: boolean; final: boolean }): ParseState {
  const errors: ParseError[] = []
  const flat = (typeof value === 'object' && value !== null ? value : {}) as { root?: unknown; elements?: unknown }
  const list: FlatElement[] = Array.isArray(flat.elements) ? flat.elements : []
  // Until the JSON closes, the last element may still be streaming.
  const ready = complete ? list : list.slice(0, -1)
  const elements: Spec['elements'] = {}
  const seen = new Set<string>()
  const rejected = new Set<string>()

  ready.forEach((raw, i) => {
    if (typeof raw?.id !== 'string') return errors.push({ at: `elements[${i}]`, message: 'element has no string id' })
    if (seen.has(raw.id)) return errors.push({ at: raw.id, message: 'duplicate id' })
    seen.add(raw.id)
    const children = Array.isArray(raw.children) ? raw.children.filter((c) => typeof c === 'string') : []
    const element = { type: String(raw.type), props: Array.isArray(raw.props) ? toProps(raw.type, raw.props) : {}, children }
    const error = Array.isArray(raw.props) ? validateElement(element) : 'props must be a list of {key, value}'
    if (error) {
      rejected.add(raw.id)
      errors.push({ at: raw.id, message: error })
    } else elements[raw.id] = element
  })

  const root = typeof flat.root === 'string' && (complete || 'elements' in flat) ? flat.root : ''
  const spec: Spec = { root, elements }
  if (final) {
    if (!complete) errors.push({ at: 'output', message: 'JSON is truncated or invalid' })
    errors.push(...finalSpecErrors(spec, rejected))
  }
  for (const element of Object.values(elements))
    element.children = element.children!.filter((c) => !rejected.has(c) && (!final || c in elements))
  return { spec, renderable: Boolean(elements[root]), errors }
}

function createParser(): Parser {
  let text = ''
  // shortcut: re-parses the whole text on every chunk (O(n²)), fine for few-KB outputs; go incremental if it shows in TTFR
  const parse = async (final: boolean) => {
    const { value, state } = await parsePartialJson(stripFences(text))
    return flatToSpec(value, { complete: state === 'successful-parse', final })
  }
  return {
    push(chunk) {
      text += chunk
      return parse(false)
    },
    end: () => parse(true),
  }
}

const componentLines = (prompt: string) =>
  prompt.split('\n').filter((l) => Object.keys(componentProps).some((name) => l.startsWith(`- ${name}: `)))

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
    ].join('\n') + fixtureBlock(fixture),
  output: { kind: 'json-schema', schema: flatSchema },
  createParser,
  Renderer: ({ state }) => <SpecView spec={state.spec ?? null} />,
}
