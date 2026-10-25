export const getJson = async <T>(url: string): Promise<T> => {
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
