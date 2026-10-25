export const DEMO = import.meta.env.VITE_DEMO === '1'

// Static demo: `/api/runs[?batchId&presetId]` and `/api/runs/:id` map to the files written by scripts/export-demo.mts.
async function demoJson(url: string): Promise<unknown> {
  const { pathname, searchParams } = new URL(url, location.origin)
  const base = `${import.meta.env.BASE_URL}demo/`
  const id = pathname.split('/')[3]
  if (id) return getJson(`${base}runs/${encodeURIComponent(id)}.json`)
  const all = await getJson<{ batchId: string; presetId?: string }[]>(`${base}runs.json`)
  return all.filter((r) => ['batchId', 'presetId'].every((k) => !searchParams.get(k) || r[k as 'batchId' | 'presetId'] === searchParams.get(k)))
}

export const getJson = async <T>(url: string): Promise<T> => {
  if (DEMO && url.startsWith('/api/')) return demoJson(url) as Promise<T>
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Applies the result (or error) only while still current; returns the cancel for an effect cleanup.
// Without onError a rejection stays unhandled rather than silently dropped.
export function whenCurrent<T>(promise: Promise<T>, apply: (value: T) => void, onError?: (e: Error) => void) {
  let current = true
  promise.then(
    (value) => current && apply(value),
    onError && ((e: Error) => current && onError(e)),
  )
  return () => {
    current = false
  }
}
