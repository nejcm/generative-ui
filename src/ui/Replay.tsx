import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { approachById } from '@/approaches'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { frameIndexAt, frames as computeFrames, nextEpoch, runClock, stateAt, whenCurrent, type Frame } from '@/lib/playback'
import type { Run } from '@/lib/run'
import { Seg } from './bits'
import { Result, stripOf, type OutputView } from './Result'

const speeds = ['0.5', '1', '2', '4'] as const
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function Replay({ run, view, status }: { run: Run; view?: OutputView; status?: string }) {
  const approach = approachById(run.approach)!
  // The server's totalMs excludes the hop to the browser, so the last delta can land after it.
  const total = Math.max(run.metrics.totalMs, run.deltas?.at(-1)?.[0] ?? 0)
  const [frames, setFrames] = useState<Frame[]>()
  const [playhead, setPlayhead] = useState(total)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof speeds)[number]>('1')
  const [epoch, setEpoch] = useState(0)
  const playheadRef = useRef(total)

  const seek = (t: number) => {
    const from = playheadRef.current
    setEpoch((e) => nextEpoch(e, from, t))
    playheadRef.current = t
    setPlayhead(t)
  }

  useEffect(() => (run.deltas ? whenCurrent(computeFrames(approach, run.deltas), setFrames) : undefined), [run, approach])

  useEffect(() => {
    if (!playing) return
    return runClock(playheadRef, total, Number(speed), (t) => {
      setPlayhead(t)
      if (t >= total) setPlaying(false)
    })
  }, [playing, speed, total])

  if (!run.deltas) return null
  if (!frames) return <p className="muted">Preparing…</p>

  // Frames sit on whole-ms timestamps; a fractional metric would seek to just before its frame.
  const marks = [
    ['First token', run.metrics.ttftMs],
    ['First render', run.metrics.ttfrMs],
  ].flatMap(([label, t]) => (t == null ? [] : [[label, Math.ceil(t as number)] as [string, number]]))
  const atEnd = frameIndexAt(frames, playhead) === frames.length - 1
  const state = stateAt(frames, playhead)
  const raw = run.deltas
    .filter(([t]) => t <= playhead)
    .map(([, text]) => text)
    .join('')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-pri btn-ico"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          onClick={() => {
            if (!playing && playhead >= total) seek(0)
            setPlaying(!playing)
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="btn btn-ico" aria-label="Restart replay" onClick={() => seek(0)}>
          <RotateCcw size={14} />
        </button>
        <span className="mono tnum" style={{ fontSize: 12.5 }}>
          {seconds(playhead)} / {seconds(total)}
        </span>
        <div className="rp-track min-w-32 flex-1" style={{ '--p': total ? playhead / total : 0 } as CSSProperties}>
          <span className="rp-fill" />
          <input type="range" aria-label="Replay position" min={0} max={total} step={1} value={Math.round(playhead)} onChange={(e) => seek(Number(e.target.value))} className="range" />
          {marks.map(([label, t]) => (
            <button
              key={label}
              type="button"
              className="rp-mark"
              style={{ '--at': t / total } as CSSProperties}
              title={`${label} ${seconds(t)}`}
              aria-label={`Seek to ${label.toLowerCase()} at ${seconds(t)}`}
              onClick={() => seek(t)}
            />
          ))}
          <span className="rp-thumb" />
        </div>
        <Seg label="Replay speed" value={speed} options={speeds.map((s) => ({ value: s, label: `${s}×` }))} onChange={setSpeed} />
      </div>
      <p className="caveat">
        Timing is as the browser received it, so it includes the server hop and any CLI buffering.
      </p>
      <Result key={`${run.id}:${epoch}`} approach={approach} state={state} raw={raw} view={view} live={playing} strip={atEnd && status ? stripOf(status, run.metrics.errors) : undefined} />
    </div>
  )
}
