import { useEffect, useRef, useState } from 'react'
import { approachById } from '@/approaches'
import { Button } from '@/components/ui/button'
import { frameIndexAt, frames as computeFrames, nextEpoch, runClock, stateAt, whenCurrent, type Frame } from '@/lib/playback'
import type { Run } from '@/lib/run'
import { Choice } from './Choice'
import { Result } from './Result'

const speeds = ['0.5', '1', '2', '4'] as const
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export function Replay({ run }: { run: Run }) {
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
  if (!frames) return <p className="text-sm text-muted-foreground">Preparing…</p>

  const atEnd = frameIndexAt(frames, playhead) === frames.length - 1
  const state = stateAt(frames, playhead)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!playing && playhead >= total) seek(0)
            setPlaying(!playing)
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => seek(0)}>
          Restart
        </Button>
        <input
          type="range"
          aria-label="Replay position"
          min={0}
          max={total}
          step={1}
          value={Math.round(playhead)}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-32 flex-1"
        />
        <span className="text-sm tabular-nums">
          {seconds(playhead)} / {seconds(total)}
        </span>
        <div className="w-24">
          <Choice label="Replay speed" value={speed} options={speeds.map((s) => ({ value: s, label: `${s}×` }))} onChange={setSpeed} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Timing is as the browser received it, so it includes the server hop and any CLI buffering.</p>
      <Result key={`${run.id}:${epoch}`} approach={approach} state={state} errors={atEnd ? run.metrics.errors : state.errors} />
    </div>
  )
}
