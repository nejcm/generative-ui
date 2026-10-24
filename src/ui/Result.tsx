import { Lock } from 'lucide-react'
import type { Approach, ParseState } from '@/approaches'
import { captions } from './bits'

export type OutputView = 'rendered' | 'raw' | 'split'
export type Strip = { kind: 'aborted' | 'failed'; text: string }

type Props = {
  approach: Approach
  state: ParseState
  raw?: string
  view?: OutputView
  live?: boolean
  compact?: boolean
  strip?: Strip
}

export function Result({ approach, state, raw = '', view = 'rendered', live, compact, strip }: Props) {
  const rendered = (
    <div className="scroll">
      {state.renderable ? (
        <div className="gen">
          <approach.Renderer state={state} />
        </div>
      ) : (
        <div className="ph">
          <b>{live ? 'Waiting for the first renderable output' : 'Nothing rendered'}</b>
          <span>
            {live ? 'The timer is running; TTFR lands when the first element can render.' : raw ? 'The output never became renderable.' : 'Run this lane to see its output.'}
          </span>
        </div>
      )}
    </div>
  )
  const stream = (
    <div className="scroll">
      <pre className="raw">
        {raw || (live ? '' : 'No output.')}
        {live && <span className="caret" />}
      </pre>
    </div>
  )
  return (
    <div className={`bed${compact ? ' compact' : ''}`}>
      <div className={`frame frame-${approach.id}`}>
        <div className={`cap cap-${approach.id}`}>
          {approach.id === 'html' && <Lock size={12} />}
          {captions[approach.id]}
        </div>
        {view === 'split' ? (
          <div className="split">
            {rendered}
            {stream}
          </div>
        ) : view === 'raw' ? (
          stream
        ) : (
          rendered
        )}
        {strip && (
          <div className={`strip${strip.kind === 'failed' ? ' strip-err' : ''}`} role="status">
            <span>{strip.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function stripOf(status: string, errors: { message: string }[] = []): Strip | undefined {
  if (status === 'aborted')
    return {
      kind: 'aborted',
      text: 'Stopped. The output is kept as it was when the stream ended.',
    }
  if (status === 'failed')
    return {
      kind: 'failed',
      text: errors[0] ? `Failed: ${errors[0].message}` : 'Failed before anything rendered.',
    }
}
