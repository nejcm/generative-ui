import { useEffect, useState } from 'react'
import { sha256 } from '@/lib/hash'

type Props = { generated: string; override?: string; onOverride: (system: string | undefined) => void }

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
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        System prompt <span className="font-mono">{hash.slice(0, 12)}</span>
        {override !== undefined && ' (overridden)'}
      </summary>
      <label className="my-2 flex items-center gap-2">
        <input type="checkbox" checked={override !== undefined} onChange={(e) => onOverride(e.target.checked ? generated : undefined)} />
        Override
      </label>
      <textarea
        aria-label="System prompt"
        className="h-48 w-full rounded-md border bg-transparent p-2 font-mono"
        readOnly={override === undefined}
        value={system}
        onChange={(e) => onOverride(e.target.value)}
      />
    </details>
  )
}
