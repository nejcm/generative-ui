import type { Approach, ParseError, ParseState } from '@/approaches'

export function Result({ approach, state, errors }: { approach: Approach; state: ParseState; errors: ParseError[] }) {
  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 && (
        <details className="rounded-md border border-destructive/40 p-2 text-sm">
          <summary className="cursor-pointer text-destructive">{errors.length} error(s)</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{e.at}:</span> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="min-h-96 overflow-auto rounded-md border p-3">
        <approach.Renderer state={state} />
      </div>
    </div>
  )
}
