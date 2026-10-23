import { useBoundProp, type BaseComponentProps } from '@json-render/react'
import { Children, useId, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { ComponentName, PropsOf } from './schema'

type Impl<K extends ComponentName> = (ctx: BaseComponentProps<PropsOf<K>>) => ReactNode

// Bound props write to json-render state; unbound ones still need to be editable.
function useValue(propValue: string | undefined, bindingPath: string | undefined) {
  const [bound, setBound] = useBoundProp(propValue, bindingPath)
  const [local, setLocal] = useState(propValue)
  return bindingPath ? ([bound, setBound] as const) : ([local, setLocal] as const)
}

const gapClass = { none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }
const alignClass = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }
const columnsClass = { '1': 'grid-cols-1', '2': 'sm:grid-cols-2', '3': 'sm:grid-cols-3', '4': 'sm:grid-cols-2 lg:grid-cols-4' }
const headingClass = { h1: 'text-3xl font-bold', h2: 'text-2xl font-semibold', h3: 'text-xl font-semibold', h4: 'text-lg font-medium' }
const textClass = { body: '', lead: 'text-lg', muted: 'text-sm text-muted-foreground', small: 'text-xs' }
const aspectClass = { square: 'aspect-square', video: 'aspect-video', wide: 'aspect-[21/9]', auto: '' }
const trendClass = { up: 'text-emerald-600', down: 'text-red-600', neutral: 'text-muted-foreground' }
const chartConfig: ChartConfig = { value: { label: 'Value', color: 'var(--chart-1)' } }

const Stack: Impl<'Stack'> = ({ props, children }) => (
  <div
    className={cn(
      'flex',
      props.direction === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
      gapClass[props.gap ?? 'md'],
      props.align && alignClass[props.align],
    )}
  >
    {children}
  </div>
)

const Grid: Impl<'Grid'> = ({ props, children }) => (
  <div className={cn('grid grid-cols-1', columnsClass[props.columns ?? '2'], gapClass[props.gap ?? 'md'])}>{children}</div>
)

const CardImpl: Impl<'Card'> = ({ props, children }) => (
  <Card>
    {(props.title || props.description) && (
      <CardHeader>
        {props.title && <CardTitle>{props.title}</CardTitle>}
        {props.description && <CardDescription>{props.description}</CardDescription>}
      </CardHeader>
    )}
    <CardContent className="flex flex-col gap-4">{children}</CardContent>
  </Card>
)

const Heading: Impl<'Heading'> = ({ props }) => {
  const Tag = props.level ?? 'h2'
  return <Tag className={headingClass[Tag]}>{props.text}</Tag>
}

const Text: Impl<'Text'> = ({ props }) => <p className={textClass[props.variant ?? 'body']}>{props.text}</p>

const ButtonImpl: Impl<'Button'> = ({ props, emit }) => (
  <Button variant={props.variant} size={props.size} onClick={() => emit('press')}>
    {props.label}
  </Button>
)

const InputImpl: Impl<'Input'> = ({ props, bindings }) => {
  const id = useId()
  const [value, setValue] = useValue(props.value, bindings?.value)
  return (
    <div className="flex flex-col gap-2">
      {props.label && <Label htmlFor={id}>{props.label}</Label>}
      <Input
        id={id}
        type={props.type}
        placeholder={props.placeholder}
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}

const SelectImpl: Impl<'Select'> = ({ props, bindings }) => {
  const [value, setValue] = useValue(props.value, bindings?.value)
  return (
    <div className="flex flex-col gap-2">
      {props.label && <Label>{props.label}</Label>}
      <Select value={value ?? null} onValueChange={(v) => setValue(v ?? '')}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const TableImpl: Impl<'Table'> = ({ props }) => (
  <Table>
    {props.caption && <TableCaption>{props.caption}</TableCaption>}
    <TableHeader>
      <TableRow>
        {props.columns.map((c, i) => (
          <TableHead key={i}>{c}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
    <TableBody>
      {props.rows.map((row, r) => (
        <TableRow key={r}>
          {row.map((cell, c) => (
            <TableCell key={c}>{cell}</TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

const List: Impl<'List'> = ({ props }) => {
  const Tag = props.ordered ? 'ol' : 'ul'
  return (
    <Tag className={cn('ml-5 flex flex-col gap-1', props.ordered ? 'list-decimal' : 'list-disc')}>
      {props.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}

const Stat: Impl<'Stat'> = ({ props }) => (
  <div className="flex flex-col gap-1 rounded-lg border p-4">
    <span className="text-sm text-muted-foreground">{props.label}</span>
    <span className="text-2xl font-semibold">{props.value}</span>
    {props.change && <span className={cn('text-sm', trendClass[props.trend ?? 'neutral'])}>{props.change}</span>}
  </div>
)

const Image: Impl<'Image'> = ({ props }) => (
  <img src={props.src} alt={props.alt} className={cn('w-full rounded-lg object-cover', aspectClass[props.aspect ?? 'auto'])} />
)

const BadgeImpl: Impl<'Badge'> = ({ props }) => <Badge variant={props.variant}>{props.text}</Badge>

const Chart: Impl<'Chart'> = ({ props }) => {
  const axis = <XAxis dataKey="label" tickLine={false} axisLine={false} />
  const tooltip = <ChartTooltip content={<ChartTooltipContent />} />
  const chart = {
    bar: (
      <BarChart data={props.data}>
        <CartesianGrid vertical={false} />
        {axis}
        {tooltip}
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    ),
    line: (
      <LineChart data={props.data}>
        <CartesianGrid vertical={false} />
        {axis}
        {tooltip}
        <Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} />
      </LineChart>
    ),
    area: (
      <AreaChart data={props.data}>
        <CartesianGrid vertical={false} />
        {axis}
        {tooltip}
        <Area dataKey="value" fill="var(--color-value)" stroke="var(--color-value)" fillOpacity={0.3} />
      </AreaChart>
    ),
    pie: (
      <PieChart>
        {tooltip}
        <Pie data={props.data} dataKey="value" nameKey="label">
          {props.data.map((_, i) => (
            <Cell key={i} fill={`var(--chart-${(i % 5) + 1})`} />
          ))}
        </Pie>
      </PieChart>
    ),
  }[props.type]
  return (
    <div className="flex flex-col gap-2">
      {props.title && <span className="text-sm font-medium">{props.title}</span>}
      <ChartContainer config={chartConfig} className="min-h-48 w-full">
        {chart}
      </ChartContainer>
    </div>
  )
}

const TabsImpl: Impl<'Tabs'> = ({ props, bindings, children }) => {
  const [value, setValue] = useValue(props.value ?? props.tabs[0], bindings?.value)
  const panels = Children.toArray(children)
  return (
    <Tabs value={value} onValueChange={(v) => setValue(String(v))}>
      <TabsList>
        {props.tabs.map((t) => (
          <TabsTrigger key={t} value={t}>
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
      {props.tabs.map((t, i) => (
        <TabsContent key={t} value={t}>
          {panels[i]}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export const components: { [K in ComponentName]: Impl<K> } = {
  Stack,
  Grid,
  Card: CardImpl,
  Heading,
  Text,
  Button: ButtonImpl,
  Input: InputImpl,
  Select: SelectImpl,
  Table: TableImpl,
  List,
  Stat,
  Image,
  Badge: BadgeImpl,
  Chart,
  Tabs: TabsImpl,
}
