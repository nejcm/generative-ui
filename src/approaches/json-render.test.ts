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
