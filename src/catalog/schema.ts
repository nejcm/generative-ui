import { z } from 'zod'

const gap = z.enum(['none', 'sm', 'md', 'lg'])
const cell = z.union([z.string(), z.number()])

export const componentProps = {
  Stack: z.object({
    direction: z.enum(['vertical', 'horizontal']).optional(),
    gap: gap.optional(),
    align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  }),
  Grid: z.object({ columns: z.enum(['1', '2', '3', '4']).optional(), gap: gap.optional() }),
  Card: z.object({ title: z.string().optional(), description: z.string().optional() }),
  Heading: z.object({ text: z.string(), level: z.enum(['h1', 'h2', 'h3', 'h4']).optional() }),
  Text: z.object({ text: z.string(), variant: z.enum(['body', 'lead', 'muted', 'small']).optional() }),
  Button: z.object({
    label: z.string(),
    variant: z.enum(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link']).optional(),
    size: z.enum(['sm', 'default', 'lg']).optional(),
  }),
  Input: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    type: z.enum(['text', 'email', 'password', 'number', 'search', 'tel', 'url']).optional(),
    value: z.string().optional(),
  }),
  Select: z.object({
    label: z.string().optional(),
    placeholder: z.string().optional(),
    options: z.array(z.string()),
    value: z.string().optional(),
  }),
  Table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(cell)), caption: z.string().optional() }),
  List: z.object({ items: z.array(z.string()), ordered: z.boolean().optional() }),
  Stat: z.object({
    label: z.string(),
    value: z.string(),
    change: z.string().optional(),
    trend: z.enum(['up', 'down', 'neutral']).optional(),
  }),
  Image: z.object({ src: z.httpUrl(), alt: z.string(), aspect: z.enum(['square', 'video', 'wide', 'auto']).optional() }),
  Badge: z.object({ text: z.string(), variant: z.enum(['default', 'secondary', 'outline', 'destructive']).optional() }),
  Chart: z.object({
    type: z.enum(['bar', 'line', 'area', 'pie']),
    data: z.array(z.object({ label: z.string(), value: z.number() })),
    title: z.string().optional(),
  }),
  Tabs: z.object({ tabs: z.array(z.string()), value: z.string().optional() }),
  Checkbox: z.object({ label: z.string(), checked: z.boolean().optional() }),
  Switch: z.object({ label: z.string(), description: z.string().optional(), checked: z.boolean().optional() }),
  Textarea: z.object({ label: z.string().optional(), placeholder: z.string().optional(), value: z.string().optional() }),
  RadioGroup: z.object({ label: z.string().optional(), options: z.array(z.string()), value: z.string().optional() }),
  Progress: z.object({ label: z.string().optional(), value: z.number().min(0).max(100) }),
  Avatar: z.object({ name: z.string(), src: z.httpUrl().optional(), size: z.enum(['sm', 'default', 'lg']).optional() }),
  Alert: z.object({ title: z.string(), description: z.string().optional(), variant: z.enum(['default', 'destructive']).optional() }),
  Separator: z.object({}),
  Accordion: z.object({ items: z.array(z.string()) }),
}

export type ComponentName = keyof typeof componentProps
export type PropsOf<K extends ComponentName> = z.infer<(typeof componentProps)[K]>
