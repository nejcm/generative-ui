import { expect, test } from 'vitest'
import { parseAll } from '../approaches'
import { flatStrict } from '../approaches/flat-strict'
import { jsonRender } from '../approaches/json-render'
import { markup } from '../approaches/markup'
import { presets } from '../prompts'
import { fidelity } from './fidelity'

const requires = presets.find((p) => p.id === 'login')!.requires!

test('fidelity reads string props in the final A/B/D spec case-insensitively', async () => {
  const elements = [
    { id: 'form', type: 'Card', props: { title: 'EMAIL' }, children: ['password', 'remember', 'submit'] },
    { id: 'password', type: 'Input', props: { label: 'Password' }, children: [] },
    { id: 'remember', type: 'Checkbox', props: { label: 'Remember me' }, children: [] },
    { id: 'submit', type: 'Button', props: { label: 'SIGN IN' }, children: [] },
  ]
  const a = [{ op: 'add', path: '/root', value: 'form' }, ...elements.map(({ id, ...value }) => ({ op: 'add', path: `/elements/${id}`, value }))].map((p) => JSON.stringify(p)).join('\n')
  const b = JSON.stringify({ root: 'form', elements: elements.map((e) => ({ ...e, props: Object.entries(e.props).map(([key, value]) => ({ key, value: JSON.stringify(value) })) })) })
  expect(fidelity(await parseAll(jsonRender, a), requires)).toBe(1)
  expect(fidelity(await parseAll(flatStrict, b), requires)).toBe(1)
  expect(fidelity(await parseAll(markup, '<Card title="EMAIL"><Input label="Password"/><Checkbox label="Remember me"/><Button label="SIGN IN"/></Card>'), requires)).toBe(1)
})

test('fidelity excludes state, element ids, unreachable elements and hidden branches', () => {
  const state = { renderable: true, errors: [], spec: {
    root: 'password', state: { text: 'sign in' }, elements: {
      password: { type: 'Card', props: { title: 'Email' }, children: ['hidden'] },
      hidden: { type: 'Text', props: { text: 'Password' }, visible: false },
      unused: { type: 'Text', props: { text: 'Remember me' } },
    },
  } }
  expect(fidelity(state, requires)).toBe(1 / 4)
})

test('HTML fidelity uses text rather than tags, attributes, scripts, styles or comments', () => {
  const state = { renderable: true, errors: [], html: '<style>.password {}</style><script>"remember"</script><!-- password --><form id="password"><label>EMAIL</label><button>Sign <b>In</b></button></form>' }
  expect(fidelity(state, requires)).toBe(2 / 4)
  expect(fidelity({ renderable: false, errors: [] }, requires)).toBe(0)
  expect(fidelity(state)).toBeUndefined()
  expect(fidelity(state, [])).toBeUndefined()
})

test('fidelity excludes binding paths, expressions and non-text props', () => {
  const state = { renderable: true, errors: [], spec: { root: 'form', elements: {
    form: { type: 'Card', props: {}, children: ['email', 'password', 'remember', 'submit', 'chart'] },
    email: { type: 'Input', props: { type: 'email', value: { $bindState: '/email' }, placeholder: 'Email' } },
    password: { type: 'Input', props: { type: 'password', value: { $bindState: '/password' }, name: 'password' } },
    remember: { type: 'Checkbox', props: { label: { $template: 'Remember {{name}}' }, checked: { $bindState: '/remember' } } },
    submit: { type: 'Button', props: { label: { $state: '/sign in' }, variant: 'sign in', href: '/sign in' } },
    chart: { type: 'Chart', props: { data: [{ label: 'Other', value: 1, color: 'email' }] } },
  } } }
  expect(fidelity(state, requires)).toBe(0)
  expect(fidelity({ renderable: true, errors: [], html: '<input type="email" placeholder="Email" aria-label="password" name="remember"><a href="/sign in"></a>' }, requires)).toBe(0)
})

test('fidelity compares spec text and decoded HTML text consistently', () => {
  const text = 'Email & Password · Remember · Sign in'
  const spec = { root: 'main', elements: { main: { type: 'Text', props: { text } } } }
  expect(fidelity({ renderable: true, errors: [], spec }, requires)).toBe(1)
  expect(fidelity({ renderable: true, errors: [], html: '<p data-label="not > text">Email &amp; Password · Remember · Sign&nbsp;in</p>' }, requires)).toBe(1)
})

test('fidelity includes literal controls and fallback text actually rendered by the catalog', () => {
  const spec = { root: 'main', elements: {
    main: { type: 'Stack', props: {}, children: ['input', 'select', 'progress', 'avatar', 'image'] },
    input: { type: 'Input', props: { value: 'Prefilled email' } },
    select: { type: 'Select', props: { options: ['Monthly'], value: 'Monthly' } },
    progress: { type: 'Progress', props: { label: 'Uploading', value: 73 } },
    avatar: { type: 'Avatar', props: { name: 'Ana Horvat' } },
    image: { type: 'Image', props: { src: 'https://example.com/photo.png', alt: 'Summit view' } },
  } }
  const state = { spec, renderable: true, errors: [] }
  expect(fidelity(state, ['Prefilled email', 'Monthly', '73', 'AH', 'Summit view'])).toBe(1)
  expect(fidelity(state, ['Ana Horvat', 'photo.png'])).toBe(0)
  expect(fidelity({ ...state, spec: { root: 'password', elements: {
    password: { type: 'Input', props: { type: 'password', value: 'Secret', placeholder: 'Hint' } },
  } } }, ['Secret', 'Hint'])).toBe(0)
  expect(fidelity({ ...state, spec: { root: 'progress', elements: {
    progress: { type: 'Progress', props: { value: 73 } },
  } } }, ['73'])).toBe(0)
})
