import type { Spec } from '@json-render/core'
import { createsCycle, finalSpecErrors, SpecView, validateElement } from '@/catalog/catalog'
import { componentProps } from '@/catalog/schema'
import { componentLines, decodeProp, droppableProps, validatorOf } from './props'
import { designBrief, fixtureBlock, stripOpeningFence, type Approach, type ParseError, type Parser } from './types'

type Mode = 'text' | 'name' | 'attrs' | 'attr' | 'equals' | 'quote' | 'value' | 'selfClose' | 'close' | 'discard'
type OpenTag = { type: string; id: string; next: number; skip: boolean }
const entities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'" }
const decodeEntities = (value: string) => value.replace(/&(quot|amp|lt|gt|#39);/g, (_, name: string) => entities[name])

function createParser(): Parser {
  let spec: Spec = { root: 'r', elements: {} }
  const stack: OpenTag[] = []
  const errors: ParseError[] = []
  let mode: Mode = 'text'
  let name = '', attr = '', value = '', quote = '', trailing = '', previous = ''
  let leading: string | undefined = ''
  let attrs: [string, string][] = []
  let invalid: string | undefined
  let escaped = false, rootSeen = false, textSeen = false

  const error = (message: string, at = 'output') => errors.push({ at, message })
  const fail = (message: string) => { invalid = message; quote = ''; escaped = false; mode = 'discard' }
  const finish = (selfClosing: boolean) => {
    const parent = stack.at(-1)
    const id = parent ? `${parent.id}.${parent.next++}` : 'r'
    let skip = parent?.skip ?? false
    if (!parent) {
      if (rootSeen) { error('only one root element is allowed'); skip = true }
      rootSeen = true
    }
    if (!skip) {
      const props = Object.fromEntries(attrs.map(([key, raw]) => [key, decodeProp(name, key, decodeEntities(raw))]))
      if (Object.hasOwn(componentProps, name)) {
        for (const key of Object.keys(props)) {
          if (!validatorOf(name, key)) { error(`unknown prop ${key} on ${name}`, id); delete props[key] }
        }
        for (const key of droppableProps(name, props)) {
          error(`dropped invalid optional prop ${key}: ${JSON.stringify(props[key]).slice(0, 80)}`, id)
          delete props[key]
        }
      }
      const element = { type: name, props, children: [] as string[] }
      const problem = validateElement(element)
      if (problem) { error(problem, id); skip = true }
      else {
        const elements = { ...spec.elements, [id]: element }
        if (createsCycle(elements, id)) { error('children form a cycle', id); skip = true }
        else {
          if (parent) elements[parent.id] = { ...elements[parent.id], children: [...elements[parent.id].children!, id] }
          spec = { ...spec, elements }
        }
      }
    }
    if (!selfClosing) stack.push({ type: name, id, next: 0, skip })
    mode = 'text'
  }
  const close = () => {
    const type = name.trim()
    if (!/^[A-Za-z_][\w-]*$/.test(type)) error('invalid closing tag')
    else if (!stack.length) error(`stray closing tag </${type}>`)
    else {
      const match = stack.findLastIndex((tag) => tag.type === type)
      if (stack.at(-1)!.type !== type) error(`mismatched closing tag </${type}>; expected </${stack.at(-1)!.type}>`)
      if (match >= 0) {
        for (const tag of stack.slice(match + 1)) error(`unclosed tag <${tag.type}>`, tag.id)
        stack.length = match
      }
    }
    mode = 'text'
  }
  const consume = (ch: string) => {
    switch (mode) {
      case 'text':
        if (rootSeen && !stack.length && (trailing || ch === '`')) { trailing += ch; break }
        if (ch === '<') { mode = 'name'; name = ''; attrs = []; invalid = undefined; textSeen = false }
        else if (/\S/.test(ch) && !textSeen) {
          error(rootSeen && !stack.length ? 'text after the root' : 'text nodes are not allowed')
          textSeen = true
        }
        break
      case 'name':
        if (ch === '/' && !name) mode = 'close'
        else if (/[\w-]/.test(ch)) name += ch
        else if (!name || !/^[A-Za-z_]/.test(name)) fail('invalid tag name')
        else if (/\s/.test(ch)) mode = 'attrs'
        else if (ch === '>') finish(false)
        else if (ch === '/') mode = 'selfClose'
        else fail('invalid tag name')
        break
      case 'attrs':
        if (ch === '>') finish(false)
        else if (ch === '/') mode = 'selfClose'
        else if (/[A-Za-z_$]/.test(ch)) { attr = ch; mode = 'attr' }
        else if (/\S/.test(ch)) fail('invalid attribute name')
        break
      case 'attr':
        if (/[\w$-]/.test(ch)) attr += ch
        else if (ch === '=') mode = 'quote'
        else if (/\s/.test(ch)) mode = 'equals'
        else fail(`expected = after ${attr}`)
        break
      case 'equals':
        if (ch === '=') mode = 'quote'
        else if (/\S/.test(ch)) fail(`expected = after ${attr}`)
        break
      case 'quote':
        if (ch === '"' || ch === "'") { quote = ch; value = ''; escaped = false; mode = 'value' }
        else if (/\S/.test(ch)) fail(`expected quoted value for ${attr}`)
        break
      case 'value':
        if (escaped) { value += ch === quote || ch === "'" ? ch : `\\${ch}`; escaped = false }
        else if (ch === '\\') escaped = true
        else if (ch === quote) {
          if (attrs.some(([key]) => key === attr)) fail(`duplicate attribute ${attr}`)
          else { attrs.push([attr, value]); mode = 'attrs' }
        } else value += ch
        break
      case 'selfClose':
        if (ch === '>') finish(true)
        else fail('expected > after /')
        break
      case 'close':
        if (ch === '>') close()
        else name += ch
        break
      case 'discard':
        if (escaped) escaped = false
        else if (quote) {
          if (ch === '\\') escaped = true
          else if (ch === quote) quote = ''
        } else if (name && previous === '=' && (ch === '"' || ch === "'")) quote = ch
        break
    }
    if (mode === 'discard' && ch === '>' && !quote) { error(invalid!); mode = 'text' }
    if (/\S/.test(ch)) previous = ch
  }
  const state = () => ({ spec, renderable: Object.hasOwn(spec.elements, spec.root), errors: [...errors] })
  return {
    async push(chunk) {
      if (leading !== undefined) {
        leading += chunk
        if (/^\s*(?:`{0,2}|```[\w-]*)$/.test(leading)) return state()
        chunk = stripOpeningFence(leading)
        leading = undefined
      }
      for (const ch of chunk) consume(ch)
      return state()
    },
    async end() {
      if (leading !== undefined) { for (const ch of stripOpeningFence(leading)) consume(ch); leading = undefined }
      if (trailing && !/^```\s*$/.test(trailing)) error('text after the root')
      if (mode !== 'text') error(mode === 'close' ? 'unclosed closing tag' : 'unclosed opening tag or attribute')
      for (const tag of stack) error(`unclosed tag <${tag.type}>`, tag.id)
      errors.push(...finalSpecErrors(spec, new Set()))
      return state()
    },
  }
}

export const markup: Approach = {
  id: 'markup',
  label: 'D · catalog markup',
  systemPrompt: ({ catalog, fixture }) => [
    'You are a UI generator. Respond with the body only: one catalog markup root, no prose, markdown or code fences.',
    'Use nested catalog tags with props as quoted attributes. No text nodes; put text in props. Use /> for leaves.',
    'Attribute values are strings. Numbers, booleans and arrays use JSON text, decoded only when accepted by the prop schema.',
    'Use single quotes around JSON attributes; JSON backslashes are kept as-is. Escape the enclosing quote with a backslash, or use &quot; &amp; &lt; &gt; &#39;.',
    'Only the listed props are supported. Omit optional props you do not need. Include realistic sample content.',
    `<Stack gap="lg"><Heading level="h1" text="Revenue"/><Table columns='["Product","Units"]' rows='[["Trail Runner 3",412]]'/></Stack>`,
    '',
    'AVAILABLE COMPONENTS:',
    ...componentLines(catalog.prompt()),
  ].join('\n') + designBrief + fixtureBlock(fixture),
  output: { kind: 'text' },
  createParser,
  Renderer: ({ state }) => <SpecView spec={state.spec ?? null} />,
}
