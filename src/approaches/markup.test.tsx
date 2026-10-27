import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { catalog } from '@/catalog/catalog'
import { componentProps } from '@/catalog/schema'
import sales from '@/fixtures/sales.json'
import { coverage } from '@/lib/coverage'
import { fidelity } from '@/lib/fidelity'
import { visibleText } from '@/lib/visible-text'
import { presets } from '@/prompts'
import { parseAll } from '.'
import { flatStrict } from './flat-strict'
import { markup } from './markup'
import { replay } from './replay'

const sample = `<Stack gap="lg">
  <Heading level="h1" text="Revenue"/>
  <Table columns='["Product","Units"]' rows='[["Trail Runner 3",412]]'/>
</Stack>`
const parse = (text: string) => parseAll(markup, text)

test('catalog markup produces the expected spec', async () => {
  expect(await parse(sample)).toEqual({
    renderable: true, errors: [], spec: { root: 'r', elements: {
      r: { type: 'Stack', props: { gap: 'lg' }, children: ['r.0', 'r.1'] },
      'r.0': { type: 'Heading', props: { level: 'h1', text: 'Revenue' }, children: [] },
      'r.1': { type: 'Table', props: { columns: ['Product', 'Units'], rows: [['Trail Runner 3', 412]] }, children: [] },
    } },
  })
})

test('every prefix is safe to push, finish and render after the first opening tag', async () => {
  const parser = markup.createParser()
  for (let i = 0; i <= sample.length; i++) {
    const state = await parser.push(i ? sample[i - 1] : '')
    const prefix = await parse(sample.slice(0, i))
    expect(state.spec).toEqual(prefix.spec)
    expect(state.errors).toEqual([])
    expect(state.renderable).toBe(i > sample.indexOf('>'))
    if (state.renderable) expect(() => renderToString(createElement(markup.Renderer, { state }))).not.toThrow()
  }
  expect((await parser.end()).errors).toEqual([])
})

test('opening tags wait for closed attributes; published ids and earlier states stay stable', async () => {
  const parser = markup.createParser()
  const first = await parser.push('<Stack><Card title="Sales">')
  const partial = await parser.push('<Text text="2026')
  expect(partial.spec).toEqual(first.spec)
  const final = await parser.push('-Q3"/><Separator/></Card></Stack>')
  expect(first.spec!.elements['r.0'].children).toEqual([])
  expect(final.spec!.elements['r.0'].children).toEqual(['r.0.0', 'r.0.1'])
  expect(final.spec!.elements['r.0.0'].props.text).toBe('2026-Q3')
})

test('both quotes, escapes, entities and JSON string escapes survive single-character chunks', async () => {
  const text = String.raw`<Stack><Text text="Say \"hi\" at C:\Temp &amp; &lt; &gt; &quot; &#39; &amp;quot;"/><Text text='It\'s ready'/><Table columns='["Product"]' rows='[["Trail \"Runner\"\n3"]]'/></Stack>`
  const parser = markup.createParser()
  for (const ch of text) await parser.push(ch)
  const result = await parser.end()
  expect(result.errors).toEqual([])
  expect(result.spec!.elements['r.0'].props.text).toBe('Say "hi" at C:\\Temp & < > " \' &quot;')
  expect(result.spec!.elements['r.1'].props.text).toBe("It's ready")
  expect(result.spec!.elements['r.2'].props.rows).toEqual([['Trail "Runner"\n3']])
})

test.each([
  ['Grid', { columns: '3' }, { columns: '3' }],
  ['Stat', { label: 'Revenue', value: '1200' }, { label: 'Revenue', value: '1200' }],
  ['Checkbox', { label: 'Remember', checked: 'false' }, { label: 'Remember', checked: false }],
  ['Progress', { value: '73' }, { value: 73 }],
  ['List', { items: '["Fast","Private"]', ordered: 'true' }, { items: ['Fast', 'Private'], ordered: true }],
  ['Heading', { text: '"Revenue"' }, { text: 'Revenue' }],
] as const)('%s decodes props by the same schema rule as B', async (type, props, expected) => {
  const entries = Object.entries(props)
  const d = await parse(`<${type} ${entries.map(([key, value]) => `${key}='${value}'`).join(' ')}/>`)
  const b = await parseAll(flatStrict, JSON.stringify({ root: 'r', elements: [{ id: 'r', type, props: entries.map(([key, value]) => ({ key, value })), children: [] }] }))
  expect(d.errors).toEqual([])
  expect(d.spec!.elements.r.props).toEqual(expected)
  expect(d.spec).toEqual(b.spec)
})

