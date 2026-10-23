import { createStateStore, defineCatalog, getByPath, type Spec, type UIElement } from '@json-render/core'
import { flattenToPointers, immutableSetByPath } from '@json-render/core/store-utils'
import { defineRegistry, JSONUIProvider, Renderer, type SetState } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { components } from './components'
import { componentProps, type ComponentName } from './schema'

const container = ['default']

export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: componentProps.Stack,
      slots: container,
      description: 'Flex layout. Vertical by default; horizontal wraps.',
      example: { direction: 'vertical', gap: 'md' },
    },
    Grid: {
      props: componentProps.Grid,
      slots: container,
      description: 'Responsive grid of children.',
      example: { columns: '3', gap: 'md' },
    },
    Card: {
      props: componentProps.Card,
      slots: container,
      description: 'Bordered surface with optional title and description; children go in its body.',
      example: { title: 'Revenue', description: 'Last 30 days' },
    },
    Heading: { props: componentProps.Heading, slots: [], description: 'Section heading.', example: { text: 'Dashboard', level: 'h2' } },
    Text: { props: componentProps.Text, slots: [], description: 'Paragraph of text.', example: { text: 'Welcome back.', variant: 'muted' } },
    Button: {
      props: componentProps.Button,
      slots: [],
      description: 'Button. Bind its "press" event with `on` to run an action.',
      example: { label: 'Save', variant: 'default' },
    },
    Input: {
      props: componentProps.Input,
      slots: [],
      description: 'Labelled text field. Bind `value` with {"$bindState": "/path"} to store what the user types.',
      example: { label: 'Email', placeholder: 'you@example.com', type: 'email' },
    },
    Select: {
      props: componentProps.Select,
      slots: [],
      description: 'Dropdown of string options. Bind `value` with {"$bindState": "/path"}.',
      example: { label: 'Plan', options: ['Free', 'Pro', 'Team'], placeholder: 'Choose a plan' },
    },
    Table: {
      props: componentProps.Table,
      slots: [],
      description: 'Data table: column headers and rows of cells.',
      example: { columns: ['Name', 'Sales'], rows: [['Ada', 120], ['Linus', 95]] },
    },
    List: { props: componentProps.List, slots: [], description: 'Bulleted or numbered list.', example: { items: ['Fast', 'Private'], ordered: false } },
    Stat: {
      props: componentProps.Stat,
      slots: [],
      description: 'Single metric with optional change and trend.',
      example: { label: 'Active users', value: '1,204', change: '+4.2%', trend: 'up' },
    },
    Image: {
      props: componentProps.Image,
      slots: [],
      description: 'Image from an http(s) URL.',
      example: { src: 'https://picsum.photos/seed/gen/800/450', alt: 'Placeholder photo', aspect: 'video' },
    },
    Badge: { props: componentProps.Badge, slots: [], description: 'Small status label.', example: { text: 'New', variant: 'secondary' } },
    Chart: {
      props: componentProps.Chart,
      slots: [],
      description: 'Single-series bar, line, area or pie chart.',
      example: { type: 'bar', title: 'Weekly sales', data: [{ label: 'Mon', value: 12 }, { label: 'Tue', value: 18 }] },
    },
    Tabs: {
      props: componentProps.Tabs,
      slots: container,
      description: 'Tab strip; switching tabs is local. Child i is the panel for tabs[i].',
      example: { tabs: ['Overview', 'Details'] },
    },
  },
  actions: {
    toggle: { params: z.object({ statePath: z.string() }), description: 'Flip the boolean at statePath.' },
  },
})

const { registry, handlers } = defineRegistry(catalog, {
  components,
  actions: {
    toggle: async (params, setState) =>
      params && setState((prev) => immutableSetByPath(prev, params.statePath, !getByPath(prev, params.statePath))),
  },
})

const isExpression = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).some((k) => k.startsWith('$'))

export function validateElement(element: unknown): string | undefined {
  if (typeof element !== 'object' || element === null) return 'element is not an object'
  const { type, props = {}, children } = element as Partial<UIElement>
  if (!type || !(type in componentProps)) return `unknown component type: ${String(type)}`
  if (children !== undefined && !(Array.isArray(children) && children.every((c) => typeof c === 'string')))
    return 'children must be an array of element ids'
  // Expressions ($state, $bindState, $cond…) resolve at render time, so only literal props are checked.
  const exprKeys = Object.keys(props).filter((k) => isExpression(props[k]))
  const literal = Object.fromEntries(Object.entries(props).filter(([k]) => !exprKeys.includes(k)))
  const shape: z.ZodRawShape = componentProps[type as ComponentName].shape
  const propsSchema = z.object(Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, exprKeys.includes(k) ? z.optional(s) : s])))
  const result = propsSchema.safeParse(literal)
  return result.success ? undefined : `${type} props: ${z.prettifyError(result.error)}`
}

// End-of-stream checks. Children pointing at rejected elements were already counted when rejected.
export function finalSpecErrors(spec: Spec, rejected: Set<string>) {
  const errors: { at: string; message: string }[] = []
  if (!spec.elements[spec.root]) errors.push({ at: 'root', message: `root element "${spec.root}" is missing` })
  for (const [id, element] of Object.entries(spec.elements))
    for (const child of element.children ?? [])
      if (!spec.elements[child] && !rejected.has(child)) errors.push({ at: id, message: `missing child "${child}"` })
  return errors
}

export function SpecView({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  const [store] = useState(() => createStateStore())
  const [actionHandlers] = useState(() => {
    const setState: SetState = (updater) => {
      const prev = store.getSnapshot()
      const next = updater(prev)
      store.update(Object.fromEntries(Object.keys({ ...prev, ...next }).map((k) => [`/${k}`, next[k]])))
    }
    return handlers(() => setState, store.getSnapshot)
  })
  const seed = spec?.state
  useEffect(() => {
    if (seed) store.update(flattenToPointers(seed))
  }, [store, seed])
  return (
    <JSONUIProvider registry={registry} store={store} handlers={actionHandlers}>
      <Renderer spec={spec} registry={registry} loading={loading} />
    </JSONUIProvider>
  )
}
