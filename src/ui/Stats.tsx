import { useEffect, useState, type ReactNode } from 'react'
import { approachById, type Approach } from '@/approaches'
import { getJson, whenCurrent } from '@/lib/async'
import type { RunSummary } from '@/lib/run'
import { groupBy, summarize, topErrors, type Group } from '@/lib/stats'
import { presets } from '@/prompts'
import { secs } from './bits'
import { Choice } from './Choice'
import { modelLabel } from './History'

const approachName = (key: string) => approachById(key as Approach['id'])?.label.split(' · ')[1] ?? key
const approachHue: Record<Approach['id'], string> = { 'json-render': 'var(--ap-a)', 'flat-strict': 'var(--ap-b)', html: 'var(--ap-c)', markup: 'var(--ap-d)' }
const tokens = (n: number | null) => (n == null ? '–' : Math.round(n).toLocaleString('en-US'))
const share = (n: number | null) => (n == null ? '–' : `${Math.round(n * 100)}%`)
const MIN_RUNS = 5

function Bar({ value, max, hue }: { value: number | null; max: number; hue?: string }) {
  if (value == null || !max) return null
  return (
    <div className="mbar">
      <i style={{ width: `${Math.max(2, (100 * value) / max)}%`, background: hue }} />
    </div>
  )
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel hpanel stats ${className}`} aria-label={title}>
      <div className="panel-h">
        <h2>{title}</h2>
        {note && <span className="muted ml-auto" style={{ fontSize: 12 }}>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function GroupTable({ title, groups, label, hue, tps, className }: { className?: string; title: string; groups: Group[]; label: (key: string) => ReactNode; hue?: (key: string) => string; tps?: boolean }) {
  const maxTotal = Math.max(0, ...groups.map((g) => g.totalMs ?? 0))
  return (
    <Panel className={className} title={title} note={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}>
      <table className="htable">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Runs</th>
            <th className="num">Valid</th>
            <th className="num">TTFR</th>
            <th className="num">Total</th>
            <th className="num">Tokens out</th>
            {tps && <th className="num">Tok/s</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>{label(g.key)}</td>
              <td className="num">{g.n}</td>
              <td className={`num${g.validPct < 90 ? ' v-bad' : ''}`}>{Math.round(g.validPct)}%</td>
              <td className="num">{secs(g.ttfrMs)}</td>
              <td className="num">
                {secs(g.totalMs)}
                <Bar value={g.totalMs} max={maxTotal} hue={hue?.(g.key)} />
              </td>
              <td className="num">{tokens(g.outputTokens)}</td>
              {tps && <td className="num">{g.tokensPerSec == null ? '–' : Math.round(g.tokensPerSec)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function Kpi({ label, value, unit, lead }: { label: string; value: string; unit?: string; lead?: boolean }) {
  return (
    <div className={`kpi${lead ? ' lead' : ''}`}>
      <span className="lbl block">{label}</span>
      <span className="kv">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  )
}

function finding(runs: RunSummary[]) {
  const byApproach = groupBy(runs, (r) => r.approach).filter((g) => g.n >= MIN_RUNS)
  const worst = [...byApproach].sort((a, b) => a.validPct - b.validPct)[0]
  const top = topErrors(runs, 1)[0]
  if (!worst || worst.validPct === 100) return top ? `Most common error: ${top.message} (${top.count}×).` : 'Every run was valid.'
  return `${approachName(worst.key)} is the least reliable approach at ${Math.round(worst.validPct)}% valid${top ? `; most common error: ${top.message} (${top.count}×)` : ''}.`
}

function Tables({ runs }: { runs: RunSummary[] }) {
  const all = summarize('All', runs)
  const errors = topErrors(runs)
  return (
    <>
      <section className="kpis" aria-label="Totals">
        <Kpi lead label="Valid" value={`${Math.round(all.validPct)}`} unit="%" />
        <Kpi label="Runs" value={all.n.toLocaleString('en-US')} />
        <Kpi label="Median total" value={all.totalMs == null ? '–' : (all.totalMs / 1000).toFixed(2)} unit={all.totalMs == null ? undefined : 's'} />
        <Kpi label="Median TTFR" value={all.ttfrMs == null ? '–' : (all.ttfrMs / 1000).toFixed(2)} unit={all.ttfrMs == null ? undefined : 's'} />
        <Kpi label="Median tokens out" value={tokens(all.outputTokens)} />
      </section>
      <div className="sgrid">
        <Panel className="measurement" title="Measurement by approach" note="Medians of completed runs; missing metrics excluded; coverage counts repeated fixture leaves">
          <table className="htable">
            <thead>
              <tr>
                <th>Approach</th>
                <th className="num">Cached in</th>
                <th className="num">Cache writes</th>
                <th className="num">Output chars</th>
                <th className="num">Coverage</th>
                <th className="num">Fidelity</th>
              </tr>
            </thead>
            <tbody>
              {groupBy(runs, (r) => r.approach).map((g) => (
                <tr key={g.key}>
                  <td>{approachName(g.key)}</td>
                  <td className="num">{tokens(g.cachedInputTokens)}</td>
                  <td className="num">{tokens(g.cacheWriteTokens)}</td>
                  <td className="num">{tokens(g.outputChars)}</td>
                  <td className="num">{share(g.coverage)}</td>
                  <td className="num">{share(g.fidelity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <GroupTable
          title="Approach"
          groups={groupBy(runs, (r) => r.approach)}
          label={(k) => (
            <span className="inline-flex items-center gap-2">
              <span className="dot" style={{ background: approachHue[k as Approach['id']] }} />
              {approachName(k)}
            </span>
          )}
          hue={(k) => approachHue[k as Approach['id']]}
        />
        <GroupTable className="narrow" title="Effort" groups={groupBy(runs, (r) => r.settings.effort ?? 'default')} label={(k) => k} />
        <GroupTable title="Model" groups={groupBy(runs, (r) => r.modelId)} label={modelLabel} tps />
        <Panel className="wide" title="Top errors" note={errors.length ? `${errors.reduce((n, e) => n + e.count, 0)} in ${errors.length} kinds` : undefined}>
          {errors.length ? (
            <table className="htable">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Approach</th>
                  <th className="num">Count</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={`${e.approach}${e.message}`}>
                    <td title={e.message}>{e.message}</td>
                    <td className="muted">{approachName(e.approach)}</td>
                    <td className="num">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No errors in these runs.</p>
          )}
        </Panel>
      </div>
    </>
  )
}

export function Stats() {
  const [presetId, setPresetId] = useState('')
  const [runs, setRuns] = useState<RunSummary[]>()
  const [error, setError] = useState('')

  useEffect(
    () => whenCurrent(getJson<RunSummary[]>(`/api/runs${presetId ? `?presetId=${encodeURIComponent(presetId)}` : ''}`), setRuns, (e) => setError(e.message)),
    [presetId],
  )

  return (
    <div className="flex flex-col gap-3.5">
      <div className="page-h">
        <div>
          <h1>Stats</h1>
          <p>{runs?.length ? finding(runs) : runs ? 'No runs yet.' : 'Loading saved runs…'}</p>
        </div>
        <div className="acts w-64">
          <Choice label="Preset filter" value={presetId} options={[{ value: '', label: 'All presets' }, ...presets.map((p) => ({ value: p.id, label: p.label }))]} onChange={setPresetId} />
        </div>
      </div>
      {error && <div className="notice">{error}</div>}
      {runs && runs.length > 0 && <Tables runs={runs} />}
    </div>
  )
}
