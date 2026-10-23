import {
  createStateStore,
  defineCatalog,
  getByPath,
  resolveElementProps,
  resolveRepeatStatePath,
  type PropResolutionContext,
  type Spec,
  type UIElement,
} from '@json-render/core'
import { flattenToPointers, immutableSetByPath } from '@json-render/core/store-utils'
import { defineRegistry, JSONUIProvider, Renderer, type BaseComponentProps, type SetState } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import { useEffect, useState, type FC } from 'react'
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

// Expression props resolve at render time; a resolved value that fails its schema shows a marker instead of crashing.
const guarded = Object.fromEntries(
  (Object.keys(components) as ComponentName[]).map((name) => {
    const Impl = components[name] as FC<BaseComponentProps<Record<string, unknown>>>
    const Guarded = (ctx: BaseComponentProps<Record<string, unknown>>) =>
      componentProps[name].safeParse(ctx.props).success ? <Impl {...ctx} /> : <span className="text-xs text-destructive">{`invalid ${name} props`}</span>
    return [name, Guarded]
  }),
) as unknown as typeof components

const { registry, handlers } = defineRegistry(catalog, {
  components: guarded,
  actions: {
    toggle: async (params, setState) =>
      params && setState((prev) => immutableSetByPath(prev, params.statePath, !getByPath(prev, params.statePath))),
  },
})

const isExpression = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).some((k) => k.startsWith('$'))

export function validateElement(element: unknown): string | undefined {
  if (typeof element !== 'object' || element === null) return 'element is not an object'
  const { type, props = {}, children } = element as Partial<UIElement>
  if (typeof type !== 'string' || !Object.hasOwn(componentProps, type)) return `unknown component type: ${String(type)}`
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return 'props must be an object'
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

export function createsCycle(elements: Spec['elements'], id: string) {
  const stack = [...(elements[id]?.children ?? [])]
  const seen = new Set<string>()
  while (stack.length) {
    const next = stack.pop()!
    if (next === id) return true
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...(elements[next]?.children ?? []))
  }
  return false
}

// End-of-stream checks. Children pointing at rejected elements were already counted when rejected.
export function finalSpecErrors(spec: Spec, rejected: Set<string>) {
  const errors: { at: string; message: string }[] = []
  if (!spec.elements[spec.root]) errors.push({ at: 'root', message: `root element "${spec.root}" is missing` })
  for (const [id, element] of Object.entries(spec.elements))
    for (const child of element.children ?? [])
      if (!spec.elements[child] && !rejected.has(child)) errors.push({ at: id, message: `missing child "${child}"` })
  return [...errors, ...resolvedPropErrors(spec)]
}

// Expression props validated against final state, once per repeat item in scope; first failure per element counts.
function resolvedPropErrors(spec: Spec) {
  const failures = new Map<string, string>()
  const visit = (id: string, ctx: PropResolutionContext) => {
    const element = spec.elements[id]
    if (!element) return
    const result = componentProps[element.type as ComponentName].safeParse(resolveElementProps(element.props ?? {}, ctx))
    if (!result.success && !failures.has(id)) failures.set(id, `${element.type} props after resolving state: ${z.prettifyError(result.error)}`)
    const children = element.children ?? []
    if (!element.repeat) return children.forEach((child) => visit(child, ctx))
    const path = resolveRepeatStatePath(element.repeat.statePath, ctx.repeatBasePath)
    const items = path === undefined ? undefined : getByPath(ctx.stateModel, path)
    if (Array.isArray(items))
      items.forEach((repeatItem, repeatIndex) =>
        children.forEach((child) => visit(child, { ...ctx, repeatItem, repeatIndex, repeatBasePath: `${path}/${repeatIndex}` })),
      )
  }
  visit(spec.root, { stateModel: spec.state ?? {} })
  return [...failures].map(([at, message]) => ({ at, message }))
}

export function SpecView({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  const [store] = useState(() => createStateStore(spec?.state))
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
