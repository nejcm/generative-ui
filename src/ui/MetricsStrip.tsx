import type { ReactNode } from 'react'
import { Check, Flag, X } from 'lucide-react'
import { usd, type Cost } from '@/lib/cost'
import type { Run } from '@/lib/run'
import { secs } from './bits'

export function MetricsStrip({ metrics: m, cost, elapsedMs }: { metrics: Partial<Run['metrics']>; cost: Cost; elapsedMs?: number }) {
  const cell = (label: string, value: ReactNode, wait = value === '–') => (
    <div className={`m-cell${wait ? ' m-wait' : ''}`}>
      <span className="lbl">{label}</span>
      <span className="m-v">{value}</span>
    </div>
  )
  const hit = m.ttfrMs != null
  return (
    <div className="m-strip">
      <div className={`m-cell${hit ? ' m-hit ttfr-flash' : ' m-wait'}`} key={hit ? 'hit' : 'wait'}>
        <span className="lbl">Time to first render</span>
        <span className="m-v m-big">
          {hit ? secs(m.ttfrMs) : elapsedMs != null ? secs(elapsedMs) : '–'}
          {hit && <Flag size={16} aria-hidden />}
        </span>
      </div>
      {cell('First token', secs(m.ttftMs))}
      {cell('Total', m.totalMs != null ? secs(m.totalMs) : elapsedMs != null ? secs(elapsedMs) : '–', m.totalMs == null)}
      {cell('Tokens in', m.inputTokens?.toLocaleString('en-US') ?? '–')}
      {cell('Tokens out', m.outputTokens?.toLocaleString('en-US') ?? '–')}
      {cell('Cost', usd(cost))}
      {cell(
        'Valid',
        m.valid == null ? (
          '–'
        ) : m.valid ? (
          <span className="v-ok inline-flex items-center gap-1">
            <Check size={14} /> valid
          </span>
        ) : (
          <span className="v-bad inline-flex items-center gap-1">
            <X size={14} /> invalid
          </span>
        ),
      )}
      {cell('Errors', m.errorCount == null ? '–' : <span className={m.errorCount ? 'v-bad' : undefined}>{m.errorCount}</span>)}
    </div>
  )
}
