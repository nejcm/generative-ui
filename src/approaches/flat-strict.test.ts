import { describe, expect, test } from 'vitest'
import { catalog } from '@/catalog/catalog'
import { flatStrict, flatToSpec, PROPS_VARIANT } from './flat-strict'
import { replay } from './replay'

const kv = (props: Record<string, unknown>) =>
  Object.entries(props).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) }))

const el = {
  main: (children: string[]) => ({ id: 'main', type: 'Card', props: kv({ title: 'Sales' }), children }),
  stat: { id: 'stat', type: 'Stat', props: kv({ label: 'Revenue', value: '1200' }), children: [] },
  bad: { id: 'bad', type: 'Chart', props: kv({ type: 'radar', data: [] }), children: [] },
  table: { id: 'table', type: 'Table', props: kv({ columns: ['Name', 'Sales'], rows: [['Ada', 120]] }), children: [] },
}
const doc = (...elements: object[]) => JSON.stringify({ root: 'main', elements })
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
    expect(flatToSpec(value, { complete: true, final: false }).spec!.elements.main.children).toEqual(['stat', 'later'])
    const final = flatToSpec(value, { complete: true, final: true })
    expect(final.spec!.elements.main.children).toEqual(['stat'])
    expect(final.errors).toEqual([{ at: 'main', message: 'missing child "later"' }])
  })

  test('rejects duplicate ids and non-list props', () => {
    const value = { root: 'main', elements: [el.main([]), el.main([]), { id: 'x', type: 'Text', props: { text: 'hi' }, children: [] }] }
    expect(flatToSpec(value, { complete: true, final: false }).errors).toEqual([
      { at: 'main', message: 'duplicate id' },
      { at: 'x', message: 'props must be a list of {key, value}' },
    ])
  })

  test('does not trust a root that may still be streaming', () => {
    expect(flatToSpec({ root: 'ma' }, { complete: false, final: false }).spec!.root).toBe('')
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
