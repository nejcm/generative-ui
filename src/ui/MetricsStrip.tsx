import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usd } from '@/lib/cost'
import type { Run } from '@/lib/run'

const secs = (ms: number | null | undefined) => (ms == null ? '–' : `${(ms / 1000).toFixed(2)}s`)

type Props = {
  metrics: Partial<Run['metrics']>
  subscription: boolean
  saved?: Pick<Run, 'id' | 'rating' | 'notes'>
  onRate: (rating: number) => void
  onNotes: (notes: string) => void
}

export function MetricsStrip({ metrics: m, subscription, saved, onRate, onNotes }: Props) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <dl className="grid grid-cols-4 gap-x-3 gap-y-1 tabular-nums">
        {[
          ['TTFT', secs(m.ttftMs)],
          ['TTFR', secs(m.ttfrMs)],
          ['Total', secs(m.totalMs)],
          ['Cost', usd(subscription ? 'subscription' : (m.costUsd ?? null))],
          ['In', m.inputTokens ?? '–'],
          ['Out', m.outputTokens ?? '–'],
          ['Valid', m.valid == null ? '–' : m.valid ? '✓' : '✗'],
          ['Errors', m.errorCount ?? '–'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {m.aborted && <p className="text-muted-foreground">Aborted</p>}
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Rating</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <Button key={n} size="sm" variant={saved?.rating === n ? 'default' : 'outline'} disabled={!saved} onClick={() => onRate(n)} aria-label={`Rate ${n}`}>
            {n}
          </Button>
        ))}
        <Input
          key={saved?.id}
          aria-label="Notes"
          placeholder="Notes"
          className="h-8 text-xs"
          disabled={!saved}
          defaultValue={saved?.notes}
          onBlur={(e) => e.target.value !== (saved?.notes ?? '') && onNotes(e.target.value)}
        />
      </div>
    </div>
  )
}