test('unknown tags and invalid props skip their subtrees without changing later sibling paths', async () => {
  const result = await parse('<Stack><Unknown><Text text="Hidden"/></Unknown><Chart type="radar" data="[]"><Text text="Hidden"/></Chart><Text text="Shown"/></Stack>')
  expect(result.errors).toEqual([
    { at: 'r.0', message: 'unknown component type: Unknown' },
    { at: 'r.1', message: expect.stringContaining('Chart props') },
  ])
  expect(Object.keys(result.spec!.elements)).toEqual(['r', 'r.2'])
  expect(result.spec!.elements.r.children).toEqual(['r.2'])
  expect(visibleText(result)).toBe('Shown')
})

test.each([
  ['', 'root element "r" is missing'],
  ['<Stack><Text text="Revenue"/>', 'unclosed tag <Stack>'],
  ['<Text text="Revenue', 'unclosed opening tag or attribute'],
  ['<Text text="Revenue"/></Text>', 'stray closing tag </Text>'],
  ['<Stack></Card></Stack>', 'mismatched closing tag </Card>; expected </Stack>'],
  ['<Text text="Revenue"/>tail', 'text after the root'],
  ['<Text text="Revenue"/><Text text="Other"/>', 'only one root element is allowed'],
  ['<Stack>Revenue</Stack>', 'text nodes are not allowed'],
  ['<Text text="Revenue"/></', 'unclosed closing tag'],
  ['<Text text=Revenue/>', 'expected quoted value for text'],
  ['<Text text="Revenue" text="Other"/>', 'duplicate attribute text'],
])('reports malformed structure for %s', async (text, message) => {
  const result = await parse(text)
  expect(result.errors.map((e) => e.message)).toContain(message)
  expect(result).toEqual((await replay(markup.createParser(), text, 42)).final)
})

test.each(['__proto__', 'prototype', 'constructor', 'toString', 'visible', 'on', '$state', '$bindState'])('rejects unsupported or unsafe names: %s', async (name) => {
  const result = await parse(`<Stack ${name}='{"polluted":true}'><Text text="Shown"/></Stack>`)
  expect(Object.keys(result.spec!.elements)).toEqual(['r', 'r.0'])
  expect(result.spec!.elements.r.props).toEqual({})
  expect(result.errors).toEqual([{ at: 'r', message: `unknown prop ${name} on Stack`, severity: 'warning' }])
  expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
})

test.each([
  '<!-- dashboard -->',
  "<!-- today's revenue -->",
  '<?xml version="1.0"?>',
  '<Input disabled label="a > b"/>',
  '<Text text"x"/>',
  '<Text text="a"/ >',
])('a malformed tag is void before or inside the root: %s', async (bad) => {
  for (const text of [`${bad}<Stack><Text text="Shown"/></Stack>`, `<Stack>${bad}<Text text="Shown"/></Stack>`]) {
    const result = await parse(text)
    expect(result.renderable).toBe(true)
    expect(visibleText(result)).toBe('Shown')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).not.toMatch(/unclosed|mismatched/)
    const parser = markup.createParser()
    for (const ch of text) await parser.push(ch)
    expect(await parser.end()).toEqual(result)
  }
})

test('unknown and invalid optional props cost only the attribute, using B\'s repair rule', async () => {
  const result = await parse('<Stack gap="xl" className="p-4"><Text text="Shown"/><Progress value="bad"/><Checkbox label="Remember" checked="maybe"/></Stack>')
  expect(result.renderable).toBe(true)
  expect(result.spec!.elements.r.props).toEqual({})
  expect(result.spec!.elements.r.children).toEqual(['r.0', 'r.2'])
  expect(result.spec!.elements['r.2'].props).toEqual({ label: 'Remember' })
  expect(result.errors.map((e) => e.message)).toEqual([
    'unknown prop className on Stack',
    'dropped invalid optional prop gap: "xl"',
    expect.stringContaining('Progress props'),
    'dropped invalid optional prop checked: "maybe"',
  ])
  const b = await parseAll(flatStrict, JSON.stringify({ root: 'r', elements: [{ id: 'r', type: 'Stack', props: [{ key: 'gap', value: 'xl' }], children: [] }] }))
  expect(result.spec!.elements.r.props).toEqual(b.spec!.elements.r.props)
  expect(result.errors[1]).toEqual(b.errors[0])
})

