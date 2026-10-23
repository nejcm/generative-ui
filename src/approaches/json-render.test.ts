import { describe, expect, test } from 'vitest'
import { jsonRender } from './json-render'
import { replay } from './replay'

const lines = {
  root: { op: 'add', path: '/root', value: 'main' },
  main: (children: string[]) => ({
    op: 'add',
    path: '/elements/main',
    value: { type: 'Card', props: { title: 'Login' }, children },
  }),
  email: {
    op: 'add',
    path: '/elements/email',
    value: { type: 'Input', props: { label: 'Email', value: { $bindState: '/form/email' } }, children: [] },
  },
  bad: { op: 'add', path: '/elements/bad', value: { type: 'Stat', props: { label: 'No value' }, children: [] } },
  submit: {
    op: 'add',
    path: '/elements/submit',
    value: {
      type: 'Button',
      props: { label: 'Sign in' },
      on: { press: { action: 'toggle', params: { statePath: '/sent' } } },
      children: [],
    },
  },
  state: { op: 'add', path: '/state/form', value: { email: '' } },
}
const jsonl = (...patches: object[]) => patches.map((p) => JSON.stringify(p)).join('\n') + '\n'
const seeds = [1, 7, 42]

describe.each(seeds)('json-render parser, seed %i', (seed) => {
  test('valid stream renders progressively with no errors', async () => {
    const text = jsonl(lines.root, lines.main(['email', 'submit']), lines.email, lines.submit, lines.state)
    const { states, final } = await replay(jsonRender.createParser(), text, seed)
    expect(states.some((s) => s.renderable && !s.spec?.elements.submit)).toBe(true)
    expect(final.errors).toEqual([])
    expect(Object.keys(final.spec!.elements)).toEqual(['main', 'email', 'submit'])
    expect(final.spec!.state).toEqual({ form: { email: '' } })
  })

  test('one invalid patch mid-stream is dropped and the rest renders', async () => {
    const text = jsonl(lines.root, lines.main(['email', 'bad', 'submit']), lines.email, lines.bad, lines.submit)
    const { final } = await replay(jsonRender.createParser(), text, seed)
    expect(final.errors).toHaveLength(1)
    expect(final.errors[0]).toMatchObject({ at: 'line 4' })
    expect(Object.keys(final.spec!.elements)).toEqual(['main', 'email', 'submit'])
    expect(final.renderable).toBe(true)
  })

  test('truncated stream keeps complete patches and flags the cut line and the missing child', async () => {
    const full = jsonl(lines.root, lines.main(['email', 'submit']), lines.email, lines.submit)
    const { final } = await replay(jsonRender.createParser(), full.slice(0, full.indexOf('Sign in')), seed)
    expect(Object.keys(final.spec!.elements)).toEqual(['main', 'email'])
    expect(final.errors.map((e) => e.message)).toEqual([expect.stringContaining('not a JSON patch'), 'missing child "submit"'])
  })
})

test('ignores markdown fences around the patches', async () => {
  const text = '```jsonl\n' + jsonl(lines.root, lines.main([])) + '```'
  const { final } = await replay(jsonRender.createParser(), text, 3)
  expect(final.errors).toEqual([])
  expect(final.renderable).toBe(true)
})

test('system prompt is the catalog prompt plus the fixture', async () => {
  const { catalog } = await import('@/catalog/catalog')
  const prompt = jsonRender.systemPrompt({ catalog, fixture: { sales: [1, 2] } })
  expect(prompt.startsWith(catalog.prompt())).toBe(true)
  expect(prompt).toContain('"sales"')
})

describe('review regressions', () => {
  const parse = async (...patches: object[]) => {
    const parser = jsonRender.createParser()
    await parser.push(jsonl(...patches))
    return parser.end()
  }
  const ok = lines.root
  const main = lines.main([])

  test('prototype paths are rejected and never reach Object.prototype', async () => {
    const final = await parse(ok, main, { op: 'add', path: '/state/__proto__/polluted', value: 'yes' }, { op: 'copy', from: '/__proto__', path: '/state/x' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(final.errors.map((e) => e.message)).toEqual([expect.stringContaining('unsafe path'), expect.stringContaining('unsafe path')])
    expect(final.renderable).toBe(true)
  })

  test.each([
    ['null element', null],
    ['null props', { type: 'Text', props: null, children: [] }],
    ['inherited type name', { type: 'toString', props: {}, children: [] }],
  ])('%s is one error and the rest still renders', async (_, value) => {
    const final = await parse(ok, lines.main(['x']), { op: 'add', path: '/elements/x', value })
    expect(final.errors).toHaveLength(1)
    expect(final.renderable).toBe(true)
  })

  test('a patch that closes a child cycle is rejected', async () => {
    const final = await parse(ok, lines.main(['loop']), { op: 'add', path: '/elements/loop', value: { type: 'Stack', props: {}, children: ['main'] } })
    expect(final.errors).toEqual([{ at: 'line 3', message: 'children form a cycle' }])
    expect(final.spec!.elements.loop).toBeUndefined()
  })
})

describe('round 2 regressions', () => {
  const parse = async (...patches: object[]) => {
    const parser = jsonRender.createParser()
    await parser.push(jsonl(...patches))
    return parser.end()
  }

  test('cycle check decodes the pointer token of the element id', async () => {
    const final = await parse(
      { op: 'add', path: '/root', value: 'a/b' },
      { op: 'add', path: '/elements/a~1b', value: { type: 'Stack', props: {}, children: ['a/b'] } },
    )
    expect(final.errors).toEqual([{ at: 'line 2', message: 'children form a cycle' }, { at: 'root', message: 'root element "a/b" is missing' }])
  })

  test('a non-string path is one patch error and later patches still apply', async () => {
    const final = await parse({ op: 'add', path: 42, value: 0 }, lines.root, lines.main([]))
    expect(final.errors).toEqual([{ at: 'line 1', message: 'path and from must be strings' }])
    expect(final.renderable).toBe(true)
  })

  const table = (rows: unknown) => [
    { op: 'add', path: '/root', value: 't' },
    { op: 'add', path: '/elements/t', value: { type: 'Table', props: { columns: ['Name'], rows: { $state: '/rows' } }, children: [] } },
    { op: 'add', path: '/state/rows', value: rows },
  ]

  test('state-bound props are validated after resolution and counted', async () => {
    expect((await parse(...table([['Ada']]))).errors).toEqual([])
    const final = await parse(...table('nope'))
    expect(final.errors).toHaveLength(1)
    expect(final.errors[0]).toMatchObject({ at: 't', message: expect.stringContaining('after resolving state') })
  })

  test('repeat children resolve $item per item', async () => {
    const list = (items: unknown[]) => [
      { op: 'add', path: '/root', value: 'list' },
      { op: 'add', path: '/elements/list', value: { type: 'Stack', props: {}, repeat: { statePath: '/items' }, children: ['item'] } },
      { op: 'add', path: '/elements/item', value: { type: 'Text', props: { text: { $item: 'name' } }, children: [] } },
      { op: 'add', path: '/state/items', value: items },
    ]
    expect((await parse(...list([{ name: 'a' }, { name: 'b' }]))).errors).toEqual([])
    expect((await parse(...list([{ name: 'a' }, { name: 5 }, { name: 6 }]))).errors).toEqual([
      { at: 'item', message: expect.stringContaining('after resolving state') },
    ])
  })
})
