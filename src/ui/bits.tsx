import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Approach } from '@/approaches'
import type { Cost } from '@/lib/cost'
import type { Run } from '@/lib/run'

export type Status = 'idle' | 'connecting' | 'streaming' | 'rendering' | 'done' | 'aborted' | 'failed'

export type LaneSummary = {
  status: Status
  metrics: Partial<Run['metrics']>
  approach: Approach['id']
  modelId?: string
  startedAt?: number
  savedId?: string
  rating?: number
  cost: Cost
  settings: string
}

export const live = (s?: Status) => s === 'connecting' || s === 'streaming' || s === 'rendering'

export function statusOf(running: boolean, gotDelta: boolean, renderable: boolean, m: Partial<Run['metrics']>): Status {
  if (running) return renderable ? 'rendering' : gotDelta ? 'streaming' : 'connecting'
  if (m.totalMs == null) return 'idle'
  if (m.aborted) return 'aborted'
  return m.ttfrMs == null || m.errors?.some((e) => e.at === 'transport') ? 'failed' : 'done'
}

export const secs = (ms: number | null | undefined) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)} s`)
export const letterOf = (a: Approach) => a.label[0]
export const shortOf = (a: Approach) => a.label.split(' · ')[1] ?? a.label
export const captions: Record<Approach['id'], string> = {
  'json-render': 'json-render · SpecStream patches into the catalog',
  'flat-strict': 'flat element list · strict JSON into the catalog',
  html: 'HTML body · page shell supplies CSS and charts, sandboxed iframe',
  markup: 'catalog markup · nested tags into the catalog',
}
export const words = ['', 'poor', 'weak', 'ok', 'good', 'great']

export function ApBadge({ approach, large }: { approach: Approach; large?: boolean }) {
  return (
    <span className={`ap ap-${approach.id}${large ? ' ap-lg' : ''}`} aria-label={approach.label}>
      {letterOf(approach)}
    </span>
  )
}

const statusWord: Record<Status, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  streaming: 'Streaming',
  rendering: 'Rendering',
  done: 'Done',
  aborted: 'Stopped',
  failed: 'Failed',
}

export function Indicator({ status, detail }: { status: Status; detail?: string }) {
  return (
    <span className={`ind ind-${status}`}>
      <span className="ind-dot" />
      {statusWord[status]}
      {detail && <span className="muted">{detail}</span>}
    </span>
  )
}

export function Collapsible({ title, extra, defaultOpen = false, children }: { title: ReactNode; extra?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sect">
      <button type="button" className="sect-t" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight size={14} className={`chev${open ? ' open' : ''}`} />
        {title}
        {extra}
      </button>
      {open && children}
    </div>
  )
}

export function Errors({ errors }: { errors: Run['metrics']['errors'] }) {
  return (
    <ul className="errs">
      {errors.map((e, i) => (
        <li key={i} className="err">
          <span className="where">{e.at}</span>
          <span className="msg">{e.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Pips({ rating }: { rating?: number }) {
  return (
    <span className="pips" aria-label={rating ? `Rated ${rating} of 5` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={rating && n <= rating ? 'on' : undefined} />
      ))}
    </span>
  )
}
