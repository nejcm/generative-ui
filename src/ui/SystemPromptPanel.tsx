import { useEffect, useState } from 'react'
import { sha256 } from '@/lib/hash'
import { Collapsible } from './bits'

type Props = {
  generated: string
  override?: string
  onOverride: (system: string | undefined) => void
}

export function SystemPromptPanel({ generated, override, onOverride }: Props) {
  const system = override ?? generated
  const [hash, setHash] = useState('')
  useEffect(() => {
    let current = true
    sha256(system).then((h) => current && setHash(h))
    return () => {
      current = false
    }
  }, [system])

  return (
    <Collapsible
      title="System prompt"
      extra={
        <>
          <span className="mono muted" style={{ fontSize: 11.5 }}>
            {hash.slice(0, 12)}
          </span>
          {override !== undefined && <span className="tag tag-sig">Overridden</span>}
        </>
      }
    >
      <div className="sect-b">
        <label className="sw">
          <input type="checkbox" checked={override !== undefined} onChange={(e) => onOverride(e.target.checked ? generated : undefined)} />
          <span className="trk" />
          Override for this lane
        </label>
        {override === undefined ? (
          <pre className="sys" aria-label="System prompt">
            {system}
          </pre>
        ) : (
          <textarea aria-label="System prompt" className="sys-ed" value={system} onChange={(e) => onOverride(e.target.value)} />
        )}
      </div>
    </Collapsible>
  )
}