test('JSON backslashes and escaped apostrophes keep their intended values', async () => {
  const text = String.raw`<Stack><Table columns='["Path","Note"]' rows='[["C:\\temp","Trail \"Runner\"\n3"]]'/><Text text="Don\'t stop"/></Stack>`
  const parser = markup.createParser()
  for (const ch of text) await parser.push(ch)
  const result = await parser.end()
  expect(result.errors).toEqual([])
  expect(result.spec!.elements['r.0'].props.rows).toEqual([['C:\\temp', 'Trail "Runner"\n3']])
  expect(result.spec!.elements['r.1'].props.text).toBe("Don't stop")
})

test.each(['```html\n', '  ```markup\n', '```'])('code fences may stream across arbitrary boundaries: %s', async (opening) => {
  const parser = markup.createParser()
  for (const ch of `${opening}${sample}\n\x60\x60\x60\n`) {
    const state = await parser.push(ch)
    expect(state.errors).toEqual([])
  }
  expect(await parser.end()).toEqual(await parse(sample))
  expect((await parse(`${sample}\n\x60\x60\x60extra`)).errors.map((e) => e.message)).toContain('text after the root')
})

test('fence detection preserves backticks inside a prop across the first chunk boundary', async () => {
  const parser = markup.createParser()
  await parser.push('```html\n<Text text="```')
  await parser.push('"/>\n```')
  const result = await parser.end()
  expect(result.errors).toEqual([])
  expect(result.spec!.elements.r.props.text).toBe('```')
  expect(result).toEqual(await parse('```html\n<Text text="```"/>\n```'))
})

test('an ancestor closing tag implicitly closes intervening tags and preserves later sibling placement', async () => {
  const text = '<Stack><Grid><Card title="A"></Grid><Text text="After"/></Stack>'
  const result = await parse(text)
  expect(result.spec!.elements.r.children).toEqual(['r.0', 'r.1'])
  expect(result.spec!.elements['r.1'].props.text).toBe('After')
  expect(result.errors).toEqual([
    { at: 'output', message: 'mismatched closing tag </Grid>; expected </Card>' },
    { at: 'r.0.0', message: 'unclosed tag <Card>' },
  ])
  expect((await replay(markup.createParser(), text, 7)).final).toEqual(result)
})

const dashboard = `<Stack gap="lg">
  <Heading level="h1" text="Revenue ${sales.period}"/>
  <Stat label="Revenue" value="${sales.totals.revenue}"/>
  <Card title="Weekly revenue"><Chart type="bar" title="${sales.weeklyNote}" data='${JSON.stringify(sales.weekly.map((w) => ({ label: w.week, value: w.revenue })))}'/></Card>
  <Card title="Revenue by channel"><Table columns='["Channel","Revenue","Orders"]' rows='${JSON.stringify(sales.byChannel.map((c) => [c.channel, c.revenue, c.orders]))}'/></Card>
  <Card title="Top products"><Table columns='["Product","Units","Revenue"]' rows='${JSON.stringify(sales.topProducts.map((p) => [p.name, p.units, p.revenue]))}'/></Card>
</Stack>`

test.each([1, 7, 42])('a dashboard streamed in random chunks matches a single push, seed %i', async (seed) => {
  const { states, final } = await replay(markup.createParser(), dashboard, seed)
  expect(final).toEqual(await parse(dashboard))
  expect(final.errors).toEqual([])
  expect(states.some((s) => s.renderable && !s.spec!.elements['r.4.0'])).toBe(true)
  expect(fidelity(final, presets.find((p) => p.id === 'dashboard')!.requires)).toBe(1)
  expect(coverage({ weekly: sales.weekly, products: sales.topProducts.map((p) => p.name) }, dashboard)).toBe(1)
})

test('prompt lists the shared catalog with prop schemas and the design brief and fixture, without binding hints', () => {
  const prompt = markup.systemPrompt({ catalog, fixture: sales })
  for (const [name, schema] of Object.entries(componentProps)) {
    const line = prompt.split('\n').find((line) => line.startsWith(`- ${name}: `))
    expect(line).toBeDefined()
    for (const key of Object.keys(schema.shape)) expect(line).toContain(key)
  }
  expect(prompt).toContain('body only')
  expect(prompt).toContain('DESIGN BRIEF')
  expect(prompt).toContain('DATA (build the UI around this content):')
  expect(prompt).toContain(JSON.stringify(sales, null, 2))
  expect(prompt).not.toMatch(/\$state|\$bindState|\bvisible\b|`on`|Bind /)
})
