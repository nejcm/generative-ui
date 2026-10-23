import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'
import { CatalogPreview, previewSpec } from '@/ui/CatalogPreview'
import { catalog, SpecView, validateElement } from './catalog'
import { componentProps, type ComponentName } from './schema'

test.each(Object.keys(componentProps) as ComponentName[])('%s schema accepts its sample props', (name) => {
  expect(componentProps[name].safeParse(catalog.data.components[name].example).error).toBeUndefined()
})

test('every preview element passes catalog validation', () => {
  for (const element of Object.values(previewSpec.elements)) expect(validateElement(element)).toBeUndefined()
})

test('CatalogPreview mounts every component', () => {
  const markup = renderToString(<CatalogPreview />)
  for (const text of ['Revenue', 'Dashboard', 'Welcome back.', 'Save', 'Email', 'Choose a plan', 'Ada', 'Private', 'Active users', 'Placeholder photo', 'New', 'Weekly sales', 'Overview', 'First child'])
    expect(markup).toContain(text)
})

test('validateElement checks literal props but lets expressions through', () => {
  expect(validateElement({ type: 'Input', props: { value: { $bindState: '/form/email' } } })).toBeUndefined()
  expect(validateElement({ type: 'Stat', props: { label: { $state: '/x' }, value: { $state: '/y' } } })).toBeUndefined()
  expect(validateElement({ type: 'Stat', props: { label: 'Users' } })).toMatch(/Stat props/)
  expect(validateElement({ type: 'Marquee', props: {} })).toMatch(/unknown component/)
  expect(validateElement({ type: 'Image', props: { src: 'javascript:alert(1)', alt: '' } })).toMatch(/Image props/)
})

test('state-bound props render from the initial state and invalid resolved props show a marker', () => {
  const spec = (state: Record<string, unknown>) => ({
    root: 't',
    elements: { t: { type: 'Table', props: { columns: ['Name'], rows: { $state: '/rows' } }, children: [] } },
    state,
  })
  expect(renderToString(<SpecView spec={spec({ rows: [['Ada']] })} />)).toContain('Ada')
  expect(renderToString(<SpecView spec={spec({ rows: 'nope' })} />)).toContain('invalid Table props')
})
