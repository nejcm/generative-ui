import { useEffect, useState } from 'react'
import { approachById } from '@/approaches'
import { models } from '@/models'
import { ApBadge, live, secs, type LaneSummary } from './bits'
import type { PaneConfig } from './Pane'

type Props = {
  panes: PaneConfig[]
  summaries: Record<string, LaneSummary>
  focusKey?: string
  onFocus: (key: string) => void
}

export function Timeline({ panes, summaries, focusKey, onFocus }: Props) {
  const lanes = panes.map((p) => ({ key: p.key, s: summaries[p.key] })).filter((l) => l.s && l.s.status !== 'idle')
  const anyLive = lanes.some((l) => live(l.s.status))
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!anyLive) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [anyLive])
  if (!lanes.length) return null

  const end = (s: LaneSummary) => s.metrics.totalMs ?? (s.startedAt !== undefined ? now - s.startedAt : 0)
  const scale = Math.max(1000, ...lanes.map((l) => end(l.s)))
  const pct = (ms: number) => `${Math.min(100, (ms / scale) * 100)}%`
  return (
    <section className="panel" aria-label="Timeline">
      <div className="panel-h">
        <h2>Timeline</h2>
        <span className="muted">Wait to first token, streaming, first render</span>
      </div>
      <div className="flex flex-col gap-1" style={{ padding: '8px 8px 4px' }}>
        {lanes.map(({ key, s }) => {
          const approach = approachById(s.approach)!
          const start = s.metrics.ttftMs ?? (live(s.status) ? end(s) : 0)
          const finished = !live(s.status)
          return (
            <button key={key} type="button" className={`trow${key === focusKey ? ' on' : ''}`} onClick={() => onFocus(key)}>
              <span className="lbl">{panes.findIndex((p) => p.key === key) + 1}</span>
              <ApBadge approach={approach} />
              <span className="truncate">{models.find((m) => m.id === s.modelId)?.label}</span>
              <span className="track">
                <span className="r-wait" style={{ left: 0, width: pct(start) }} />
                <span
                  className="r-bar"
                  style={{
                    left: pct(start),
                    width: `calc(${pct(end(s))} - ${pct(start)})`,
                    background: `var(--ap-${approach.label[0].toLowerCase()})`,
                  }}
                />
                {s.metrics.ttfrMs != null && <span className="r-mark" style={{ left: pct(s.metrics.ttfrMs) }} title={`First render ${secs(s.metrics.ttfrMs)}`} />}
                {finished && <span className={`r-end${s.status === 'done' ? ' ok' : s.status === 'failed' ? ' fail' : ''}`} style={{ left: pct(end(s)) }} />}
              </span>
              <span className="t">
                {s.metrics.ttfrMs != null ? `TTFR ${secs(s.metrics.ttfrMs)}` : finished ? 'no render' : 'waiting'} · {secs(end(s))}
              </span>
            </button>
          )
        })}
        <div className="trow" style={{ cursor: 'default', background: 'transparent' }} aria-hidden>
          <span />
          <span />
          <span />
          <span className="ticks">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <span key={f} style={{ left: `${f * 100}%` }}>
                {((f * scale) / 1000).toFixed(1)}s
              </span>
            ))}
          </span>
          <span />
        </div>
      </div>
    </section>
  )
}
