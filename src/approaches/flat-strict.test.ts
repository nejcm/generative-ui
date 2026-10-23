import { describe, expect, test } from 'vitest'
import { catalog } from '@/catalog/catalog'
import { completedElements, flatStrict, flatToSpec, PROPS_VARIANT } from './flat-strict'
import { replay } from './replay'

const kv = (props: Record<string, unknown>) =>
  Object.entries(props).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) }))

const el = {
  main: (children: string[]) => ({ id: 'main', type: 'Card', props: kv({ title: 'Sales' }), children }),
  stat: { id: 'stat', type: 'Stat', props: kv({ label: 'Revenue', value: '1200' }), children: [] },
  bad: { id: 'bad', type: 'Chart', props: kv({ type: 'radar', data: [] }), children: [] },
  table: { id: 'table', type: 'Table', props: kv({ columns: ['Name', 'Sales'], rows: [['Ada', 120]] }), children: [] },
}
const doc = (...elements: unknown[]) => JSON.stringify({ root: 'main', elements })
const seeds = [1, 7, 42]

describe.each(seeds)('flat-strict parser, seed %i', (seed) => {
  test('valid stream renders progressively with no errors', async () => {
    const { states, final } = await replay(flatStrict.createParser(), doc(el.main(['stat', 'table']), el.stat, el.table), seed)
    expect(states.some((s) => s.renderable && !s.spec?.elements.table)).toBe(true)
    expect(final.errors).toEqual([])
    expect(final.spec!.elements.stat.props).toEqual({ label: 'Revenue', value: '1200' })
    expect(final.spec!.elements.table.props).toEqual({ columns: ['Name', 'Sales'], rows: [['Ada', 120]] })
  })

  test('one invalid element mid-stream is dropped and the rest renders', async () => {
    const text = doc(el.main(['stat', 'bad', 'table']), el.stat, el.bad, el.table)
    const { final } = await replay(flatStrict.createParser(), text, seed)
    expect(final.errors).toHaveLength(1)
    expect(final.errors[0].at).toBe('bad')
    expect(Object.keys(final.spec!.elements)).toEqual(['main', 'stat', 'table'])
    expect(final.spec!.elements.main.children).toEqual(['stat', 'table'])
  })

  test('truncated stream keeps complete elements and flags truncation and the missing child', async () => {
    const full = doc(el.main(['stat', 'table']), el.stat, el.table)
    const { final } = await replay(flatStrict.createParser(), full.slice(0, full.indexOf('"Table"') + 10), seed)
    expect(Object.keys(final.spec!.elements)).toEqual(['main', 'stat'])
    expect(final.errors.map((e) => e.message)).toEqual(['JSON is truncated or invalid', 'missing child "table"'])
    expect(final.spec!.elements.main.children).toEqual(['stat'])
  })
})

describe('flatToSpec', () => {
  test('keeps not-yet-streamed children while streaming and drops dangling ones at the end', () => {
    const value = { root: 'main', elements: [el.main(['stat', 'later']), el.stat] }
    expect(flatToSpec(value, { complete: true, closed: 0, final: false }).spec!.elements.main.children).toEqual(['stat', 'later'])
    const final = flatToSpec(value, { complete: true, closed: 0, final: true })
    expect(final.spec!.elements.main.children).toEqual(['stat'])
    expect(final.errors).toEqual([{ at: 'main', message: 'missing child "later"' }])
  })

  test('rejects duplicate ids and non-list props', () => {
    const value = { root: 'main', elements: [el.main([]), el.main([]), { id: 'x', type: 'Text', props: { text: 'hi' }, children: [] }] }
    expect(flatToSpec(value, { complete: true, closed: 0, final: false }).errors).toEqual([
      { at: 'main', message: 'duplicate id' },
      { at: 'x', message: 'props must be a list of {key, value} strings' },
    ])
  })

  test('does not trust a root that may still be streaming', () => {
    expect(flatToSpec({ root: 'ma' }, { complete: false, closed: 0, final: false }).spec!.root).toBe('')
  })
})

test('system prompt records the props variant and lists every component', () => {
  const prompt = flatStrict.systemPrompt({ catalog })
  expect(prompt).toContain(`props variant: ${PROPS_VARIANT}`)
  for (const name of catalog.componentNames) expect(prompt).toContain(`- ${name}: `)
})

test('strict schema stays within Anthropic limits: no unions, no optional params', () => {
  const json = JSON.stringify(flatStrict.output)
  expect(json).not.toContain('anyOf')
  expect(json).not.toMatch(/"type":\[/)
})

describe('review regressions', () => {
  const parse = async (text: string) => {
    const parser = flatStrict.createParser()
    await parser.push(text)
    return parser.end()
  }

  test('a finished last element survives truncation after it', async () => {
    const full = doc(el.main(['stat']), el.stat)
    for (const cut of [full.slice(0, -1), full.slice(0, -2), full.slice(0, full.lastIndexOf('}', full.length - 3) + 1) + ',']) {
      const final = await parse(cut)
      expect(Object.keys(final.spec!.elements)).toEqual(['main', 'stat'])
      expect(final.errors.map((e) => e.message)).toEqual(['JSON is truncated or invalid'])
    }
  })

  test('an element still streaming is held back', async () => {
    const full = doc(el.main(['stat']), el.stat)
    const parser = flatStrict.createParser()
    const state = await parser.push(full.slice(0, full.indexOf('"Revenue"')))
    expect(Object.keys(state.spec!.elements)).toEqual(['main'])
  })

  test('completedElements ignores braces inside strings', () => {
    expect(completedElements('{"root":"a","elements":[{"id":"a","props":[{"key":"t","value":"}}\\"{"}]},{"id":"b"')).toBe(1)
  })

  test('malformed prop entries and children reject the element instead of being dropped', async () => {
    const badProp = { id: 'bad', type: 'Card', props: [{ key: 'title', value: 42 }], children: [] }
    const badChildren = { id: 'bad2', type: 'Card', props: [], children: 'x' }
    const final = await parse(doc(el.main(['stat', 'bad', 'bad2']), el.stat, badProp, badChildren))
    expect(final.errors.map((e) => e.at)).toEqual(['bad', 'bad2'])
    expect(final.spec!.elements.main.children).toEqual(['stat'])
  })

  test('a child cycle is rejected and counted once', async () => {
    const final = await parse(doc(el.main(['loop']), { id: 'loop', type: 'Stack', props: [], children: ['main'] }))
    expect(final.errors).toEqual([{ at: 'loop', message: 'children form a cycle' }])
    expect(final.spec!.elements.main.children).toEqual([])
  })
})

describe('round 2 regressions', () => {
  test('a malformed item before a finished element does not shift the cutoff', async () => {
    const parser = flatStrict.createParser()
    await parser.push(doc(null, el.main([])).slice(0, -1))
    const final = await parser.end()
    expect(Object.keys(final.spec!.elements)).toEqual(['main'])
    expect(final.errors.map((e) => e.message)).toEqual(['element has no string id', 'JSON is truncated or invalid'])
  })

  test('completedElements counts primitive items once a comma follows', () => {
    expect(completedElements('{"root":"a","elements":[null,12,{"id":"a"}')).toBe(3)
    expect(completedElements('{"root":"a","elements":[null,12')).toBe(1)
    expect(completedElements('{"root":"a","elements":[1]')).toBe(Infinity)
  })
})
